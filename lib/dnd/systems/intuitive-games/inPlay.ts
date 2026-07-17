// lib/dnd/systems/intuitive-games/inPlay.ts — the PURE "what's currently in play" model for an Intuitive
// Games character: given the active stance + conditions (+ level), produce, for each, a display name, a
// short summary for the on-sheet badge, and the full rules text for the hover tooltip. Expo/React-free so
// the sheet display (B4/B5), the tooltips (B7), and the AI (explain) all read ONE source, and it's
// unit-testable off-screen. All text comes from IG_STANCE_DEFS / IG_CONDITIONS (intuitivegames.net) — a
// stance/condition the system doesn't define is surfaced honestly as custom, never invented.

import { IG_STANCE_DEFS, IG_CONDITIONS } from './content';

export interface IGInPlayEffect {
  kind: 'stance' | 'condition';
  /** True when the element is a recognized IG rule (vs. a custom/homebrew one with no IG text). */
  vanilla: boolean;
  /** Display name, e.g. "Defensive Stance" or "Grappled". */
  name: string;
  /** Short line for the on-sheet badge — the benefit/effect that applies right now. */
  summary: string;
  /** Full rules text for the hover/focus tooltip. */
  tooltip: string;
}

/** The level at which a stance's Advanced benefit replaces its Basic one (the site: "a single benefit;
 *  at Level 5+ they gain the Advanced benefit"). */
export const IG_STANCE_ADVANCED_LEVEL = 5;

const STANCE_RULES_NOTE =
  'One stance is active at a time; activate with an action, it lasts one minute, and it can be ended as a free action.';

const normStance = (s: string) => s.trim().toLowerCase().replace(/\s+stance$/, '').replace(/\s+/g, ' ');
const normCond = (s: string) => s.trim().toLowerCase();

/** The in-play effect for a named stance at a given level, or null if the name isn't a stance. A stance
 *  the system doesn't define resolves as a custom entry (honest, not invented). */
export function igStanceInPlay(stanceName: string | null | undefined, level: number): IGInPlayEffect | null {
  if (!stanceName || !stanceName.trim()) return null;
  const def = IG_STANCE_DEFS.find((s) => normStance(s.name) === normStance(stanceName));
  if (!def) {
    return {
      kind: 'stance',
      vanilla: false,
      name: /stance$/i.test(stanceName) ? stanceName : `${stanceName} Stance`,
      summary: 'Custom stance',
      tooltip: `${stanceName} — a custom stance; the Intuitive Games rules do not define it.`,
    };
  }
  // "A single benefit": below level 5 it's the Basic benefit; at level 5+ it's the Advanced benefit.
  const advanced = level >= IG_STANCE_ADVANCED_LEVEL;
  return {
    kind: 'stance',
    vanilla: true,
    name: `${def.name} Stance`,
    summary: advanced ? def.advanced : def.basic,
    tooltip: `${def.name} Stance. Basic (below Lv ${IG_STANCE_ADVANCED_LEVEL}): ${def.basic} Advanced (Lv ${IG_STANCE_ADVANCED_LEVEL}+): ${def.advanced} ${STANCE_RULES_NOTE}`,
  };
}

/** The in-play effect for a named condition, or null for an empty name. A condition the system doesn't
 *  define resolves as a custom entry (honest, not invented — never borrows another system's condition). */
export function igConditionInPlay(conditionName: string | null | undefined): IGInPlayEffect | null {
  if (!conditionName || !conditionName.trim()) return null;
  const def = IG_CONDITIONS.find((c) => normCond(c.name) === normCond(conditionName));
  if (!def) {
    return {
      kind: 'condition',
      vanilla: false,
      name: conditionName,
      summary: 'Custom condition',
      tooltip: `${conditionName} — a custom condition; the Intuitive Games rules do not define it.`,
    };
  }
  return { kind: 'condition', vanilla: true, name: def.name, summary: def.effect ?? '', tooltip: def.effect ?? '' };
}

/** Every effect currently in play on an IG character — the active stance (if any) followed by each
 *  condition — as display+tooltip entries the sheet renders and the AI can explain. */
export function igEffectsInPlay(input: {
  stance?: string | null;
  conditions?: string[];
  level: number;
}): IGInPlayEffect[] {
  const out: IGInPlayEffect[] = [];
  const s = igStanceInPlay(input.stance, input.level);
  if (s) out.push(s);
  for (const c of input.conditions ?? []) {
    const e = igConditionInPlay(c);
    if (e) out.push(e);
  }
  return out;
}
