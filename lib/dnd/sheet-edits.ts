// lib/dnd/sheet-edits.ts — structured sheet edits (Phase I2). A small, validated edit
// vocabulary over the Character model (the shape stored in dnd_characters.data), plus
// a pure `applySheetEdits` and the Claude tool whose schema IS this vocabulary. The AI
// emits edits (via the tool); building a full sheet = many edits onto a blank one, and
// refining = edits onto the current one. Pure + typed so it's unit-tested and the API
// can trust the result before persisting.
import type Anthropic from '@anthropic-ai/sdk';
import type { Character, Attack, FeatureBlock, InvItem, Resource, CustomTag, ItemKind, WeaponStats, ArmorStats, ConsumableStats, Spell, Trigger } from '@/app/dnd/_sheet/types';
// (Resource is imported above; used by ItemPayload.grantsResource.)
import type { Effect } from '@/app/dnd/_sheet/engine/effects';
import type { AbilityKey, ProfLevel } from '@/app/dnd/_sheet/rules/dnd';
import { validateCustomTag, RESERVED_TAGS } from '@/app/dnd/_sheet/components/ui/tagInfo';
import { validateEffect } from '@/lib/dnd/effects/targets';
import { EFFECT_OPERATIONS } from '@/app/dnd/_sheet/engine/effects';
import { cleanTriggers } from '@/lib/dnd/effects/triggers';
import { equipConflicts, resolveEquipSwap } from '@/lib/dnd/equip-conflicts';
import type { EquipLimits } from '@/lib/dnd/preferences';
import { FEATS_2024, type Feat } from '@/lib/dnd/feats/dnd5e-2024';
import { FEATS_2014 } from '@/lib/dnd/feats/dnd5e-2014';

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
  /** Event-triggered reactions the item carries (Slice 15) — validated by cleanTriggers. */
  triggers?: Trigger[];
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
  if (p.triggers != null) out.triggers = cleanTriggers(p.triggers);
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
  | { op: 'set_meta'; field: 'kicker' | 'role' | 'species' | 'className' | 'subclass' | 'gender' | 'pronouns' | 'profession' | 'alignment'; value: string }
  | { op: 'set_level'; value: number }
  | { op: 'set_ability'; ability: AbilityKey; value: number }
  | { op: 'set_save_proficient'; ability: AbilityKey; value: boolean }
  | { op: 'set_skill'; skill: string; prof: ProfLevel }
  | { op: 'set_combat'; field: 'ac' | 'maxHp' | 'currentHp' | 'speed' | 'tempHp' | 'exhaustion'; value: number }
  | { op: 'add_attack'; name: string; ability: AbilityKey; damage: string; damageType?: string; proficient?: boolean; range?: string; bonusToHit?: number; bonusDamage?: number }
  // Retune an EXISTING attack in place — the literal reported case "change my sword's damage die".
  // Merges only the fields given (keeping the rest), unlike add_attack which replaces the whole row.
  | { op: 'update_attack'; name: string; ability?: AbilityKey; damage?: string; damageType?: string; proficient?: boolean; range?: string; bonusToHit?: number; bonusDamage?: number; notes?: string }
  | { op: 'remove_attack'; name: string }
  // `offRules` as on add_spell — server-set, never client-supplied.
  | { op: 'add_feature'; name: string; source?: string; body: string[]; offRules?: string }
  // A CATALOG feat, by key or name (Area MV S7). Distinct from add_feature on purpose: a feature
  // is free-form prose, so "the Grappler feat" and "a homebrew feature called Grappler" are
  // indistinguishable once written, and the rules gate cannot tell which it is looking at.
  // Naming the feat makes it resolvable, which makes it enforceable. Its body text comes from the
  // catalog rather than the caller, so a feat cannot be granted with invented benefits.
  | { op: 'add_feat'; feat: string; slot?: 'origin' | 'fighting-style' | 'asi'; offRules?: string }
  | { op: 'remove_feature'; name: string }
  // Spells the AI can ADD/remove directly (not just grant via an item). Full spell shape — level,
  // school, timing, the resolution (attack roll or save vs DC), damage/heal, higher-level scaling.
  // `offRules` records WHY a spell was outside what the character's class and level grant (Area
  // MV). Server-set only — it is stamped by the grant path after its own eligibility check, never
  // taken from the AI or the client, or "not off-rules" would be a claim the caller could make.
  | { op: 'add_spell'; name: string; level: number; school?: string; castTime?: string; range?: string; components?: string; duration?: string; concentration?: boolean; ritual?: boolean; description: string; prepared?: boolean; attack?: boolean; save?: { ability: AbilityKey; effect: string }; higher?: string; offRules?: string }
  | { op: 'remove_spell'; name: string }
  // Money the AI can manage (Area C): add a named currency (a coin or a custom one like "Guild Marks"),
  // update an existing one's amount/rate/name, or remove it. `rate` = value of one unit in BASE units
  // (the base currency is rate 1); currencies are matched by id, name, or abbreviation.
  | { op: 'add_currency'; name: string; abbrev?: string; amount?: number; rate?: number }
  | { op: 'set_currency'; currency: string; amount?: number; rate?: number; name?: string; abbrev?: string }
  | { op: 'remove_currency'; currency: string }
  // Conditions the AI can apply/clear on the character — the standard ones (Poisoned, Prone, …) OR a
  // custom/homebrew condition (any name). Stored on combat.conditions; the sheet's tracker shows them.
  | { op: 'add_condition'; name: string }
  | { op: 'remove_condition'; name: string }
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

/**
 * The feat catalog a system actually has, as a dispatcher (Ground Rule 1).
 *
 * Only 2024 has one in this shape. 2014's feats are a DIFFERENT type (`Feat2014` — no
 * origin/general/fighting-style tracks, because those are a 2024 structure), and PF2 and IG own
 * their feats inside their own subsystems with their own gates. So every other system correctly
 * gets `[]` here rather than 2024's list.
 */
function featCatalogFor(system: string): Feat[] {
  return system === 'dnd5e-2024' ? FEATS_2024 : [];
}

/**
 * A catalog feat by key OR display name, SCOPED TO A SYSTEM. The AI reliably produces the name and
 * only sometimes the key, so accepting both is the difference between an op that works and one
 * that silently drops half its calls.
 *
 * WHY `system` IS REQUIRED RATHER THAN OPTIONAL. This function used to take only a ref and search
 * FEATS_2024 unconditionally, and `gateEdits` called it for every system. Four names collide
 * between 2024 and Intuitive Games — Alert, Lucky, Great Weapon Fighting, Two-Weapon Fighting — so
 * an IG character asking for Alert resolved the **5e** feat and was judged by 5e slot eligibility.
 * 5e's Alert is an ORIGIN feat and `slot` defaults to `asi`, so a vanilla non-DM IG character was
 * REFUSED A LEGAL FEAT using another game's category rules, and on the apply side would have had
 * 5e's initiative text written onto an IG sheet.
 *
 * (The audit that found this named Toughness as the example. That was wrong — Toughness is not in
 * FEATS_2024 at all, and 2024 shares no feat name with Pathfinder 2e. The bug was real and the
 * fix is unchanged; only the illustration was. See system-bleed.test.ts §6, which now asserts the
 * collision list rather than describing it.)
 *
 * Making the parameter required rather than defaulted is the point: a default would let a new call
 * site reintroduce the bug silently, whereas this way the compiler names every place that has to
 * decide. The `add_spell` arm twenty lines below `gateEdits`'s feat branch already routed through
 * `findSpellForSystem` correctly — sibling branches, one scoped and one not, which is exactly how
 * this survived unnoticed.
 */
export function resolveFeat(ref: string, system: string): Feat | undefined {
  const r = String(ref ?? '').trim().toLowerCase();
  if (!r) return undefined;
  const catalog = featCatalogFor(system);
  return catalog.find((f) => f.key.toLowerCase() === r) ?? catalog.find((f) => f.name.toLowerCase() === r);
}
const clampAbility = (n: number) => Math.max(1, Math.min(30, Math.round(n)));
const eqName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Match a currency by id, name, or abbreviation (case-insensitive) — the AI may refer to any. */
function findCurrency(list: Character['currencies'], key: string): NonNullable<Character['currencies']>[number] | null {
  const k = key.trim().toLowerCase();
  return (list ?? []).find((c) => c.id.toLowerCase() === k || eqName(c.name, key) || (c.abbrev ?? '').toLowerCase() === k) ?? null;
}

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
    // Uses the raw ref rather than the catalog's canonical name: `editPath` produces an audit
    // LABEL and has no system in scope, and resolving here would have to guess one — which is the
    // bug this scoping exists to stop. The ref is what the caller asked for, which is the honest
    // thing for an audit row to record anyway.
    case 'add_feat': return `features[${slug(e.feat)}]`;
    case 'add_spell': case 'remove_spell': case 'rename_spell': return `spells[${slug(e.name)}]`;
    case 'add_currency': return `currencies[${slug(e.name)}]`;
    case 'set_currency': case 'remove_currency': return `currencies[${slug(e.currency)}]`;
    case 'add_condition': case 'remove_condition': return 'combat.conditions';
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
    // A feat lands as a feature, so its prior value is whatever feature it replaces — which is
    // what a revert must restore.
    // Matched on the raw ref for the same reason as `editPath`: no system in scope. `findByName`
    // is already case-insensitive, so the only thing lost is matching a feat referenced by KEY
    // against the feature stored under its display name — and the undo path re-reads the stored
    // feature by name anyway.
    case 'add_feat': return findByName(current.features, e.feat);
    case 'add_spell': case 'remove_spell': case 'rename_spell': return findByName(current.spells, e.name);
    case 'add_currency': return findCurrency(current.currencies, e.name);
    case 'set_currency': case 'remove_currency': return findCurrency(current.currencies, e.currency);
    case 'add_condition': case 'remove_condition': return [...(current.combat?.conditions ?? [])];
    case 'add_resource': case 'rename_resource': return findByName(current.resources, e.name);
    default: return null;
  }
}

/**
 * Undo one edit, restoring the value it replaced (Slice 26 — the DM's "Revert"). Pure: takes the
 * CURRENT character, the edit, and the `old_value` the audit recorded (from `editOldValue`), and
 * returns a new character with that edit reversed. This is the mechanism behind the review queue's
 * per-edit Revert — kept a pure function so it's exhaustively testable before any UI drives it.
 *
 * Reversal rules, by shape:
 *  · scalar set_* → write `oldValue` back into the field (null = leave it, nothing better to restore).
 *  · collection edit where a prior element was captured → put that prior element back in place (a
 *    rename reverts the name; an update reverts every field; a remove re-adds it).
 *  · collection ADD (no prior element) → drop the element the edit created.
 * The element's CURRENT name is `to` for a rename (that's what it's called now) else `name`.
 */
export function revertSheetEdit(input: Character, e: SheetEdit, oldValue: unknown): Character {
  const c: Character = structuredClone(input);
  const currentName = (e.op === 'rename_attack' || e.op === 'rename_feature' || e.op === 'rename_item' || e.op === 'rename_spell' || e.op === 'rename_resource')
    ? ((e as { to?: string }).to ?? e.name)
    : (e as { name?: string }).name;

  // Replace the element named `currentName` with `prior` (in place), or re-add it if it's gone, or
  // remove it when there is no prior (the edit had CREATED it).
  const restore = <T extends { name: string }>(list: T[], prior: T | null): T[] => {
    if (!currentName) return list;
    const exists = list.some((x) => eqName(x.name, currentName));
    if (prior && exists) return list.map((x) => (eqName(x.name, currentName) ? prior : x));
    if (prior && !exists) return [...list, prior];
    return list.filter((x) => !eqName(x.name, currentName));
  };
  const prior = (oldValue ?? null) as { name: string } | null;

  switch (e.op) {
    case 'set_name': if (typeof oldValue === 'string') c.meta.name = oldValue; break;
    // A null oldValue here means the field was UNSET before the edit (the optional identity fields —
    // gender/pronouns/profession/alignment — start undefined). Revert to '' so filling an empty field is
    // undoable; guarding on `!= null` (as the numeric sets do) would strand the new value.
    case 'set_meta': c.meta[e.field] = oldValue != null ? String(oldValue) : ''; break;
    case 'set_level': if (typeof oldValue === 'number') c.meta.level = oldValue; break;
    case 'set_ability': if (typeof oldValue === 'number') c.abilities[e.ability] = oldValue; break;
    case 'set_combat': if (typeof oldValue === 'number') c.combat[e.field] = oldValue; break;
    case 'set_save_proficient':
      if (typeof oldValue === 'boolean') c.saves[e.ability] = { ...(c.saves[e.ability] ?? { misc: 0 }), proficient: oldValue };
      break;
    case 'set_skill':
      if (typeof oldValue === 'string') c.skills[e.skill] = { ...(c.skills[e.skill] ?? { misc: 0 }), prof: oldValue as ProfLevel };
      break;
    case 'add_attack': case 'update_attack': case 'remove_attack': case 'rename_attack':
      c.attacks = restore(c.attacks, prior as Attack | null);
      break;
    case 'add_feature': case 'remove_feature': case 'rename_feature': case 'add_feat':
      c.features = restore(c.features, prior as FeatureBlock | null);
      break;
    case 'add_item': case 'update_item': case 'equip_item': case 'remove_item': case 'rename_item': case 'tag_item':
      c.inventory = restore(c.inventory, prior as InvItem | null);
      break;
    case 'add_spell': case 'remove_spell': case 'rename_spell':
      c.spells = restore(c.spells ?? [], prior as Spell | null);
      break;
    case 'add_condition': case 'remove_condition':
      // conditions is a plain string[]; the prior array was captured, so restoring it is exact.
      if (Array.isArray(oldValue)) c.combat.conditions = oldValue as string[];
      break;
    case 'add_currency': case 'set_currency': case 'remove_currency': {
      // Currencies match by id/name/abbrev (not the generic name-only restore). prior = the pre-edit
      // currency (restore it), or null when the edit CREATED one (drop what it created).
      const priorCur = (oldValue ?? null) as NonNullable<Character['currencies']>[number] | null;
      const key = e.op === 'add_currency' ? e.name : e.currency;
      const list = c.currencies ?? [];
      if (priorCur) {
        c.currencies = list.some((x) => x.id === priorCur.id)
          ? list.map((x) => (x.id === priorCur.id ? priorCur : x))
          : [...list, priorCur];
      } else {
        const k = key.trim().toLowerCase();
        c.currencies = list.filter((x) => !(x.id.toLowerCase() === k || eqName(x.name, key) || (x.abbrev ?? '').toLowerCase() === k));
      }
      break;
    }
    case 'add_resource': case 'rename_resource':
      c.resources = restore(c.resources, prior as Resource | null);
      break;
    case 'define_tag':
      // A pure create (oldValue is null) — undo it by dropping the tag it added. Without this case an
      // undone AI edit that defined a tag would leave the tag category orphaned on the sheet.
      if (c.customTags) c.customTags = (c.customTags as CustomTag[]).filter((t) => !eqName(t.name, e.name));
      break;
  }
  return c;
}

/** One audited edit paired with the `old_value` recorded when it was applied. */
export interface AuditedEdit { edit: SheetEdit; oldValue: unknown }

/**
 * Revert a whole BATCH of edits (all the edits from one request) as a unit — the "undo that change"
 * primitive (history/undo B1). Folds `revertSheetEdit` over the batch in REVERSE order, each with its
 * own recorded `old_value`, so the sheet returns to exactly its pre-batch state. Reverse order matters:
 * if the batch added an item and then retuned it, the retune must be undone before the add is dropped.
 * Pure — the route loads the batch's audit rows and passes them here.
 */
export function revertBatch(input: Character, batch: AuditedEdit[]): Character {
  let c = input;
  for (let i = batch.length - 1; i >= 0; i--) {
    c = revertSheetEdit(c, batch[i].edit, batch[i].oldValue);
  }
  return c;
}

/** Apply a validated edit list to a Character, returning a new Character (pure). */
export function applySheetEdits(
  input: Character,
  edits: SheetEdit[],
  /**
   * `system` scopes the catalog lookups that write real mechanics onto the sheet — today just
   * `add_feat`. It is OPTIONAL and falls back to `dnd5e-2024` purely for backwards compatibility:
   * several callers predate the parameter and are all 5e paths. The two routes where a non-5e
   * character can actually arrive — ai-edit and grant-content — pass the character's real system.
   *
   * The fallback is a compromise and worth naming as one: a silent default to 2024 is the same
   * shape as the bugs this scoping pass is fixing. It is acceptable here only because every
   * remaining un-passing caller seeds or transposes a 5e sheet. If a non-5e caller is ever added,
   * pass the system rather than relying on this.
   */
  opts: { equipLimits?: EquipLimits; system?: string } = {},
): Character {
  const system = opts.system ?? 'dnd5e-2024';
  const c: Character = structuredClone(input);
  // Equip limits gate the AI equip exactly like the sheet's equip toggle (Area E1d). Enforced by default
  // (the vanilla setting), so an AI-driven equip never silently leaves an illegal state; `off` lets it stack.
  const enforceEquip = opts.equipLimits !== 'off';
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
      case 'set_combat': {
        // Exhaustion is a 0–6 track (drives the whole M1 mechanics chain); every other combat number floors at 0.
        const v = Math.max(0, Math.round(e.value));
        c.combat[e.field] = e.field === 'exhaustion' ? Math.min(6, v) : v;
        break;
      }
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
        const feat: FeatureBlock = {
          id: `ai-feat-${slug(e.name)}`, name: e.name, source: e.source ?? 'Feature', body: e.body,
          ...(e.offRules ? { offRules: e.offRules } : {}),
        };
        c.features = [...c.features.filter((f) => !eqName(f.name, e.name)), feat];
        break;
      }
      case 'add_feat': {
        // Resolved against the catalog by key OR name — the AI reliably produces the display
        // name and only sometimes the key. An unresolvable feat is DROPPED rather than written
        // as an empty husk that looks real and does nothing (Ground Rule 2 — never invented).
        // Scoped to the character's OWN system: resolving a PF2 "Toughness" against the 5e catalog
        // would write 5e rules text onto a Pathfinder sheet, which is the same bleed the gate
        // now prevents — caught in the same audit, one layer down.
        const def = resolveFeat(e.feat, system);
        if (!def) {
          // 2014 keeps its own catalog and its own TYPE (`Feat2014` has no `category`, on purpose),
          // so it cannot travel through `resolveFeat`, whose return type is the 2024 `Feat` —
          // widening that type is the thing 14-S6b exists to avoid. A separate branch instead: the
          // gate one layer up (`featEligibilityForSystem`) can now refuse an illegal 2014 feat, and
          // a gate over content that could never land afterwards would be theatre.
          const def14 = system === 'dnd5e-2014'
            ? FEATS_2014.find((f) => f.key.toLowerCase() === String(e.feat ?? '').trim().toLowerCase())
              ?? FEATS_2014.find((f) => f.name.toLowerCase() === String(e.feat ?? '').trim().toLowerCase())
            : undefined;
          if (!def14) break;
          const feat14: FeatureBlock = {
            id: `feat-${slug(def14.key)}`,
            name: def14.name,
            // Bare "Feat" rather than a track name: 2014 has no origin/general/fighting-style
            // tiers to label it with, and inventing one would put a 2024 word on a 2014 sheet.
            source: 'Feat',
            body: [def14.benefit],
            ...(e.offRules ? { offRules: e.offRules } : {}),
          };
          c.features = [...c.features.filter((f) => !eqName(f.name, def14.name)), feat14];
          break;
        }
        const feat: FeatureBlock = {
          id: `feat-${slug(def.key)}`,
          name: def.name,
          source: `${def.category === 'epic-boon' ? 'Epic Boon' : def.category === 'fighting-style' ? 'Fighting Style' : def.category === 'origin' ? 'Origin' : 'General'} feat`,
          // From the catalog, not the caller: a feat granted with invented benefits is worse
          // than one not granted at all.
          body: [def.benefit],
          ...(e.offRules ? { offRules: e.offRules } : {}),
        };
        c.features = [...c.features.filter((f) => !eqName(f.name, def.name)), feat];
        break;
      }
      case 'remove_feature': c.features = c.features.filter((f) => !eqName(f.name, e.name)); break;
      case 'add_spell': {
        // A full spell the AI authored (upsert by name). Cantrips (level 0) and prepared spells are
        // usable immediately; the rest respect the sheet's prepared/slot rules on the Spells tab.
        const lvl = Math.max(0, Math.min(9, Math.round(Number(e.level) || 0))) as Spell['level'];
        const spell: Spell = {
          id: `ai-spell-${slug(e.name)}`, name: e.name, level: lvl, description: e.description,
          prepared: e.prepared ?? true,
          ...(e.school ? { school: e.school } : {}),
          ...(e.castTime ? { castTime: e.castTime } : {}),
          ...(e.range ? { range: e.range } : {}),
          ...(e.components ? { components: e.components } : {}),
          ...(e.duration ? { duration: e.duration } : {}),
          ...(e.concentration ? { concentration: true } : {}),
          ...(e.ritual ? { ritual: true } : {}),
          ...(e.attack ? { attack: true } : {}),
          ...(e.save ? { save: e.save } : {}),
          ...(e.higher ? { higher: e.higher } : {}),
          ...(e.offRules ? { offRules: e.offRules } : {}),
        };
        c.spells = [...(c.spells ?? []).filter((s) => !eqName(s.name, e.name)), spell];
        break;
      }
      case 'remove_spell': c.spells = (c.spells ?? []).filter((s) => !eqName(s.name, e.name)); break;
      case 'add_currency': {
        // Add a named currency (a coin or a custom one). Upsert by name so re-adding refines rather
        // than duplicates. rate = value of one unit in base units (default 1); amount default 0.
        const id = `cur-${slug(e.name)}`;
        const cur = {
          id, name: e.name.trim() || 'Currency',
          ...(e.abbrev ? { abbrev: e.abbrev.trim() } : {}),
          amount: Math.max(0, Number(e.amount) || 0),
          rate: e.rate != null && Number(e.rate) > 0 ? Number(e.rate) : 1,
        };
        c.currencies = [...(c.currencies ?? []).filter((x) => !eqName(x.name, e.name) && x.id !== id), cur];
        break;
      }
      case 'set_currency': {
        // Update an existing currency's amount/rate/name/abbrev (matched by id/name/abbrev).
        const target = findCurrency(c.currencies, e.currency);
        if (target) {
          c.currencies = (c.currencies ?? []).map((x) => (x.id === target.id ? {
            ...x,
            ...(e.name ? { name: e.name.trim() } : {}),
            ...(e.abbrev != null ? { abbrev: e.abbrev.trim() } : {}),
            ...(e.amount != null ? { amount: Math.max(0, Number(e.amount) || 0) } : {}),
            ...(e.rate != null && Number(e.rate) > 0 ? { rate: Number(e.rate) } : {}),
          } : x));
        }
        break;
      }
      case 'remove_currency': {
        const target = findCurrency(c.currencies, e.currency);
        if (target) c.currencies = (c.currencies ?? []).filter((x) => x.id !== target.id);
        break;
      }
      case 'add_condition': {
        const name = e.name.trim();
        if (name) {
          const cur = c.combat.conditions ?? [];
          if (!cur.some((x) => x.trim().toLowerCase() === name.toLowerCase())) c.combat.conditions = [...cur, name];
        }
        break;
      }
      case 'remove_condition':
        c.combat.conditions = (c.combat.conditions ?? []).filter((x) => x.trim().toLowerCase() !== e.name.trim().toLowerCase());
        break;
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
        const target = c.inventory.find((i) => eqName(i.name, e.name));
        if (!target) break;
        if (equipped && enforceEquip) {
          // Auto-swap so the AI leaves a rules-legal state: unequip whatever conflicts (one body armor / one
          // shield / a two-handed weapon frees both hands), then equip the target. The UI dialog asks the
          // player which to swap; the AI acts on the instruction and resolves the conflict deterministically.
          const conflicts = equipConflicts(c.inventory, target.id);
          c.inventory = resolveEquipSwap(c.inventory, target.id, conflicts.map((x) => x.id));
        } else {
          c.inventory = c.inventory.map((i) => (i.id === target.id ? { ...i, equipped } : i));
        }
        break;
      }
      case 'remove_item': c.inventory = c.inventory.filter((i) => !eqName(i.name, e.name)); break;
      case 'add_resource': {
        const res: Resource = { id: `ai-res-${slug(e.name)}`, name: e.name, max: Math.max(0, Math.round(e.max)), current: Math.max(0, Math.round(e.max)), color: e.color ?? 'teal', resetOn: e.resetOn ?? 'long' };
        c.resources = [...c.resources.filter((r) => !eqName(r.name, e.name)), res];
        break;
      }
      default: {
        // Exhaustiveness guard: EVERY SheetEdit op must have a case above. This is the AI's edit
        // vocabulary — if an op the AI can emit has no case here, the edit silently does NOTHING (the AI
        // reports success while the sheet is unchanged), breaking the "the AI can actually edit everything"
        // guarantee. A new op added to the union without a handler fails to COMPILE here.
        const _exhaustive: never = e;
        void _exhaustive;
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
      custom: {
        type: 'array',
        description: 'HOMEBREW / CUSTOM content you INVENTED (not present in the target system\'s official rules) — used when transposing a character and a signature ability has no vanilla equivalent. List EVERY invented element so the user sees exactly what is not vanilla. Leave empty when everything you built is official.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'What kind of element: class | subclass | ancestry | feat | spell | stance | feature | attack | item | resource | trait | other.' },
            name: { type: 'string', description: 'The exact name of the element as it appears on the sheet.' },
            note: { type: 'string', description: 'One line: what it does and why it was needed to preserve the character, plus a word on how it is balanced for the level/tier.' },
          },
          required: ['type', 'name'],
        },
      },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: ['set_name', 'set_meta', 'set_level', 'set_ability', 'set_save_proficient', 'set_skill', 'set_combat', 'add_attack', 'update_attack', 'remove_attack', 'rename_attack', 'add_feature', 'add_feat', 'remove_feature', 'rename_feature', 'add_spell', 'remove_spell', 'rename_spell', 'add_item', 'update_item', 'equip_item', 'remove_item', 'rename_item', 'rename_resource', 'add_resource', 'define_tag', 'tag_item', 'add_currency', 'set_currency', 'remove_currency', 'add_condition', 'remove_condition'],
            },
            feat: { type: 'string', description: 'For add_feat: the name (or key) of a 2024 feat from the rules library, e.g. "Alert", "Great Weapon Master". PREFER add_feat over add_feature for any official feat — its benefit text comes from the library, and it is checked against what the character may legally take. Use add_feature only for genuine homebrew.' },
            slot: { type: 'string', enum: ['origin', 'fighting-style', 'asi'], description: 'For add_feat: which slot grants it — origin (background, level 1), fighting-style (a class feature), or asi (an Ability Score Improvement level). Defaults to asi.' },
            field: { type: 'string', description: 'For set_meta: kicker|role|species|className|subclass|gender|pronouns|profession|alignment. For set_combat: ac|maxHp|currentHp|speed|tempHp|exhaustion (exhaustion is a 0–6 track).' },
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
            // ── Spell fields (add_spell) — the full spell shape ─────────────────────────────
            level: { type: 'number', description: 'For add_spell: spell level 0–9 (0 = cantrip).' },
            description: { type: 'string', description: 'For add_spell: the spell\'s full rules text.' },
            school: { type: 'string', description: 'For add_spell: school of magic (or the system\'s tradition), optional.' },
            castTime: { type: 'string', description: 'For add_spell: casting time, e.g. "1 action", "1 bonus action", "1 minute".' },
            components: { type: 'string', description: 'For add_spell: components, e.g. "V, S, M".' },
            duration: { type: 'string', description: 'For add_spell: duration, e.g. "Instantaneous" or "Concentration, up to 1 minute".' },
            concentration: { type: 'boolean', description: 'For add_spell: requires concentration.' },
            ritual: { type: 'boolean', description: 'For add_spell: can be cast as a ritual.' },
            attack: { type: 'boolean', description: 'For add_spell: resolves with a spell attack roll (as opposed to a save).' },
            save: { type: 'object', description: 'For add_spell: { ability, effect } when the target rolls a save vs your spell DC.', properties: { ability: { type: 'string', enum: ABILITY_KEYS }, effect: { type: 'string' } } },
            higher: { type: 'string', description: 'For add_spell: the "at higher levels" upcasting text.' },
            prepared: { type: 'boolean', description: 'For add_spell: whether it starts prepared/known (default true).' },
            // ── Currency fields (add_currency / set_currency / remove_currency) ─────────────
            currency: { type: 'string', description: 'For set_currency/remove_currency: which currency to change (by name, abbreviation, or id).' },
            abbrev: { type: 'string', description: 'For add_currency/set_currency: short symbol, e.g. "gp".' },
            amount: { type: 'number', description: 'For add_currency/set_currency: how many the character holds (default 0).' },
            rate: { type: 'number', description: 'For add_currency/set_currency: value of ONE unit in BASE units (the base currency is rate 1; e.g. gp = 100 when cp is base). Default 1.' },
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
                `target is a key from the effect registry (e.g. ability_str, ac, speed_walk, spell_save_dc, attack_and_damage, resistance, grant_sense). operation is ${EFFECT_OPERATIONS.join('|')} (use the ones the target allows). value is a number for numeric targets, a string for text/damage_type/proficiency/sense/dice targets. Omit value for advantage/disadvantage. Unknown targets/operations are REJECTED, not coerced — use only registry keys.`,
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
            triggers: {
              type: 'array',
              description: 'For add_item/update_item: event-triggered REACTIONS (Slice 15) — a spiked armour that hits back, a shield that frightens. NOT a passive effect; it fires when an event happens and is surfaced as a prompt (never auto-applied). Each: { on, label, action, condition?, limit? }. on ∈ hit_by_melee|hit_by_ranged|hit_by_spell|you_hit|you_crit|you_are_crit|save_failed|turn_start|turn_end|damaged|reduced_to_zero. action = { kind: damage|heal|temp_hp|condition|effect|resource|prompt, dice?, damageType?, attack?, condition?, note? }. limit = { per: turn|round|short|long|encounter, max } to cap retaliation.',
              items: {
                type: 'object',
                properties: {
                  on: { type: 'string' },
                  label: { type: 'string' },
                  condition: { type: 'string' },
                  action: {
                    type: 'object',
                    properties: {
                      kind: { type: 'string', enum: ['damage', 'heal', 'temp_hp', 'condition', 'effect', 'resource', 'prompt'] },
                      dice: { type: 'string' },
                      damageType: { type: 'string' },
                      attack: { type: 'boolean' },
                      condition: { type: 'string' },
                      note: { type: 'string' },
                    },
                    required: ['kind'],
                  },
                  limit: {
                    type: 'object',
                    properties: { per: { type: 'string', enum: ['turn', 'round', 'short', 'long', 'encounter'] }, max: { type: 'number' } },
                  },
                },
                required: ['on', 'label', 'action'],
              },
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
