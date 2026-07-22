# Roller: a system-agnostic roll feed (parked from the Dice Roller Overhaul)

**Status:** PENDING · parked 2026-07-22 · split out of `completed/DICE_ROLLER_OVERHAUL_2026-07-22.md`

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

## The work when it's picked up

- [x] **RO-5a — a shared `RollFeed` interface + provider (DONE 2026-07-22).** `components/rollers/rollFeed.tsx`:
  `RollFeed { activeRoll, commitRoll, rollerAnim }`, `RollFeedProvider`, `useRollFeed()`. All four animated
  STAGES (RollStage/Dice Core, SigilStack, RollBoard, ImpactRoller) now read `useRollFeed()` instead of
  `useChar()` for their roll data + anim flag; the 5e `App` PROVIDES the feed from its store around the
  roller node. Pure refactor, ZERO 5e behaviour change — browser-verified an Init roll still resolves
  `d20[13] + 3 = 16` with no feed errors; 29 roller tests + tsc + eslint green. Unblocks PF2/IG.
- **RO-5b — PF2 publishes to the feed.** When a PF2 save/skill/strike/damage rolls, produce a feed entry
  (natural die face for the animation, PF2 breakdown, crit/fumble by the four-step degree ladder where a
  DC is set) and mount the chosen animated roller reading that feed. Keep the Target-DC + degree result.
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
- **RO-3 — single global roller mount.** With the feed system-agnostic, mount ONE roller at the
  character-page level fed by whichever system is active, and remove the per-shell/per-sheet mounts. The
  `RollerTemplateBar` picker + the instant/animated toggle then reach PF2/IG for free.
- **RO-7 (cross-system) — QA.** Each of the four roller templates × each of the four systems: rolls
  resolve with the correct total, the animation toggle works, the window persists, the picker switches.

## Done means
- The four animated rollers render for EVERY system, fed by one shared feed, one global mount, with the
  picker + instant/animated toggle available everywhere. Standing bar green per slice.
