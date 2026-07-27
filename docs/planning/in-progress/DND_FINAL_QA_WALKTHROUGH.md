# D&D — Final full-system QA walkthrough (Playwright, browser, manual)

**STATUS: IN PROGRESS — 73 slices run (2026-07-25 → 27).** This is the LAST D&D item, extracted from
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
> - **Contrast** (18–21, 24–28, 30–34, 47, 53, 58–72): **finished, and the "31 remaining" line this header
>   used to carry is 40 slices out of date.** Both bespoke sheets now measure **zero** failures across 354
>   rendered text nodes (PF2 0/115, IG 0/239). The `--hx-*` set is *derived*, so the four clamp corrections
>   (47/59/60/67) fixed every skin at once and are guarded by `clamped-token-surface.test.ts`. Full detail
>   and every retraction in `qa-evidence/contrast-sweep.md`.
> - **The campaign panel, the three homebrew designers, and the per-system settings modal** — each driven in
>   a browser after shipping (S14, slice 30, and the S-6 note in `SETTINGS_PER_SYSTEM_RULES_VARIANTS`).
>
> ### Genuinely open, and why
>
> *(This section rewritten 2026-07-27, slice 73. It described the state at slice 33 and had drifted far
> enough to misdirect: it announced 31 open contrast items when the derived-token work had closed all of
> them, and it framed what remains as "a matter of taste" when slice 72 showed at least one of them is a
> regression from a value that used to pass. This header's own advice — trust the newest slice, not the
> first — applied to the header.)*
>
> - **Two palette decisions, both measured, neither one taste.** They live in `theme.css`'s hand-picked
>   colours, which — unlike `--hx-*` — cannot be fixed by a clamp:
>   1. **The accent as section-heading text** (slice 71). `.dnd-sheet .sec-num { color: var(--hotpink) }` is
>      the base rule for every section head, ~15 shared components. Noxus measures **3.45 / 3.19** and Void
>      Prophet **3.95 / 3.66** where labels actually sit. Each theme already carries a lighter sibling that
>      reads, so the fix is a token swap and invents no colour.
>   2. **`--danger`** (slice 72), and this is the stronger one. The base default `#ff5252` cleared AA
>      everywhere (5.69 / 5.28 / 4.70); `HEXTECH_GROUNDS` overrides it to `#c8413f`, which fails everywhere
>      (**3.71 / 3.44 / 3.06**) — across **all five themes at once**, since it is set in the shared grounds,
>      over twelve text sites including `.tp-err` at 12px, which is error text. A red meaning *error* is
>      semantically fixed and no brand identity rides on the shade, so this reads as a regression rather
>      than a decision — it is only unshipped because it is still a palette value in a hand-picked file.
>
>   Both are pinned in `__tests__/dnd/colour-theme-accent-text.test.ts` with `it.fails` and their measured
>   ratios: the suite stays green, and fixing either reports *"expected to fail but passed"* and names the
>   pin to delete.
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

### Slice 70 — full verification after the token work

Slices 59–69 changed **shared** things — three contrast clamps, two new token triplets, CSS across the
hextech module, and both bespoke panel sets. Everything since had been verified with `vitest __tests__/dnd`
and `tsc` only, which does not exercise a production build or the other 760 test files.

| check | result |
|---|---|
| Production build | **✓ Compiled successfully**, 464/464 static pages |
| **Full** repo suite (not just `dnd`) | **1,236 files / 17,444 tests pass**, 30 skipped |
| Typecheck | clean |
| Lint | clean |
| Working tree | clean, branch in sync with origin |

Worth running rather than assuming: this repo has a documented pattern where module-singleton pollution
surfaces **only** in a whole-suite run, and a shared-token change is exactly the kind that reaches beyond
its own area. Nothing outside D&D moved.

### Slice 69 — BOTH bespoke sheets at zero

The IG sheet uses the same `--hx-*` tokens slices 62–67 corrected and had not been re-measured. It came
back at **1 of 239** — *"Currently in"* at **4.31**, a fifth of a point short.

**One more instance of the same shape, and the last.** That label is `--hx-muted` on the **stance card**,
which paints its own **accent gradient** (`rgba(var(--hx-teal-1-rgb), 0.12 → 0.04)`). The muted clamp targets
the panel and the neutral inset — not an accent tint. Rather than chase a *fifth* clamp surface for a single
card, it takes the remedy the roller dock established for accent-tinted surfaces: **use the ink.**

| sheet | baseline | **now** |
|---|---|---|
| **PF2 streamer** | 8–9 | **0 of 115** |
| **IG** (default) | 2 | **0 of 239** |
| donata 5e | 20 | 3 — the brand-fill decision |

**Both bespoke sheets are now at zero measured contrast failures**, across 354 rendered text nodes,
composited through real backdrops.

**The dividing line the whole arc drew:** everything reachable from the `--hx-*` token system is fixed and
guarded, because that system *derives* its colours and a derivation can be corrected once for every skin.
What remains — donata's three — lives in `theme.css`'s hand-picked brand palette, where the fix is a choice
between two measured options rather than a correction to a rule. **That is not a smaller version of the same
problem; it is a different kind of problem**, and the last six slices are the evidence.

### Slice 68 — the PF2 sheet reaches ZERO contrast failures

Verified slice 67 live, and it closes the arc:

| sheet | before this arc | **now** |
|---|---|---|
| **PF2 streamer** (bespoke, `--hx-*`) | 9 of 115 | **0 of 115** |
| donata 5e (theme.css) | 3 of 164 | 3 — **unchanged** |

**Zero.** Every text node on the bespoke Pathfinder sheet now clears its own AA threshold, composited
through the real backdrop chain, counting only nodes that actually render.

The arc that got there, and each step was found a different way:
- **62** — the tint was hard-coded Hextech cyan on every skin *(found by chasing a stray observation)*
- **64/65** — accent text on its own tint, five places *(found by measuring all four skins, not one)*
- **66** — a border token painting a 15px glyph *(found by sweeping the token's other uses)*
- **67** — the clamp aiming at the panel when text sits on the chip *(found by chasing a 0.12 shortfall)*

**donata is unchanged, and that is the correct result rather than a miss:** the 5e engine paints from
`theme.css`'s `--gold`/`--hotpink`, not the `--hx-*` set slice 67 corrects. Its three survivors are the
**brand-fill decision**, which has computed options waiting and is genuinely the owner's call. The two
families were never the same problem, and this confirms it — a change that fixed nine failures on one sheet
moved the other by exactly zero.

### Slice 67 — the clamp's backdrop, corrected for the fourth and last time

Chasing the PF2 chip values (4.38) found the clamp was still measuring the wrong surface. Slice 47 moved it
from `panel` to `panel2`; right, and still not the worst case — **chips, tiles and rows paint
`var(--hx-inset)` over the panel, and text sits on that.** Measured there, **8 of 9 token×skin combinations
were under AA**:

| | gold | muted | teal |
|---|---|---|---|
| streamer | 4.28 → **4.56** | 4.26 → **4.53** | 4.06 → **4.60** |
| donata | 4.27 → **4.56** | 4.23 → **4.77** | 4.66 → **4.66** |
| jack | 4.07 → **4.63** | 4.14 → **4.67** | 4.29 → **4.58** |
| lazzuh | 10.51 | 5.82 | 5.38 — unchanged |

**Chosen per skin, because which surface is worst FLIPS.** On a light skin the ink is dark, so the *darkest*
surface (the inset) is worst. On a dark skin the ink is light, so the *lightest* (`panel2`) is worst —
`--hx-inset` there is a near-black recess that only ever increases separation. Clamping against the wrong
one would not merely fail to help, it would **relax** the clamp. lazzuh's gold is asserted unchanged at 9.04
to prove the dark path was not loosened.

**The guard caught my own half-fix.** The first attempt converted only `skinHxVars` and left the theme
derivation on `panel2` — and the assertion that *both* copies match failed immediately. That test was
written two slices earlier for exactly this scenario, and it is the reason a half-applied fix did not ship.

**And two tests had to change, for a reason worth naming.** Both pinned the literal `panel2` form, so they
failed the moment the clamp became *more* correct. That is the third instance this session of a test
encoding today's implementation rather than the rule — and each time, the fix is to assert the property
(*"both derivations clamp against the shared worst-case surface"*) rather than the spelling.

**The backdrop has now been wrong four ways** — `panel` at threshold 4/3 (47, 59), `panel` at 4.5 (60),
`panel2` (67) — and each was found by a different method: reading, live measurement, following a written
lesson, and chasing a number that was 0.12 low. The clamp itself was never the problem; **where it aimed
was, every single time.**

### Slice 66 — verified 65 (a clean win), then the last token doing the wrong job

**Slice 65 verified live, and this time it held:** the PF2 rank badge went **3.65 → 9.02**, and the sheet
**10 → 6** failing. Four slices of chasing the tint family, and the arc from 62 to 65 took this sheet from
9 to 6 with the rank badge going from failing to comfortable.

That left the hero-point pips at **3.23**, which turned out to be **slice 34's shape in a third variant**:
`--hx-line` is tuned as a **1px hairline** against the panel, and was painting a **15px glyph**. A token
doing a job it was never tuned for.

`--hx-muted` is the token clamped for exactly this role — and an *empty* pip **should** read as
de-emphasised, which is what muted means, rather than as barely visible. It is still information: how many
points you could hold. Swept the rest: every other `--hx-line` in both bespoke sheets is a genuine border,
so this was the only text use.

**The guard's first draft was wrong in a useful way.** `/color: var\(--hx-line\)/` matches the tail of
`border-color: var(--hx-line)` — the token's correct and widespread use — so it failed on healthy code and
would have pushed me to "fix" something that was right. A lookbehind fixed it. **A guard that cannot tell
the correct usage from the incorrect one is worse than no guard**, and this is the second time in two slices
that writing the assertion carefully was what made the slice correct rather than merely finished.

**Where the PF2 sheet stands:** 6 failures, and both remaining families are already diagnosed —
three `+15`-style chip values (`--hx-gold-2` on a **neutral** `rgba(0,0,0,0.05)` chip fill, so the
surface-derived case from slice 61, *not* the accent-on-accent one) and the brand-fill decision.

### Slice 65 — the rule applied everywhere it occurs, and a guard that found one by itself

Slice 64 fixed the badge it had measured. Sweeping for the **pairing** — accent text on a fill of that same
accent — found **four more**. Measured across all four skins:

| tint | accent text | ink |
|---|---|---|
| α = 0.06 / 0.08 | 4.00 · 4.58 · 4.31 · 4.19 — *three of four fail* | 10.9 – 12.4 |
| α = 0.12 | 3.76 · 4.28 · 4.09 · 4.00 — *all four fail* | 10.9 – 12.4 |

Fixed: `.pf2CostSpecial`, `.fileBtn`, the PF2 system badge, the IG provenance badges. Each keeps its colour
identity — border and fill untouched, only the glyph moves to the ink.

**The guard caught one I had missed by hand.** I swept with a single-line grep and found three; the regex
that pins the *pairing* then failed on `.fileBtn` — a multi-line rule at α=0.06. Writing the assertion as
the rule rather than as the list of known instances is what turned a partial fix into a complete one, in
the same slice.

**And the IG badges were a second defect wearing the same clothes.** VANILLA was accent-on-accent like the
others, but CUSTOM and DM-GRANTED used `--hx-danger-2` and `--hx-gold-2` as text — and **`--hx-danger-2` is
a light red that is deliberately not skin-derived**, so on a light skin it was pale text on a pale panel.
Their `c` served as both text *and* border; splitting the roles fixes both problems at once, because the ink
is clamped against the panel on every skin.

**Worth noting against slice 63's framing:** that slice read the badge's 0.27 drop as a cost of the tint
fix. Two slices later the picture is the opposite — the tint fix exposed a defect present on every skin, in
five places, one of which was a *different* defect entirely. The "cost" was the first honest measurement of
something that had always been wrong.

### Slice 64 — ink on the tint, and the defect was on every skin all along

Slice 63 named the remedy; this applies it. And measuring it across all four skins rather than the one that
happened to be rendered changed the story:

| skin | accent on tint | **ink on tint** |
|---|---|---|
| streamer | **3.76** ❌ | **10.26** ✅ |
| donata | **4.28** ❌ | **11.59** ✅ |
| jack | **4.09** ❌ | **11.53** ✅ |
| lazzuh | **4.00** ❌ | **11.69** ✅ |

**Accent-on-its-own-tint was failing on all four skins.** This was never a streamer problem — the old
cyan-under-purple mismatch had been hiding it behind an *accidental* hue separation. **Slice 62 did not
create this defect; it revealed one that had been there the whole time**, which is the opposite of how slice
63 first read the 3.92 → 3.65 movement.

The remedy is the roller dock's, quoted in the CSS so the next reader gets the reasoning rather than the
conclusion: *"the active tab could not keep the accent as its text colour… so it uses the ink and stays
recognisable through its teal border and tint."* The badge keeps its identity from the **border and tint**,
both still the accent; only the glyph moves to the ink, which is contrast-clamped by construction.

**One of slice 62's own assertions had to change** — it pinned the badge's *text* as `var(--hx-teal-1)`,
true when written and exactly what this slice corrects. Rewritten to pin what it was really for: that the
**fill** comes from the accent family. A test that encodes today's implementation rather than the rule is a
test that has to be rewritten every time the rule is applied properly.

### Slice 63 — verifying 62: the fix works, and made one number slightly worse

Measured the rank badge again after the tint conversion. **The fix does what it was for:** its backdrop went
from `#d6e1e7` — a blue-grey on a pink skin — to **`#e8d0ea`**, a lilac. The surface now belongs to the same
family as its text.

**And its contrast went 3.92 → 3.65.** Sheet total: **9 → 10** failing.

That is not a regression to undo; it is the trade becoming visible. Cyan-under-purple was *incoherent but
accidentally higher-contrast*, because two unrelated hues separate well. Purple text on a purple tint is
**coherent and closer together**. Fixing the family exposed that the badge was relying on a mismatch.

**The established remedy is already in this codebase.** The roller-dock slice hit exactly this and recorded
its answer: *"the active tab could not keep the accent as its text colour… so it uses the ink and stays
recognisable through its teal border and tint."* `.pf2RankTrained` wants the same shape — **ink for the
text, accent for the border and tint** — which keeps the badge's identity and restores separation. Left as
the next step rather than shipped, because it changes how the badge looks.

**A fourth sighting of the same tool bug, and I walked into it.** My first measurement returned **55 of 115
failing** and I nearly reported a catastrophic regression. The script I had trimmed read only
`backgroundColor` and ignored `background-image` — precisely the bug this evidence file documents under
*"it ignored `background-image`"*. Re-run with the gradient-aware version: **10**. The file has now warned
about this four times, and it still caught me; the tell was that the number was implausible, not that the
code looked wrong.

### Slice 62 — the accent TINT never followed the skin, in 23 places

Slice 61's stray observation, chased. The PF2 rank badge composited to `#d6e1e7` — a **blue-grey** — under
purple text on the streamer skin, because `.pf2RankTrained` painted `background: rgba(10, 200, 185, 0.12)`:
the **default Hextech cyan, hard-coded**, while its `color` came from `var(--hx-teal-1)` and *did* follow
the skin.

**A surface from one family with text from the other** — precisely the roller-dock defect this codebase
already fixed once (*"the dock was light from one family and its labels were coloured from the other"*),
sitting unswept in **23** places.

The fix is the pattern already here: `skin-tokens.ts` emits `--hx-panel-rgb` / `--hx-void-rgb` through
`trip()` for exactly this reason. `--hx-teal-1-rgb` joins them, from both derivations.

**Swept wholesale — and unlike slice 34's danger-token case, that is provable rather than a judgement
call.** The default `--hx-teal-1` is `#0ac8b9` = **exactly** `10, 200, 185`, so on an unskinned sheet the
substitution is a **no-op**; it can only change what was already wrong. A test pins that equality, because
if either value drifts without the other, every accent tint shifts on the one sheet this was meant to leave
untouched.

11 tests, including that the tints were **replaced rather than deleted** — stripping them would make the
accent vanish instead of follow the skin, a different bug wearing this fix's clothes.

**Why this one was invisible for so long:** it is not a contrast failure on the default skin, where the
hard-coded value is correct. It only misbehaves once a skin is applied — and the sweeps that would have
caught it all ran on sheets where it happened to be right.

**The sibling sweep, same slice:** asking the same question of `--hx-gold-2` found **four more** (2 CSS,
1 PF2, 1 IG) — Hextech gold under a skin's own gold text. `--hx-gold-2-rgb` joins the set, with the same
no-op proof (`#c8aa6e` is exactly `200, 170, 110`).

**And the deliberate NON-fix, pinned by a test:** `--hx-danger` tints **stay hard-coded**. That token is
intentionally not skin-derived — *"skins don't ship a 'danger' swatch to derive one from"* — so
`rgba(198,64,59,α)` is **correct**, and converting it would invent a derivation with no source. That is the
likeliest way this fix gets over-applied, so the exception is asserted rather than left to judgement.

### Slice 61 — verifying 59/60 live: the fixes are real, my explanation was not

Re-measuring the PF2 sheet after slices 59 and 60 returned **exactly the same nine failures, to the decimal**
(3.23 · 3.92 · 4.38). So the two clamp fixes, both correct on their own terms, changed nothing here — and
the causal story slice 59 told was wrong.

**What actually paints those elements**, read from the DOM rather than inferred:

| element | colour | token | sits on |
|---|---|---|---|
| `+15` chip value | `#8a6400` | **`--hx-gold-2`** — *not* teal, as slice 59 assumed | `#f2e4ee` |
| `E` rank badge | `#9b3fd0` | `--hx-teal-1` | `#d6e1e7` |
| `◇` empty hero point | `rgba(255,30,156,0.3)` | `--hx-line` | panel |

**Both fixed tokens still fail in place, and the reason is the whole point:** they are clamped against
`--hx-panel-2` (`#f2eef1`) and these elements sit on **chip fills** — `#f2e4ee` and `#d6e1e7` — which the
clamp knows nothing about. Slices 59 and 60 guarantee 4.5 *on the panel*; they cannot guarantee anything on
a surface the token was never measured against.

**This is slice 51's conclusion, now with the exact surfaces.** The remaining gold/accent failures need a
**surface-derived token** — the roller-dock pattern — not another value tweak. Four slices of clamping have
taken the tokens as far as clamping can go.

**And one new thing worth chasing later:** the `E` badge's backdrop composites to `#d6e1e7`, a blue-grey, on
a *pink* skin. A surface that is not skin-derived while its text is — which is precisely the roller-dock
defect, in a second place.

**The correction I owe the record:** slice 59's fix was genuinely right (`teal1` measured 3.69 on panel-2
and now measures 4.52), and slice 60's likewise. But I attributed the 4.38 measurement to teal when it was
gold, and shipped a write-up saying so. The fixes stand; the story was wrong, and only re-measuring caught
it. **Verifying a fix is not the same as verifying the diagnosis that motivated it.**

### Slice 60 — the third instance, and a guard that stops there being a fourth

Slice 59 ended by saying *"when a clamp is wrong, check its siblings."* Doing that found `--hx-muted`
carrying the same fault — clamped against `panel` while content sits on the gradient top. Its **threshold
was already right** at 4.5; only the surface was wrong, and `panel` flattered it by ~0.5.

| skin | before (panel-2) | after |
|---|---|---|
| streamer | **4.21** ❌ | **4.74** ✅ |
| donata | **4.14** ❌ | **4.72** ✅ |
| jack | **4.10** ❌ | **4.63** ✅ |
| lazzuh | 5.00 ✅ | 5.00 — untouched |

**This is the broadest of the three.** `--hx-muted` paints labels and captions on every bespoke sheet, so
all three light skins were running a hair under AA across their entire *secondary text layer* — never
dramatically wrong, which is exactly why nobody saw it.

**`--hx-text` is the deliberate exception**, asserted as such rather than left looking like an oversight: at
a ratio of 7 it has headroom either way (12.3–14.1 on panel-2), so moving it would change colours for no
legibility gain.

**The guard is now general.** Three instances of one bug, found three separate ways — by reading (47), by
live measurement (59), by following a written-down lesson (60) — is enough evidence to stop writing
per-token files. `clamped-token-surface.test.ts` asserts the rule across **every** text-bearing token on
**every** skin against **both** panel stops, and pins that each fix landed in **both** derivations, since
this module builds the token set twice and fixing one copy is how a defect survives its own fix.

**Worth stating plainly:** the trail ran 47 → 59 → 60, and each step was only reachable because the previous
one wrote down what it had learned. The `gold2` fix that started it was correct and complete for `gold2` —
and left two identical bugs sitting eight and twenty lines away.

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
`--hx-line` at 3.23, three 11.5px markers at 3.92, three 18px modifiers at 4.38. **Slice 61 identified all
three from the DOM:** the modifiers are `--hx-gold-2` on a `#f2e4ee` chip fill, the markers `--hx-teal-1` on
`#d6e1e7`, the diamond `--hx-line`. All three sit on **tinted surfaces the panel clamps never measured
against** — the surface-derived-token case, not a value one.

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

### 2026-07-27 — slice 71: the last unswept sheet, and what it turned up

Coverage bookkeeping, which is how this one started. The contrast arc measured PF2, IG, donata and jack.
**Perrin Underbough had never been swept** — the only live character sitting on a colour theme none of the
earlier passes covered — so the "zero failures" claim was true of the sheets measured and not of the set.

Sweeping it did two useful things.

**It confirmed slices 59–69 hold on a 5e sheet.** Nothing in the `--hx-*` system appeared. Of six flagged
nodes, one was a false positive and the other five resolved to `theme.css`'s hand-picked palette — the
independent system this arc has said all along needs a decision rather than a clamp.

**And it showed that decision is wider than recorded.** Chasing the five back gave the table now in
`qa-evidence/contrast-sweep.md`: `.dnd-sheet .sec-num { color: var(--hotpink) }` is the **base** rule for
section headings — ~15 shared components render one — and across the five selectable themes, **7 of 15
accent×panel combinations are under AA at 13px**, including `#0397ab` at 4.30 on the theme new characters
get by default. Noxus measures 2.84–3.45, Void Prophet 3.26–3.95.

I had characterised this open item as *brand fills* — button labels, a choice between two designs. It is
also, and more importantly, **section-heading text on every sheet**. That is a different weight of problem
than what the item said, so the item is corrected rather than carried forward as written.

**What is a correction here and what is a choice.** The character themes in `theme.ts` were held to a text
bar by hand and their comments still carry the ratios (`~5.4:1`, `7.2:1 on the card`); the colour themes
came later without one, and Noxus's only contrast note is about a border. So the bar is the file's own. But
the remedy changes what a theme *looks like*, and Void Prophet is annotated as an owner pick (2026-07-22) —
so the measurement, the mechanism and the in-palette option are settled here, and the palette is not.

The option is cheap and needs no invented colour: every one of these palettes already defines `pink` as the
lighter partner of `hotpink`, and in both failing themes it clears 4.5 (Noxus `#e0576a`, Void Prophet
`#c77dff`). Swapping only the TEXT uses mirrors `--hx-gold-2`, the text-safe sibling of `--hx-gold` on the
bespoke side; borders, glows and fills keep the accent, so each theme keeps its identity. The test asserts
that substitute is viable, so the work is a token swap whenever the owner wants it.

**Pinned, not deferred.** `__tests__/dnd/colour-theme-accent-text.test.ts` asserts the rule for all fifteen
combinations and marks the seven gaps `it.fails` with their measured ratios. The suite stays green; fixing
the palette flips those to *"expected to fail but passed"* and names the pin to remove. A comment-only note
would have rotted, and a plain failing test would have broken CI.

**Bar:** 17 passed / 7 expected-fail in the new file, full D&D suite green, typecheck exit-0, lint clean.
Dev server stopped, port 3467 released.

**Also recorded** (`contrast-sweep.md`): gradient-clipped text — `color: rgba(0,0,0,0)` +
`background-clip: text` — reads as a 1.00 false positive and must be skipped by the sweep. Fifth documented
limitation of this tool; two of the previous four each cost a wrong diagnosis before being written down.

### 2026-07-27 — slice 72: check the siblings (and correct the slice that didn't)

Slice 71 measured `--hotpink` because a live sheet flagged `--hotpink`. That is the exact failure mode
`clamped-token-surface.test.ts` was written to stop — *"THE SAME BUG, THREE TIMES … the third only because
the second's write-up said to check the siblings."* So: every token that paints text, across all five
themes, from a boundary-correct census of `theme.css`.

**Most of what the probe returned was the probe's fault, and saying so is the point.** `--violet-2` looked
like the worst offender at 2.11–4.29 — until it turned out **8 of its 8 text uses are `.skin-donata`**, a
light skin with its own pale panels, so measuring it against the dark hextech grounds was meaningless.
`--teal` and `--line` only ever appear as `border-color`; the census regex lacked a left boundary, which is
the same false positive this repo already fixed once in `/color: var\(--hx-line\)/`. Both were discarded
before they reached the doc. The measurement was worth running; 30 of its 42 hits were not real.

**What survived is `--danger`, and it is a stronger finding than the accent was.** The base default
`#ff5252` clears AA on every panel stop (5.69 / 5.28 / 4.70). `HEXTECH_GROUNDS` overrides it to `#c8413f`,
which fails on every one (**3.71 / 3.44 / 3.06**) — and because `danger` is set once in the shared grounds
rather than per-theme, **all five colour themes inherit it**, across twelve text sites including `.tp-err`
at 12px. That is error text. It is also the 3.02 measured live on a Reset button in slice 71.

This one is hard to read as a design choice: a red meaning *error* is semantically fixed, no brand identity
rides on the shade, and the value it replaced was legible. It is the best candidate in this arc for a fix
that is a correction rather than a decision. Still pinned rather than changed — it is a palette value in a
hand-picked file, and the standing line in this arc is that I measure those and you choose them.

**Two corrections to slice 71**, both cases of the prose claiming more than the assertion under it:

- *"including one on the theme new characters get by default"* — **overstated**. Hextech Gold is 4.85 and
  4.63 where labels sit; the 4.30 is on `panel-3`, and `panel-3` is painted by exactly `.dnd-sheet .stage`
  plus two donata rules. A section label never renders there. Reporting the worst of three stops made a
  surface that is not in play sound like the finding.
- *"its own `pink` … clears 4.5 on the panel stops"* — the test behind it checked only `panel-2`. Noxus's
  `#e0576a` is 4.97 / 4.60 / **4.10**. The recommendation stands (again, `panel-3` is not in play), but the
  sentence was broader than its evidence. Slice 51 went wrong the same way.

Both bounds are now pinned, including an explicit assertion that the substitute is *not* claimed past where
it holds, so prose and code cannot drift apart a third time. **The live-measured core of slice 71 is
unaffected:** Noxus 3.45 / 3.19 and Void Prophet 3.95 / 3.66 on the stops labels do sit on.

**Bar:** 22 passed / 8 expected-fail in the file, full D&D suite green, typecheck exit-0, lint clean.
Probe files deleted in the same slice; no dev server needed (this one was computable from source).

### 2026-07-27 — slice 73: the docs' own summaries had drifted, in all three

Slice 72 corrected two claims in slice 71 where the prose asserted more than the test under it. This slice
asks the obvious follow-up — *is that only true of the slices, or of the documents?* — and checks the
headers, since the header is the part an owner actually reads before deciding anything.

**All three had drifted, each differently, and one contradicted itself on its own summary line.**

**`SLOT_DRIVEN_CHARACTER_BUILDING`** — worst of the three. Its "what's blocked" table restated S7c's
blocking reason **verbatim from the paragraph directly above that reports the reason as disproven**. Four
commits had shipped against S7c by then: the count source, the cantrip cap, and both budget displays. An
owner reading the table would have concluded S7c was waiting on published tables. It is waiting on *them* —
whether to enforce the prepared cap, which cuts against S15's recorded boundary. The banner above the table
was wrong in the same direction: *"everything still open is blocked on an INPUT, not on effort"* flattens a
decision into a data block. Corrected, and the table now carries a **kind** column, because *"waiting on
the world"* and *"waiting on a sentence"* are not the same status and only one of them you can act on.
The honest count is **one blocked item, one data remnant, and two decisions** — not three blocked items.

**`DND_RULES_PLATFORM`** — the header cited its single open item at **two different line numbers** (`~929`
and `~745`) in two paragraphs that said the same thing. It is at **945**. The duplicate paragraph is why it
rotted: the same fact maintained in two places, so one went stale. Pointer corrected, duplicate removed.
A swept check found no other line-number references in any of the three docs, so this was the only one.

**This doc** — the largest drift, and the most pointed, because its own header warns *"trust the newest
slice on any topic, not the first"* while being the stale text. It said **33 slices** and announced **"31
remaining contrast items, all colour decisions"**. Forty slices had happened since: both bespoke sheets
measure **zero** across 354 rendered nodes, and the derived `--hx-*` set is corrected and guarded. Worse
than the count being stale, *"uniformly a matter of taste"* is now false — slice 72 showed `--danger` is a
**regression from a value that used to pass**, which is not taste. Rewritten with both open items stated at
their measured ratios.

**Why this is worth a slice.** This doc's own log names three separate occasions where stale planning text
cost real time — slice 21's "the roller is dark on every skin", the equip-validation partials fixed a day
before the doc admitted it, and "`attacksFromInventory` is UNCALLED". Every one was a summary that had
stopped tracking its body. The failure keeps recurring because a summary is written once and the body grows
under it; nothing fails when they diverge. Three headers now match their bodies, and the one duplicated
paragraph that caused a drift is gone rather than re-synced.

**No code changed.** Bar: full D&D suite green (5,899 + 8 expected-fail), typecheck exit-0, lint clean.

### 2026-07-27 — slice 74: a guard that could not fail, certifying a claim that was false

Slice 73 found three planning headers that had drifted from their bodies. The same question applies to
guards: a test that records a known gap is a summary too, and nothing fails when it stops matching.

`no-orphan-modules.test.ts` exempts `lib/dnd/homebrew/adopt.ts` and `policy.ts` as recorded gaps, and
backed the exemption with this, labelled *"the claim in EXEMPT, verified rather than asserted from memory"*:

```js
it('the homebrew subsystem genuinely has no route or UI', () => {
  expect(fs.existsSync(path.join(ROOT, 'app/api/dnd/homebrew'))).toBe(false);
});
```

**It verified nothing, and the claim it certified is false.** Homebrew routes are per-character and live at
`app/api/dnd/characters/[id]/homebrew-*`; the probed path was never going to exist, so the assertion could
not have failed for the right reason. The asymmetry is the whole lesson — `toBe(false)` on a path passes
for *every* wrong path, while `toBe(true)` fails loudly on one. A guard that cannot fail is worse than no
guard, because this one was being cited as evidence.

**What is actually there.** Two subsystems, conflated by the word "homebrew":

| | state |
|---|---|
| `lib/dnd/classes/homebrew-store.ts` — **per-character** | **Fully wired.** Three designer pages (`/dnd/characters/[id]/build/{class,subclass,feat}`), six routes, persisted to `character.data.homebrew{Classes,Subclasses,Feats}`, and read back by the level walker — `levels/route.ts` feeds all three into `findClass`, `subclassesFor` and `featPool`. Create homebrew, save it, use it on that character: works. |
| `lib/dnd/homebrew/` — the **shared library** | Publishing a piece so *other* characters and campaigns can take it. No publish, browse or adopt surface exists. This is what the two recorded gaps are about. |

So *"homebrew cannot actually be adopted"* read as *"homebrew does not work"* — the opposite of true, and
the more expensive direction for a note to be wrong in. **This also answers the owner's question from
2026-07-26** (*"do we have it so that users can create homebrew stuff and save it"*) with something
verified rather than remembered: **yes for create/save/use; no for share.**

**A second stale note fixed on the way.** `homebrew-feat/save/route.ts` ended with *"Surfacing homebrew
feats in the ASI feat picker needs a CustomFeat→Feat adapter — a follow-up."* That follow-up shipped —
`levels/route.ts` does `readHomebrewFeats(data).map(customFeatToFeat)` and passes them to the walker. A
working path was documented as unfinished.

Both halves are now asserted where they live: one test proves the per-character path exists *and* that
saved homebrew comes back (create+save with no read-back would be a dead end), the other pins that the
sharing surface is the missing piece.

**Bar:** 9/9 in the guard, full D&D suite green, typecheck exit-0, lint clean.

### 2026-07-27 — slice 75: are there other guards that cannot fail?

Slice 74 found one assertion that passed vacuously while being cited as evidence. The generalisable
question is whether it was alone, so this slice swept for the two shapes that produce it: `existsSync(...)`
asserted **false** (which passes for a path that is merely wrong as readily as for one genuinely gone), and
a loop over a **discovered** file list with no floor (zero files → passes having checked nothing).

**Most of what the sweep touched was already sound, and that is worth recording as clearly as the finds.**

| guard | verdict |
|---|---|
| `character-mutation-authorization` | **Sound** — floors its discovery at `handlers.length >= 55`. |
| `delete-route-authorization` | **Sound** — `routes.length >= 19`. |
| `character-route-access-classes` | **Sound** — loops hand-authored maps, non-empty by construction. |
| `ig-site-coverage` | **Sound**, and interestingly so: an empty `source` makes every `toBe(true)` **fail** rather than pass. The assertion's direction is what saves it. |
| `no-orphan-modules` (main sweep) | **Sound** — `MODULES.length > 50`, `FILES.length > 150`. Its *primary* guard was well built; slice 74's vacuous assertion was an auxiliary claim added beside it, which is a fairer description than the one I gave yesterday. |

**Two were genuinely exposed.**

**`sheet-contrast` — the `.sec-num` inline-colour guard.** It reads a directory, matches a regex, and
asserts no offenders. Effective today, but empty for the wrong reason if the components directory is
reorganised, the files renamed, or a single attribute order changed — the regex requires `className`
before `style`. Two floors added: the directory must yield files, and the pattern must still match the
four components that legitimately carry an inline `.sec-num` style (font-size and letter-spacing, no
colour). **Mutation-checked rather than assumed**: breaking the regex now fails with *"the sec-num
inline-style pattern matched nothing — regex stale?"* where before it reported green.

**`hub/settings-panel-removal`** — ten `existsSync(...) === false` assertions, anchored only by accident:
a later `describe` in the same file does a `readFileSync` that would throw on a bad `REPO_ROOT`. Depending
on a *different* block for your anchor is fragile, because deleting that block silently turns this one
vacuous. The anchor is now local and explicit.

**The through-line of slices 71–75.** Every one came from checking a claim rather than trusting it, and the
claim was wrong five times running: a "settled" sweep that had never covered one live character; a finding
generalised from one token without checking its siblings; three doc headers contradicting their own bodies;
a guard that could not fail; and now a second one. None was found by reading code for bugs. They were found
by asking *what would have to be true for this statement to be right, and is it?*

**Bar:** 25/25 in `sheet-contrast` (and 1 deliberate failure during the mutation check, reverted), 45/45
across both touched files, full D&D suite green, typecheck exit-0, lint clean.

### 2026-07-27 — slice 76: driving the claim I made from reading

Slice 74 said, plainly, *"create homebrew, save it, use it on that character: works."* That was reached by
**reading code**, and this doc's own standing rule is that reading is not enough. So it got driven.

**It is true on 2024 and not true anywhere else, and the failure is silent.**

First, what the browser confirmed. The feat designer at `/dnd/characters/[id]/build/feat` renders and
works: two paths (AI draft / write it myself), a full manual form — name, category, prerequisite, ability
increase, rules text, repeatable — and the engine reviewing **live** as you type, distinguishing blocking
errors from advice (`⛔ name: A feat needs a name`, `⛔ body: A feat needs rules text`, `⚠ prerequisite:
General feats normally require level 4+`), plus `⚒ Save to my character` and the honest disclosure that
saved feats are *flagged custom for DM review*. That half is genuinely good.

Then the path underneath it:

| step | behaviour |
|---|---|
| the designer page | renders for **any** character; deliberately does not show or edit `system` — *"the save route derives the real one from the character … this page cannot know it and must not invent it"* |
| the save route | accepts it, scoping to `normalizeSystem(character.system)` — a 2014 character saves a 2014 feat, successfully |
| `levels/route.ts` | adapts every saved feat and passes them to the walker |
| `asiFeatChoices` | **opens with `if (system !== 'dnd5e-2024') return [];`** |

So on a non-2024 character a player can open the designer, write a feat, watch it validate, save it, be
told it is flagged for DM review — **and no picker will ever offer it.** Nothing in that flow says so. The
work simply disappears. Each step is defensible alone, which is why reading them one at a time did not
catch it; the gap only exists between step 2 and step 4.

**A related detail, contained but worth knowing:** `customFeatToFeat` hardcodes `system: 'dnd5e-2024'`,
so the object handed to the picker claims a system its owner is not. The persisted `CustomFeat` keeps the
real one, so this is in-memory only — but it is why the mismatch is invisible from the data side.

**Also established:** no character in the live database has ever saved a homebrew feat. All five return
`"homebrewFeats":[]`. So this path has never run in anger, which is consistent with the gap surviving.

**Not fixed, and the reason is real rather than a hedge.** The fix means deciding what 2014 does with feats
at an ASI slot, and 2014 feats are an **optional** rule in that edition — making them appear is a rules
decision about someone's game. Same line this arc has held since slice 71. A fix touching only the picker
would also be half a fix: the designer and save route are open to every system, so the other half is
whether to warn at design time or to gate the designer.

**Nine tests** pin the adapter's faithful fields, the category rules, the stamped system, and both sides of
the gap — the picker's gate *and* that the designer and route do not restrict — so a one-sided fix fails
here rather than looking complete.

**Bar:** 9/9 new, full D&D suite green, typecheck exit-0, lint clean. No live data written: the create half
was driven read-only and the read-back half closed as tests rather than by seeding a character.
Dev server stopped, port 3471 released.

### 2026-07-27 — slice 77: the gap is one cell, not a system

Slice 76 ended by naming the cheapest fix — *"a warning at design time, which needs no rules decision"*.
Before writing that warning it had to be true, so the claim behind it got checked. **It was overbroad.**

Slice 76 said a homebrew feat saved on a non-2024 character is unreachable and *"no picker will ever offer
it"*. That is right for `general` feats and **wrong for `fighting-style`**. `levels/route.ts` builds
`featPool = [...featCatalogForSystem(system), ...homebrewFeats]` and then `byCategory('fighting-style')`,
which becomes `choice.options` on the plan — and 2014's **Fighter, Paladin and Ranger all emit a
fighting-style choice**. A homebrew fighting style saved on a 2014 Fighter shows up exactly where it should.

Derived from the class registry rather than asserted:

| homebrew category | 2024 | 2014 |
|---|---|---|
| `general` | ✅ ASI picker | ❌ `asiFeatChoices` returns `[]` |
| `epic-boon` | ✅ at 19+ | ❌ no 2014 class emits the choice |
| `fighting-style` | ✅ | ✅ Fighter · Paladin · Ranger |
| `origin` | ❌ not an ASI pick | ❌ |

**So the gap is one cell:** a `general` homebrew feat on a non-2024 character. That is also the cell a
player is most likely to land in — the designer's category dropdown defaults to `general` and the AI drafts
them — so the finding survives, considerably narrowed and much more precisely aimed.

**And the warning slice 76 proposed would have been wrong as described.** "Feats you save here won't appear
on this character's system" is false for a 2014 Fighter writing a fighting style. Shipping it would have
introduced a *new* incorrect statement while fixing a misleading silence — worse than the silence, because
a confident wrong label is harder to doubt than an absence. That is the concrete cost of the overbroad
claim, and the reason this slice exists instead of the warning.

**Third time in this arc** a claim of mine generalised past its evidence — slices 72 and 75 were the others
— and the cause was identical each time: **one measured case stated as a rule.** 71 measured one token and
spoke for the palette; 76 measured one category and spoke for the system. The correction is not to measure
more before speaking, it is to say which case was measured. The matrix is now derived from the registry, so
it cannot drift from the data it describes, and it carries the same non-empty floor slice 75 added
elsewhere — an empty class directory would otherwise make every cell vacuously true.

**Bar:** 13/13 (9 from slice 76 + 4 new), full D&D suite green, typecheck exit-0, lint clean.

### 2026-07-27 — slice 78: asking the other two designers the same question

Slices 76 and 77 examined the **feat** designer and then spoke about *"homebrew"*. There are three
designers — class, subclass, feat — and the reachability question was never asked of the other two. That
is precisely the habit slice 77 had just finished naming, so this slice asks it.

**The answer is a negative result, and it reframes the finding rather than extending it.**

| kind | saved as | read back through | system-filtered? |
|---|---|---|---|
| class | the character's system | `findClass(sys, key, extra.filter(c => c.system === system))` | **yes** |
| subclass | the character's system | `subclassesFor(sys, key, extra.filter(s => s.system === system))` | **yes** |
| feat | the character's system | `customFeatToFeat` — **stamps `'dnd5e-2024'`** | no |

Classes and subclasses are coherent end to end: the save route derives `normalizeSystem(character.system)`,
the builder stores it (`system: draft.system` / `system: input.system`), and the read-back filters on it.
The subclass route goes further and **refuses a parent class that does not resolve in that system**, so it
will not create an orphan — the strongest of the three, and the standard the feat path is measured against.

**So the gap is not "homebrew is half-wired".** It is that the feat adapter alone **discards the
character's real system** and leans on a different gate — `asiFeatChoices`'s 2024-only check — instead of
the system filter its two siblings use. That single inconsistency is the cause of the one unreachable cell
slice 77 isolated.

**It also points at the fix without deciding anything.** Making feats behave like classes and subclasses —
preserve the real system, let the picker decide — is a consistency correction rather than a rules call. It
does not settle whether 2014 offers feats at an ASI slot; it removes the reason the answer is currently
"silently no". Whether to take it is still yours, but it is a smaller and better-aimed change than either
option slice 76 proposed, and unlike the warning it cannot be *wrong*.

**A detail worth keeping:** the 2024 stamp is not load-bearing. Nothing downstream re-filters feats by
system, which is exactly why a stamped feat still reaches the fighting-style list on a 2014 Fighter. The
stamp is not doing work — it is just untrue, which is the worst combination for a field to be in.

**Bar:** 17/17 in the file (9 + 4 + 4 across slices 76–78), full D&D suite green, typecheck exit-0, lint
clean. Static — no server needed, and no live data written.

### 2026-07-27 — slice 79: retracting slice 78, one step before shipping it

Slice 78 concluded that the feat adapter was "the odd one out", that its `system: 'dnd5e-2024'` stamp was
*"not doing work — it is just untrue"*, and that aligning it with its siblings was a free consistency fix.
I called it the cheapest item on the owner's list. **It was wrong, and the fix would not have compiled.**

It got checked because the next action was to ship it.

`Feat.system` is typed as the **literal** `'dnd5e-2024'` (`lib/dnd/feats/dnd5e-2024.ts:31`). The `Feat`
type *is* "a 2024 feat". `ClassDefinition.system` and `SubclassDefinition.system` are plain `string` and
span editions — **which is precisely why they can and must filter on it**:

| type | `system` | why it behaves as it does |
|---|---|---|
| `ClassDefinition` | `string` | one type spans editions → filtering is meaningful and necessary |
| `SubclassDefinition` | `string` | same |
| `Feat` | `'dnd5e-2024'` | edition-specific by type → the literal is the **only** legal value |

So the three are not inconsistent. They differ because their types differ, and `system: cf.system` would
be a type error. The stamp is load-bearing after all — it satisfies "this object is 2024-shaped", which is
what the 2024 picker consumes — and it asserts nothing false about the homebrew feat, whose persisted
`CustomFeat` keeps `dnd5e-2014` throughout.

**What survives from slices 76–78, unchanged:**
- The reachability matrix (77), derived from the class registry.
- The gap: a `general` homebrew feat on a non-2024 character saves successfully and is never offered.
- That classes and subclasses are coherently system-scoped end to end — still true, still a useful
  contrast, just **not evidence of a feat defect**.

**What is retracted:** that the adapter is defective, that the stamp is untrue, that a consistency fix
exists, and that it "removes the reason the answer is currently silently no". The cause of the gap is one
line and always was — `asiFeatChoices` opening with `if (system !== 'dnd5e-2024') return []`, which gates
on the **character's** system. No value a feat carries can affect it.

**So the remaining question is exactly what it was before slice 78, and it is a rules decision:** should a
2014 character be offered feats at an ASI slot at all? 2014 feats are an optional rule in that edition.
There is no free fix hiding behind it.

**The pattern, now four for four.** 72, 75, 77 and this one all corrected a claim of mine that generalised
past its evidence, and this is the first that would have produced a *wrong change* rather than only wrong
prose — I had already described it to the owner as the cheapest thing on their list. What caught it was
not review but the act of preparing to ship: checking the type because the edit needed to typecheck. The
transferable lesson is narrow and worth keeping: **"and this is a small safe fix" is itself a claim, and it
is the one most worth checking, because it is the one that gets acted on.**

**Bar:** 18/18 in the file, full D&D suite green, typecheck exit-0, lint clean. No production code changed
— the change slice 78 proposed was not made, and that is the outcome.

### 2026-07-27 — slice 80: the walkthrough item that was never run — overflow and mobile width

Slices 71–79 increasingly audited *my own previous slices* rather than the product. The walkthrough's one
substantive open box says what it wants: *"styling, formatting, readability and attractiveness on every
screen touched (spacing, contrast, alignment, **overflow, mobile width**…)"*. Contrast was swept
exhaustively across ~20 slices. **Overflow and mobile width never were** — one screen at 390px in slice 9
and nothing since. So this slice ran that, and it found a real user-facing defect.

**A long character name is clipped on a phone, silently.**

`h1.name` is `font-size: clamp(44px, 8vw, 82px)`. At 360px the middle term is only 28.8px, so **the floor
wins and the name stops shrinking at 44px**. A long name is then wider than the screen — and `.hero`
carries `overflow-x: hidden`, so the excess is **clipped rather than scrolled**. Measured on Perrin
Underbough at 360px: `.hero` scrollWidth **365** against clientWidth **315**. Fifty pixels of the
character's own name, gone, with no gesture that reveals them.

That is the worse of the two failure modes and the reason a page-level check alone would have missed it:
the page does **not** scroll horizontally, so every "is there a horizontal scrollbar" test passes. The
content is simply cut.

**The fix is one property, and my diagnosis of it was wrong until I measured.** I had it as the classic
flexbox `min-width: auto` problem. Applying each candidate alone, in the browser:

| variant | item width | clipped |
|---|---|---|
| baseline | 350px | **50px** |
| `min-width: 0` on the flex item | 350px | **50px** — no effect whatsoever |
| `overflow-wrap: anywhere` | 285px | **0** |
| both | 285px | 0 |

`anywhere` and not the more familiar `break-word`: the two break identically once a line is being laid
out, but only `anywhere` also reduces the element's **min-content** size — and min-content was what
propagated up and held the block at 350px inside a 285px container. That distinction is the entire fix,
and it is why `min-width: 0` did nothing.

**Deliberately not the other obvious fix.** Lowering the clamp's floor would change the type scale on
every screen to solve a problem that exists only on narrow ones. This leaves the design alone.

**Verified after:** Perrin at 360px clips **0**; the PF2 sheet at 360px clips 0 and does not scroll; and
at 1280px the name still renders at 82px across exactly two lines (height 148 = 2 × 73.8 line-height), so
`anywhere` engages only when a word genuinely does not fit. Four guards pin the property, the rejection of
`break-word`, the untouched clamp, and `.hero`'s `overflow-x: hidden` — that last one because the fix works
*because* the hero still clips, and the pair should stay understood together.

**Also swept, clean:** the 5e sheet, the PF2 sheet, the level builder, and the feat designer in both its
collapsed and expanded states, at 390px — no page-level horizontal scroll and no clipped elements.
**The sweep was mutation-checked** before any of that was believed (slice 75's rule): injecting a 500px
element made it report the overflow, and `html`/`body` are both `overflow-x: visible`, so nothing was
masking a defect by clipping it at the root.

**Bar:** 4/4 new guards, full D&D suite green, typecheck exit-0. Lint: 0 errors, 5 pre-existing
`react-hooks/exhaustive-deps` warnings in `app/dnd` (StreamPoll, a resize effect) untouched by this slice —
recorded rather than called "clean", since a CSS change cannot produce ESLint output either way. First
production-code change in nine slices. Dev server stopped, port 3479 released.

### 2026-07-27 — slice 81: the other three layouts, and turning slice 80 into a rule

Slice 80 fixed one selector. The sheet has **four templates** — classic, codex, dashboard, play — each with
its own name selector in its own stylesheet, so the obvious question is whether the other three share the
defect. They do not, and establishing that took reading rather than driving, because template is stored in
`data.sheetLayout` and switching it POSTs — a live write this audit did not need to make.

**Why they are safe, from source:**

| layout | name rule | size | verdict |
|---|---|---|---|
| classic | `.dnd-sheet h1.name` | `clamp(44px, 8vw, 82px)` → floors at **44px** | the defect, fixed slice 80 |
| codex | `.sheet-shell .codex-name` | 22px | far inside a 360px screen |
| play | `.sheet-shell .play-name` | 28px, → 23px under 720px | same |

And the *silent* half cannot occur there either: the only `overflow: hidden` rules in `codex.css` and
`play.css` are on **portrait containers** (`.codex-portrait`, and `.play-portrait`, a 68px circular
avatar), which is clipping an image to a shape and is correct. No name sits in a clipping box.
Play had already been hardened for narrow screens deliberately — `minmax(min(100%, 340px), 1fr)` with the
reason written out (*"a bare `minmax(340px, 1fr)` would overflow the viewport below ~360px"*), plus
`min-width: 0` on the cards. **So no change was made there**, and extending slice 80's property to those
selectors would have been hardening against a defect there is no evidence of.

**What did ship is the rule instead of the instance.** `large-heading-breaks.test.ts` scans every sheet
stylesheet for heading-ish selectors, computes the SMALLEST size each can resolve to, and requires
`overflow-wrap: anywhere` on any that can reach 40px+. This is the shape the repo already uses for exactly
this failure mode — `clamped-token-surface.test.ts` exists because the same contrast bug appeared in three
sibling tokens one at a time, each found separately.

**The threshold is on the clamp's FLOOR, not its maximum**, and that is the whole insight: `82px` on a
desktop is harmless because the container is wide. The defect lives at the small end, where `8vw` (28.8px
at 360px) loses to the 44px floor and the type stops shrinking while the screen keeps going.

**Honest about its current reach:** the scan finds 14 heading-ish rules carrying a size and exactly **one**
is ≥40px, so today this guard protects a single selector. Its value is the fifth template, or a future
"make the codex name bigger" change — cross 40px and the rule starts applying automatically. Worth noting
from the same scan: `.dnd-sheet.skin-streamer h1.name` overrides to **24px**, so that skin was never at
risk, which is why the defect only showed on one character.

**Mutation-checked, per slice 75.** Swapping the property to `break-word` fails **4** assertions across the
two guard files — including one that names `break-word` explicitly. That is the regression that matters:
`break-word` looks like a fix, breaks lines identically, and silently restores the clipping because it does
not shrink min-content. A guard that only checked "is some overflow-wrap set" would have passed it.

**Bar:** 5 new + 4 existing guards, full D&D suite green, typecheck exit-0. No production code changed this
slice — the CSS edit shown above was the mutation check, reverted. No live data written, no server needed.

### 2026-07-27 — slice 82: the IG sheet at 360px, and two tools that lied

Slices 80–81 swept the 5e sheet, the PF2 sheet, the builder and the feat designer. **The IG sheet — the
third of the three sheet types — had never been checked at mobile width.** This closes that: it is
**clean at 360px**, 0 overflowing elements and 0 clipped, with the sweep's self-check still firing on an
injected 600px probe.

Getting there took two false alarms, both worth more than the clean result.

**The sweep reported 1,633 elements overflowing by 31px.** It was wrong, and what said so was an internal
contradiction rather than judgement: `document.scrollWidth` was **345** and the window would not scroll
right — which cannot be true at the same time as 1,633 visible elements reaching 391px. Chasing the chain
showed nothing fixed, nothing transformed, nothing clipping, a grid track computed at `376.438px` inside a
315px parent, and text measuring past the viewport edge. Every individual signal said "real defect".

The one that mattered was `detailsOpen: **false**`. All of it sat inside a **closed accordion**. Chromium
lays those subtrees out — `content-visibility: hidden` sizes to content, not to the container — so a
collapsed panel's children measure at natural width and read as overflow that no user can encounter. The
contrast arc met this exact genus once before (*"buttons inside a collapsed `.fld`"*) and the lesson did
not carry, because it had been written down as a fact about `.fld` rather than about collapsed containers.
It is now recorded as the general form in `qa-evidence/contrast-sweep.md` (limitation 6).

**And the self-check passed the whole time**, which is the part worth keeping. It proves the sweep can see
a real overflow. It says nothing about whether the sweep invents unreal ones. **A tool check that only
tests for false negatives will certify a tool drowning in false positives** — slice 75 built exactly that
kind of check and I trusted it one step further than it reaches.

**The second false alarm nearly became a bug report.** While chasing the first, a grep printed
`if (key === 'intuitive-games') return 'n';` from `lib/dnd/library.ts` — which reads precisely like a
find-and-replace having wrecked a user-facing string. The file says `return 'Ancestries';`. The cause was
mine: **`rg -r` is `--replace`**, so `rg -rn "Ancestries"` used `n` as the replacement and printed every
match as `n`. Earlier `-rn` uses this session were audited — all but one passed `-l` and were unaffected;
slice 77's epic-boon scan had its content mangled but its conclusion rested on the file list and was
independently re-verified, so it stands.

**Net:** the third sheet type is verified at mobile width, and two tool limitations are documented that had
each produced a confident, completely false finding within the same slice. No code changed, because nothing
was broken — the honest outcome, and one both false alarms were dressed up to look different from.

**Bar:** full D&D suite green, typecheck exit-0. No live data written. Dev server stopped, port 3483
confirmed bindable.

### 2026-07-27 — slice 83: the defect that was hiding behind the false positive

Slice 82 dismissed 1,633 phantom overflows on the IG sheet as a closed-`<details>` artefact and called the
sheet clean. That was correct **for the state it measured**, and it left an obvious question unasked: a
closed accordion is one a user *opens*. Every sweep in slices 80–82 measured only the collapsed state.

**Opened, the same panel overflows for real.** Setting `open` on all three `<details>` at 360px:

| | closed (slice 82) | **opened** |
|---|---|---|
| elements past the viewport edge | 0 (after excluding phantoms) | **1,633** |
| `document.scrollWidth` | 345 — no overflow | **391** vs 345 client |
| page scrolls sideways | no | **yes** |

The numbers are identical to the phantom, which is exactly why this was easy to miss and worth writing
down: **the false positive and the real defect report the same measurements.** What separates them is
whether the user can reach the state, and the collapsed reading is the one that is meaningless.

**Cause: grid blowout.** `IGVanillaLibrary.tsx` builds four nested `display: 'grid'` containers with no
`grid-template-columns`. A default `auto` track is floored at its content's min-content width, so it can
grow **wider than its own container** — each computed a single track of **376.438px inside a 315px box**,
pushing the filter `<input>`, the group headings and all 566 entries 31px past the viewport edge.

**Fix:** `gridTemplateColumns: 'minmax(0, 1fr)'` on all four. Measured against the real code afterwards:
track **376.438px → 315px**, input **376 → 315**, elements past the edge **1,633 → 0**, with the sweep's
self-check still firing on an injected 600px probe.

**What is NOT fully fixed, stated plainly:** the page still reports a **4px** residual horizontal scroll
(`scrollWidth` 391 vs 345 client) even with nothing past the edge — down from 31px of visibly cut content,
and consistent with a sub-pixel artefact given the `.438px` fractions in play, but I did not identify its
source. Calling this "fixed" without that sentence would repeat the overclaiming slices 72/75/77/79 each
had to correct. The user-facing symptom — content cut off and a page that slides sideways — is resolved.

**The transferable lesson, and it invalidates part of slices 80–82:** every mobile sweep so far measured
**default** state only. Collapsed panels, unopened modals, inactive tabs and un-expanded rows were all
either skipped as phantoms or never rendered. Those sweeps were not wrong about what they measured; they
were narrower than they sounded. The 5e sheet, PF2 sheet, builder and feat designer were reported clean at
390px **in their default state**, and that claim now carries the qualifier it always needed.

**Bar:** full D&D suite green, typecheck exit-0. Fix verified in a browser against the shipped code, not
inferred. No live data written. Dev server stopped, port 3487 confirmed bindable.

### 2026-07-27 — slice 84: the expanded-state re-sweep, and slice 83's symptom was misdescribed

Slice 83 ended by qualifying its predecessors: every mobile sweep had measured **default state only**. This
runs the re-sweep that admission demanded, and — in the course of it — corrects how slice 83 described its
own finding.

**The previously-"clean" sheets are still clean with everything expanded** (all `<details>` open, 360px):

| sheet | elements past the edge | clipped | page overflow |
|---|---|---|---|
| Perrin — 5e, lazzuh skin | 0 | 2, both intentional | none (345 = 345) |
| Orin — PF2, streamer skin | 0 | 0 | none (345 = 345) |

The two "clipped" on the 5e sheet are the pair slice 80 waved through as *"likely decorative"* without
looking. **Checked this time:** they are `<input type="file">` elements inside styled `.btn.tiny` buttons
("⤴ Art", "⤴ Token"), held at 20px and clipped so the custom button shows instead of the browser's
"Choose file" chrome. Intentional, and the earlier dismissal happened to be right — but it was a guess.

**The correction, and it matters more than the clean results.** Slice 83 reported that the IG panel made
"the page scroll sideways", and flagged an unresolved "4px residual". Both came from `document.scrollWidth`
and JS-driven scroll attempts after setting `open` on every `<details>` at once. Repeating it with a **real
click** on the summary — what a tap actually does:

| state | `docScrollWidth` | **max horizontal scroll** |
|---|---|---|
| fresh load, closed | 345 | **0** |
| after tapping *Vanilla library* | 391 | **0** |
| after closing again | 345 | **0** |

**The page never scrolls horizontally, in any state.** `document.scrollWidth` reports 391 while the page
cannot be scrolled one pixel — so that property was measuring a region the user cannot reach, and the "4px
residual" was an artefact of driving three accordions open through script rather than one through a click.

**This makes the original defect worse, not better.** Content 31px wider than the viewport with no
horizontal scroll is content **cut off at the window edge and unreachable** — not an awkward sideways
scroll. The fix in slice 83 (`minmax(0, 1fr)`, track 376.438px → 315px, elements past the edge 1,633 → 0)
is unaffected and is confirmed; only the symptom was described wrongly, in the direction of sounding milder
than it was.

**The method lesson, which is the durable part:** `document.scrollWidth` is not a measure of what a user
can see or reach, and neither is a programmatically-forced open state. Where slices 80–83 disagreed with
each other, the disagreement traces to which of those two proxies was being trusted. **The check that
settles it is the one that mimics the interaction** — click the summary, then try to scroll.

**Bar:** full D&D suite green, typecheck exit-0, 0 lint errors. No code changed this slice; the finding is
a correction plus two confirmations. No live data written. Dev server stopped, port 3491 confirmed bindable.

### 2026-07-27 — slice 85: is the grid blowout a class of defect? No — and that matters

Slice 83 fixed four column-less `display: grid` containers in `IGVanillaLibrary`. The obvious next move is
the one slice 81 made for headings: generalise the instance into a rule. A scan says the opportunity is
enormous — **200+ inline `display: 'grid'` declarations across `app/dnd` carry no `gridTemplateColumns`**,
21 in `useIgPanels.tsx` alone, 20 in the class designer.

**Generalising would have been wrong, and the evidence was already in hand.** The feat designer has **10**
column-less grids and swept clean in slice 80. So a bare `display: grid` is not a defect; it becomes one
only when its content's min-content exceeds the container. `IGVanillaLibrary` blew out because of what it
holds — 566 catalogue entries with long effect text in one panel — not because of how it was written.
A blanket `minmax(0, 1fr)` sweep would have been 200+ speculative edits justified by one instance.

**So the question was measured instead**, on the structurally closest page: `/dnd/library/[key]`, 12
column-less grids, catalogue content, never swept.

| state at 360px | elements past the edge | page scroll |
|---|---|---|
| first load | **0** | 0 |
| **one** accordion open | **0** | 0 |
| **ten** open | **0** | 0 |
| *all 286 open at once* | *2,593, worst 228px past* | *0* |

**Clean under every realistic interaction.** The alarming row is the unrealistic one: no user opens 286
accordions, and there is no "expand all" control that would produce it. This is the third time this session
a dramatic number has turned out to be method rather than product (after slice 82's phantom and slice 84's
`scrollWidth`), and the same corrective applied each time — **reproduce it the way a person would**.

**One tooling regression caught in passing.** This slice's first measurement of the page reported a single
521px overflowing `<span>` on first load. It was a phantom inside a closed `<details>`: I had dropped
slice 82's explicit `inClosedDetails()` walk and relied on `contentVisibility === 'hidden'` alone, which
does not catch **children** of a closed panel because the property is not inherited to them. Restored, the
first-load count is 0. A lesson written down two slices ago was re-learned because the code implementing it
was not carried forward — the same failure mode as the `.fld` note in slice 82, one level up.

**Net for the mobile-width item:** two real defects found and fixed (slice 80's clipped name, slice 83's
IG grid blowout), and the fix scope is now bounded by evidence rather than extrapolated. `IGVanillaLibrary`
was the exception, not the first of a family.

**Bar:** full D&D suite green, typecheck exit-0. No code changed — the finding is that no code *should*
change. No live data written. Dev server stopped, port 3495 confirmed bindable.

### 2026-07-27 — slice 86: touch targets, and a circle that was an ellipse

The walkthrough item names *"spacing, alignment"* alongside contrast and overflow. Those are largely
matters of taste and were left, but one mobile property in that family is **objectively measurable and had
never been checked**: touch target size. WCAG 2.5.8 (AA) sets 24×24 CSS px as the floor.

Swept the 5e sheet at 360px — **88 interactive targets**, of which 16 are under 24×24, in four shapes. The
striking one: **13 identical `?` help badges at 16×12px**, 10px font, `padding: 0 4px`.

**They are conformant, and checking that before reporting is the point.** WCAG 2.5.8 has a spacing
exception — an undersized target passes if a 24px circle centred on it does not reach another target. All
13 measured **33–35px** to their nearest neighbour, so all 13 pass. Reporting "13 WCAG failures" would have
been the fourth false alarm of this arc; the exception is part of the criterion, not a loophole.

**But the measurement did expose a real defect underneath it.** `Tip.tsx` styles its badge as a proper
**15×15 circle**. `triggerStyle` spreads **last**, and exactly one of its six call sites —
`HouseRulesPanel.tsx:102` — overrode that with:

```
border: '1px solid var(--hx-line)', borderRadius: '50%', padding: '0 4px',
width: 'auto', height: 'auto'
```

It **asks for a circle and then removes the two properties that make one**. The `border` and `borderRadius`
it restated were already Tip's defaults, so the entire override was redundant except for the `auto`s that
broke it — and the result was 13 badges rendering as **16×12 ellipses** on every sheet with house rules.
The other five call sites pass only a margin and a colour, and get the circle.

**Fix:** make this one match the others. Verified after: all 13 render **15×15, `border-radius: 50%`**,
actual circles, `aria-label` intact.

**On the size itself, deliberately unchanged:** 15×15 is small, and below what Apple (44) or Material (48)
would advise — but it conforms via spacing, it is `Tip`'s own consistent size across the app, and enlarging
it means changing every tooltip badge everywhere, which is a design decision rather than a correction. The
measurement is recorded here so that decision can be made with the number in hand.

**Bar:** full D&D suite green, typecheck exit-0, 0 lint errors. Fix verified in the browser against the
shipped code. No live data written. Dev server stopped, port 3499 confirmed bindable.

### 2026-07-27 — slice 87: the rest of the touch targets, including a 9px delete

Slice 86 swept one sheet and stopped at the first interesting result. This finishes the other two, applying
the full WCAG 2.5.8 test — **size, then the spacing exception** — so that only genuine failures are counted.

| sheet | targets | under 24×24 | fail size **and** spacing |
|---|---|---|---|
| Perrin — 5e | 88 | 16 | 0 (all pass on spacing) |
| Orin — PF2 | 55 | 11 | **4** |
| Vashti — IG | 121 | 13 | **2** |

**PF2: the Dying and Wounded steppers**, `▲`/`▼` at **19×18px stacked 21px apart** — failing both tests.
These are the controls a player taps while they are dying, which is the worst possible moment to mis-tap.

**IG: an `✎` edit at 18×19 and a `×` remove at 12×13, sitting 15px apart** on the same weapon row — and
worse ones behind them: `Remove Toughness` and `Remove Weapon Focus` at **9×13px**. A **destructive**
control, nine pixels wide, adjacent to a non-destructive one. The `aria-label`s were already good
("Remove Cutlass"), so this was purely a size problem, not a labelling one.

**Fix:** `minWidth: 24, minHeight: 24` on the affected icon buttons — 6 in `usePf2Panels.tsx`, 7 in
`useIgPanels.tsx`. Verified after: every one measures **24×24**, both sheets report **0 remaining
violations**, and page overflow stays **0** with no horizontal scroll, so the larger targets did not
disturb the layouts that slices 83–85 had just finished checking.

**Two things deliberately not done.** The 5e sheet's 16 undersized targets were left alone — every one
passes on spacing (33–35px clear), and enlarging them would be a density change with no accessibility
argument behind it. And the `Tip` badge from slice 86 stays 15×15 for the same reason.

**One honesty note on scope:** two of the 13 IG buttons carry the fix by *deduction* rather than
measurement — the valued-condition steppers only render when a character actually has a valued condition,
and no live character does. They share the exact style of a measured violation but with **smaller** padding
(`0 1px` against `0 4px`), so they cannot be larger than the ones proved failing. That is inference from a
measured bound, not the extrapolation slice 85 rejected, but it is inference and is marked as such.

**Bar:** full D&D suite green, typecheck exit-0, 0 lint errors. Fixes verified in the browser against the
shipped code. No live data written. Dev server stopped, port 3503 confirmed bindable.

### 2026-07-27 — slice 88: pinning the target-size fixes, and refusing the blanket version

Slices 86–87 fixed 13 icon buttons measured below WCAG 2.5.8's 24×24 floor. This turns those fixes into
something that survives the next edit — the same move slice 81 made for the heading break — while
**declining** the version of it that would have been wrong.

**The temptation:** `app/dnd` has ~30 icon-only buttons (`×`, `✎`, `▲`, `▼`, `＋`) across a dozen files. A
guard requiring the minimum on all of them looks obviously right and would have been a false-positive
factory: many sit inside a padded `.btn` class and already clear 24px, and the 5e sheet's 16 undersized
targets are **conformant** via the spacing exception (33–35px clear). Slice 85 is the precedent — a scan
found 200+ column-less grids, and fixing them all would have been speculative, because the one measured
blowout was caused by its content rather than the pattern.

So the guard covers **the two files whose buttons were measured failing**, asserts the count in each, and
names the refusal as an assertion rather than leaving it as an omission someone later "fixes".

**It caught its own bug on the first run.** The IG check originally matched remove buttons with
`aria-label=\{`Remove [^`]*`\}[^>]*>×</button>` and found **zero** — every one of those buttons carries an
`onClick={() => …}`, and the arrow's `>` closes the character class early. The only reason that surfaced is
the non-empty floor asserted beside it, which exists because slice 75 found a guard that could not fail
being cited as evidence. Rewritten line-based; a regex that must span JSX attributes cannot be trusted when
those attributes contain arrows.

**Mutation-checked.** Removing the floor from a single button — the `Increase dying` stepper — fails **two**
assertions, the per-file count and the stepper-specific one, each naming what broke. Restored, no diff.

**Also pinned:** that `Tip` stays 15×15, with the reason (conformant via spacing; enlarging it is a design
decision across every badge in the app). Recorded as an assertion so the *choice* is visible, not just its
absence.

**Bar:** 6/6 new, full D&D suite green, typecheck exit-0, lint clean. No production code changed — the
source edit shown above was the mutation check, reverted.

### 2026-07-27 — slice 89: a five-pixel-tall navigation control

Slices 86–87 swept the three sheets for touch targets. The **builders** were never swept. All three come
back with **0 WCAG 2.5.8 violations** (38, 39 and 34 targets; 8 undersized each, every one clear on
spacing) — but the scan surfaced something the pass/fail count could not.

**The guided builder's step navigation is a 5px-tall click strip.** Each segment of the progress bar is a
real button — `aria-label="Go to Class & level"`, `"Go to Species"`, … — `tabIndex 0`, not disabled,
measuring **46 × 5 px**. Five of them, in all three builders.

**It passes WCAG and is still unusable on a phone.** The spacing exception is about *neighbouring* targets,
and these are 46px wide so their centres sit ~46px apart — comfortably clear. The criterion has nothing to
say about a target that is simply too thin to hit. This is the counterpart of slice 86's lesson: there, the
exception meant a reported failure was not real; here, passing the exception hides one that is.

**Fixed without changing a pixel of the design:**

```
padding: '10px 0', margin: '-10px 0', boxSizing: 'content-box',
background: …, backgroundClip: 'content-box'
```

The padding grows the hit area, the negative margin cancels its effect on the row, and the content-box clip
keeps the paint confined to the original 5px. Measured after: **hit area 25px, painted bar still 5px, row
height still 5px, bar position identical, page overflow 0.** Five times the target, no visual change.

**Property ORDER is load-bearing here, and only measuring caught it.** The first attempt put
`backgroundClip` *before* `background`. The `background` shorthand resets `background-clip` to `border-box`
— so the computed value came back `border-box` and the bar would have painted across its own padding,
rendering 25px tall. The hit-area numbers were already correct at that point; had I checked those alone the
fix would have shipped looking right and rendering wrong. The comment in `IGCharacterBuilder` records why
the order matters, since it is not visible from reading the properties.

**A hypothesis that was wrong, recorded because it was load-bearing while it lasted:** I expected the
builders to be clean because they use padded `.btn` classes while the bespoke panels use bare inline-styled
icon buttons. They do not — of 26 buttons in the 5e builder, **0** carry a `btn` class and 23 are
inline-styled, exactly like the sheets. The builders are clean because their controls are better spaced,
not because they are built differently.

**Bar:** full D&D suite green, typecheck exit-0, 0 lint errors. Fix verified in the browser against shipped
code, in all three builders. No live data written. Dev server stopped, port 3507 confirmed bindable.

### 2026-07-27 — slice 90: fixing the checker, not just the page

Slice 89 found a 5px-tall navigation control **on a page my checker had scored 0 violations**, and scored
correctly — the control passes WCAG 2.5.8 through the spacing exception. The defect was in the metric, and
a metric that misses a five-pixel button will miss the next one too.

**The second floor:** the smaller dimension, independent of spacing. No clearance makes a 5px strip
tappable. 10px catches that class without flagging the well-spaced small controls that are genuinely fine —
which matters, because slice 86 established those exist and are conformant.

Both checks together, every swept surface at 360px:

| surface | WCAG 2.5.8 failures | under the 10px thin floor |
|---|---|---|
| 5e sheet — default / expanded | 0 | 0 |
| IG sheet — default / expanded | 0 | 0 |
| IG builder | 0 | 0 |

**The builder result is the useful one:** it re-derives slice 89's fix from the other side. That page had
**5** too-thin targets before; it now has 0, with the step bars measuring hit-area 25px, painted bar 5px,
`background-clip: content-box`, and the row still 5px tall. Confirmation from an independent check rather
than from re-reading the fix.

**The lesson worth keeping is about reporting, not about pixels.** Slice 89's finding came from *reading
the list of undersized targets*, not from the violation count — which was zero, and right. **A sweep that
reports only its verdict discards the observation that mattered.** Both the contrast arc and this one have
now produced a defect that the headline number said was not there.

Recorded as limitation 8 in `qa-evidence/contrast-sweep.md`, alongside the closed-`<details>` phantom and
the `scrollWidth` trap, so the next sweep inherits the method rather than the conclusion — which is exactly
what slice 85 found had failed to happen with the `.fld` note.

**Bar:** full D&D suite green, typecheck exit-0. No code changed — the checker improved and every surface
came back clean under it. No live data written. Dev server stopped, port 3511 confirmed bindable.

### 2026-07-27 — slice 91: eleven controls a keyboard user could not locate

Eleven slices measured sizing and overflow. **Keyboard focus visibility had never been checked** — and it
is the same kind of property: objective, and a real barrier when it fails. WCAG 2.4.7 (Focus Visible, AA).

**Tabbing the IG sheet with real key presses: 69 stops, 58 with a focus ring, 11 with nothing at all.**
`HP amount`, `Active stance`, `Add condition`, `Defensive power (In Play)`, and all six `Set STR…CHA`
boxes. Every one is an inline-styled `input`/`select` with **no class**, so none of the `.input`,
`.pf2Chip` or `.searchHit` focus rules in `hextech.module.css` reach them.

**The cause is an absence, not a suppression.** Their computed outline while focused sat at the CSS
*initial* value — `none` / `3px` / `currentcolor` — and no rule anywhere sets `outline: none` on them.
Nothing removed the ring; the UA ring never landed. That distinction mattered: the first hypothesis was a
stray reset, and a grep for one would have kept coming up empty.

**It was nearly mis-measured, in the direction of overstating.** A programmatic `.focus()` sweep reported
**21** missing. `:focus-visible` does not match synthetic focus on a button, so ten buttons that are
perfectly fine looked broken. Driving genuine `Tab` presses cut it to the true **11**, all form controls.
Slice 84's rule again, now three for three: *the check that settles it is the one that mimics the
interaction*.

**Fix:** a `:focus-visible` ring on form controls scoped to `.siteChrome`, which is the D&D chrome and
nothing else. Verified by re-tabbing against the shipped CSS: **70 stops, 70 with a ring, 0 missing**, the
eleven now reporting `outline: solid 2px`.

**Scoped to form controls on purpose** — buttons already had rings, and a blanket `*:focus-visible` would
have restyled a hundred working controls to fix eleven. Same restraint as slice 88's refusal of the blanket
target-size guard, for the same reason.

**Bar:** full D&D suite green, typecheck exit-0, 0 lint errors. Fix verified in the browser under real
keyboard input. No live data written. Dev server stopped, port 3515 confirmed bindable.

### 2026-07-27 — slice 92: the other two sheets, and a focus rule that matched but did nothing

Slice 91 fixed 11 controls on the IG sheet and scoped the fix to `.siteChrome`. Whether that reaches the
other two sheets, and whether they had failures at all, was assumed rather than checked. Both now measured
by tabbing with real key presses.

| sheet | tab stops | with a focus ring | missing |
|---|---|---|---|
| Perrin — 5e, lazzuh skin | 80 | 80 | **0** |
| Orin — PF2, streamer skin | 79 | 78 | **1** |

The 5e sheet is clean, and every stop sat inside `.siteChrome`, so slice 91's scope does reach it.

**The PF2 one is more interesting than a missing rule.** `.play-ref-toggle` — the only reference toggle on
the Play layout — has a `:focus-visible` rule that deliberately trades the browser ring for a gold border
and a background lift. That is a legitimate indicator, and my checker only counts outline and box-shadow,
so the first read looked like a **checker false positive**, which is what I expected to write up.

**It was not.** Measured under real Tab with `matches(':focus-visible')` returning **true**, the border,
the background and the outline were all **identical to their unfocused values**. The rule reports as
matching, `--gold` is defined, the element sits inside `.sheet-shell` as the selector requires, and a scan
of every stylesheet found no competing rule — and the declarations still do not land. **So the trade gave
up the ring and never delivered the replacement.**

**Why is not established, and the fix does not depend on knowing.** An explicit
`outline: 2px solid var(--gold)` at the same specificity, later in the file, wins on order over the
`outline: none` above it whatever the cause. Verified: **84 stops, 84 with a ring, 0 missing**, the toggle
now reporting `outline: solid 2px`.

**Worth stating plainly:** shipping a fix while the mechanism is unexplained is the thing slice 79 warned
about — that slice retracted a "fix" built on a wrong mechanism. The difference here is which part is
uncertain. There, the *defect* was misdiagnosed and the fix would not have compiled. Here the defect is
measured twice under the real interaction, the fix is verified against shipped CSS, and only the *cause*
is open. The comment in `play.css` says so, so nobody later reads confidence into it that is not there.

**Bar:** full D&D suite green, typecheck exit-0, 0 lint errors. No live data written. Dev server stopped,
port 3519 confirmed bindable.

### 2026-07-27 — slice 93: the Play toggle was never broken — a transition measured on the wrong tick

Slice 92 shipped a fix for `.play-ref-toggle` while explicitly recording that the **cause was not
established**, and argued the fix was safe because the *defect* was measured twice. That reasoning was
sound in form and wrong in fact: **the defect itself was the measurement.**

**The cause.** The base rule declares `transition: border-color, background 0.15s`. Slice 92 read the
computed values on the same tick as the Tab keypress, when they had barely left their unfocused state:

| | border | background |
|---|---|---|
| unfocused baseline | `rgba(255, 30, 156, 0.3)` | `rgba(255, 240, 250, 0.4)` |
| **~1ms after focus** | `rgba(252, 31, 153, 0.306)` | `rgba(255, 240, 250, 0.404)` |
| **after 500ms** | **`rgb(127, 92, 0)`** = `var(--gold)` | **`rgba(255, 250, 254, 0.75)`** |

The rule works exactly as written. The toggle has always had a focus indicator — a gold border and a
background lift — and the design deliberately traded the browser ring for it. **Slice 92's addition is
reverted**, since it overrode a working, intentional treatment.

**The tell was in the numbers and I read past it.** `0.306` against a `0.3` baseline is not "identical" —
it is a transition 2% of the way through. I compared with string equality and called it unchanged.

**Slice 91 was re-tested against the same trap and SURVIVES.** Its eleven controls declare the identical
`border-color 0.15s` transition, so the suspicion transferred exactly — but after settling their border
stays `rgb(30, 45, 61)`, unchanged, with no outline and no box-shadow. They had no indicator at any point
in time, not merely at t=0. That fix stands.

**What separates the two is worth keeping**, because both looked the same at t=0: one had a property that
was *travelling* and one had a property that was *static*. Only a second sample distinguishes them, and
neither the WCAG criterion nor the computed style at focus-time says which you are looking at.

**Recorded as limitation 9 in `qa-evidence/contrast-sweep.md`:** a transitioned property cannot be sampled
on the same tick as the state change. This is the ninth entry, and the fourth where a confident measurement
was wrong about the product rather than about the code.

**Bar:** full D&D suite green, typecheck exit-0, 0 lint errors. Net code change for slices 92+93 combined:
**none** — one addition, then its removal, with the reason recorded in `play.css` so the next reader does
not re-derive the same false positive. No live data written; port 3523 confirmed bindable.

### 2026-07-27 — slice 94: finishing the audit slice 93 opened

Slice 93 found a measurement trap that invalidated slice 92's fix, and re-checked slice 91 against it —
but only on **4 of its 11** controls, and with a neutralisation method that could not actually show the
pre-fix state. Both gaps are closed here, because a partial audit of one's own retraction is the worst
place to stop.

**Slice 93's neutralisation was wrong.** It disabled the slice-91 rule with `outline: revert`, which rolls
back to the **user-agent** style — and the UA style *has* a focus ring. So every control it sampled showed
`outline: auto 1px`, which is not what the page did before the fix. It happened not to matter, because the
question asked was whether border/background settle into an indicator, and that part was measured
correctly. But the control group was wrong, and that is worth saying rather than leaving for someone to
notice. Neutralising with `outline: none !important` reproduces the pre-fix state exactly.

**Every control, re-measured with settling time:**

| | |
|---|---|
| form controls reached by Tab | **12** |
| still showing **no** indicator after 400ms | **12** |
| that gained one after settling | **0** |

`(unlabelled)`, `HP amount`, `Active stance`, `Add condition`, `Defensive power (In Play)`, `Set STR`,
`Set DEX`, `Set CON`, `Set INT`, `Set WIS`, `Set CHA`, `Active stance (Combat)`.

**Slice 91's fix is fully vindicated**, on every control rather than the sampled third — and the sweep
found a **twelfth** control (`Active stance (Combat)`) that slice 91's own tab run never reached, already
covered by the fix because it is a `select` inside `.siteChrome`. Scoping to a container rather than
enumerating elements is why that one was fixed without being found.

**The audit is now complete.** Of the fixes shipped in slices 80–92, only slice 92's rested on a
same-tick sample of a transitioned property; the rest measured static layout (clipping, track widths,
target sizes) where no transition is running. Slice 93 revoked the one, and this confirms the other.

**Bar:** full D&D suite green, typecheck exit-0, 0 lint errors. No code changed — this slice is
verification of an existing fix and a correction to how the previous one was verified. No live data
written; port 3527 confirmed bindable.

### 2026-07-27 — slice 95: the remaining surfaces, and where these defects actually live

Slices 80–94 covered three sheets, three builders and one designer. Five user-facing routes had never been
swept for **anything**. This closes that, running all four checks at once — viewport overflow, the WCAG
2.5.8 target test with its spacing exception, the 10px thin floor from slice 90, and focus visibility with
the settling delay slice 93 made mandatory.

| surface | interactive targets | overflow | too thin | WCAG 2.5.8 | no focus indicator |
|---|---|---|---|---|---|
| `/dnd` hub | 15 | 0 | 0 | 0 | 0 |
| `/dnd/suggestions` | 8 | 0 | 0 | 0 | 0 |
| `/dnd/library` | 15 | 0 | 0 | 0 | 0 |
| `/dnd/profile` | 10 | 0 | 0 | 0 | 0 |
| `/dnd/characters/new` | 24 | 0 | 0 | 0 | 0 |

**Clean, and the shape of the result says where to look next time.** These pages carry **8–24** interactive
targets. The sheets carry **55–121**, and every defect this arc found lived there or in the builders:

| | targets | defects found |
|---|---|---|
| hub / list / form pages | 8–24 | **0** |
| builders | 34–39 | 5 (the step-bar strip, ×3 files) |
| bespoke sheets | 55–121 | 11 + 6 + 1 + 13 |

Not a coincidence and not only volume: the simple pages are built from shared components with classes, and
the sheets are built from **inline-styled one-offs** — which is exactly what escapes a stylesheet's focus
rules, its padding conventions and its minimum sizes. Slice 89 tested that as a hypothesis and found the
builders use inline styles too, so styling *approach* alone does not predict it; **inline styling plus
density** does.

**The arc is complete.** Every user-facing `/dnd` route is now swept on four objective measures. Five real
defects were fixed (slices 80, 83, 87, 89, 91), one was retracted after a bad measurement (92 → 93), and
nine tool limitations are recorded in `qa-evidence/contrast-sweep.md` so the next pass inherits the method.

**Bar:** full D&D suite green, typecheck exit-0. No code changed — nothing was found to change. No live
data written; port 3531 confirmed bindable.

### 2026-07-27 — slice 96: nothing is 404ing, and the checker proves it can say otherwise

The walkthrough's open box asks for correctness as well as styling. Slice 54 swept the **console**; the
**network** was never swept. A 404 asset or a failing endpoint is as user-visible as a contrast failure and
strictly easier to measure, so this closes it.

**Eleven routes, every request and every `<img>`:**

| | |
|---|---|
| routes loaded to `networkidle` | 11 |
| responses ≥ 400 | **0** |
| failed requests (DNS, abort, refused) | **0** |
| `<img>` elements that loaded with `naturalWidth === 0` | **0** |

Covering the hub, library index, the IG library page, suggestions, profile, the create form, all four live
character sheets and a builder.

**The self-check is the part worth recording**, because this arc has produced four separate zeros that were
really instrument failures. Three probes, all confirmed before the result was believed:

- a request to a route that does not exist → **captured** (404)
- an injected `<img src="/dnd/__no_such_image__.png">` → **captured** (404)
- the same image read back through the `complete && naturalWidth === 0` probe → **detected**

So the zero means "nothing failed", not "nothing was watched" — the distinction slice 82's phantom, slice
85's stale regex, slice 74's vacuous `existsSync` and slice 90's blind metric each turned on.

**Two checks in one, deliberately.** A missing image can fail at the network layer *or* arrive as a 200
with unusable bytes; the response listener catches the first and the `naturalWidth` probe the second.
Either alone would have reported a clean sweep for half the failure modes.

**Bar:** full D&D suite green, typecheck exit-0. No code changed — nothing was found to change. No live
data written; port 3535 confirmed bindable.

### 2026-07-27 — slice 97: the numbers add up, and three extractors disagreed about it

The open box asks for *"numbers that don't add up on the resulting sheet"*. Ability modifiers are the one
derived value checkable from rendered output alone — `floor((score − 10) / 2)` holds in every system here —
so no engine mapping is needed and no assumption smuggled in.

**Result: correct on every sheet, verified against stored data.**

| sheet | rendered | verdict |
|---|---|---|
| 5e Lazzuh Gun | STR 19→+4, DEX 14→+2, CON 15→+2, INT 11→+0, WIS 13→+1, CHA 13→+1 | 6/6 correct, and matches `data.abilities` (`str:19…`) |
| 5e Perrin | six pills, all consistent | 6/6 |
| IG Vashti | STR 17→+3, DEX 14→+2, CON 15→+2, INT 10→+0, WIS 12→+1, CHA 13→+1 | 6/6 |
| PF2 Orin | — | renders no score/modifier pair at all (modifier-first design); nothing to check |

**Getting there took three extractors that disagreed, and the disagreement was the finding.**

1. A container-walking heuristic reported `STR 10 +0` everywhere.
2. A whole-body regex over whitespace-stripped `innerText` reported the same.
3. Reading the `.apill` elements directly reported `STR 19 +4`.

At the midpoint this looked like **the most serious defect of the entire session** — the sheet displaying
10s while the database held 19s. Writing that up was one step away. What stopped it was checking the raw
element before believing the extractor, which showed six visible pills reading the correct values and
`bareTens: 0` — no element on the page rendering a bare 10 at all.

**And the resolution is a timing trap, not a selector one.** Sampling the same `.apill` at intervals: `10/+0`
at 0, 300 and 900ms; `19/+4` at 1800ms. **The sheet renders placeholders and hydrates at ~1.5s** on a dev
server. All three extractors were reading the same element; they differed in *when*. That is why it cost so
much — every disagreement presents as a DOM-structure problem and invites another rewrite of the query.

This is the second time in five slices that a "settled state" assumption produced a confident false defect
(slice 93 was the first, over a 150ms CSS transition). Recorded as limitations 10 and 11 in
`qa-evidence/contrast-sweep.md`, together, since they compound: a mistimed sample plus a boundary-crossing
regex agree with each other and look like corroboration.

**Not claimed:** whether a ~1.5s flash of default values matters to a real user. Dev-server timings are not
production timings, and I have no production measurement — so it is recorded as an observation, not a
defect.

**Bar:** full D&D suite green, typecheck exit-0. No code changed — nothing was found to change. No live
data written; port 3539 confirmed bindable.

### 2026-07-27 — slice 98: every sheet shows all-10 ability scores for half a second, in production

Slice 97 measured a ~1.5s placeholder flash on a dev server and explicitly refused to call it a defect,
because dev timings are not production timings. That was the right call and it left a question that is
settleable rather than arguable, so this slice settles it with a real `npm run build` + `next start`.

**It survives production, and it is worse than a slow paint.**

| run | placeholder visible at | correct values at |
|---|---|---|
| 1 | 12ms | **764ms** |
| 2 | 18ms | **541ms** |
| 3 | 3ms | **456ms** |

**The server-rendered HTML itself carries the wrong numbers.** Parsed straight out of the `curl` response:

```
STR10+0 DEX10+0 CON10+0 INT10+0 WIS10+0 CHA10+0
```

…while `19` **is** present elsewhere in the same response, inside the RSC payload. The server has the
character and renders defaults anyway.

**And nothing marks it as provisional.** Measured at 200ms in the production build: the pills are visible,
`opacity: 1`, not covered, and `anyLoadingOverlay: false` — no skeleton, no spinner, no `aria-busy`. So for
roughly half a second every sheet displays **six plausible, wrong ability scores** that are visually
indistinguishable from real ones. A skeleton would be a loading state; this reads as data.

**Cause, exactly** — `app/dnd/_sheet/state/store.tsx:327`:

```js
const [char, setCharState] = useState<Character>(() => {
  const initial = dbMode ? blankCharacter('') : loadInitial(characterId)
```

In DB mode the store initialises from `blankCharacter('')`, whose abilities are all 10, and the real
character arrives from a client fetch. The file's own header notes the blank fallback is there to be
SSR-safe — the mechanism is deliberate; rendering *plausible numbers* out of it is the part that is not.

**NOT fixed here, and this time the reason is not uncertainty about the defect.** The defect is measured
three ways in a production build. The fix is architectural — either thread the server-fetched character
into the store's initial state, or render a non-numeric placeholder until it arrives — and that is a
data-flow decision on the sheet's core, on someone else's design. Slice 79 is the cautionary case: what got
retracted there was a change I had called small and safe. The narrower half (render `—` rather than `10`)
does not need the architecture touched and cannot be *wrong*, only less pretty; that is the cheap option if
the full one is not wanted.

**Bar:** production build succeeded, three timed runs plus an SSR-HTML parse and a 200ms overlay check.
`.next` removed afterwards — this repo has a recorded failure where a production `.next` breaks `next dev`.
No live data written; port 3543 confirmed bindable. No code changed.

### 2026-07-27 — slice 99: the flash is the whole stat rail, and it kills my own "cheap fix"

Slice 98 measured the placeholder flash on the ability pills and offered a narrow alternative to the
architectural fix: *"render `—` rather than `10`… needs no architecture change and cannot be wrong."*
That recommendation was made without checking how much of the sheet is affected. It is wrong.

**The store initialises from `blankCharacter('')`, so the ENTIRE stat rail is a blank character** for the
same window. Production build, 150ms after `domcontentloaded`:

| field | at 150ms | actual |
|---|---|---|
| name | *(empty)* | LAZZUH GUN |
| LEVEL | **1** | 3 |
| **HP** | **1 / 1** | **32 / 32** |
| AC | **10** | 13 |
| SAVE DC | **10** | 14 |
| INIT | **+0** | +2 |
| FORM | **Base** | "The Kid" |
| STR / DEX / CON … | **10 / +0** ×6 | 19/+4, 14/+2, … |

**`HP 1 / 1` is the one that matters.** A player glancing at their sheet mid-session reads one hit point.
This doc's own slices 10–12 recorded *"a level-8 Fighter rendering with 1 HP was real and is fixed"* — that
was the persistent form of this exact misreading. The transient form is still here, on every sheet load,
and it is the same wrong number.

**So the cheap half is not viable.** Patching the ability pills to `—` would correct 6 of ~13 wrong values
and leave `HP 1/1`, `LEVEL 1` and `AC 10` untouched — while making the sheet *look* more finished during
the window, which is worse than leaving it obviously mid-load. **A partial fix here reduces the visible
symptom without reducing the risk**, and the risk is the whole point. Retracted.

**What is left is one decision, and it is the architectural one:** thread the server-fetched character into
the store's initial state (the data is already in the same response — `19` sits in the RSC payload), or
render the sheet as unmistakably loading until it arrives. Both are `store.tsx:327`'s
`dbMode ? blankCharacter('') : …`. Neither is mine to pick.

**Two slices, two corrections to my own recommendation** — 98 narrowed 97's "not a defect", and 99 kills
98's "cheap alternative". The pattern is consistent enough to name: *the cost of a fix is easy to estimate
and the **scope of a defect** is not, and I keep estimating the first while assuming the second.*

**Bar:** production build, timed against `next start`. `.next` removed. No live data written; port 3547
confirmed bindable. No code changed.

### 2026-07-27 — slice 100: the fix is not architectural — the flag already exists

Slices 98 and 99 both called the blank-character flash "architectural" and left it entirely to the owner.
That framing was checked here and it is **too pessimistic**, which matters: it was the reason for not
acting, and the reason was wrong.

**`store.tsx` already tracks exactly the needed state.** Line 349:

```js
const [dbPhase, setDbPhase] = useState<'loading' | 'ready'>(dbMode ? 'loading' : 'ready')
```

set to `'ready'` at line 427 when the fetch lands. It gates autosave so the fallback is never PATCHed —
so the distinction between "showing a blank" and "showing the character" is already computed and already
load-bearing. It is simply **not exposed**: no component outside `store.tsx` can see it.

**Exposing it is a routine 3-line change with a proven template in the same file.** `offline` is the
precedent — declared in the context interface (line 105), added to the value object (line 1211),
destructured in `App.tsx:87` and used to render a banner at line 199. Nothing about `dbPhase` differs.

**And it is hydration-safe**, which was the obvious risk: the initial value is `'loading'` on the server
*and* on the client's first render, so both agree and React has nothing to reconcile. The flip to `'ready'`
happens in an effect, after hydration.

**So the split is:** exposing the flag is mechanical and cheap; deciding **what a loading sheet should
look like** — skeleton, dimmed, hidden, spinner — is a visual design call on someone's sheet, and that is
the part that stays with the owner. Slices 98/99 bundled the two together and called the whole thing
architectural.

**A tooling note I have to record because I caused it twice.** Mid-investigation a grep returned
`"…somewhere that's up when she's n)"` — `rg -rn` again, where `-r` is `--replace`. This is **limitation 7
in `qa-evidence/contrast-sweep.md`, written by me in slice 82** after it nearly produced a false bug
report. Documenting a trap did not stop me walking into it eighteen slices later, which is worth knowing
about documentation as a control: it works when read, and nothing makes it get read.

**Bar:** full D&D suite green, typecheck exit-0. No code changed — the finding is that the cost estimate in
the two previous slices was wrong, in the direction that was discouraging the fix.

### 2026-07-27 — slice 101: 2.5 seconds of HP 1/1 on a slow connection

Slice 100 established the fix is cheap and left the decision with the owner. A decision needs severity as
well as cost, and every number so far came from **localhost**, which is the most flattering network that
exists. Measured against the production build with CDP throttling:

| network | shown during the window | correct at |
|---|---|---|
| localhost, no throttling | HP **1/1**, LEVEL **1**, STR **10** | 681ms |
| fast 3G — 150ms RTT | same | 885ms |
| **slow 3G — 400ms RTT** | same | **2,522ms** |

**Two and a half seconds of a level-1 character with one hit point**, on the connection a phone at a table
in a basement actually has — which is the exact context the last twenty slices of mobile QA were about.

**And that is a floor, not a ceiling.** The server was on `localhost` for all three runs; only the client
link was throttled. A real deployment adds server round-trip on top of every one of these figures.

**What this settles.** The question was never whether a flash is ugly — it is whether a player can *read*
it. At 681ms that is marginal. At 2.5 seconds it is not: that is long enough to look at a sheet, register
"1 HP", and act on it. This doc already recorded the persistent version of this exact misreading as a real
bug worth fixing (slices 10–12, *"a level-8 Fighter rendering with 1 HP"*). The transient version shows the
same wrong number, to every character, on every load.

**The decision is now fully specified** — cost: expose `dbPhase` (3 lines, template at `offline`,
hydration-safe, slice 100) plus one render change; severity: up to 2.5s of wrong vitals on mobile; and the
only open part is what a loading sheet should look like. That is the whole of it, and it is one call.

**Bar:** production build, three throttled runs via `Network.emulateNetworkConditions`. `.next` removed.
No live data written; port 3551 confirmed bindable. No code changed.

### 2026-07-27 — slice 102: only the 5e sheet flashes, and the other two show how to fix it

Slices 97–101 characterised the blank-character flash entirely on the **5e** sheet and said nothing about
whether PF2 and IG share it. They do not, and that changes both the scope and the recommended fix.

**The three sheet engines get their data differently:**

| engine | how it receives the character | first paint |
|---|---|---|
| `app/dnd/_sheet/` (5e, both editions) | store, initialised from `blankCharacter('')`, then a client fetch | **wrong** |
| `IGSheet` / `PF2Sheet` (bespoke) | `ig: IGCharacter` **as a prop**, from the server component | **correct** |

Sampled on the same dev server, same session:

| sheet | 2ms | 322ms | 2049ms |
|---|---|---|---|
| 5e Lazzuh — store-driven | `HP 1 / 1` | `HP 1 / 1` | **`HP 1 / 1`** |
| IG Vashti — prop-driven | `STR 17` | `STR 17` | `STR 17` |

The IG sheet is right on the first sample and never wrong. **The defect is confined to the shared 5e
engine** — which still means both editions and every skin and layout built on it, but not the other two
systems.

**And this is the useful part: the fix is not a new architecture, it is the one two of the three engines
already use.** "Pass the server-fetched character in as a prop" is not a proposal to evaluate — it is
running in `IGSheet` and `PF2Sheet` today, in this repo, against the same data source. Slices 98 and 99
called the change architectural partly because it looked novel. It is the *existing* majority pattern; the
5e engine is the outlier.

**A near-miss worth recording.** The first attempt at this used a regex over stripped SSR HTML and reported
that the IG page contained *both* `STR 17` and `STR 10` — apparently contradictory. That is
**limitation 11**, my own: `STR 10` was a boundary-crossing match (Vashti's INT is 10). Measuring in the
browser instead of the HTML string resolved it in one step. Second time in three slices that a documented
limitation caught me, and both times the fix was to stop parsing text and read the rendered element.

**Bar:** full D&D suite green, typecheck exit-0. No live data written; port 3555 confirmed bindable. No
code changed — the finding narrows the scope of an existing one and identifies an in-repo precedent for
its fix.

### 2026-07-27 — slice 103: two different fixes, and I had been costing one and recommending the other

Slice 100 costed the fix at "3 lines, template at `offline`". Slice 102 recommended the pattern IG and PF2
already use. **Those are two different fixes**, and reporting one cost against the other recommendation
made the decision look cheaper and simpler than it is. Checked properly:

**Option A — show a loading state.** Expose `dbPhase` through the context (declare in the interface, add to
the value object, destructure in the component — the `offline` flag is the working template in that same
file), then render the sheet as unmistakably loading until it flips. **Genuinely ~3 lines plus one render
change**, and hydration-safe because `dbPhase` starts `'loading'` on both server and client.
Result: no wrong numbers, but a visible loading state on every sheet open.

**Option B — pass the character in, as IG and PF2 do.** Verified by reading the mount:

```
<SheetRoot characterId={…} campaignId={…} sheetType={…} system={…} isDM={…}
           canWrite={…} customLayout={…} customCss={…} preferences={…} … />
```

`SheetRoot` gets **`characterId` and a dozen scalars — and not the character data**, while the page holds
the full row (it reads `character.sheet_type`, `character.custom_layout`, `character.system` from it a few
lines earlier). Compare `<IGSheet ig={igData} …>` and `<PF2Sheet pf2={pf2Data} …>` on the same page, which
receive their whole character. So B is **four touch points** — page → `SheetRoot` → provider → the
`store.tsx:328` initialiser — and the initial value has to be run through `normalizeCharacter` exactly as
the fetch path does at line 385, with `baselineRef` seeded to match line 388 or `reset()` changes meaning.
Result: no flash at all, and the 5e engine stops being the odd one out.

**Not "3 lines" — that number belonged to A.** Slice 100 measured A honestly; slice 102 then argued for B
on the strength of the IG/PF2 precedent, and the two got reported as one cheap option. Third cost estimate
of this arc to need correcting, and the same shape each time: **I priced the change I had just looked at
and attached the number to the change I was recommending.**

**Both are still the owner's call**, and now they are actually distinguishable: A is cheap and adds a
loading state; B costs more and removes the problem. Neither is blocked on anything.

**Bar:** source-level verification, no server needed. Full D&D suite green, typecheck exit-0. No code
changed.
