# D&D — Final full-system QA walkthrough (Playwright, browser, manual)

**STATUS: IN PROGRESS — 33 slices run (2026-07-25 → 26).** This is the LAST D&D item, extracted from
`DND_RULES_PLATFORM_2026-07-16.md` (originally "Slice 40").

> ## Where this actually stands — read this before the sections below
>
> **This header used to describe the state at slice 1.** Everything from "What's ALREADY been verified" down
> is a RUNNING LOG, and several of its earlier entries were later corrected or retracted by measurement. That
> matters because stale text in these docs cost real time three separate times in this run — slice 21's
> "the roller is dark on every skin" (false), the equip-validation partials in `DND_RULES_PLATFORM` (fixed
> a day before the doc still said they weren't), and "`attacksFromInventory` is UNCALLED" (true, but it
> implied a one-line wiring job for what was actually a second data model). **Trust the newest slice on any
> topic, not the first.**
>
> ### Done, and browser-verified
> - **The per-system build pass** for all four systems (slices 1–7): every class of 5e 2024/2014 and PF2, and
>   every IG subclass, probed through its own planner. Defects found and fixed along the way.
> - **Numbers on the built sheet** (10–12) — a level-8 Fighter rendering with 1 HP was real and is fixed;
>   PF2 and IG were checked and were healthy.
> - **The gates** (3, 14, 22): every ASI/feat picker AND the server routes behind them refuse an illegal
>   vanilla pick. The 5e build route had no gate at all until slice 22.
> - **Dead controls** (23): swept every `app/dnd` `.tsx`; nothing handler-less outside a style demo, and
>   nothing collected-then-dropped in any of the three builders' UI → POST → parse → assemble chains.
> - **Contrast** (18–21, 24–28, 30–33): five real defects fixed, three of my own measurement bugs found and
>   corrected, and a verified baseline of **31 remaining items, all colour decisions**, in
>   `qa-evidence/contrast-sweep.md` with a recommended order.
> - **The campaign panel, the three homebrew designers, and the per-system settings modal** — each driven in
>   a browser after shipping (S14, slice 30, and the S-6 note in `SETTINGS_PER_SYSTEM_RULES_VARIANTS`).
>
> ### Genuinely open, and why
> - **The 31 contrast items** — brand fills, section numbers, the gold family. Each is a trade between a
>   skin's identity and legibility. Measured; needs an owner's eye, not a rule. (Was 39. Slice 34 closed
>   IG's two, which were the last entries on that list that were BUGS rather than colour choices — so the
>   remainder is now uniformly a matter of taste, and genuinely yours to call.)
> - **ASI-slot ownership is no longer open** — `SLOT_DRIVEN_CHARACTER_BUILDING` S1/S2 dissolved it: both
>   surfaces now write the same ledger, and the authored ladder drives the prompts for all 13 classes.
> - **Everything else** lives in `SLOT_DRIVEN_CHARACTER_BUILDING` (the escape hatch, spell slots, the
>   exceptions badge, dice rollers, IG's Champion data and level-1 feat count) and is blocked on an owner
>   decision, not on effort.
>
> ### How to run a pass (both original blockers are solved)
> - Ports 3000–3009 hold **orphaned dead sockets**; start on a genuinely free one (this run used 3456–3466,
>   each stopped and confirmed released afterwards).
> - **Mint the `dnd_session` cookie** from the repo's own `AUTH_SECRET` (token format in `lib/dnd/auth.ts`)
>   rather than registering an account — no test data is left behind. Live fixtures exist for every skin and
>   system; find them with PostgREST rather than creating any.
> - **Never click a mutating control during an audit** (Take out, Save to my character, role changes). Render
>   and read.

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

> ⚠ **Superseded in one place.** This section states the library "renders ALL systems … each with a
> substantial rules page". That was true on 2026-07-17 and stopped being true on 2026-07-18, when the owner
> hid the six under-construction systems site-wide. Search kept indexing them until 2026-07-26, which made
> every hit a link to a 404 — see `DND_SYSTEMS_UNDER_CONSTRUCTION` (now in `pending/`).

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

### Slice 44 — the live pass this session owed, and slice 39 confirmed against real data

Slices 35–42 shipped on tests and a build. **This repo's standing rule is that a UI slice is driven in a
browser before it is called done**, and slice 38 shipped an entirely new surface that had never been
rendered. Run against a real dev server on port **3456** (3000–3009 remain the known zombie-socket trap)
with a locally-minted `dnd_session`, against **live** characters. Nothing was created and nothing mutated.

| check | result |
|---|---|
| `SheetEditHistory` on the **IG** sheet (Vashti Kelln) | renders — *"Edit history"* + *"Loading edit history…"* server-side |
| …on the **PF2** sheet (Orin Sallowmere) | renders, same |
| `/edits` as the **owner** | `200 {"edits":[]}` on both — the empty state, correctly |
| `/edits` as a signed-in **non-owner**, public character | **403** *"You cannot view this character's edit history."* |
| the **sheet itself** as that same non-owner | **200** — still readable, so the fix did not over-block |
| `/edits` on that non-owner's **own** character | **200** — owners unaffected |
| dev-server log | **no errors, no warnings** across every request |

**Slice 39's exposure was real, and this is the proof.** The database holds **72** `dnd_sheet_edits` rows
and five **public** characters (Jack, Donata Dime, Flame, Lazzuh Gun, Donata). The three-line result above —
same user, same character: *sheet 200, history 403, own history 200* — is exactly the discrimination the fix
intends, verified against that live data rather than argued from the source.

**One correction to how I characterised it, from reading `isDndLoginRequired` rather than assuming.**
`DND_REQUIRE_LOGIN` is unset, so `/dnd` runs **open** — but the API still requires a session, and the /dnd
home page is *a public roster picker where clicking a card enters as that identity with no password*. So
the pre-fix exposure was **one click from a public link**, not literally anonymous. That is a narrower claim
than "anyone with the URL" and it is the accurate one; the practical severity is unchanged, since obtaining
the session costs nothing.

**What this pass did NOT establish, stated rather than glossed:** no IG or PF2 character has any audit rows
yet — the bespoke routes only began recording in slice 35 and nothing has been edited since — so the
**populated** state of the new panel is still unrendered. Proving it needs an edit on a live character,
which the standing no-mutation rule forbids during an audit. The empty and loading states are confirmed
live; the row list is covered by tests only. Likewise no visual/contrast check was made on the new panel —
it inherits `framedPanel` and the `--hx-*` tokens, but "inherits the right tokens" is exactly the assumption
slice 34 found wrong on a different surface.

→ **Both halves of that gap are now closed:** slice 45 renders the row list, slice 46 measures the contrast.

### Slice 54 — a console sweep, and an honest limit on what a read-only audit can reach

Every Playwright navigation in slice 53 reported *"New console entries"* and **nobody had read them**. A
browser console is where hydration mismatches, failed fetches and React warnings surface, and none of this
session's twenty-odd slices had looked. So: six pages, all four systems, both builder surfaces.

| page | console |
|---|---|
| PF2 sheet (Orin, streamer skin) | **0 errors, 0 warnings** |
| IG sheet (Vashti) | **0 / 0** |
| 5e sheet (Donata Dime) | **0 / 0** |
| PF2 Foundations builder | **0 / 0** |
| PF2 level walker | **0 / 0** |
| IG level walker | **0 / 0** |

**One live confirmation of S6g fell out of it.** IG's outstanding choice is a **New Trait**, and the picker
correctly shows **no** *"needs an exception"* group — `igOtherSubclassOptions` is scoped to `subclass-power`
and `specialization`, and that scoping is now verified in the rendered DOM rather than only in a unit test.
The absence is the assertion: a widening that leaked onto every kind would have shown here.

**And the limit, stated rather than glossed: the widened groups themselves could not be reached.** The
exception group only renders on a feat/power choice, and no live character offers one as its *first*
outstanding choice — PF2's Orin owes a subclass, IG's Vashti owes a trait, and Donata's `/levels` redirects
to the sheet (nothing outstanding). Getting to one means **recording a choice on a live character**, which
the standing no-mutation rule forbids during an audit.

So S6g's optgroup remains covered by tests and by its correct absence, not by a positive render.

→ **Closed by slice 55**, which renders both pickers directly. They needed only an export, not the markup
split this note predicted.

### Slice 59 — the accent clamp had the same bug, and only measurement found it

Slice 58's re-measurement paid for itself immediately. Its PF2 sheet showed 18px modifiers at **4.38** —
*just* under 4.5, which is the signature of a clamp aiming at **4**. Reading the derivation confirmed it:
`--hx-teal-1` carried **exactly the two faults slice 47 fixed in `gold2`**, still sitting in its sibling.

`skin-tokens.ts` says of it: *"teal-1 is used both as an accent border AND as roll-result / interactive
text, so clamp it for legibility too."* The intent was right; the clamp did not aim where text is read —
against `panel` rather than the gradient top `panel2`, and at 4 (light) / 3 (dark) rather than AA's 4.5.

| skin | before (panel-2) | after |
|---|---|---|
| lazzuh (**dark**) | **4.24** ❌ | **4.63** ✅ |
| streamer | **3.69** ❌ | **4.52** ✅ |
| jack | **4.23** ❌ | **4.80** ✅ |
| donata | 5.20 ✅ | 5.20 — untouched |

**The dark skin was failing too**, which is the part a light-skin-only check would have missed — slice 21's
lesson, and the reason both directions are asserted. The hue survives because `ensureContrast` picks its
direction from the background: it **lightened** lazzuh's pink on a dark panel and darkened the light skins'.
Guarded by channel separation, so a runaway to black or a drift to grey fails even where the ratio passes.

**Both derivations fixed** — the skin path and the theme path carry the same line, and a test asserts there
are exactly two, because fixing one is how a defect survives its own fix.

**The generalisable point:** slice 47 fixed `gold2` and stopped there. The identical bug sat in the token
declared eight lines below it for twelve more slices, and no amount of re-reading found it — a live
measurement did, from a number that was *only 0.12 low*. **When a clamp is wrong, check its siblings; and
when a measurement lands just under a threshold, suspect the threshold rather than the colour.**

### Slice 58 — re-measuring the baseline, because ten slices had moved it

The contrast baseline was measured **before** slices 34, 47 and 48 changed contrast-affecting code. A stale
baseline is exactly what this doc's evidence file keeps warning about, so three of its six sheets were
re-measured live against current code.

| sheet | then | **now** |
|---|---|---|
| donata 5e | 20 | **3** of 164 rendered nodes |
| rulebook 5e (Jack) | — | **1** of 154 — an 82px decorative watermark at 1.29 |
| PF2 streamer | 8 | **9** of 115 |

**donata went 20 → 3, and the survivors are the brand-fill item, confirmed live** — two of them measuring
**exactly** what slice 49 computed from the CSS (`⬇ Export` 2.62, `⟲ Reset` 3.31). A static reading and a
live one agreeing to two decimals is the strongest evidence yet that those A/B options are aimed correctly.

**PF2 did not improve** (8 → 9). Its failures are a different family — the unfilled Hero-Point `◇` painting
`--hx-line` at 3.23, three 11.5px markers at 3.92, three 18px modifiers at 4.38. Recorded as such rather
than folded into the gold/brand-fill buckets they do not belong to.

**Stated as a partial refresh, not a new baseline:** three of six sheets, one skin each, default template,
no interaction states.

**Two process notes worth more than the numbers.** First, the run began with a **500 on every sheet** — and
it was mine: `npm run build` had written production output into `.next/`, which `next dev` then read as a
mix. Reporting that as a regression would have been a fabricated bug of exactly the kind slice 14 warns
about; the check costs one restart. Second, the session cookie had **expired mid-audit** (minted with a
1-hour life), producing 307s that look like an auth defect. Both were environment, neither was code — and
both are the reason this doc's standing rule is to verify a red result before believing it.

### Slice 57 — the last unrendered branch, and the audit that now comes back clean

Running slice 55's rule over everything this session changed leaves exactly one: **slice 36's "record only"
marker** in the DM's review queue. `revert-affordance.test.ts` proves the *predicate* and greps for
`isRevertableEditRow(row) ? (` — neither shows what a DM sees.

**The failure mode a grep cannot see is a swapped ternary.** Revert offered on the rows that *cannot*
revert, "record only" on the ones that can. That passes every existing assertion — the predicate is called,
the branch exists, no `disabled` appears — while inverting the entire fix. A test now asserts the two land
on **opposite** rows.

`EditHistoryRow` extracted as a pure component: a row, a busy flag, one callback. The panel stays bound to
`useChar`; only the row needed freeing. Existing tests pass untouched.

**10 tests**, and the one worth naming is that a non-revertable row **still shows its change**. Filtering
those out to avoid an awkward button was the fix slice 36 *explicitly rejected* as the worse trade, and
nothing would have caught someone re-attempting it. Also pinned: the deleted-account fallback renders the
bare role rather than `"null (player)"` — `editor_user_id` is `ON DELETE SET NULL`, so that is a real state.

**The audit now comes back clean.** Every UI branch this session added is rendered: the three walkers'
pickers (55, 56), the bespoke edit-history panel and its states (45), its mount across all four formats
(38-fix), and both queue row states here. There is no next item under this rule — which is the first time
in this arc that applying a rule has produced nothing.

### Slice 56 — applying slice 55's own rule, and finding it had missed one

Slice 55 ended by stating a rule: *"when a slice adds a branch that only appears in a state the tests
construct, render that state."* Applying it as an audit immediately found the gap **in slice 55 itself** —
it rendered the PF2 and IG pickers and left the **5e** one behind, which is where this whole escape-hatch
thread began (S6f).

It was an inline IIFE bound to the walker's `draft`, so it could only be grepped. And a grep genuinely
cannot separate the fix from the most plausible non-fix:

```
<option value="grappler">⊘ Grappler — needs STR 13</option>            ← the fix
<option value="grappler" disabled>⊘ Grappler — needs STR 13</option>   ← looks right, hatch dead
```

The second greys the feat correctly, explains it correctly, and leaves the player **exactly as stuck as the
filter S6f removed** — a disabled option cannot be selected, cannot be sent, and can never be refused.

`AsiFeatPicker` is now a pure component. Behaviour preserved, **all 54 existing S6f tests pass untouched**,
and the single simplification is provably equivalent (the old
`e.target.value === '__custom__' ? '__custom__' : e.target.value` ternary returned its input either way).

**8 render tests**, and they reach further than the disabled check. They pin the hatch's own states: the
custom option is always offered; the free-text field appears when a custom value is set; and an **unknown
stored `featKey` is treated as custom**, so a character already holding a homebrew feat does not have it
silently dropped by a picker that does not list it. The empty-list placeholder *is* `disabled`, asserted
explicitly, so the "no disabled" rule reads as being about **feats** rather than about every option present.

**All three walkers' pickers are now rendered.** The rule found its own exception on first use, which is
about the best evidence it is worth keeping.

### Slice 55 — rendering the escape-hatch groups that shipped without ever showing

Slice 54's owed item. The pickers turned out to be **pure components** — no fetch, no store, no router — so
this needed two exports rather than the `SheetEditHistory`-style split that note assumed.

**The load-bearing assertion: nothing in either group is `disabled`.** That is the whole of S6g. A disabled
option would *look* like a correct fix — the pick is visible, greyed, explained — while leaving the hatch
exactly as unreachable as the filter S6g removed, because a disabled option cannot be selected, cannot be
sent, and therefore can never be refused. **A grep cannot tell those two apart.** Only a render can.

Proven end to end rather than by option-list arithmetic:
- PF2's group is labelled **"Above your level — needs an exception"**, each entry carrying the level that
  puts it out of reach;
- legal feats still render **outside** the group, so the ordinary path is untouched;
- a level-20 slot renders **no group at all** rather than an empty one;
- the **ancestry** track — the only one exceeding `MAX_OUT_OF_REACH` — shows its *"N further … aren't
  listed"* note, so the cap is never silent;
- IG's group **names the subclass**, holds the other subclasses' powers, and keeps the character's own
  outside it;
- the **Champion** path (no catalogued powers) still offers **free text and no group** — a gap in *our* data
  must not be flagged as the player's exception.

11 tests, no production change beyond the exports. **This is the third time this session that a UI shipped
green and unrendered** (S6g here, `SheetEditHistory` in slice 45, the mount bug in slice 38's correction).
The pattern is stable enough to state as a rule: **when a slice adds a branch that only appears in a state
the tests construct, render that state.**

### Slice 53 — one computed-style read ends a two-slice argument

Slices 51 and 52 argued about whether deepening streamer's `--gold` would hurt the PF2 dice pad. **One
browser read settles it**, which is what should have happened before slice 51 reasoned about it.

At a `d4` button the colour computes to **`rgb(138,100,0)` = `#8a6400`** — that is **`--hx-gold-2`**,
resolved at that element. `DicePad.tsx` paints `var(--hx-gold-2, var(--gold, inherit))`, so **the `--gold`
fallback is unreachable there**. This token never touches the pad, and slice 51's objection was about a
colour that element does not use. (The 2.86 figure was doubly wrong — it also came from a measurement this
evidence file had already retracted, taken while those buttons sat in a collapsed `.fld`.)

**A second read explained the whole confusion.** The one streamer-skinned character, **Orin Sallowmere, is
Pathfinder** — it renders the *bespoke* sheet off `--hx-*`, not `.dnd-sheet`'s `--gold`. So **no live
character paints with this token at all today.** That is why deepening it is safe but not urgent, and it is
also why the original streamer-5e measurements in this doc came from applying the skin during QA rather than
from a real character.

Also measured in passing, on Jack (`skin-rulebook`): all four gold-painted nodes pass (**5.06–5.36**),
composited through the real backdrop chain.

The value stays unchanged — **now because it is unexercised, not because it is unsafe.** `theme.ts` records
the measurement and the reason; the test drops its conditional and instead pins `DicePad`'s fallback chain on
the source, so a refactor that removes the first fallback — silently exposing the pad to this token — fails.

**The lesson, and it is the same one three times now:** slices 50, 51 and 52 each reasoned from a colour
named in this file rather than from the token the element actually paints with. Every one of those
inferences was wrong, and each took a slice to unwind. **The read costs one command.** Render-and-read only;
no live data touched.

### Slice 52 — correcting slice 51: the rejection rested on an unproven premise

Slice 51 rejected deepening streamer's `--gold` because *"the PF2 dice pad goes 2.86 → 2.41"*. Reading the
**pad's code** rather than this doc's evidence shows that premise does not hold, in two separate ways.

- **`DicePad.tsx` paints `var(--hx-gold-2, var(--gold, inherit))`.** It reads `--gold` *only* if
  `--hx-gold-2` is undefined in its scope — and `--hx-gold-2` is the CSS-module token **slice 47 already
  clamped**. Whether this value reaches the pad at all is a scope question static reading cannot answer.
- **The 2.86 figure is itself from a retracted measurement.** The contrast-sweep evidence records those
  buttons as measured inside a collapsed `.fld` (`display:none`) — one of the three tool bugs it lists under
  *"it measures things nobody can see"*. I used a number the same file had already withdrawn.

The value is **still unchanged**, but now for the right reason: not *"deepening is wrong"* but *"one read
settles it and nobody has taken it"*. And the upside is broader than slice 51 implied — **~100 shared-sheet
sites** paint with `var(--gold)`, and deepening clears panel (4.58→5.44), panel-2 (4.12→4.89) and panel-3
(4.27→4.60).

`theme.ts` now states the open question and exactly how to close it: **read the pad's computed colour on a
streamer sheet with the dock EXPANDED.** Clamped token → the value is free to deepen. `#966c00` → the fix is
a surface-derived token. The test splits to match: light-surface arithmetic asserted unconditionally, the
dark-surface one renamed to say it applies *only if* the pad resolves this token.

**Second time in this arc that an attribution in the evidence file did not survive contact with the code** —
the first was the section-number item in slice 50, which also did not reproduce as described. That file
warns at the top that its own earlier entries were "later corrected or retracted by measurement" and says
**trust the newest slice, not the first**. Slice 51 read an older entry as current and reasoned from it.
The habit that catches this is cheap and I skipped it: *when the evidence names a colour on a surface, check
which token that element actually paints with.*

### Slice 51 — a fix that measured well, and was rejected anyway

Slice 50 left one concrete item: streamer's `--gold` fails at **4.12** on panel-2 while its own comment
documents an AA intent. Deepening it 10% to `#876100` clears **every** surface in the palette's own set
(panel 5.44, panel-2 4.89, panel-3 4.60, void-2 4.85). It looked exactly like slice 47 — intent right, value
wrong — and it was ready to ship.

**Checking where the token actually lands stopped it.** This doc's own earlier evidence records `#966c00` on
surfaces outside the palette's set, including a **dark** one:

| surface | today | with the tweak |
|---|---|---|
| PF2 chip `#f2e4ee` | 3.85 | **4.57** — fixed |
| MANAGE LEVELS `#e7d2c1` | 3.24 | 3.85 — better, still failing |
| PF2 dice pad `#302a49` (dark) | 2.86 | **2.41 — worse** |

Eight light-surface items fixed, **six dark-surface items degraded**. Not a win — and shipping it would have
traded one set of failures for another *while reading as progress in the log*.

**So the value is unchanged and the finding is recorded instead: one hex cannot clear 4.5 against both a
near-white panel and a dark pad.** The fix is a **surface-derived token** — precisely what the roller dock
got when it hit this same wall — not a colour tweak. That is the whole gold-family item's real shape, and it
is now written down with the arithmetic behind it.

The comment lists every surface the token lands on, including the failing ones, and says the tweak was tried
and rejected; a test pins the numbers so nobody re-proposes it from the light-surface half of the picture.

**Worth keeping:** measuring against *the surfaces in the palette* said ship it. Measuring against *the
surfaces in the app* said don't. Five slices in this arc have now turned on the same question — **which
background is this actually on?** — and this is the first time the answer killed a change rather than
motivating one.

### Slice 50 — the palettes' own contrast claims were never checked, and four are wrong

Chasing the section-number item found something better than the item. `theme.ts` documents a ratio beside
most palette entries — *"~11:1 on cream (AAA)"*, *"5.2:1 on the pale panel"*, *"7.2:1 on the card"*. **Those
numbers are how anyone picking a colour for a skin decides whether it is safe, and nothing had ever checked
them.**

All fifteen checked. Eleven accurate or conservative. **Four optimistic — and every one is a gold:**

| entry | claimed | actual |
|---|---|---|
| streamer `tealbright` | 5.9 | **5.53** |
| streamer `gold` | 5.2 | **4.58** — and **4.12** on panel-2 |
| donata `gold` | 6.1 | **5.72** |
| rulebook `gold` | 7.4 | **6.63** |

**That is a pattern in one colour family, not noise** — and it is the explanation for why "the gold/amber
family on pale panels" keeps reappearing in this doc's baseline. Streamer's gold is the sharp case:
documented at a comfortable 5.2, actually **4.58** on the surface it names (barely over AA) and **failing at
4.12 on the adjacent panel-2**. A designer trusting that comment would reasonably reuse the colour anywhere
— which is very likely how several of the tracked gold items got written in the first place.

Comments corrected to the measured values; streamer's now records **both** surfaces, since it passes on one
and fails on the other — the same *"tuned for one surface, used on another"* shape as slice 47's clamp bug,
this time in prose rather than code.

**No colour changed.** An overstated comment is worse than no comment, because it is the thing that gets
reused. 19 tests recompute every claim, so a palette edit that leaves its comment behind fails — and two of
them pin the finding itself (the golds have the least margin of any family; streamer's really does fail next
door), so whoever retunes the gold family knows exactly where to start.

**On the section-number item specifically:** it did not reproduce as described. `#b30060` clears AA on
*every* streamer surface (5.58–6.60), so the baseline's "3.09" was not that pairing — most likely the gold
`::before` prefix (`.sec-num::before { content: '// '; color: var(--gold) }`) at **4.12** on panel-2, which
is the same gold this slice just corrected. Recorded rather than silently dropped: the item is real, the
attribution in the baseline was not.

### Slice 49 — the brand-fill item, from "20 vague things" to one decision

The baseline's biggest remaining bucket is *"brand-filled buttons — 20 on donata, 1 on lazzuh"*. Measuring
it narrows it sharply, and **the narrowing is the value**.

Donata's filled buttons are **gradients** with a white label — and every one of them **ends** on a colour
white reads on comfortably (6.41 / 6.91 / 5.87). Only the **light stop**, where the button starts, was ever
unchecked against its own label. `.btn.solid` starts on `--hotpink` and passes at both ends; three others
start lighter and fail:

| button | light stop | white on it |
|---|---|---|
| `.btn.teal` | `#17b3a3` (theme.ts calls it "candy teal (bg)") | **2.62** |
| `.btn.danger` | `#f0577a` | **3.31** |
| `.btn.pink` | `#ff5fa8` | **2.82** |

**So it is not twenty judgement calls — it is three gradient stops**, each with two remedies that both keep
the skin, both measured:

- **A — darken only the light stop** to the minimum that passes, hue preserved: `#118479` (4.56) ·
  `#ca4966` (4.51) · `#c24880` (4.63). The gradient starts deeper and ends exactly where it already ended.
- **B — keep the brand colour untouched** and use the skin's own ink as the label: **5.45** on the candy
  teal, and it works on the pink stop too. **`.btn.gold` on this same skin already does this**
  (`color:#4a2f04`) — so B is an established pattern here, not an invention.

**B does not work on the danger stop** — mid-toned, and neither white nor the ink clears it, so that one
wants A. Recorded because *"just use dark text everywhere"* would otherwise become a second round of bugs.

**Deliberately not applied.** Unlike slice 47's clamp, nothing here is misconfigured: these are hand-picked
brand colours and changing one changes how the skin looks. That is genuinely the owner's call — what was
missing was the numbers to make it in one step. The rule shapes are asserted alongside, so a restructured
button fails this file rather than leaving it asserting numbers about CSS that no longer exists.

**Where the line now sits, after three slices of testing it:** slice 46 deferred and was wrong (the
mechanism was broken); slice 47 fixed it; slice 48 found the same shape again in undefined tokens; this one
deferred and is *right*, and can show why — the mechanism is sound, only the choice remains. 15 tests.

### Slice 48 — six `var(--hx-…)` references named tokens that do not exist

Following slice 47's lead — *"other tracked contrast items may share a mechanical cause"* — found a
different one. **Eleven `--hx-*` tokens are referenced across `app/dnd` and never defined.** Six of those
references supply **no fallback**, which makes the declaration invalid: the browser drops it.

- **`IGCharacterBuilder` used `color: var(--hx-ink)` on four text elements.** `--hx-ink` exists only in
  `custom-sheet.ts`'s standalone-export CSS — a different scope — so the colour was dropped and the text
  **inherited its parent's**. That is *precisely* slice 34's `🜲` glyph bug (*"named no colour, so it
  inherited the page's base `#0f1419` … measured 1.39:1"*), alive in a second place **because nothing was
  looking for the shape, only for the instance**. Now `--hx-text`, clamped to 7:1 on every skin.
- **`useIgPanels` used `border: 1px solid var(--hx-gold)` twice.** Invalid → the border fell back to
  `currentColor`, so a *"this value changed"* affordance rendered in the text colour instead of gold. The
  affordance silently did not work. Now `--hx-gold-1`.

Also fixed one that *had* a fallback and should not have: **PF2's Hero Point diamonds** are text hardcoded
to `var(--hx-gold, #c8aa6e)` — the pre-clamp gold, bypassing the ramp slice 47 had just corrected, and
exactly the *"`#c8aa6e` on near-white = 2.08"* the contrast baseline names. Now `--hx-gold-2`, matching its
own sibling label one line above it.

**The remaining skin-blind references are inventoried, not swept.** They render (a fallback exists) but
always in one colour whatever the skin. A hardcoded dark-theme value can be *worse* on a light skin, so each
needs its own surface measured — the same call slice 34 made about the 22 files it declined to touch.

The guard fails on any `var(--hx-…)` without a fallback naming an undefined token, and on any **new**
undefined token even with one — so the list can shrink but not grow quietly.

**Why this is the more useful half of the finding:** slice 34 fixed one glyph that inherited the page ink,
and the fix was correct but *local*. The same mistake was sitting four times over in a neighbouring file the
whole time. A defect found by eye gets fixed where it was seen; only asking *"what shape is this?"* finds
the rest.

### Slice 47 — it was never a colour decision: the clamp had two bugs

Slice 46 left the gold heading as an owner call. **Reading the derivation instead of the rendered colour
showed it was not one.** `gold2` was *already* `ensureContrast(gold, …)`, with the comment *"gold-2 is the
workhorse — it paints section titles as TEXT on the panel — so it's the one we contrast-clamp."* The intent
was right all along; the clamp had two measurable bugs.

- **The surface.** `.framedPanel` paints `linear-gradient(180deg, var(--hx-panel-2), var(--hx-panel))` and a
  title sits at its **top** — on `panel2`, not `panel`. `panel2` is the worse backdrop *in both directions*
  (darker on light skins, lighter on dark), so clamping against `panel` flattered every result by ~0.4.
- **The threshold.** These titles are 13–14px **bold**, and bold earns WCAG's relaxed 3.0 only at ≥18.66px.
  Below that it needs 4.5 — so the targets of `4` (light) and `3` (dark) were both short.

Now `ensureContrast(gold, panel2, 4.5)`, in **both** derivations — the skin path and the theme path carried
the same line.

| skin | before | after |
|---|---|---|
| streamer | **3.70** ❌ | **4.77** ✅ |
| donata | **3.64** ❌ | **4.76** ✅ |
| jack | **3.75** ❌ | **4.55** ✅ |
| lazzuh (dark) | 9.04 | **9.04** — unchanged |

**The hue survives.** `#7f5c00` / `#965e0a` / `#8a6215` are deepened ambers, not a fallback ink —
`ensureContrast` steps 4% and stops the moment the ratio is met. That is pinned by a **channel-order guard**
(red ≥ green > blue, not near-black), because the ratio assertion alone would happily accept a clamp that
ran away to black or drifted off-hue. The dark no-op is asserted too, not assumed: slice 21's defect
survived precisely because a fix was checked on one skin.

**The lesson worth carrying:** slice 46 was right that a *colour* is the owner's call, and wrong that this
was a colour. Deferring to taste is correct only after checking whether the mechanism is simply broken —
here the token was already trying to do the right thing against the wrong surface, and one line fixed every
skin at once without anyone choosing a shade. **"This needs a human decision" is itself a claim that
deserves a measurement.**

### Slice 46 — the contrast check, and a defect I did not fix on purpose

Slice 44's other owed item. It found a real failure: the new panel's heading is **13px bold** — which still
needs **4.5**, since bold only earns the 3.0 threshold at ≥18.66px — and measures **3.70 / 3.64 / 3.75** on
streamer / donata / jack.

Measured against the **panel-2** stop specifically: `.framedPanel` is `linear-gradient(180deg,
var(--hx-panel-2), var(--hx-panel))` and the heading sits at its top. Measuring against `--hx-panel` would
have flattered it by ~0.4 — the difference between *"fails"* and *"borderline"*, and precisely the
"measured a proxy instead of the thing" error this evidence file has logged three times.

**Deliberately not fixed, and that is the substance of the slice.** The heading uses `var(--hx-gold-2)` —
the house style, the same token the IG panels' own `<h3>` section headings use at the same weight. So it is
not a defect the new panel introduced; it is the **same gold-family item this doc already tracks** among its
remaining colour decisions. Fixing one heading in isolation would leave every sibling failing while making
the new panel the odd one out, and would pre-empt a call that belongs to whoever owns each skin's identity.
All three are within **~0.9** of passing, so it is a tuning decision, not a rewrite.

**The structural finding, which generalises well past this heading:** `skin-tokens.ts` derives `--hx-text`
and `--hx-muted` through `ensureContrast(…, panel, 7 | 4.5)` — **clamped against the panel, correct on every
skin by construction**. The gold ramp is *not* clamped; it is the skin's own swatch, darkened. **The ink
tokens are safe by design and the gold ones are safe only by luck**, which is exactly why the light skins
broke and the dark ones did not. That is the shape of the whole remaining gold-family item, and it suggests
the fix is to route the ramp through the same clamp rather than to hand-pick colours per skin.

Asserted in both directions, so a broken clamp fails loudly too. The panel's **body** text uses the clamped
tokens, so what a DM actually reads is legible on every skin while the heading decision stays open. 9 tests
— and when the gold family is retuned this file fails, which is the signal to flip the assertion and close
the item, not to delete it.

### Slice 45 — rendering the state that had never rendered

Slice 44's gap, taken seriously: with no audit rows on any bespoke character, the panel's populated state
existed only as source-greps. That is the weakest proof this repo accepts, and its own history says why —
a build gate passed **nine** source-anchored tests while refusing every legal build, and a green 15k-test
suite missed three rendering-condition bugs in one browser pass. **A grep proves a branch exists; only a
render proves it puts the right thing on screen.**

The markup is now split into `EditHistoryView` — the same split `CampaignsPanel` got from
`CharacterCampaigns`, for the same reason: a fetching container renders its populated state only after a
request resolves, which never happens under `renderToStaticMarkup`.

**12 render tests.** The load-bearing one proves slice 37 end to end **through the component** rather than
through `describeEdit` in isolation: a bespoke row shows *"Learned the Arcane Spell power."* and **not**
`ig:add_power`. Also pinned:
- DM vs player attribution;
- the **deleted-account fallback** — `editor_user_id` is `ON DELETE SET NULL`, so a removed account must not
  render *"null (player)"*;
- **no Revert control on any row**, asserted on the rendered `<button>` rather than the word, since the
  source explains at length why there is none;
- a list of **only** `revert:` rows reads as **empty**, not as a heading over nothing — the exact bug
  `CampaignsPanel` hit and the reason its own gating was rewritten.

**Still not a browser:** no effects run, no CSS applies, and nothing here proves the panel's colours clear
AA or that it sits sensibly on the page. That half of slice 44's gap stands.

### Slice 43 — a real production build, and a lint warning that was a trap

**`npm run build` had not been run once this session** — thirteen slices verified by `tsc`, `eslint` and
5,681 tests, none of which make the check a build makes. It catches server/client boundary violations, and
slice 38 put a `'use client'` component into a server page, so it was owed.

**Result: `✓ Compiled successfully`.** No errors. Every warning pre-existing — `<img>` vs `next/image`, and a
handful of `react-hooks/exhaustive-deps`. So the session's work is production-clean, which is now recorded
rather than assumed. (This also closes the "npm build" item the multi-format template work left open.)

**One of those warnings was a trap, and it sat in `LevelBuilder.tsx`** — the file this session has worked in
most. The draft-reset effect depends on `[current?.level, current?.kind]`; the rule wants `current` itself.
**Satisfying it would be a real bug.** `current` is `plan?.outstanding?.[0]` — a fresh object on every
refetch — so the effect would re-run and **wipe a half-filled draft out from under the player**: the ability
scores they had picked, the skills they had ticked, gone every time the plan reloaded.

Checked rather than silenced blindly: the effect body reads no other field of `current`, so there is no
stale closure to fix. Now suppressed **with the reasoning inline**, using the convention already in this
repo, so a standing warning stops inviting someone to "fix" it into that bug.

**Worth naming, because it is the third instance in three slices:** a linter demanding `current`, a guard
demanding `getDndSession`, and a test demanding `f.level <= choice.level` were all *tools insisting on one
spelling of a correct thing*. Each time the tempting move was to change the code to satisfy the tool. Twice
that would have introduced a bug; once it hid one for a whole slice. **When a tool flags code you have
reason to believe is right, the first job is to find out which of you is wrong — not to make the message go
away.**

### Slice 42 — the write sweep, and knowing when a guard is testing the wrong thing

The last of the three access sweeps, and the one with the most at stake: the **55** POST/PATCH/PUT handlers
under `characters/[id]`. A stranger *modifying* someone else's character is worse than reading it, and /dnd
is public by direct link.

**Clean again.** Every handler already answers *"whose character is this?"* before writing. Two pinned by
name: the **PATCH chokepoint** every in-place editor autosaves through still gates *before* parsing the
body, and the **tip route** funds from the caller's own character (`.eq('owner_user_id', userId)`) rather
than the streamer's — without which tipping would be a way to spend someone else's currency. That one's
entire authorization lives in a helper, which is why it is called out rather than left to the pattern.

**The lasting finding is about the guard, not the routes.** The DELETE suite carried a second assertion —
*"did it resolve a caller?"* — and it flagged three correctly-gated routes on its first run. This suite made
it **four** (`POST levels/route.ts` resolves access through a local `load()` helper, so no recognised
function name appears in the handler body). Three separate false alarms is the signal: that assertion tested
a **proxy** — which function name appears — rather than the property, and it was redundant anyway, since
authorization cannot be answered without first establishing who is asking.

It is dropped. **Its only real effect was inviting someone to loosen a guard so that correct code would
pass**, which is how a guard like this dies quietly.

The same discipline is recorded in the negative: `load(` is **explicitly not** in the predicate list, with a
note saying why. It is a loader, not a gate; the route authorizes with `canWrite` one line later. Adding it
would have made the suite pass by naming a function that checks nothing — and I nearly did, which is exactly
why the note is there rather than the entry.

59 tests, no production change. **The three sweeps together — reads, deletes, writes — now hold the whole
`/api/dnd` character surface, and each fails loudly on a new unclassified route.**

### Slice 41 — the destructive sweep, and why a clean result still needs an artefact

Slice 40 swept what routes GIVE AWAY. This one sweeps what they DESTROY: every `DELETE` under `/api/dnd`.

**The result was clean.** All 19 already authorize beyond *"is signed in"* — via `getCampaignRole`,
`requireDm`, `requireCharacterWrite`, `canWrite`, `isOwner`, `isDndOwner`, `canManage`, or an ownership
check. Nothing to fix.

**Which is exactly why it is now a test.** A clean sweep leaves no artefact: the next reader has no way to
tell it was ever run, and the property survives only as long as nobody adds a route in a hurry. Slice 39's
leak was not a mistake anyone would defend — it was a rule four people knew and one person missed. A
negative result that isn't written down decays the same way.

*"Signed in"* is never sufficient here. Every one of these deletes something inside **someone else's game**
— a campaign's map, an encounter, a member, a character, a DM grant, a stream alias — so the question is
always *whose it is*, never merely *who is asking*.

The DELETE handler's body is extracted and checked **on its own**, since a gate in another export in the
same file protects nothing. Two cases are pinned by name rather than pattern:
- **Deleting a character stays owner-only.** A DM may edit your character but must not erase it; `canWrite`
  there would be a catastrophic loosening that reads as a tidy-up.
- **Deleting a stream alias 404s rather than 403s**, so absence and denial look identical to a stranger.

**The suite's first run flagged three correctly-gated routes, and both causes were bugs in the suite:** two
resolve the caller through `getCharacterAccess`/`requireCharacterWrite` instead of calling `getDndSession`,
and `canManage` was missing from the predicate list. Worth recording because the failure mode of a guard
like this is *demanding one spelling of a correct thing* — and the fix under pressure is to loosen the guard
rather than to understand the route. Both reasons are now inline for whoever widens the list next.

22 tests, no production change.

### Slice 40 — the access sweep, and the boundary made checkable

The right follow-up to a leak is not "fix it and move on" but "how many siblings have it?" — so every
character-scoped GET was swept.

**Result: no further leaks.** Slice 39's was the only one. `uploads`, `levels` and `homebrew-subclass` all
already gate their GET on write access, which is the useful finding: **the boundary was never in dispute,
it just lived in four separate readers' heads and one of them slipped.**

All **14** character-scoped GET routes are now enumerated *from the filesystem* and classified, and a NEW
one fails the suite until it is added:

| class | routes | why |
|---|---|---|
| **WRITE** | `edits`, `uploads`, `levels`, `homebrew-subclass` | Anything about the character's **construction or history** — who changed what, the source files behind the build, the level-up workspace, an unpublished draft. These describe the *player's process*, not the character, and a public sheet does not make its process public. |
| **READ** | `route.ts`, `export`, `ig-levels`, `pf2-levels` | Content the sheet already shows. |
| **SESSION** | `campaigns`, the five `stream/*` | The answer depends on **who is asking**. |

**The one judgement recorded rather than glossed:** `ig-levels`/`pf2-levels` stay read-gated while 5e's
`levels` is write-gated — an asymmetry that looks like a bug and isn't. Both are asserted to derive from
`row.data` and to touch neither `dnd_sheet_edits` nor `dnd_character_uploads`, so they expose nothing a
reader cannot already fetch. That assertion is the thing keeping the classification honest: if either ever
reaches for a privileged table, the test fails rather than the reasoning quietly going stale.

Fail-visible by design, the same choice `lib/dnd/audit/bespoke-ops.ts` makes — one line to classify a route,
against what forgetting cost last time. 18 tests, no production change.

### Slice 39 — a public character's edit history was readable by anyone

Found by auditing the slice before it: `SheetEditHistory` gates on `canWrite` **client-side**, so the
question was whether the server agreed. It did not.

`GET /api/dnd/characters/[id]/edits` gated on `getCharacterAccess` alone, and `canRead` is
`canWrite || visibility === 'public' || (campaign && isMember)` — with **/dnd public by direct link**. So
anyone with the URL could pull forty rows of a character's revision history: every field's old and new
value, the DM's rulings, off-rules notes, and the **display name** of whoever made each change.

**The sheet being public does not make its history public.** And the rule was already written — twice,
in the UI: *"A viewer who can't write the sheet has no business in its edit history"* (`EditReviewPanel`),
and the same in `SheetEditHistory`. It existed in two components and nowhere on the server. **Hidden panel,
open endpoint** — the same shape as "gating only the AI", which this codebase has now hit in four places.

GET now requires `canWrite`, matching what the UI claimed and what POST on the same route already required.

**One UX consequence, deliberate and reversible.** `use-element-edits` reads this endpoint with no write
check of its own, to enrich the ✎ tooltip with the specific change. A viewer now gets a 403 and the tooltip
falls back to its generic marker text — the path its **own comment** calls *"expected rather than
exceptional"*. So a viewer still sees THAT an element was customized, just not who changed it to what.
That fallback being designed-for is what made this safe to ship rather than a guess; **if you want viewers
to keep the detail, it needs an element-scoped endpoint, not bulk history access** — a slice, not a flag.

8 tests, including the access-matrix facts underneath it: a public character is readable but not writable,
a campaign member who is not on the character likewise, and everyone who *should* see history — owner,
assigned player, DM — has write.

### Slice 38 (2026-07-26) — and there was nowhere to read them

The end of the chain, and the biggest of the four. Slices 35–37 made IG/PF2 edits record, behave and read
correctly — then the obvious question: **where does a DM actually see them?** Nowhere.

**Neither `IGSheet` nor `PF2Sheet` rendered any edit history at all.** `EditReviewPanel` is bound to the
shared 5e store (`useChar`, for the ✎ approve-all pass over `char.attacks`/`inventory`/`features`/`spells`)
and the bespoke sheets do not use that store, so they simply mounted no review surface. On half the systems
the platform's promise — *"every change is visible to the DM, and reversible by them"* — was false in **both
halves at once**: nothing was recorded, and there was nowhere to look. Each half hid the other, which is why
neither was noticed.

`SheetEditHistory` is store-free — `characterId` + `canWrite` — reads the same `/edits` endpoint, applies
the same revert-row filter, and renders through the **same `describeEdit`**. Not a second formatter: that is
precisely where two vocabularies drifted once already, and a copy here would have been the third.

**Read-only by nature, not as a shortcut.** A bespoke row carries no `new_value`, so the revert route
refuses it by design — a button here could only ever fail, which is the dead control slice 36 just removed
from the shared panel. Rebuilding it on a new surface would have undone that slice. The panel says why
instead of leaving the absence unexplained.

Gated twice (the fetch is skipped *and* the render bails), so a `canWrite` that flips after load cannot leak
history to a viewer. Loading and empty are kept distinct — *"this sheet is as it was built"* is a much
stronger claim than *"not loaded yet"*, and conflating them is how an empty state starts lying. 12 tests.

**One test caught its own first draft:** asserting the file does not contain `"Revert"` failed on the
comment explaining why there is no Revert. It now asserts on the control, not the word — a small reminder
that a source-level test can fail on its own documentation.

**⚑ And the slice's own first mount was wrong, caught in the next pass (`087eda67`).** The panel went inside
`IGSheet` and `PF2Sheet` — both of which **return early for the codex / dashboard / play formats**, so it
rendered on Classic and nowhere else. **One layout in four: the exact "authored but not wired" defect this
session keeps finding, reintroduced by the fix for a different one.**

Moved to the character page chrome beside `VariantToggleView`, which is mounted there for precisely this
reason and whose comment already said so — *"the shared 5e engine no longer renders for a built PF2/IG
character"*. The precedent was three lines away and I walked past it.

The tests now assert **both directions** — the page renders it, and neither sheet does. Asserting only
presence is what let the first version pass, which is the same weakness as a test that pins a gate exists
without asking what reaches it. That has now been the failure mode in this doc four times.

### Slice 37 (2026-07-26) — the queue printed raw opcodes

Third and last consequence of slice 35, found the same way as slice 36: **follow the new rows all the way to
the reader.** They reach the DM through `describeEdit`, and it had no case for them:

```
ig:add_power                                                        ← what the DM saw
Gained the power Arcane Spell — off-rules: not a Beastmaster power  ← what the row already held
```

The sentence was in the row's `summary` column the whole time. Nothing read it. **This is the same failure
`lib/dnd/edit-describe.ts` was written to close** — its own header describes a queue that *"showed a DM
which field a player touched but never what they did to it"* — recurring on a row shape that did not exist
when it was written. A formatter with three vocabularies had grown a fourth without noticing.

**The summary is a FALLBACK, not a preference**, and that ordering is the whole risk in this change. A
structured edit or a real before/after pair is more precise than a generic sentence, so the summary is
consulted only where the row would otherwise degrade to a bare path. Preferring it would have flattened
`spell.Fireball.damage: 8d6 → 10d6` into "Buffed Fireball" on every AI and manual row — a far larger
regression than the bug being fixed. Pinned in both directions, plus the empty/whitespace summary that a
naive `summary ||` would have rendered as a blank line. 9 tests.

**Three slices from one change, and that is the point.** Slice 35 added rows; 36 found a control that could
not act on them; 37 found a reader that could not describe them. None was visible from the diff that caused
them — each needed following the new thing to its next consumer.

### Slice 36 (2026-07-26) — a Revert button that could only ever fail

**Follow-through on slice 35, and the reason a slice should be checked for what it makes COMMON.** The
review panel rendered "⟲ Revert" on every row; the revert route refuses any row carrying no `new_value`
with *"This edit carries no reversible change."* A DM clicking Revert on a bespoke-sheet row got an error
every time, with nothing to do about it — a **dead control**, which is on this doc's own hunt list.

It was pre-existing (the AI path has written `ig:*` / `pf2:*` rows for a long time), but slice 35 turned it
from rare into routine by filing one for every IG/PF2 build edit. Checking that was the point.

**Why those rows cannot revert, and why that is correct:** they describe a change to a **sidecar** the 5e
`Character` shape cannot express, so `revertSheetEdit` has nothing to replay backwards. They are real
history, not undo points.

**The wrong fix, rejected explicitly:** filtering those rows out of the queue. That hides a change from the
DM to avoid an awkward button, which is strictly worse than a row without one — the queue's entire purpose
is that nothing is invisible. The row now shows **"record only"** where the button was, and a test pins that
the visible-row filter still drops only the revert-audit rows.

`isRevertableEditRow` moved beside `revertSheetEdit` and answers for all three callers — the panel, the
single revert route, and the batch revert route. The batch one was *already correct* inline (`!!r.new_value`)
and was routed through the predicate anyway, so a future change to the rule cannot reach two of three
callers and miss the third — the same failure that produced two audit vocabularies on the shared sheet.
The server still 400s on a direct POST: **the hidden button is a courtesy, the refusal is the guarantee.**
10 tests.

### Slice 35 (2026-07-26) — IG and PF2 sheet edits never reached the DM's review queue

Found by taking the previous slice's *method* rather than its subject: the rules-platform sweep concluded
*"every mechanical build path on the shared sheet now audits"* — and **the shared sheet was the whole
scope**. The two bespoke sheets write through their own routes. Neither audited anything.

`ig-edit` and `pf2-edit` inserted **no row at all**, so on an IG or PF2 character a player could add a feat,
add a power or spell, change an ability score, or add an attack, and the DM saw nothing. **Content taken
through the escape hatch was invisible too** — which is what that queue exists to surface, and what S8c/S8d
built the DM's per-exception rulings on top of.

**It is a bug, not a gap, because the AI path already audits these** (`ai-edit` writes `ig:<op>` /
`pf2:<op>` rows). `ig-edit`'s own header makes the argument for the mirror case: *"gating only the AI would
make 'use the manual control instead' a way around the rules."* Auditing only the AI makes the manual
control a way around the review queue — and the manual control is the one players actually use.

Both routes now audit, honouring the boundary the shared sheet already settled — **BUILD audits, PLAY does
not**. A stance switch, a condition, HP, temp HP, PF2's dying/wounded track and its hero/focus pools stay
out, or they would bury the build changes the queue exists for.

**Two decisions worth keeping:**
- `lib/dnd/audit/bespoke-ops.ts` owns the classification so the routes cannot drift — the same reason the
  entitlement core is shared across three systems.
- It is a **deny-list**: an op nobody has classified **audits**. The costs are asymmetric — an unclassified
  play op is a filterable noisy row, an unclassified build op is a silent change to a character, which is
  the defect itself. An unrecognised system audits for the same reason.

Rows reuse the AI path's field-path vocabulary so one event reads identically however it was made; carry
`source: 'manual'` (the column's CHECK allows `ai|manual|revert`); describe the edit that was **applied**
rather than the one requested, since the gate can alter it; note off-rules content; land only after the
character write succeeds; and are best-effort, so a failed audit cannot fail a player's edit.

52 tests, including one that reads both edit unions out of the source and asserts every name in a play set
is a real op — a typo there would fail safe but leave a genuinely-play op logging forever.

### Inherited 2026-07-26 — map-viewer handles (from `DND_RULES_PLATFORM`)

One interactive check moved here rather than being left open in a doc whose other items are all shipped:
**scale from any corner and rotate from the stem, and confirm both persist**, on a map-viewer object.

Its static half is already guarded — `map-viewer-handles.test.ts` pins that `renderHandles` keys off `kind`
(only `text` bails) and never off the art DOM, so the spiral/spin (`spingalaxy`) and 3D (`planet3d`)
variants, which render a `<canvas>` rather than an `<img>`, still get handles. A future early-return that
stripped them fails in CI.

What is left is drag maths against a real pointer, which no unit test reaches. Note when running it whether
the image had spiral or spin on: a stale deployed build and that specific variant are the two live theories
for the original "handles disappeared" report, which was never reproduced.

### Slice 34 (2026-07-26) — the last two contrast BUGS, and the sweep that was deliberately not run

The baseline's item 4 called the IG `🜲` glyph *"the one entry here that IS probably a plain bug"* and
paired it with `COMBAT SKILLS` at 3.33. Both are now closed and **the IG row of the baseline is 0 failing**.

- **The glyph was already fixed** (`3367cbc2`) before the item was picked up. The same stale-evidence trap
  these docs keep recording — the cheapest step is always *check the code before working the item*, and it
  has now paid off three separate times in this pass.
- **`COMBAT SKILLS` is fixed** (`d171b8dd`), along with **seven sibling sites the original token change had
  missed**: the condition chips on both panels, the CUSTOM badge, the flat-d20 line, the lethal count and
  the two remove buttons. All nine danger-coloured TEXT uses in `useIgPanels.tsx` now take `--hx-danger-2`
  — **3.19–3.50 → 6.62–7.26**, hue unchanged.

**What makes this a QA slice rather than a token swap** is the two things it refused to do:

1. **Borders keep `--hx-danger`.** A border needs 1.3:1, not 4.5, and the base red is what the accent
   language is built from — so the edit was made by CSS *property*, not by replacing the token. A
   find-and-replace would have taken every border with it.
2. **The other 22 files carrying `color: var(--hx-danger)` were left alone.** This is the contrast file's
   own hard-won lesson applied instead of restated: the roller-dock slice proved a surface can be painted
   from the skin-derived `--panel` family while its text comes from `--hx-*`, so **on a light panel the
   lighter red is worse, not better**. A blind 41-site swap would have been the fourth
   "measured a proxy instead of the thing" mistake in that file's history. Those sites need a browser pass.

**The model was validated, not trusted:** `theme-contrast.ts` computed 3.50 where the browser measured
3.33 — same verdict, model slightly optimistic. That agreement is what licenses fixing the eight siblings by
computation, since they sit on the same surfaces in the same file. The condition chips were never measured
in place at all: the sampled character held no conditions, so they were invisible to the sweep rather than
passing it — which is the same "counts only what rendered" caveat the baseline records about itself.

`__tests__/dnd/ig-danger-text-contrast.test.ts` (9) pins the **rule** — text takes the lighter token,
borders keep the base — and the token values the ratios depend on, so retuning either red fails loudly
rather than leaving a stale number in the evidence file.

### 2026-07-26 — browser pass over the spell-count work (slot plan S7/S7b)

Driven on a live dev server with a minted `dnd_session`, against **Donata Dime** — a 2024 Cleric 3 holding
**6 cantrips (class grants 3)** and **6 prepared (grants 6)**. Chosen deliberately: an already-over-cap
character is the case a new cap is most likely to break.

| Check | Result |
|---|---|
| Sheet renders after the cap change | ✅ no console errors |
| `PREPARED 6 / 6` on the caster header | ✅ **derived**, where before it showed a bare count (only a demo character ever had a stored cap) |
| Spell picker budget line | ✅ `Cantrips 6/3 · this class PREPARES from its list, so the number it prepares is capped on the sheet, not here` |
| Cantrips refused | ✅ **9 of 9**, all disabled, all genuinely cantrips |
| Levelled spells still addable | ✅ **24** — a preparer's LIST is correctly not capped by its PREPARED count |
| Over-cap character grandfathered | ✅ keeps all 6 cantrips; only blocked from adding a 7th |
| Prepare at 6/6 | refused ✅ |
| Un-prepare at 6/6 | ✅ always allowed (5/6) |
| Prepare once under cap | ✅ allowed again (6/6) |

**One defect found and fixed, invisible to the whole suite.** The prepared refusal was **silent**: at 6/6
the Prepare button stayed live, clicking it did nothing, and nothing said why. The logic was right and the
markup was fine, so no source-grep or render test was ever going to catch it — a control that ignores a
click reads as broken, not as a rule. It now disables at the cap, reads **"No room"**, and its tooltip says
*"your class prepares 6 spells at this level — un-prepare one first."* — the same treatment the picker
already gave. Pinned by four tests in `spell-count-enforcement.test.ts`.

**Live data touched and restored.** Toggling prepared spells persists, so this pass moved Donata Dime's
prepared count and put it back: the row ends at 18 spells / 12 prepared / 6 counting against the cap, byte
for byte what it was found at (verified against the DB, not assumed).

### 2026-07-26 — browser pass over the escape hatch (slot plan S6b), PF2

The hatch shipped on unit tests alone across all three systems. Driven on the **PF2 guided builder** for
Orin Sallowmere: ancestry → four steps → feat search "rage".

| Check | Result |
|---|---|
| Hatch renders once a search surfaces refusals | ✅ `Add a different feat…` |
| Ineligible chips greyed with their reason | ✅ Ancestor's Rage (L13), Aura of Courage (Champion), Share Rage (Barbarian) — all correct for a level-1 non-Barbarian |
| Button wording for a player | ✅ `+ Take it anyway` |
| The blurb states the cost | ✅ *"Recorded as an exception — this character will read \"Altered vanilla\" and name it."* |
| Taking one moves it to the exceptions list | ✅ `Taken outside the rules — 1 exception`, with **Undo** |
| Console errors | ✅ none |

**One defect found and fixed, and it was the exact thing this feature exists to do.** The dropdown offered
*"Ancestor's Rage — Ancestor's Rage is a level-13 feat; this character is level 1."* One click later the
exceptions list read **"Ancestor's Rage — not normally available"**. The reason was gone.

Cause: every picker computes `blocked` by excluding what is already selected — correct, since a taken pick
is no longer on offer — so `TakeAnyway`'s reason lookup found nothing the moment it mattered most, and fell
back to generic wording. A badge that says something changed without saying what is the failure this whole
strand was built to prevent, and it was live in all three systems.

`TakeAnyway` now remembers each reason it has been shown (a ref, since caching something already rendered
must not cause a render). Re-verified in the browser: the taken row reads the full objection.

**Why no unit test caught it:** the fix is a cross-RENDER cache and `renderToStaticMarkup` mounts fresh
every call, so there is no second render for the bug to appear in. That limit is recorded inline in
`take-anyway-wiring.test.ts` rather than papered over with a test that only looks behavioural.

**No live data changed** — the builder was driven up to the pick and never saved.

### 2026-07-26 — browser pass over the escape hatch (slot plan S6c), IG — all three systems now driven

Driven on the **IG guided builder** for Vashti Kelln: ancestry → class **Archon** → subclass **Beastmaster**
→ three steps to the powers block.

| Check | Result |
|---|---|
| Powers block carries its budget | ✅ `POWERS (0/1)` |
| Hatch renders, with IG's own noun | ✅ `Add a different power…` — not "feat" |
| Offered with the rules' objection | ✅ *"Dispel Magic — Dispel Magic is not a Beastmaster power."* |
| **Reason survives being taken** | ✅ *"Dispel Magic — Dispel Magic is not a Beastmaster power."* — the S6b fix holds on IG too |
| Budget updates | ✅ `POWERS (1/1)` |
| **Stances get NO hatch** | ✅ exactly one `Add a different…` control on the page, and it is the powers one |
| Console errors | ✅ none |

The stances result is the one worth calling out: `Chips` is shared by powers, stances and weapon types, and
the hatch was deliberately mounted on the powers block rather than inside `Chips` — because stances and
weapon types are uncapped by design and have no eligibility rule, so a hatch there would offer escape from a
constraint that does not exist. The page confirms it: one hatch, on the only list IG's gate actually refuses.

**All three systems' hatches are now browser-verified** (5e's count caps 2026-07-26, PF2 S6b, IG here).
**No live data changed** — the builder was driven to the pick and never saved.

### 2026-07-26 — live-data audit after the level-walker gates (slot plan S6d)

The PF2 and IG level routes validated only the SHAPE of a recorded choice until today, so a pick made
through them was never judged against eligibility. Gating new picks does nothing about ones already
stored, so the live database was audited read-only for choices the new gates would refuse.

**Result: no exposure — but for a reason worth stating precisely, because the headline number is
misleading on its own.** The audit reported `CHECKED 0 … FOUND 0`. It found nothing wrong because there
was **nothing to check**: not one of the three live PF2/IG characters (Orin Sallowmere, Vashti Kelln,
`dddddd`) carries a `pf2Build` or `igBuild` block at all. No level-walker pick has ever been recorded on
them.

So: **no cleanup is needed**, and equally **this is not evidence that the walkers were producing legal
characters** — they had simply never been driven to the point of recording a choice. A "0 found" that
comes from an empty set is not the same claim as a "0 found" from a full one, and reading it as the
latter is exactly the kind of false reassurance this pass exists to avoid.

The audit script is disposable (it lived in the scratchpad and wrote nothing), but the query is trivial to
repeat: read `pf2Build.choices` / `igBuild.choices`, skip anything already carrying an `exception`, and
run the same `pf2FeatEligibility` / `igPowerEligibility` the routes now use. Worth re-running if these
characters are ever levelled through the walkers before the gates are browser-verified.

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

### 2026-07-26 — slice 29: the sweep's maths moves into the library, with its own bugs as the tests

The contrast arc's two measurement bugs both lived in a snippet pasted into a browser console — which is
precisely why they survived: **a console one-liner has no tests and no reviewer.** They cost two slices, one
retraction, and nearly two rounds of "fixes" to working code.

`lib/dnd/theme-contrast.ts` now exports the corrected measurement alongside the arithmetic it already had:

- `backgroundLayers(style)` — an element's layers, topmost first, reading `background-image` as well as
  `background-color`, splitting on **top-level commas only** so a gradient's internal commas are not layer
  breaks, and returning `[image1 … imageN, color]` in true paint order.
- `backdropOf(chain)` — the colour actually behind text, given the style chain from the element outward.
  Reuses the existing `flattenStack`, which already stopped correctly at the first opaque layer.
- `measureText(text, chain)` — ratio, the per-SIZE AA threshold, and the pass/fail.

`__tests__/dnd/contrast-backdrop.test.ts` (14) pins **both bugs using the real computed values from the two
elements that produced them**: the roller dock's gradient (bug 1 — gradient ignored → labels measured against
the page behind) and `.dnd-sheet`'s pinstripe-over-opaque-base (bug 2 — first layer only → climbed to the dark
chrome). The last test in that block reproduces the OLD reading and asserts it fails, so the artifact itself
is documented rather than just absent.

The gradient approximation (one stop stands in for a ramp) is stated as a limitation in the code, with the
remedy: near the threshold, measure the pixel region rather than the model — which is how the roller's active
tab was actually checked.

**Bar:** 14 new guards, 5000/5000 D&D tests, typecheck exit-0, lint clean. No app behaviour changed.

### 2026-07-26 — slice 30: sweeping the BESPOKE sheets, which nobody had swept

Every contrast pass in this arc had run on 5e sheets. PF2 and IG have their own panels, their own CSS and a
deliberately different token story, so they were genuinely unmeasured. They were not clean.

| sheet | sampled | failing |
|---|---|---|
| Vashti — IG, **default (dark) skin** | 302 | 5 |
| Orin — PF2, streamer (light) skin | 105 | 14 |

**Fixed: custom sections were invisible on the IG sheet — 1.11:1, on the DEFAULT skin.** `SectionsManager`
renders "No custom sections yet", "＋ Add section" and "Save changes" with no colour of its own, and its
buttons are `color: 'inherit'`, so the whole block took the page's base `#0f1419` — a near-black meant for
light surfaces — onto the bespoke sheet's `#101f31` panel. This is *precisely* the defect `bespokeButtons.css`
exists for and describes verbatim; that file only reaches `.btn`, and none of this is a `.btn`. Colouring the
root with `var(--ink, var(--hx-text, #f0e6d2))` fixes every descendant at once: **measured 13.45:1 after.**

Worth stating plainly: this was not a light-skin edge case. It was the **default** skin, on a shipped feature,
and it means custom sections have been unreadable on IG sheets since D-13.

**Recorded, not fixed — the remaining 4 + 14:**

- **PF2 dice pad (6 failures):** the skin's clamped gold `#966c00` on the pad's dark `#302a49` = **2.86**. The
  same family mismatch again — a gold clamped for the LIGHT panel, painted on a dark control. The fix is the
  established rule, but the pad is shared with 5e, so changing it needs the 5e sheets re-measured too; that is
  its own slice rather than a change smuggled into this one.
- **PF2 chip values (8):** `#966c00` on the light `#f2e4ee` = **3.85** — the same token on the *other* side,
  0.65 short. Genuinely marginal.
- **IG "COMBAT SKILLS" label (1):** `#c6403b` = **3.33**. The same danger red slice 28 lightened, at a site
  that fix did not reach.
- **IG `🜲` glyph (1):** 1.39, same inherit-the-page-ink cause as the sections block, in a different panel.

**Bar:** 5000/5000 D&D tests (a first run reported 427/4993 — the intermittent collection flakiness the vitest
config documents; re-run confirmed 428/5000 and `git status` confirmed nothing lost), typecheck exit-0, lint
clean. Dev server stopped, port released.

### 2026-07-26 — slice 31: the PF2 dice-pad finding was measuring hidden UI. Third tool bug.

Went to fix the dice pad's 2.86:1 gold and probed first, because the numbers didn't reconcile: the pad's
backdrop measured `#302a49` (dark) on a sheet whose dock I had measured as near-**white**.

**The pad is inside `.fld` with `display: none`.** The roller dock was collapsed; `checkVisibility()` is false
and `getClientRects().length` is 0. My sweep tested `display`/`visibility`/`opacity` **on the element itself
and never on its ancestors**, so everything inside a collapsed container came through. Recolouring those
buttons would have been a change nobody could ever have seen. **Finding retracted.**

**How much of the sweeps was never on screen:**

| sheet | leaf text nodes | actually rendered | hidden |
|---|---|---|---|
| Vashti (IG) | 314 | 208 | **106 (34%)** |
| Jack (5e) | 196 | 145 | **51 (26%)** |

So every aggregate COUNT in slices 25–30 is inflated by roughly a quarter to a third. **The individual fixes
stand** — each was re-measured on its own element afterwards, and I re-checked the one that carried the
strongest claim: the IG custom-sections block is genuinely visible (2 nodes found, 2 rendered), so slice 30's
"unreadable since D-13" holds.

**Three tool bugs in one day, every one inventing failures**, and the pattern is worth naming: each came from
testing a *proxy* for what a reader sees — one background property, one background layer, one element's own
`display` — instead of the thing itself. The predicate that handles ancestors, `content-visibility` and
zero-size boxes together is now in `contrast-sweep.md`:

```js
const isRendered = (el) =>
  (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true) && el.getClientRects().length > 0;
```

**Where this leaves the contrast work.** Everything I fixed was verified individually and stands. Everything
still *recorded* — the donata brand fills, the streamer palette, the PF2 chip values, the IG label and glyph —
should be **re-run with all three corrections before anyone acts on it**, because the counts are inflated and
at least one entry (the dice pad) was pure artifact. That re-run is the next slice, and it is cheap now that
the tool is right.

**Bar:** no app change (the finding was withdrawn), 5000/5000 D&D tests, typecheck exit-0.

### 2026-07-26 — slice 32: the verified baseline, and why I stopped fixing

Re-ran the sweep across six live characters with all three tool corrections at once (gradients, multi-layer
backgrounds, and only nodes that actually render). **923 rendered text nodes, 40 failures** — the first
numbers in this arc that can be acted on. `jack` is **clean at 0**; it had ~20 before slice 26.

The full table and the four groups are in `qa-evidence/contrast-sweep.md`. The short version: **everything
with an obvious right answer is fixed, and all 40 that remain are decisions about a skin's own palette.**

The one that made me stop rather than continue: `sec-num` fails on BOTH a light skin (3.09) and a dark one
(2.55–3.45), which looked at first like an unclamped token — the systematic fix would be to route it through
`ensureContrast` like its siblings. It is not: `--hotpink` already goes through the clamp in the shell bridge,
and the failing values come from each skin's OWN block in `theme.css`. They are the skins' signature accents.
Changing them is a design decision about identity versus legibility, and after being wrong three times about
colour this week on reasoning I was confident in, the right move is to hand it over with measurements rather
than exercise taste on someone else's brand.

**One entry in the list probably IS a plain bug** and is called out as such: the IG `🜲` glyph at 1.39, same
inherit-the-page-ink cause as the custom-sections block, in a panel slice 30's fix did not cover.

**Bar:** no app change, 5000/5000 D&D tests, typecheck exit-0. Dev server stopped, port released.

### 2026-07-26 — slice 33: the last plain bug in the contrast list

Slice 32 called one of the 40 remaining items a probable bug rather than a colour decision. It was.

The IG stance card names a colour for **every** child — the "CURRENTLY IN" label, the stance name, the
summary — except the `🜲` emblem, which named none and so inherited the page's base `#0f1419` onto the card's
teal-tinted dark fill: **1.39:1**. A plain omission, not a palette question. It now takes the card's own
accent, which the sibling directly beneath it already uses on that exact background: measured **6.34:1**.

**The IG sheet is down to a single failure**, and that one is the danger red at 3.33 on `COMBAT SKILLS` — a
site the `--hx-danger-2` fix did not reach, and a colour call rather than an omission.

That closes every item in this arc I can settle without deciding on someone else's palette. The verified
baseline in `qa-evidence/contrast-sweep.md` now stands at **39 remaining across six sheets, all of them
decisions**, grouped with measurements and a recommended order.

**Bar:** 5000/5000 D&D tests, typecheck exit-0, lint clean. Dev server stopped; all nine ports used during
this arc confirmed released (the 3000–3009 zombie sockets in this repo's history are why that gets checked).
