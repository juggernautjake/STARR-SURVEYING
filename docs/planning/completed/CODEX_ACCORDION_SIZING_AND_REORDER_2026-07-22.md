# Codex accordion: content-perfect open height + drag-to-reorder tabs

**Status:** COMPLETED 2026-07-22. Part A (content-perfect open height): A1 chrome-aware measurement +
margin containment SHIPPED, A2 viewport ceiling SHIPPED, A3 width verified-by-design (see below). Part B
(drag-to-reorder): B1 pure order math + persistence SHIPPED, B2 pointer drag + keyboard SHIPPED, B3 polish
satisfied by the B1/B2 design. All engineering shipped; only the on-screen visual confirm is a QA-phase item
on the fresh Vercel build (the local dev server serves stale compiles).

## Owner ask (verbatim, stitched)

> Determine exactly how tall and wide each accordion tab needs to be in the codex character sheet so that
> whenever it is opened it immediately displays ALL of the info, with no need to scroll the accordion. Some
> tabs are not tall enough when opened to reveal all of that section's content.
>
> Also make it where we can DRAG the accordion tabs to different positions — put the tabs vertically in an
> order we like. Click and grab and drag a tab up or down and have the other tabs rearrange to allow the
> grabbed tab to fit wherever it's hovered. Build this out; everything in the planning doc, built in slices.

## Background — the current machinery (what's there today)

- `codex/PaneStack.tsx` renders the accordion: `defs.map()` in CANONICAL order, one `.codex-acc-row` per
  section; an open row renders a `<PaneView>` (the section body) to the LEFT of its `.codex-acc-tab` button.
- `codex/paneMath.ts` (pure) — `Pane {id,height,collapsed,max}`; `openPane`/`closePane`/`resizePane`/
  `capPaneToContent`/`soloPane`/`toggleCollapse`. D-11 rule: a pane opens at its CONTENT height (`max`) and
  can only be dragged SHORTER, never past the content.
- `codex/usePaneStack.ts` — React state + per-character localStorage persistence (a VIEW preference, never
  character data). `setContentHeight(id, h)` reports a measured content height → `capPaneToContent`.
- `PaneView` measures `.codex-pane-measure` (`contentRef`) via `useLayoutEffect` + `ResizeObserver` and calls
  `setContentHeight(def.id, ceil(h) + 8)`.

## Part A — content-perfect open height (the "not tall enough" bug)

**Root cause 1 (the main bug): chrome is not accounted for.** `PaneView` measures the INNER content wrapper
(`.codex-pane-measure`) and reports THAT as the pane height. But the pane's set height covers the whole
`.codex-pane` = header + body(padding + content) + grab bar + borders (~60px of chrome). So every
auto-opened pane is ~60px too short; the body (`overflow-y:auto`) then scrolls and clips the last ~60px of
content. This is exactly "not tall enough to reveal all content", and it's consistent across sections.

**Root cause 2: margin collapse.** `.codex-pane-measure` is a plain block, so the LAST child's
`margin-bottom` protrudes outside its border-box and isn't counted by `getBoundingClientRect().height` — a
few more px clipped. Fix: make the measure wrapper a block-formatting context (`display: flow-root`).

**Root cause 3: height-based `@container` tiers.** `codex.css` has `@container codexpane (max-height:200px)`
and `(201–420px)` rules, so content reflows by pane HEIGHT — sizing the pane to content is chasing a moving
target. In practice it converges (the observer re-measures after each resize; taller tiers show ≥ content),
but a section whose content lands exactly on a tier boundary can wobble. Mitigate by measuring against the
tier the pane will SETTLE in, and accept ≤1 re-measure.

**Slices**
- [x] **A1 — chrome-aware measurement + margin containment (SHIPPED 2026-07-22).** `PaneView` now reports
  `neededPaneHeight(content, chromeOutsideBody, bodyPadV)` — content + (header+grab+borders, read as
  `section.offsetHeight − body.offsetHeight`, stable under overflow) + the body's computed vertical padding —
  instead of the bare inner content height. That closes the ~66px gap that was clipping every auto-opened
  pane. Added `sectionRef` on `.codex-pane`; `.codex-pane-measure { display: flow-root }` so a last child's
  collapsing margin is counted. New pure `neededPaneHeight` in `paneMath.ts`, 4 unit tests; codex-layout
  suite green (40); tsc + eslint clean. Visual confirmation of exact fit awaits the live build.
- [~] **A1 (orig text) — chrome-aware measurement + margin containment.** In `PaneView`, compute
  `needed = contentHeight + (paneOffset − bodyOffset) + bodyPaddingV` — i.e. content + (header + grab +
  borders) + the body's own padding — and report THAT. `paneOffset − bodyOffset` is the stable non-body
  chrome (flex:none parts) regardless of overflow. Add `.codex-pane-measure { display: flow-root }`. Add a
  `sectionRef` on `.codex-pane`. Pure-math unchanged; the FIX is in what we feed it. Unit-test a new pure
  helper `neededPaneHeight(content, chrome, bodyPad)` and keep the DOM read thin.
- [x] **A2 — viewport ceiling for giant sections (SHIPPED 2026-07-22).** `capPaneToContent` gained an
  optional `maxOpenH`; `usePaneStack.setContentHeight` passes ~85% of `window.innerHeight`. A section opens at
  `min(content, 0.85·viewport)` so a 300-spell list opens at a sane height and scrolls within the pane rather
  than making the whole accordion scroll; the drag `max` still records the TRUE content height, so the player
  can drag it to full length. Normal sections (content < ceiling) still open fully. 2 unit tests; green.
- [~] **A2 (orig) — viewport ceiling for giant sections.** A 300-spell list can't fit on screen; opening it at
  5000px and scrolling the whole accordion is worse than a scrolling pane. `capPaneToContent` gains an
  optional `viewportH`: the OPEN height is `min(content+chrome, ~0.9·viewport)`; the drag `max` stays the
  true content height (so the player can still drag it to full length if they want). Normal sections (content
  < 0.9·viewport) open fully — the common case the owner cares about. Thread `availableRef` into the call.
- [x] **A3 — width (VERIFIED-BY-DESIGN 2026-07-22).** The section body takes the full width left of the tab
  (`.codex-acc-row .codex-pane` is `flex:1`), so width is content-driven, not height-coupled: content wraps to
  the available width and the A1 height measurement (taken on the rendered content) already reflects that
  wrap, so the pane is exactly as tall as the wrapped content needs. The pane body is `overflow-x: hidden`, so
  any over-wide element is clipped/contained rather than forcing a horizontal scrollbar. No fixed min-width
  forcing horizontal scroll was introduced. The purely-visual "does any skin's content over-wide on a narrow
  column" check is a QA-phase item on the fresh Vercel build.

## Part B — drag-to-reorder the vertical tab stack

Today the rows render in fixed CANONICAL order. The owner wants a personal vertical order set by dragging a
tab up/down, other rows shifting to open a gap, drop to place. Persist per character (a view preference,
alongside the pane state).

**Slices**
- [x] **B1 — persisted custom order (pure + storage) (SHIPPED 2026-07-22).** Added `reorder(order, fromId,
  toIndex)` and `effectiveOrder(canonical, saved)` to `paneMath.ts` (pure, 6 unit tests): reorder clamps +
  no-ops unknown/same moves + never mutates; effectiveOrder keeps the saved order, appends new/returned
  sections in canonical order, and drops unavailable ids. `usePaneStack` persists `tabOrder` alongside the
  panes (filtered to available ids on read), exposes the EFFECTIVE `order` + `setOrder`, and clears it on
  `reset`. `PaneStack` renders its rows in `stack.order`. The DRAG that SETS the order is B2. tsc + eslint
  clean; codex-layout suite green (48).
- [~] **B1 (orig) — persisted custom order (pure + storage).** Add `reorder(order, fromId, toIndex)` to `paneMath.ts`
  (pure, clamped, unit-tested). Store an optional `tabOrder: string[]` in the pane-stack localStorage; when
  set, the accordion sorts `defs` by it (unknown/new ids fall back to canonical position, so a newly-added
  section still appears). `usePaneStack` exposes `order` (effective) + `setOrder(ids)` + it's included in
  `reset`.
- [x] **B2 — the drag interaction (SHIPPED 2026-07-22).** Pointer-based (mouse/touch/stylus): press-drag a
  tab past a 6px threshold → the row lifts + dims (`is-dragging`) and the row under the cursor shows a drop
  line (`drop-target`); release commits `setOrder(reorder(order, id, dropIndex))`. The drop index is read from
  the cursor Y against the row midpoints; a plain tap still toggles the section (the post-drag click is
  suppressed via a `justDragged` ref). `touch-action: none` on the tab so a touch drag reorders instead of
  scrolling. Keyboard: **Alt+↑/↓** moves the focused tab one place (chosen over Space-grab so it doesn't fight
  the tab's Enter/Space toggle). Feedback colours are theme tokens; the row transition respects
  `prefers-reduced-motion`.
- [x] **B3 — polish + guard (SATISFIED BY DESIGN 2026-07-22).** The reset tab is a separate row OUTSIDE the
  reorderable set and `rowIndexAtY` excludes `.codex-acc-resetrow`, so it stays pinned at the bottom and can't
  be reordered or be a drop target. `reorder` clamps the drop index and no-ops a same-place move (a drop that
  didn't move anything is harmless). The order persists per character (B1) and survives reload; `effectiveOrder`
  filters ids no longer available and appends new/returned sections, so a gated-away section never corrupts
  the saved order. Nothing left to build here.

## Done means
- Opening ANY section shows all of its content immediately, with no in-pane scroll, for every section that
  fits the viewport; sections larger than the viewport open at a sane height and scroll only within the pane.
- A player can drag the tabs into any vertical order, the others reflow to make room, and the order persists
  per character (and resets with the stack). Keyboard-reorderable. Works on every skin/theme/system.
