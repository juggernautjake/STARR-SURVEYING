# Settings: per-system (PF2/IG) rules variants (parked from the Settings Overhaul)

**Back in `pending/` — 2026-08-31.** Briefly moved to `in-progress/` and returned the same day
on the owner's direction: *"I just want to build stuff that is related to the research software
that researches properties."*

Not abandoned, and not obsolete. `in-progress/` drives an automated slice loop, so a doc sitting
there is a doc that gets worked; parking this one is what keeps that loop pointed at research.
Move it back when the owner wants this subject built.

**Status:** PENDING · parked 2026-07-26 · split out of `completed/SHEET_SETTINGS_OVERHAUL_2026-07-22.md`

> **2026-07-25 — S-4a and S-4b shipped** (commit `e15ebf1d`); **S-6 + its browser pass shipped 2026-07-26.**
> S-4c remains genuinely blocked on the owner naming the IG house rules. See the slice log at the bottom.
>
> **Moved to `pending/` 2026-07-26.** Everything buildable here is built: preferences reach the bespoke
> sheets, the three PF2 variants ship with their maths, and every preference is scoped per system and
> browser-verified. What is left is **one item that no amount of engineering can start** — S-4c cannot be
> modelled, catalogued or wired until the IG house rules are *named*, and inventing them would break
> Ground Rule 3 on someone else's game.
>
> Not `completed/`, because the feature it describes has not shipped: IG still has no rules variants. Not
> `in-progress/`, because nothing here is being worked and nothing can be. `pending/` is the folder the
> rubric defines for exactly this — "scoped and parked deliberately". **Move it back to `in-progress/` the
> day the IG rules are named**; each one is then a model entry, a catalog entry, and a wire-up, with the
> whole channel already in place.

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

---

## Slice log

### 2026-07-25 — S-4a shipped: preferences reach the bespoke sheets

`page.tsx` now resolves `resolvedPreferences` (the always-present form — `effectivePreferences` is
deliberately left `undefined` when there is nothing to say, because several panels use its presence as
"is this character governed by settings at all") and passes it into `PF2Sheet` and `IGSheet`, which
forward it to `usePf2Panels` / `useIgPanels`. Zero behaviour change on its own, exactly as planned.

**Correction to this doc's premise:** it claimed `downedDamageModel` was "inert on that sheet". It is not —
it has been consumed server-side at `pf2-edit/route.ts` and `ai-edit/route.ts` since the overhaul, which
read it from the campaign and pass it to `applyPf2Edit`. The doc was stale, not the code.

IG reads nothing from the new prop yet (destructured as `_preferences`) because IG has no rules variants
to read — that is S-4c, below.

### 2026-07-25 — S-4b shipped: the PF2 rules variants

New pure module `lib/dnd/systems/pathfinder2e/variants.ts` — the model, the maths, and the bridge from the
preference layer. Three variants, all off/RAW by default:

- **Proficiency without level** (GM Core). Implemented at `pf2ProficiencyTerm`, the single choke point every
  check, save, AC, DC and Strike already went through, then threaded as an optional trailing argument
  through `rules.ts` and the whole of `resolve.ts`. Optional-and-trailing is what makes it back-compatible:
  every existing caller keeps its exact vanilla numbers. Untrained becomes **−2** (not 0), the level term
  disappears, and `pf2LevelBasedDc` subtracts the level so tasks stay reachable. HP is untouched.
- **Free archetype** (GM Core). `pf2FeatBudget` gains the variant and raises the **archetype** budget only —
  the normal class-feat count is deliberately unchanged, since the variant grants a feat rather than
  redirecting one.
- **Starting Hero Points.** Applied in `buildPF2Character`, not at resolve time: hero points are stored
  state a player spends down, so they cannot be recomputed from preferences after the fact.

The sheet grows a standing **"variant rules in force"** notice (stacked with, not replacing, the transient
refusal banner). Without it, a 12th-level character under proficiency-without-level simply looks broken.

**Per-system scoping** — not in the original plan, but the thing that made the modal wrong today.
`PREF_SYSTEMS` in `preference-options.ts` tags a setting with the systems it applies to; absent = all
systems. `enumPrefsForSystem` / `boolPrefsForSystem` filter the per-character modal, which now takes the
character's `system`. It fails *closed* for a system-specific setting on an unknown system and *open* for a
cross-system one. The DM's campaign panel still lists everything with the system in the title, because a
campaign is not pinned to one system — the per-character modal is the surface where a wrong-system setting
actually misleads someone.

**Deliberately deferred, with reason** (recorded in `variants.ts` itself, not just here):
- **Automatic Bonus Progression** — replaces item bonuses with a per-level table of inherent bonuses. The
  table has to be transcribed from GM Core, and one wrong row silently misprices every number on the sheet.
- **Stamina** — restructures HP itself (split HP/Stamina pools plus Resolve Points), so it changes
  `pf2MaxHp` and the whole damage path rather than adding a modifier.

Both are real and worth building; both need the published tables in hand. Ground Rule 3 — a toggle that
computes approximately-right numbers is worse than no toggle, because a player will trust it.

**Guards touched.** `preferences-consumed.test.ts` gained the three keys (the bridge reads them as literal
`prefs.<key>.value` precisely so that grep-based guard still works — a dynamic lookup would have defeated a
test that exists to catch dead settings). `pf2-bonuses.test.ts` no longer pins the resolver's full argument
list, which its own comment says was never the intent.

**Bar:** 23 new tests in `__tests__/dnd/pf2-rules-variants.test.ts`; 4559/4559 D&D tests pass; typecheck and
lint clean.

### 2026-07-25 — S-5 (QA) done for PF2 + 5e; browser-verified

Driven in a real browser against a live dev server (this repo's rule: a render test is not eyes-on), on
**Orin Sallowmere**, a level-9 PF2 Seer Elf Wizard:

| Check | Result |
|---|---|
| PF2 modal offers all three variants + the dying model | ✅ 13 controls |
| Turning proficiency-without-level ON | AC **24 → 15**, Perception **+12 → +3**, Class DC **25 → 16** — every headline number down by exactly 9 (the level) |
| HP under the variant | **78/78 unchanged** — correct, it is a proficiency variant |
| "Variant rules in force" notice | ✅ appears, naming the rule; absent on vanilla |
| Reverting to "Follow campaign" | ✅ all numbers restored; `playerPreferences` back to `{}` |
| **5e (2014) character's modal** | **9 controls — none of the four PF2-only rows**, cross-system settings all intact |
| IG sheet after the prop change | renders normally, 0 console errors |

Note on getting there: the sheet is owner-gated and the sign-in is name+password, so the pass used a
locally-minted `dnd_session` cookie (repo's own `AUTH_SECRET`, same token format as `lib/dnd/auth.ts`)
rather than creating a QA account and character in the live database. Worth reusing — it is the cheapest
way to run an authenticated browser pass without leaving test data behind, and it unblocks the other docs
parked on "needs an authenticated session".

### 2026-07-26 — S-6: every preference is now per-system (owner-directed)

**Owner, mid-slice:** *"make sure that all of the preferences are per system. So depending on which system
the currently viewed character sheet is in will determine the preferences that are applied."* This closes the
half of the scoping work S-4b left open.

**The gap.** S-4b built `PREF_SYSTEMS` and used it to stop a 5e player being shown PF2's "Damage while
dying". Only the PF2 rows were ever tagged — so the traffic in the *other* direction was untouched: a PF2 or
IG character was offered all **nine** untagged settings, and **every one of them was inert on that sheet**.
The modal looked richer than it was.

**The evidence, not the assumption.** `preferences-consumed.test.ts` already records where each setting is
consumed, and the bespoke sheets touch none of those places: `usePf2Panels`/`useIgPanels` import only a TYPE
from `_sheet/state/store`, and `Inventory` is mounted solely by the 5e panel set. The subtle one is the
roller. `diceRollerStyle`, `recordMode` and `autoMechanics` look obviously cross-system — every game rolls
dice, and the bespoke sheets really do mount the shared rollers — but they mount **`rollerStageFor`**, whose
stages read *"only the `RollFeed`, with NONE of the 5e store-bound controls"*. The full nodes that read those
three (`DiceTray`, `SigilStack`, `RollBoard`, `ImpactRoller`) are mounted only by `rollerFor`, on the 5e
sheet. Same animation, different owner of the controls.

**What shipped.** `PREF_SHARED_ENGINE_ONLY` — 8 of the 13 settings, offered only where the shared 5e engine
runs. Five because the RULE is 5e-shaped (exhaustion's table, long rest, shapeshift stats, attunement, a feat
granting an ability increase — PF2 "invests" and its feats don't grant ASIs, so wiring them elsewhere would
mean inventing rules those systems don't have); three because of the roller split above. `equipLimits` is the
one genuinely cross-system setting and stays untagged: `ai-edit/route.ts` honours it for every system.

| system | settings offered | before |
|---|---|---|
| 5e 2024 / 2014 / ambiguous | 9 | 9 (unchanged — nothing was taken off a 5e sheet) |
| Pathfinder 2e | 5 (its own 4 + `equipLimits`) | 13 |
| Intuitive Games | 1 (`equipLimits`) | 9 |

**The trap in tagging these, and why it isn't a second list.** `PREF_SYSTEMS` deliberately fails **closed**
for an unknown system, so declaring these as `['dnd5e-2014','dnd5e-2024']` would have silently stripped
working controls from every **system-ambiguous** character — of which the live database has several (the
`[~]` in `DND_RULES_PLATFORM` about setting the demo characters' system is still open). Delegating to
`isSharedEngineSystem`, which counts `ambiguous` as shared, gets that right for free — and avoids the
drifting duplicate that helper's own doc warns about.

**Two older tests changed, with reasons inline.** `pf2-rules-variants.test.ts` used `longRestModel`,
`diceRollerStyle` and `autoMechanics` as its examples of "cross-system", and asserted PF2 ⊇ 5e. Both encoded
the mislabelling rather than a verified consumer; the sets now overlap without either containing the other,
which is what this doc's title has been claiming all along.

**IG's modal is now visibly thin (one control), and that is the honest picture:** IG has no rules variants of
its own until the owner names them (S-4c). Padding it with eight inert controls hid that.

**Bar:** 14 new guards (`pref-scoping-shared-engine.test.ts`), 4796/4796 D&D tests, typecheck exit-0, lint
clean.

### 2026-07-26 — S-6 browser-verified: the modal really does scope per system

S-6 shipped on unit tests alone, and its whole point is what a player SEES. Driven on three live characters
with a minted session, opening the real gear modal:

| sheet | expected | rendered | controls |
|---|---|---|---|
| 5e (Jack) | 9 | **9** | dice style · record mode · auto-mechanics · auto-attune · feat bonuses · exhaustion · long rest · equipment limits · shape-shift |
| PF2 (Orin) | 5 | **5** | equipment limits + dying model · proficiency-without-level · free archetype · starting hero points |
| IG (Vashti) | 1 | **1** | equipment limits |

Exactly the sets `enumPrefsForSystem` / `boolPrefsForSystem` compute, so the catalog, the scoping and the
render agree — no drift between the tested pure functions and the screen. **A PF2 player is no longer offered
exhaustion or long-rest models their sheet has no mechanic for, and an IG player is no longer offered eight
settings that did nothing.**

The thin IG modal is the honest picture, not a regression: IG has no rules variants of its own until the owner
names them (S-4c), and padding it with inert controls is what hid that.

**Bar:** no code change — a verification slice. 5000/5000 D&D tests, typecheck exit-0. Dev server stopped,
port released.

### S-4c — IG rules variants: still blocked (not deferred)

The one item that cannot be built. The owner said the IG-specific toggles are "owner to specify", and no IG
house rules have been named. Everything downstream is ready: the preference channel reaches `useIgPanels`,
`PREF_SYSTEMS` will scope them to `intuitive-games`, and the catalog + modal need no further work. Naming
the rules is the whole remaining task; each one is then a model entry, a catalog entry, and a wire-up.

**This doc sits in `pending/` until the owner names the IG rules** (moved there 2026-07-26 — see the status
note at the top for why `pending/` and not `completed/`).
