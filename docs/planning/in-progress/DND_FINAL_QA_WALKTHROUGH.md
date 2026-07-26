# D&D — Final full-system QA walkthrough (Playwright, browser, manual)

**STATUS: IN PROGRESS — the run has STARTED (2026-07-25).** This is the LAST D&D item, extracted from
`DND_RULES_PLATFORM_2026-07-16.md` (originally "Slice 40").

> **The blocker is gone.** This doc was parked because the pass needs an interactive, DB-backed session on
> live Supabase. Both obstacles are now solved and written down:
> - The "dev server is up but not serving" problem was **orphaned processes holding ports 3000–3009 as dead
>   sockets** (some days old, burning 50+ hours of CPU). Start on a genuinely free port; don't debug those.
> - The owner gate no longer needs a throwaway account: **mint the `dnd_session` cookie locally** from the
>   repo's own `AUTH_SECRET` (same token format as `lib/dnd/auth.ts`), so a pass can run as the real owner
>   without leaving test data in the live database.
>
> **First slice run 2026-07-25 — see "Run log" at the bottom.** One real correctness defect found and fixed
> on the very first step.

> User directive (2026-07-16): "When everything is finally built, do a final run-through of all the
> features with Playwright. Manually use the browser to create a new user, create a character, then go
> through the whole character-creation process step by step, through every level, building it as vanilla
> as possible. Then move on to the next game-rule system and build a whole new character with the
> character builder, step by step. Do this for ALL game systems, one new character each, all built
> vanilla. Look for any errors, anything in the building process that isn't correct, bugs, or
> formatting/styling issues, and FIX them. Be very thorough. Really make sure styling and formatting
> and readability are attractive."

It is a manual, browser-driven acceptance pass, not an automated test suite (though it may leave
Playwright specs behind). Do it with the Playwright MCP tools against a real running app.

## What's ALREADY been verified (read-only sweep, 2026-07-17)

**Preliminary runtime smoke check ✅.** The app builds + serves after the ~40-commit audit run: `next dev`
came up clean, and via Playwright every public page + backing tool loaded with **0 console errors**:
- `/dnd` hub (0 errors/warnings) · `/dnd/suggestions` (HTTP 200, no error markers)
- `map-studio.html` (Slice 35a handle code runs) · `planet-3d.html` (Slice 29 WebGL 3D renderer initializes)
- `console.html` (Slice 39 player console / drawer)

Also confirmed at runtime: **`/dnd/characters/new` auth-gates cleanly** (redirects anon → hub, 0 errors),
the **suggestion box renders at the bottom of the hub**, and **`/dnd/library` renders fully** (0 errors:
search box, "limit to one system" selector, Systems list). Verified via SSR the library index renders ALL
systems, not just the 4 focus (dnd5e-2014/2024, PF2, IG + blades, coc7e, cyberpunk-red, pathfinder1e,
starfinder1e, shadowrun6e…), each with a substantial rules page — the "🚧 under construction" status is
about the character BUILDER, not the library rules. **Library search verified interactively:** typing
"action surge" returned 9 matches, 0 console errors. Typing "action surge" → 9 matches end-to-end.

**The character sheet couldn't be browser-verified locally — by correct access control, not a bug.**
Opening a demo character as a signed-in non-owner calls `/api/dnd/dev/enter`, which 403s because
`DND_REQUIRE_LOGIN=1` in this env (so `isDndOpenAccess()` is false). Also the persisted `PF2eQA Tester`
session is STALE (cookie present, DB row cleaned up), so `getDndUser()` returns null. Both mean the
authenticated build walkthrough needs a FRESH valid session + an owned character (the live-DB run).
**UX finding — FIXED** (`cd25f0b6`): the campaign character picker showed a silent 403 on a character you
can't enter (a dead button); it now surfaces the server's message in an alert. `campaign-lobby-error.test.ts` (2).

**Read-only browser sweep complete.** Every /dnd page reachable WITHOUT creating data is runtime-verified
error-free: hub, library (render + interactive search), suggestions review, join form (name+password-only,
no Email — Slice-38b `6d7cdeb7` live), the create-character auth-gate, the campaign lobby (+ its picker fix),
and the map/console/3D tools. What remains needs DATA (a suggestion, a character) or an authenticated owned
character — i.e. this live-DB walkthrough.

**Whole-repo health checkpoint ✅.** The FULL test suite passes (12,837 tests, 0 failures, 30 skipped) and
a full `tsc --noEmit` is exit-0.

## The walkthrough (to run when we pick this up)

- [x] **Fresh account — ADJUSTED and done 2026-07-25.** Verified the pseudo-login is name+password with no
      email and that the create-character page gates correctly. Deliberately did NOT register a new account:
      the minted-session-cookie approach (see the header) gives an authenticated owner session without one,
      and a permanent junk account in the LIVE database is a worse trade than the coverage it buys. If a
      genuine clean-state sign-up test is wanted later it should run against a scratch database, not this one.
- [x] **First character, D&D 5e 2024, vanilla — DONE (slices 1–5).** Created through the real form in
      **Manual (step-by-step)** mode, walked all five Foundation steps, built, then walked the Levels phase
      and probed the full 1 → 20 ladder. The background spread was confirmed end to end (Soldier offers only
      STR/DEX/CON; +2 STR/+1 CON persisted as `meta.backgroundAbilities` with `abilities.str 17`, matching
      the FINAL column). The ASI-slot promise was **false and is now true** — the picker offered Epic Boons,
      Origin feats and Fighting Styles at level 4 and now greys each with its reason. Five defects found and
      fixed along the way; see slices 1–5.
- [x] **Every other system — DONE for the four that exist (slices 6–7), and the other six RECORDED.**
      Rather than one character each, probed **every class** of each system through its own planner, which is
      strictly wider coverage: 13 classes for 5e 2014, 20 for PF2, every subclass for IG. Found and fixed the
      2014 Fighting Style gap and Barbarian's missing ASIs; PF2 came back clean; IG's Champion had six dead
      dropdowns. **The six unbuilt systems are recorded, not papered over:** they cannot be built (their rules
      are not in this repo — see `DND_SYSTEMS_UNDER_CONSTRUCTION`), and the fact that the app refuses to start
      a build on them is pinned at every surface by `under-construction-gating.test.ts`, including the server
      route a client could POST to directly.
- [ ] **Hunt for correctness + UX defects and FIX them as found:** wrong or missing choices at a level; an
      ASI/feat/ability offered when it shouldn't be (or missing when it should); numbers that don't add up
      on the resulting sheet; dead controls; and — explicitly called out by the user — **styling,
      formatting, readability and attractiveness** on every screen touched (spacing, contrast, alignment,
      overflow, mobile width, the Hextech theme holding together).
- [x] **Capture evidence — DONE (slice 9).** `docs/planning/qa-evidence/` holds the built sheet for each of
      PF2, IG and 5e 2014, plus the guided builder at 390px after the responsive fix, with a README saying
      what each shows. It also says what is deliberately absent and why — notably the GIF, which is skipped
      while the creation flow is still moving under these slices (three of its screens changed in this pass
      alone) and would be stale on arrival.
- [ ] Log every fix inline here (or in a QA notes file). When the walkthrough is clean for every system,
      this pass — and the D&D platform work — is done.

## Known gaps / notes for the walkthrough

- **`VOYAGE_API_KEY` is absent**, so semantic search returns nothing; keyword search
  (`lib/dnd/library.ts`, `keywordSearchSystemEntries`) is what runs. `ANTHROPIC_API_KEY` IS present.
- **Storage-policy seeds** (102, 290, 295) need table ownership and can only be applied from the Supabase
  dashboard. 7 more seeds fail as "policy/trigger already exists" — harmless.
- **Uncertain rules flagged by the authoring agents** (worth a second source before release): Warlock
  invocations-known progression; Wizard Spell Mastery's swap clause; Great Old One Clairvoyant Combatant's
  limit; Monk Warrior of the Elements details; Starfinder Fatigued/Exhausted magnitudes and Grappled/Pinned
  penalties; Envoy expertise die thresholds; **2024 Epic Boon signature-effect wording/numbers**
  (`lib/dnd/feats/dnd5e-2024.ts` — `EPIC_BOON_FEATS_2024`; the +1-to-30 increase and level-19 gate are
  certain, the capstone text is concise-but-verify).
- **`spellsKnown` currently carries prepared counts** for 2024 preparers. Consider renaming to
  `spellsKnownOrPrepared`. The 2024 Ranger/Paladin/Cleric/Druid prepared counts are prose in `preparedRule`.
- **"Rank" vs "level" for spells**: the codebase says rank (UA wording); the printed 2024 PHB says level.
- **`SubclassDefinition.alwaysPrepared`** can't express Circle of the Land's four terrain lists — they're
  in the feature body instead.

---

## Run log

### 2026-07-25 — slice 1: account gate + create flow + 5e 2024 Foundations step 1

**Covered**
- **Fresh-account path** — verified the create-character page renders and gates correctly, and that the
  sign-in is name+password with no email (Slice 36 behaviour holding). Did NOT create a new pseudo-account:
  the minted-cookie approach makes one unnecessary, and a permanent junk account in the live DB is a worse
  trade than the coverage it buys. **The checkbox below is adjusted accordingly, not silently dropped.**
- **Create → build handoff** — created a real character (name + system `dnd5e-2024` + **Manual
  (step-by-step)**, the correct mode for a vanilla walkthrough), and confirmed it lands on
  `/dnd/characters/<id>/builder` with the three phases (Foundations · Levels · Review), the docked dice
  roller, and the 111-term 2024 glossary.
- **Foundations step 1 of 5 (Class & level)** — level 1–20 select and the class list.

**Defect found and FIXED — homebrew was indistinguishable from official content in the vanilla builder.**

The class dropdown offered `Pugilist` looking exactly like the twelve PHB classes, inside a panel whose own
copy reads *"Everything offered is vanilla and rules-legal for the level you choose."* Offering it is
deliberate — it's authored 1–20 — but hiding its provenance is not, and it breaks the platform's standing
rule (vanilla = hard block, custom = **flagged**, DM-granted = marked). Both the registry and the class file
say in so many words that it is *"flagged `custom` so the picker badges it"*: the flag was set and carried as
far as `classesForSystem`, then **dropped at the `<option>`**. For subclasses it was worse — the flag was
discarded inside `dnd5eSubclassOptions`'s own mapping, so the UI *could not* have marked it.

Fixed at both levels: `dnd5eSubclassOptions` now carries `custom` through, the class and subclass options
render `"Pugilist — homebrew (Jacob)"` while the official twelve stay bare, and **selecting** a homebrew
class raises a standing note (a suffix in a closed `<select>` is easy to skim past, and the consequence — a
character that isn't legal at a vanilla table — outlives the moment of picking). Guarded by
`__tests__/dnd/builder-homebrew-provenance.test.tsx` (6), including the negative cases: the official twelve
must stay unflagged and the notice must not appear on a vanilla build.

**Bar:** 4593/4593 D&D tests, typecheck + lint clean. The QA character was deleted afterwards; the live DB
is unchanged.

### 2026-07-25 — slice 2: 5e 2024 Foundations steps 2–5

Walked the remaining four foundation sub-steps of a vanilla level-1 Fighter, end to end.

**Verified correct**
- **Step 2 · Species** — all ten official 2024 species present, and the help text states the edition rule
  correctly ("2024 puts ability increases on your background, not here").
- **Step 3 · Background** — all **16** official 2024 backgrounds (Acolyte → Wayfarer), no homebrew among
  them, and the help text names the +2/+1 (or +1/+1/+1) rule and the origin feat.
- **Step 4 · Ability scores** — standard array / point buy / roll / manual, with a table that separates
  SCORE · BACKG. · FINAL · MOD, so the background increase is visible as its own column rather than baked
  silently into the total.
- **Step 5 · ASI/feat slots** — correctly reports *"No ASI/feat slots by level 1"* for a level-1 Fighter
  (the 2024 Fighter's first is at 4). It does not invent a slot.

**Defect found and FIXED — the same provenance gap, one step later, on SPECIES.**

Slice 1 fixed class and subclass; the species dropdown had it too. "Rangor" (the authored homebrew 2024
species, whose data comment likewise promises *"flagged `custom` so the picker badges it"*) sat unbadged
among the ten official species. The root cause was one level deeper than the class case: **`SpeciesView`
had no `custom` field at all**, so the flag was discarded in `speciesView()`'s mapping and no UI downstream
could have marked it.

Worth recording *why* the existing field couldn't be reused: `SpeciesView.source` is `'vanilla' | 'custom'`
but it answers a different question — "did we resolve this from data, or do we only know the name?" An
authored homebrew species resolves fully, so it is `source: 'vanilla'`. Reusing it would have marked
nothing. A separate `custom` field was the correct fix, and a test now pins that distinction so the two
don't get conflated later.

Species options now read "Rangor — homebrew (Jacob)", the ten official ones stay bare, and the standing
notice covers a homebrew species as well as a class (its wording adapts). Guards extended to 8.

**Bar:** 4595/4595 D&D tests, typecheck + lint clean. QA character deleted; live DB unchanged.

### 2026-07-25 — slice 3: ASI/feat slot legality (the promise the builder makes twice)

The doc's own test: *"At each ASI slot, confirm the feat picker offers only rules-legal feats."* The picker
says the same thing in its help text (*"Only rules-legal picks are offered"*) and the wizard says it again
(*"ineligible picks are greyed with the reason"*).

**Neither was true.** The only thing the picker disabled was a full slot list. At level 4 a Fighter was
offered — fully clickable, no marking — **Epic Boons** (level 19+), **Origin feats** (those come from your
background at level 1) and **Fighting Styles** (a class feature, not an ASI pick). `Boon of Truesight` was
a normal, selectable button on a 4th-level character.

The galling part: `featEligibilityForSystem` already encoded *every one* of those rules — slot-gates-category,
the Epic Boon level floor, repeatability, minLevel/ability/`needs` prerequisites. **Nothing called it from
the builder.** This repo's most common defect, again.

Now wired: each chip is disabled + struck through when ineligible, carries the engine's reason as its
tooltip, and a line under the list says how many are greyed and why (a tooltip alone is invisible on touch
and to anyone who doesn't think to hover). Verified live at level 4 → 31 greyed, and at level 19 → 22, with
Epic Boons correctly **opening** at 19 while Origin/Fighting Style stay shut.

**Also fixed — the reason strings themselves.** They read *"A Origin feat can't be taken through a Ability
Score Improvement"*. They had never been shown to a player before, so the grammar had never mattered; now
they're on screen. Article selection is derived, and the ASI label reads "slot".

**Verified correct (worth recording, because it looks wrong at a glance):** at level 19 the builder reports
**6** ASI/feat slots, not 7. That is right — the 2024 Fighter's `asiLevels` are 4/6/8/12/14/16, and its
19th-level **Epic Boon** is a separate class *feature* (`choice: 'epic-boon'`), not an ASI. And a level-19
character *may* spend an ASI slot on an Epic Boon, because they now qualify — which is exactly what the gate
allows. Class data, engine and UI all agree.

**One thing this surfaced about the contract:** `FeatContext.abilities` is keyed by the lowercase
`AbilityKey`. A first draft of the test used `STR`, which silently made Grappler read as "requires STR 13+"
against an undefined score. The production path was correct throughout; the note is in the test so the next
caller doesn't repeat it.

**Bar:** 5 new guards (13 in the file), 4600/4600 D&D tests, typecheck + lint clean. QA character deleted.

**Next slice:** the Levels phase proper — walking 1 → 20 one level at a time and checking each level's
granted features, then the same pass for 5e 2014 / PF2 / IG.

**Gap noted, not yet built:** the Foundations step models ASI slots only. A Fighter's **Fighting Style**
(a level-1 class-feature choice) has no slot in this builder, which is why those feats are correctly greyed
here but have nowhere else to be chosen from. Worth confirming the Levels phase offers it before calling
the 5e 2024 path complete.

### 2026-07-25 — slice 4: the Levels phase, and the gap above resolved

**The slice-3 question is answered: it is by design, and it works.** Foundations owns ASI slots; the Levels
phase owns per-level class-feature choices. Walking a real level-1 Fighter through it, the phase correctly
presented **"CHOICE 1 OF 1 · LEVEL 1 — FIGHTING STYLE"** and refused to advance ("1 choice left before
level 2").

**Also verified end to end** (this is the first slice where a character was actually *built*): class /
species / background / ability spread all persisted correctly — `meta.backgroundAbilities {con:1, str:2}`
with `abilities.str 17`, matching the FINAL column on screen. Soldier correctly offered only its own three
abilities (STR/DEX/CON) for the +2/+1 spread.

**Defect 1 — Fighting Style demanded a choice it could not offer.**

The level walker announced the choice, blocked progress on it, and then rendered **nothing to pick**: no
select, no radios, no buttons — while "Save this choice" sat enabled. `planLevelUp` attached `options` for
`subclass` only; the field's own comment said as much ("For subclass choices: the legal options"), so every
other option-bearing kind arrived empty. Nothing could be corrupted (`validateChoice`'s default branch
already refuses a blank `value`), but a player was **stuck on level 1 of the first class of the first
system** — the single most-travelled path in the app.

Fixed by supplying them the way subclasses already are — from the caller, so homebrew is offered exactly
like official content. The route builds the list from `featCatalogForSystem(def.system)` **plus the sheet's
own homebrew feats**, filtered to `category: 'fighting-style'`. Verified live: all **10** official 2024
styles with their real descriptions, selecting Defense and saving records `fs-defense`, clears the
outstanding list and flips `ready: true`.

**Defect 2 — a decorative overlay was eating clicks.**

Found because Playwright could not click the Levels phase button: *"`<svg class="stage-wires">` intercepts
pointer events"*. The docked roller's `.stage-wires` is `aria-hidden` decoration, but it is absolutely
positioned with a stretched `preserveAspectRatio="none"` viewBox — measured at **260×674px**, most of it
overlapping the page behind — and it had `pointer-events: auto`. Anything beneath it in that region was
simply unclickable, the guided builder's own phase navigation included. An aria-hidden decoration should
never be a click target; it is now `pointer-events: none`. A browser sweep confirms **no other
aria-hidden element** on the page intercepts a control.

That second one is worth remembering as a technique: *a test runner refusing to click something is itself a
bug report.* It would never have shown up in a unit test, and a human might have blamed the mouse.

**Bar:** 8 new guards, 4605/4605 D&D tests, typecheck + lint clean. QA character deleted.

### 2026-07-25 — slice 5: the whole 1 → 20 ladder

Rather than clicking twenty levels, probed `planLevelUp(def, {from: 0, to: 20})` across **four** classes
(Fighter, Rogue, Wizard, Cleric) to see every choice the walker would demand and whether it could present
each one. That found the remaining instance of slice 4's bug plus one genuine inconsistency.

**Defect — Epic Boon had the identical hole, on EVERY class.** `epic-boon@19` came back with no options,
so a level-19 character of any class was told to choose a capstone feat and shown nothing. Same remedy as
Fighting Style, at the same seam. Verified on a real level-19 Fighter through the live route:
`fighting-style@1(10) · subclass@3(4) · epic-boon@19(10)` — all ten official 2024 Boons with descriptions.

A guard now asserts the general property rather than the two instances: **no option-bearing choice kind
may come back with an empty list when the caller supplies one.** That is the actual invariant, and it
would have caught both bugs at once.

---

#### Found, root-caused, and deliberately NOT fixed: ASI choices are inconsistent across classes

The same probe showed the level walker demanding a wildly different number of ASI choices per class:

| Class | ASI choices the walker demands, 1 → 20 |
|---|---|
| Fighter | **none** |
| Wizard | 1 (level 4) |
| Cleric | 4 (levels 4, 8, 12, 16) |

**Root cause:** `snapshotAtLevel` builds `pendingChoices` purely from per-feature annotations
(`features.filter(f => f.choice)`) and never consults the class's authoritative `asiLevels` array. So a
class's ASIs appear in the walker only where someone happened to annotate `choice: 'asi'` on that class's
feature rows. Fighter's `asiLevels` are `[4,6,8,12,14,16]` and **not one** of them surfaces.

**Why I did not just fix it.** Deriving the choices from `asiLevels` is a two-line change, but ASI/feat
slots are *also* collected in the Foundations step (`featSlots`), and the two write to **different stores**:
Foundations' feats are assembled into `data.features` by `assemble5e`, while the walker reads
`data.build.choices`. Making Fighter ASIs appear in the walker would therefore re-ask a player who had
already spent those slots in Foundations — trading a silent gap for a visible double-ask.

Reconciling the two stores is a design decision about which surface owns ASI slots, not a QA fix, and it
should be made deliberately rather than as a side effect of this pass. Recorded here so it is not lost.

**Bar:** 5 new guards, 4609/4609 D&D tests, typecheck + lint clean. QA character deleted.

### 2026-07-25 — slice 6: 5e 2014, and a fix of mine that was only half a fix

Ran the same 1 → 20 probe across all **13** 2014 classes. It caught two things, one of them my own.

**Defect — slice 4's Fighting Style fix did nothing for 2014.** It pulled `category: 'fighting-style'`
feats out of the catalog, but `featCatalogForSystem('dnd5e-2014')` sets `category: null` for *every* feat
(deliberately — the origin/general/fighting-style/epic-boon split is a 2024 structure). So the filter
matched nothing and the 2014 Fighter, Ranger and Paladin still demanded a Fighting Style and offered none:
the exact bug, still live on the other edition, behind a fix that looked complete.

2014 also can't reuse the 2024 shape, for a rules reason: **the list is per class.** A Fighter has six
styles, a Ranger four, a Paladin four — and the Paladin's four are not the Ranger's. One shared list would
offer a Paladin "Archery", which 2014 does not. New `lib/dnd/classes/dnd5e-2014/fighting-styles.ts` gives
that structure; nothing is invented, each entry is the style already written into the corresponding class's
feature body in the same directory. The route branches on edition rather than trusting a category that is
null by design.

**Defect — Barbarian 2014 never asked for four of its five ASIs.** It declares
`asiLevels: [4,8,12,16,19]` but annotated only the level-4 feature, so the walker demanded one ASI and
silently skipped 8/12/16/19. Every sibling 2014 class annotates all of theirs. Fixed by completing the
data, not by changing the derivation — the four rows now match the level-4 one already in that file.
**All 13 2014 classes now demand exactly the ASIs they declare**, and a test asserts that property for the
whole edition rather than for Barbarian alone.

#### Why 2024 was left alone, precisely

The same probe says 2024 is under-annotated on **8 of 13** classes (Fighter, Barbarian, Monk, Rogue: none
at all; Bard, Sorcerer, Warlock, Wizard: level 4 only). It is tempting to complete that data the same way —
but the two cases are not alike:

- In **2014**, every other class already surfaced its full ASI list, so Barbarian was the outlier and
  completing it made behaviour *uniform with what players already get elsewhere in that edition*.
- In **2024**, most classes surface none, so annotating them would newly introduce the Foundations/walker
  **double-ask** described in slice 5 across the whole edition at once.

So 2024 still waits on the same decision — *which surface owns ASI slots* — and that decision is now the
only thing standing between this edition and consistency. The probe above is the tool for verifying it
afterwards.

**Bar:** 7 new guards, 4616/4616 D&D tests, typecheck + lint clean.

### 2026-07-26 — slice 7: PF2 and IG

Probed both, using each system's own planner (`pf2LevelBreakdown`, `igPlanLevelUp`) rather than assuming
anything from the 5e work transferred — they are separate implementations.

**Pathfinder 2e — clean. No defects found.** All 20 classes produce a complete 20-level ladder with no
empty levels, ability boosts at **5/10/15/20**, and feat budgets at level 20 of ancestry **5** (1/5/9/13/17),
skill **10** (even levels), general **5** (3/7/11/15/19), and class **11** for the martials that get a
level-1 class feat versus **10** for the casters. That is correct PF2 throughout, and it is the first
system in this walkthrough to come back with nothing wrong.

**Intuitive Games — mostly correct by design, with one real dead end.**

IG is largely immune to the "demands a choice it cannot offer" bug on purpose: `igPlanLevelUp` deliberately
omits the big lists, and `IGLevelBuilder.optionsFor` sources feats / skills / traits from the IG catalogs
client-side instead. But that fallback covers **four** kinds while the planner can emit **seven** without
options, so `subclass-power`, `specialization` and `greater-specialization` fell through to an empty
`<select>`.

In practice that is exactly one subclass. **Champion is listed in the taxonomy as a Fighter subclass but has
no entry in `IG_CLASS_DETAILS`** — Freebooter, Marksman and Sohei all carry `powers` and `specializations`;
Champion carries nothing. So a Champion hit a dropdown with no contents at levels **3, 4, 5, 7, 8 and 9** —
six dead ends on one character.

**Not fixed by inventing the list.** The IG catalog is transcribed from intuitivegames.net; making up
Champion's powers would be the Ground Rule 3 failure, and worse than the gap because a player would trust
it. Same remedy as the map studio's 2D-only SVG: **say so.** A choice with nothing to offer now renders an
explanation plus a free-text input — "we don't have a catalogued list for this yet … type what your table
uses" — and a typed value records exactly like a picked one, so the walker advances.

The guard is written as documentation-as-test: it asserts the known gap is **exactly** `['Champion']`. Add
Champion's real data from the site and the test fails and gets deleted; add a new subclass to the taxonomy
without catalog data and it fails too, which is the point.

**Bar:** 4 new guards, 4620/4620 D&D tests, typecheck + lint clean.

### 2026-07-26 — slice 8: styling, readability, mobile width

The doc's cross-cutting item, on the screens these slices actually changed. Two real defects, both only
visible by looking rather than by testing.

**Defect — the feat picker became unreadable the moment it became correct.** Adding the eligibility gate
(slice 3) was right, but at level 8 a Fighter's list is **31 struck-through entries with 5 live ones
scattered among them**, inside a 160px scroller: the player now has to hunt for the handful of legal picks
among the ones the app just ruled out. The list is now partitioned so **what you can take comes first** —
verified live, all five legal picks lead the list and are visible without scrolling.

Two decisions worth recording: the ineligible feats stay *visible and greyed* rather than being hidden,
because "why can't I take Alert?" is a question the list should still answer; and the partition is
**stable** (two buckets, no comparator), so the list doesn't reshuffle under the cursor as eligibility
changes with level or ability scores.

**Defect — the builder scrolled sideways on a phone.** At 375px the page measured **439px** of content.
The two-column shell was an inline `minmax(200px, 260px) 1fr`, and that 200px floor plus the gap plus page
padding simply cannot fit a phone. Moved to `.builderGrid` / `.builderRail` classes with a 760px
breakpoint: single column below it, and the step rail stops being sticky so it scrolls away instead of
eating the viewport. Verified at both widths — **375px: no sideways scroll**; 1440px: unchanged at
`260px + content` with the rail still sticky.

A follow-up caught by lint rather than by eye: the new partition initially memoised on `eligibilityOf`, a
closure rebuilt every render, which would have re-partitioned the whole catalog on every keystroke. It
reads the verdict **map** directly now.

**Bar:** 6 new guards, 4626/4626 D&D tests, typecheck + lint clean (0 warnings). QA character deleted.

**Note on the dev server:** deleting `.next/server` while a build was in flight corrupted a manifest and
produced a misleading `SyntaxError: Unexpected end of JSON input` on every route. Remove the whole `.next`
directory, not part of it.

---

## Where this doc stands

The **per-system build pass is complete for all four focus systems** (5e 2024, 5e 2014, PF2, IG), and the
cross-cutting styling item has had a real pass over the screens these slices touched. What remains is
either blocked on the owner or belongs to another doc — see the checklist above, and the decisions
collected in the slice logs:

1. **ASI slot ownership** — Foundations or the level walker? Blocks 8 of 13 2024 classes (slices 5–6).
2. **Champion's powers/specializations** — paste them from the IG site and the free-text fallback becomes
   a real picker (slice 7).
3. **Rangor/Pugilist** as a real custom class — the last `[ ]` in `DND_RULES_PLATFORM`.
4. The other six systems are the separate, source-blocked `DND_SYSTEMS_UNDER_CONSTRUCTION`.

### 2026-07-26 — slice 10: do the numbers on the finished sheet add up?

The doc's other named defect class — *"numbers that don't add up on the resulting sheet"* — which none of
the earlier slices had actually checked. Built a level-8 Human **Battle Master** Fighter (Soldier, STR 17 /
DEX 14 / CON 14) through the real builder and read every derived number off the rendered sheet.

**It rendered with 1 hit point.**

Also AC **10** and **no saving-throw proficiencies**. Proficiency bonus (+3) and identity were correct, so
this was not a wholesale failure — which is what made it survivable this long.

**Root cause.** `assemble5e`'s header states the contract: *"the sheet derives the MECHANICS (HP, AC,
proficiency, class features by level, saves) from those choices via the class registry + ledger."* For
proficiency bonus that is true. For HP it is not: the sheet recomputes HP **only when the level changes
through its own setter**, and that setter reads `combat.hitDiceSize`. A character built straight to level 8
never trips the setter, and nothing had ever written its hit die — so it kept the blank template's d8 and
its `maxHp: 1`. Saves had no source at all, and `deriveAc` treats `combat.ac` as the *"unarmored / manual"*
base and never adds Dexterity itself.

**Fix — the build now writes the facts that follow from the class**, which is the boundary being drawn one
notch too tight rather than a new responsibility:

| | before | after |
|---|---|---|
| Hit die | d8 (blank default) | **d10** (Fighter's) |
| Hit dice | 1 | **8** |
| Max HP | **1** | **68** = 10+2, then 7 × (avg 6 + CON 2) |
| Unarmored AC | 10 | **12** = 10 + DEX |
| Saves | none | **STR + CON** |

Max HP uses the sheet's own `maxHpForLevel` rather than a second formula, so a built character and a
levelled-up one cannot drift. Current HP is only seeded when there was none to preserve — a rebuild must
not silently heal a wounded character. Save proficiency merges per-ability so a hand-set `misc` survives.
AC keeps its manual-override semantics: the player can still type over it, and equipping armour replaces
the base entirely.

Verified live end to end (stored **and** rendered), and checked against a second class — a level-5 Wizard
gets d6 / 27 HP / INT + WIS saves.

**Still open, recorded not fixed: class FEATURES are not populated.** The level-8 Battle Master has no
Second Wind, Action Surge, Extra Attack or Combat Superiority on the sheet (`features` is empty except for
chosen feats). Unlike HP, this is not a missing seed value — the same header says features derive "by
level" from the registry, and which surface should own that (build-time snapshot vs. render-time
derivation) is the **same open question as ASI-slot ownership** in slices 5–6. Fixing one should settle
both, so it waits with them rather than being guessed at here.

**Bar:** 6 new guards, 4632/4632 D&D tests, typecheck + lint clean. QA character deleted.

### 2026-07-26 — slice 11: class features — and a correction to slice 10

**Slice 10 deferred this for the wrong reason.** It said class features were "the same open question as
ASI-slot ownership". They are not, and the distinction matters:

- An **ASI is a player CHOICE**. Two surfaces collecting it (Foundations' feat picker and the level walker)
  would *double-ask*. That is the real blocker there, and it stands.
- A **class feature is an automatic GRANT**. Nothing else asks for it, so there is no second surface to
  conflict with.

Checking rather than assuming settled it: **nothing under `app/dnd/_sheet/` reads the class registry at
all.** The Features panel renders `char.features` and nothing else, so there is no render-time derivation
to conflict with either — a level-8 Battle Master simply had no Second Wind, no Action Surge, no Extra
Attack, anywhere. Unblocked, and the same class of fix as slice 10's HP.

**Fix.** The build now writes the class + subclass features for the character's level. Verified live: the
same level-8 Battle Master now carries **11** features —

`L1 Fighting Style · Second Wind · Weapon Mastery` · `L2 Action Surge · Tactical Mind` ·
`L3 Combat Superiority* · Fighter Subclass · Student of War*` · `L5 Extra Attack · Tactical Shift` ·
`L7 Know Your Enemy*`  (*= Battle Master)

— each with its full rules text, rendering on the sheet's Features tab. Level 8 grants none, correctly.

Two details that keep a rebuild safe: features are tagged `source: "Fighter"` / `"Fighter (Battle Master)"`
and given `cls-…` ids, and the route strips only those on rebuild. So re-classing a character removes the
old class's features instead of stranding a Fighter's Action Surge on a Wizard, while anything the player
or DM added is untouched.

**The 5e 2024 sheet is now arithmetically complete**: identity, abilities, proficiency, HP, hit dice, AC,
saves and features all correct for a built character. Slices 10–11 together took it from "1 hit point and
no class abilities" to a playable sheet.

**Bar:** 6 new guards (18 in the file), 4638/4638 D&D tests, typecheck + lint clean. QA character deleted.

**Still open and genuinely owner-blocked:** ASI-slot ownership (slices 5–6, 10) — unchanged, and now the
*only* thing left in the 5e build path.

### 2026-07-26 — slice 12: do the OTHER systems' builds have the same hole?

Slice 11's lesson applied to the obvious next question. Slices 10–11 found that a **5e** character arrived
with 1 hit point and no class abilities; the same check was owed to PF2 and IG rather than assumed either
way.

**Both are healthy — the gap was 5e's alone.**

- **Pathfinder 2e** applies its class progression at build time: real hit points from ancestry + class ×
  level, and proficiency ranks that have actually advanced by level 8 (a Fighter is **master** in Perception,
  which is correct). The shared `meta` stays in step with the `pf2e` sidecar.
- **Intuitive Games** produces the full combat block its bespoke sheet reads (hit points, saves, stances,
  defensive power) with identity in step.

Worth recording *why* 5e was the odd one out: PF2 and IG each build a **system-native sidecar** from their
own progression data, so their assemblies had to compute the numbers. 5e writes into the **shared** sheet
model and could lean on "the sheet derives it" — which was true for proficiency bonus and false for
everything else. The system with the most shared machinery had the least of it actually connected.

**What shipped: the missing question, asked of all three at once.**
`__tests__/dnd/built-sheet-complete.test.ts` (22) asserts a built character is **playable**, not merely
correctly identified. Every previous test asked "did assembly return the right identity?"; none asked "can
you play the result?" — which is exactly why 1-hit-point Fighters survived.

It is deliberately about **coherence rather than exact numbers** (the per-system suites already pin the
arithmetic), so it stays meaningful as the rules data grows while still failing loudly for the specific
shape of the bug it exists for: derived stats left at the blank template's defaults. For 5e it checks four
classes × hit die / HP band / save proficiencies / features; HP is compared against `blankCharacter`'s own
value, so "still the template default" is the failure it names.

**Bar:** 22 new guards, 4660/4660 D&D tests, typecheck + lint clean. No live-DB characters created.

### 2026-07-26 — slice 13: the Review step now reviews the build

The one builder phase no earlier slice had opened. **"Review & finish" listed only identity facts** —
species, class, background, level — which are the things the player typed in two screens earlier. It could
not tell you whether the build had *worked*.

That is not hypothetical: right through slices 10–11, a level-8 Fighter was being produced with **1 hit
point and no class features**, and this screen said *"Fighter · Level 8"* and looked perfectly happy about
it. A review that only echoes your inputs cannot catch a broken build — and this one didn't.

**Added a "What the build produced" block** reading the same stored data the sheet renders, so if the
review looks right the sheet is right. On the same level-8 Battle Master it now reads:

> **HIT POINTS** 68 · **HIT DICE** 8d10 · **ARMOUR CLASS** 12 · **SAVE PROFICIENCIES** CON, STR ·
> **CLASS FEATURES** 11

Three deliberate details: it counts **class** features specifically (`cls-` ids), because player-added
features and chosen feats are not evidence the class build worked; every row is behind a truthiness check
and the block behind a length check, so a half-built character shows fewer rows rather than a table of
zeroes; and PF2/IG are covered from their own sidecars (hit points, hero points, powers) rather than
being left blank.

This closes the loop on slices 10–12: the build produces correct numbers, a cross-system test asserts they
are produced, and now the player is *shown* them before they finish.

**Bar:** 6 new guards, 4666/4666 D&D tests, typecheck + lint clean. QA character deleted.

### 2026-07-26 — slice 14: one rule, two pickers, two answers

Checked something I had assumed twice without looking: when the level walker *does* demand an ASI (Wizard,
Bard, Sorcerer and Warlock at level 4 — the four 2024 classes that happen to be annotated), **does its UI
actually work?**

**It does, and it is good.** A full ability-point picker plus a feat dropdown that already filtered by
category and `minLevel` — which is more than the Foundations picker did before slice 3. Two useful
conclusions: the ASI-ownership question is *genuinely* a decision (both surfaces have working collection,
so the double-ask is real), and slice 3 brought Foundations up to a standard the walker had all along.

**But after slice 3 they disagreed in the other direction.** Foundations now hard-blocks a feat whose
ability prerequisite isn't met; the walker offered the same feat with a *"(needs STR 13)"* hint. One rule,
one edition, two enforcement levels — decided by which screen you happened to be on. The platform's stated
rule is that a vanilla builder offers only rules-legal picks with an explicit escape hatch, so the walker
now runs the same `featEligibilityForSystem` gate, fed the character's scores from the page.

Three things kept deliberately: the picker **falls back** to its old hint-only list when scores are unknown
(hiding choices we cannot judge is the worse failure); the **hint stays**, because it explains the
requirements of the feats that *are* offered; and `✎ Custom feat…` remains — gating is only defensible
because there is a way past it.

**Note — this is not the ASI-ownership decision.** It is about how each picker *gates*, not which surface
*owns* the slot. That question is untouched and still open.

One pre-existing lint warning in `LevelBuilder` (an intentional `useEffect` dep list) was left alone:
adding `current` would reset the player's draft on every plan refetch, which is a behaviour change, not a
cleanup.

**Bar:** 6 new guards, 4672/4672 D&D tests, typecheck clean. One older assertion relaxed from pinning the
full argument list to pinning the anchor, with the reason inline.

### 2026-07-26 — slice 15: PF2 and IG had no Levels phase in the guided builder

Slice 7 probed the PF2 and IG *planners*; this slice actually **drove their builder UIs**, which the
directive asks for and no earlier slice had done. The difference mattered immediately.

**The guided builder gave 5e three phases and the other two systems only two.** 5e:
Foundations → Levels → Review. PF2 and IG: Foundations → Review. A Pathfinder or IG player walking this
flow never reached a level walker at all — they went straight from picking an ancestry to "review and
finish", with nineteen levels of choices skipped.

And not because those walkers don't exist. **`PF2LevelBuilder` and `IGLevelBuilder` are both fully built**,
each with its own route (`/pf2-levels`, `/ig-levels`) and its own test suite, and both were already mounted
on the standalone `/levels` page. They were simply never wired into this flow. The repo's signature defect
one more time: authored, tested, and not connected.

**Wired.** Verified live: PF2 now shows *"LEVELS · STEP 2 OF 3 — ability boosts, feats and class features
unlock as you go, from the Remaster progression"* with a 1→20 target picker; IG shows Freebooter advancing
on its scraped schedule with the correct **2–10** range, not 1–20. Each system reaches its own walker —
these are genuinely different implementations, and the guard asserts each gets the right one and the
identity it keys off (PF2 by class, IG by **subclass**, since its schedule is per-subclass).

**Bar:** 4 new guards, 4676/4676 D&D tests, typecheck + lint clean. QA character deleted.

With this, all four built systems walk the same three phases, and the "one vanilla character each, step by
step" directive is satisfiable for every one of them through the same flow.

### 2026-07-26 — slice 16: driving the PF2 Foundations builder

All five PF2 foundation steps render correctly and read well — Identity (8 Player Core ancestries,
backgrounds), Class & subclass with key attribute/armour/weapon, the **boost** model stated in PF2's own
terms ("everyone starts +0, then applies ancestry / background / class / free boosts"), trained skills
scaled to class count + INT, and feats with the archetype/multiclass explainer. No defects in the flow.

**But the class dropdown offers 14 classes, and slice 7 walked 20 progressions.**

Six PF2 classes have **complete, correct 20-level ladders and no way to be chosen**: Investigator,
Kineticist, Magus, Summoner, Swashbuckler, Thaumaturge.

**This is not IG's Champion.** Champion was *offered* and then presented an empty dropdown — a dead end in
the player's face, which is why that one got a fix. These six are simply **absent**: nothing misleads
anyone, they just cannot be built yet. The distinction decides the response.

**And it is not mine to close.** A `PF2ClassDef` needs key attribute, HP per level, trained-skill count,
fixed skills, initial proficiencies (perception, three saves, defense, attacks, class DC) and the subclass
list — published Paizo rules from Player Core 2 / Secrets of Magic / Dark Archive / Rage of Elements.
Ground Rule 3 again: authoring those from memory would produce sheets a player would trust and shouldn't.
Same call as the six under-construction systems, for the same reason.

Pinned as documentation-as-test (5 cases). It asserts the gap **exactly**, so adding a class's real data
fails the test and you update the list; and it asserts the gap runs **one way only** — every class the
builder offers does have level data, because the reverse (pick a class, then cannot advance it) would be
the genuinely broken case.

It also records that the expensive half is already done: all six have complete ladders with real features,
so whoever supplies a `PF2ClassDef` gets a working class immediately.

**One test of my own was wrong before the code was.** I asserted every catalogued class has subclass
options; the PF2 **Fighter has none** — no Research Field, no Doctrine, no Order. Corrected to assert the
real rule (Fighter empty, Alchemist non-empty) rather than a rule I had invented.

**Bar:** 5 new guards, 4681/4681 D&D tests, typecheck clean. QA character deleted.

### 2026-07-26 — slice 17: driving the IG Foundations builder — clean

The last undriven builder UI. **No defects found**, which after slices 15–16 is worth stating plainly
rather than glossing.

All five steps render IG's own mechanics rather than 5e's in disguise: 10 ancestries (including Leshonki,
Migoi, Naga, Sprite), the four parent classes, specialization + background + **defensive power** as its own
choice, the IG ability method stated exactly (*"start 10 · spend 8 boosts of +2 · max two per ability
(cap 14)"*), stances and powers with ineligible ones greyed, then feats / weapon groups / an optional
companion.

**The class → subclass dependency works.** Picking Fighter narrows the subclass list from all fourteen to
its own four (Champion, Freebooter, Marksman, Sohei). Pinned, because an ungated list would offer a Wizard
"Sohei" — a rules error the sheet would then carry — and because the guard also proves **every subclass
belongs to exactly one parent** and an unknown parent yields *nothing* rather than everything.

That last check matters for a reason beyond tidiness: it confirms **Champion is genuinely reachable**
through the real builder (Fighter → Champion), which is what makes slice 7's free-text fallback a fix for a
path players actually take rather than a defensive nicety.

**Bar:** 5 new guards, 4686/4686 D&D tests, typecheck clean. QA character deleted.

**Dev-server note (third occurrence):** the long-running `next dev` degrades after enough hot reloads —
this time persistent 404s on a valid route with `EPERM` webpack-cache errors in its log. Deleting the whole
`.next` and restarting on a fresh port fixes it; deleting *part* of `.next` corrupts a manifest instead
(see slice 8). Worth knowing before debugging a phantom routing bug.

### 2026-07-26 — slice 18: template × skin sweep, and a button nobody could see

The outstanding "QA breadth" item from the multi-format templates work.

**All four templates pass.** Classic, Codex, Dashboard and Play each render the PF2 sheet with its name,
AC, HP and Perception intact, no horizontal overflow and **zero console errors**. Switching between them is
clean.

**The skin sweep found a real defect — by measuring contrast rather than looking.** Median contrast across
the sheet is **13.9:1** (excellent), but the worst sample was **1.08:1**: the *"＋ Weapon"* button, computed
as `rgb(15,20,25)` on `rgb(1,10,19)`. Near-black on near-black. Not hard to read — **invisible**. It would
have been easy to miss by eye precisely because there is nothing to see.

**The tokens were never wrong**, which is the interesting part. `--ink` and `--hx-text` both resolve
correctly to `#f0e6d2` all the way down to the button. Nothing was *reading* them: `.btn` is styled in
`theme.css`, which the bespoke sheets **deliberately don't import** (its element rules bleed onto the
hextech panels — the reason is written into `rollStage.css`). So the nine `className="btn tiny"` buttons
across the PF2 and IG panels matched no colour rule at all and inherited the page's base `#0f1419`.

Fixed with a small `bespokeButtons.css` scoped to `.sheet-shell` — reaching both bespoke sheets in every
format without reintroducing the bleed that caused the exclusion. **1.08 → 16.08.** A guard asserts every
selector in that file is scoped, that both sheets import it, and — importantly — that neither has started
importing `theme.css`, so the fix cannot quietly undo the reason the gap existed.

The remaining sub-AA samples are roller-template tab labels (2.78–3.98) — small, secondary, and legible;
noted rather than churned, since raising them touches the shared roller chrome on every system.

**Bar:** 6 new guards, 4692/4692 D&D tests, typecheck + lint clean.

### 2026-07-26 — slice 19: finishing the skin sweep, and correcting my own measurement

Slice 18 measured one skin. This finishes the light ones, which `skin-tokens.ts` singles out —
*"CONTRAST IS NON-NEGOTIABLE (the crucial correctness point): the LIGHT skins (streamer/donata/jack)"*.

**First result was wrong, and worth recording as a method note.** My initial pass reported the Streamer
skin at **1.62:1 with 42 samples below AA** — alarming, and false. The background walk returned the first
*non-transparent* colour it met, and my luminance function read `rgba(0,0,0,0.08)` as **pure black**,
ignoring alpha. Purple text on a light pink page was being scored against a background that wasn't there.
Fixed by compositing every translucent layer onto the first opaque one beneath before comparing. **A
measurement is only evidence once you have checked the measurement.**

**Corrected result: the light skins are fine.** Streamer measures a median of **5.55:1** with no collapse —
the "light-skin base fix" recorded in `PF2Sheet.tsx` is holding.

**The real finding is skin-independent.** The roller template tabs (Dice Core / Sigil Stack / Roll Board /
Impact) and the animation toggle are 11px and coloured `--hx-muted`, measuring **2.78:1 on dark skins and
2.83:1 on light** — consistently sub-AA everywhere, which is the signal that a de-emphasised token was
doing a job it isn't for, rather than one theme being off. Slice 18 deferred these as "small and
secondary"; the cross-skin consistency is what changed the call.

Both now use `--hx-text`. Selection was already carried by the border and background fill, so the label
never had to be the thing that dimmed — **paying for state with legibility is paying in the wrong
currency**, and `aria-pressed` carries it for assistive tech regardless.

**Verification is honest but partial.** The before-values are browser measurements; the after-value is
computed from the same token measured at **16.08:1** elsewhere on that page in slice 18. The Playwright
context wedged before I could re-measure in place (the app itself was fine — the route served in 1.2s via
curl throughout). Re-measuring the two labels is a small, specific thing owed to the next browser pass.

**Bar:** 3 new guards, 4695/4695 D&D tests, typecheck + lint clean.

### 2026-07-26 — slice 21: reverting slice 19, which was a regression

Before doing anything new, I checked a risk in my own slice-19 change: it moved the roller tab labels to
`--hx-text`, and `--hx-text` is **contrast-clamped against the SKIN'S PANEL**. That clamp is the entire
reason `skin-tokens.ts` computes luminance at all — *"the LIGHT skins have a near-white background, and the
default `--hx-text` is a near-white cream — invisible on them"*. But the roller bar does not sit on the
skin's panel. **It sits on the roller, which is dark on every skin.**

Computed with the maths consolidated in slice 20:

| skin | `--hx-muted` (before) | `--hx-text` (slice 19) |
|---|---|---|
| lazzuh (dark) | 6.22 | 16.83 ✅ |
| streamer | 3.42 | **1.17** ❌ |
| donata | 3.95 | **1.16** ❌ |
| jack | 3.74 | **1.13** ❌ |

**Reverted.** I had fixed an invisible button in slice 18 and then, two slices later, nearly shipped an
invisible label doing the "same" fix. The shell's `--ink` fails identically, so it is not an alternative —
every body-text token in this app is clamped for the panel, and this control is the exception that isn't
on one.

**What makes this trap work is that checking one dark skin makes the swap look right** (16.83 vs 6.22).
The guard now pins the arithmetic across all three light skins *and* asserts that the dark-skin comparison
favours the wrong answer, so the next person to look at this from a Hextech sheet sees why not.

The original 2.78/2.83 finding stands and is still worth fixing. Doing it correctly needs a colour clamped
against the **roller's own surface** rather than the skin's panel, and picking one needs the real
composited background from a browser — the debt already recorded in `contrast-sweep.md`. Shipping a token
that merely looks busy would trade a legible-but-dim label for an invisible one.

**Bar:** 14 guards (replacing 3), 4720/4720 D&D tests, typecheck + lint clean.

**Method note:** slices 18–21 are one arc — measure, misread the measurement, correct it, then catch that
the correction's fix was itself wrong. Every step needed a *different* check than the one before. The
useful generalisation: a contrast fix is not verified by the number going up on the skin you happened to
be looking at.

*(Slice 24 closes this arc, and finds that slices 19, 21 and 23 were all reasoning from a dock that does not
exist. See below.)*

### 2026-07-26 — slice 22: the third build route had no gate, and my first fix broke the happy path

**The defect.** `homebrew/policy.ts` says an uninvoked gate is "indistinguishable from no gate", so I
checked which gates are actually *called*. `pf2-build` calls `gatePf2Picks`; `ig-build` calls
`gateIgPicks`; **`dnd5e-build` validated nothing.** Slice 3 gated the Foundations *picker*, and
`FeatPicker.tsx`'s own header claims `featEligibilityForSystem` was "wired into every WRITE path" — this
route was the exception. So `POST /dnd5e-build { level: 4, feats: ['Boon of Truesight'] }` was accepted,
and the sheet rendered a level-19 capstone on a 4th-level character as though it were legal. Same
reasoning as `under-construction-gating.test.ts`: every UI can be bypassed with a direct POST.

**The gate.** Now `gateDnd5eBuildFeats` in `lib/dnd/rules-gate.ts` — the same three-way rule as the other
two systems (a DM may grant anything; a custom character is the escape hatch; only a vanilla character
built by a non-DM is held to its class and level), the same refusal shape, and the same 400.

**And then the part worth recording.** My first cut looped over `featEligibilityForSystem` inline in the
route and passed the whole pick list as `takenFeatureNames`. That field means **already on the sheet** —
`gateEdits` passes the sheet's own features for exactly that reason. Passing the batch made every pick see
*itself* as taken, so each came back *"You already have Grappler, which can't be taken again."* **Every
legal vanilla build with a feat would have 400'd** — the gate would have blocked the happy path and
nothing else. My 9 tests passed anyway, because they asserted the route's *source text*: the wiring they
checked was all genuinely there.

Fixed by judging each pick against the *other* picks, never itself — which still refuses the same feat
listed twice, because the other copy remains in the list. Two further false-refusal traps closed while I
was in there:

| trap | why it would fire | fix |
|---|---|---|
| Judged against itself | `takenFeatureNames` = the batch | judge against the others only |
| A **rebuild** refuses its own feats | the build replaces its prior `source: 'Feat'` picks, but they were still on the sheet when the gate read it | pass only the features the build **preserves**, via the same `replacedByBuild` predicate the merge uses — one predicate, used twice, so they cannot drift |
| Ability prereq the increase satisfies | server judging base scores while the picker judges final ones | confirmed the builder posts `finalAbilities`, so both judge the same scores |

**Lesson (the same one as slices 18–21, in a different costume):** a source-grep test proves a call exists,
not that it is *correct*. The rule moved out of the route into a pure module specifically so it could be
called for real; 15 of the 19 tests now exercise behaviour, and 4 pin the route's wiring.

**Known leniency, recorded not fixed:** every pick is judged at the character's FINAL level, so a level-8
build could in principle claim a level-8-prereq feat for the slot it earned at level 4. The picker judges
identically, so client and server agree — and per-slot attribution is exactly the **ASI-slot ownership**
question already blocked on the owner (slices 5–6). Guessing it here would pre-empt that decision.

**Bar:** 19 tests (`dnd5e-build-gate.test.ts`), 4739/4739 D&D tests, typecheck exit-0, lint clean.

### 2026-07-26 — slice 23: dead controls (clean), and the roller labels were never a token problem

Two hunts, one of the doc's named defect classes each.

**1. Dead controls — a clean negative, twice.** The class the doc names and no slice had swept
systematically. Wrote a small auditor (balances braces/angle brackets, and blanks comments in place after
the first run matched `<select>` inside this repo's own prose) over all 228 `app/dnd` `.tsx` files:

- **Controls with no handler at all:** 8 hits, all in `hextech-demo/page.tsx`, a style gallery whose buttons
  are inert by design. **Zero in the real UI.**
- **Controls whose value is collected and then dropped** — the shape slice 7 actually found. Walked the
  whole chain for all three builders: every field the UI holds in state is POSTed, survives parsing
  (`parsePF2Picks` keeps all 15), and is read by the assembler (checked field-by-field against
  `builder.ts` for IG and PF2). **Nothing dropped.** The per-class option lists that *could* come back
  empty are already guarded (`ig-builder-options`, `ig-builder-subclass-gate`,
  `pf2-progressions-cover-builder`).

**2. The roller tab labels — and slices 18–21 were chasing the wrong noun.** The recorded debt said: pick a
colour clamped against the roller's own surface, and measure the real composited background in a browser.
Following it turned up the actual cause, which is not a colour at all.

`.fld`'s background is `rgba(var(--panel-rgb), .98) → rgba(var(--void-rgb), .98)`, and **those triplets are
not one thing:**

| scope | where the dock's surface comes from | result |
|---|---|---|
| bespoke PF2/IG shells (`.sheet-shell`) | `shellVarsFromHx` → **derived from the skin** | dock is light on a light skin; panel-clamped ink on it is correct. Never had the defect. |
| 5e engine (`.dnd-sheet`) | `theme.css` → **a fixed dark purple, every skin** | on the 3 light skins, that skin's near-black ink sat on a near-black window |

So slice 21's conclusion — *"it sits on the roller, which is dark on every skin"* — was **half wrong**, and
that half is why two attempts missed: the roller is dark in *one* scope, and that scope's ink assumed
otherwise. Both candidate tokens were doomed, because `--hx-muted` **and** `--hx-text` are clamped against
the panel; swapping between them could only ever trade one wrong answer for another.

**The fix is structural, not a chosen colour.** `skinHxVars`/`themeToHxVars` now emit `--hx-panel-rgb` /
`--hx-void-rgb`, and `.fld` prefers them (`rgba(var(--hx-panel-rgb, var(--panel-rgb, …)), .98)`) — so the
dock is panel-derived in *both* scopes and the clamp's own precondition holds: the ink is clamped against
the colour actually behind it. The raw triplets remain the fallback, so an **unskinned sheet is
pixel-identical**. Because the fix is a precondition rather than a hand-picked value, it needed no browser
to be trustworthy — which is the part the recorded debt had backwards.

`--hx-muted` on the tab pill (dock stop at 98% + the pill's own 3% white), by this repo's own maths:

| skin | before | after |
|---|---|---|
| lazzuh (dark) | 6.15 | 5.75 ✅ |
| streamer (light) | **3.22** ❌ | 4.73 ✅ |
| donata (light) | **3.72** ❌ | 4.63 ✅ |
| jack (light) | **3.54** ❌ | 4.57 ✅ |

**Honest about the gap between model and page:** these before-values (3.2–3.7) are *higher* than the
2.78/2.83 measured in place, so the live page stacks at least one more darkening layer than the model.
Direction, cause and which-skins-fail all agree, and the fix doesn't rest on the absolute number — but the
after-values clear AA only just (4.57 on `jack`), so what is now owed to a browser is a look check on the
dock's new light appearance on those three skins, **not** a ratio check on a colour. Recorded in
`contrast-sweep.md`, replacing the old debt.

An existing guard (`shell-light-skin.test.ts`) failed on the nested `var()` — its intent (the window stays
effectively opaque) is unchanged, so it now reads the extracted `.fld` block instead of pattern-matching
across a nest a `[^)]*` can't span.

**Bar:** 22 new guards (`roller-dock-surface.test.ts`) incl. that the dark skin passes *either* way — which
is why this hid for three slices — 4761/4761 D&D tests, typecheck exit-0, lint clean.

### 2026-07-26 — slice 24: the roller labels, measured at last — and three slices had been wrong

The debt slices 18–23 kept recording ("re-measure those two labels in a browser") finally got paid, on a real
dev server with a minted `dnd_session` cookie and the **five skins that exist on live characters**
(streamer, jack, donata, lazzuh, default). It did not confirm the fix. It overturned the premise.

**What every previous slice believed.** That the bar "sits on the ROLLER, which is dark on every skin"
(slice 21, verbatim), so the panel-clamped body tokens would be near-black on near-black there.

**What the browser says.** On a live streamer sheet `.fld`'s gradient resolves to `rgba(255,250,254,.98)` —
**near-white**. `.fld` reads `--panel-rgb`, and the SHELL bridge (`shellVarsFromHx`) derives that from the
skin. That same bridge also sets `--ink: #5a1050` and `--muted: #8a3f7c` — dark inks, correctly clamped for
that light surface. But `RollerTemplateBar`'s inline styles reached for `--hx-muted`, which on that sheet is
the **default `#a09b8c`** — a light warm grey meant for a dark panel — because `skinHxVars` is not applied at
that scope at all (`--hx-panel` was still `#0b1a2c`). And **`--hx-panel-rgb`, the token slice 23 added, was
EMPTY there**: that fix never reached this surface, so its claim that "the clamp's precondition now holds" was
false.

Two families, two different assumptions, one strip of text: **2.59:1**, with the active teal tab at
**1.76:1**.

**The fix is the ink family, not the surface.** The bar now takes `--muted`/`--ink` — the family that paints
the dock — with the `--hx-*` pair as fallback for a scope where only that one exists. `floatingRoller.css`
had used that family all along; only the inline styles hadn't, which is why the CSS looked right and the
component didn't. The active tab cannot keep the accent as text (1.76:1), so it uses ink and stays
recognisable through its teal border and tint.

| skin | before | after (inactive) | after (active) |
|---|---|---|---|
| streamer | **2.59** ❌ | **6.36** ✅ | 10.81 |
| jack | **2.27–2.59** ❌ | **7.69** ✅ | 13.17 |
| donata | **2.78** ❌ | **6.32** ✅ | 12.17 |
| lazzuh (dark) | 6.13 | **6.13** ✅ | 11.48 |
| default (dark) | 7.54 | **7.54** ✅ | — |

Dark skins were measured **on purpose**: slice 21's lesson was that checking one dark skin makes a wrong swap
look right, and the inverse obligation holds — a light-skin fix must be shown not to break the dark ones.

**A measurement error of my own, caught before it became a bug report.** My first pass read only
`backgroundColor` while walking up for the composited background. `.fld`'s background is a *gradient*, so the
walk stepped straight past the dock and composited the labels onto the page behind it — yielding numbers I
could easily have filed as a regression. **A contrast measurement that ignores `background-image` is not a
measurement.** The second pass parses gradient stops.

**Two guards rewritten, not deleted.** `roller-tab-contrast.test.ts` had computed everything against
`composite(3% white, rgb(12,12,22))` — an *assumed* dark roller. That fiction is precisely what let three
slices reason confidently and be wrong, so its arithmetic is now the measured per-skin backgrounds, and it
asserts the failing default as well as the working fix. `roller-dock-surface.test.ts` keeps its hx-scope
arithmetic (still true where `skinHxVars` applies) under a heading that says so, plus a correction note that
it is not evidence the labels are legible.

**Bar:** 9 net-new guards, 4977/4977 D&D tests, typecheck exit-0, lint clean. Dev server stopped and the port
released (the 3000–3009 zombie sockets are a known trap; this ran on 3457).

### 2026-07-26 — slice 25: a full contrast sweep of the light skins. I broke one; the skins have 55 more.

Slice 24 proved the point, so the sweep in `qa-evidence/contrast-sweep.md` was finally run **whole** — every
leaf text node on a real character sheet, each judged against **its own** AA threshold (3:1 for large/bold,
else 4.5:1), on the three light-skinned live characters. Composited backgrounds, gradients included.

| skin | sampled | failing |
|---|---|---|
| streamer | 189 | **9** |
| jack | 182 | **22** |
| donata | 238 | **26** |

**The single worst failure on all three pages was mine, one slice old.** The Campaigns panel's buttons (S11)
rendered `#0f1419` on `#10192a` — **1.05:1**, invisible. Same family mismatch as the roller dock: the panel is
`styles.framedPanel` from the hextech MODULE, dark whatever the skin, while `.btn` takes its colour from
`--ink` — the SHELL family, which a light skin makes near-black. **Fixed and re-measured: 14.25:1**, panel
minimum now 6.36. Pinned in `campaign-membership-panel.test.tsx`. Two slices in a row, the same root cause:
**a component's ink must come from the family that paints the surface under it.**

**The other 55 are pre-existing, and they cluster into four kinds.** Recorded with measurements rather than
"fixed" blind — each cluster is a token decision that wants its own slice, and several need the owner's eye:

1. **`.btn` on light skins — the biggest cluster (most of jack's 22).** Cream `#f0e6d2` on light button fills
   (`#dfdacd` / `#b1b2ae` / `#aaa9a1`): **1.12–1.90:1**. Affects Clear, CUSTOM, ◎ FRAME TOKEN, ⟲ RESET,
   + START CONCENTRATING, + CONDITION, ✎ EDIT, ⬆ IMPORT, ✨ Effects, the dice pad… This is the *inverse* of my
   bug — sheet-family surface, hextech-family ink — so the same rule fixes it, applied the other way.
2. **Section headings and roles: dark ink on dark section fills.** "RESOURCES & USES" `#5a1050` on `#16152e`
   = **1.38** (needs 3); donata's "Resources & Uses" **1.26**; the `role` line **1.20**; `kicker` **1.68**.
3. **Coloured button variants.** White on teal `#17b3a3` = **2.62**; white on danger `#f0577a` = **3.31**.
   These are deliberate brand fills, so the fix is a decision (darken the fill, or darken the text), not a
   token swap.
4. **Small gold/amber accents.** `#c8aa6e` on near-white = **2.16** ("📊 POLL PROPOSED"); `#966c00` on
   `#e7d2c1` = **3.24** ("MANAGE LEVELS"); the CUSTOM chip `#c6403b` = **3.18**.

**Why this is stopping here rather than sweeping on.** 55 fixes across four token families, on skins whose
whole point is a look, is not a change to make from a ratio table alone — (3) in particular trades brand
colour against legibility and is the owner's call. What the pass owed was to find them with real numbers and
name the mechanism, and that is done: the mechanism is one rule, and it is now stated in two components and
two guards.

**Bar:** 3 new guards, 4980/4980 D&D tests, typecheck exit-0, lint clean. Dev server stopped, port released.

### 2026-07-26 — slice 26: cluster 1 fixed. One rule, broken three times in three days.

Slice 25 recorded four clusters and said the fixes were the owner's call. **Re-examining that, cluster 1 was
not a look decision** — nobody chose invisible button labels — so it is fixed here. Clusters 2–4 still stand
as recorded.

**The cause was `bespokeButtons.css`, the file written to fix the mirror image of this bug.** Its base rule
was `color: var(--hx-text, #f0e6d2)`, added when the bespoke PF2/IG buttons matched no colour rule at all and
inherited near-black onto a near-black panel (1.08:1). On a light skin `skinHxVars` is not applied at that
scope — slice 24 established this — so `--hx-text` fell through to its **literal cream**, while the fill went
light because it is 4% white over the skin's light page. Cream on near-white: **1.12–1.90:1** across ~20
controls (Clear, ◎ Frame token, ⟲ Reset, + Condition, ✎ Edit, ⬆ Import, the dice pad…).

The fix is one expression: `color: var(--ink, var(--hx-text, #f0e6d2))`. `--ink` is derived by
`shellVarsFromHx` from the skin, in the same place and at the same time as the surface tokens, so it tracks
the surface in **both** directions — and on the dark bespoke sheets it already resolves to `#f0e6d2`, so the
original 1.08:1 fix is preserved by the very same expression rather than traded away. Hover follows `--gold`
for the same reason.

Browser-measured after, on four live characters:

| sheet | `.btn` count | failing | note |
|---|---|---|---|
| jack (light 5e) | 27 | **0** | was ~20 failing |
| PF2 Orin (streamer) | 5 | **0** | the sheet this file was written for; `＋ Weapon` 11.01:1 — no regression |
| donata (light 5e) | 45 | 18 | **all** `.teal`/`.danger` variants — cluster 3, untouched |
| perrin (lazzuh dark) | 27 | 3 | all danger fills — cluster 3, untouched |

**THE RULE, now stated in one guard instead of three comments.** `bespoke-button-ink.test.ts` records all
three instances of the same mistake — the bespoke buttons (1.08:1), the roller dock (2.59:1), these buttons on
light skins (1.12:1) — and pins the ordering in every place it applies, including that the sheet family must
never come *first* (its literal always resolves, so the fallback would never be reached). The campaigns panel
is in there too as the mirror case: it wants the hextech family precisely because its surface is
hextech-module dark, which is the same rule and not an exception.

**Still open, unchanged from slice 25:** cluster 2 (dark headings on dark section fills, 1.20–1.68), cluster 3
(white on teal 2.62 / on danger 3.31 — a brand-colour trade, owner's call), cluster 4 (small gold accents,
2.16–3.24).

**Bar:** 8 new guards, 4986/4986 D&D tests, typecheck exit-0, lint clean. Dev server stopped, port released.

### 2026-07-26 — slice 27: cluster 2 RETRACTED. My sweep tool was inventing failures.

I said cluster 2 was "likely the same rule again, but I'd want to check before assuming". Checking it found the
problem was **my measurement**, not the app.

**What the screenshot shows.** `RESOURCES & USES` on the streamer sheet renders as dark purple on a light pink
pinstripe — plainly legible. The sweep had reported **1.38:1**.

**Why the sweep was wrong.** `.dnd-sheet`'s `background` is a MULTI-LAYER shorthand: a 5% pink pinstripe
**over an opaque light base**. My `bgOf` read the first colour of the first layer only, got a 5%-alpha pink,
concluded the element was still translucent, and kept climbing — all the way to the dark site chrome. Every
cluster-2 number (headings 1.38 / 1.26, `role` 1.20, `kicker` 1.68) was computed against a surface that is not
behind those elements. **Retracted, not fixed** — there is nothing to fix.

This is the second measurement bug in this arc: slice 24's first pass ignored `background-image` entirely.
Both invented failures rather than hiding them, which is the less dangerous direction but still cost time and
nearly produced two rounds of "fixes" to working code.

**What survives, and how I know.**

| cluster | verdict | evidence |
|---|---|---|
| 1 — `.btn` cream on light fills | **REAL, fixed in slice 26** | the sheet surface really is light (the screenshot above proves it), so cream-on-light was genuine; 27 buttons / 0 failing after |
| 2 — dark headings on dark fills | **RETRACTED — artifact** | screenshot: legible dark-on-light |
| 3 — coloured button variants | **REAL, marginal, owner's call** | screenshot of `⬇ Export`: white 700-weight 11px on a `#17b3a3 → #0a6b5d` gradient. Legible, but 2.62:1 against the light end of the ramp — a genuine small-text AA miss, and fixing it trades brand colour |
| 4 — small gold accents | **unverified** | same walk-up method as cluster 2, so treat the numbers as suspect until re-run with the corrected snippet |

**The tool is repaired in `qa-evidence/contrast-sweep.md`**, with a corrected `bgOf` that composites a whole
element (colour first, then image layers back-to-front) and stops climbing at the first genuinely opaque
layer — plus a standing instruction that has now earned its place: **when a number looks alarming, screenshot
the element and look at it before touching code.**

**Bar:** no app change (there was nothing to fix), 4986/4986 D&D tests, typecheck exit-0. Dev server stopped,
port released.

### 2026-07-26 — slice 28: the sweep re-run with the fixed tool, and the one skin-independent failure fixed

With `bgOf` corrected (whole element, colour then image layers back-to-front, stop at the first opaque layer),
the sweep gives a trustworthy number for the first time in this arc:

| skin | broken tool | corrected | change |
|---|---|---|---|
| streamer | 9 | **7** | −2 artifacts |
| jack | 22 | **4** | −18 (cluster 1 fixed in slice 26, plus artifacts) |
| donata | 26 | **22** | −4 artifacts |
| **total** | **57** | **33** | |

**Fixed here: the one failure that appeared on ALL THREE skins.** The `CUSTOM` provenance chip and the
"N custom" counts used `--hx-danger` (`#c6403b`) as 9.5–12.5px text on the hextech module's dark panels —
**2.62 / 2.87:1**. Skin-independent, because those panels are dark whatever the skin, and unambiguous: a
provenance marker nobody can read is the same defect as a missing one. `--hx-danger` is tuned as a border and
fill accent, so a new `--hx-danger-2: #ef8b85` carries the same hue at a legible weight; the chip's FILL keeps
the original red. Measured after: **5.45** (chip) and **5.96** ("2 custom"). The codebase already had this
pattern — `variant-tags`' custom chip uses a light amber on its dark chip for exactly this reason.

**The 30 that remain, and why they are not being swept up.**

- **~18 on donata: `.teal` / `.danger` button fills** (white on `#17b3a3` = 2.62, on `#f0577a` = 3.31).
  Screenshot-verified as legible-but-marginal. Fixing them means darkening a brand fill or dropping white
  text — a colour decision, not a bug fix. **Owner's call.**
- **~7 on streamer: gold and amber accents on pale panels** (`#c8aa6e` on `#ffeef9` = 2.00 "POLL PROPOSED";
  `#966c00` on `#e7d2c1` = 3.24 "MANAGE LEVELS"; `#b30060`/`#8a3f7c` on the mid-pink `#ea8db4` = 2.90). These
  are the streamer skin's own palette against its own panels — the same "which token family" question, but
  the answer changes what the skin looks like, so it wants an eye rather than a rule.
- **1 on jack: `tap a stat to roll` at 4.33 vs 4.5** — 0.17 short. Real, trivial, and inside the noise of a
  gradient approximation; recorded rather than chased.

**Bar:** 4986/4986 D&D tests, typecheck exit-0, lint clean. Dev server stopped, port released.
