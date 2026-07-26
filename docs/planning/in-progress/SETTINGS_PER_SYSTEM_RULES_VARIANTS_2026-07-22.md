# Settings: per-system (PF2/IG) rules variants (parked from the Settings Overhaul)

**Status:** PENDING · parked 2026-07-22 · split out of `completed/SHEET_SETTINGS_OVERHAUL_2026-07-22.md`

## Why this is parked (not abandoned)

The Settings Overhaul shipped its whole framework and everything that could be wired now: a per-character
gear modal (S-3) over a persisted player-preferences model + `/preferences` endpoint (S-2), the DM
campaign-lock override as a resolve-time overlay (S-DM), and the 10 existing (mostly 5e/cross-system)
settings driving the sheet — including the fix that made preferences reach a normal sheet at all. What
remains is the PF2/IG-SPECIFIC rules variants the owner asked for, and they are parked deliberately
because (a) part is blocked on owner input and (b) the rest is deep, risky per-engine work whose partial
slices deliver no standalone value.

## What's blocking / why it's deep

1. **IG house rules are undefined.** The owner said the IG-specific toggles are "owner to specify." Until
   the actual IG house rules are named, there is nothing concrete to model or wire.
2. **Preferences don't reach the bespoke sheets yet.** `PF2Sheet`/`IGSheet` are prop-driven and are NOT
   passed `preferences` (only the 5e engine is, via `SheetRoot` → `CharacterProvider`). So step one is
   threading the resolved `EffectivePreferences` into `PF2Sheet`/`IGSheet` → `usePf2Panels`/`useIgPanels`
   → `pf2ResolveAll` / the IG resolver — the bespoke-sheet analogue of the SheetRoot fix.
3. **Each PF2 variant is an engine-wide change.** e.g. *proficiency without level* means gating the
   `pf2Level(level)` term inside `pf2Proficiency(rank, level)`, which is called from ~18 sites across
   `resolve.ts`/`rules.ts` (every check, save, AC, DC, strike) — so it must thread a flag through the
   whole resolve layer and be re-verified against every number. *Free archetype* adds a feat slot per even
   level (touches `eligibility.ts`); *automatic bonus progression* replaces item bonuses; *stamina* adds a
   resource pool. Each is real, careful work on the already-shipped PF2 sheet, for an advanced/niche rule.

## The work when it's picked up

- **S-4a — plumb preferences into the bespoke sheets.** Pass `effectivePreferences` from `page.tsx` into
  `PF2Sheet`/`IGSheet`, and read it in `usePf2Panels`/`useIgPanels`. Zero behaviour change until a variant
  reads it. (This also lets the existing PF2-tagged setting `downedDamageModel` finally drive the PF2
  dying mechanic instead of being inert on that sheet.)
- **S-4b — PF2 rules variants.** Add each to the model (`preferences.ts`) + the shared catalog
  (`preference-options.ts`, tagged PF2-only so the modal shows it only for PF2 characters) and wire the
  mechanic: proficiency-without-level, free archetype, automatic bonus progression, stamina, starting
  hero-point count. Verify each against the PF2 numbers it changes.
- **S-4c — IG rules variants.** Once the owner specifies the IG house rules, model + catalog + wire them
  the same way.
- **S-5 (cross-system) — QA.** Each system's rules variants render in the modal, persist, honour the DM
  lock, and drive their mechanic.

## Done means
- The per-character gear modal shows each system's OWN rules variants (only for that system), and every one
  drives its mechanic on the bespoke sheet, with the DM lock honoured. Standing bar green per slice.
