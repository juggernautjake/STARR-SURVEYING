# CAD calculator suite — 2026-05-31

*Opened 2026-05-31 in response to a user ask:*

1. *Make the calculator modal resizable — grab the corners and
   expand it. All elements should scale up proportionally while the
   modal keeps the relative size that's natural for the selected
   calculator type.*
2. *Add a new generic simple calculator (like the Windows calculator)
   that supports quickly chained calculations — type a number, hit
   `+`, type another, see the running result. Format + style it
   well, make sure it actually works, add it to the calculator list.*
3. *Make the new generic calculator the DEFAULT calculator that
   opens on a new session.*
4. *When the user closes + reopens the modal, it should restore
   the LAST-USED calculator with its previous state intact.*
5. *Every calculator's results / state must persist independently —
   the user can switch between them and resume each one.*

## Today's reality (audit, 2026-05-31)

- The existing calculator is `CurveCalculator.tsx` (curve geometry —
  radius, chord, arc length, etc). It's reached via the MenuBar
  entry "Curve Calculator…" and rendered as a fixed-size modal.
- There is no "list of calculators" today — just the one.
- No resize affordance on the modal; size is hardcoded in the
  component.
- No persistence; state is component-local and discards on close.

## Slices

### Slice 1 — Pure store: calculator suite state (zustand)

- New `lib/cad/store/calculator-store.ts` zustand slice:
  - `activeCalculatorId: string` (default `'generic'`).
  - `states: Record<string, unknown>` — per-calculator-id state
    blobs (so each calculator stores its own working data).
  - `getActiveState<T>(): T | null` + `setActiveState(patch)` +
    `setActiveCalculator(id)`.
  - Persistence: write to `localStorage` under
    `starr-cad-calc-suite-v1` (debounced) so the active id + the
    per-calculator state survives reload / modal close.
- Tests: pure store-state transitions; default = generic; switching
  preserves the previous calculator's state.

### Slice 2 — `<GenericCalculator />` (Windows-style)

- A standalone calculator component: number pad + operators (+ −
  × ÷) + memory + `C` + `CE` + `=` + decimal + `±`.
- Chained-operation contract: typing `12 + 3 + 4 =` shows `19`
  with each `+` press displaying the running subtotal.
- Wide screen support: number pad fills the available space when
  the modal is resized larger.
- All buttons keyboard-accessible (digits + + - * / Enter = . Esc).
- Stores its working tape in the calculator store under
  `'generic'`.

### Slice 3 — Resizable modal shell

- New `<ResizableModal>` wrapper: HTML5 resize via a corner-drag
  handle (no external library; `pointerdown` + `pointermove` on a
  `resize` handle in the bottom-right corner).
- Min size = the calculator type's natural size; max = the
  viewport minus a margin.
- Children that subscribe to a `ResizableContext` get the current
  size + a scale factor (so the calculator can grow font + button
  sizes proportionally).
- Mounts via portal so the resize doesn't shift surrounding panels.

### Slice 4 — Calculator picker + integrate into the modal

- The modal's top bar shows a small dropdown listing every
  registered calculator (`Generic`, `Curve`, …). Switching writes
  the new `activeCalculatorId` to the store; each calculator
  mounts/unmounts independently so its state stays intact.
- MenuBar entry renames from "Curve Calculator…" → "Calculator…"
  and opens the calculator suite at the last-used (or default
  generic) calculator.

### Slice 5 — Persistence + last-used restore

- Calculator-store persistence wires through to `localStorage`
  via a small `subscribe`-style middleware. On mount, the modal
  reads the persisted active id + state blobs and restores them.
- Tests: simulated reload (clear store + re-init from the
  localStorage blob) restores the active calculator + each
  calculator's state.

### Slice 6 — Curve calculator migration

- Existing `CurveCalculator.tsx` refactored to use the new
  calculator-store for its working state (no more component-local
  useState). After migration, the user can close + reopen the
  modal and see their curve inputs preserved.

## Out of scope / placeholder

- More specialized calculators (bearing/distance, area, COGO,
  unit converter) — opens once the framework is in place, each
  one is a new slice that's easy to add by registering with the
  picker.
- "Pin" / "favorite" calculators — useful but secondary.

## Guardrails

- Calculator store is pure — no DOM, no React.
- Persistence is debounced to avoid thrashing localStorage on
  every keystroke.
- Modal resize must clamp to viewport; no off-screen overflow.

## TL;DR

Six slices. Slices 1+2 are the foundation (store + the new
Generic calculator that fulfills the user's "Windows calc-style"
ask). Slice 3 adds the resizable shell. Slice 4 wires the picker.
Slice 5 makes persistence durable across reloads. Slice 6
migrates the existing Curve calculator onto the new framework so
both calculators share the same UX.
