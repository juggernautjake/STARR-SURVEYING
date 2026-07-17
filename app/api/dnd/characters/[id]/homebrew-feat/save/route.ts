// app/api/dnd/characters/[id]/homebrew-feat/save/route.ts — persist a homebrew feat to the character
// (Slice 5). POST { feat }: rebuilds + re-reviews server-side (never trusts the client), REJECTS on
// errors, else upserts the built CustomFeat into character.data.homebrewFeats (by key). Write-gated,
// scoped to the character's system, flagged custom. (Surfacing homebrew feats in the ASI feat picker
// needs a CustomFeat→Feat adapter — a follow-up.)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { parseCustomFeatInput, splitReview } from '@/lib/dnd/classes/custom-ai';
import { buildCustomFeat, reviewCustomFeat } from '@/lib/dnd/classes/custom';
import { upsertHomebrewFeat, readHomebrewFeats } from '@/lib/dnd/classes/homebrew-store';
import { normalizeSystem } from '@/lib/dnd/systems';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;
  const system = normalizeSystem((character as { system?: string }).system);

  const body = await req.json().catch(() => ({}));
  if (!body?.feat || typeof body.feat !== 'object') return NextResponse.json({ error: 'A feat is required.' }, { status: 400 });

  const input = parseCustomFeatInput(body.feat, system);
  input.custom = { authorName: input.custom?.authorName || session.displayName };
  const feat = buildCustomFeat(input);
  const review = splitReview(reviewCustomFeat(feat));
  if (!review.ok) return NextResponse.json({ error: 'The feat has errors that must be fixed before saving.', review }, { status: 400 });

  const data = (character.data && typeof character.data === 'object' ? character.data : {}) as Record<string, unknown>;
  const nextData = { ...data, homebrewFeats: upsertHomebrewFeat(readHomebrewFeats(data), feat) };
  const { error } = await supabaseAdmin.from('dnd_characters').update({ data: nextData }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, key: feat.key, name: feat.name });
}
