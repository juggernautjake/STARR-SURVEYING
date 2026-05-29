# Hub greeting + edit-mode affordances polish

*Opened 2026-05-29 as a direct follow-up to
`hub-grid-8x8-square-cells-2026-05-29.md` (Slices 209–217).*

## What the user asked for

> "The Enter Work Mode button should be green with white text, bigger
> and more central, more rounded. The 'Good afternoon Jacob' font
> needs to be white too — it's too dark and blends into the
> background color. Also, there's no widget editor like I wanted. I
> want to edit width/height/visibility per widget and stack them or
> place side-by-side in any configuration. Widgets seem stuck at one
> size and cannot be edited."

Five concrete asks:

1. **Greeting heading text → white** (currently rendering dark on
   the brand-navy gradient background).
2. **"Enter Work Mode" button → green / white text / bigger /
   centered / more rounded**.
3. **Widget editor is broken/invisible** — drag + resize handles
   exist (Slices 98–99) but are 18×18px and almost imperceptible in
   the cell corner, so the user thinks the widget is stuck.
4. **Drag widgets** to any position; **resize** to any width/height.
5. **Add / remove / hide** widgets via a clear UI.

## What already exists (no rebuild needed)

| Piece | Where it lives |
|-------|----------------|
| Greeting component | `app/admin/me/components/HubGreeting.tsx` |
| Hub greeting CSS | `app/admin/me/AdminMe.css` (`.hub-greeting*`, `.hub-btn*`) |
| Drag handle (`⋮⋮` button) | `WidgetGrid.tsx` `DragHandle` (Slice 98) |
| Resize handle (18×18 corner) | `WidgetResizeHandle.tsx` (Slice 99) |
| Add Widget modal | `AddWidgetModal.tsx` (Slice 100) |
| Settings panel (per-widget) | `SettingsPanel.tsx` (Slice 101) |
| `removeWidget` action | `hub-store.ts` |
| Save/Cancel floating bar | `EditMode.tsx` `EditModeBar` |

## What's missing

- The greeting heading text is rendering as dark/black on the navy
  gradient instead of white. Need to force `color: white` + bump
  the font-weight so it punches through the gradient.
- The "Enter Work Mode" button uses the generic `.hub-btn--primary`
  style (white bg, navy text). Needs its own modifier — green bg,
  white text, larger padding, larger border-radius, more visual
  weight (shadow, larger min-width).
- Drag + resize handles are too small + too subtle. Need a bigger
  edit-mode chrome around each cell that makes "you can drag this"
  obvious: visible dashed outline, prominent drag handle in the
  header, large resize grip in the corner.
- No quick "Remove" / "Hide" button per widget in edit mode. The
  surveyor has to open the settings panel + scroll to find a
  delete action.

## Phases + slices

### Phase 36 — Greeting + Enter Work Mode visual polish (Slice 218)

#### Slice 218 — Force white greeting + green Enter Work Mode CTA ✅ shipped
- **Scope:** CSS-only changes to `AdminMe.css`. (a) `.hub-greeting__heading` gets explicit `color: #fff` + `font-weight: 700` + a small text-shadow to nail the contrast on the navy gradient. (b) `.hub-greeting__date` and `.hub-greeting__clock-status` get explicit white-ish colors. (c) New `.hub-greeting__work-mode-btn` modifier (already attached in JSX) overrides the generic primary style: `background: var(--color-success)` (green), `color: #fff`, `padding: 0.75rem 1.5rem`, `border-radius: var(--radius-xl)`, `font-size: 1rem`, `font-weight: 700`, `min-width: 12rem`, `box-shadow: 0 4px 12px rgba(0,0,0,0.18)`, centered via `margin: 0 auto` inside `.hub-greeting__actions`. Hover state: slightly darker green + lifted shadow. (d) `.hub-greeting__actions` becomes a `display: flex; justify-content: center` so the button centers in its column.
- **Files:** `app/admin/me/AdminMe.css`, `__tests__/admin/me/hub-greeting-style.test.tsx`.
- **Done when:** The heading is unambiguously white + the Enter Work
  Mode button is a prominent green pill that catches the eye.
- **Depends on:** —.
- **Done:** Heading now explicitly `color: #FFFFFF` + `font-weight: 700` + `text-shadow: 0 1px 2px rgba(0,0,0,0.25)` so the title reads as white even when a parent rule cascades a darker `var(--color-text-primary)`. Date + clock-status lines pinned at `rgba(255,255,255,0.92)` so the secondary lines stay readable too. New `.hub-greeting__work-mode-btn.hub-btn` (+ the `--primary` variant for higher specificity than the generic button selector) rule turns the CTA into a fully rounded pill (`border-radius: 9999px`) with `background: var(--color-success)` (#10B981), white text, `padding: 0.85rem 2rem`, `font-size: 1.05rem`, `font-weight: 700`, `min-width: 12rem`, and a layered glow shadow tied to the success color (`0 6px 18px rgba(16,185,129,0.32) + 0 2px 4px rgba(0,0,0,0.18)`) so it pops off the navy gradient. Hover deepens the green to #059669 + lifts via `translateY(-1px)` + grows the shadow; active resets the lift. `.hub-greeting__actions` now centers its children with `justify-content: center` + `align-items: center` so the button anchors the right column of the greeting card. 8 vitest specs lock every CSS contract: heading carries #FFFFFF + 700 weight + text-shadow; date + clock-status pin rgba whites; the CTA's success-color background, full pill radius, larger padding/weight/min-width, layered success-tinted shadow, the hover state's deeper green + translateY; and the actions column's centering pair. 17 specs across all admin/me tests still green. `tsc` + `eslint` clean.

### Phase 37 — Edit-mode chrome polish (Slices 219+)

#### Slice 219 — Larger drag handle + visible edit outline + remove button ✅ shipped
- **Scope:** When `editMode` is on, every widget cell gets a 2px
  dashed `--theme-accent` outline + offset, the drag handle gets
  bigger (24×24, accent background, white glyph), and a new "✕
  Remove" button is added to the cell's title bar. Hover state on
  the cell raises a subtle shadow so the "I can drag this" intent
  is obvious.
- **Files:** `lib/hub/components/WidgetGrid.tsx`,
  `lib/hub/components/WidgetFrame.tsx`,
  `__tests__/hub/widget-grid-edit-affordances.test.tsx`.
- **Done when:** A surveyor in edit mode immediately sees which
  cells are draggable/resizable/removable.
- **Done:** `StaticWidgetCell`'s `cellStyle` now paints three distinct ring states: drop-target → solid 2px accent ring (Slice 203); edit-mode-not-target → 2px dashed accent ring with -2px offset + 8px border-radius; view mode → no outline. Switching `overflow` to `visible` in edit mode unclips the bottom-right resize grip so it sits proud of the cell instead of getting trimmed at the boundary. The `DragHandle` helper grew from a 4px-padded transparent button to a 28×28 accent pill with white glyph + `box-shadow: 0 1px 3px rgba(0,0,0,0.18)` so the ⋮⋮ glyph reads as a deliberate affordance instead of a faint detail. A new `RemoveButton` renders a 28×28 danger-tinted outlined button with the ✕ glyph + stops propagation on both `click` and `pointerdown` so removing a widget doesn't trigger the canvas's event-delegated `[data-widget-id]` click that opens the SettingsPanel. The two buttons compose inside a new `CellEditActions` flex group that lives in `WidgetFrame`'s `headerAction` slot whenever `editMode` is on (replacing the bare `<DragHandle>` mount); the wrapper only conditionally renders the DragHandle when dragListeners are present (e.g. the dnd-kit sortable wrapper has hydrated) but always renders the RemoveButton so a surveyor can delete a widget even before sortable kicks in. `CellEditActions` pulls `removeWidget` via the existing `useHubActions()` helper (Slice 200) — no new subscription, no extra re-render. Both branches of the cell renderer (the in-catalog + the unknown-widget fallback) feed through the new headerAction. 14 vitest specs lock the source-level contracts (dashed-outline string, -2px offset, overflow:visible in edit mode, drag handle 28×28 + accent background + glyph + grab cursor, remove button ✕ glyph + danger color + propagation guards + onRemove signature + aria-label, CellEditActions composition + guard semantics + the useHubActions wiring). 1029 hub specs green. `tsc` + `eslint` clean.

#### Slice 220 — Bigger resize grip + size badge on hover
- **Scope:** The 18×18 resize handle grows to 28×28 in edit mode +
  gets the accent color. A "WxH" badge appears next to the handle
  on cell hover (not just during drag) so the user knows what size
  they're at.
- **Files:** `lib/hub/components/WidgetResizeHandle.tsx`,
  `__tests__/hub/widget-resize-handle.test.tsx`.
- **Done when:** The resize grip is obvious + the current size is
  always visible during edit-mode hover.

---

## TL;DR

- Three slices to make the hub editor read as "obviously
  customizable" instead of "stuck".
- Slice 218 is the single highest-impact visual fix: white heading
  + a green Enter Work Mode CTA that anchors the greeting.
- Slices 219–220 surface the existing drag/resize/remove machinery
  so the surveyor can actually find it.
