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

- **RO-5a — a shared `RollFeed` interface + provider.** Define the system-agnostic roll shape (essentially
  today's `ActiveRoll` + `commitRoll`) and a `useRollFeed()` hook. Refactor the four animated rollers to
  read `useRollFeed()` instead of `useChar()` directly. For 5e, a thin adapter provides the feed FROM the
  existing store — a pure refactor with ZERO behaviour change (verify: 5e rolls resolve/animate/log
  identically before and after). This is the safe first step and de-risks the rest.
- **RO-5b — PF2 publishes to the feed.** When a PF2 save/skill/strike/damage rolls, produce a feed entry
  (natural die face for the animation, PF2 breakdown, crit/fumble by the four-step degree ladder where a
  DC is set) and mount the chosen animated roller reading that feed. Keep the Target-DC + degree result.
- **RO-5c — IG publishes to the feed.** Same for IG's d20 + modifier / attack-damage rolls.
- **RO-3 — single global roller mount.** With the feed system-agnostic, mount ONE roller at the
  character-page level fed by whichever system is active, and remove the per-shell/per-sheet mounts. The
  `RollerTemplateBar` picker + the instant/animated toggle then reach PF2/IG for free.
- **RO-7 (cross-system) — QA.** Each of the four roller templates × each of the four systems: rolls
  resolve with the correct total, the animation toggle works, the window persists, the picker switches.

## Done means
- The four animated rollers render for EVERY system, fed by one shared feed, one global mount, with the
  picker + instant/animated toggle available everywhere. Standing bar green per slice.
