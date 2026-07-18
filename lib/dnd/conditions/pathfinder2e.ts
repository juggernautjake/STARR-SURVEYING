// lib/dnd/conditions/pathfinder2e.ts — the PF2 condition penalty model, as data + a fold helper for the
// bespoke PF2 sheet. PF2's key rule the 5e/IG models DON'T have: penalties of the SAME TYPE don't stack —
// only the WORST (most negative) of each type applies — but a STATUS penalty and a CIRCUMSTANCE penalty DO
// stack. So Frightened 2 + Sickened 1 (both status) is a −2, not a −3; add Prone (circumstance −2) and it's a
// −4. This is exactly the "highest-penalty-wins, no same-type stacking" the owner named.
//
// Valued conditions (Frightened N, Sickened N, Clumsy N…) carry a number; unvalued ones (Prone) don't.

export type Pf2PenaltyType = 'status' | 'circumstance';
export type Pf2RollKind = 'attack' | 'save' | 'fortitude' | 'reflex' | 'will' | 'skill' | 'perception' | 'any';

export interface Pf2ConditionMechanics {
  name: string;
  /** True when the condition carries a numeric value (Frightened 2). Unvalued conditions use `fixed`. */
  valued: boolean;
  /** Penalty for an unvalued condition (e.g. Prone −2). Ignored for valued ones (they use their value). */
  fixed?: number;
  type: Pf2PenaltyType;
  /** Roll categories this condition penalizes. 'any' = every check the character rolls. */
  appliesTo: Pf2RollKind[];
  note: string;
}

export interface Pf2ActiveCondition {
  name: string;
  /** The condition's value (Frightened 2 → 2). Omitted/1 for unvalued conditions. */
  value?: number;
}

export const PF2_CONDITION_MECHANICS: Pf2ConditionMechanics[] = [
  { name: 'Frightened', valued: true, type: 'status', appliesTo: ['any'], note: 'A status penalty equal to its value to ALL your checks and DCs. It decreases by 1 at the end of each of your turns.' },
  { name: 'Sickened', valued: true, type: 'status', appliesTo: ['any'], note: 'A status penalty equal to its value to all your checks and DCs; you can’t willingly ingest anything. Retch (Fortitude) to reduce it.' },
  { name: 'Clumsy', valued: true, type: 'status', appliesTo: ['reflex', 'attack', 'skill'], note: 'A status penalty equal to its value to Dexterity-based rolls — Reflex saves, ranged/finesse attacks, and Dex skills — and to AC.' },
  { name: 'Enfeebled', valued: true, type: 'status', appliesTo: ['attack', 'skill'], note: 'A status penalty equal to its value to Strength-based rolls (melee attacks/damage and Strength skills like Athletics).' },
  { name: 'Stupefied', valued: true, type: 'status', appliesTo: ['skill', 'will'], note: 'A status penalty equal to its value to Intelligence-, Wisdom-, and Charisma-based checks and DCs, including spell attacks and spell DCs.' },
  { name: 'Drained', valued: true, type: 'status', appliesTo: ['fortitude', 'skill'], note: 'A status penalty equal to its value to Constitution-based rolls (Fortitude saves and Con checks), and you lose HP.' },
  { name: 'Prone', valued: false, fixed: -2, type: 'circumstance', appliesTo: ['attack'], note: 'A −2 circumstance penalty to melee attacks (you can’t make ranged attacks except with a crossbow you reload while prone); you are also Off-Guard.' },
  { name: 'Off-Guard', valued: false, fixed: 0, type: 'circumstance', appliesTo: [], note: '−2 circumstance penalty to your AC (affects attacks against you, not your own rolls).' },
];

const BY_NAME = new Map(PF2_CONDITION_MECHANICS.map((c) => [c.name.toLowerCase(), c] as const));

export function pf2ConditionMechanics(name: string): Pf2ConditionMechanics | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

function applies(entry: Pf2ConditionMechanics, kind: Pf2RollKind): boolean {
  if (entry.appliesTo.includes('any')) return kind !== 'perception' ? true : true; // 'any' includes perception
  if (entry.appliesTo.includes(kind)) return true;
  // The generic 'save' request matches a condition tagged for a specific save type, and vice versa.
  const saveKinds: Pf2RollKind[] = ['save', 'fortitude', 'reflex', 'will'];
  if (kind === 'save' && entry.appliesTo.some((k) => saveKinds.includes(k))) return true;
  return false;
}

/**
 * Fold active PF2 conditions into a roll of category `kind`, honoring PF2's non-stacking rule: the worst
 * STATUS penalty and the worst CIRCUMSTANCE penalty each apply once, and the two types add. Returns the total
 * penalty (≤ 0) and the named sources that actually contributed.
 */
export function pf2ConditionRollEffect(active: Pf2ActiveCondition[], kind: Pf2RollKind): { penalty: number; sources: string[] } {
  let worstStatus = 0, worstCirc = 0;
  let statusSrc = '', circSrc = '';
  for (const ac of active) {
    const cm = pf2ConditionMechanics(ac.name);
    if (!cm || !applies(cm, kind)) continue;
    const magnitude = cm.valued ? (ac.value ?? 1) : Math.abs(cm.fixed ?? 0);
    if (magnitude <= 0) continue;
    const penalty = -magnitude;
    if (cm.type === 'status' && penalty < worstStatus) { worstStatus = penalty; statusSrc = `${cm.name}${cm.valued ? ` ${ac.value ?? 1}` : ''}`; }
    if (cm.type === 'circumstance' && penalty < worstCirc) { worstCirc = penalty; circSrc = cm.name; }
  }
  const sources = [statusSrc, circSrc].filter(Boolean);
  return { penalty: worstStatus + worstCirc, sources };
}
