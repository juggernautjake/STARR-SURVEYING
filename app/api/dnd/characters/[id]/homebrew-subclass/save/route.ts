// app/api/dnd/characters/[id]/homebrew-subclass/save/route.ts — persist a homebrew subclass to the
// character (Slice 5). POST { subclass }: rebuilds server-side from the draft input (never trusts the
// client's definition), requires a parent class that resolves in the system (incl. saved homebrew
// classes) + at least one feature, then upserts into character.data.homebrewSubclasses (by key). The
// registry resolves it via `subclassesFor(..., extra)`. Write-gated, flagged custom.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { parseCustomSubclassInput } from '@/lib/dnd/classes/custom-ai';
import { buildCustomSubclass } from '@/lib/dnd/classes/custom';
import { findClass } from '@/lib/dnd/classes/registry';
import { upsertHomebrewSubclass, readHomebrewSubclasses, readHomebrewClasses } from '@/lib/dnd/classes/homebrew-store';
import { normalizeSystem } from '@/lib/dnd/systems';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;
  const system = normalizeSystem((character as { system?: string }).system);

  const body = await req.json().catch(() => ({}));
  if (!body?.subclass || typeof body.subclass !== 'object') return NextResponse.json({ error: 'A subclass is required.' }, { status: 400 });

  const data = (character.data && typeof character.data === 'object' ? character.data : {}) as Record<string, unknown>;
  const input = parseCustomSubclassInput(body.subclass, system);
  input.authorName = input.authorName || session.displayName;

  if (!input.classKey) return NextResponse.json({ error: 'The subclass must name a parent class.' }, { status: 400 });
  if (!findClass(system, input.classKey, readHomebrewClasses(data))) {
    return NextResponse.json({ error: `No “${input.classKey}” class exists in ${system} to attach this subclass to.` }, { status: 400 });
  }
  const subclass = buildCustomSubclass(input);
  if (!subclass.features.length) return NextResponse.json({ error: 'The subclass needs at least one feature.' }, { status: 400 });

  const nextData = { ...data, homebrewSubclasses: upsertHomebrewSubclass(readHomebrewSubclasses(data), subclass) };
  const { error } = await supabaseAdmin.from('dnd_characters').update({ data: nextData }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, key: subclass.key, name: subclass.name });
}
