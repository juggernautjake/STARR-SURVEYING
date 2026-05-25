# Modal Framework Rollout — Drag, Resize, Close

**Status:** IN-PROGRESS
**Goal:** Every modal/dialog in the app can be dragged and resized, and has a
consistent X close button.

**Resolves (user report):** "When opening settings/preferences/AI chat/any
modal, a lot of them I can't click-and-drag or resize. Create dynamic resizing
for all modals and let me drag them around. Make sure they all have X close
buttons."

---

## Decision locked with the user

- **Infra + phased rollout:** build one reusable draggable/resizable modal
  shell, migrate the highest-traffic dialogs first, then the rest.

---

## Current state

- No shared base modal and no UI/dialog library (no Radix/Headless/react-modal)
  — every dialog is bespoke `fixed inset-0` markup.
- Only `CalculatorModal` was draggable; nothing was resizable.
- Shared `DialogCloseButton` exists at
  `app/admin/cad/components/ui/DialogCloseButton.tsx` (used by ~5 dialogs).
- ~25 dialogs total; ~10 lack any X button (e.g. CAD `ConfirmDialog`,
  `QuestionDialog`; research `ConfirmDialog`, `DrawingSaveDialog`;
  `ErrorReportDialog`).
- Shared hooks already exist: `useEscapeToClose`, `useFocusTrap`.

### Already shipped

- [x] `app/admin/components/ui/ModalFrame.tsx` — portal-rendered,
  header-drag, 8-handle resize, viewport clamp, Escape + click-away, optional
  `localStorage` persistence, built-in X close button.

---

## Design

`ModalFrame` is the single shell. Migration pattern per dialog: replace the
hand-rolled `fixed inset-0` backdrop + panel + header with
`<ModalFrame open title onClose storageKey ...>{body}</ModalFrame>`, keeping the
dialog's inner form/content untouched. Dialogs that need a fixed aspect or that
are tiny confirmations can pass tight `minWidth/minHeight` and a sensible
`initialWidth/Height`. Each dialog gets a stable `storageKey` so its size/
position persists per user.

Confirmation/alert dialogs (`ConfirmDialog`, `QuestionDialog`) get an X button
via the frame; their event-driven host pattern stays as-is.

Keep `useFocusTrap` where dialogs already use it (wrap the frame body).

---

## Action items

- [x] Build the shared `ModalFrame` shell (drag + resize + X + persistence).
  Added a `scrollBody` opt-out for dialogs with their own sticky layout.
- [x] **Settings/preferences** — migrated `SettingsDialog` onto `ModalFrame`
  (`scrollBody={false}`; sticky tab bar + footer, scrolling content;
  `storageKey="cad.settingsDialog"`; dropped its bespoke backdrop/header/X +
  `useEscapeToClose`).
- [x] **Shared confirms** — migrated CAD `ConfirmDialog` (centered, transient)
  + `QuestionDialog` (`closeOnBackdrop={false}`, persisted geometry) onto
  `ModalFrame`; both now have the X button + drag/resize.
- [x] **Research dialogs** — migrated research `ConfirmDialog`,
  `DrawingSaveDialog`, and `ErrorReportDialog` onto `ModalFrame` (all now
  drag/resize + X). Their inner content keeps its existing CSS classes inside
  the frame's dark panel — worth a visual QA pass for theme contrast.
- [ ] **CAD dialogs batch A** — AIDrawingDialog, ImportDialog,
  LayerTransferDialog, IntersectDialog, OrientationDialog (large; migrate
  carefully, one commit each).
- [ ] **CAD dialogs batch B** — the remaining ~15 smaller dialogs
  (NewDrawingDialog, PrintDialog, ScaleBarEditorModal, TitleBlockEditorModal,
  CalcPointDialog, ImageInsertDialog, FeaturePropertiesDialog, etc.).
- [ ] Audit pass: every dialog opens centered/persisted, drags, resizes, has an
  X, and Escape/click-away still work; remove now-dead bespoke backdrop code.

---

## Definition of done

Opening any modal shows a draggable, resizable window with an X button; size
and position persist per user; no dialog renders an immovable fixed panel.

## Risks / verification

- Some dialogs are very large (`LayerTransferDialog` ~2400 lines); migrate one
  per commit and keep the inner content markup intact to avoid regressions.
- Visual/interaction correctness needs a browser (not available here): each
  migration is type-checked + linted and flagged for manual QA. Pure decisions
  (which storageKey, min sizes) need no runtime.
