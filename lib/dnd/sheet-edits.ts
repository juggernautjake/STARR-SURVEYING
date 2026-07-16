// lib/dnd/sheet-edits.ts — structured sheet edits (Phase I2). A small, validated edit
// vocabulary over the Character model (the shape stored in dnd_characters.data), plus
// a pure `applySheetEdits` and the Claude tool whose schema IS this vocabulary. The AI
// emits edits (via the tool); building a full sheet = many edits onto a blank one, and
// refining = edits onto the current one. Pure + typed so it's unit-tested and the API
// can trust the result before persisting.
import type Anthropic from '@anthropic-ai/sdk';
import type { Character, Attack, FeatureBlock, InvItem, Resource, CustomTag } from '@/app/dnd/_sheet/types';
import type { AbilityKey, ProfLevel } from '@/app/dnd/_sheet/rules/dnd';
import { validateCustomTag, RESERVED_TAGS } from '@/app/dnd/_sheet/components/ui/tagInfo';

export type SheetEdit =
  | { op: 'set_name'; value: string }
  | { op: 'set_meta'; field: 'kicker' | 'role' | 'species' | 'className' | 'subclass'; value: string }
  | { op: 'set_level'; value: number }
  | { op: 'set_ability'; ability: AbilityKey; value: number }
  | { op: 'set_save_proficient'; ability: AbilityKey; value: boolean }
  | { op: 'set_skill'; skill: string; prof: ProfLevel }
  | { op: 'set_combat'; field: 'ac' | 'maxHp' | 'currentHp' | 'speed'; value: number }
  | { op: 'add_attack'; name: string; ability: AbilityKey; damage: string; damageType?: string; proficient?: boolean; range?: string; bonusToHit?: number; bonusDamage?: number }
  | { op: 'remove_attack'; name: string }
  | { op: 'add_feature'; name: string; source?: string; body: string[] }
  | { op: 'remove_feature'; name: string }
  | { op: 'add_item'; name: string; desc?: string; qty?: number }
  | { op: 'remove_item'; name: string }
  | { op: 'add_resource'; name: string; max: number; color?: 'pink' | 'teal' | 'gold'; resetOn?: 'short' | 'long' }
  // Rename IN PLACE — change only the name, keep every other field. Without this the AI had to
  // remove + re-add to "rename" something, which dropped every field it wasn't re-supplied (a
  // Backless Park Bench renamed to Park Bench lost its ability → -NaN to-hit, and its tags). Match
  // by current name; `to` is the new name.
  | { op: 'rename_attack'; name: string; to: string }
  | { op: 'rename_feature'; name: string; to: string }
  | { op: 'rename_item'; name: string; to: string }
  // Custom tags (Slice 32). The AI can mint a tag WITH its definition (kept on the character) and
  // apply tags to an item. Same rules as the hand path: a definition is required, and the wiring
  // tags (weapon/consumable/equipped) are reserved. `define_tag` name = the tag, `desc` = its meaning.
  | { op: 'define_tag'; name: string; desc: string }
  | { op: 'tag_item'; name: string; tag: string };

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const clampAbility = (n: number) => Math.max(1, Math.min(30, Math.round(n)));
const eqName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A human-readable path for the audit row (dnd_sheet_edits.field_path). */
export function editPath(e: SheetEdit): string {
  switch (e.op) {
    case 'set_name': return 'meta.name';
    case 'set_meta': return `meta.${e.field}`;
    case 'set_level': return 'meta.level';
    case 'set_ability': return `abilities.${e.ability}`;
    case 'set_save_proficient': return `saves.${e.ability}.proficient`;
    case 'set_skill': return `skills.${e.skill}`;
    case 'set_combat': return `combat.${e.field}`;
    case 'add_attack': case 'remove_attack': case 'rename_attack': return `attacks[${slug(e.name)}]`;
    case 'add_feature': case 'remove_feature': case 'rename_feature': return `features[${slug(e.name)}]`;
    case 'add_item': case 'remove_item': case 'rename_item': case 'tag_item': return `inventory[${slug(e.name)}]`;
    case 'define_tag': return `customTags[${slug(e.name)}]`;
    case 'add_resource': return `resources[${slug(e.name)}]`;
  }
}

/** Apply a validated edit list to a Character, returning a new Character (pure). */
export function applySheetEdits(input: Character, edits: SheetEdit[]): Character {
  const c: Character = structuredClone(input);
  for (const e of edits) {
    // The AI may carry a payload in the semantic field (`name`/`proficient`) rather
    // than the generic `value`; read tolerantly so valid intents aren't dropped.
    const raw = e as unknown as Record<string, unknown>;
    switch (e.op) {
      case 'set_name': {
        const v = e.value ?? (raw.name as string | undefined);
        if (v != null) c.meta.name = String(v);
        break;
      }
      case 'set_meta': if (e.value != null) c.meta[e.field] = String(e.value); break;
      case 'set_level': c.meta.level = Math.max(1, Math.min(20, Math.round(e.value))); break;
      case 'set_ability':
        if (ABILITY_KEYS.includes(e.ability)) c.abilities[e.ability] = clampAbility(e.value);
        break;
      case 'set_save_proficient':
        if (ABILITY_KEYS.includes(e.ability)) {
          const v: unknown = e.value ?? raw.proficient;
          c.saves[e.ability] = { ...(c.saves[e.ability] ?? { misc: 0 }), proficient: v === true || v === 'true' };
        }
        break;
      case 'set_skill':
        c.skills[e.skill] = { ...(c.skills[e.skill] ?? { misc: 0 }), prof: e.prof };
        break;
      case 'set_combat': c.combat[e.field] = Math.max(0, Math.round(e.value)); break;
      case 'add_attack': {
        const atk: Attack = {
          id: `ai-atk-${slug(e.name)}`,
          name: e.name,
          ability: e.ability,
          proficient: e.proficient ?? true,
          range: e.range ?? 'melee',
          damage: e.damage,
          damageType: e.damageType ?? '',
          ...(e.bonusToHit != null ? { bonusToHit: e.bonusToHit } : {}),
          ...(e.bonusDamage != null ? { bonusDamage: e.bonusDamage } : {}),
        };
        c.attacks = [...c.attacks.filter((a) => !eqName(a.name, e.name)), atk];
        break;
      }
      case 'remove_attack': c.attacks = c.attacks.filter((a) => !eqName(a.name, e.name)); break;
      case 'rename_attack': {
        const to = (e.to ?? (raw.to as string | undefined) ?? '').trim();
        if (to) c.attacks = c.attacks.map((a) => (eqName(a.name, e.name) ? { ...a, name: to } : a));
        break;
      }
      case 'rename_feature': {
        const to = (e.to ?? (raw.to as string | undefined) ?? '').trim();
        if (to) c.features = c.features.map((f) => (eqName(f.name, e.name) ? { ...f, name: to } : f));
        break;
      }
      case 'rename_item': {
        const to = (e.to ?? (raw.to as string | undefined) ?? '').trim();
        if (to) c.inventory = c.inventory.map((i) => (eqName(i.name, e.name) ? { ...i, name: to } : i));
        break;
      }
      case 'define_tag': {
        // Same guard as the hand path: refuse an undefined tag or a reserved name rather than
        // coerce it — a silently-dropped or mechanics-shadowing tag is worse than a no-op.
        const existing = (c.customTags ?? []) as CustomTag[];
        if (validateCustomTag(e.name, e.desc ?? '', existing)) break;
        c.customTags = [...existing, { name: e.name.trim(), description: (e.desc ?? '').trim() }];
        break;
      }
      case 'tag_item': {
        const tag = String((e as { tag?: unknown }).tag ?? '').trim();
        // Never let the AI apply a reserved wiring tag by hand — those are derived from the item's
        // kind/equip state, not free-labelled.
        if (!tag || RESERVED_TAGS.includes(tag.toLowerCase())) break;
        c.inventory = c.inventory.map((i) =>
          eqName(i.name, e.name) && !(i.tags ?? []).includes(tag) ? { ...i, tags: [...(i.tags ?? []), tag] } : i,
        );
        break;
      }
      case 'add_feature': {
        const feat: FeatureBlock = { id: `ai-feat-${slug(e.name)}`, name: e.name, source: e.source ?? 'Feature', body: e.body };
        c.features = [...c.features.filter((f) => !eqName(f.name, e.name)), feat];
        break;
      }
      case 'remove_feature': c.features = c.features.filter((f) => !eqName(f.name, e.name)); break;
      case 'add_item': {
        const item: InvItem = { id: `ai-item-${slug(e.name)}`, name: e.name, desc: e.desc ?? '', qty: e.qty ?? 1, tags: [] };
        c.inventory = [...c.inventory.filter((i) => !eqName(i.name, e.name)), item];
        break;
      }
      case 'remove_item': c.inventory = c.inventory.filter((i) => !eqName(i.name, e.name)); break;
      case 'add_resource': {
        const res: Resource = { id: `ai-res-${slug(e.name)}`, name: e.name, max: Math.max(0, Math.round(e.max)), current: Math.max(0, Math.round(e.max)), color: e.color ?? 'teal', resetOn: e.resetOn ?? 'long' };
        c.resources = [...c.resources.filter((r) => !eqName(r.name, e.name)), res];
        break;
      }
    }
  }
  return c;
}

// The Claude tool whose schema is this edit vocabulary (permissive: `op` selects the
// meaning; applySheetEdits reads only the fields relevant to each op).
export const SHEET_EDIT_TOOL: Anthropic.Tool = {
  name: 'edit_sheet',
  description:
    'Apply a list of structured edits to a D&D character sheet. Emit one edit per change. ' +
    'To build a full character, emit edits for name, level, all six abilities, AC/HP/speed, ' +
    'save proficiencies, key skills, attacks, class/species features, and notable inventory. ' +
    'Abilities are raw scores (e.g. 16), not modifiers.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One sentence describing the change, for the edit log.' },
      unmapped: {
        type: 'array',
        items: { type: 'string' },
        description: 'When importing from source files: things you could NOT represent on the generic sheet (homebrew mechanics, unique resources, lore that has no field, unreadable content). One short bullet each; saved for the owner to review.',
      },
      questions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Design decisions you need the USER to resolve before the build is confident: anything missing, ambiguous, or CONFLICTING across the sources (e.g. two files disagree on a stat). Phrase each as a direct question. Leave empty in ruthless mode.',
      },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: ['set_name', 'set_meta', 'set_level', 'set_ability', 'set_save_proficient', 'set_skill', 'set_combat', 'add_attack', 'remove_attack', 'rename_attack', 'add_feature', 'remove_feature', 'rename_feature', 'add_item', 'remove_item', 'rename_item', 'add_resource', 'define_tag', 'tag_item'],
            },
            field: { type: 'string', description: 'For set_meta: kicker|role|species|className|subclass. For set_combat: ac|maxHp|currentHp|speed.' },
            to: { type: 'string', description: 'For rename_* ops: the NEW name. Renames keep every other field — use these to rename an attack/feature/item, never remove + re-add (that drops its stats).' },
            tag: { type: 'string', description: 'For tag_item: the tag to add to the item named by `name`. Must already be a built-in tag or one you defined with define_tag; weapon/consumable/equipped are reserved.' },
            ability: { type: 'string', enum: ABILITY_KEYS },
            skill: { type: 'string', description: 'Skill key, e.g. athletics, stealth, perception.' },
            prof: { type: 'string', enum: ['none', 'proficient', 'expertise'] },
            value: { description: 'String or number value for set_* ops.' },
            name: { type: 'string' },
            source: { type: 'string' },
            body: { type: 'array', items: { type: 'string' } },
            damage: { type: 'string', description: 'Dice expression, e.g. 2d6.' },
            damageType: { type: 'string' },
            proficient: { type: 'boolean' },
            range: { type: 'string' },
            bonusToHit: { type: 'number' },
            bonusDamage: { type: 'number' },
            desc: { type: 'string' },
            qty: { type: 'number' },
            max: { type: 'number' },
            color: { type: 'string', enum: ['pink', 'teal', 'gold'] },
            resetOn: { type: 'string', enum: ['short', 'long'] },
          },
          required: ['op'],
        },
      },
    },
    required: ['edits'],
  },
};
