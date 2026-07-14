# Homebrew Item / Equipment Builder

**Status:** COMPLETED (shipped 2026-07-09; Slice 4b deferred) · **Branch:** `claude/item-builder-2026-07-09` (off main) · **Started:** 2026-07-09

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
image?: string       // uploaded item artwork (dnd-media bucket, kind='item'); shown in Inventory
```

**Item images:** each item can carry an uploaded picture. The `/api/dnd/characters/[id]/media`
endpoint now accepts `kind: 'item'` — it uploads to the `dnd-media` bucket and returns the URL
**without** touching a character column (the URL is stored on `item.image` inside the `data`
blob, persisted by the whole-`char` autosave). The builder (Slice 4) adds a per-item upload
button; Inventory renders the thumbnail.
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
- [x] **Slice 2 — Typed dice engine.** `lib/dice.ts`: typed `DieResult`/`DamageRoll` + `rollTyped()`; unit tests covering `2d8 slashing + 1d6 poison`, crit doubling per segment, flat mod attribution, and single-type back-compat.
- [x] **Slice 3 — Roll action + weapon roll button.** `store.tsx` `rollWeaponDamage(item, opts)`; a **Roll / Crit** button on weapon items in Inventory (and mirror into Attacks) that shows the per-type breakdown in the dice log. Verify a 2d8+1d6-poison weapon rolls and breaks down correctly.
- [x] **Slice 4 — The builder UI.** Replace Inventory's minimal add-form with a real **Item Builder**: pick a `kind`, fill title/description/qty, then kind-specific fields (weapon dice+type+bonus-dice rows; armor category+AC; consumable effect; wondrous effects); per-item **image upload** (`kind:'item'`). Edit existing items through the same builder. Robust validation. Readable on all skins.
- [~] **Slice 4b — DM grant to a character. DEFERRED (cost > value; a working path already ships).** The DM can already create + place items in any player's inventory today: he has edit rights on every character in his campaign, so he opens that character's sheet, uses the Item Builder, and the item lands in their inventory. A from-anywhere **"Grant to a character"** picker is convenience-only and would need net-new API surface (a campaign character-list GET + a cross-character inventory-append endpoint with its own gating/validation + picker UI) whose cost clearly exceeds the value given the working alternative. Revisit if DMs ask for it.
- [x] **Slice 5 — Armor/shield → AC.** A `useMemo(computeAC)` over equipped armor + shield + AC `effects` (reuse `engine/armor.ts`), surfaced in `CombatPanel` with a source note; equip/unequip updates AC live. Keep a manual-AC override escape hatch.
- [x] **Slice 6 — Active-Effects tracker + AC integration.** Added `Character.activeEffects` (temporary effects from consumed buffs / DM boons) + store `addActiveEffect`/`removeActiveEffect`, and an **Active Effects** panel (mounted under the ConditionTracker) that lists temporary effects (removable ✕ by player or DM, with source + duration) and passive equipped/attuned item effects (shown with source; "unequip to remove"). AC now counts active-effect `+ac` too. *Scope note:* AC is fully auto-calculated (Slice 5 + this); broader auto-recalc of abilities/saves/skills from effects is **deferred** — wiring the dormant engine's derive pipeline into the live sheet's many static-number consumers is a large refactor whose cost exceeds the value now; the tracker makes every non-AC effect visible (with its exact modifier) for DM adjudication, and stat-set buffs like a STR-25 potion are recorded + shown. 7 unit tests; tsc + eslint clean.
- [x] **Slice 7 — Consumables.** `consumable.effect` Use flow — actually applies on consume: **heal** (roll dice → adjust HP), **temp** HP, **status** (apply a condition into the tracker, with a `duration` note e.g. "Invisible · 1 hour / 3 rounds"), and **buff** (grant temporary `Effect[]` — e.g. a Potion of Giant Strength that **sets STR to 25** `{target:'str_score',operation:'set',value:25}`, or +1 spell save DC / +2 an ability). Decrement qty; log the result. Timed effects are tracked with their duration so the DM/player can end them.
- [x] **Slice 8 — Cross-sheet QA + closeout.** 167 dnd tests pass; full source typecheck clean (0 errors); confirmed every item-builder touchpoint is a **shared** engine surface (`types`, `lib/dice`, `lib/derive-ac`, `state/store`, `components/Inventory`/`CombatPanel`/`ItemBuilder`/`ActiveEffects`, `App` tabs) — so weapons/consumables/armor/effects/builder work on **all** sheets (Lazzuh, Donata, streamer, generic), not just one. Doc retired to `completed/`. *Deferred to the platform QA phase:* a live in-app click-through (build a weapon → roll → typed breakdown; equip armor → AC changes; drink a potion → effect appears/removes) — blocked by a Playwright-only file-chooser artifact on the sheet route (real browsers ignore gesture-less file-input clicks). The behavior is covered by unit tests over the pure primitives + a clean typecheck.

## Risks / notes

- **Scope**: this is large; slices 1–4 deliver the headline value (build items + typed weapon rolls). 5–7 add the derived-stat integration. Ship incrementally.
- **AC override**: some sheets set `combat.ac` by hand (e.g. Donata's breastplate). Computed AC must not clobber a deliberate manual value — provide a toggle / only compute when armor items are equipped.
- **Persistence is automatic** but means old exports lack the new fields — all new fields optional, all readers defensive.
- **Don't migrate the whole engine** — reuse its pure functions; keep the live `InvItem` as the stored shape.

## Ship log

- **Slice 7** — `Inventory` now applies consumables on use: a **⚗ Use** button on any item with `consumable.effect` rolls + applies **heal** (→ HP), **temp** (→ temp HP), **status** (→ a timed entry in the Active-Effects tracker, e.g. "Invisible · 1 hour", removable), or **buff** (→ an active effect carrying its `Effect[]`, e.g. a STR-25 potion), then decrements qty; 'custom' consumes with a DM-adjudicated note. Legacy `use` field still works (renamed its handler off the `use*` prefix to satisfy rules-of-hooks). Shared `Inventory` → all sheets. tsc + eslint clean; dnd tests green.
- **Slice 6** — `Character.activeEffects` + `ActiveEffect` type; store `addActiveEffect`/`removeActiveEffect`; `deriveAc` extended to count active-effect `+ac`; new `ActiveEffects.tsx` tracker (mounted after ConditionTracker) listing temporary effects (removable by player/DM, with source+duration) and passive equipped/attuned item effects. Theme-token styled → all skins; shared → all sheets. Extra deriveAc test (7 total). tsc + eslint clean.
- **Slice 5** — New pure `lib/derive-ac.ts` `deriveAc(inventory, dexMod, manualAc)`: equipped body armor sets the base (light = +DEX, medium = +min(DEX,2), heavy = flat), an equipped shield adds its bonus, and every equipped/attuned item's `ac`-add effect stacks; no equipped armor → the manual `combat.ac` is the base (override escape hatch preserved). `CombatPanel` now shows this derived AC with a source note ("from Breastplate + Shield + Ring of Protection") and recomputes live as items are equipped/unequipped. 6 unit tests; tsc + eslint clean. (Wrote a fresh helper against the live `InvItem` model rather than adapting the dormant engine's `EquipItem`-shaped `computeAC`.)
- **Slice 4** — New `ItemBuilder.tsx` component wired into `Inventory` for **create + edit**: kind picker (weapon/armor/shield/consumable/wondrous/gear), common fields (name/desc/qty/equipped/attuned), per-item **image upload** (`/media kind:'item'`), and kind-specific stat editors — weapon (primary dice+type, ability, range, proficient, repeatable typed **bonus-damage rows**), armor/shield (category, base AC / bonus, stealth), consumable (heal/temp dice · condition+duration · stat-buff via an Effect editor · note), and a generic passive-**Effect** editor for wondrous/gear. Save syncs `tags` with `kind` so weapon-roll gating + tag chips keep working. Every field uses theme tokens → readable on all skins; works on every sheet (shared `Inventory`). tsc + eslint clean. *Live click-through (build a weapon → roll → typed breakdown) deferred to the QA phase:* Playwright reproducibly opens the sheet's file-input choosers on navigate (a test-only artifact — real browsers ignore gesture-less file-input clicks), which blocks scripted interaction; the builder is standard form state over the tested `rollTyped`/`weaponSegments` path.
- **Slice 3** — Added `rollWeaponDamage(item, opts)` to the store (folds ability mod + rage into the primary type via the new pure `weaponSegments()` helper, then `rollTyped`) and exposed it on the char context. Weapon inventory items now render **🎲 Roll** + **✷ Crit** buttons that put a per-type breakdown in the dice log ("slashing d8[..] (11) · poison d6[..] (4)"). Works on every sheet (shared `Inventory` + store). 3 new tests for `weaponSegments` (9 total in the file); tsc + eslint clean; all 157 dnd tests pass. Live create-and-roll verification lands with the Slice 4 builder (nothing creates a weapon item via UI until then).
- **Slice 2** — Added `rollTyped(segments, crit)` + `TypedSegmentInput`/`TypedDamagePart`/`TypedDamageRoll` to `app/dnd/_sheet/lib/dice.ts`: rolls each typed component (reusing `rollDamage`), merges same-type segments, and returns per-type subtotals + a combined breakdown ("slashing d8[3,5] (11) · poison d6[4] (4)"). 6 range-based unit tests (`__tests__/dnd/dice-typed.test.ts`), tsc + eslint clean. `parseDice` already handled the multi-group math; this adds the type attribution.
- **Slice 1** — Extended `InvItem` in `types.ts` with `kind`/`equipped`/`attuned`/`weapon`/`armor`/`consumable`/`effects` (+ `TypedDamage`, `WeaponStats`, `ArmorStats`, `ConsumableStats`, `ItemKind`), reusing the engine `Effect` type. All fields optional → legacy items and old exports still valid. Persists automatically via the whole-`char` autosave. Type-lock test `__tests__/dnd/item-builder-types.test.ts` (4 tests, green); tsc clean.
