# Codex accordion: content-perfect open height + drag-to-reorder tabs

**Status:** IN PROGRESS · started 2026-07-22

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
- [ ] **A2 — viewport ceiling for giant sections.** A 300-spell list can't fit on screen; opening it at
  5000px and scrolling the whole accordion is worse than a scrolling pane. `capPaneToContent` gains an
  optional `viewportH`: the OPEN height is `min(content+chrome, ~0.9·viewport)`; the drag `max` stays the
  true content height (so the player can still drag it to full length if they want). Normal sections (content
  < 0.9·viewport) open fully — the common case the owner cares about. Thread `availableRef` into the call.
- [ ] **A3 — width.** The section body already takes the full width left of the tab (`.codex-acc-row .codex-pane`
  is `flex:1`), so width is not height-coupled — content wraps to the available width and the height
  measurement already reflects that wrap. Audit that no section has a fixed min-width forcing horizontal
  scroll on a narrow column; fix any found. (Likely a no-op confirm; keep the slice to hold the audit note.)

## Part B — drag-to-reorder the vertical tab stack

Today the rows render in fixed CANONICAL order. The owner wants a personal vertical order set by dragging a
tab up/down, other rows shifting to open a gap, drop to place. Persist per character (a view preference,
alongside the pane state).

**Slices**
- [ ] **B1 — persisted custom order (pure + storage).** Add `reorder(order, fromId, toIndex)` to `paneMath.ts`
  (pure, clamped, unit-tested). Store an optional `tabOrder: string[]` in the pane-stack localStorage; when
  set, the accordion sorts `defs` by it (unknown/new ids fall back to canonical position, so a newly-added
  section still appears). `usePaneStack` exposes `order` (effective) + `setOrder(ids)` + it's included in
  `reset`.
- [ ] **B2 — the drag interaction.** Pointer-based (not HTML5 DnD, for stylable, touch-friendly reordering):
  press-and-hold a tab handle → it lifts (a `dragging` class), the other rows animate a gap at the cursor's
  row, release → commit the new order via `setOrder`. Compute the target index from the cursor Y against the
  row midpoints. A drag threshold so a normal tap still just opens/closes the section. Respect
  `prefers-reduced-motion` (no slide animation, still reorders). Keyboard alternative: grab with Space, move
  with ↑/↓, drop with Space (so reordering isn't mouse-only).
- [ ] **B3 — polish + guard.** The reset tab stays pinned at the bottom (not reorderable). A drop outside the
  column cancels. Persisted order survives reload; a section gated away (module/system) is skipped without
  corrupting the saved order.

## Done means
- Opening ANY section shows all of its content immediately, with no in-pane scroll, for every section that
  fits the viewport; sections larger than the viewport open at a sane height and scroll only within the pane.
- A player can drag the tabs into any vertical order, the others reflow to make room, and the order persists
  per character (and resets with the stack). Keyboard-reorderable. Works on every skin/theme/system.
