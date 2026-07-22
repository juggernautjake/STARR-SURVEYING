# Codex layout refinements — rail on the right, vertical-stacked tab letters, no overlaps

**Status:** IN PROGRESS · started 2026-07-22

## Owner ask (verbatim, stitched)

> On the codex character sheet, I was having a hard time seeing all of my character info. It seems like
> some elements were covering up other elements. If you have a way to condense stuff or make it where
> things are not overlapping other elements, that would be great. Also, the tabs for the skills and
> actions and stuff are on the left side of the pane… I want them on the right side, and when they are
> clicked they open to the left. Also, I want the letters on the tabs for the labels to be vertical, but
> the word spelled with one letter under another — spelled vertically, not just straight-up sideways.
> [and earlier] On the codex character sheet, I can't even see the character art.

## Current state

`CodexShell` renders `.codex` = identity column (left) + `.codex-main` (right) with `EditReviewPanel`/
`Reactions` above a `PaneStack`. `PaneStack` puts the RAIL of tabs on the LEFT of the pane area, tab
labels ROTATED sideways (`writing-mode`/`transform: rotate`). Panes open to the RIGHT. The floating
roller (now global) can overlap the identity column / art.

## Slices

**Legend:** `[x]` shipped · `[~]` in progress · `[ ]` not started. Standing bar: `tsc`/`eslint`/`vitest`
+ browser-verified on a real character (with art) before checking a box. No `.skin-x` rule (test-enforced).

- [ ] **CX-R1 — rail on the RIGHT, panes open to the LEFT.** Flip the Codex body so the tab RAIL sits on
  the right edge and the open panes stack to its LEFT (mirror of today). `PaneStack` layout + `codex.css`
  (`flex-direction`/order, the resize-grab side, the collapsed-pane chrome). Keyboard + drag-resize still
  work. Browser-verify open/close/resize.
- [x] **CX-R2 — vertical-STACKED tab letters.** `StackedLabel` in `PaneStack` renders each label char on
  its own line (upright, `flex-direction: column`), so the word reads TOP-TO-BOTTOM (S/K/I/L/L/S), not a
  rotated sideways word; the whole word rides on `aria-label` for screen readers. Removed the old
  `writing-mode: vertical-rl` + `rotate(180deg)`; the mobile strip flips the tab + label back to a row.
  Browser-verified on Perrin (Codex): the rail shows ◇ then S·K·I·L·L·S stacked upright.
- [ ] **CX-R3 — no overlapping elements / condense.** Audit the Codex for elements covering each other
  (identity column vs. panes vs. the floating roller vs. the art). Give the roller a default resting spot
  that never covers the identity column/art (ties to the roller overhaul RO-1), tighten the identity
  column so HP/AC/art/abilities all fit without collision, and ensure the pane area and identity column
  don't overlap at any width (container-query breakpoints). Browser-verify at wide + narrow widths.
- [ ] **CX-R4 — uploaded character art visible on EVERY template, EVERY system.** The 5e formats render
  the portrait (IdentityColumn / play-portrait / hero); the BESPOKE PF2/IG sheets are not even PASSED the
  uploaded art (`PF2Sheet`/`IGSheet` receive no `artUrl`), so it shows in NONE of their formats. Thread
  the character's art (`media.artUrl` / `character.art_url`) into `PF2Sheet`/`IGSheet` and render it in
  their identity node for codex/dashboard/play (a `codex-portrait`-style block) AND their classic header,
  and confirm the 5e Codex portrait is visible + uncovered by the roller. Verify on a character WITH art
  in each system × format.

## Done means
- The Codex tab rail is on the right, panes open leftward, labels are upright letter-stacks.
- Nothing overlaps at any width; the identity column, art, panes and the (global) roller each have room.
- Character art is clearly visible. Standing bar green per slice.
