# Homebrew Item / Equipment Builder

**Status:** IN-PROGRESS · **Branch:** `claude/item-builder-2026-07-09` (off main) · **Started:** 2026-07-09

## Goal

A full, robust homebrew **item builder** available on **every** character sheet, that lets a player/DM create, edit, and remove inventory items of several kinds — and have their mechanics actually computed and used in the digital dice roller and derived stats:

- **Weapons** — title, description, damage dice + damage **type**, ability/proficiency, plus optional **bonus damage dice of other types** (e.g. a sword that does `2d8 slashing` + `1d6 poison`). A **Roll** button rolls it and shows a **per-type breakdown** ("12 total — 8 slashing, 4 poison") in the dice log.
- **Consumables** — healing, temp HP, or **status effects**; a **Use** button applies the effect and decrements quantity.
- **Armor / shields / defensive items** — modify **AC** (and optionally other stats) when equipped.
- **Wondrous / misc magic items** — arbitrary passive **effects** (bonuses to AC, saves, abilities, skills) while equipped/attuned.

Works for all sheets (Lazzuh, streamer, Donata, generic) because the inventory/attacks/dice are shared engine components.

## Architecture findings (what we build against)

From the engine map (see the completed exploration; key files cited inline):

- **Live item model** — `app/dnd/_sheet/types.ts`: `InvItem` (`:68`) `{ id, name, desc, qty, tags[], use? }`; `Attack` (`:3`) with a single `damage` string; `combat.ac` (`:126`) is a **raw stored number** (no equipment derivation today). Inventory already has full CRUD gated by `editMode` (`components/Inventory.tsx`).
- **Dormant engine** — `app/dnd/_sheet/engine/*` is a fully unit-tested equipment/effects/AC pipeline (`EquipItem`, `ArmorSpec`, `WeaponSpec`, `Effect`, `computeAC`, `deriveCharacter`) that **nothing in the live sheet imports**. We will **reuse its pure types + `computeAC`/effect resolvers** rather than migrate wholesale.
- **Dice** — `lib/dice.ts`: `parseDice` (`:15`) already handles multi-group expressions (`"2d8+1d6"`); `rollDamage` (`:54`) rolls them but groups the breakdown **by die size, not by damage type**. The **one genuinely new primitive** is typed damage.
- **Roll trigger API** — `state/store.tsx`: `rollDmg(label, expr, opts)` (`:487`), `rollCheck` (`:457`), `rollExpr` (`:511`); results are `RollEntry` (`:16`) with a single free-text `tag`. `stage()`/`commitRoll()` drive the animation + log. We add a typed-damage action here.
- **Persistence** — the whole `char` object autosaves as one jsonb `data` field (`store.tsx:360`), so **any new optional field on `InvItem` persists automatically** with no API change. `route.ts` stores `data` wholesale (no content validation).
- **Cross-sheet** — Attacks/Gear(Inventory)/Combat tabs + DiceTray are un-gated in `App.tsx`, rendered for every `sheet_type`. Building on the shared `Inventory`/`Attacks`/store surfaces reaches all characters automatically.

## Design decision

**Extend the live `InvItem` model** with optional, typed sub-blocks, and **reuse the engine's pure helpers** (`Effect`, `computeAC`, resolvers) — the fastest path to a robust, persisted, cross-sheet builder without a risky full-engine migration.

### Extended `InvItem` shape (added fields, all optional → backward compatible)
```ts
kind?: 'weapon' | 'armor' | 'shield' | 'consumable' | 'wondrous' | 'gear'
equipped?: boolean
attuned?: boolean
weapon?: {
  ability?: AbilityKey            // to-hit + damage ability (default STR, or DEX if finesse)
  proficient?: boolean
  toHitBonus?: number
  range?: string
  damage: { dice: string; type: string }        // primary, e.g. { dice:'2d8', type:'slashing' }
  bonus?: { dice: string; type: string }[]       // e.g. [{ dice:'1d6', type:'poison' }]
  properties?: string[]                           // finesse, versatile, thrown, …
}
armor?: {                                          // for kind 'armor' | 'shield'
  category: 'light' | 'medium' | 'heavy' | 'shield'
  baseAC?: number                                  // body armor base (or shield bonus)
  dexCap?: number | null                           // medium=2, heavy=0, light=null
  stealthDisadvantage?: boolean
}
consumable?: {
  effect: { kind: 'heal' | 'temp' | 'status' | 'custom'; dice?: string; status?: string; note?: string }
}
effects?: Effect[]   // reuse engine Effect — passive bonuses while equipped/attuned (ac, saves, abilities, skills)
```
(The legacy `use?` stays working; new consumables use `consumable.effect`.)

### Typed damage (the new dice primitive)
- Extend `lib/dice.ts`: add optional `type` to `DieResult`/`DamageRoll` groups, and a `rollTyped(segments: {dice,type}[], crit)` that rolls each segment and returns per-type subtotals + a combined breakdown.
- Add `state/store.tsx` action `rollWeaponDamage(item, {crit})` → composes primary + bonus segments (folding the ability mod into the primary type), commits ONE `RollEntry` whose breakdown reads e.g. `slashing 2d8[3,5]+3=11 · poison 1d6[4]=4` and `total 15`.

## Readability contract

The builder UI (a form/modal with many fields, dropdowns, dice inputs) must be **fully readable on every skin** — light-on-light and dark-on-dark are both failures. Use shared sheet classes / theme tokens (`--panel`, `--ink`, `--line`, `.btn`, inputs) so each skin styles it; never hard-code a dark or light color that won't adapt. Audit the builder on Lazzuh (dark), Donata (light candy), and generic.

## Verification protocol (every slice)

1. `npx tsc --noEmit` + `eslint` clean on changed files; add/extend unit tests for dice + any pure logic (`__tests__/dnd/`).
2. Where UI/behavior changed: drive it in the running app (Playwright) on at least one sheet — create an item, roll it, confirm the typed breakdown / AC change / consumable effect actually happens, and read the builder for contrast on a light skin and a dark skin.
3. Commit + push; annotate this doc's ship log.

## Slice plan

- [x] **Slice 0 — Planning doc** (this file).
- [x] **Slice 1 — Data model.** Extend `InvItem` (`types.ts`) with the optional fields above; reuse/import the engine `Effect` type. No behavior change yet; existing items still render. Typecheck + a type-level test.
- [ ] **Slice 2 — Typed dice engine.** `lib/dice.ts`: typed `DieResult`/`DamageRoll` + `rollTyped()`; unit tests covering `2d8 slashing + 1d6 poison`, crit doubling per segment, flat mod attribution, and single-type back-compat.
- [ ] **Slice 3 — Roll action + weapon roll button.** `store.tsx` `rollWeaponDamage(item, opts)`; a **Roll / Crit** button on weapon items in Inventory (and mirror into Attacks) that shows the per-type breakdown in the dice log. Verify a 2d8+1d6-poison weapon rolls and breaks down correctly.
- [ ] **Slice 4 — The builder UI.** Replace Inventory's minimal add-form with a real **Item Builder**: pick a `kind`, fill title/description/qty, then kind-specific fields (weapon dice+type+bonus-dice rows; armor category+AC; consumable effect; wondrous effects). Edit existing items through the same builder. Robust validation. Readable on all skins.
- [ ] **Slice 5 — Armor/shield → AC.** A `useMemo(computeAC)` over equipped armor + shield + AC `effects` (reuse `engine/armor.ts`), surfaced in `CombatPanel` with a source note; equip/unequip updates AC live. Keep a manual-AC override escape hatch.
- [ ] **Slice 6 — Effects → derived stats.** Apply equipped/attuned item `effects` (bonuses to saves/abilities/skills) via the engine resolvers, shown where those stats render. Gate by `equipped`/`attuned`.
- [ ] **Slice 7 — Consumables.** `consumable.effect` Use flow: heal / temp HP / apply a **status** (into the condition tracker) / custom note; decrement qty; log the result.
- [ ] **Slice 8 — Cross-sheet QA + polish.** Verify create→roll→equip→use on Lazzuh, Donata, and a generic sheet; regression tests; final readability + UX pass; retire this doc to `completed/`.

## Risks / notes

- **Scope**: this is large; slices 1–4 deliver the headline value (build items + typed weapon rolls). 5–7 add the derived-stat integration. Ship incrementally.
- **AC override**: some sheets set `combat.ac` by hand (e.g. Donata's breastplate). Computed AC must not clobber a deliberate manual value — provide a toggle / only compute when armor items are equipped.
- **Persistence is automatic** but means old exports lack the new fields — all new fields optional, all readers defensive.
- **Don't migrate the whole engine** — reuse its pure functions; keep the live `InvItem` as the stored shape.

## Ship log

- **Slice 1** — Extended `InvItem` in `types.ts` with `kind`/`equipped`/`attuned`/`weapon`/`armor`/`consumable`/`effects` (+ `TypedDamage`, `WeaponStats`, `ArmorStats`, `ConsumableStats`, `ItemKind`), reusing the engine `Effect` type. All fields optional → legacy items and old exports still valid. Persists automatically via the whole-`char` autosave. Type-lock test `__tests__/dnd/item-builder-types.test.ts` (4 tests, green); tsc clean.
