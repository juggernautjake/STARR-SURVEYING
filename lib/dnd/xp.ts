// lib/dnd/xp.ts — experience points, per system (P3-4, audit finding B-4).
//
// THE FINDING: there was no XP anywhere. No field on any character model, no DM tool to award it, no
// milestone affordance, and nothing that ever told a player it was time to level. Levels were typed in by
// hand. That matters more than it sounds: levelling is the moment the builders exist FOR, and nothing in
// the product pointed at one.
//
// GROUND RULE 3 APPLIES HARD HERE. A threshold table is exactly the kind of thing that is easy to write
// from memory and subtly wrong, and a wrong table silently levels someone at the wrong time for a whole
// campaign. So each system below is either **source-verified** or **explicitly milestone-only** — never
// approximated. Intuitive Games is the honest gap: its site describes advancement by level and I have no
// XP table for it, so it gets milestone and says so, rather than borrowing 5e's numbers.
import { normalizeSystem, type CharacterSystem } from './systems';

/** How a system measures advancement. */
export type XpModel = 'threshold' | 'flat' | 'milestone';

export interface XpRules {
  model: XpModel;
  /** `threshold` only: cumulative XP required to REACH each level, index 1..20 (index 0 unused). */
  thresholds?: number[];
  /** `flat` only: XP per level, the same at every level. */
  perLevel?: number;
  maxLevel: number;
  /** Shown wherever the model is explained, so a table knows what it is playing with. */
  note: string;
}

/**
 * D&D 5e — the SRD's Character Advancement table. **Identical in the 2014 and 2024 editions**, which is
 * why one table serves both rather than two copies that could drift.
 */
const DND5E_THRESHOLDS = [
  0,        // index 0, unused
  0,        // 1
  300,      // 2
  900,      // 3
  2_700,    // 4
  6_500,    // 5
  14_000,   // 6
  23_000,   // 7
  34_000,   // 8
  48_000,   // 9
  64_000,   // 10
  85_000,   // 11
  100_000,  // 12
  120_000,  // 13
  140_000,  // 14
  165_000,  // 15
  195_000,  // 16
  225_000,  // 17
  265_000,  // 18
  305_000,  // 19
  355_000,  // 20
];

/** Pathfinder 2e: a flat **1000 XP per level**, reset to 0 on each level-up in the books' own presentation.
 *  Stored cumulatively here and converted at the edge, because a cumulative total is what a DM awarding XP
 *  across a campaign actually has. */
const PF2_PER_LEVEL = 1000;

const RULES: Record<string, XpRules> = {
  'dnd5e-2014': {
    model: 'threshold', thresholds: DND5E_THRESHOLDS, maxLevel: 20,
    note: 'The SRD Character Advancement table — the same in both 5e editions.',
  },
  'dnd5e-2024': {
    model: 'threshold', thresholds: DND5E_THRESHOLDS, maxLevel: 20,
    note: 'The SRD Character Advancement table — the same in both 5e editions.',
  },
  pathfinder2e: {
    model: 'flat', perLevel: PF2_PER_LEVEL, maxLevel: 20,
    note: '1000 XP per level. Pathfinder resets the count each level; the total here is cumulative.',
  },
  'intuitive-games': {
    // Ground Rule 3: no table has been supplied for IG, and inventing one would silently level characters
    // at the wrong time for a whole campaign. Milestone is the honest answer until a source arrives.
    model: 'milestone', maxLevel: 10,
    note: 'Intuitive Games advances by level; no XP table has been sourced, so levelling is by milestone.',
  },
};

/** A system-agnostic character has no advancement table to consult. */
const MILESTONE_FALLBACK: XpRules = {
  model: 'milestone', maxLevel: 20,
  note: 'No system is set, so there is no XP table — level this character by milestone.',
};

export function xpRulesFor(system: CharacterSystem | null | undefined): XpRules {
  return RULES[normalizeSystem(system)] ?? MILESTONE_FALLBACK;
}

/** Cumulative XP needed to REACH a level. 0 for level 1 and for milestone systems. */
export function xpForLevel(system: CharacterSystem | null | undefined, level: number): number {
  const rules = xpRulesFor(system);
  const lv = Math.max(1, Math.min(rules.maxLevel, Math.floor(level)));
  if (rules.model === 'threshold') return rules.thresholds?.[lv] ?? 0;
  if (rules.model === 'flat') return (lv - 1) * (rules.perLevel ?? 0);
  return 0;
}

/**
 * The level a given XP total earns.
 *
 * Returns 1 for a milestone system whatever the total: a milestone table's XP is not a level, and quietly
 * deriving one from a number nobody agreed on is worse than ignoring it.
 */
export function levelForXp(system: CharacterSystem | null | undefined, xp: number): number {
  const rules = xpRulesFor(system);
  if (rules.model === 'milestone') return 1;
  const total = Math.max(0, Math.floor(xp || 0));
  let level = 1;
  for (let lv = 2; lv <= rules.maxLevel; lv++) {
    if (total >= xpForLevel(system, lv)) level = lv;
    else break;
  }
  return level;
}

export interface XpProgress {
  model: XpModel;
  /** The level this XP total earns (1 on a milestone system). */
  level: number;
  /** XP still needed for the next level; null at max level or on a milestone system. */
  toNext: number | null;
  /** 0–1 through the current level; null when there is no next level to be part-way to. */
  fraction: number | null;
  /** A sentence for the sheet. Never empty. */
  label: string;
}

/**
 * Where a character stands. `currentLevel` is the level actually ON the sheet, which may legitimately
 * differ from what the XP earns — a DM levelling by milestone, or a character built above their XP. The
 * label says so rather than silently preferring one.
 */
export function xpProgress(
  system: CharacterSystem | null | undefined,
  xp: number,
  currentLevel: number,
): XpProgress {
  const rules = xpRulesFor(system);
  if (rules.model === 'milestone') {
    return { model: 'milestone', level: currentLevel, toNext: null, fraction: null, label: rules.note };
  }

  const total = Math.max(0, Math.floor(xp || 0));
  const earned = levelForXp(system, total);
  if (earned >= rules.maxLevel) {
    return { model: rules.model, level: earned, toNext: null, fraction: null, label: `${total.toLocaleString()} XP — maximum level.` };
  }

  const floor = xpForLevel(system, earned);
  const ceiling = xpForLevel(system, earned + 1);
  const span = Math.max(1, ceiling - floor);
  const toNext = Math.max(0, ceiling - total);

  // The mismatch is worth saying out loud. A sheet showing "Level 3" beside XP earning level 5 is either a
  // milestone table or an oversight, and the player is the one who knows which.
  const mismatch = earned !== currentLevel
    ? ` (the sheet says level ${currentLevel})`
    : '';

  return {
    model: rules.model,
    level: earned,
    toNext,
    fraction: Math.min(1, (total - floor) / span),
    label: `${total.toLocaleString()} XP — level ${earned}${mismatch}. ${toNext.toLocaleString()} to level ${earned + 1}.`,
  };
}

/** Defensively read a stored XP value. Negative and unparseable both become 0 — a negative XP total is not
 *  a debt anyone agreed to, and a listing must not render one. */
export function normalizeXp(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
