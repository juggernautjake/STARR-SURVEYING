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

### Slice 4 — Dashboard: live Jobs tile + honest Finances copy ✅ shipped (hours/PTO deferred)
- [x] Replace the misleading "coming soon" notes and `--` placeholders on the dashboard Jobs and Finances cards.
  - **Done — Jobs card:** now fetches `/api/admin/jobs` (admins) or `/api/admin/jobs?my_jobs=true` (others) with `limit=500` and shows a live **Active Jobs** count (stages other than completed/cancelled/on_hold), with loading / zero / N-in-progress empty states. Removed the false "Job tracking coming soon" note.
  - **Done — Finances card:** both `/admin/payroll` and `/admin/my-pay` are fully shipped, so the "Payroll tracking coming soon" note was simply wrong. Replaced the fake `--` Hours/PTO metrics with accurate role-aware copy and kept the View Finances link. Also removed a now-dead `role` local + a stale `useCallback` dep (lint clean).
  - **Verified:** `tsc` + `eslint` clean. Render is code-verified only — the dashboard is auth-gated and not reachable from the unauthenticated `/cad-harness`, so it can't be screenshotted in this environment.
- ~~Live "Hours This Week / This Period" and "PTO Balance" tiles~~ — deferred: the values come from the pay-computation route (`/api/admin/time-logs`, monetary `payroll/balance`) which needs careful week/period bucketing and a PTO source that isn't a simple field; shipping unverified numbers (no auth path in the harness) risks misleading payroll figures. Revisit with a dedicated dashboard-summary endpoint + a seeded-auth E2E path.

### Slice 5 — CAD: ElementExplanationPopup chat placeholder ✅ shipped (false positive)
- [x] Investigate the "Chat (coming soon)" affordance.
  - **Audit result:** false positive — the chat is fully implemented. `ChatPanel` is wired to `useAIStore.sendChatMessage` / `executeChatAction` with quick actions (Update This Element / Redraw This Group / Redraw Full Drawing) and per-message Apply buttons. Only the file's header comment was stale ("…land in the next slice … Chat (coming soon) placeholder").
  - **Done:** corrected the header comment to describe the shipped chat section. No functional change; `tsc` already exercises the live wiring.

### Slice 6 — Research: ExportPanel "Coming Soon" format ✅ shipped (false positive + real mime fix)
- [x] Investigate the disabled export format.
  - **Audit result:** every `FORMAT_OPTIONS` entry (svg / json / png / pdf / dxf) is `available: true`, so the `{!opt.available && <span>Coming Soon</span>}` badge never renders — no misleading teaser is shown. The server route fully implements all five (`renderToPng/renderToPdf/renderToDxf` + svg/json) so `available: true` is truthful. The `available` flag is kept as a reasonable forward guard.
  - **Real fix found + shipped:** the client download map in `handleExportDrawing` (research project page) omitted the `dxf` mime, so DXF downloads fell back to `application/octet-stream`. Added `dxf: 'image/vnd.dxf'` (IANA-registered) so the blob carries the correct content type. `tsc` + `eslint` clean.

### Slice 7 — Learn: exam-prep empty states ✅ shipped
- [x] RPLS "Coming Soon" card and SIT "Content coming soon" — make these honest, non-dead-end states.
  - **Done — RPLS card:** was an inert `<div>` with a non-clickable "Coming Soon" arrow. Dedicated RPLS prep genuinely isn't built (large feature, correctly not faked), so the card is now a `<Link>` to the available FS curriculum (`/admin/learn/exam-prep/sit`) with a "Start with FS Prep →" CTA and copy that sets expectations honestly. No longer a dead-end.
  - **SIT "Content coming soon":** left as-is — it's a legitimate data-driven section empty state inside a fully-navigable module page (back link, topics, quiz), not a trap. Honest messaging already present.
  - **Verified:** `tsc` + `eslint` clean. Auth-gated pages, so render is code-verified only.

---

## Continuous-improvement backlog (appended as the sweep continues)

> Once the slices above are shipped, keep auditing and appending new slices here (build quality, a11y, error states, loading states, empty states, dead code, console noise, etc.). The Stop-hook loop keeps this doc active until it's moved to `completed/`.
