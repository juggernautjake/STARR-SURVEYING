// lib/dnd/homebrew/kinds.ts — the KIND REGISTRY: what each buildable thing is, and what building it asks for.
//
// The owner's brief for the Content Studio: *"the user should first select what kind of thing they are
// homebrewing … as well as the system … Then depending on what they choose, the building options will
// totally adjust to allow them to have full control over every aspect."*
//
// This file IS that adjustment, expressed as data. Each kind declares a field schema; the builder UI renders
// whatever the schema says. So adding a new buildable kind is a data change here, never a new form component
// — which is the only way eighteen kinds × four systems stays maintainable.
//
// THREE THINGS THIS FILE IS CAREFUL ABOUT
//
//  1. **Prose is a valid outcome.** Not every kind can carry mechanics in every system: a `class` payload is
//     a 5e `ClassDefinition`, and Pathfinder 2e's class model is a different shape entirely. Rather than
//     pretend otherwise, each kind declares `mechanicalIn` — the systems where it produces an engine payload.
//     Everywhere else the piece is prose-only: still authored, still shared, still searchable, still in the
//     library, just not adopted as numbers. The builder SAYS SO on the form rather than silently dropping it.
//     (Ground Rule 3, applied to our own UI: never imply a rule is enforced when it isn't.)
//
//  2. **The payload contract is `adopt.ts`'s, not ours.** `validateHomebrewPayload` already decides what a
//     valid class/feat/effect payload is, and `adoptHomebrew` refuses anything that fails. Assemblers here
//     produce exactly those shapes so the authoring error and the adoption refusal can never disagree.
//
//  3. **Field keys are stable.** They are persisted inside `payload`, so renaming one silently orphans every
//     saved draft. Treat them as a schema.
import { ABILITIES, SKILLS } from '@/app/dnd/_sheet/rules/dnd';
import { EFFECT_TARGETS } from '@/lib/dnd/effects/targets';
import { HOMEBREW_KINDS, homebrewKindLabel, type HomebrewKind } from './model';
import { normalizeSystem, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems';

// ── field vocabulary ────────────────────────────────────────────────────────────────────────────────

/** The widget a field renders as. `list` repeats a sub-schema; `levels` is the level-by-level editor. */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'tags'
  | 'dice'        // a dice expression, e.g. "2d6+3"
  | 'abilities'   // pick one or more of STR..CHA
  | 'skills'      // pick one or more skills
  | 'effects'     // the engine Effect[] editor — the thing that makes homebrew MOVE NUMBERS
  | 'levels'      // level-by-level features (the class studio)
  | 'statblock'   // the creature stat grid
  | 'image'
  | 'list';       // repeating group of sub-fields

export interface FieldOption {
  value: string;
  label: string;
  /** Shown under the option in the picker — used heavily by the kind picker itself. */
  hint?: string;
}

export interface FieldSpec {
  /** Persisted inside `payload` — stable, never rename. */
  key: string;
  label: string;
  type: FieldType;
  /** One line under the label. Say what the field MEANS, not what to type. */
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** `select` / `multiselect` options. */
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  /** Sensible starting value, applied when a fresh draft is created. */
  default?: unknown;
  /** `list` only — the sub-schema each row renders. */
  fields?: FieldSpec[];
  /** Group heading this field sits under in the form. Fields with no section come first. */
  section?: string;
  /** Only show this field when another field has one of these values (simple, one-hop conditionality). */
  showWhen?: { key: string; equals: readonly string[] };
}

// ── shared option lists ─────────────────────────────────────────────────────────────────────────────

const abilityOptions: FieldOption[] = ABILITIES.map((a) => ({ value: a.key, label: a.full }));
const skillOptions: FieldOption[] = SKILLS.map((s) => ({ value: s.key, label: s.label }));

/** Effect targets, grouped label-side so the picker reads as the engine's own vocabulary. */
export const effectTargetOptions: FieldOption[] = EFFECT_TARGETS.map((t) => ({
  value: t.key,
  label: t.label,
  hint: t.help,
}));

const RARITY: FieldOption[] = [
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'very-rare', label: 'Very rare' },
  { value: 'legendary', label: 'Legendary' },
  { value: 'artifact', label: 'Artifact' },
];

const ACTION_COST: FieldOption[] = [
  { value: 'action', label: 'Action' },
  { value: 'bonus', label: 'Bonus action' },
  { value: 'reaction', label: 'Reaction' },
  { value: 'free', label: 'Free' },
  { value: '1', label: '1 action (PF2)', hint: 'Pathfinder 2e / Intuitive Games three-action economy' },
  { value: '2', label: '2 actions (PF2)' },
  { value: '3', label: '3 actions (PF2)' },
  { value: 'passive', label: 'Passive / always on' },
];

const FEAT_CATEGORY: FieldOption[] = [
  { value: 'origin', label: 'Origin', hint: 'Taken at character creation from your background.' },
  { value: 'general', label: 'General', hint: 'Taken at an ASI slot; usually grants +1 to an ability.' },
  { value: 'fighting-style', label: 'Fighting style', hint: 'Offered where a class grants a fighting style.' },
  { value: 'epic-boon', label: 'Epic boon', hint: 'Level 19+ only.' },
];

const CASTER: FieldOption[] = [
  { value: 'none', label: 'Not a spellcaster' },
  { value: 'full', label: 'Full caster', hint: 'Bard / Cleric / Druid / Sorcerer / Wizard progression.' },
  { value: 'half', label: 'Half caster', hint: 'Paladin / Ranger — slots from level 2.' },
  { value: 'third', label: 'Third caster', hint: 'Eldritch Knight / Arcane Trickster — slots from level 3.' },
  { value: 'pact', label: 'Pact magic', hint: 'Warlock — few slots, all at your highest rank, back on a short rest.' },
];

const CREATURE_SIZE: FieldOption[] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
  .map((s) => ({ value: s.toLowerCase(), label: s }));

// ── the fields nearly everything shares ─────────────────────────────────────────────────────────────

/** Identity fields every kind carries. Held separately from `KindSpec.fields` so a kind's schema is only
 *  the part that makes it *that kind of thing* — which is what makes the registry readable. */
export const COMMON_FIELDS: FieldSpec[] = [
  { key: 'summary', label: 'One-line summary', type: 'text', required: true, section: 'Identity',
    help: 'The line that shows on the card and in search results.', placeholder: 'A bare-knuckle brawler powered by sheer momentum.' },
  { key: 'description', label: 'Full rules text', type: 'textarea', required: true, section: 'Identity',
    help: 'Everything a player needs to use it. Markdown-lite: **bold**, and "· " for bullets.' },
  { key: 'tags', label: 'Tags', type: 'tags', section: 'Identity',
    help: 'Free-form labels that make it findable — theme, source, campaign.' },
  { key: 'image', label: 'Artwork', type: 'image', section: 'Identity',
    help: 'Shown on the card, the statblock and the library entry.' },
];

/** The effects editor — the field that turns prose into numbers the sheet actually resolves. */
const EFFECTS_FIELD: FieldSpec = {
  key: 'effects', label: 'Mechanical effects', type: 'effects', section: 'Mechanics',
  help: 'What this actually DOES to a sheet. Each row is one engine effect — leave empty for prose-only content.',
};

// ── the kind registry ───────────────────────────────────────────────────────────────────────────────

/** The picker's top-level grouping. */
export type KindGroup = 'Gear' | 'Magic & powers' | 'Character options' | 'World';

export const KIND_GROUPS: readonly KindGroup[] = ['Gear', 'Magic & powers', 'Character options', 'World'];

export interface KindSpec {
  kind: HomebrewKind;
  group: KindGroup;
  /** A glyph for the picker card. The hextech UI uses geometric marks, not emoji, in chrome. */
  icon: string;
  /** One line on the picker card: what this kind IS. */
  blurb: string;
  /** The systems where this kind assembles a real engine payload. `'*'` = every system.
   *  Anywhere else the piece is authored as prose — shareable and searchable, but not adopted as numbers. */
  mechanicalIn: readonly string[] | '*';
  /**
   * The systems this kind is a CONCEPT in at all. Omitted = every system.
   *
   * Distinct from `mechanicalIn`, and the distinction is the whole point of the coverage matrix (P12-1):
   * "we have not built the bridge yet" and "this system has no such thing" look identical from
   * `mechanicalIn` alone, and conflating them invents work. A Stance is Intuitive Games' signature
   * mechanic — its own blurb says so — so a 5e Stance is not an unbuilt bridge, it is a category error.
   * A Feat in Pathfinder 2e, by contrast, is very much a thing we simply do not resolve yet.
   */
  nativeTo?: readonly string[];
  /** May this kind be scoped to `'any'` (all systems at once)? True only where the mechanics are prose,
   *  because an `'any'` class is not a meaningful object — every engine's class model differs. */
  allowAnySystem: boolean;
  /** The kind-specific schema, rendered after COMMON_FIELDS. */
  fields: FieldSpec[];
}

const FIVE_E = ['dnd5e-2014', 'dnd5e-2024'] as const;

const SPECS: Record<HomebrewKind, KindSpec> = {
  // ── Gear ──────────────────────────────────────────────────────────────────────────────────────
  weapon: {
    kind: 'weapon', group: 'Gear', icon: '⚔', allowAnySystem: false, mechanicalIn: '*',
    blurb: 'A weapon with damage, properties and any magic it carries.',
    fields: [
      { key: 'damage', label: 'Damage', type: 'dice', required: true, section: 'Mechanics', placeholder: '1d8', help: 'The damage dice on a hit.' },
      { key: 'damageType', label: 'Damage type', type: 'text', section: 'Mechanics', placeholder: 'slashing' },
      { key: 'properties', label: 'Properties', type: 'tags', section: 'Mechanics', help: 'finesse · versatile (1d10) · thrown (20/60) · two-handed …' },
      { key: 'range', label: 'Range', type: 'text', section: 'Mechanics', placeholder: '5 ft, or 20/60 thrown' },
      { key: 'rarity', label: 'Rarity', type: 'select', options: RARITY, section: 'Mechanics' },
      { key: 'attunement', label: 'Requires attunement', type: 'select', section: 'Mechanics',
        options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }], default: 'no' },
      { key: 'weight', label: 'Weight / Bulk', type: 'number', min: 0, step: 0.1, section: 'Mechanics' },
      EFFECTS_FIELD,
    ],
  },
  armor: {
    kind: 'armor', group: 'Gear', icon: '⛨', allowAnySystem: false, mechanicalIn: '*',
    blurb: 'Armour or a shield — base AC, category and any Dex cap.',
    fields: [
      { key: 'baseAc', label: 'Base AC', type: 'number', required: true, min: 0, max: 30, section: 'Mechanics' },
      { key: 'category', label: 'Category', type: 'select', section: 'Mechanics', options: [
        { value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' },
        { value: 'heavy', label: 'Heavy' }, { value: 'shield', label: 'Shield' }] },
      { key: 'dexCap', label: 'Dex cap', type: 'number', min: 0, max: 10, section: 'Mechanics',
        help: 'Leave blank for no cap (light armour / unarmoured).' },
      { key: 'strengthRequirement', label: 'Strength requirement', type: 'number', min: 0, max: 30, section: 'Mechanics' },
      { key: 'stealthDisadvantage', label: 'Stealth disadvantage', type: 'select', section: 'Mechanics',
        options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }], default: 'no' },
      { key: 'rarity', label: 'Rarity', type: 'select', options: RARITY, section: 'Mechanics' },
      { key: 'weight', label: 'Weight / Bulk', type: 'number', min: 0, step: 0.1, section: 'Mechanics' },
      EFFECTS_FIELD,
    ],
  },
  item: {
    kind: 'item', group: 'Gear', icon: '❖', allowAnySystem: true, mechanicalIn: '*',
    blurb: 'Any other piece of gear — a wondrous item, a tool, a trinket.',
    fields: [
      { key: 'rarity', label: 'Rarity', type: 'select', options: RARITY, section: 'Mechanics' },
      { key: 'attunement', label: 'Requires attunement', type: 'select', section: 'Mechanics',
        options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }], default: 'no' },
      { key: 'charges', label: 'Charges', type: 'number', min: 0, section: 'Mechanics',
        help: 'Leave blank if it has none.' },
      { key: 'recharge', label: 'Recharges on', type: 'select', section: 'Mechanics', options: [
        { value: '', label: '—' }, { value: 'dawn', label: 'Dawn' },
        { value: 'short', label: 'Short rest' }, { value: 'long', label: 'Long rest' }] },
      { key: 'weight', label: 'Weight / Bulk', type: 'number', min: 0, step: 0.1, section: 'Mechanics' },
      EFFECTS_FIELD,
    ],
  },
  potion: {
    kind: 'potion', group: 'Gear', icon: '⚗', allowAnySystem: true, mechanicalIn: '*',
    blurb: 'A consumable — one use, then it is gone.',
    fields: [
      { key: 'rarity', label: 'Rarity', type: 'select', options: RARITY, section: 'Mechanics' },
      { key: 'duration', label: 'Duration', type: 'text', section: 'Mechanics', placeholder: '1 hour' },
      { key: 'healing', label: 'Healing', type: 'dice', section: 'Mechanics', placeholder: '2d4+2' },
      EFFECTS_FIELD,
    ],
  },

  // ── Magic & powers ────────────────────────────────────────────────────────────────────────────
  spell: {
    kind: 'spell', group: 'Magic & powers', icon: '✨', allowAnySystem: false, mechanicalIn: '*',
    blurb: 'A spell — level, casting time, range, components, duration.',
    fields: [
      { key: 'level', label: 'Level / rank', type: 'number', required: true, min: 0, max: 10, section: 'Mechanics',
        help: '0 = cantrip.' },
      { key: 'school', label: 'School / tradition', type: 'text', section: 'Mechanics', placeholder: 'evocation' },
      { key: 'castingTime', label: 'Casting time', type: 'select', options: ACTION_COST, section: 'Mechanics' },
      { key: 'range', label: 'Range', type: 'text', section: 'Mechanics', placeholder: '60 feet' },
      { key: 'components', label: 'Components', type: 'tags', section: 'Mechanics', help: 'V · S · M (a pinch of soot)' },
      { key: 'duration', label: 'Duration', type: 'text', section: 'Mechanics', placeholder: 'Concentration, up to 1 minute' },
      { key: 'damage', label: 'Damage / healing', type: 'dice', section: 'Mechanics', placeholder: '3d6' },
      { key: 'save', label: 'Saving throw', type: 'text', section: 'Mechanics', placeholder: 'Dexterity, half on a success' },
      { key: 'higherLevels', label: 'At higher levels', type: 'textarea', section: 'Mechanics' },
      EFFECTS_FIELD,
    ],
  },
  stance: {
    // `nativeTo` matches `mechanicalIn` here: a stance is not a 5e or PF2 concept at all, so those cells
    // are N/A on the coverage matrix rather than gaps waiting to be closed.
    kind: 'stance', group: 'Magic & powers', icon: '◈', allowAnySystem: false, mechanicalIn: ['intuitive-games'],
    nativeTo: ['intuitive-games'],
    blurb: 'A stance you enter and hold — Intuitive Games’ signature mechanic.',
    fields: [
      { key: 'enterCost', label: 'Cost to enter', type: 'select', options: ACTION_COST, section: 'Mechanics' },
      { key: 'requirement', label: 'Requirement', type: 'text', section: 'Mechanics', placeholder: 'Wielding a melee weapon' },
      { key: 'improved', label: 'Improved version', type: 'textarea', section: 'Mechanics',
        help: 'What the stance gains when it improves at higher levels.' },
      EFFECTS_FIELD,
    ],
  },
  effect: {
    kind: 'effect', group: 'Magic & powers', icon: '✧', allowAnySystem: true, mechanicalIn: '*',
    blurb: 'A bare bundle of mechanical effects — a buff, a curse, an aura.',
    fields: [
      { key: 'duration', label: 'Duration', type: 'text', section: 'Mechanics', placeholder: '1 minute' },
      { key: 'ends', label: 'Ends when', type: 'text', section: 'Mechanics', placeholder: 'You are incapacitated' },
      { ...EFFECTS_FIELD, required: true },
    ],
  },
  action: {
    kind: 'action', group: 'Magic & powers', icon: '➤', allowAnySystem: true, mechanicalIn: '*',
    blurb: 'Something a creature or character can DO on its turn.',
    fields: [
      { key: 'cost', label: 'Action cost', type: 'select', options: ACTION_COST, required: true, section: 'Mechanics' },
      { key: 'traits', label: 'Traits', type: 'tags', section: 'Mechanics' },
      { key: 'trigger', label: 'Trigger', type: 'text', section: 'Mechanics',
        help: 'Reactions only — what sets it off.', showWhen: { key: 'cost', equals: ['reaction'] } },
      { key: 'attack', label: 'Attack bonus', type: 'text', section: 'Mechanics', placeholder: '+7' },
      { key: 'damage', label: 'Damage', type: 'dice', section: 'Mechanics', placeholder: '2d6+4' },
      { key: 'uses', label: 'Uses', type: 'text', section: 'Mechanics', placeholder: 'Recharge 5–6, or 3/day' },
      EFFECTS_FIELD,
    ],
  },

  // ── Character options ─────────────────────────────────────────────────────────────────────────
  ability: {
    kind: 'ability', group: 'Character options', icon: '◇', allowAnySystem: true, mechanicalIn: '*',
    blurb: 'A class or species ability — something a character just has.',
    fields: [
      { key: 'cost', label: 'Action cost', type: 'select', options: ACTION_COST, section: 'Mechanics' },
      { key: 'uses', label: 'Uses', type: 'text', section: 'Mechanics', placeholder: 'Twice per long rest' },
      { key: 'recharge', label: 'Recharges on', type: 'select', section: 'Mechanics', options: [
        { value: '', label: '—' }, { value: 'short', label: 'Short rest' }, { value: 'long', label: 'Long rest' }] },
      EFFECTS_FIELD,
    ],
  },
  skill: {
    kind: 'skill', group: 'Character options', icon: '◆', allowAnySystem: true, mechanicalIn: '*',
    blurb: 'A new skill, with the ability it keys off.',
    fields: [
      { key: 'ability', label: 'Governing ability', type: 'abilities', required: true, section: 'Mechanics',
        options: abilityOptions, help: 'Which ability modifier this skill adds.' },
      { key: 'usage', label: 'What you roll it for', type: 'textarea', section: 'Mechanics' },
      EFFECTS_FIELD,
    ],
  },
  feat: {
    kind: 'feat', group: 'Character options', icon: '✧', allowAnySystem: false, mechanicalIn: FIVE_E,
    blurb: 'A feat taken at a choice point — the most-adopted kind of homebrew.',
    fields: [
      { key: 'category', label: 'Category', type: 'select', options: FEAT_CATEGORY, required: true, section: 'Mechanics',
        default: 'general', help: 'Which slot this feat can be taken at.' },
      { key: 'prerequisite', label: 'Prerequisite', type: 'text', section: 'Mechanics', placeholder: 'Level 4+, Strength 13+' },
      { key: 'abilityIncrease', label: 'Ability increase', type: 'abilities', options: abilityOptions, section: 'Mechanics',
        help: 'Most General feats grant +1 to one of a short list. Leave empty for none.' },
      { key: 'repeatable', label: 'Repeatable', type: 'select', section: 'Mechanics',
        options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }], default: 'no' },
      EFFECTS_FIELD,
    ],
  },
  background: {
    kind: 'background', group: 'Character options', icon: '❯', allowAnySystem: true, mechanicalIn: FIVE_E,
    blurb: 'Where a character came from — skills, tools, and a feature.',
    fields: [
      { key: 'abilityIncreases', label: 'Ability increases', type: 'abilities', options: abilityOptions, section: 'Mechanics',
        help: '2024 backgrounds grant +2/+1 or +1/+1/+1 across a chosen three.' },
      { key: 'skills', label: 'Skill proficiencies', type: 'skills', options: skillOptions, section: 'Mechanics' },
      { key: 'tools', label: 'Tool proficiencies', type: 'tags', section: 'Mechanics' },
      { key: 'languages', label: 'Languages', type: 'tags', section: 'Mechanics' },
      { key: 'equipment', label: 'Starting equipment', type: 'tags', section: 'Mechanics' },
      { key: 'featureName', label: 'Background feature', type: 'text', section: 'Mechanics' },
      { key: 'featureBody', label: 'What the feature does', type: 'textarea', section: 'Mechanics' },
      EFFECTS_FIELD,
    ],
  },
  race: {
    kind: 'race', group: 'Character options', icon: '☘', allowAnySystem: true, mechanicalIn: '*',
    blurb: 'A species / ancestry — size, speed, senses and traits.',
    fields: [
      { key: 'size', label: 'Size', type: 'select', options: CREATURE_SIZE, section: 'Mechanics', default: 'medium' },
      { key: 'speed', label: 'Speed (ft)', type: 'number', min: 0, max: 200, step: 5, section: 'Mechanics', default: 30 },
      { key: 'senses', label: 'Senses', type: 'tags', section: 'Mechanics', help: 'darkvision 60 ft · tremorsense 10 ft' },
      { key: 'languages', label: 'Languages', type: 'tags', section: 'Mechanics' },
      { key: 'lineages', label: 'Lineages / heritages', type: 'list', section: 'Traits',
        help: 'Sub-options a player picks between, if this species has any.',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'body', label: 'What it grants', type: 'textarea' },
        ] },
      { key: 'traits', label: 'Traits', type: 'list', section: 'Traits',
        help: 'Each trait the species grants, in the order they should read on the sheet.',
        fields: [
          { key: 'name', label: 'Trait', type: 'text', required: true },
          { key: 'body', label: 'What it does', type: 'textarea', required: true },
        ] },
      EFFECTS_FIELD,
    ],
  },
  class: {
    kind: 'class', group: 'Character options', icon: '✦', allowAnySystem: false, mechanicalIn: FIVE_E,
    blurb: 'A full class, built level by level. Start from an existing class or from nothing.',
    fields: [
      { key: 'basedOn', label: 'Based on', type: 'select', section: 'Foundation', options: [],
        help: 'Start from an existing class and modify it, or leave blank to build from scratch. Recorded for the DM either way.' },
      { key: 'hitDie', label: 'Hit die', type: 'select', section: 'Foundation', required: true, default: '8',
        options: [6, 8, 10, 12].map((d) => ({ value: String(d), label: `d${d}` })) },
      { key: 'primaryAbility', label: 'Primary ability', type: 'abilities', options: abilityOptions, required: true, section: 'Foundation' },
      { key: 'savingThrows', label: 'Saving throw proficiencies', type: 'abilities', options: abilityOptions, required: true, section: 'Foundation',
        help: 'Two, by convention.' },
      { key: 'skillCount', label: 'Number of skills', type: 'number', min: 0, max: 8, default: 2, section: 'Foundation' },
      { key: 'skillChoices', label: 'Chosen from', type: 'skills', options: skillOptions, section: 'Foundation' },
      { key: 'armorProficiencies', label: 'Armour proficiencies', type: 'tags', section: 'Foundation' },
      { key: 'weaponProficiencies', label: 'Weapon proficiencies', type: 'tags', section: 'Foundation' },
      { key: 'startingEquipment', label: 'Starting equipment', type: 'tags', section: 'Foundation' },
      { key: 'subclassLevel', label: 'Subclass at level', type: 'number', min: 1, max: 20, default: 3, section: 'Foundation' },
      { key: 'subclassLabel', label: 'Subclass called', type: 'text', section: 'Foundation', placeholder: 'Fight Club, Circle, Oath…' },
      { key: 'caster', label: 'Spellcasting', type: 'select', options: CASTER, default: 'none', section: 'Foundation' },
      { key: 'casterAbility', label: 'Spellcasting ability', type: 'abilities', options: abilityOptions, section: 'Foundation',
        showWhen: { key: 'caster', equals: ['full', 'half', 'third', 'pact'] } },
      { key: 'asiLevels', label: 'Ability score improvements at', type: 'tags', section: 'Foundation',
        default: ['4', '8', '12', '16'], help: 'The levels that grant an ASI or a feat.' },
      { key: 'resources', label: 'Tracked resources', type: 'list', section: 'Foundation',
        help: 'Rage, Ki, Moxie — anything that has a pool and refreshes on a rest.',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'resetOn', label: 'Refreshes on', type: 'select', options: [
            { value: 'short', label: 'Short rest' }, { value: 'long', label: 'Long rest' }], default: 'long' },
          { key: 'perLevel', label: 'Amount per level', type: 'text', help: 'Comma-separated from level 1, e.g. 2,2,3,3,3' },
          { key: 'note', label: 'Note', type: 'text' },
        ] },
      { key: 'levels', label: 'Level by level', type: 'levels', section: 'Levels',
        help: 'What the class gains at each level. Build as far as you like and save — anything short of 20 is marked PARTIAL, not broken.' },
    ],
  },
  subclass: {
    kind: 'subclass', group: 'Character options', icon: '✧', allowAnySystem: false, mechanicalIn: FIVE_E,
    blurb: 'A subclass for an existing or homebrew class.',
    fields: [
      { key: 'parentClass', label: 'Subclass of', type: 'text', required: true, section: 'Foundation',
        help: 'The class this belongs to — official or homebrew.' },
      { key: 'levels', label: 'Level by level', type: 'levels', section: 'Levels',
        help: 'The levels this subclass grants features at. Usually 3 / 6 / 10 / 14 in 5e 2024.' },
    ],
  },

  // ── World ─────────────────────────────────────────────────────────────────────────────────────
  creature: {
    kind: 'creature', group: 'World', icon: '☠', allowAnySystem: false, mechanicalIn: '*',
    blurb: 'A monster or NPC with a full statblock — and its artwork.',
    fields: [
      { key: 'statblock', label: 'Statblock', type: 'statblock', required: true, section: 'Statblock',
        help: 'The core numbers. Everything here renders into a proper statblock beside your art.' },
      { key: 'size', label: 'Size', type: 'select', options: CREATURE_SIZE, section: 'Statblock', default: 'medium' },
      { key: 'creatureType', label: 'Type', type: 'text', section: 'Statblock', placeholder: 'aberration, undead, beast…' },
      { key: 'alignment', label: 'Alignment', type: 'text', section: 'Statblock' },
      { key: 'cr', label: 'CR / Level', type: 'text', section: 'Statblock', placeholder: '5, or 1/4' },
      { key: 'senses', label: 'Senses', type: 'tags', section: 'Statblock' },
      { key: 'languages', label: 'Languages', type: 'tags', section: 'Statblock' },
      { key: 'resistances', label: 'Resistances / immunities', type: 'tags', section: 'Statblock' },
      { key: 'traits', label: 'Traits', type: 'list', section: 'Abilities',
        fields: [
          { key: 'name', label: 'Trait', type: 'text', required: true },
          { key: 'body', label: 'What it does', type: 'textarea', required: true },
        ] },
      { key: 'actions', label: 'Actions', type: 'list', section: 'Abilities',
        fields: [
          { key: 'name', label: 'Action', type: 'text', required: true },
          { key: 'cost', label: 'Cost', type: 'select', options: ACTION_COST, default: 'action' },
          { key: 'attack', label: 'Attack bonus', type: 'text', placeholder: '+7' },
          { key: 'damage', label: 'Damage', type: 'dice', placeholder: '2d6+4 slashing' },
          { key: 'body', label: 'Description', type: 'textarea' },
        ] },
      { key: 'reactions', label: 'Reactions', type: 'list', section: 'Abilities',
        fields: [
          { key: 'name', label: 'Reaction', type: 'text', required: true },
          { key: 'trigger', label: 'Trigger', type: 'text' },
          { key: 'body', label: 'Effect', type: 'textarea', required: true },
        ] },
      { key: 'legendary', label: 'Legendary actions', type: 'list', section: 'Abilities',
        fields: [
          { key: 'name', label: 'Action', type: 'text', required: true },
          { key: 'cost', label: 'Costs', type: 'number', min: 1, max: 3, default: 1 },
          { key: 'body', label: 'Effect', type: 'textarea', required: true },
        ] },
      EFFECTS_FIELD,
    ],
  },
  condition: {
    kind: 'condition', group: 'World', icon: '⚠', allowAnySystem: true, mechanicalIn: '*',
    blurb: 'A status a creature can be under.',
    fields: [
      { key: 'ends', label: 'Ends when', type: 'text', required: true, section: 'Mechanics',
        placeholder: 'You finish a long rest, or a DC 14 CON save at the end of your turn' },
      { key: 'stacks', label: 'Has levels / stacks', type: 'select', section: 'Mechanics',
        options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }], default: 'no',
        help: 'Like exhaustion or PF2’s value-carrying conditions.' },
      EFFECTS_FIELD,
    ],
  },
  rule: {
    kind: 'rule', group: 'World', icon: '§', allowAnySystem: true, mechanicalIn: [],
    blurb: 'A house rule or a subsystem — prose that belongs in the library.',
    fields: [
      { key: 'appliesTo', label: 'Applies to', type: 'text', section: 'Mechanics',
        placeholder: 'Combat · downtime · travel' },
      { key: 'replaces', label: 'Replaces', type: 'text', section: 'Mechanics',
        help: 'The official rule this overrides, if any.' },
    ],
  },
};

// ── lookups ─────────────────────────────────────────────────────────────────────────────────────────

/** The spec for a kind. Total over `HomebrewKind`, so this never returns undefined for a valid kind. */
export function kindSpec(kind: HomebrewKind): KindSpec {
  return SPECS[kind];
}

/** Every spec, in picker order. */
export function allKindSpecs(): KindSpec[] {
  return HOMEBREW_KINDS.map((k) => SPECS[k]);
}

/** The specs in one picker group. */
export function kindsInGroup(group: KindGroup): KindSpec[] {
  return allKindSpecs().filter((s) => s.group === group);
}

/**
 * Does this kind produce a real engine payload in this system?
 *
 * `false` does NOT mean "cannot be authored" — it means the piece is prose: shareable, searchable, in the
 * library, on the creator's page, but not adopted onto a sheet as numbers. The builder says so plainly
 * rather than letting an author believe their PF2 class will level.
 */
export function kindIsMechanicalIn(kind: HomebrewKind, system: string): boolean {
  const spec = SPECS[kind];
  if (spec.mechanicalIn === '*') return true;
  return (spec.mechanicalIn as readonly string[]).includes(normalizeSystem(system));
}

/** The honest one-liner the builder shows when a kind is prose-only in the chosen system. Null when it
 *  is mechanical (nothing to warn about). */
export function proseOnlyNotice(kind: HomebrewKind, system: string): string | null {
  if (kindIsMechanicalIn(kind, system)) return null;
  const spec = SPECS[kind];
  const label = homebrewKindLabel(kind).toLowerCase();
  if (spec.mechanicalIn === '*' || (spec.mechanicalIn as readonly string[]).length === 0) {
    return `A ${label} is written as rules text — it will appear in the library and can be shared, but it is not adopted onto a sheet as numbers.`;
  }
  return `This system does not yet have an engine bridge for a ${label}, so it will be saved as rules text: shareable and in the library, but not resolved on a sheet. You can still write every mechanic out in full.`;
}

/** The full ordered field list the builder renders for a kind: identity first, then the kind's own schema. */
export function fieldsForKind(kind: HomebrewKind): FieldSpec[] {
  return [...COMMON_FIELDS, ...SPECS[kind].fields];
}

/** The distinct section headings for a kind, in first-appearance order. Fields with no section sort first
 *  under an empty heading. */
export function sectionsForKind(kind: HomebrewKind): string[] {
  const seen: string[] = [];
  for (const f of fieldsForKind(kind)) {
    const s = f.section ?? '';
    if (!seen.includes(s)) seen.push(s);
  }
  return seen;
}

/** A blank draft for a kind: every field with a declared default, and nothing else. Keeps "new draft" and
 *  "the schema" from drifting — the form never invents a starting value the registry didn't declare. */
export function blankDraftFor(kind: HomebrewKind): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fieldsForKind(kind)) {
    if (f.default !== undefined) out[f.key] = f.default;
  }
  return out;
}

/**
 * Which systems a kind may be scoped to. Always the four playable systems; plus `'any'` where the kind
 * allows it. Deliberately derived from `availableSystems()` at the call site rather than hard-coded, so a
 * system flipping to 'available' lights this up with no change here.
 */
export function systemChoicesForKind(
  kind: HomebrewKind,
  available: readonly { key: string; name: string }[],
): FieldOption[] {
  const out: FieldOption[] = available.map((s) => ({
    value: s.key,
    label: s.name,
    hint: kindIsMechanicalIn(kind, s.key) ? 'Full mechanical support' : 'Rules text only',
  }));
  if (SPECS[kind].allowAnySystem) {
    out.push({ value: 'any', label: 'Any system', hint: 'Appears in every system’s library — write the mechanics as text.' });
  }
  return out;
}

/**
 * Author-time field validation against the schema — the problems the form shows before a save is allowed.
 * Identity/payload validation lives in `model.ts` / `adopt.ts`; this is the per-kind layer between them,
 * and it only ever checks what the registry actually declares (`required`, `min`, `max`).
 */
export function validateDraftFields(kind: HomebrewKind, values: Record<string, unknown>): string[] {
  const errs: string[] = [];
  for (const f of fieldsForKind(kind)) {
    // A hidden field is not a required field — `showWhen` gates presence, so it must gate the check too.
    if (f.showWhen) {
      const gate = values[f.showWhen.key];
      if (!f.showWhen.equals.includes(String(gate ?? ''))) continue;
    }
    const v = values[f.key];
    if (f.required) {
      const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) errs.push(`${f.label} is required.`);
    }
    if (typeof v === 'number') {
      if (f.min != null && v < f.min) errs.push(`${f.label} must be at least ${f.min}.`);
      if (f.max != null && v > f.max) errs.push(`${f.label} must be at most ${f.max}.`);
    }
  }
  return errs;
}

/**
 * How complete is this draft? Drives the PARTIAL badge and the "you can save whenever" promise: a class
 * built to level 5 reports 5, and the studio shows it as partial rather than as an error.
 *
 * Returns null for kinds that have no level dimension — completeness there is just the required fields.
 */
export function draftLevelReach(kind: HomebrewKind, values: Record<string, unknown>): number | null {
  if (kind !== 'class' && kind !== 'subclass') return null;
  const levels = values.levels;
  if (!Array.isArray(levels)) return 0;
  let max = 0;
  for (const row of levels) {
    if (!row || typeof row !== 'object') continue;
    const lv = Number((row as { level?: unknown }).level);
    if (Number.isFinite(lv) && lv > max) max = lv;
  }
  return max;
}

/** A class/subclass is partial until it reaches level 20. Anything else is partial only while a required
 *  field is missing — which `validateDraftFields` already reports, so this stays about LEVELS. */
export function isPartialBuild(kind: HomebrewKind, values: Record<string, unknown>): boolean {
  const reach = draftLevelReach(kind, values);
  return reach !== null && reach < 20;
}

/** The system value to store when the author picked "any" — kept here so the studio and the model agree on
 *  the sentinel rather than each spelling it. */
export function normalizeContentSystem(kind: HomebrewKind, raw: unknown): string {
  const v = String(raw ?? '').trim();
  if (v === 'any' && SPECS[kind].allowAnySystem) return 'any';
  const norm = normalizeSystem(v);
  return norm === SYSTEM_AMBIGUOUS ? 'any' : norm;
}
