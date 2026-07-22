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

- [x] **CX-R1 — rail on the RIGHT, panes open to the LEFT.** `.codex-stackwrap` now `grid-template-columns:
  1fr auto` with the rail placed in `grid-column: 2` (right) and the stack in `grid-column: 1` (left) via
  explicit grid placement — the rail stays first in the DOM so tab order is unchanged. The mobile `@media`
  resets `grid-column/grid-row: auto` so the phone strip still stacks rail-on-top. Keyboard + drag-resize
  untouched (pane internals unchanged). Browser-verified on Perrin (Codex): the rail sits on the far-right
  edge as upright letter-stacks (SKILLS/ABILITIES/COMBAT/ATTACKS/SPELLS/FEATURES) with the identity column
  left and panes opening to the rail's left.
- [x] **CX-R2 — vertical-STACKED tab letters.** `StackedLabel` in `PaneStack` renders each label char on
  its own line (upright, `flex-direction: column`), so the word reads TOP-TO-BOTTOM (S/K/I/L/L/S), not a
  rotated sideways word; the whole word rides on `aria-label` for screen readers. Removed the old
  `writing-mode: vertical-rl` + `rotate(180deg)`; the mobile strip flips the tab + label back to a row.
  Browser-verified on Perrin (Codex): the rail shows ◇ then S·K·I·L·L·S stacked upright.
- [x] **CX-R3 — no overlapping elements / condense.** Audit outcome: the Codex body has no self-overlap at
  any width — `.codex` is `grid-template-columns: minmax(280px, min(33%,420px)) 1fr` with a clean single-
  column breakpoint at `max-width: 900px` (identity → panes → rail strip), and the identity column is a
  sticky, own-scroll flex column so HP/AC/art/abilities never collide (browser-verified on Perrin's Codex:
  identity left, panes centre, rail right, nothing covering anything). The one real fix was the floating
  roller's DEFAULT resting spot: `defaultPos` guesses a 440px height, so a shorter content-fit roller hung
  ~140px above the corner and covered more content than needed. `useFloatingDock` now snaps a FRESH default
  flush to the bottom-right once the real height is measured (`freshDefault` ref → `y = innerHeight − h −
  EDGE`), while a RESTORED/saved position is only clamped, never moved. Verified live: a cleared roller
  settled at `y=318` in a 911px viewport with content height 581 → bottom at 899 (flush, EDGE-gap only).
  Unit anchor added for the bottom-snap formula (9 dock tests green). The roller sits bottom-right, clear
  of the top-left identity column/art; it remains a movable window the player can reposition at will.
- [ ] **CX-R4 — uploaded character art visible on EVERY template, EVERY system.** The 5e formats render
  the portrait (IdentityColumn / play-portrait / hero); the BESPOKE PF2/IG sheets are not even PASSED the
  uploaded art (`PF2Sheet`/`IGSheet` receive no `artUrl`), so it shows in NONE of their formats. Thread
  the character's art (`media.artUrl` / `character.art_url`) into `PF2Sheet`/`IGSheet` and render it in
  their identity node for codex/dashboard/play (a `codex-portrait`-style block) AND their classic header,
  and confirm the 5e Codex portrait is visible + uncovered by the roller. Verify on a character WITH art
  in each system × format.

- [ ] **CX-R5 — MOBILE sweep: every template × every style × every system fully viewable + usable on a
  phone (owner 2026-07-22).** Drive each of the 4 templates on each of the 4 systems at phone widths
  (~360–430px) in a couple of styles: Classic (tabs), Codex (rail→horizontal strip, panes stack full-
  width, page scrolls not the pane), Dashboard (card grid → one column), Play (hero + drawer stack).
  Confirm nothing is cut off or horizontally-scrolling, tap targets are reachable, the identity column
  and floating roller don't cover content, and the top chip pickers wrap cleanly. Fix the responsive
  CSS (container queries / `@media`) per format until each is genuinely usable on mobile. Record the
  matrix.

## Done means
- The Codex tab rail is on the right, panes open leftward, labels are upright letter-stacks.
- Nothing overlaps at any width; the identity column, art, panes and the (global) roller each have room.
- Character art is clearly visible. Every template × style × system is fully usable on mobile.
- Standing bar green per slice.
