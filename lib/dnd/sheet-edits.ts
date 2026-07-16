// lib/dnd/sheet-edits.ts — structured sheet edits (Phase I2). A small, validated edit
// vocabulary over the Character model (the shape stored in dnd_characters.data), plus
// a pure `applySheetEdits` and the Claude tool whose schema IS this vocabulary. The AI
// emits edits (via the tool); building a full sheet = many edits onto a blank one, and
// refining = edits onto the current one. Pure + typed so it's unit-tested and the API
// can trust the result before persisting.
import type Anthropic from '@anthropic-ai/sdk';
import type { Character, Attack, FeatureBlock, InvItem, Resource, CustomTag, ItemKind, WeaponStats, ArmorStats, ConsumableStats, Spell } from '@/app/dnd/_sheet/types';
// (Resource is imported above; used by ItemPayload.grantsResource.)
import type { Effect } from '@/app/dnd/_sheet/engine/effects';
import type { AbilityKey, ProfLevel } from '@/app/dnd/_sheet/rules/dnd';
import { validateCustomTag, RESERVED_TAGS } from '@/app/dnd/_sheet/components/ui/tagInfo';
import { validateEffect } from '@/lib/dnd/effects/targets';

/** The full set of fields an item edit can carry (Slice 14). Shared by add_item + update_item so
 *  the AI authors and refines an item through the SAME shape — a generated item is indistinguishable
 *  from a hand-built one, and refining never has to remove + re-add (which drops fields). */
export interface ItemPayload {
  desc?: string;
  qty?: number;
  kind?: ItemKind;
  equipped?: boolean;
  attuned?: boolean;
  image?: string;
  tags?: string[];
  weapon?: WeaponStats;
  armor?: ArmorStats;
  consumable?: ConsumableStats;
  /** Passive bonuses while equipped/attuned — the whole point of Slice 14. Validated at the
   *  boundary (cleanEffects): an unknown target/operation is DROPPED, never coerced, because an
   *  item whose effect silently didn't parse is worse than one whose effect was refused. */
  effects?: Effect[];
  /** A usage pool the item grants while equipped (Slice 11 grant-half). */
  grantsResource?: Resource;
  /** A rollable attack the item grants while equipped (Slice 11 grant-half). */
  grantsAttack?: Attack;
  /** A spell the item grants while equipped (Slice 11 grant-half). */
  grantsSpell?: Spell;
}

const ITEM_KINDS: ItemKind[] = ['weapon', 'armor', 'shield', 'consumable', 'wondrous', 'gear'];

/** Keep only effects that pass the registry validator. Rejections are surfaced separately by
 *  `validateSheetEdits` so the failure is visible; here we simply never let garbage reach the
 *  ledger, where it would resolve to a plausible-but-wrong number. */
export function cleanEffects(raw: unknown): Effect[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is Effect => validateEffect(e as Record<string, unknown>) === null);
}

/** Merge an ItemPayload's recognised fields onto an item, dropping absent fields (so a partial
 *  update_item touches only what it names) and validating effects. Reserved wiring tags stay out
 *  of the free-tag list — `equipped` is its own boolean, `weapon`/`consumable` derive from `kind`. */
function applyItemPayload(base: InvItem, p: ItemPayload): InvItem {
  const out: InvItem = { ...base };
  if (p.desc != null) out.desc = String(p.desc);
  if (p.qty != null) out.qty = Math.max(0, Math.round(p.qty));
  if (p.kind != null && ITEM_KINDS.includes(p.kind)) out.kind = p.kind;
  if (p.equipped != null) out.equipped = p.equipped === true;
  if (p.attuned != null) out.attuned = p.attuned === true;
  if (p.image != null) out.image = String(p.image);
  if (p.weapon != null) out.weapon = p.weapon;
  if (p.armor != null) out.armor = p.armor;
  if (p.consumable != null) out.consumable = p.consumable;
  if (p.effects != null) out.effects = cleanEffects(p.effects);
  if (p.grantsResource != null && typeof p.grantsResource.name === 'string') {
    const g = p.grantsResource;
    const max = Math.max(0, Math.round(g.max ?? 0));
    // Normalise like add_resource: current defaults to full, colour/reset get sane fallbacks.
    out.grantsResource = {
      id: g.id || `grant-res-${slug(g.name)}`,
      name: g.name,
      max,
      current: Math.max(0, Math.min(max, Math.round(g.current ?? max))),
      color: g.color ?? 'teal',
      resetOn: g.resetOn ?? 'long',
      ...(g.note ? { note: g.note } : {}),
    };
  }
  if (p.grantsAttack != null && typeof p.grantsAttack.name === 'string') {
    const a = p.grantsAttack;
    // Guard the same fields add_attack does, so a granted attack is as safe as an authored one.
    out.grantsAttack = {
      ...a,
      id: a.id || `grant-atk-${slug(a.name)}`,
      ability: ABILITY_KEYS.includes(a.ability) ? a.ability : 'str',
      damage: a.damage || '1d6',
      damageType: a.damageType ?? '',
    };
  }
  if (p.grantsSpell != null && typeof p.grantsSpell.name === 'string') {
    const s = p.grantsSpell;
    out.grantsSpell = {
      ...s,
      id: s.id || `grant-spell-${slug(s.name)}`,
      level: (Math.max(0, Math.min(9, Math.round(s.level ?? 0))) as Spell['level']),
      description: s.description ?? '',
      prepared: true, // a granted spell is available while worn
    };
  }
  if (Array.isArray(p.tags)) {
    const clean = p.tags
      .map((t) => String(t).trim())
      .filter((t) => t && !RESERVED_TAGS.includes(t.toLowerCase()));
    out.tags = [...new Set([...(out.tags ?? []), ...clean])];
  }
  return out;
}

export type SheetEdit =
  | { op: 'set_name'; value: string }
  | { op: 'set_meta'; field: 'kicker' | 'role' | 'species' | 'className' | 'subclass'; value: string }
  | { op: 'set_level'; value: number }
  | { op: 'set_ability'; ability: AbilityKey; value: number }
  | { op: 'set_save_proficient'; ability: AbilityKey; value: boolean }
  | { op: 'set_skill'; skill: string; prof: ProfLevel }
  | { op: 'set_combat'; field: 'ac' | 'maxHp' | 'currentHp' | 'speed'; value: number }
  | { op: 'add_attack'; name: string; ability: AbilityKey; damage: string; damageType?: string; proficient?: boolean; range?: string; bonusToHit?: number; bonusDamage?: number }
  // Retune an EXISTING attack in place — the literal reported case "change my sword's damage die".
  // Merges only the fields given (keeping the rest), unlike add_attack which replaces the whole row.
  | { op: 'update_attack'; name: string; ability?: AbilityKey; damage?: string; damageType?: string; proficient?: boolean; range?: string; bonusToHit?: number; bonusDamage?: number; notes?: string }
  | { op: 'remove_attack'; name: string }
  | { op: 'add_feature'; name: string; source?: string; body: string[] }
  | { op: 'remove_feature'; name: string }
  // add_item now carries the FULL item (Slice 14): kind, stats, art, and real `effects` that the
  // ledger resolves — not just a name. update_item merges fields into an existing item; equip_item
  // toggles whether its effects apply.
  | ({ op: 'add_item'; name: string } & ItemPayload)
  | ({ op: 'update_item'; name: string } & ItemPayload)
  | { op: 'equip_item'; name: string; value?: boolean }
  | { op: 'remove_item'; name: string }
  | { op: 'add_resource'; name: string; max: number; color?: 'pink' | 'teal' | 'gold'; resetOn?: 'short' | 'long' }
  // Rename IN PLACE — change only the name, keep every other field. Without this the AI had to
  // remove + re-add to "rename" something, which dropped every field it wasn't re-supplied (a
  // Backless Park Bench renamed to Park Bench lost its ability → -NaN to-hit, and its tags). Match
  // by current name; `to` is the new name.
  | { op: 'rename_attack'; name: string; to: string }
  | { op: 'rename_feature'; name: string; to: string }
  | { op: 'rename_item'; name: string; to: string }
  | { op: 'rename_spell'; name: string; to: string }
  | { op: 'rename_resource'; name: string; to: string }
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
    case 'add_attack': case 'update_attack': case 'remove_attack': case 'rename_attack': return `attacks[${slug(e.name)}]`;
    case 'add_feature': case 'remove_feature': case 'rename_feature': return `features[${slug(e.name)}]`;
    case 'add_item': case 'update_item': case 'equip_item': case 'remove_item': case 'rename_item': case 'tag_item': return `inventory[${slug(e.name)}]`;
    case 'rename_spell': return `spells[${slug(e.name)}]`;
    case 'rename_resource': return `resources[${slug(e.name)}]`;
    case 'define_tag': return `customTags[${slug(e.name)}]`;
    case 'add_resource': return `resources[${slug(e.name)}]`;
  }
}

/**
 * The value an edit is about to REPLACE, read from the pre-edit character — so the audit trail
 * (`dnd_sheet_edits.old_value`) is complete and a DM's "Revert" (Slice 26) has the prior value to
 * restore. Returns null for creates (add_*, define_tag) and anything with no prior value. For
 * rename/update of a collection element, returns the whole prior element so a revert is exact.
 */
export function editOldValue(current: Character, e: SheetEdit): unknown {
  const findByName = <T extends { name: string }>(list: T[] | undefined, name: string): T | null =>
    (list ?? []).find((x) => eqName(x.name, name)) ?? null;
  switch (e.op) {
    case 'set_name': return current.meta?.name ?? null;
    case 'set_meta': return current.meta?.[e.field] ?? null;
    case 'set_level': return current.meta?.level ?? null;
    case 'set_ability': return current.abilities?.[e.ability] ?? null;
    case 'set_combat': return current.combat?.[e.field] ?? null;
    case 'set_save_proficient': return current.saves?.[e.ability]?.proficient ?? null;
    case 'set_skill': return current.skills?.[e.skill]?.prof ?? null;
    case 'add_attack': case 'update_attack': case 'remove_attack': case 'rename_attack':
      return findByName(current.attacks, e.name);
    case 'add_feature': case 'remove_feature': case 'rename_feature':
      return findByName(current.features, e.name);
    case 'add_item': case 'update_item': case 'equip_item': case 'remove_item': case 'rename_item': case 'tag_item':
      return findByName(current.inventory, e.name);
    case 'rename_spell': return findByName(current.spells, e.name);
    case 'add_resource': case 'rename_resource': return findByName(current.resources, e.name);
    default: return null;
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
      case 'update_attack': {
        // Merge only the supplied fields onto the matching attack (keeping its id and the rest), and
        // mark it ✎. Clamps nothing that add_attack didn't — same shape, partial.
        const fields = ['ability', 'damage', 'damageType', 'proficient', 'range', 'bonusToHit', 'bonusDamage', 'notes'] as const;
        c.attacks = c.attacks.map((a) => {
          if (!eqName(a.name, e.name)) return a;
          const patch: Partial<Attack> = {};
          for (const k of fields) if ((e as Record<string, unknown>)[k] !== undefined) (patch as Record<string, unknown>)[k] = (e as Record<string, unknown>)[k];
          return { ...a, ...patch, customized: true };
        });
        break;
      }
      case 'remove_attack': c.attacks = c.attacks.filter((a) => !eqName(a.name, e.name)); break;
      // rename/update also mark the element ✎ customized (Slice 20): an AI edit is an edit away from
      // source just like a hand one, and the marker means the same thing whoever made the change.
      case 'rename_attack': {
        const to = (e.to ?? (raw.to as string | undefined) ?? '').trim();
        if (to) c.attacks = c.attacks.map((a) => (eqName(a.name, e.name) ? { ...a, name: to, customized: true } : a));
        break;
      }
      case 'rename_feature': {
        const to = (e.to ?? (raw.to as string | undefined) ?? '').trim();
        if (to) c.features = c.features.map((f) => (eqName(f.name, e.name) ? { ...f, name: to, customized: true } : f));
        break;
      }
      case 'rename_item': {
        const to = (e.to ?? (raw.to as string | undefined) ?? '').trim();
        if (to) c.inventory = c.inventory.map((i) => (eqName(i.name, e.name) ? { ...i, name: to, customized: true } : i));
        break;
      }
      case 'rename_spell': {
        const to = (e.to ?? (raw.to as string | undefined) ?? '').trim();
        if (to) c.spells = (c.spells ?? []).map((s) => (eqName(s.name, e.name) ? { ...s, name: to, customized: true } : s));
        break;
      }
      case 'rename_resource': {
        const to = (e.to ?? (raw.to as string | undefined) ?? '').trim();
        if (to) c.resources = c.resources.map((r) => (eqName(r.name, e.name) ? { ...r, name: to } : r));
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
        // Build on a fresh blank item, then layer the payload — so a bare add_item still works and
        // a rich one (kind, stats, effects) round-trips. Replaces any same-named item (upsert).
        const blank: InvItem = { id: `ai-item-${slug(e.name)}`, name: e.name, desc: '', qty: 1, tags: [] };
        const item = applyItemPayload(blank, e);
        c.inventory = [...c.inventory.filter((i) => !eqName(i.name, e.name)), item];
        break;
      }
      case 'update_item': {
        // Merge onto the EXISTING item, keeping its id and every field the payload doesn't name.
        // No-op if there's nothing by that name — update never silently creates (use add_item).
        c.inventory = c.inventory.map((i) => (eqName(i.name, e.name) ? { ...applyItemPayload(i, e), customized: true } : i));
        break;
      }
      case 'equip_item': {
        const v: unknown = e.value ?? raw.value;
        const equipped = v == null ? true : v === true || v === 'true';
        c.inventory = c.inventory.map((i) => (eqName(i.name, e.name) ? { ...i, equipped } : i));
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

/**
 * Report effects that an add_item/update_item carried but that the registry refused, so the
 * failure is VISIBLE (the ai-edit route appends these to its summary) rather than a silently
 * missing bonus. `applySheetEdits` has already dropped them via `cleanEffects`; this is the
 * explanation of what was dropped and why.
 */
export function validateSheetEdits(edits: SheetEdit[]): { path: string; reason: string }[] {
  const out: { path: string; reason: string }[] = [];
  for (const e of edits) {
    if (e.op !== 'add_item' && e.op !== 'update_item') continue;
    const effects = (e as { effects?: unknown }).effects;
    if (!Array.isArray(effects)) continue;
    for (const eff of effects) {
      const err = validateEffect(eff as Record<string, unknown>);
      if (err) out.push({ path: editPath(e), reason: err.reason });
    }
  }
  return out;
}

// The Claude tool whose schema is this edit vocabulary (permissive: `op` selects the
// meaning; applySheetEdits reads only the fields relevant to each op).
export const SHEET_EDIT_TOOL: Anthropic.Tool = {
  name: 'edit_sheet',
  description:
    'Apply a list of structured edits to a D&D character sheet. Emit one edit per change. ' +
    'To build a full character, emit edits for name, level, all six abilities, AC/HP/speed, ' +
    'save proficiencies, key skills, attacks, class/species features, and notable inventory. ' +
    'Abilities are raw scores (e.g. 16), not modifiers. ' +
    'Items are REAL: give an item that grants a bonus an `effects` array (e.g. a Belt of the Bear = ' +
    '[{ target: "ability_str", operation: "set", value: 19 }]); those effects change the sheet\'s ' +
    'numbers while the item is equipped. Never fake a bonus in the description — put it in `effects`.',
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
              enum: ['set_name', 'set_meta', 'set_level', 'set_ability', 'set_save_proficient', 'set_skill', 'set_combat', 'add_attack', 'update_attack', 'remove_attack', 'rename_attack', 'add_feature', 'remove_feature', 'rename_feature', 'add_item', 'update_item', 'equip_item', 'remove_item', 'rename_item', 'rename_spell', 'rename_resource', 'add_resource', 'define_tag', 'tag_item'],
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
            // ── Item fields (add_item / update_item), Slice 14 ──────────────────────────────
            kind: { type: 'string', enum: ITEM_KINDS, description: 'For add_item/update_item: weapon|armor|shield|consumable|wondrous|gear.' },
            equipped: { type: 'boolean', description: 'For add_item/update_item/equip_item: whether the item is worn/wielded. An item\'s `effects` apply only while equipped (or equipped AND attuned).' },
            attuned: { type: 'boolean', description: 'For add_item/update_item: whether the item is attuned. Attuned items apply effects only when equipped AND attuned.' },
            image: { type: 'string', description: 'For add_item/update_item: item artwork URL (optional; never block mechanics on art).' },
            tags: { type: 'array', items: { type: 'string' }, description: 'For add_item/update_item: custom tags to attach (must be built-in or define_tag\'d; weapon/consumable/equipped are reserved and ignored here).' },
            effects: {
              type: 'array',
              description:
                'For add_item/update_item: the item\'s REAL passive effects, applied by the ledger while equipped/attuned. THIS is what makes an item change the sheet. Each effect is { target, operation, value?, condition? }. ' +
                'target is a key from the effect registry (e.g. ability_str, ac, speed_walk, spell_save_dc, attack_and_damage, resistance, darkvision). operation is add|set|set_base|advantage|disadvantage|grant_proficiency|resistance|immunity|vulnerability|grant_sense (use the ones the target allows). value is a number for numeric targets, a string for text/damage_type/proficiency/sense targets. Omit value for advantage/disadvantage. Unknown targets/operations are REJECTED, not coerced — use only registry keys.',
              items: {
                type: 'object',
                properties: {
                  target: { type: 'string' },
                  operation: { type: 'string' },
                  value: { description: 'Number or string, per the target.' },
                  condition: { type: 'string', description: 'Optional gate, e.g. raging, bloodied — the effect applies only while true.' },
                },
                required: ['target', 'operation'],
              },
            },
            grantsResource: {
              type: 'object',
              description: 'For add_item/update_item: a usage pool the item GRANTS while equipped (charges/points with a reset rule). Shown read-only under Resources, badged to the item, gone on unequip.',
              properties: {
                name: { type: 'string' },
                max: { type: 'number' },
                resetOn: { type: 'string', enum: ['short', 'long'] },
                color: { type: 'string', enum: ['pink', 'teal', 'gold'] },
                note: { type: 'string' },
              },
              required: ['name', 'max'],
            },
            grantsAttack: {
              type: 'object',
              description: 'For add_item/update_item: a rollable attack the item GRANTS while equipped (e.g. a flaming sword\'s Flame Lash). Shown in the Attacks table, badged to the item, gone on unequip.',
              properties: {
                name: { type: 'string' },
                ability: { type: 'string', enum: ABILITY_KEYS },
                damage: { type: 'string', description: 'Dice, e.g. 2d6.' },
                damageType: { type: 'string' },
                range: { type: 'string' },
                proficient: { type: 'boolean' },
                bonusToHit: { type: 'number' },
                bonusDamage: { type: 'number' },
              },
              required: ['name', 'ability', 'damage'],
            },
            grantsSpell: {
              type: 'object',
              description: 'For add_item/update_item: a spell the item GRANTS while equipped (e.g. a wand of Fireball). Shown read-only in the Spells tab, badged to the item, gone on unequip — works even for a non-caster.',
              properties: {
                name: { type: 'string' },
                level: { type: 'number', description: '0 for a cantrip, up to 9.' },
                school: { type: 'string' },
                range: { type: 'string' },
                components: { type: 'string' },
                duration: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['name', 'level'],
            },
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
