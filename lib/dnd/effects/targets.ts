// lib/dnd/effects/targets.ts — THE registry of everything an effect can touch (Appendix A).
//
// This file is a contract, not a list. The effect-builder picker, the AI's tool schema, the
// ledger's resolver and the star tooltips are all GENERATED from it. Add a target here and it
// becomes authorable, AI-emittable, resolvable and explainable at once — there is nowhere for
// those four to drift apart, because there is only one source.
//
// That is the whole reason this exists. "An item can do literally anything" is only achievable if
// the vocabulary is DATA. A hand-written menu is exactly what makes a system finite: someone adds
// an operation to the engine, forgets the picker, and the capability is unreachable forever.
//
// Naming: the keys below MATCH the conventions the engine already resolves
// (app/dnd/_sheet/engine/apply.ts) — `dex_saves`, `skill.<key>`, `spell_save_dc`. Inventing a
// parallel vocabulary here and translating between them would be two sources of truth wearing a
// trench coat.
import { ABILITIES, SKILLS } from '@/app/dnd/_sheet/rules/dnd';
import type { EffectOperation } from '@/app/dnd/_sheet/engine/effects';

/** Groups exist for the human picking from a menu (Slice 17), not for the engine. */
export type TargetGroup =
  | 'ability'
  | 'movement'
  | 'defense'
  | 'roll'
  | 'core'
  | 'grant'
  | 'identity'
  | 'instant'
  | 'state'
  | 'economy'
  | 'meta';

/** What a target's `value` means. Drives the builder's input control and the AI's schema. */
export type ValueType =
  | 'number' // a score, a bonus, a DC
  | 'flag' // presence is the whole effect (hover, ignore difficult terrain)
  | 'text' // a name, a note
  | 'dice' // '2d6+3'
  | 'damage_type' // fire, cold…
  | 'proficiency' // longswords, stealth, dwarvish
  | 'sense' // darkvision 60
  | 'ref'; // an id of a feature/spell/form defined elsewhere

export interface TargetDef {
  key: string;
  /** Menu label. */
  label: string;
  group: TargetGroup;
  valueType: ValueType;
  /** Operations that make sense here. The builder offers only these; the validator enforces them. */
  ops: EffectOperation[];
  /** One line for the picker + the AI schema description. */
  help: string;
  /**
   * Where this renders on the sheet. A target with no home is a LIE — the player is told they can
   * burrow and nothing on the sheet ever mentions it. This field is what the "every target renders
   * somewhere" test asserts against, so it cannot be quietly skipped.
   */
  rendersAt: string;
  /** Negative values are meaningful (a curse). True for most numbers; false for e.g. hp_max floors. */
  allowsNegative?: boolean;
}

const NUM: EffectOperation[] = ['add', 'set', 'set_base'];
const ROLL: EffectOperation[] = ['add', 'advantage', 'disadvantage'];

// ── Abilities ────────────────────────────────────────────────────────────────
// `set` matters here: Storm Giant Strength SETS Strength to 29; a Belt of the Bear ADDS +2. The
// distinction is not cosmetic — a 29 STR character who drinks a lesser potion must not go down.
const abilityTargets: TargetDef[] = ABILITIES.map((a) => ({
  key: `ability_${a.key}`,
  label: a.label ?? a.key.toUpperCase(),
  group: 'ability' as const,
  valueType: 'number' as const,
  ops: NUM,
  help: `Modify or set the ${a.key.toUpperCase()} score. Every derived number follows automatically.`,
  rendersAt: 'Abilities tab · stat rail',
  allowsNegative: true,
}));

// ── Movement ─────────────────────────────────────────────────────────────────
// Movement is NOT one number. A potion of flying is not "+30 speed" — a fly speed can exist while
// the walk speed is 0 (a levitating creature), and the sheet has to show both.
const movementTargets: TargetDef[] = [
  { key: 'speed_walk', label: 'Walking speed', group: 'movement', valueType: 'number', ops: NUM, help: 'Ground speed, in feet.', rendersAt: 'Combat tab · Speeds', allowsNegative: true },
  { key: 'speed_fly', label: 'Flying speed', group: 'movement', valueType: 'number', ops: NUM, help: 'Fly speed, in feet. Can exist with a walking speed of 0.', rendersAt: 'Combat tab · Speeds' },
  { key: 'speed_swim', label: 'Swimming speed', group: 'movement', valueType: 'number', ops: NUM, help: 'Swim speed, in feet.', rendersAt: 'Combat tab · Speeds' },
  { key: 'speed_climb', label: 'Climbing speed', group: 'movement', valueType: 'number', ops: NUM, help: 'Climb speed, in feet.', rendersAt: 'Combat tab · Speeds' },
  { key: 'speed_burrow', label: 'Burrowing speed', group: 'movement', valueType: 'number', ops: NUM, help: 'Tunnelling speed, in feet.', rendersAt: 'Combat tab · Speeds' },
  { key: 'speed_all', label: 'All speeds', group: 'movement', valueType: 'number', ops: ['add'], help: 'A blanket modifier applied to every movement mode you have.', rendersAt: 'Combat tab · Speeds', allowsNegative: true },
  { key: 'hover', label: 'Hover', group: 'movement', valueType: 'flag', ops: ['set'], help: 'You can hover — you do not fall when your fly speed is unused.', rendersAt: 'Combat tab · Speeds' },
  { key: 'ignore_difficult_terrain', label: 'Ignore difficult terrain', group: 'movement', valueType: 'flag', ops: ['set'], help: 'Difficult terrain costs you no extra movement.', rendersAt: 'Combat tab · Speeds' },
];

// ── Core numbers ─────────────────────────────────────────────────────────────
const coreTargets: TargetDef[] = [
  { key: 'ac', label: 'Armor Class', group: 'core', valueType: 'number', ops: NUM, help: 'Add to AC, or set a base AC (armour, Unarmored Defense).', rendersAt: 'Combat tab · AC stat', allowsNegative: true },
  { key: 'initiative', label: 'Initiative', group: 'core', valueType: 'number', ops: ROLL, help: 'Modify the initiative bonus, or grant advantage on it.', rendersAt: 'Combat tab · Initiative', allowsNegative: true },
  { key: 'hp_max', label: 'Max HP', group: 'core', valueType: 'number', ops: NUM, help: 'Modify maximum hit points.', rendersAt: 'Combat tab · Hit Points', allowsNegative: true },
  { key: 'hit_dice', label: 'Hit dice', group: 'core', valueType: 'number', ops: NUM, help: 'Modify the hit-dice pool.', rendersAt: 'Combat tab · Hit Points' },
  { key: 'proficiency_bonus', label: 'Proficiency bonus', group: 'core', valueType: 'number', ops: NUM, help: 'Modify the proficiency bonus itself. Rare and powerful — it touches everything.', rendersAt: 'Overview · header stats', allowsNegative: true },
  { key: 'spell_save_dc', label: 'Spell save DC', group: 'core', valueType: 'number', ops: NUM, help: 'Modify the DC of saves against your spells.', rendersAt: 'Combat tab · Save DC stat', allowsNegative: true },
  { key: 'spell_attack', label: 'Spell attack bonus', group: 'core', valueType: 'number', ops: NUM, help: 'Modify your spell attack rolls.', rendersAt: 'Spells tab', allowsNegative: true },
  { key: 'carrying_capacity', label: 'Carrying capacity', group: 'core', valueType: 'number', ops: NUM, help: 'Modify how much you can carry. Size effects also drive this.', rendersAt: 'Inventory tab', allowsNegative: true },
];

// ── Rolls ────────────────────────────────────────────────────────────────────
// Target names match apply.ts exactly (`all_saves`, `<ability>_saves`, `skill.<key>`).
const rollTargets: TargetDef[] = [
  { key: 'attack_roll', label: 'Attack rolls', group: 'roll', valueType: 'number', ops: ROLL, help: 'Modify or grant advantage on attack rolls.', rendersAt: 'Combat tab · Attacks', allowsNegative: true },
  { key: 'damage_roll', label: 'Damage rolls', group: 'roll', valueType: 'number', ops: ['add'], help: 'Modify damage dealt.', rendersAt: 'Combat tab · Attacks', allowsNegative: true },
  { key: 'attack_and_damage', label: 'Attack AND damage', group: 'roll', valueType: 'number', ops: ['add'], help: 'The classic magic-weapon bonus: +N to hit and to damage.', rendersAt: 'Combat tab · Attacks', allowsNegative: true },
  // Bonus DICE, not a flat number: Enlarge's +1d4, a flametongue's +1d6 fire, a brand's +2d6 radiant.
  // A great many effects add dice rather than a modifier, and `damage_roll` (a number) cannot express
  // them. The value is a dice expression with an optional damage type — "1d6" or "1d6 fire".
  { key: 'weapon_bonus_dice', label: 'Weapon bonus damage dice', group: 'roll', valueType: 'dice', ops: ['add'], help: 'Add bonus damage DICE to every weapon attack (e.g. Enlarge\'s +1d4, a flametongue\'s +1d6 fire). Value is a dice expression, optionally with a damage type: "1d6" or "1d6 fire".', rendersAt: 'Combat tab · Attacks (rolled into weapon damage)' },
  { key: 'all_saves', label: 'All saving throws', group: 'roll', valueType: 'number', ops: ROLL, help: 'Modify or grant advantage on every save.', rendersAt: 'Abilities tab · Saves', allowsNegative: true },
  ...ABILITIES.map((a) => ({
    key: `${a.key}_saves`,
    label: `${a.key.toUpperCase()} saves`,
    group: 'roll' as const,
    valueType: 'number' as const,
    ops: ROLL,
    help: `Modify or grant advantage on ${a.key.toUpperCase()} saving throws.`,
    rendersAt: 'Abilities tab · Saves',
    allowsNegative: true,
  })),
  { key: 'all_skills', label: 'All skill checks', group: 'roll', valueType: 'number', ops: ROLL, help: 'Modify or grant advantage on every skill check.', rendersAt: 'Skills tab', allowsNegative: true },
  ...SKILLS.map((s) => ({
    key: `skill.${s.key}`,
    label: s.label ?? s.key,
    group: 'roll' as const,
    valueType: 'number' as const,
    ops: ROLL,
    help: `Modify or grant advantage on ${s.label ?? s.key} checks.`,
    rendersAt: 'Skills tab',
    allowsNegative: true,
  })),
  { key: 'death_save', label: 'Death saves', group: 'roll', valueType: 'number', ops: ROLL, help: 'Modify or grant advantage on death saving throws.', rendersAt: 'Combat tab · Death saves', allowsNegative: true },
  { key: 'concentration_save', label: 'Concentration saves', group: 'roll', valueType: 'number', ops: ROLL, help: 'Modify or grant advantage on concentration checks.', rendersAt: 'Combat tab · Concentration', allowsNegative: true },
];

// ── Defenses ─────────────────────────────────────────────────────────────────
const defenseTargets: TargetDef[] = [
  { key: 'resistance', label: 'Resistance', group: 'defense', valueType: 'damage_type', ops: ['resistance'], help: 'Take half damage from a damage type.', rendersAt: 'Combat tab · Defenses' },
  { key: 'immunity', label: 'Immunity', group: 'defense', valueType: 'damage_type', ops: ['immunity'], help: 'Take no damage from a damage type.', rendersAt: 'Combat tab · Defenses' },
  { key: 'vulnerability', label: 'Vulnerability', group: 'defense', valueType: 'damage_type', ops: ['vulnerability'], help: 'Take double damage from a damage type. A real downside — cursed items live here.', rendersAt: 'Combat tab · Defenses' },
  { key: 'condition_immunity', label: 'Condition immunity', group: 'defense', valueType: 'text', ops: ['immunity'], help: 'You cannot be affected by a named condition.', rendersAt: 'Combat tab · Defenses' },
  // Advantage on saves AGAINST a named condition/effect (Dwarven Resilience vs poison, Fey Ancestry vs
  // charmed, Gnome Cunning vs magic). Informational, like a resistance — the game asks the player to
  // know when it applies, so the sheet LISTS it rather than silently auto-applying to untagged saves.
  { key: 'condition_advantage', label: 'Advantage vs condition', group: 'defense', valueType: 'text', ops: ['condition_advantage'], help: 'Advantage on saving throws against a named condition or effect (poison, charmed, magic). Listed on the sheet — the player invokes it, as the rules require.', rendersAt: 'Combat tab · Defenses' },
];

// ── Grants ───────────────────────────────────────────────────────────────────
const grantTargets: TargetDef[] = [
  { key: 'proficiency', label: 'Proficiency', group: 'grant', valueType: 'proficiency', ops: ['grant_proficiency'], help: 'Grant proficiency with a skill, tool, weapon, armour or language.', rendersAt: 'Skills tab · Proficiencies' },
  { key: 'expertise', label: 'Expertise', group: 'grant', valueType: 'proficiency', ops: ['grant_proficiency'], help: 'Double the proficiency bonus for a skill.', rendersAt: 'Skills tab' },
  { key: 'grant_feature', label: 'Feature / ability', group: 'grant', valueType: 'ref', ops: ['set'], help: "Grant a feature — including one from another class entirely (the pendant that makes you rage).", rendersAt: 'Features tab (badged with its source)' },
  { key: 'grant_attack', label: 'Attack', group: 'grant', valueType: 'ref', ops: ['set'], help: 'Grant an attack option.', rendersAt: 'Combat tab · Attacks' },
  { key: 'grant_spell', label: 'Spell', group: 'grant', valueType: 'ref', ops: ['set'], help: 'Grant a spell, prepared or castable.', rendersAt: 'Spells tab' },
  { key: 'grant_resource', label: 'Resource track', group: 'grant', valueType: 'ref', ops: ['set'], help: 'Grant a usage pool (charges, points) with its own reset rule.', rendersAt: 'Combat tab · Resources' },
  { key: 'grant_sense', label: 'Sense', group: 'grant', valueType: 'sense', ops: ['set'], help: 'Grant darkvision / tremorsense / truesight / blindsight, with a range.', rendersAt: 'Combat tab · Senses' },
  { key: 'grant_language', label: 'Language', group: 'grant', valueType: 'text', ops: ['grant_proficiency'], help: 'Grant a language.', rendersAt: 'Overview · Languages' },
];

// ── Identity ─────────────────────────────────────────────────────────────────
// Overlays, never writes. See the Part II architectural rule: if the pendant WROTE meta.name, an
// autosave between equip and unequip would make the change permanent.
const identityTargets: TargetDef[] = [
  { key: 'name', label: 'Name', group: 'identity', valueType: 'text', ops: ['set'], help: 'Display a different name while active.', rendersAt: 'Hero header' },
  { key: 'image', label: 'Portrait', group: 'identity', valueType: 'text', ops: ['set'], help: 'Display different art while active.', rendersAt: 'Hero header · gallery' },
  { key: 'token', label: 'Map token', group: 'identity', valueType: 'text', ops: ['set'], help: 'Use a different token on maps while active.', rendersAt: 'Map tools' },
  { key: 'species', label: 'Species', group: 'identity', valueType: 'text', ops: ['set'], help: 'Appear as a different species while active.', rendersAt: 'Hero header · Overview' },
  { key: 'class', label: 'Class', group: 'identity', valueType: 'text', ops: ['set'], help: 'Appear as a different class while active.', rendersAt: 'Hero header · Overview' },
  { key: 'subclass', label: 'Subclass', group: 'identity', valueType: 'text', ops: ['set'], help: 'Appear as a different subclass while active.', rendersAt: 'Hero header · Overview' },
  { key: 'gender', label: 'Gender', group: 'identity', valueType: 'text', ops: ['set'], help: 'Change the recorded gender while active.', rendersAt: 'Overview · Bio' },
  { key: 'pronouns', label: 'Pronouns', group: 'identity', valueType: 'text', ops: ['set'], help: 'Change the recorded pronouns while active.', rendersAt: 'Overview · Bio' },
  { key: 'profession', label: 'Profession', group: 'identity', valueType: 'text', ops: ['set'], help: 'Change the recorded profession/occupation while active.', rendersAt: 'Overview · Bio' },
  { key: 'alignment', label: 'Alignment', group: 'identity', valueType: 'text', ops: ['set'], help: 'Change the recorded alignment while active (a helm of opposite alignment, a curse).', rendersAt: 'Overview · Bio' },
  { key: 'size', label: 'Size', group: 'identity', valueType: 'text', ops: ['set'], help: 'Change size. MECHANICAL: drives carrying capacity, grapple/shove legality, and some damage dice.', rendersAt: 'Overview · Combat tab' },
  { key: 'creature_type', label: 'Creature type', group: 'identity', valueType: 'text', ops: ['set'], help: 'Change creature type (beast, undead…). Matters for spells that target a type.', rendersAt: 'Overview' },
];

// ── Instant ──────────────────────────────────────────────────────────────────
// Fires once on use and leaves NOTHING behind. A healing potion is entirely instant, which is why
// it vanishes completely and never appears in the Active Effects panel (Slice 12).
const instantTargets: TargetDef[] = [
  { key: 'heal', label: 'Heal', group: 'instant', valueType: 'dice', ops: ['add'], help: 'Restore hit points now. Leaves nothing behind.', rendersAt: 'Resolved on use (roll log)' },
  { key: 'temp_hp', label: 'Temporary HP', group: 'instant', valueType: 'dice', ops: ['add'], help: 'Grant temporary hit points now.', rendersAt: 'Combat tab · Hit Points' },
  { key: 'damage', label: 'Damage', group: 'instant', valueType: 'dice', ops: ['add'], help: 'Deal damage now (to you, or via a trigger to an attacker).', rendersAt: 'Resolved on use (roll log)' },
  { key: 'restore_resource', label: 'Restore a resource', group: 'instant', valueType: 'ref', ops: ['add'], help: 'Refill a usage pool now.', rendersAt: 'Combat tab · Resources' },
  { key: 'restore_slot', label: 'Restore a spell slot', group: 'instant', valueType: 'number', ops: ['add'], help: 'Restore spell slots of a given rank now.', rendersAt: 'Spells tab · Slots' },
  { key: 'remove_condition', label: 'Remove a condition', group: 'instant', valueType: 'text', ops: ['set'], help: 'Clear a named condition now.', rendersAt: 'Combat tab · Conditions' },
  { key: 'apply_condition', label: 'Apply a condition', group: 'instant', valueType: 'text', ops: ['set'], help: 'Apply a named condition now (a poison, a curse).', rendersAt: 'Combat tab · Conditions' },
];

// ── State / economy / meta ───────────────────────────────────────────────────
const stateTargets: TargetDef[] = [
  { key: 'condition', label: 'Condition (while active)', group: 'state', valueType: 'text', ops: ['set'], help: 'Impose or suppress a condition for as long as this effect lasts.', rendersAt: 'Combat tab · Conditions' },
  { key: 'exhaustion', label: 'Exhaustion', group: 'state', valueType: 'number', ops: NUM, help: 'Modify exhaustion level.', rendersAt: 'Combat tab · Conditions', allowsNegative: true },
];

const economyTargets: TargetDef[] = [
  { key: 'attunement_slots', label: 'Attunement slots', group: 'economy', valueType: 'number', ops: NUM, help: 'Change how many items you can attune to.', rendersAt: 'Inventory tab', allowsNegative: true },
  { key: 'attacks_per_action', label: 'Attacks per Attack action', group: 'economy', valueType: 'number', ops: NUM, help: 'Extra Attack and friends.', rendersAt: 'Combat tab · Attacks' },
  { key: 'reaction_count', label: 'Reactions per round', group: 'economy', valueType: 'number', ops: NUM, help: 'Change how many reactions you get.', rendersAt: 'Combat tab · Action economy' },
  { key: 'bonus_action_count', label: 'Bonus actions per turn', group: 'economy', valueType: 'number', ops: NUM, help: 'Change how many bonus actions you get.', rendersAt: 'Combat tab · Action economy' },
];

const metaTargets: TargetDef[] = [
  {
    key: 'transform',
    label: 'Transform into another form',
    group: 'meta',
    valueType: 'ref',
    ops: ['set'],
    help: 'Become a different character or creature. The base sheet is preserved and restored when the effect ends.',
    rendersAt: 'Whole sheet (form overlay)',
  },
  {
    key: 'note',
    label: 'Note (DM adjudicates)',
    group: 'meta',
    valueType: 'text',
    ops: ['set'],
    // The honest escape hatch, and it must exist. An effect the engine cannot model should be
    // LABELLED as unmodelled — not faked with a number that looks authoritative. A wrong number on
    // a sheet is worse than a sentence saying "ask your DM".
    help: 'A mechanic the engine does not model. Shown on the sheet as text for the DM to rule on. Use this instead of approximating.',
    rendersAt: 'Active Effects panel · the affected element',
  },
];

/** Every target, in one registry. */
export const EFFECT_TARGETS: TargetDef[] = [
  ...abilityTargets,
  ...movementTargets,
  ...coreTargets,
  ...rollTargets,
  ...defenseTargets,
  ...grantTargets,
  ...identityTargets,
  ...instantTargets,
  ...stateTargets,
  ...economyTargets,
  ...metaTargets,
];

const BY_KEY = new Map(EFFECT_TARGETS.map((t) => [t.key, t]));

export const findTarget = (key: string): TargetDef | undefined => BY_KEY.get(key);
export const targetsInGroup = (g: TargetGroup): TargetDef[] => EFFECT_TARGETS.filter((t) => t.group === g);

export const TARGET_GROUP_LABELS: Record<TargetGroup, string> = {
  ability: 'Ability scores',
  movement: 'Movement',
  core: 'Core numbers',
  roll: 'Rolls',
  defense: 'Defenses',
  grant: 'Grants',
  identity: 'Identity',
  instant: 'Instant (fires once)',
  state: 'State',
  economy: 'Action economy',
  meta: 'Special',
};

/** Is this operation legal on this target? The builder offers only legal ops; this enforces it. */
export function isOperationAllowed(targetKey: string, op: EffectOperation): boolean {
  const t = BY_KEY.get(targetKey);
  return !!t && t.ops.includes(op);
}

export interface ValidationError {
  reason: string;
}

/**
 * Validate an effect against the registry.
 *
 * Refuses rather than coerces, on purpose. An item whose effect silently failed to parse is WORSE
 * than a rejected one: the player equips it, believes it works, and plays a character that isn't
 * real. A rejection is visible and fixable in ten seconds.
 */
export function validateEffect(e: { target?: unknown; operation?: unknown; value?: unknown }): ValidationError | null {
  if (typeof e?.target !== 'string') return { reason: 'An effect needs a target.' };
  const t = BY_KEY.get(e.target);
  if (!t) return { reason: `Unknown effect target "${e.target}". See lib/dnd/effects/targets.ts for the full list.` };
  if (typeof e.operation !== 'string') return { reason: `"${t.label}" needs an operation.` };
  if (!t.ops.includes(e.operation as EffectOperation)) {
    return { reason: `"${e.operation}" is not valid on "${t.label}". Allowed: ${t.ops.join(', ')}.` };
  }
  const needsNumber = t.valueType === 'number' && ['add', 'set', 'set_base'].includes(e.operation);
  if (needsNumber) {
    if (typeof e.value !== 'number' || !Number.isFinite(e.value)) {
      return { reason: `"${t.label}" needs a numeric value.` };
    }
    if (e.value < 0 && t.allowsNegative === false) {
      return { reason: `"${t.label}" cannot be negative.` };
    }
  }
  const needsText = ['text', 'damage_type', 'proficiency', 'sense', 'ref', 'dice'].includes(t.valueType);
  if (needsText && !['advantage', 'disadvantage'].includes(e.operation as string)) {
    if (typeof e.value !== 'string' || !e.value.trim()) return { reason: `"${t.label}" needs a value.` };
  }
  return null;
}

/**
 * A human-readable line for an effect, e.g. "+2 STR", "advantage on Stealth", "Resistance: fire".
 * Used by the builder preview, the Active Effects panel and the star tooltip — one renderer, so the
 * three can never describe the same effect differently.
 */
export function describeEffect(e: { target: string; operation: string; value?: number | string; condition?: string }): string {
  const t = BY_KEY.get(e.target);
  const label = t?.label ?? e.target;
  const cond = e.condition ? ` (while ${e.condition})` : '';
  const n = typeof e.value === 'number' ? e.value : 0;
  const signed = n >= 0 ? `+${n}` : `${n}`;
  switch (e.operation) {
    case 'add':
      // A dice-valued add (heal 2d4, +1d6 fire weapon dice) carries a string, not a number — render
      // the expression itself, not the "+0" a numeric read would produce.
      return `${typeof e.value === 'string' ? `+${e.value}` : signed} ${label}${cond}`;
    case 'set':
    case 'set_base':
      return t?.valueType === 'number' ? `${label} set to ${e.value}${cond}` : `${label}: ${e.value}${cond}`;
    case 'advantage':
      return `Advantage on ${label}${cond}`;
    case 'disadvantage':
      return `Disadvantage on ${label}${cond}`;
    case 'grant_proficiency':
      return `Proficiency: ${e.value}${cond}`;
    case 'resistance':
      return `Resistance: ${e.value}${cond}`;
    case 'immunity':
      return `Immunity: ${e.value}${cond}`;
    case 'vulnerability':
      return `Vulnerability: ${e.value}${cond}`;
    case 'condition_advantage':
      return `Advantage on saves vs ${e.value}${cond}`;
    default:
      return `${label}${cond}`;
  }
}
