// lib/dnd/maps/passive-scan.ts — run the passive comparison and record what the party noticed. M6-2.
//
// The I/O half of `passive.ts`, kept separate for the reason every other pair in this directory is: the
// rules are pure and testable, and this is the part that talks to the database.
//
// ── WHY IT RUNS ON RENDER RATHER THAN ON MOVEMENT ──────────────────────────────────────────────────
//
// The plan says *"when a token moves within range"*. Nothing moves tokens yet — drag-to-move is still open
// (M5-2 notes it) — so there is no movement event to hang this on. Running it when the DM or a player
// opens the node is the same question asked at the only moment currently available: *the party is standing
// here; what do they notice?*
//
// The alternative was to build the scan and leave it uncalled until movement exists. This repo's own
// `no-orphan-modules` guard exists because that pattern keeps producing work nobody can use.
//
// ── PASSIVE FINDS ARE RECORDED WITH A NULL ROLL, AND THAT IS THE POINT ─────────────────────────────
//
// `dnd_map_discoveries.found_by_roll` stays NULL for a passive notice. A DM reading the audit trail can
// then tell "they walked past and spotted it" from "they searched and rolled a 17" — two different
// things, and writing an invented number for the first would destroy the distinction the column exists
// for.

import { supabaseAdmin } from '@/lib/supabase';
import { summarizeMember } from '@/lib/dnd/party-overview';
import { readGrid } from './grid';
import { diagonalRuleFor } from './movement';
import { passiveNotices, type PassiveHidden, type PassiveNotice, type PassiveToken } from './passive';

export interface ScanResult {
  notices: PassiveNotice[];
  /** How many were newly written. A repeat visit notices the same things and records none of them. */
  recorded: number;
}

const EMPTY: ScanResult = { notices: [], recorded: 0 };

/**
 * Scan one node for what the given characters notice by standing where their tokens stand.
 *
 * `characterIds` is the set whose discoveries count — a player's own characters, or for a DM the whole
 * party. Passing none is a no-op rather than a party-wide scan: guessing which characters a caller meant
 * is how a DM's page silently reveals things to players.
 */
export async function scanPassive(args: {
  nodeId: string;
  rawGrid: unknown;
  /** Tokens on this node, already resolved to their character ids. */
  tokens: readonly PassiveToken[];
  characterIds: readonly string[];
}): Promise<ScanResult> {
  const grid = readGrid(args.rawGrid);
  if (!grid || !args.tokens.length || !args.characterIds.length) return EMPTY;

  const { data: hiddenRows } = await supabaseAdmin
    .from('dnd_map_objects')
    .select('id, x, y, label, description, data')
    .eq('map_node_id', args.nodeId)
    .eq('kind', 'hidden');
  const hidden = (hiddenRows ?? []) as PassiveHidden[];
  if (!hidden.length) return EMPTY;

  // The score comes from `summarizeMember`, which derives it by each system's own rules. Not recomputed
  // here — see `passive.ts`.
  const { data: charRows } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, name, system, data')
    .in('id', args.characterIds as string[]);

  const passiveByCharacter = new Map<string, number>();
  let system: string | null = null;
  for (const row of (charRows ?? []) as Array<{ id: string; name: string; system: string | null; data: unknown }>) {
    system ??= row.system;
    const member = summarizeMember({ id: row.id, name: row.name, system: row.system, data: row.data });
    // Null perception is a real answer for a system with no equivalent — it means "cannot notice
    // passively", not "score of zero".
    if (member.perception) passiveByCharacter.set(row.id, member.perception.value);
  }
  if (!passiveByCharacter.size) return EMPTY;

  const { data: existing } = await supabaseAdmin
    .from('dnd_map_discoveries')
    .select('map_object_id, character_id')
    .in('character_id', args.characterIds as string[])
    .in('map_object_id', hidden.map((h) => h.id));
  const alreadyFound = new Set(
    ((existing ?? []) as Array<{ map_object_id: string; character_id: string }>)
      .map((r) => `${r.map_object_id}:${r.character_id}`),
  );

  const notices = passiveNotices({
    tokens: args.tokens.filter((t) => passiveByCharacter.has(t.characterId)),
    hidden,
    grid,
    passiveByCharacter,
    alreadyFound,
    diagonals: diagonalRuleFor(system),
  });
  if (!notices.length) return { notices, recorded: 0 };

  const { error } = await supabaseAdmin.from('dnd_map_discoveries').upsert(
    notices.map((n) => ({
      map_object_id: n.objectId,
      character_id: n.characterId,
      // NULL, deliberately. See the header — this is what tells a passive notice from a rolled search.
      found_by_roll: null,
    })),
    { onConflict: 'map_object_id,character_id', ignoreDuplicates: true },
  );
  // Read, never discarded. A scan that failed to record is one that will notice the same things again on
  // the next render and never persist them — and nothing would say so.
  if (error) throw new Error(`passive discovery write failed: ${error.message}`);

  return { notices, recorded: notices.length };
}
