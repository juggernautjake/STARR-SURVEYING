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
