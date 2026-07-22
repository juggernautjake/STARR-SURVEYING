# Roller: click-to-roll auto-open on every template + system, and PF2 completeness

**Status:** IN PROGRESS · started 2026-07-22

## Owner ask (verbatim, stitched)

> Make the digital rolling modals for each template/style fully hooked up to the Pathfinder 2 sheets. Make
> the roller accessible, all templates usable, and have it properly show the calculations/rolls with all the
> information about a roll. Make sure the animations are working.
>
> If I click on an element on ANY character sheet template for ANY system, the dice roller should roll for
> that thing. Even if the dice roller modal is CLOSED, it should pop open and do the roll.

## Slices

- [x] **AO-1 — click-to-roll auto-opens the roller on every template + system (SHIPPED 2026-07-22).** The
  floating roller could be minimized to its bottom-right dice button; a roll made while minimized fired but
  wasn't seen. Only the FULL 5e Dice Core / Impact / Board rollers popped open on a fresh roll; the four
  STAGES (what PF2/IG mount via `rollerStageFor`, and the 5e stage path) and the Sigil roller did not — so on
  those the throw happened invisibly. Centralized the behaviour in ONE hook, `useExpandOnRoll(token)` in
  `FloatingRoller.tsx` (expands only on a token it hasn't seen; idempotent; a no-op outside a FloatingRoller),
  and called it in ALL FOUR stages (`RollStage`, `SigilStage`, `BoardStage`, `ImpactStage`). Since the full
  5e `SigilStack` renders `<SigilStage/>` and Dice Core/Impact/Board already expand, every 5e roller is
  covered too. Verified every sheet mounts the roller inside a `<FloatingRoller>` (IG/PF2 Classic + the
  Codex/Dashboard/Play shells), so `expand()` is real everywhere — not the no-op default. 7-test source
  anchor (`roller-autoopen.test.ts`); tsc + eslint clean.

- [~] **AO-2 — PF2 roller completeness audit (in progress).** RO-5b already made PF2 publish every roll into
  the shared feed and mount the animated roller with the on-roller template picker + instant/animated toggle
  (see `completed/ROLLER_SYSTEM_AGNOSTIC_FEED_2026-07-22.md`). This slice CONFIRMS the owner's specifics
  against the live code and closes any gap:
  - all four templates reachable + switchable on PF2 (the `RollerTemplateBar` picker is in the PF2 roller node);
  - every rollable PF2 element (saves, skills, Strikes to-hit, Strike damage, spell attacks) publishes a roll;
  - the breakdown shows the full calculation — `d20[nat] + mods`, the four-step degree-of-success tag
    (crit-success / success / failure / crit-failure vs the Target DC), crit/fumble, damage dice expression;
  - the animation + sounds play (shared stages), honoured by the instant/animated toggle.
  Any element found NOT wired, or any calculation detail missing, is fixed here. Runtime animation eyeballing
  is a QA-phase item on the fresh Vercel build (the local dev server serves stale compiles).

- [ ] **AO-3 — click-to-roll coverage audit, every system.** Confirm EVERY value a player would roll is
  itself clickable and publishes a roll (5e via the store; PF2/IG via `rollLine`/`rollDamage`), on every
  template. IG already got this (D-16). Sweep PF2 + 5e for any stat that displays but isn't rollable, and
  wire it. Largely a confirm; fix what's found.

## Done means
- On every system and every template, clicking a rollable stat rolls it and pops the roller open (if closed),
  showing the full calculation + result with the template's animation + sound.
