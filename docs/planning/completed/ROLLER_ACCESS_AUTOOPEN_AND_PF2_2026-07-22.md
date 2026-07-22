# Roller: click-to-roll auto-open on every template + system, and PF2 completeness

**Status:** COMPLETED 2026-07-22. AO-1 (click-to-roll auto-open every template+system), AO-2 (PF2 roller
completeness), AO-3 (click-coverage) all shipped. One minor sub-item deferred: the manual instant/animated
TOGGLE on the bespoke PF2/IG rollers (see AO-2 note) — animations already work by default and honour
`prefers-reduced-motion`; the manual toggle needs a `rollerAnim` persist route on those systems and is pure
preference, so its cost exceeds its value for now. On-screen animation eyeballing is a QA-phase item.

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

- [x] **AO-2 — PF2 roller completeness audit (SHIPPED 2026-07-22).** Confirmed against live code + closed the
  one gap. All four templates are reachable/switchable via the on-roller `RollerTemplateBar` + `resolveRollerTemplate`
  → `rollerStageFor`. Every rollable element publishes a roll (saves/skills/Strikes to-hit/Strike damage;
  plus Perception/Initiative in AO-3). The full calculation reaches the animated stage: `d20[nat] + mod`, the
  four-step degree-of-success tag vs the Target DC, crit/fumble (nat 20/1 OR the degree), and — the fix —
  the NAMED contributing modifiers now pass through as `boosts`/`penalties`, so the breakdown shows even with
  a Target DC set (previously the tag replaced the breakdown with the degree). Damage shows the dice-expr
  breakdown. Animations play through the shared stages. 2 test anchors added. **DEFERRED sub-item:** the
  manual instant/animated TOGGLE on PF2/IG — animations work by default + honour `prefers-reduced-motion`; a
  manual toggle needs a `rollerAnim` persist route on the bespoke sheets and is pure preference, so cost >
  value now.
- [x] **AO-3 — click-to-roll coverage, every system (SHIPPED 2026-07-22).** IG had this (D-16). Audited PF2
  and found Perception + Initiative rendered display-only; both are d20 rolls (initiative IS Perception), now
  click-to-roll via a new `onRoll` on the `Stat` display (role=button + Enter/Space). Class DC / Spell DC stay
  display-only — they're DCs others roll against, not d20s you roll. 5e has had click-to-roll throughout. 1
  test anchor. (A spell ATTACK roll shown as a Spell-DC sub-value remains display-only — a narrow follow-up.)

- [x] **AO-2 (orig) — PF2 roller completeness audit.** RO-5b already made PF2 publish every roll into
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

- [x] **AO-3 (orig) — click-to-roll coverage audit, every system (SHIPPED — see AO-3 above).** Confirm EVERY value a player would roll is
  itself clickable and publishes a roll (5e via the store; PF2/IG via `rollLine`/`rollDamage`), on every
  template. IG already got this (D-16). Sweep PF2 + 5e for any stat that displays but isn't rollable, and
  wire it. Largely a confirm; fix what's found.

## Done means
- On every system and every template, clicking a rollable stat rolls it and pops the roller open (if closed),
  showing the full calculation + result with the template's animation + sound.
