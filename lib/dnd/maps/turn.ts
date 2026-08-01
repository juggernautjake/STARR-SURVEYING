// lib/dnd/maps/turn.ts — whose turn is it, on the map. M5-5.
//
// ── THIS SLICE IS A CONNECTION, NOT A BUILD, AND THE AUDIT IS WHY ──────────────────────────────────
//
// M5-5 asks for *"initiative list, current turn, round counter"* — and **all three already exist**.
// `dnd_encounters` + `dnd_initiative_entries` shipped with the campaign platform, `InitiativeTracker.tsx`
// drives them, and `app/api/dnd/encounters/…` is the API behind it.
//
// A first pass at this slice got as far as writing a `seeds/511_dnd_encounters.sql` with its own
// encounter and combatant tables before the apply failed on a column clash — the table was already there,
// with a different shape. That is the exact defect this plan's M0 opens by warning about, and the seed was
// deleted rather than reconciled: two initiative models in one app is worse than none, because the DM's
// tracker and the map would each be right about a different fight.
//
// So what was missing was never the data. It was that **the map had no idea whose turn it was.**
//
// ── current_turn_index IS THE AUTHORITY; is_current IS A COPY ──────────────────────────────────────
//
// The schema has both: `dnd_encounters.current_turn_index` (a position) and
// `dnd_initiative_entries.is_current` (a flag per row). `app/api/dnd/encounters/[id]/route.ts` derives the
// current entry from the INDEX — `entries[enc.current_turn_index]` — so that is the authority, and the
// flag is a denormalised second opinion that can disagree after any write that misses it.
//
// This module reads the index for the same reason: a map that highlighted a different token from the
// tracker beside it would make one of the two screens a liar, and there would be no way to tell which.

import { supabaseAdmin } from '@/lib/supabase';
import type { TokenSubject } from './tokens';

export interface TurnView {
  encounterId: string;
  encounterName: string | null;
  round: number;
  /** Position in the ordered list, straight off the encounter row. */
  index: number;
  /** The combatant whose turn it is, or null when the list is empty. */
  currentName: string | null;
  /** Set when that combatant is a character — the only case a token can be matched to. */
  currentCharacterId: string | null;
  /** How many are in the fight, so the banner can say "3 of 7". */
  total: number;
}

/**
 * The one live encounter for this campaign, if there is one.
 *
 * Encounters hang off SESSIONS, not off map nodes, so this walks campaign → live session → live
 * encounter. That is a real modelling difference from where the map lives, and it is left alone
 * deliberately: adding `map_node_id` to `dnd_encounters` would let a campaign run two "current" fights,
 * and the tracker has no concept of which map it is on.
 *
 * Returns null on absolutely every "no fight right now" path, which is the normal state of a map.
 */
export async function loadLiveTurn(campaignId: string): Promise<TurnView | null> {
  const { data: sessions } = await supabaseAdmin
    .from('dnd_sessions')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'live')
    .limit(5);

  const sessionIds = ((sessions ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (!sessionIds.length) return null;

  const { data: encounters } = await supabaseAdmin
    .from('dnd_encounters')
    .select('id, name, round, current_turn_index, status')
    .in('session_id', sessionIds)
    .eq('status', 'live')
    .limit(1);

  const enc = ((encounters ?? []) as Array<{
    id: string; name: string | null; round: number; current_turn_index: number;
  }>)[0];
  if (!enc) return null;

  // Ordered the same way the tracker orders them, so position N here is position N there.
  const { data: entries } = await supabaseAdmin
    .from('dnd_initiative_entries')
    .select('id, name, character_id, sort_order')
    .eq('encounter_id', enc.id)
    .order('sort_order', { ascending: true });

  const list = (entries ?? []) as Array<{ id: string; name: string; character_id: string | null }>;
  // The INDEX, not the flag — see the header.
  const current = list[enc.current_turn_index] ?? null;

  return {
    encounterId: enc.id,
    encounterName: enc.name,
    round: enc.round,
    index: enc.current_turn_index,
    currentName: current?.name ?? null,
    currentCharacterId: current?.character_id ?? null,
    total: list.length,
  };
}

/**
 * Is this token the one whose turn it is?
 *
 * PURE, and matched on the CHARACTER rather than the name. Names collide — a fight with three "Goblin"
 * entries is the most ordinary encounter there is, and matching on text would ring all three at once.
 * A creature token has no character id and therefore never matches, which is correct rather than
 * unfortunate: `dnd_initiative_entries.character_id` is the only link the schema offers.
 */
export function isCurrentToken(turn: TurnView | null, subject: TokenSubject | null): boolean {
  if (!turn?.currentCharacterId || !subject) return false;
  if (!('characterId' in subject)) return false;
  return subject.characterId === turn.currentCharacterId;
}

/** What the banner says. Kept beside the data so the wording and its caveats travel together. */
export function turnSummary(turn: TurnView | null): string | null {
  if (!turn) return null;
  if (!turn.currentName) return `Round ${turn.round} — no one in the initiative list yet`;
  // "3 of 7" rather than a bare name: a DM glancing at the map wants to know how far through the round
  // they are, which a name alone does not say.
  return `Round ${turn.round} · ${turn.currentName}'s turn (${turn.index + 1} of ${turn.total})`;
}
