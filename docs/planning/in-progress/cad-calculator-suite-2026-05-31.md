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

### Slice 1 — Pure store: calculator suite state (zustand) ✅ shipped 2026-05-31

- New `lib/cad/store/calculator-store.ts` zustand slice + central
  re-export from `lib/cad/store/index.ts`.
- `CalculatorId = 'generic' | 'curve'` (extensible). `DEFAULT_CALCULATOR_ID`
  = `'generic'` per the user ask "default calc on new session".
- `activeCalculatorId` + `states: Partial<Record<CalculatorId,
  unknown>>` (per-id state blobs typed `unknown`; each calculator
  owns its own shape, narrowed at call sites via `getActiveState<T>()`).
- Actions: `setActiveCalculator`, `getActiveState<T>`,
  `getCalculatorState<T>(id)`, `setActiveState`,
  `setCalculatorState(id)`, `resetAll`.
- Persistence: `persist` middleware with `localStorage` under
  `starr-cad-calc-suite-v1`. Partializes both
  `activeCalculatorId` + `states` so reload restores the
  last-used calculator + every calculator's working data
  independently.
- 8 specs lock defaults, switching preserves per-calc state,
  `setCalculatorState` doesn't change the active id, `resetAll`
  restores defaults, `getActiveState` narrowing works.
- Full cad suite (2064) green; typecheck + lint clean.

### Slice 2 — `<GenericCalculator />` (Windows-style) ✅ shipped 2026-05-31

- Pure state machine in `lib/cad/calculators/generic-engine.ts`:
  `GenericCalcState = { display, pending, op, justEvaluated,
  awaitingOperand, tape }` + actions
  (`inputDigit`/`Decimal`/`Op`/`Equals`/`Clear`/`ClearEntry`/`SignFlip`/`Backspace`)
  + helpers (`parseDisplay`/`formatDisplay`/`applyOp`).
- Chained-operation contract verified: `12 + 3 + 4 =` returns
  `19`, with each `+` press showing the running subtotal
  (`12 + 3 +` → display 15, pending 15, op +).
- Left-to-right evaluation (`3 * 4 + 2 = 14`, no precedence —
  matches Win calc).
- Divide-by-zero ⇒ display `Error`; sign-flip / backspace
  protect 0; tape records each operator + `=` press.
- React component `GenericCalculator.tsx`:
  - Subscribes to `useCalculatorStore` `states.generic` slot so
    re-renders are reactive; writes via `setCalculatorState('generic',
    next)`. Falls back to `INITIAL_GENERIC_STATE` on fresh
    sessions.
  - 4-col × 5-row keypad with digits + operators + `C`/`CE`/`⌫`/`±`/`.`/`=`.
  - Document-level keydown listener for `0-9`, `.`, `+`, `-`,
    `*`, `/`, `Enter` (or `=`), `Backspace`, `Escape`/`C` (clear),
    `Delete` (CE), `F9` (sign-flip). Skips when an input /
    textarea / contentEditable has focus so it doesn't fight the
    command bar.
  - Rolling tape (last 6 entries) above the live display.
- 27 engine specs lock every action's behavior + the chained-op
  contract + edge cases (divide-by-0, decimal entry, sign flip,
  backspace). 12 UI source-text specs lock the store wiring,
  every keypad button + keyboard binding, and the tape / display
  testids.
- Full cad suite (2102) green; typecheck + lint clean.

### Slice 3 — Resizable modal shell ✅ shipped 2026-05-31

- New `app/admin/cad/components/ResizableModal.tsx` — self-
  contained shell with:
  - Fixed-center positioning + dark backdrop (click-outside
    closes; Escape closes via a document-level keydown listener).
  - Corner resize handle (bottom-right). Pointer-event based —
    `onPointerDown` captures the pointer (via `setPointerCapture`)
    so a fast drag never loses tracking, `onPointerMove` updates
    size from a start-anchor delta (no per-frame drift), and
    `onPointerUp` releases.
  - Sizes are clamped into `[naturalSize, effectiveMax]`. Max
    defaults to viewport - 32px margin so the modal can't escape
    the screen; explicit `maxSize` prop overrides.
  - Title bar with optional `headerActions` slot (for the
    upcoming Slice-4 picker dropdown) + a close `✕` button.
- New `useResizable()` hook returns `{ size, scale }` from a
  React context. `scale = max(1, size.width / naturalSize.width)`
  so children can multiply their font / button sizes
  proportionally as the modal expands. Hook throws when used
  outside the modal — catches misuse loudly.
- Re-opens at `naturalSize` (effect resets on close); persistent
  sizing across sessions is a future layer-on via the
  calculator-store.
- 13 source-text specs lock the public API
  (`useResizable` + hook throw + context-value shape), the resize-
  handle wiring (testid, pointer events, pointer capture), the
  clamp call, every close path (backdrop / Escape / close button),
  the context provider, the scale formula, and the
  viewport-aware default max.
- Full cad suite (2115) green; typecheck + lint clean.

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
