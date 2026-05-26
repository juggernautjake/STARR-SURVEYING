# CAD Standalone Window & UX Audit — Self-Updating Master Plan

Status: **in progress** · Owner: CAD/UX · Started: 2026-05-26 09:0x CDT
Time-box: **stop at 12:30 PM CDT, 2026-05-26.**

---

## 0. How to use this document (READ FIRST, EVERY RESUME)

This is a **self-updating audit loop**. The Stop hook
(`.claude/hooks/continue-until-planning-done.sh`) keeps the session
running as long as this file sits in `docs/planning/in-progress/`. That
means **moving this file to `completed/` is the only clean way to stop.**

### 0.1 On EVERY resume, do these in order

1. **Check the clock**: run `TZ="America/Chicago" date "+%H:%M"`.
   - **If it is 12:30 PM CDT or later** → go to §7 "Finalization" and
     STOP. Do not start a new audit slice.
   - Otherwise continue.
2. Read the **Audit Log (§6)** bottom entry to see where the last slice
   stopped and what is next.
3. Read the **Audit Backlog (§5)**. Pick the **single highest-priority
   open `[ ]` target** (top-down order is the priority order).
4. Run **one full audit cycle (§3)** on that one target. Keep the slice
   small — one target, one commit.
5. Append a dated entry to the Audit Log (§6) describing what changed,
   what was verified, and what to do next. Re-order/refine the backlog
   if the audit surfaced new issues (this is the "self-updating" part —
   add newly-discovered targets as `[ ]` items).
6. Commit + push. The hook will resume the loop.

### 0.2 The prime directives

- **Never** leave the tree broken: `tsc --noEmit` + `next lint` on
  touched files must pass before every commit.
- **Verify before claiming done.** Prefer live verification (§4). If a
  target genuinely can't be verified live, say so in the log and fall
  back to unit/component tests.
- **Small slices.** One audit target per loop. Don't batch unrelated
  fixes into one commit.
- **Self-update the backlog.** Auditing one area always reveals more;
  add those as new `[ ]` targets rather than fixing everything at once.
- Don't gold-plate. Fix real issues (broken, unresizable, cluttered,
  inconsistent). Skip cosmetic nitpicks that don't help the surveyor.

---

## 1. Vision

Make Starr CAD feel and behave like a **standalone desktop application**,
not a page embedded in the admin web app. Then **audit every surface** of
the CAD editor for formatting, utility, and correctness issues, fixing
them one at a time with live verification.

Success criteria:
- CAD opens in a **true full-screen, chrome-free window** (no admin nav
  bleeding in; an in-app Fullscreen toggle; correct title).
- **Every panel that should be resizable, is** — left tool rail, layer
  panel, right property/traverse/image dock, bottom point table — via
  draggable splitters with sensible min/max and persisted sizes.
- **Menus and dropdowns are consolidated** — long menus grouped into
  logical submenus; redundant entries removed; everything reachable and
  not overwhelming.
- **Every tool, menu item, panel, and context menu actually works** and
  is verified.

---

## 2. Verification harness (built in Slice 1)

The CAD route (`/admin/cad`) is auth-gated by `middleware.ts`, and this
environment has no admin credentials. But the CAD editor is a
client-side app (Zustand + IndexedDB), so it renders without the
backend. Verification strategy:

- **Env-gated harness route** outside `/admin` (so middleware ignores
  it), rendering `CADLayout`, active only when
  `NEXT_PUBLIC_E2E_HARNESS=1`. Returns 404 otherwise — zero production
  exposure.
- **`next dev` server** booted in the background on a known port.
- **Playwright** (chromium is installed at `/opt/pw-browsers`) drives the
  harness, exercises the target, and captures **screenshots**.
- **Visual OCR = read the screenshot.** Screenshots are saved to
  `test-results/audit/` and read back with the Read tool for a direct
  visual assessment of layout/formatting (more reliable than tesseract
  on canvas pixels). DOM-text assertions cover the deterministic parts.

If the dev server or harness can't boot in a given slice, fall back to
component/unit tests and note the limitation in the log.

---

## 3. The audit cycle (run once per slice, on ONE target)

For the chosen backlog target:

1. **Inspect** — read the relevant component(s) and current behavior.
2. **Diagnose** — list concrete issues: broken, unresizable, cluttered,
   inconsistent, mis-formatted, non-functional. Be specific.
3. **Fix** — implement the smallest change that resolves the issues.
4. **Verify**:
   - `tsc --noEmit` + lint clean.
   - Relevant vitest/component tests green (add tests when logic changed).
   - **Live**: boot harness, screenshot the target, read the screenshot,
     confirm the fix looks/behaves right; check for regressions in
     neighboring UI.
5. **Refine** — if verification shows it's not right, iterate. If good,
   move on.
6. **Record** — Audit Log entry + backlog update + commit + push.

---

## 4. Live-verification quick commands

```bash
# Boot dev server with the harness flag (background):
NEXT_PUBLIC_E2E_HARNESS=1 npm run dev   # run_in_background

# Drive a target + screenshot (Playwright, harness config):
npx playwright test --config=playwright.harness.config.ts <spec>

# Then Read test-results/audit/<name>.png to assess visually.
```

---

## 5. Audit Backlog (priority order — top is next)

Legend: `[ ]` open · `[x]` shipped+verified · `[~]` partial/deferred
(with inline reason).

### Infrastructure
- [ ] **Slice 1 — Verification harness**: env-gated `/cad-harness`
  route, `playwright.harness.config.ts` with a `webServer`, one audit
  spec that screenshots the CAD shell; confirm chromium renders it.

### Standalone window
- [ ] **Standalone full-screen shell**: ensure no admin chrome leaks
  into `/admin/cad`; add an in-app **Fullscreen toggle** (Fullscreen
  API) + a "pop out to standalone window" affordance; verify the editor
  fills the viewport with correct title.

### Resizable panels (the headline complaint)
- [ ] **Left tool rail** (`width:52`, fixed) — keep icon rail fixed but
  audit overflow on short viewports.
- [ ] **Layer panel** (`w-48`, fixed) — add a draggable vertical
  splitter, min/max width, persisted size.
- [ ] **Right dock** (property/traverse/image, `w-48`, fixed) — draggable
  splitter, persisted size; ensure the three panels stack/scroll well.
- [ ] **Bottom point table** (`h-48`, fixed) — draggable horizontal
  splitter, persisted height.
- [ ] **Reusable `<ResizableSplitter>`** primitive so all of the above
  share one tested implementation (keyboard-accessible, min/max,
  localStorage persistence).

### Menu / dropdown consolidation
- [ ] **MenuBar audit** — group long menus into logical submenus, remove
  redundant entries, ensure consistent labeling (drop emoji noise or use
  consistently), verify every action fires.
- [ ] **Context menus** (`FeatureContextMenu`, `PickModeContextMenu`) —
  consistency, no-vanish-on-mouse-off behavior, every entry works.

### Per-surface functional audit (expand as discovered)
- [ ] **ToolBar** — every tool button activates the right tool; tooltips
  correct; active state visible.
- [ ] **ToolOptionsBar** — options reflect the active tool.
- [ ] **LayerPanel** — add/rename/delete/visibility/lock all work.
- [ ] **PropertyPanel** — edits apply to selection; geometry fields work.
- [ ] **StatusBar / CommandBar** — coordinate readout, command input.
- [ ] **Dialogs sweep** — each dialog in `CADLayout` opens, is usable,
  closes cleanly (sample, don't exhaustively grind).

---

## 6. Audit Log (append-only; newest at bottom)

- 2026-05-26 09:0x CDT — Plan created. Confirmed: Stop-hook loop drives
  iteration; chromium installed (`/opt/pw-browsers`), network works;
  `/admin/cad` is auth-gated (no creds) → will use an env-gated harness
  route for live verification. Next: Slice 1 (verification harness).

---

## 7. Finalization (when clock ≥ 12:30 PM CDT)

1. Make sure the tree is in a working state: `tsc --noEmit` clean, lint
   clean on touched files, vitest CAD suites green.
2. Ensure every open `[ ]` backlog item left unfinished has a one-line
   status/deferral note inline.
3. Flip the Status line (§top) to **completed** and add a final Audit
   Log entry summarizing what shipped and what remains.
4. `git mv docs/planning/in-progress/cad-standalone-and-ux-audit.md
   docs/planning/completed/` (update any `// Spec:` refs or cross-links
   first — `grep -rln` the path).
5. Commit + push. The in-progress folder empties and the hook routes to
   the QA phase (or stops). **Do not start new audit slices after
   12:30 PM.**
