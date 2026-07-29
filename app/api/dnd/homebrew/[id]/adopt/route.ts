// app/api/dnd/homebrew/[id]/adopt/route.ts — put a piece of shared custom content onto a character (P6-8).
//
// This is the slice that makes the Studio matter: until now a piece could be authored, browsed and read,
// but never *used*. It is also the only intended caller of `lib/dnd/homebrew/policy.ts`, which has sat in
// the orphan-exemption list since it was written — a DM gate nobody invoked, which is indistinguishable
// from no gate.
//
// THREE GATES, and they answer different questions. Collapsing any two of them is how this goes wrong:
//   1. **Can this caller write this character?** (`requireCharacterWrite`) — ordinary sheet authorization.
//   2. **Is this piece legal at this table?** (`canAdoptHomebrew` + the campaign's stored policy) — the
//      DM's call. A character with no campaign has no DM, so there is nothing to gate: a personal sheet
//      may use anything its owner can see.
//   3. **Does the payload actually resolve?** (`adoptHomebrew`) — the engine's call. It refuses anything
//      whose mechanics fail the real validators rather than storing a class the level builder cannot level.
//
// The write follows `grant-content/route.ts`: update `data` whole (safe because the adopt converters clone
// and never rebuild, so `data.ig` / `data.pf2e` sidecars survive untouched) and audit under a batch id, so
// adopting is undoable exactly like an AI edit.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { adoptHomebrew } from '@/lib/dnd/homebrew/adopt';
import { canAdoptHomebrew, readHomebrewPolicy, CAMPAIGN_HOMEBREW_THEME_KEY } from '@/lib/dnd/homebrew/policy';
import { homebrewInSystem, homebrewKindLabel } from '@/lib/dnd/homebrew/model';
import { rowToHomebrew, canReadHomebrew, type HomebrewRow } from '@/lib/dnd/homebrew/store';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { normalizeSystem } from '@/lib/dnd/systems';
import type { Character } from '@/app/dnd/_sheet/types';
import { isPF2Character, type PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { applyPf2Edit } from '@/lib/dnd/systems/pathfinder2e/edit';
import { pf2AdoptEdits, pf2AdoptRefusal } from '@/lib/dnd/systems/pathfinder2e/adopt';
import { isIGCharacter, type IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { applyIgEdit } from '@/lib/dnd/systems/intuitive-games/edit';
import { igAdoptEdits, igAdoptRefusal } from '@/lib/dnd/systems/intuitive-games/adopt';

// NOTE: no helper is exported from this file. A route module may only export recognised handlers — an
// extra export typechecks and then fails `next build`. `CAMPAIGN_HOMEBREW_THEME_KEY` lives in policy.ts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: { characterId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const characterId = String(body.characterId ?? '');
  if (!characterId) return NextResponse.json({ error: 'Which character?' }, { status: 400 });

  // ── the piece ────────────────────────────────────────────────────────────────────────────────
  const { data: pieceRow } = await supabaseAdmin.from('dnd_homebrew').select('*').eq('id', params.id).maybeSingle();
  const row = pieceRow as HomebrewRow | null;
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { data: author } = await supabaseAdmin.from('dnd_users').select('display_name').eq('id', row.owner_user_id).maybeSingle();
  const piece = rowToHomebrew(row, (author as { display_name?: string } | null)?.display_name ?? '');
  if (!piece) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  // You cannot adopt what you cannot see. 404 rather than 403, matching the detail route: a private piece
  // must not confirm its own existence to someone walking ids.
  if (!canReadHomebrew(piece, { userId: session.userId })) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  // ── gate 1: the character ────────────────────────────────────────────────────────────────────
  const access = await getCharacterAccess(characterId);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character, canWrite, isDM } = access.access;
  if (!canWrite) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  // The piece must belong to the character's system (or be system-agnostic). Checked BEFORE the DM gate
  // because it is the clearer error: "this is Pathfinder content on a 5e character" tells an author what
  // is wrong, where "your DM hasn't allowed this" would send them to ask for something that could never work.
  const charSystem = normalizeSystem((character as { system?: string }).system);
  if (!homebrewInSystem(piece, charSystem)) {
    return NextResponse.json({
      error: `“${piece.name}” is written for a different system, so it cannot be applied to this character.`,
    }, { status: 400 });
  }

  // ── gate 2: the DM's call, for a character actually at a table ───────────────────────────────
  const campaignId = (character as { campaign_id?: string | null }).campaign_id ?? null;
  if (campaignId) {
    const { data: camp } = await supabaseAdmin.from('dnd_campaigns').select('theme').eq('id', campaignId).maybeSingle();
    const theme = ((camp as { theme?: unknown } | null)?.theme ?? {}) as Record<string, unknown>;
    const policy = readHomebrewPolicy(theme[CAMPAIGN_HOMEBREW_THEME_KEY]);
    if (!canAdoptHomebrew(piece, policy, { isDM })) {
      return NextResponse.json({
        error: `Your DM hasn’t allowed “${piece.name}” in this campaign yet. Ask them to add it to the campaign’s custom-content list.`,
      }, { status: 403 });
    }
  }
  // No campaign → no DM → nothing to gate. A personal sheet may use anything its owner can see; the piece's
  // own provenance still marks it as custom on the sheet, so this is not a way to sneak content past a table.

  // ── gate 3: does it actually resolve? ────────────────────────────────────────────────────────
  //
  // PF2 takes a DIFFERENT PATH (P6-9a), and it is the reason this branch exists. A Pathfinder 2e character
  // keeps its real state in the `data.pf2e` sidecar; `adoptHomebrew` writes 5e shapes onto the shared
  // `Character`. Sending a PF2 character down that path made the save succeed, the sheet show nothing, and
  // nothing explain why — the worst shape a bug can have, because it looks like it worked.
  const rawData = (character.data ?? {}) as Record<string, unknown>;
  let nextData: unknown;
  let adopted: string;
  let extraNotes: string[] = [];

  if (isPF2Character(rawData.pf2e)) {
    const conv = pf2AdoptEdits(piece);
    if (!conv) return NextResponse.json({ error: pf2AdoptRefusal(piece) }, { status: 400 });
    let pf2 = rawData.pf2e as PF2Character;
    for (const e of conv.edits) pf2 = applyPf2Edit(pf2, e);
    nextData = { ...rawData, pf2e: pf2 };
    adopted = conv.adopted;
    extraNotes = conv.notes;
  } else if (isIGCharacter(rawData.ig)) {
    // The same story as PF2 (P6-9b): IG keeps its state in `data.ig`, so the 5e path wrote nowhere.
    const conv = igAdoptEdits(piece);
    if (!conv) return NextResponse.json({ error: igAdoptRefusal(piece) }, { status: 400 });
    let ig = rawData.ig as IGCharacter;
    for (const e of conv.edits) ig = applyIgEdit(ig, e);
    nextData = { ...rawData, ig };
    adopted = conv.adopted;
    extraNotes = conv.notes;
  } else {
    const current = (rawData as unknown as Character | null) ?? blankCharacter(character.name);
    const result = adoptHomebrew(current as Character, piece);
    if (!result) {
      return NextResponse.json({
        error: `“${piece.name}” has no mechanics this sheet can apply — it is written as rules text. Read it on its page and apply it at the table.`,
      }, { status: 400 });
    }
    nextData = result.char;
    adopted = result.adopted;
  }

  const { error: upErr } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: nextData, updated_at: new Date().toISOString() })
    .eq('id', characterId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Audited under a batch id so adopting is reversible through the existing undo, like any other change.
  const summary = `Adopted “${piece.name}” (${homebrewKindLabel(piece.kind)}) by ${piece.creator.name}`;
  await supabaseAdmin.from('dnd_sheet_edits').insert({
    character_id: characterId,
    editor_user_id: session.userId,
    is_dm: isDM,
    field_path: `homebrew.${adopted}`,
    old_value: null,
    new_value: { homebrewId: piece.id, name: piece.name, kind: piece.kind, adopted } as unknown,
    scope: 'permanent',
    batch_id: randomUUID(),
    source: 'homebrew-adopt',
    summary,
  }).then(() => {}, (e: unknown) => { console.error('[dnd] background write failed', e); });

  // The notes matter: "your item is on the sheet, but its effects were written for D&D 5e" is a useful
  // sentence, and silence in its place is how someone concludes the feature is broken.
  return NextResponse.json({ ok: true, adopted, summary, notes: extraNotes });
}
