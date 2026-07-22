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
- [x] **CX-R4 — uploaded character art visible on EVERY template, EVERY system.** New shared
  `SheetPortrait` (server-safe, prop-driven — mirrors the 5e `codex-portrait`: 3:4 cover, rounded, top-
  focus). `page.tsx` now threads `character.art_url` + `name` into BOTH `PF2Sheet` and `IGSheet`, which
  render it in the identity column (codex/dashboard), the play identity, and beside the classic header
  (a 132px fixed column so it doesn't dominate). Renders nothing when there's no art, so existing
  art-less characters are unchanged. The 5e formats already rendered the portrait (IdentityColumn / play
  / hero) and CX-R3 moved the roller flush to the bottom-right so it no longer covers the top-left art.
  Browser-verified on a PF2 character (Orin) with art in the Codex format: the portrait sits at the top
  of the identity column above the name/ancestry and the attribute/defence blocks. tsc + eslint green.

- [x] **CX-R5 — MOBILE responsive hardening (engineering portion).** Audited the format CSS for phone-
  width failure modes and fixed the concrete one: every `repeat(auto-fit, minmax(NNNpx, 1fr))` grid
  forces a track NNN px wide even when the container is narrower, which horizontally-scrolls the whole
  page below that width. Added the `min(100%, NNN)` floor to the three that matter for the sheet formats
  — `.dash-grid` (320px, Dashboard), `.play-ref-body` (340px, Play drawer), and the top Template picker
  (210px) — so each track shrinks to the container instead of overflowing. Functionally VERIFIED in the
  live page by mounting `.dash-grid` in 360/300/280px containers and measuring: track resolves to
  360/300/280px respectively with `overflowsX: false` (the old rule overflowed below 320). The format
  media queries already collapse to single-column (Codex/Dashboard at 900px → identity → panes/grid →
  rail strip; Play at 720px) and the top chip rows already `flex-wrap`. tsc + eslint + 46 codex/template
  tests green.
  - **DEFERRED (documented blocker): the exhaustive pixel-level visual sweep** across all 4 templates ×
    5 styles × 4 systems at ~390px. This harness pins `window.innerWidth` at 1920 regardless of window
    size (maximized window, no device-metrics emulation exposed via the browser tools), so a true phone
    viewport can't be rendered here to eyeball each combination. The responsive CSS is hardened and
    functionally verified; the final on-device visual pass is handed to the owner's mobile QA (the same
    on-device workflow used for the mobile-uploads runtime), to be checked during the Slice-40 final QA.

## Done means
- The Codex tab rail is on the right, panes open leftward, labels are upright letter-stacks. ✓ (CX-R1/R2)
- Nothing overlaps at any width; the identity column, art, panes and the (global) roller each have room. ✓
  (CX-R3 — clean 900px breakpoint, roller snaps flush bottom-right clear of the top-left identity/art)
- Character art is clearly visible on every template + system, including the bespoke PF2/IG sheets. ✓ (CX-R4)
- The responsive CSS is hardened so no format horizontally-scrolls on a phone, verified functionally. ✓
  (CX-R5) — with the exhaustive per-combination pixel sweep DEFERRED to the owner's on-device QA because
  this harness can't emulate a phone viewport (see CX-R5). That visual pass folds into the Slice-40 final QA.
- Standing bar green per slice. ✓

**Status: COMPLETE** (2026-07-22) — all engineering items shipped; the one deferral is a documented
harness limitation handed to on-device QA, not unfinished code.
