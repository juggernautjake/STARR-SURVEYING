// app/api/dnd/characters/[id]/homebrew-class/save/route.ts — persist a homebrew class to the character
// (Slice 5). POST { draft }: rebuilds + re-reviews the draft server-side (never trusts the client's
// definition), REJECTS if the engine finds errors, else upserts the built ClassDefinition into
// character.data.homebrewClasses (by key, so re-saving an edited class replaces it). The registry then
// resolves it as `extra` — a custom class appears in the level builder like an official one. Write-gated,
// scoped to the character's system, and flagged custom so DM approval/provenance picks it up.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { parseCustomClassDraft, splitReview } from '@/lib/dnd/classes/custom-ai';
import { buildCustomClass, reviewCustomClass } from '@/lib/dnd/classes/custom';
import { upsertHomebrewClass, readHomebrewClasses } from '@/lib/dnd/classes/homebrew-store';
import { normalizeSystem } from '@/lib/dnd/systems';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;
  const system = normalizeSystem((character as { system?: string }).system);

  const body = await req.json().catch(() => ({}));
  if (!body?.draft || typeof body.draft !== 'object') return NextResponse.json({ error: 'A class draft is required.' }, { status: 400 });

  // Rebuild + re-review server-side — never trust a client-supplied definition.
  const draft = parseCustomClassDraft(body.draft, system);
  draft.authorName = draft.authorName || session.displayName;
  const definition = buildCustomClass(draft);
  const review = splitReview(reviewCustomClass(definition));
  if (!review.ok) {
    return NextResponse.json({ error: 'The class has errors that must be fixed before saving.', review }, { status: 400 });
  }

  const data = (character.data && typeof character.data === 'object' ? character.data : {}) as Record<string, unknown>;
  const nextData = { ...data, homebrewClasses: upsertHomebrewClass(readHomebrewClasses(data), definition) };
  const { error } = await supabaseAdmin.from('dnd_characters').update({ data: nextData }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, key: definition.key, name: definition.name, review });
}
