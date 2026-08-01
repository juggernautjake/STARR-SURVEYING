// lib/dnd/maps/passive.ts — noticing without rolling. M6-2.
//
// The plan: *"Some systems notice things without rolling (5e passive Perception). Supported as an
// automatic server-side comparison when a token moves within range."*
//
// ── THE SCORE IS NOT RECOMPUTED HERE ───────────────────────────────────────────────────────────────
//
// `summarizeMember` in `lib/dnd/party-overview.ts` already derives it — 10 + the Perception modifier for
// 5e, and PF2's Perception proficiency for PF2, each by that system's own rules. Re-deriving it in this
// file would be a second implementation that drifts, and the first symptom would be the map noticing
// things the party sheet says it should not. Same reason `reach.ts` reads speed through the ledger.
//
// ── PASSIVE IS NOT A FREE ROLL, AND ONLY SOME SECRETS YIELD TO IT ──────────────────────────────────
//
// A secret whose DC is an **Investigation** check is not found by standing near it: investigating is an
// action you take, and 5e's passive score is a Perception floor, not a universal one. Treating every
// hidden object as passively findable would quietly delete the difference between "look around" and
// "search the bookcase" — which for a lot of dungeons is the entire puzzle.
//
// So only skills in `PASSIVE_SKILLS` are eligible, and everything else needs `POST /api/dnd/maps/search`.
//
// ── AND RANGE IS REQUIRED, NOT OPTIONAL ────────────────────────────────────────────────────────────
//
// Without it, walking onto a map reveals every passively-findable secret on it at once. The default is
// deliberately short; a DM who wants a thing noticed from across the room says so on the object.
//
// Pure and total: no I/O, no clock, no randomness.

import { squareAt, hexAt, type MapGrid } from './grid';
import { cellDistanceFt, hexDistanceFt, type DiagonalRule } from './movement';
import { readHiddenSpec, sameSkill } from './discovery';

/**
 * Skills a character exercises simply by being present.
 *
 * Perception only, and that is a rule rather than a shortcut: 5e gives a passive score to any skill in
 * principle, but the ones a DM actually sets on a hidden object are Perception (notice) and Investigation
 * (search) — and Investigation passively would mean a character searching every bookcase they walk past.
 */
export const PASSIVE_SKILLS = new Set(['perception']);

/** How far a passive notice reaches when the object does not say. Short on purpose — see the header. */
export const DEFAULT_NOTICE_FT = 30;

export interface PassiveToken {
  characterId: string;
  x: number;
  y: number;
}

export interface PassiveHidden {
  id: string;
  x: number;
  y: number;
  label: string | null;
  description: string | null;
  data: unknown;
}

export interface PassiveNotice {
  objectId: string;
  characterId: string;
  label: string | null;
  description: string | null;
  /**
   * Where the noticed thing IS.
   *
   * Carried rather than looked up, because the caller cannot look it up: a discovery written during this
   * render is not in the object payload the render already fetched, so a page merging a fresh notice into
   * its reveals has nothing to read a position from and would draw the marker at the origin — the corner
   * of the map, nowhere near the rune. Correct on the next reload, wrong exactly once, which is the
   * hardest kind of wrong to notice.
   */
  x: number;
  y: number;
  /** Feet between the token and the object, so a DM's log can say how close they were. */
  distanceFt: number;
}

export interface PassiveInput {
  tokens: readonly PassiveToken[];
  hidden: readonly PassiveHidden[];
  grid: MapGrid | null;
  /** characterId → passive score, from `summarizeMember(...).perception`. */
  passiveByCharacter: ReadonlyMap<string, number>;
  alreadyFound: ReadonlySet<string>;
  diagonals?: DiagonalRule;
}

/** Distance between a token and an object, in feet on this node's grid. */
function distanceFt(t: PassiveToken, h: PassiveHidden, grid: MapGrid, diagonals: DiagonalRule): number {
  if (grid.kind === 'hex') return hexDistanceFt(hexAt(t.x, t.y, grid), hexAt(h.x, h.y, grid), grid);
  return cellDistanceFt(squareAt(t.x, t.y, grid), squareAt(h.x, h.y, grid), grid, diagonals);
}

/**
 * Which hidden objects the party notices simply by standing where they are.
 *
 * Returns one notice per (object, character) that qualifies — the CLOSEST character is not privileged,
 * because a discovery is per-character (`dnd_map_discoveries` is keyed that way) and two people noticing
 * the same thing is two people who noticed it.
 */
export function passiveNotices(input: PassiveInput): PassiveNotice[] {
  const { tokens, hidden, grid, passiveByCharacter, alreadyFound, diagonals = 'free' } = input;
  // No grid means no distance, and without distance the range rule cannot be applied — so nothing is
  // noticed rather than everything. A continent has no battle grid and no secrets to trip over.
  if (!grid) return [];

  const out: PassiveNotice[] = [];

  for (const h of hidden) {
    const spec = readHiddenSpec(h.data);
    // Same rule as an active search: an unfinished secret is not findable. See `discovery.ts`.
    if (spec.dc == null) continue;
    // A hidden object with NO skill named is findable by any check — but "any check" is an active thing.
    // Passive needs the DM to have said Perception, because passive Perception is what a character has.
    if (!spec.skill || !PASSIVE_SKILLS.has(spec.skill.trim().toLowerCase())) continue;

    const raw = (h.data ?? {}) as Record<string, unknown>;
    const rangeFt = typeof raw.noticeRangeFt === 'number' && raw.noticeRangeFt > 0
      ? raw.noticeRangeFt
      : DEFAULT_NOTICE_FT;

    for (const t of tokens) {
      if (alreadyFound.has(`${h.id}:${t.characterId}`)) continue;
      const score = passiveByCharacter.get(t.characterId);
      if (typeof score !== 'number') continue;
      // Equal meets it, exactly as an active check does — the two must not disagree about the same DC.
      if (score < spec.dc) continue;

      const d = distanceFt(t, h, grid, diagonals);
      if (d > rangeFt) continue;

      out.push({
        objectId: h.id,
        characterId: t.characterId,
        label: h.label,
        description: h.description ?? spec.description ?? null,
        x: h.x,
        y: h.y,
        distanceFt: d,
      });
    }
  }

  return out;
}

/** Is this hidden object one a character could ever notice without searching? For the DM's authoring UI. */
export function isPassivelyFindable(data: unknown): boolean {
  const spec = readHiddenSpec(data);
  return spec.dc != null && Boolean(spec.skill) && PASSIVE_SKILLS.has(spec.skill!.trim().toLowerCase());
}

/** Does an active search's skill match this object's? Re-exported so callers need one import. */
export { sameSkill };
