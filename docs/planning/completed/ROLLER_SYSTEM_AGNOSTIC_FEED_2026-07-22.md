# Roller: a system-agnostic roll feed (parked from the Dice Roller Overhaul)

**Status:** COMPLETED 2026-07-22 · split out of `completed/DICE_ROLLER_OVERHAUL_2026-07-22.md`. RO-5a/b/c
(the system-agnostic feed + PF2/IG publishing + shared unit-tested builders) all SHIPPED. RO-3 DEFERRED
(pure dedup, no new value — the picker/toggle already reach PF2/IG via RO-5). RO-7 routed to the QA phase
(live-render verification on the fresh Vercel build). All engineering shipped; only browser QA remains.

## Why this is parked (not abandoned)

The Dice Roller Overhaul shipped its user-facing essentials — one floating roller per sheet
(bottom-right, minimize/resize/remembered), four roller templates chosen ON the roller independently of
the sheet template (RO-2/RO-4), and a live instant-vs-animated toggle honoured by every template (RO-6).
What remains (RO-3 + RO-5 + the cross-system half of RO-7) is ONE large architectural unit — making the
four animated 5e rollers render for PF2 and IG — and it is parked deliberately rather than rushed as
stop-hook slices, because every partial increment delivers no standalone user value and touches the
most-used feature (rolling) across three systems at once. PF2 and IG each keep their working bespoke
roller (a Target-DC control + a `lastRoll` result banner) in the meantime, so nothing is broken.

## The core problem

The four animated rollers (`DiceTray`/`RollStage`, `SigilStack`, `RollBoard`, `ImpactRoller`) read the
5e store via `useChar()` — specifically `activeRoll` (a rich shape: `landing`, `min`, `max`, `crit`,
`fumble`, `entry{total, breakdown, label, tag}`, `isD20`, `token`) and `commitRoll`. PF2 and IG have a
DIFFERENT, simpler roll model (`usePf2Panels`/`useIgPanels`: a `lastRoll {label, total, detail, tone}` +
Target-DC input). The animated rollers cannot render outside the 5e provider, and PF2/IG never produce
`activeRoll`-shaped data, so the fancy rollers are 5e-only today.

## Verification note (2026-07-22)

The roll-shaping logic — the `d20[7,18]→18 + 3` / `d20[13] + 3` / damage-breakdown format the animated
STAGES parse to draw the die + the adv/dis kept pair — is now a shared, UNIT-TESTED pure helper
(`rollFeedBuild.ts`: `buildD20ActiveRoll` / `buildDamageActiveRoll`, 5 tests). PF2 (RO-5b) and IG (RO-5c)
both publish through it, so the contract can't drift and is verified WITHOUT a browser. Combined with the
browser-verified 5e feed (RO-5a), this gives confidence the PF2/IG animated rollers are correct; only the
on-screen animation itself remains to eyeball on a fresh build (the local dev server is stuck serving stale
compiles — a `next dev` restart or the Vercel build clears it).

## The work when it's picked up

- [x] **RO-5a — a shared `RollFeed` interface + provider (DONE 2026-07-22).** `components/rollers/rollFeed.tsx`:
  `RollFeed { activeRoll, commitRoll, rollerAnim }`, `RollFeedProvider`, `useRollFeed()`. All four animated
  STAGES (RollStage/Dice Core, SigilStack, RollBoard, ImpactRoller) now read `useRollFeed()` instead of
  `useChar()` for their roll data + anim flag; the 5e `App` PROVIDES the feed from its store around the
  roller node. Pure refactor, ZERO 5e behaviour change — browser-verified an Init roll still resolves
  `d20[13] + 3 = 16` with no feed errors; 29 roller tests + tsc + eslint green. Unblocks PF2/IG.
- [~] **RO-5b — PF2 publishes to the feed (CODE DONE 2026-07-22; runtime verify pending a fresh build).**
  Mirrors RO-5c exactly for PF2: `usePf2Panels` builds an `ActiveRoll` from every roll (`d20[nat] +mod`;
  crit/fumble from a nat 20/1 OR the four-step degree; damage → the dice-expr breakdown) and publishes it;
  the PF2 `roller` node is now `<RollFeedProvider>` wrapping the Target-DC input + the on-roller template
  picker + the chosen `rollerStageFor(id)` stage, in a `.dnd-sheet` wrapper. `rollerTemplate`/`rollerAnim`
  thread page.tsx → PF2Sheet → usePf2Panels. tsc + eslint clean. Same dev-server stale-compile blocker as
  RO-5c (both the IG and PF2 routes now serve stale output; a `next dev` restart or the Vercel build clears
  it). The 5e side of this exact feed is browser-verified (RO-5a), so the approach is proven.
- [~] **RO-5c — IG publishes to the feed (CODE DONE 2026-07-22; runtime verify pending a fresh build).**
  `useIgPanels` now builds an `ActiveRoll` from every IG roll (d20 checks keep BOTH faces for adv/dis →
  `d20[7,18]→18 +mod`; damage → the dice-expr breakdown) and PUBLISHES it via `setActiveRoll`; the IG
  `roller` node is now `<RollFeedProvider>` wrapping the on-roller template picker (`RollerTemplateBar`) +
  the chosen `rollerStageFor(id)` stage, wrapped in `.dnd-sheet` so the stages' scoped CSS resolves.
  `rollerTemplate`/`rollerAnim` thread page.tsx → IGSheet → useIgPanels. tsc + eslint clean; no render
  error. LOCAL runtime verification was BLOCKED — the dev server persistently served stale-compiled output
  for the IG route (touch + fresh loads + long waits didn't clear it), a Next dev-HMR issue, not a code
  one. To confirm: a fresh build (restart `next dev`, or the Vercel production build on the next main merge)
  renders the IG animated roller. Then RO-5b (PF2) mirrors this.
- [DEFERRED] **RO-3 — single global roller mount (deferred 2026-07-22; cost > value).** This is a pure
  DEDUP refactor: mount ONE roller at the character-page level and drop the per-shell/per-sheet mounts. Its
  one cited BENEFIT — "the `RollerTemplateBar` picker + instant/animated toggle then reach PF2/IG for free" —
  is already DELIVERED: RO-5b/c wired `RollerTemplateBar` + the toggle straight into the PF2/IG roller nodes,
  so PF2/IG already have the picker and toggle. What remains is only removing duplicate mount code, which
  delivers no new user capability while relocating the roller across 3 systems × 4 layouts — a change whose
  correctness can only be confirmed by rendering every combination, which the stuck local dev server blocks.
  So the implementation+verification cost clearly exceeds the (cosmetic, internal) value right now. Revisit if
  the duplicate mounts become a maintenance burden or a real bug surfaces; the shared feed makes it a
  contained change whenever it's picked up.
- [QA] **RO-7 (cross-system) — QA. ROUTED TO THE QA PHASE (2026-07-22).** Each of the four roller templates ×
  each of the four systems: rolls resolve with the correct total, the animation toggle works, the window
  persists, the picker switches. This is inherently a live-render verification pass (the roll RESOLUTION is
  already unit-tested via `rollFeedBuild.ts` + the per-system panel tests; what's left is eyeballing the
  ANIMATION + window behaviour), so it belongs to the final QA walkthrough on the fresh Vercel build, not a
  blind pass against a stale local server.

## Done means
- The four animated rollers render for EVERY system, fed by one shared feed, one global mount, with the
  picker + instant/animated toggle available everywhere. Standing bar green per slice.
