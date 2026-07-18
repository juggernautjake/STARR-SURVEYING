// app/dnd/_sheet/engine/character.ts — engine capstone: model → full derived, plus
// structured edits (Phase C20, §6.18 "AI + real-time control over the model").
//
// `deriveCharacter` composes the whole pipeline (C12–C18): base derivation →
// item + feature effects (conditional-filtered) → apply-to-derived → computed AC →
// auto attacks. `applyModelEdit` is the structured edit surface the DM and the AI
// (the Phase-I "I2" tool) write through — set an ability, add/equip/attune an item,
// add a feature effect, toggle a condition. Because the derived numbers are pure
// functions of the model, ANY edit recomputes EVERY connected number on the next
// derive; persistence + realtime propagation ride on the C3 store + C11b broadcast.
import {
  derive,
  ABILITY_KEYS,
  type Abilities,
  type Derived,
} from './derive';
import type { AbilityKey, ProfLevel } from '../rules/dnd';
import { activeEffects, type Effect } from './effects';
import { applyEffectsToDerived, type DerivedWithEffects } from './apply';
import {
  collectItemEffects,
  equipChecked,
  unequip,
  attune,
  unattune,
  type EquipItem,
} from './equipment';
import { computeAC, type ACResult } from './armor';
import { attacksFromInventory, type AttackEntry } from './weapons';

export interface EngineCharacter {
  abilities: Abilities;
  level: number;
  saveProficiencies?: AbilityKey[];
  skillProficiencies?: Record<string, ProfLevel>;
  spellcastingAbility?: AbilityKey;
  /** Class Unarmored Defense base (e.g. 10 + DEX + CON) when relevant. */
  unarmoredBaseAC?: number;
  items: EquipItem[];
  /** Feat/feature/class effects (may carry global conditions like 'raging'). */
  features?: Effect[];
  /** Currently-active global conditions gating conditional effects. */
  conditions?: string[];
  proficientCategories?: ('simple' | 'martial')[];
  proficientWeapons?: string[];
}

export interface FullDerived extends DerivedWithEffects {
  base: Derived;
  ac: ACResult;
  attacks: AttackEntry[];
}

/** Run the entire engine over a character model. Pure → recompute on any change. */
export function deriveCharacter(c: EngineCharacter): FullDerived {
  const base = derive({
    abilities: c.abilities,
    level: c.level,
    saveProficiencies: c.saveProficiencies,
    skillProficiencies: c.skillProficiencies,
    spellcastingAbility: c.spellcastingAbility,
  });

  // Worn-item effects (attunement/equip resolved) + feature effects, then gate any
  // remaining conditional effects by the active global conditions.
  const pooled = [...collectItemEffects(c.items), ...(c.features ?? [])];
  const effects = activeEffects(pooled, { active: c.conditions ?? [] });

  const withEffects = applyEffectsToDerived(base, effects);
  const ac = computeAC({ items: c.items, dexMod: base.mods.dex, effects, unarmoredBaseAC: c.unarmoredBaseAC });
  const attacks = attacksFromInventory(c.items, {
    mods: base.mods,
    proficiencyBonus: base.proficiencyBonus,
    proficientCategories: c.proficientCategories,
    proficientWeapons: c.proficientWeapons,
    effects,
  });

  return { ...withEffects, base, ac, attacks };
}

// ── Structured edits (what the AI / DM write through) ────────────────────────
export type ModelEdit =
  | { op: 'set_ability'; ability: AbilityKey; value: number }
  | { op: 'set_level'; value: number }
  | { op: 'add_item'; item: EquipItem }
  | { op: 'remove_item'; id: string }
  | { op: 'update_item'; id: string; patch: Partial<EquipItem> }
  | { op: 'equip'; id: string; equipped: boolean }
  | { op: 'attune'; id: string; attuned: boolean }
  | { op: 'add_feature'; effect: Effect }
  | { op: 'set_condition'; condition: string; active: boolean };

/** Apply a structured edit to the model, returning a new model (immutable). */
export function applyModelEdit(c: EngineCharacter, edit: ModelEdit): EngineCharacter {
  switch (edit.op) {
    case 'set_ability':
      if (!ABILITY_KEYS.includes(edit.ability)) return c;
      return { ...c, abilities: { ...c.abilities, [edit.ability]: edit.value } };
    case 'set_level':
      return { ...c, level: Math.max(1, Math.round(edit.value)) };
    case 'add_item':
      return { ...c, items: [...c.items, edit.item] };
    case 'remove_item':
      return { ...c, items: c.items.filter((i) => i.id !== edit.id) };
    case 'update_item':
      return { ...c, items: c.items.map((i) => (i.id === edit.id ? { ...i, ...edit.patch } : i)) };
    case 'equip':
      // equipChecked mirrors attune(): it self-enforces the hard slot rules (one body armor, one
      // shield, two-handed vs shield) and no-ops on a conflict, so the reducer can never reach an
      // illegal equipped state. Unequip is always allowed.
      return { ...c, items: edit.equipped ? equipChecked(c.items, edit.id) : unequip(c.items, edit.id) };
    case 'attune':
      return { ...c, items: edit.attuned ? attune(c.items, edit.id) : unattune(c.items, edit.id) };
    case 'add_feature':
      return { ...c, features: [...(c.features ?? []), edit.effect] };
    case 'set_condition': {
      const set = new Set(c.conditions ?? []);
      if (edit.active) set.add(edit.condition);
      else set.delete(edit.condition);
      return { ...c, conditions: [...set] };
    }
    default:
      return c;
  }
}

/** Apply a batch of edits in order (an AI turn may emit several). */
export function applyModelEdits(c: EngineCharacter, edits: ModelEdit[]): EngineCharacter {
  return edits.reduce(applyModelEdit, c);
}
