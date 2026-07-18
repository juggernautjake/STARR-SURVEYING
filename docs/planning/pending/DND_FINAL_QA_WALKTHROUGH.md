# D&D — Final full-system QA walkthrough (Playwright, browser, manual)

**STATUS: PENDING (parked 2026-07-17 at the owner's request).** This is the LAST D&D item — a manual,
browser-driven acceptance pass to run once we're ready to test everything together. It was extracted out
of `DND_RULES_PLATFORM_2026-07-16.md` (originally "Slice 40") and parked here deliberately: every other
slice in that doc is shipped, and this pass needs an **interactive, DB-backed session on live Supabase**
(a throwaway test account + characters), which we agreed to do at another time. Move this doc to
`in-progress/` when we start the run.

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

- [ ] **Fresh account.** Create a NEW user through the pseudo-login (name + password, no email — Slice 36).
      Confirm the sign-up path works from a clean state.
- [ ] **First character, D&D 5e 2024, vanilla.** Create a character and walk the WHOLE creation flow step
      by step: species → background (confirm the +2/+1 or +1/+1/+1 spread and the granted Origin feat +
      skills + tool actually land), class, then **level 1 → 20 one level at a time** via the Level Builder.
      At each ASI slot, confirm the feat picker offers only rules-legal feats and that "vanilla"
      (book-legal) choices are always available. No AI/homebrew unless a level genuinely has no book option.
- [ ] **Every other system, one vanilla character each.** Repeat the full step-by-step build for each
      GAME_SYSTEM the app offers (5e 2014, PF2e, PF1e, Starfinder, Cyberpunk RED, Shadowrun, CoC, Blades…).
      For level-less systems, walk their advancement-by-spend flow instead of a level table. Where a
      system's rules data isn't built yet, RECORD that the builder correctly falls back to custom rather
      than offering wrong options — don't paper over a missing ruleset as if it passed.
- [ ] **Hunt for correctness + UX defects and FIX them as found:** wrong or missing choices at a level; an
      ASI/feat/ability offered when it shouldn't be (or missing when it should); numbers that don't add up
      on the resulting sheet; dead controls; and — explicitly called out by the user — **styling,
      formatting, readability and attractiveness** on every screen touched (spacing, contrast, alignment,
      overflow, mobile width, the Hextech theme holding together).
- [ ] **Capture evidence.** Screenshot each system's finished sheet and any bug before/after. A GIF of at
      least one full creation flow is worth keeping.
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
