# Roller UX polish + shaped dice + readable Codex tabs

**Status:** IN PROGRESS · started 2026-07-22

## Owner ask (verbatim, stitched)

> There should just be a button for the dice roller at the bottom right of the page like there was
> before. Click it while closed → opens the modal; click while open → closes it. Remember the last
> position the roller was in before minimizing, so opening again opens it in the same location. Make all
> the different dice roller styles/formats robust and have noises. For the Impact roller, make the
> spinning-dice animation a tad slower and go a tad longer (I like the noises). Depending on the type of
> die selected, the number of SIDES on the digital dice shape should change — right now it's just a
> rounded square that spins for every roll; a d20 should be a 20-sided shape that spins then shows the
> result. On the Codex template, make the section tabs a bit wider, the tab text bold and easier to read
> on every style + theme — right now it's hard to tell they're even clickable tabs. And make the sections
> easy to format/intuitive, with all text for all styles/themes easy to read and comprehend.

## Slices

**Legend:** `[x]` shipped · `[~]` in progress · `[ ]` not started. Standing bar per slice: `tsc`,
`eslint`, `vitest`, browser-verified before its box is checked.

- [ ] **D-1 — bottom-right toggle button + remembered position.** The MINIMIZED roller becomes a compact
  dice button pinned at the bottom-right of the viewport (not a bar left at the roller's spot). Clicking
  it opens the roller AT ITS REMEMBERED position/size; the header's minimize returns it to the button.
  `useFloatingDock` keeps `x/y` as the expanded position across a minimize (already persisted), and gains a
  separate fixed bottom-right style for the minimized button. Browser-verify: move roller → minimize →
  button sits bottom-right → open → roller returns to the moved spot.
- [ ] **D-2 — Codex tabs: wider, bold, obviously clickable, readable on every style/theme.** Widen
  `.codex-railtab`, bold + higher-contrast label, a clearer resting/hover/active affordance (border,
  fill, a caret/chevron) so they read as buttons, using theme tokens only so all 5 styles × 5 themes stay
  legible. Browser-verify on a couple styles/themes.
- [ ] **D-3 — Impact roller: slightly slower + longer tumble.** Lengthen the Impact `TUMBLE` and ease the
  scramble interval a touch (keep the sounds), so the die spins a bit longer before landing. Respect the
  instant/reduced-motion path unchanged.
- [ ] **D-4 — shaped digital die (sides match the die).** The spinning shape gets N sides matching the die
  rolled (d4 triangle, d6 square, d8, d10, d12, d20 icosagon…), via a CSS `clip-path` polygon derived from
  the roll's die type. Falls back to the current rounded shape when the die is ambiguous (mixed pools).
  Apply to the rollers that show a die face (Impact, Dice Core). Browser-verify a d20 vs d6.
- [ ] **D-5 — every roller robust + audible.** Audit the 4 rollers: each resolves correctly, and each has
  sound on spin/land/crit/fumble (whoosh/tick/blip/tada/errorBuzz), honouring mute + the instant toggle.
  Fix any gap. Browser-verify sound fires on a roll per template.
- [ ] **D-6 — readable sections on every style/theme.** Sweep the sheet's section text/labels for contrast
  + intuitive formatting across all 5 styles × 5 themes (the contrast clamp already guarantees the token
  colours; this is about the places that hardcode a colour or read faint). Fix offenders; record.
- [ ] **D-7 — every roller shows the full breakdown ALWAYS (no toggle).** Each roller must clearly show
  the roll — normal or advantage/disadvantage — and every bonus/penalty applied from the character's
  abilities/skills/conditions/feats, as the full calculation AND the final total, shown BENEATH the dice
  result with NO "show breakdown" button (it's always visible). Audit the 4 rollers: surface the
  `entry.breakdown` (and the adv/dis kept-pair) inline, remove any collapse/expand gating on it. Keep it
  readable on every style/theme. Browser-verify a d20 with advantage + a conditional penalty shows the
  whole chain.

## Done means
- One bottom-right toggle button; the roller reopens where it was. Every roller is robust + audible; Impact
  spins a touch longer. The digital die has the right number of sides for the die rolled. Codex tabs read
  as bold, wide, obviously-clickable tabs on every style/theme, and all section text is legible everywhere.
