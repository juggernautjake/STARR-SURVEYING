# Backend Audit & Continuous Improvements — 2026-05-27

> **Status:** live working doc. Each `### Slice` is a shippable unit: build → typecheck + lint → (harness/Playwright + screenshot verify where possible) → commit + push → annotate with a completion note. When every item in the doc is shipped or explicitly deferred, move it to `docs/planning/completed/` per `docs/planning/README.md`. This doc is intentionally open-ended: new improvement slices get appended as the audit continues.
>
> **Scope:** a sweep of every page under `app/admin/**` (the "backend") plus their API routes and shared components, hunting for placeholders ("coming soon" / "not implemented"), broken or stubbed UX, and concrete polish/build/fix opportunities.
>
> **Testing method:** CAD-shell work is verified through the unauthenticated `/cad-harness` route with Playwright (`playwright.harness.config.ts`) + screenshots that are visually inspected (OCR). Auth-gated admin pages are verified by code-reading + typecheck/lint until a seeded auth path exists; where a slice can be exercised through an API route, that's preferred.

---

## Audit findings — raw inventory (placeholders / stubs / unfinished)

These are the concrete "this isn't done yet" markers found in `app/admin/**`:

1. `cad/components/PrintDialog.tsx:199,205` — **Export PDF / Export PNG** buttons just `window.alert('… coming soon')`. Real export libs (`jspdf`, `pdfkit`) are already in `package.json`; the Pixi renderer (`pixiRef.current.app.renderer`) supports `extract`.
2. `cad/components/ElementExplanationPopup.tsx` — "Chat (coming soon)" placeholder block.
3. `cad/components/CalcPointDialog.tsx:106` — falls back to a bare `'Method not implemented.'` error; the message is unhelpful for the wired methods and there's no guard explaining which methods are live.
4. `dashboard/page.tsx:240,282` — "Job tracking coming soon" / "Payroll tracking coming soon" empty notes with hard-coded `--` metrics, even though jobs/payroll APIs exist.
5. `research/components/ExportPanel.tsx:168` — a format with a "Coming Soon" badge (disabled export option).
6. `learn/exam-prep/page.tsx:79,84` — RPLS exam card "Coming Soon".
7. `learn/exam-prep/sit/module/[id]/page.tsx:255` — "Content coming soon" empty state for modules with no lessons.
8. `messaging/UnderConstruction.tsx` — a generic Under-Construction component; audit where it's still mounted.

(More will be appended as the sweep continues — equipment, payroll, research pipeline, learn manage, etc.)

---

## Slices

### Slice 1 — CAD: real PNG export from Print dialog ✅ shipped
- [x] Replace the `window.alert('PNG export coming soon')` with a working PNG export: render the current drawing via the Pixi renderer's `extract` plugin and download a `.png`. Wire through a `cad:exportImage` window event (matches the existing `cad:*` event pattern the canvas already listens for) so `PrintDialog` stays presentation-only.
  - **Done:** `PrintDialog` now dispatches `cad:exportImage { format:'png', paperSize, orientation }` and closes. `CanvasViewport` registers an `onExportImage` listener (with matching cleanup) that calls `pixi.app.render()` then `renderer.extract.canvas(stage).toDataURL('image/png')` and triggers an `<a download>`; emits a `cad:commandOutput` toast. The handler is format-agnostic (PDF branch already present for Slice 2).
  - **Verified:** new harness spec `e2e/harness/export-png.spec.ts` opens the dialog on `/cad-harness`, clicks Export PNG, and asserts a real PNG download (header `0x89504E47`, 144 KB). Screenshot `test-results/audit/print-dialog-open.png` visually confirms the dialog + sheet render. `tsc` + `eslint` clean.

### Slice 2 — CAD: real PDF export from Print dialog ✅ shipped
- [x] Replace the `window.alert('PDF export coming soon')` with a working PDF export using `jspdf`.
  - **Done:** the Export PDF button now dispatches `cad:exportImage { format:'pdf', … }`; the shared `onExportImage` handler dynamically imports `jspdf`, sizes the page to the extracted image (orientation honored), `addImage`s the PNG, and saves a `.pdf`.
  - **Verified:** `e2e/harness/export-pdf.spec.ts` asserts a `%PDF-` download. `tsc` + `eslint` clean.
  - **Follow-up (noted, not blocking):** the embedded raster is full device-resolution so the PDF is large (~11 MB). A later slice can downscale / JPEG-compress the image for smaller files.

### Slice 3 — CAD: CalcPointDialog error clarity ✅ shipped
- [x] Audit the calc-point method switch; ensure every selectable method maps to a solver, and replace the generic `'Method not implemented.'`.
  - **Audit result:** the `<select>` exposes exactly the 4 `Method` union members and the `compute()` chain handles all 4 — so `'Method not implemented.'` was unreachable dead code.
  - **Done:** replaced the trailing branch with a `const unhandled: never = method` exhaustiveness guard (compile-time safety if a 5th method is ever added to the union without a branch) and changed the post-switch null guard to a precise, actionable message. `tsc` + `eslint` clean.

### Slice 4 — Dashboard: live Jobs + Payroll summary tiles
- [ ] Replace the `--` placeholders and "coming soon" notes on the dashboard Jobs and Finances cards with real counts pulled from existing APIs (active jobs, hours this week / period, PTO balance). Keep graceful empty states when the user has no data. Verify rendering for an admin and a field-crew role.

### Slice 5 — CAD: ElementExplanationPopup chat placeholder
- [ ] Either wire the "Chat (coming soon)" affordance to the existing AI proposal/chat store or cleanly remove the dead placeholder so the popup isn't advertising a non-feature. Decide based on what the AI store already supports.

### Slice 6 — Research: ExportPanel "Coming Soon" format
- [ ] Investigate the disabled export format; implement it if the underlying writer exists (`lib/cad/delivery/*`), otherwise remove the teaser so the panel only shows working options.

### Slice 7 — Learn: exam-prep empty states
- [ ] RPLS "Coming Soon" card and SIT "Content coming soon" — make these honest, non-dead-end states (clear messaging + a link to available content) rather than inert teasers.

---

## Continuous-improvement backlog (appended as the sweep continues)

> Once the slices above are shipped, keep auditing and appending new slices here (build quality, a11y, error states, loading states, empty states, dead code, console noise, etc.). The Stop-hook loop keeps this doc active until it's moved to `completed/`.
