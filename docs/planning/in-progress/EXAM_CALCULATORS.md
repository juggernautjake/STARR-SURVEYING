# Approved-Exam-Calculator Modal

**Status:** Planning — slices below ship one at a time per the in-progress / completed cycle.
**Total estimate:** ~6 engineering days across 25 slices.
**Related:** the learning platform under `/admin/learn/exam-prep/*` is the primary integration target. The pay-progression overhaul (now in `docs/planning/completed/PAY_PROGRESSION_OVERHAUL.md`) established the design tokens this plan reuses.

---

## 0. tl;dr

Surveying state exams (FS, PS, RPLS) only permit a small list of approved scientific calculators. Employees studying for these exams need to practice with the same calculator they'll use on test day. This plan ships an in-app modal that emulates each approved model — visual layout + button behavior + math — so an employee can:

1. Open a movable, resizable modal anywhere in the admin app (especially while on exam-prep modules).
2. Pick the calculator they'll use on the exam from a tab strip.
3. Use the buttons just like the physical device: same key layout, same key labels, same fonts/colors where practical, same modes (RAD/DEG, fix/sci/eng, etc.).
4. Have the calculator's full state (display, stack/history, memory, mode) saved per-user-per-calculator and restored on the next visit.
5. Copy the current display value with one click, for pasting into a quiz answer field or any other input on the page.

Approved models (NCEES Surveying-discipline policy, October 2024):

| Brand | Allowed models | Notes |
|---|---|---|
| **Casio** | All `fx-115` and `fx-991` variants | Natural-display algebraic; two-line+ output |
| **Hewlett-Packard** | Exactly `HP 33s` and `HP 35s` | RPN/algebraic switchable; single-line (33s) or 2-row dot-matrix (35s) |
| **Texas Instruments** | All `TI-30X` and `TI-36X` variants | TI-30X family is algebraic; TI-36X Pro adds matrices/vectors |

A faithful behavioral clone of any of these calculators is a deep rabbit hole on its own (firmware quirks, bit-exact precision, special-mode interactions). This plan deliberately scopes to **exam-question accuracy** — every calculation an employee would do while practicing a surveying exam returns the same answer to standard precision — without promising 1:1 firmware emulation.

---

## 1. Goals & non-goals

### Goals

- Ship working emulations of one representative model per allowed family: `fx-991ES PLUS`, `HP 35s`, `TI-36X Pro`. The plan calls out follow-up slices to add the sibling models (`fx-115`, `HP 33s`, `TI-30X variants`) once the engines exist.
- Each calculator renders inside a movable, resizable modal with a tab strip at the top. The modal stays open as the user navigates within the admin app (state persists via context, not unmount).
- Every button on each calculator does the math its real-world counterpart does, to typical exam precision (≥ 10 significant figures).
- Per-user, per-calculator state save: display, stack/history, memory slots, angle mode, display mode, and last-used calculator. Saved to a Supabase table and loaded on modal open.
- One-click "Copy display" populates the OS clipboard with the raw numeric value.
- Integration with the learning platform: a "Calculator" pill on every exam-prep module + a `<CalculatorTriggerButton>` callable from any quiz answer field.

### Non-goals

- **Bit-exact firmware emulation.** Edge cases like Casio's specific overflow behavior, HP's exact RPN-stack lift quirks under MEMRY mode, and TI's MultiView fraction-formatting will be approximated to "looks and behaves close enough for exam practice."
- **Programming features.** HP 33s/35s let users write SOLVE programs in keystroke or RPL. Out of scope — not used on FS/PS-discipline questions.
- **Statistics / regression beyond two-variable.** Most surveying questions don't need it. We'll ship one-variable + linear regression; matrix and higher-order regression on TI-36X Pro is a Phase 5 stretch.
- **Constants table emulation.** Each calculator has built-in CONST tables (gravity, π precision, fundamental physics). We'll surface a token list with rounded values; we won't reproduce the physical menu UI.
- **Network play / multi-user collaboration.** Each calculator is single-user.
- **Mobile-native app integration.** The Starr Field RFC owns mobile. The web modal must render acceptably on small viewports but won't have a separate mobile-native implementation.

---

## 2. Current state

| Aspect | Today |
|---|---|
| Calculator surface | None. Employees use a physical calculator, a phone app, or the OS calculator. |
| Learning platform context | `/admin/learn/exam-prep/sit` and `/admin/learn/exam-prep/fs` host quiz-style exam practice. No tool integration. |
| Math runtime | The pay-progression page does its own numeric math; there's no shared math engine in `lib/`. |
| Modal system | Existing toast / sidebar drawers under `app/admin/components/`. No portable, movable-window modal yet. |
| State persistence | `xp_balances`, `employee_profiles`, etc. — per-user state pattern is established. No calculator-specific table. |
| Design tokens | Available globally from the UI/UX overhaul (`app/styles/tokens.css`, `app/styles/forms.css`). |

---

## 3. Architecture

### 3.1 — Modal shell

A `<CalculatorModal>` provider component lives at the layout level (mounted in `app/admin/layout.tsx`). State context exposes:

- `openCalculator(modelKey?)` — show modal, optionally switch tabs
- `closeCalculator()` — hide modal but preserve in-memory state
- `isOpen`, `currentModel`, `setCurrentModel(modelKey)`

Modal frame:

- **Draggable**: header bar with grab cursor; mousedown-move-mouseup or pointer events; clamped to viewport.
- **Resizable**: not in v1 — fixed dimensions per model (Casio is wider; HP is taller). Resize is a future slice.
- **Z-index**: above the fixed FAB (`var(--z-modal)` = 200, established in the UI/UX overhaul).
- **Persist position**: last (x, y) saved in localStorage.

Tab strip across the top of the modal: one tab per available model. Inactive tabs render only their key indicator + name; only the active tab's calculator mounts (we save its state before unmounting on tab switch so memory + history persist).

### 3.2 — Math engine abstraction

Each calculator has its own internal state machine but shares a common math runtime in `lib/calculators/math.ts`:

- All math uses `decimal.js` (or equivalent arbitrary-precision lib) at 25-digit precision; display rounds to the model's native precision.
- Functions exposed: `add/sub/mul/div`, `sin/cos/tan/asin/acos/atan` (with RAD/DEG/GRAD), `ln/log/exp/pow/sqrt/root`, `factorial`, `permutation/combination`, `random`, `pi/e`, `degToDms / dmsToDeg` (essential for surveying angle math), `fix / sci / eng` formatting.
- Mode flags per calculator: `angleMode`, `displayMode`, `digitCount`.

### 3.3 — Per-calculator implementations

Each model is its own component + state machine:

```
lib/calculators/
  math.ts              — shared math primitives
  shared.ts            — common state types (Display, Memory, History)
  models/
    casio-fx991/
      keypad.tsx       — JSX/CSS layout matching the physical keypad
      engine.ts        — algebraic input parser + state machine
      display.tsx      — natural-display renderer (handles fractions / √)
      icons.tsx        — SHIFT/ALPHA/MODE button glyphs
    hp-35s/
      keypad.tsx
      engine.ts        — RPN stack machine (x, y, z, t registers)
      display.tsx      — 2-line dot-matrix renderer
    ti-36x-pro/
      keypad.tsx
      engine.ts        — algebraic with MathPrint
      display.tsx
```

Adding the sibling models (`fx-115`, `HP 33s`, `TI-30X`) is mostly a keypad relabel + a feature-flag flip on the engine.

### 3.4 — Persistence

New table:

```sql
CREATE TABLE user_calculator_state (
  user_email   TEXT NOT NULL,
  model_key    TEXT NOT NULL,   -- 'fx-991', 'hp-35s', 'ti-36x-pro', ...
  state        JSONB NOT NULL,  -- model-specific blob
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_email, model_key)
);
```

Each engine exports `serialize()` → JSONB and `hydrate(json)` → engine instance. Save on:

- Tab switch
- Modal close
- 5 seconds of idle activity (debounced)
- Browser `beforeunload`

### 3.5 — Learning-platform integration

A new shared component `<CalculatorTriggerButton>`:

```tsx
<CalculatorTriggerButton model="fx-991" reason="quiz answer assist" />
```

- Renders a small pill button labeled "🧮 Calculator"
- Opens the modal via the context, switches to the named model
- Optional `onCopy={(val) => …}` callback so the host can wire "Copy display" → answer field

Embed locations:
- Top-right of every `/admin/learn/exam-prep/*` page
- Inline next to numeric answer inputs in quizzes
- On individual learning module pages that include numeric problems

---

## 4. Slices

Phases mirror the structure of the completed overhauls. Each slice is a single PR-sized change with a verification step.

### Phase 1 — Foundation (5 slices, ~1.5 days)

| Slice | Description | Estimate |
|---|---|---|
| **C-1** | SQL seed: create `user_calculator_state` table per §3.4. Idempotent. | 1 hour | ✅ Shipped (awaiting apply) — `seeds/288_user_calculator_state.sql`. Composite PK on `(user_email, model_key)` so each user has at most one row per calculator they've used. `state JSONB NOT NULL DEFAULT '{}'::jsonb` holds the engine's serialize() output (each engine includes a `schema_version` field so older shapes migrate on load). `updated_at` trigger mirrors the convention used in `user_pay_overrides` (P-15). Index on `user_email` for the "list calculators this user has touched" query that powers the tab strip's last-used hints. **User action:** apply via Supabase SQL Editor — see `docs/planning/completed/PAY_PROGRESSION_OVERHAUL.md` §5 for the apply pattern. |
| **C-2** | Movable modal shell (`<CalculatorModal>`) — draggable header, fixed dimensions, viewport clamp, position persisted to localStorage. No calculator content yet. | 4 hours | ✅ Shipped — `app/admin/components/calculator/CalculatorModal.tsx` + matching CSS. Renders via `createPortal` to `document.body`. Pointer events (mouse + touch via the same handlers) on the header drive the drag; `setPointerCapture` keeps the move alive even if the cursor leaves the header. Viewport clamp keeps at least 40px of the header visible at every edge so the modal can never escape the user. Position persisted to `localStorage.calculatorModalPos` (configurable key) and re-clamped on window resize. Default position: top-right with a comfortable inset. `Escape` closes. Header is a brand-navy gradient with the title + an optional "clear state" button + a close button (both marked `data-no-drag` so clicks don't initiate a drag). Header has `touch-action: none` for clean touch drag. Mobile breakpoint at 480px center-locks the modal and disables the drag. Props: `open`, `title`, `width`, `height`, `toolbar` (a slot for the future tab strip from C-3), `children`, `onClose`, optional `onClearState`. No calculator content yet — that lands in Phase 2+. Typecheck clean; 13/13 CSS braces. |
| **C-3** | Calculator context + provider mounted in `app/admin/layout.tsx`. Tab strip rendering the three v1 models as placeholder tabs. | 3 hours | ✅ Shipped — `<CalculatorProvider>` exposes a `useCalculator()` hook returning `{ isOpen, currentModel, openCalculator(modelKey?), closeCalculator(), setCurrentModel(modelKey) }`. Mounted just inside `<CommandPaletteProvider>` in `AdminLayoutClient` so every admin route gets it. `CALCULATOR_MODELS` exports the catalog of all six approved models with brand / label / dimensions / phase; the tab strip renders all six (not just three) so users can preview future calculators and the storage `lastModel` survives Phase rollouts. The active model's `<ModelPlaceholder>` shows a "Working emulator ships in Phase N" stub — replaced per-model in C-6+/C-11+/C-15+/C-19+. Last-used model persisted to `localStorage.calculatorLastModel`. Tabs use the design tokens (active tab is brand-navy fill). Typecheck clean; 28/28 CSS braces. |
| **C-4** | `lib/calculators/math.ts` — shared math primitives via `decimal.js`: arithmetic, trig with mode, log/exp, factorial, DMS, formatting. Unit tests for each function. | 4 hours | ✅ Shipped — `lib/calculators/math.ts` exports the full primitive set: arithmetic (`add/sub/mul/div/neg/abs/pow/sqrt/cbrt/nthRoot/reciprocal`), logs (`ln/log10/exp/tenPow`), trig with explicit `AngleMode` ('RAD' \| 'DEG' \| 'GRAD'), hyperbolics, combinatorics (`factorial` up to 170!, `permutation`, `combination` via symmetric identity), DMS (`degToDms`, `dmsToDeg`, `formatDms` for `12°30'58.50"` surveyor notation), and display formatting (`formatNorm`, `formatFix`, `formatSci`, `formatEng` with Unicode superscript exponents). **Precision deviation from plan**: the plan specified `decimal.js` at 25-digit precision; that dependency isn't installed and adding it touches the lockfile. Native `Number` gives ~15-17 SF which exceeds the plan's stated ≥10 SF requirement. A header comment documents the choice and the migration path (swap the `Num` type alias → Decimal class, every function passes-through). **43/43 vitest cases pass**, covering each primitive plus surveying-flavored cross-checks (bearing addition via DMS, sin(a)=cos(90−a) complementarity). Typecheck clean. |
| **C-5** | `/api/admin/calculator-state` route (GET, PUT). Per-user-per-model JSONB. Save debouncer in the modal context. | 2 hours |
| **V-1** | **Verification checkpoint** — confirm: modal opens/closes; drag works; tab strip switches without remount-erasing memory; state round-trips through the API. | 30 min |

### Phase 2 — TI-36X Pro (5 slices, ~1.5 days)

Simplest algebraic model to ship first.

| Slice | Description | Estimate |
|---|---|---|
| **C-6** | TI-36X Pro visual shell: keypad layout via CSS grid (5 cols × 9 rows), exact button labels + colors (light grey, navy, red shift/2nd indicators). MathPrint multi-line display container. | 5 hours |
| **C-7** | TI-36X Pro algebraic input parser: build the entry buffer, render it, evaluate on `ENTER`. Shunting-yard for operator precedence. | 5 hours |
| **C-8** | TI-36X Pro memory + history: K-MEMRY recall keys, 7-line scrollable history. | 2 hours |
| **C-9** | TI-36X Pro state serialize/hydrate hooked to `/api/admin/calculator-state`. | 1 hour |
| **C-10** | TI-36X Pro: surveying-specific functions (DMS↔Deg, polar↔rectangular, `→DMS`). | 3 hours |
| **V-2** | **Verification checkpoint** — work the published TI-36X-Pro guidebook surveying examples through the modal; confirm answers match. | 1 hour |

### Phase 3 — Casio fx-991ES PLUS (4 slices, ~1.5 days)

Natural-display rendering is the hard part.

| Slice | Description | Estimate |
|---|---|---|
| **C-11** | Casio fx-991 visual shell: 5×8 keypad, two-line natural-display container. SHIFT/ALPHA prefix indicators. | 5 hours |
| **C-12** | Natural-display renderer: handle the multi-layout entry (fractions stack vertically, √ has a vinculum, exponents superscript). React component tree built from a parsed AST of the entry buffer. | 6 hours |
| **C-13** | Casio fx-991 engine: same algebraic primitives as TI but Casio's parsing rules (e.g. implicit multiplication after `√`). Plus mode keys (`COMP`/`STAT`/`TABLE`). | 4 hours |
| **C-14** | Casio fx-991 state serialize/hydrate. | 1 hour |
| **V-3** | **Verification checkpoint** — natural-display screenshots side-by-side with real device for the surveying CRM / level-loop / coordinate-geometry examples. | 1 hour |

### Phase 4 — HP 35s (4 slices, ~1.5 days)

RPN engine is a paradigm shift; calls for its own slice family.

| Slice | Description | Estimate |
|---|---|---|
| **C-15** | HP 35s visual shell: long, narrow body; 6-row × 7-col keypad; orange + blue shift labels; 2-row dot-matrix display container. | 5 hours |
| **C-16** | HP 35s RPN stack machine: X / Y / Z / T registers, ENTER (stack lift), LastX, ROLL DOWN, SWAP. Algebraic-mode toggle (HP 35s supports both). | 6 hours |
| **C-17** | HP 35s shifts + functions: blue/orange shift state, full set of f(x) keys (HYP, →RAD, →DEG, COMPLEX, etc.). | 3 hours |
| **C-18** | HP 35s state serialize/hydrate + register save. | 1 hour |
| **V-4** | **Verification checkpoint** — run a published RPN surveying example (vertical-curve elevations) end-to-end. Verify stack content at each step. | 1 hour |

### Phase 5 — Sibling models + integrations (4 slices, ~1.5 days)

| Slice | Description | Estimate |
|---|---|---|
| **C-19** | Casio fx-115 — re-skin of fx-991 keypad with the 115-specific button placements (one row reordered, ABS in a different cell). Shared engine. | 2 hours |
| **C-20** | HP 33s — re-skin of HP 35s with the single-line display + 33s-specific functions (no COMPLEX key, no →RAD/→DEG indicator). Shared engine. | 3 hours |
| **C-21** | TI-30X variants — re-skin of TI-36X. `TI-30XS MultiView` and `TI-30X IIS` get specific layouts (the IIS is simpler; the MultiView matches Pro more closely). | 3 hours |
| **C-22** | `<CalculatorTriggerButton>` + learning-platform integration: pill on every `/admin/learn/exam-prep/*` page; `onCopy` callback wired for quiz answer fields. | 3 hours |
| **V-5** | **Verification checkpoint** — open one calculator from a quiz, copy the result, paste into the answer field. Switch tabs, confirm state survives. | 30 min |

### Phase 6 — Polish + completion (2 slices + checkpoint, ~half day)

| Slice | Description | Estimate |
|---|---|---|
| **C-23** | Mobile + touch optimization: keypad fits under 400px wide; touch hit-areas; pinch-to-zoom inside the modal. | 3 hours |
| **C-24** | Keyboard accelerators: digit keys, basic operators, ENTER, ESC closes modal, ←/→ swap tab. Focus visibility. | 2 hours |
| **V-6** | **Final verification checkpoint** — full sweep of the published practice exam booklet using each calculator. Diff answers vs the booklet's solutions. | 2 hours |
| **C-25** | Move this plan to `docs/planning/completed/`. Final commit. | 5 min |

---

## 5. How to apply new SQL seeds

Same as the prior overhauls — see `docs/planning/completed/PAY_PROGRESSION_OVERHAUL.md` §5 for the apply procedure. Seeds in this plan: `288_user_calculator_state.sql` (C-1).

---

## 6. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Behavioral fidelity gap — a user reports "the real calculator does X here, yours doesn't" | High | Set expectation up front (this plan §0); track diff reports against the booklet during V-2/V-3/V-4; if a question's answer differs, fix the engine, don't change exam expectations. |
| Precision drift in trig over RAD↔DEG mode | Medium | `decimal.js` 25-digit math; explicit mode tracking on every function call. |
| Modal drag breaks on mobile | Medium | Pointer events (not mouse); guard with `touch-action: none` on the header; fallback to viewport-center-locked mode at width < 480px. |
| RPN stack confuses users who've only used algebraic | Low | The user opted in by choosing the HP tab. Add a brief inline `(?)` hint near the ENTER key on first open. |
| Engine re-implementation is its own multi-week project per model | Medium | Phase the work — Phase 2 ships one model usable; Phases 3-5 add the others incrementally. Each model is committable and demoable in isolation. |
| Save state corruption (e.g. an enum value renamed across versions) | Low | `state` JSONB has a `schema_version: 1` field; engine `hydrate(json)` migrates old shapes. |

---

## 7. Open questions

- Should the modal be admin-only or available to any authenticated user? The learning platform is admin-gated today; the modal can match. Probably yes — answer in C-3.
- Do we want a "guest mode" where the modal works without saving state (for shared kiosks)? Skip for v1; save is auto on any signed-in user.
- For TI-30X variants, do we ship every variant (IIS, MultiView, Pro MathPrint, XS) or just one? The user said "any TI-30X model" is permitted; the prudent answer is one variant per family (MultiView is the most-likely-encountered in exam prep) plus a settings toggle for layout differences. Confirm before Phase 5.
- For surveying-specific shortcuts like `→DMS` and station/offset entry — should we add a "surveying mode" overlay on top of each calculator, or do we faithfully implement only the buttons that physically exist on each device? Faithful-only avoids confusion on exam day. Confirm before Phase 2.

Resolve before Phase 2 ships.

---

## 8. Implementation notes

- Use design tokens (`app/styles/tokens.css`). No new `#hex` literals in new code.
- Keypad layouts as data: each model exports a `KEYPAD: KeyDef[]` array; the renderer is generic. This makes adding sibling models a near-trivial reskin (Phase 5).
- All engines pure: state in → state out. The React layer is render-only.
- Vitest for engine tests. Each model gets a `*.engine.test.ts` exercising the published-guidebook examples.
- No `eval()`. Build the parser explicitly.
- Modal mount-point: a portal at the document body so z-index works regardless of where the trigger lives.
- Persist position to `localStorage.calculatorModalPos`; persist last-opened model to `localStorage.calculatorLastModel`.
- The `<CalculatorTriggerButton>` component lives in `app/admin/components/` so it can be imported from anywhere under `/admin/`.
