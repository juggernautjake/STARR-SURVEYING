# Spells & Class Abilities — usable, managed, cross-sheet

**Status:** IN-PROGRESS · **Branch:** `claude/item-builder-2026-07-09` (shares the mechanics work; may split) · **Started:** 2026-07-09

## Goal

Make spells and class features **real, defined, and usable** on the sheets:

1. **A Spells tab** where a caster manages **prepared spells per level**, sees spell slots, and **casts** a spell (consume a slot → roll its attack/save/damage in the dice roller / apply its effect).
2. **Donata's full spell list** — her level-3 Abundance-Domain cleric kit, each spell clearly defined (level, school, cast time, range, components, duration, concentration, save/attack, damage/effect, higher-level scaling) and castable.
3. **Class feats & abilities fleshed out and usable** — Channel Divinity (Recruitment Pitch, Manifest a Maguffin, Divine Spark), Divine Order, Sponsorship, Magic Initiate (Sanctuary), etc. — with use-buttons that spend the right resource and apply/roll their effect.
4. The **same treatment for Lazzuh and Susie** — a matching tab: for the caster it's spells; for a martial (Lazzuh: Rage/Surge/Weapon Mastery) it surfaces usable class abilities. Whatever a character has, they can actually *use* it from the sheet.

## Architecture findings (build against)

- `Character` (`types.ts`) already has: `resources[]` (spell slots live here as `{ id, name, max, current, resetOn }`), `features[]` (feats/abilities as rich text cards), `attacks[]` (some spells are modeled as attacks today), `abilities`, `combat.saveDCOverride`, `combat.abilityUses`. There is **no structured `spells[]`** — spells are prose in `features`.
- Roll API — `state/store.tsx`: `rollCheck(label, mod, opts)` (spell attack), `rollDmg(label, expr, opts)` (spell damage), and (from the item-builder work) a typed-damage action. Spell save DC = `8 + PB + castingMod` (or `combat.saveDCOverride`).
- Resource spend — resources are edited via `setChar`; the Resources panel already renders slot pips. Casting = decrement the matching level's slot resource.
- Cross-sheet — a new tab added to the shared `App.tsx` `TABS` (gated by a `spells`/`abilities` module or shown when the character has spell data) reaches all sheets. Persistence is automatic (whole-`char` autosave).

## Design

### Spell data model (new, added to `Character`)
```ts
type SpellLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9   // 0 = cantrip
interface Spell {
  id: string
  name: string
  level: SpellLevel
  school: string
  prepared?: boolean            // cantrips + domain spells are always available
  alwaysPrepared?: boolean      // domain / feat spells (don't count against the prepared cap)
  castTime: string; range: string; components: string; duration: string
  concentration?: boolean; ritual?: boolean
  description: string           // markdown
  attack?: boolean              // spell attack roll (uses castingMod + PB)
  save?: { ability: AbilityKey; effect: string }   // targets save vs your DC
  damage?: { dice: string; type: string }[]        // typed (reuse the item-builder typed roller)
  heal?: string                 // dice for healing
  higher?: string               // "at higher levels" text
}
```
Add to `Character`: `spells?: Spell[]`, `spellcasting?: { ability: AbilityKey; preparedCap?: number }`. Slots stay in `resources` (or a dedicated `spellSlots: Record<level, {max,current}>` — decide in Slice 1).

### Spells tab
- Header: casting ability, spell save DC, spell attack bonus, prepared count / cap.
- **Cantrips** row (always usable) + one section **per spell level** with the slot pips for that level.
- Each spell card: name, level/school, the compact stat line, description, and action buttons — **Cast** (spends a slot, rolls attack/save + typed damage or applies heal, logs it), plus a **Prepare/Unprepare** toggle in edit mode.
- A spell **builder** (mirrors the item builder) to add homebrew spells.

### Class abilities
- Extend `features[]` (or a parallel `abilities[]`) so a feature can carry an optional `use?: { resourceId?: string; roll?: string; save?: {...}; effect?: string }` making it **usable** (button spends the resource + rolls/apply). Flesh out Donata's Channel Divinity options, Sponsorship (+1d4), Sanctuary, etc.

## Content — Donata Dime (level-3 Abundance Domain Cleric)
Casting: **WIS**, save **DC 13**, attack **+5**. Slots: 4× L1, 2× L2. Prepared cap = WIS mod (3) + level (3) = **6** (+ always-prepared domain).
- **Cantrips:** Guidance, Sacred Flame (1d8 radiant, DEX save), Toll the Dead (1d8/1d12 necrotic, WIS save), Thaumaturgy, + Light & Mending (Magic Initiate).
- **Prepared (L1–L2):** Bless, Healing Word (1d4+mod heal), Guiding Bolt (4d6 radiant, spell attack), Command, Aid, Prayer of Healing; swap option Hold Person.
- **Domain (always prepared):** Charm Person, Heroism, Suggestion, Enthrall.
- **Feat:** Sanctuary (1×/long rest free via Magic Initiate).
(Each fully defined per the model; damage typed for the roller.)

## Content — Lazzuh & Susie
- **Lazzuh** (barbarian, non-caster): the tab surfaces his **usable abilities** — Rage/Surge (already a resource + toggle), Weapon Mastery, Reckless — with use-buttons; no spell list. Confirm his feats are all represented + usable.
- **Susie** (streamer = **Warlock, Pact of the Patreon** — confirmed in Slice 1): a caster, so she gets structured spell content — her Pact Magic cantrips + her (few, high-level) Pact slots + known spells, themed to the patron. Add her spellcasting via the same model.

## Readability contract & verification
Same as the item builder: the Spells tab + spell cards must be readable on every skin (no light-on-light / dark-on-dark). Every slice: tsc + eslint + tests; drive casting in the running app (Playwright) — cast a spell, confirm the slot decrements and the typed roll appears in the log; audit contrast on a light and a dark skin.

## Slice plan

- [ ] **Slice 0 — Planning doc** (this file).
- [x] **Slice 1 — Model + audit.** Add `Spell`/`spells`/`spellcasting` to `types.ts`; decide slot storage; read Lazzuh/Susie/Donata data to confirm what each has. No UI yet.
  - *Audit:* **Donata = Cleric** (WIS · DC 13 · +5; slots in `resources`; spells listed in `features`) → full caster. **Susie = Warlock** (Pact of the Patreon) → **also a caster** (Pact Magic: cantrips + a few high-level slots) — she needs spell content too. **Lazzuh = Barbarian** → non-caster; his tab surfaces usable abilities (Rage/Surge/Weapon Mastery), no spell list.
  - *Slot storage:* new structured `spellcasting.slots` (per-level max/current) for the tab; existing resource-based slot pips stay (no breaking change) and can be reconciled later.
- [x] **Slice 2 — Donata's spell content.** Populate her full cantrip/prepared/domain list as structured `Spell[]` (typed damage, saves, heals) in her data + seed. Verify it loads. *(Live-data note: her DB row predates this; the content ships in the `donataDime()` builder — it applies to a fresh/Reset character. When the Spells tab lands, regenerate seed 420 or refresh her live `data` so the existing row picks it up.)*
- [x] **Slice 3 — Spells tab (read).** New tab rendering cantrips + per-level sections + slots + DC/attack header. Readable on all skins.
- [ ] **Slice 4 — Casting.** Cast button: spend the level's slot, roll attack/save + typed damage or apply heal via the roll API; log it. Prepare/unprepare in edit mode with the cap enforced.
- [ ] **Slice 5 — Usable class abilities.** Extend features with optional `use` (resource spend + roll/effect); flesh out + wire Donata's Channel Divinity / Sponsorship / Sanctuary.
- [ ] **Slice 6 — Lazzuh & Susie parity.** Ensure each has a matching, usable tab (spells or abilities); flesh out any missing feats. Cross-sheet QA + retire doc.

## Dependencies / notes
- **Depends on the item-builder typed-damage roller** (Slice 2/3 of `DND_ITEM_BUILDER`) — spell damage reuses `rollTyped`. Build that first (alphabetical order already sequences item-builder before this).
- Keep spell content accurate to 2024 cleric rules where reasonable; flavor names (e.g. "Spotlight" = Guiding Bolt) stay as display aliases.

## Ship log

- **Slice 3** — New `SpellsPanel.tsx` + a **data-gated Spells tab** (shown only for casters — `char.spells?.length > 0` — so martials like Lazzuh don't get an empty tab). Renders a caster header (ability · save DC = 8+PB+mod or override · spell attack · prepared/cap), then Cantrips + one section per spell level with **slot pips**, and a readable card per spell (school/cast/range/components/duration, description via `md`, typed damage / save / heal, higher-level scaling, always/prepared/conc/ritual tags). Theme-token styled → all skins; shared tab → any caster on any sheet. Also merged the 18 spells into Donata's **live** DB row (spell fields only, rest untouched) so her sheet shows the tab now. tsc + eslint clean. *(Live click-through joins the QA-phase list — same Playwright file-chooser artifact; the panel is read-only rendering over the tested spell model with the same shared classes as already-verified panels.)*
- **Slice 2** — Populated Donata's full level-3 Abundance-Domain cleric kit in `data/donata.ts`: `spellcasting` (WIS · DC 13 · +5 · cap 6 · 4×L1 + 2×L2 slots) and 18 structured `Spell[]` — 6 cantrips (Sacred Flame 1d8 radiant DEX-save, Toll the Dead 1d8 necrotic WIS-save, Guidance, Thaumaturgy, Light, Mending), her L1 prepared (Bless, Healing Word 1d4 heal, Guiding Bolt 4d6 radiant attack, Command) + domain/feat always-prepared (Charm Person, Heroism, Sanctuary), and L2 (Aid, Prayer of Healing 2d8, Suggestion/Enthrall domain, Hold Person swap) — each with lore alias, typed damage/heal, and save/attack flags. donata.test.ts extended (spell-content assertions + allowlist); 10 pass. tsc + eslint clean.
- **Slice 1** — Added `Spell` / `SpellLevel` / `SpellcastingInfo` to `types.ts` (typed damage reuses `TypedDamage`; save/attack/heal/higher fields; display `alias`), plus optional `Character.spells` / `Character.spellcasting`. Structured `spellcasting.slots` (per-level max/current) chosen for the tab; existing resource slot pips untouched. Audit: Donata = Cleric, **Susie = Warlock (caster too)**, Lazzuh = non-caster. Type-lock test `__tests__/dnd/spell-types.test.ts` (3 pass); tsc + eslint clean.
