// lib/dnd/conditions/intuitive-games.ts — the mechanical model of the Intuitive Games conditions, as data,
// so the bespoke IG sheet can AUTO-FOLD a condition's roll effects (like the 5e sheet folds its conditions and
// exhaustion). IG conditions use two fold-able shapes: a flat penalty to d20 rolls (Shaken/Sickened −2 to
// everything) and disadvantage on a specific roll category (Blind → attacks & reflex saves & perception, etc).
// Anything that isn't a self-roll modifier (no-actions, auto-fail, behaviour) stays in `note` for the player.
//
// Verbatim-grounded: every penalty/disadvantage here is stated in the IG_CONDITIONS text (content.ts). Nothing
// invented (Ground Rule 2).

/** The roll categories the IG sheet can attribute a condition effect to. 'any' = every d20 roll. */
export type IgRollKind = 'attack' | 'reflex_save' | 'fortitude_save' | 'will_save' | 'save' | 'perception' | 'str_dex_check' | 'skill' | 'ability_check' | 'any';

export interface IgConditionMechanics {
  /** Matches an IG_CONDITIONS label + the combat.conditions entries. */
  name: string;
  /** Flat penalty applied to the roll categories in `penaltyOn` (e.g. Shaken −2). */
  penalty?: number;
  penaltyOn?: IgRollKind[];
  /** Roll categories rolled at disadvantage while this condition is active. */
  disadvantageOn?: IgRollKind[];
  /** The RAW parts not captured above (no actions, auto-fail, behaviour), shown for the player to apply. */
  note: string;
}

export const IG_CONDITION_MECHANICS: IgConditionMechanics[] = [
  { name: 'Blind', disadvantageOn: ['attack', 'reflex_save', 'perception'], note: 'You automatically fail all sight-based perception checks.' },
  { name: 'Deaf', disadvantageOn: ['reflex_save', 'perception'], note: 'You automatically fail all hearing-based perception checks.' },
  { name: 'Entangled', disadvantageOn: ['str_dex_check'], note: 'You cannot move from your current location (checks to free yourself are exempt from the disadvantage).' },
  { name: 'Fascinated', disadvantageOn: ['perception'], note: 'You can take no actions; the effect can end early if you are threatened or attacked.' },
  { name: 'Prone', disadvantageOn: ['attack', 'perception'], note: 'You cannot make ranged attacks (the disadvantage on attacks applies to melee).' },
  { name: 'Shaken', penalty: -2, penaltyOn: ['any'], note: '' },
  { name: 'Sickened', penalty: -2, penaltyOn: ['any'], note: 'If you fail any Fortitude save while sickened, you are paralyzed for rounds equal to the amount you failed by.' },
  { name: 'Grappled', note: 'You are Flat-Footed and cannot move from your location or take two-handed actions.' },
  { name: 'Pinned', note: 'You are treated as Prone with the usual grappled penalties.' },
  { name: 'Flat-Footed', note: 'You do not add your Dexterity modifier on reflex saves or skill checks and cannot take reactions.' },
  { name: 'Paralyzed', note: 'You cannot act; your reflex saves are treated as a natural 1 (adding only your level).' },
  { name: 'Asleep', note: 'You can take no actions and are treated as paralyzed until woken.' },
  { name: 'Invisible', note: 'You have advantage on Stealth checks and other creatures are Flat-Footed to your attacks.' },
];

const BY_NAME = new Map(IG_CONDITION_MECHANICS.map((c) => [c.name.toLowerCase(), c] as const));

/** Look up one IG condition's mechanics by name (case-insensitive), or undefined. */
export function igConditionMechanics(name: string): IgConditionMechanics | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

/** Does a `penaltyOn`/`disadvantageOn` entry match the roll being made? 'any' matches everything, and the
 *  broad 'save' bucket matches any of the three specific save kinds. */
function matches(entryKinds: IgRollKind[] | undefined, kind: IgRollKind): boolean {
  if (!entryKinds) return false;
  if (entryKinds.includes('any')) return true;
  if (entryKinds.includes(kind)) return true;
  // A condition tagged for the specific save applies when the roll is a generic 'save', and vice-versa.
  const saves: IgRollKind[] = ['reflex_save', 'fortitude_save', 'will_save', 'save'];
  if (saves.includes(kind) && entryKinds.some((k) => saves.includes(k))) {
    // Only if the SAME save (reflex↔reflex) or the generic bucket — don't let Blind's reflex disadvantage
    // bleed onto a fortitude save.
    if (kind === 'save' || entryKinds.includes('save')) return true;
    return entryKinds.includes(kind);
  }
  return false;
}

/**
 * Fold the active IG conditions into a single roll of category `kind`: the total flat penalty, whether it's at
 * disadvantage, and the named sources for each — so the bespoke IG sheet can apply them AND show what did it.
 */
export function igConditionRollEffect(active: string[], kind: IgRollKind): { penalty: number; disadvantage: boolean; sources: string[] } {
  let penalty = 0;
  let disadvantage = false;
  const sources: string[] = [];
  for (const name of active) {
    const cm = igConditionMechanics(name);
    if (!cm) continue;
    let hit = false;
    if (cm.penalty && matches(cm.penaltyOn, kind)) { penalty += cm.penalty; hit = true; }
    if (matches(cm.disadvantageOn, kind)) { disadvantage = true; hit = true; }
    if (hit) sources.push(cm.name);
  }
  return { penalty, disadvantage, sources };
}
