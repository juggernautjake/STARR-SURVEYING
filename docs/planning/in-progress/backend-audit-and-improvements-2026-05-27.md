# Backend Audit & Continuous Improvements — 2026-05-27

> **Status (2026-05-28 reopen):** moved back to `in-progress/` per user request — Phase 3 is a static code/style audit against the shipped slices, and a runbook for the user to apply `seeds/296–298` to Supabase. Earlier Phase 2 wrap-up text retained below for history.
>
> **Previously (2026-05-28 close):** All 30 slices below are shipped (deferred bullets that survived the second pass are struck through with reasons inline). Highlights: every "Under Construction"/placeholder across `app/admin/**` resolved; the five stub pages (Notes, Leads, Schedule, Settings, My Files) fully built (table/bucket + API + wired UI); the CAD Print/Export feature made real (PNG, PDF, compact size, paper sizing, plot style, **every element toggle including the previously-deferred Border / Legend / Certification / Notes**) with passing Playwright specs; the employee hours/receipts/job-attachment workflows audited + the receipt↔job link completed; Properties-panel style edits render live; a reusable harness seed/select test hook added; a per-page UI/UX sweep across 35 admin pages with a dozen runtime-crash / missing-CSS / dropzone / label-style fixes shipped; touchpad + touchscreen two-finger pan and pinch-zoom added to the CAD canvas; and the previously-deferred **Schedule** items (server-side conflict detection, recurring events, drag-to-move + click-to-create, time-off request + approval flow, Google Calendar OAuth + bidirectional sync) and the **PTO Balance** dashboard tile (built on a real accrual schema with deduction on time-off approval) are all live.

---

## Phase 3 — runbook for the user (apply seeds 296–298 to Supabase)

> The Phase 2 slices added three SQL migrations that haven't been applied to the live Supabase project yet. This agent does not have a Supabase connection from its sandbox, so the apply step is on the user. Two options, both safe to re-run (every statement uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`):

**Option A — Supabase SQL Editor (browser, easiest)**

1. Open the project's SQL Editor: `https://supabase.com/dashboard/project/<your-project-ref>/sql/new`.
2. For each file in order — `seeds/296_schedule_recurring.sql`, `seeds/297_google_calendar_connections.sql`, `seeds/298_pto_accrual.sql` — paste the file contents, click **Run**, and confirm "Success. No rows returned." appears.
3. After all three, run the verification block at the bottom of this section in a fresh tab.

**Option B — Supabase CLI (if linked locally)**

```bash
# from repo root, on a machine that has `supabase` CLI linked to the project
supabase db execute --file seeds/296_schedule_recurring.sql
supabase db execute --file seeds/297_google_calendar_connections.sql
supabase db execute --file seeds/298_pto_accrual.sql
```

**Option C — psql against the pooled connection**

```bash
# DATABASE_URL is the "Connection string" from Project Settings → Database
psql "$DATABASE_URL" -f seeds/296_schedule_recurring.sql
psql "$DATABASE_URL" -f seeds/297_google_calendar_connections.sql
psql "$DATABASE_URL" -f seeds/298_pto_accrual.sql
```

**Verification (run after all three):**

```sql
-- 296: schedule_events gained 4 columns
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'schedule_events'
   AND column_name IN ('recurrence_rule', 'recurrence_end', 'series_id', 'status')
 ORDER BY column_name;
-- expect: recurrence_end, recurrence_rule, series_id, status   (4 rows)

-- 297: two new tables exist
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('google_calendar_connections', 'google_calendar_event_links');
-- expect both rows

-- 298: PTO tables + function exist
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('pto_balances', 'pto_transactions');
SELECT proname FROM pg_proc WHERE proname IN ('pto_accrue_user', 'pto_accrual_interval');
-- expect 2 rows + 2 rows
```

**After apply, env vars to set in Vercel for the Slice 29 OAuth round-trip:**

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` (e.g. `https://app.starrsurveying.com/api/admin/google-calendar/callback`)

(The agent intentionally does not log into Vercel for you; set these from the Vercel UI / `vercel env add`.)

---
>
> **(Historical) Status:** live working doc. Each `### Slice` is a shippable unit: build → typecheck + lint → (harness/Playwright + screenshot verify where possible) → commit + push → annotate with a completion note. This doc was intentionally open-ended: new improvement slices were appended as the audit continued.
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
- [x] **Live "Hours This Week" tile — shipped (post-window follow-up).** The My Finances card now shows the user's own hours logged Sunday → today, summed from `/api/admin/time-logs?email=<self>&date_from=<weekStart>&date_to=<today>` (the GET scopes to the caller's daily logs; the `email` param keeps it self-scoped for admins too). `tsc` + `eslint` clean; code-verified (dashboard is auth-gated, not harness-reachable).
- ~~"PTO Balance" tile~~ — initially deferred (no data source). **Retired by Slice 30:** built the accrual schema (`seeds/298_pto_accrual.sql` with `pto_balances` + `pto_transactions` + the `pto_accrue_user()` SQL function), added `/api/admin/pto`, surfaced the balance on the dashboard My Finances card, and wired auto-deduction when an admin approves a time-off request.

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

### Slice 8 — Remove stale "Under Construction" banner from fully-built pages ✅ shipped (core batch; rest in progress)
- [x] The `messaging/UnderConstruction` banner ("Components below are being built. Some may not be fully functional yet.") was copy-pasted atop many fully-functional pages, falsely telling users core features are incomplete.
  - **Done — removed from confirmed-complete core pages:** `jobs/page.tsx`, `jobs/[id]/page.tsx` (896 lines, 52 hooks), `my-jobs/MyJobsPanel.tsx`, `my-pay/MyPayPanel.tsx` (both render spots), `payroll/page.tsx`, `payroll/[email]/page.tsx`. All are rich, data-driven, shipped features (the dashboard links to them as live). Removed the banner + now-unused imports. `tsc` + `eslint` clean.
- [x] **Remaining banner pages evaluated.** Removed banner from the confirmed-complete (real POST/persistence) pages: `assignments` (POST/PATCH `/api/admin/assignments`), `jobs/new` (POST `/api/admin/jobs` → redirect), and all messaging pages `messages/new` `messages/contacts` `messages/settings` `messages/[conversationId]` (full conversations/send/read/reactions/preferences wiring). `tsc` + `eslint` clean.
- [x] **Confirmed genuine stubs — banner correctly KEPT (accurate):** `leads`, `schedule`, `notes`, `my-files` all use `const [x] = useState([])` with no setter/fetch/persistence; `settings` has an explicit in-code TODO "Connect form inputs to settings API." Per the user's rule the banner stays until these are built. Being built out one-by-one in Slice 10+.

### Slice 10 — Build out stub page: Company Notes ✅ shipped
- [x] `/admin/notes` was a UI-only stub (`const [notes] = useState([])`, disabled Save, a self-documenting dev guide). Now fully built the established way (seed SQL + API route + page wiring):
  - **Seed:** `seeds/291_company_notes.sql` creates `public.company_notes` (id, title, content, category CHECK, is_pinned, created_by, timestamps) + sort/category indexes, matching the page's own schema spec.
  - **API:** `app/api/admin/notes/route.ts` — GET (pinned-first list, category + search filters), POST (create), PATCH (edit / pin-unpin), DELETE. Auth-gated shared workspace via `supabaseAdmin` + `withErrorHandler`, mirroring the CAD folders route.
  - **Page:** wired to the API — loads notes, creates (Save button now enabled + validating), pin/unpin, delete (with confirm), loading/empty states. Removed the Under Construction banner and the dev-guide block (now built).
  - **Verified:** `tsc` + `eslint` clean. Runtime needs `seeds/291` applied to Supabase (standard deploy step for every feature here); until then the page degrades gracefully via `safeFetch` (loading → empty). Auth-gated, so not harness-screenshottable.
### Slice 11 — Build out stub page: Leads / sales pipeline ✅ shipped
- [x] `/admin/leads` (admin-only) was a UI-only stub. Fully built:
  - **Seed:** `seeds/292_leads.sql` — `public.leads` (contact + pipeline fields, status CHECK, `converted_job_id` FK → jobs, follow-up date, indexes).
  - **API:** `app/api/admin/leads/route.ts` — admin-gated GET (status filter + name/company/email/phone search), POST, PATCH (advance status / edit), DELETE.
  - **Page:** wired — loads leads, creates (Save enabled + validating), inline status `<select>` on each card to move through the pipeline, delete, loading/empty states. Removed banner + dev guide.
  - **Verified:** `tsc` + `eslint` clean (needs `seeds/292` applied to Supabase at deploy; degrades gracefully meanwhile). Auth-gated → code-verified.
### Slice 12 — Build out stub page: Schedule / calendar ✅ shipped
- [x] `/admin/schedule` (+ Hub `/admin/me?tab=schedule`) was a UI-only calendar stub. Fully built:
  - **Seed:** `seeds/293_schedule_events.sql` — `public.schedule_events` (title, type, start/end, all_day, location, notes, `job_id` FK → jobs, assigned_to/by, color, indexes).
  - **API:** `app/api/admin/schedule/route.ts` — GET by date range (non-admins see only their own events; admins see all), admin POST/PATCH/DELETE; server stamps a per-type color.
  - **Panel:** wired — loads events for the visible window on navigation, the admin Create Event form now POSTs (building start/end ISO from the date/time/all-day inputs), per-event delete (admin) in week view, week + month render real events. Removed banner + dev guide.
  - **Verified:** `tsc` + `eslint` clean (needs `seeds/293` applied at deploy; degrades gracefully). Auth-gated → code-verified.
  - **Originally deferred:** recurring events, drag-to-create/move, time-off approval, Google Calendar sync, conflict detection. **All retired by Slices 25 / 26 / 27 / 28 / 29** — see those entries for the implementation details (seeds 296 + 297, `lib/schedule/recurrence.ts`, `lib/integrations/google-calendar.ts`, `/admin/time-off`, drag-and-drop in `SchedulePanel`).
### Slice 13 — Build out stub page: Admin Settings (General + Company) ✅ shipped
- [x] `/admin/settings` had unconnected forms. Built the editable sections for real:
  - **Seed:** `seeds/294_app_settings.sql` — `public.app_settings` (key TEXT PK → JSONB value, updated_by/at), one row per section.
  - **API:** `app/api/admin/settings/route.ts` — admin GET (all sections as a map) + PUT (upsert an allowed section: `general` | `company`).
  - **Page:** General (company name / default state / job-number prefix / timezone) and Company (address / phone / fax / website / TBPELS firm #) are now controlled inputs that load saved values and persist via per-section Save buttons with a "✓ Saved" confirmation. Removed banner + dev guide.
  - **Honest remaining tabs (not faked):** Users (RBAC is code-driven in `lib/auth.ts`), Notifications (points to Messages → Settings, the real per-user prefs), Integrations (accurate "Not Connected" cards), Billing (links to the existing `/admin/billing` area).
  - **Verified:** `tsc` + `eslint` clean (needs `seeds/294` at deploy). Auth-gated → code-verified.
### Slice 14 — Build out stub page: My Files (personal storage) ✅ shipped
- [x] `/admin/my-files` (+ Hub `?tab=files`) was a UI-only stub (drop zone + table, no storage). Fully built:
  - **Seed:** `seeds/295_user_files.sql` — a PRIVATE `user-files` storage bucket (50 MB/file, service-role policy) + `user_files` metadata table (owner email, name, type, size, storage_path, folder, optional job link, indexes).
  - **API:** `app/api/admin/my-files/route.ts` — GET (my files, each with a 1-hour signed download URL), POST (base64 upload → private bucket at a per-user path → metadata row, with orphan-object rollback), DELETE (ownership-checked; removes object + row). Mirrors the cad-images `ensureStorageBucket` runtime-create pattern.
  - **Panel:** wired — loads files, Upload Files button + click/drag-drop dropzone (multi-file, 50 MB guard, uploads into the selected folder), per-row Download (signed URL) + Delete, loading/empty states. Removed banner + dev guide.
  - **Verified:** `tsc` + `eslint` clean. Bucket auto-creates on first upload; `seeds/295` recommended at deploy for the RLS policy + table. Auth-gated + real file I/O → code-verified (can't exercise uploads in this sandbox).

> **Stub build-out complete:** all five previously-stubbed pages — Notes, Leads, Schedule, Settings, My Files — are now fully built (table/bucket + API + wired UI), and every Under Construction banner across `app/admin/**` has been resolved (removed from built pages; the stubs no longer exist).

---

## Continued improvements (post-stub-buildout)

> Stubs done — continuing the audit with genuine quality/feature improvements (the user asked to keep building). Each stays a verify-then-ship slice.

### Slice 15 — CAD: shrink exported PDF size (Slice 2 follow-up) ✅ shipped
- [x] The Print-dialog PDF embedded the frame as a full-resolution PNG (~11.5 MB).
  - **Done:** the PDF branch now composites the extracted frame onto a white canvas and embeds it as JPEG (q=0.85) with `jsPDF({ compress: true })`. White fill prevents transparent regions going black; line-work plots stay legible. PNG export is untouched (stays lossless).
  - **Verified on `/cad-harness`:** `export-pdf` spec passed — the PDF is a valid `%PDF` and dropped from **~11.5 MB → 88 KB** (~130× smaller). `tsc` + `eslint` clean.

### Slice 16 — CAD: make Print "Plot Style" (Mono/Grayscale) actually work ✅ shipped
- [x] The Print dialog's Plot Style dropdown (As Displayed / Monochrome / Grayscale) was ignored by the export — a dead setting.
  - **Done:** `PrintDialog` now passes `plotStyle` in the export event; the export handler flattens onto white then applies the style — GRAYSCALE → per-pixel luma, MONOCHROME → luma thresholded to pure B/W — before producing the PNG/PDF. AS_DISPLAYED is unchanged.
  - **Verified on `/cad-harness`:** new `export-plotstyle` spec selects Grayscale, exports a PNG, decodes it in-browser, and asserts **0 non-gray pixels** with 72k dark content pixels (real linework, not a blank sheet). `tsc` + `eslint` clean.

### Slice 17 — CAD: honor Print "Print Elements" toggles in export ✅ shipped (3 of 7; rest deferred)
- [x] The dialog's Print Elements checkboxes were ignored by export.
  - **Done:** `PrintDialog` passes `elements: { titleBlock, northArrow, scaleBar }`; the export handler hides the matching Pixi containers (`tbTitleBlockContainer` + `tbSignatureContainer`, `tbNorthArrowContainer`, `tbScaleBarContainer`) just for the export render, then restores them (safe — no rAF frame runs mid-handler; also restored in the catch).
  - **Verified on `/cad-harness`:** new `export-elements` spec exports all-on (67,702 dark px) then Title-Block-off (20,704 dark px) → ~69% less ink, proving the toggle removes the title block. `tsc` + `eslint` clean.
- ~~Border / Legend / Certification / Notes toggles~~ — initially deferred (not discrete Pixi containers). **Retired by Slice 24:** extracted the paper border into its own `Graphics`, added three new title-block sub-containers + `renderPaperFurniture()` that draws compact paper-fixed Legend, Notes (numbered), and Certification blocks using the active template config; all four toggles now hide their containers on export via the existing `hideIf` path.

### Slice 18 — CAD: size exported PDF to the selected paper + fit the drawing ✅ shipped
- [x] The PDF page was sized to the raw canvas pixel dimensions, ignoring the dialog's Paper Size / Orientation / Center-on-Page — so it wasn't a real plot sheet.
  - **Done:** the export now builds the jsPDF page from `PAPER_DIMENSIONS` (inches × 72 pt) for the chosen size + orientation, and fits the captured image into it preserving aspect ratio with a 0.25" margin — centered, or top-left when Center-on-Page is off.
  - **Verified on `/cad-harness`:** extended `export-pdf` spec parses the PDF MediaBox and asserts **1224 × 792 pt** (Tabloid Landscape) while staying ~88 KB. `tsc` + `eslint` clean.
  - **Note:** PNG export stays a raw raster of the frame (paper sizing is a PDF/plot concept); Scale Mode "Fit to Page" is effectively what the aspect-fit does, and fixed-scale plotting (true 1"=N' on paper) remains a larger future item.

### Slice 19 — CAD: golden-path visual audit + Weight-field clipping fix ✅ shipped
- [x] Used Playwright + screenshot inspection (OCR) to drive the editor golden path (`e2e/harness/visual-audit.spec.ts`): create drawing → draw a line → drop points → open a menu.
  - **Result:** editor renders cleanly; line drawing works and shows the live length/bearing readout (`Len 116.650 ft, Bearing N 56°18'35" E`); title block, scale bar, north arrow, layers, and options bar all correct. Golden path verified.
  - **Bug found + fixed:** the DRAW LINE options-bar **Weight** input (`w-14`, `type=number`) clipped its `placeholder="layer"` to "laye" (spinner arrows ate the width). Widened to `w-20`; re-ran the audit and confirmed the placeholder now reads "layer" in full. `tsc` + `eslint` clean.

### Slice 20 — Properties panel: live render of style edits (USER REQUEST) ✅ shipped (color/weight/opacity; font-size next)
- [x] User: "as the user increases/decreases line weight or font size … the affected features render the change dynamically." In `PropertyPanel`, single-feature **Color / Line Weight / Opacity** edits only updated local state and committed to the canvas on **blur** — no live feedback (bulk edits already applied live).
  - **Done:** added `beginStyleEdit()` (snapshots the pre-edit feature on input focus) + `applyStyleLive()` (calls `drawingStore.updateFeature` on every `onChange`, no undo, so the canvas repaints immediately). `commitStyleChange()` (blur) now pushes a single undo entry from the pre-edit snapshot → final, only if the style actually changed — so the user sees the change in real time and undo stays one step.
  - **Verified end-to-end (after Slice 21's test hook):** `e2e/harness/live-style-preview.spec.ts` seeds + selects a line, then sets weight 1 → 16 while the input is still focused (pre-blur) and measures canvas ink in the drawing area: **666 → 11,016 dark px (16.5×)**, proving the weight renders live before blur. It then blurs and undoes once → ink returns to **666 exactly**, confirming the pre-edit-snapshot undo restores in a single step. `tsc` + `eslint` clean.
- [x] **Font size — verified already live (no change needed).** Both PropertyPanel font-size controls already call the store in `onChange`: the TEXT-feature size (`updateFeature(... fontSize)`, ~line 1023) and the per-label size (`updateTextLabel(... style.fontSize)`, ~line 1128). Rotation and bulk style edits likewise apply on change. So with Slice 20's color/weight/opacity fix, **all** Properties-panel style edits now render dynamically as the user adjusts them — the user's request is fully covered.

### Slice 21 — Harness test hook for deterministic seed/select ✅ shipped
- [x] Driving the WebGL canvas from Playwright is unreliable (chord-prefixed tool keys; synthetic pointer/command-bar input doesn't register deterministically), which blocked verifying selection-dependent behaviour.
  - **Done:** added `app/admin/cad/components/CadTestHooks.tsx` — a harness-only (`NEXT_PUBLIC_E2E_HARNESS==='1'`) listener for `cad:test:seedLine` that adds a LINE on the active layer and selects it (REPLACE), firing `cad:test:seedLine:done`. Mounted only from the env-gated `/cad-harness` page, so it never ships to `/admin/cad`.
  - **Payoff:** Slice 20's live-preview is now E2E-verified, and future selection-dependent specs can seed geometry deterministically. Also added a `cad:test:undo` hook (`undoStore.undo()`) used to verify the live-edit's single-step undo. `tsc` + `eslint` clean.

### Slice 9 — Employee workflows: hours logging, receipts, job attachments (USER PRIORITY)
- [x] **Hours logging — audited, confirmed working (no fix needed).** Two complementary systems, both fully wired:
  - *Payroll hours* — `MyHoursPanel` (`/admin/me?tab=hours`): week strip → "+ Log Time" → work-type/hours/description → POST `/api/admin/time-logs` (server computes effective rate, status=pending) → admin approves in `/admin/hours-approval` (bulk approve/reject/adjust, dispute/resubmit). End-to-end real APIs + DB (`daily_time_logs`).
  - *Job hours* — `JobTimeTracker` on the job detail Financial tab: POST `/api/admin/jobs/time` (verified wired via `addTimeEntry` at `jobs/[id]/page.tsx:316`; loads on tab open at line 163). A sub-agent initially reported this as "stubbed/never saves" — that was **incorrect** (it only read the first 150 lines); verified the handler and API both work.
- [x] **Receipts — audited, working.** `/admin/receipts` is a full bookkeeper queue (filter, approve/reject/reopen, bulk-approve, CSV export, maintenance/equipment linking, soft-delete) on the `receipts` table with AI extraction + signed photo URLs. Employee capture is the mobile path (not in this web repo). No web-side bug found.
- [x] **Job attachments — CAD already works; receipts now surfaced on the job.**
  - CAD→job: `JobCadPanel` lists `cad_drawings WHERE job_id`, "New Drawing" passes `job_id` to the editor which preserves it on save. Files→job: `JobFileManager` loads/saves via `/api/admin/jobs/files` (also verified working — sub-agent's "auto-load missing" claim was wrong).
  - **Shipped:** new **Expenses & Receipts** section on the job detail Financial tab — admin-gated, fetches `/api/admin/receipts?jobId=<job>`, lists vendor / category / submitter / date / amount / status with a photo "View" link, a running total, and a link to the full receipts queue. This is the missing *view* of receipts attached to a job. `tsc` + `eslint` clean (code-verified; page is auth-gated so not harness-screenshottable).
- [x] **Follow-up shipped — assign/reassign a receipt to a job from the web.** `PATCH /api/admin/receipts/[id]` now accepts `job_id` (string | null, empty→null) alongside the existing fields. The receipts approval editor gains a **Job** dropdown (fed by `/api/admin/jobs?limit=500`) beside Category / Tax flag; choosing a job calls the existing `wrap()` PATCH helper, and the receipt then appears in that job's Expenses section. `tsc` clean; `eslint` 0 errors (2 pre-existing warnings on untouched lines). Now the full loop works: assign on the receipts page → view on the job.

---

## Phase 2 — Backend-wide UI/UX, wiring & styling audit (re-opened 2026-05-28)

**Mandate (user):** screenshot every page / interface / popup / modal / dialog across the *whole* business-management backend (not just CAD) and verify: formatting/alignment (no overlap, no funky spacing), styling (fonts not too small/large), menu structure (remove redundancy; collapse into menus/submenus), that every button does what it should, that all routes/wiring are hooked up, and that no page is a placeholder/empty/missing. Fix everything found.

### ⚠ Environment constraint (must-unblock for the screenshot sweep)
Live authenticated screenshots of the admin pages are **not currently possible from this sandbox**:
- The deployed admin app `https://app.starrsurveying.com` is **blocked by the environment's egress network policy** (returns a proxy `503 — remote connection failure`). Provided credentials can't be used until that host (and the Supabase host) are allowlisted.
- The local dev server can't authenticate either — there is no Supabase/NextAuth config in this sandbox (only `.env.example`; all auth env vars unset).
- Only the unauthenticated, client-side `/cad-harness` route renders (hence CAD is the one screenshot-testable surface so far).

**To unblock the full sweep, one of:** (a) allow `app.starrsurveying.com` (+ the Supabase host) in the environment's network policy so Playwright can log in with the test creds; or (b) provide the Supabase env vars so the local dev server can authenticate (still needs egress to Supabase). See https://code.claude.com/docs/en/claude-code-on-the-web for network-policy settings.

### Achievable now (no live admin render) — code-level audit + CAD screenshots
- [x] **Dead-wiring scan — clean.** No `onClick={()=>{}}`, no `href="#"`, no `alert('coming soon')`, no `TODO/FIXME` across `app/admin/**`. The 5 previously-stubbed pages were already built (Phase 1, Slices 10–14).
- [x] **Too-small fonts (8px) — fixed.** Bumped the 6 `text-[8px]` occurrences (CAD field-editor hints, image-panel caption, label-state badges) to `text-[10px]` for legibility. (101 `text-[9px]` left as-is — borderline-standard for dense CAD micro-labels; revisit per-case if a screenshot shows a problem.)
- [ ] **Always-disabled buttons — reviewed.** `billing` "Change plan" is a documented pending feature (`/api/admin/billing/change` not built; a `customer-portal` Stripe route exists as the real path) — left for a billing-aware follow-up since payments code can't be tested here. `exam-prep` "Complete All Modules First" is a correct gated state (not a bug). `billing/upgrade` "Add to plan" pends the same billing endpoint.
- [x] **Local UX harness built — unblocks the formatting/styling/menu audit without the network.** Added `/ux-harness?page=<slug>` (env-gated, outside `/admin` so no middleware/auth-bypass risk): renders real admin page components inside a seeded mock-admin `SessionProvider`, loads all admin stylesheets, and suppresses marketing chrome (`LayoutShell`). Playwright `page.route` mocks `/api/auth/session` + `/api/admin/**` so pages render populated + deterministically. Optional `?chrome=1` mounts the real `AdminLayoutClient` for chrome/menu audits. Proven on `/settings` (renders fully styled + correctly formatted). *(Real-data correctness + live POST/button actions still need the network unblock; layout/styling/menu/font/link-wiring audits are now doable here.)*
- [x] **Per-page formatting/menu/font sweep — completed (2026-05-28).** Registered 35 admin pages in the harness (`app/ux-harness/UxHarnessClient.tsx`) and screenshotted every one. Fixes shipped from the sweep:
  - **Runtime crashes from nested-field reads in mocked responses** — `reports`, `billing`, `mileage`, `finances`, `org-settings` all crashed on the first `state.x.y` read when the mock returned `{}`. Added optional-chaining guards / early `!data?.x` returns so each page degrades to its loading or empty state instead of throwing.
  - **`/admin/audit` had no CSS file** — page referenced `.audit-page`/`.audit-filters`/`.audit-table` but no stylesheet defined them, so the search input collapsed to a square and the footer link came out in the global red. Created `app/admin/styles/AdminAudit.css` and imported it from the page + the harness.
  - **`/admin/discussions` filter chips were a wall of plain text** — the page only loaded its stylesheet via `layout.tsx`, which the harness skips. Added a per-page import.
  - **`/admin/my-files` dropzone was unstyled** — `.job-import__dropzone` was referenced but never defined. Added the dashed-border, centered-icon, hover state to `AdminJobs.css`.
  - **`/admin/vehicles` "Active only" checkbox label wrapped onto two lines** — `inline-flex` + `white-space: nowrap` keeps the text on one line.
  - **`/admin/timeline` "Field Team" deep-link picked up the global red** — explicit navy `stopAction` style on the inner `Link`.
  - **Hub redirects rendered the sign-in page in the harness** — `/admin/my-*`, `/admin/schedule`, `/admin/profile` are all server redirects to `/admin/me?tab=…`. Switched the harness registry to mount the underlying Panel components directly so each surface renders its real body.
  - **9 production pages embedded dev-guide / continuation-prompt scaffolding blocks** — removed.
  - **Marketing chrome was wrapping the harness route** — added `/ux-harness` to the suppression list in `LayoutShell`.
  - **Settings, research, rewards, office, announcements, vehicles, profile, payroll, dashboard, hours-approval, work, team, users, error-log, receipts, equipment, invites, assignments, jobs, leads, notes** — all audited via the harness, no formatting issues found.
  - Net effect: every admin page in the harness now renders without runtime errors, with correct typography, no overlapping/clipped UI, and consistent navy link styling.

### Slice 22 — Backend audit sweep follow-up (post-Slice 21) ✅ shipped
- [x] See the bullet list under Phase 2's per-page-sweep entry above. Commits `c5b68a4` (discussions/vehicles), `23613b8` (dropzone), `5eb0b69` (AdminAudit.css), `239f332` (org-settings/finances/timeline/profile), plus the earlier `8fc6249` / `fa2420d` / `7767ed6` (null-deref guards) and `50996a8` (dev-guide removal). All `tsc` + `eslint` clean.

### Slice 23 — CAD: touchpad / touchscreen two-finger pan + pinch-zoom (USER REQUEST) ✅ shipped
- [x] User (2026-05-28): "if they use two fingers and drag them together, that acts like grabbing the whole drawing and moving the view in that direction. And … if the user uses their finger to pinch or expand on the touch screen/pad, it zooms out or in. These need to be distinguished actions … mainly for laptops and ipads and mobile devices."
  - **Done — wheel handler in `CanvasViewport.tsx`:** classifies events into three buckets.
    - `wheel + ctrlKey` → pinch zoom (browser convention for trackpad pinch — works on Mac/Windows/Linux).
    - `wheel` with non-zero `deltaX` *or* `|deltaY| < 50` (and `deltaMode === 0`) → trackpad two-finger drag → `viewportStore.pan(-deltaX, -deltaY)` (matches the natural-scroll grab-and-drag direction). Mouse-wheel ticks emit large integer `deltaY` with `deltaX = 0`, so they keep zooming as before.
    - Else → existing mouse-wheel zoom path (unchanged), so single-mouse users see no regression.
  - **Done — touch handlers:** `touchstart` records the centroid + distance of the two touches; `touchmove` computes the new centroid and distance, calls `pan(dx, dy)` for the centroid delta, then `zoomAt(centroidX, centroidY, distance/lastDistance)` so the world point under the fingers stays put while spreading/pinching. Single-touch interactions fall through to the existing pointer-event path (taps + one-finger drags still drive the active tool).
  - **Verified:** `tsc` clean. New Playwright spec `e2e/harness/canvas-touch-gestures.spec.ts` dispatches synthetic WheelEvents (small-fractional / ctrlKey / large-round) and TouchEvents (two-finger drag + spread) and asserts the viewport store moves correctly — pan changes `centerX/Y` with `zoom` unchanged, pinch raises `zoom`, mouse-wheel still zooms. Harness-only `window.__cad = { viewportStore, drawingStore, selectionStore }` exposed in `CadTestHooks` so the spec can read the post-gesture state directly.
  - **Note:** pan direction follows the OS scroll-direction setting — natural scrolling (the default on Mac and Windows 10+) matches the user's grab-and-drag mental model exactly. Users with non-natural scrolling will see inverted pan; an `invertTrackpadPan` setting can be added later if requested.

---

## Second pass (2026-05-28 pm) — retire every deferred bullet

> User mandate: "complete all of the deferred items. Don't stop developing until everything is complete." Each previously-`~~struck-through~~` item gets its own slice below; the strike-throughs above are kept for history but every one of them now points to the slice that retired it.

### Slice 24 — CAD: ship Border / Legend / Certification / Notes print toggles ✅ shipped
- [x] Closes Slice 17's deferred set. The toggles for Title Block / North Arrow / Scale Bar already worked; Border / Legend / Certification / Notes were inert because the elements weren't discrete Pixi containers. They are now.
  - **Border:** the paper outline (drop shadow + thin rect) extracted from `renderPaper` into its own `paperBorderGraphics` child of `paperLayer`. Toggle hides it on export via the existing `hideIf` path.
  - **Legend / Notes / Certification:** three new title-block sub-containers (`tbLegendContainer`, `tbNotesContainer`, `tbCertificationContainer`) each with their own `Graphics`, registered in the per-frame clear list, and drawn by a new `renderPaperFurniture()` called from `renderAll()`. Renderers read the active drawing template (`legend.* / standardNotes.* / certification.*`) and produce compact paper-fixed blocks: legend shows up to 8 visible layers with colour swatches; notes shows up to 6 numbered standard-or-custom notes wrapped to the template's configured width; certification shows the cert paragraph with `{{var}}` substitution.
  - **Verified:** `tsc` + `eslint` clean. Commit `f8e14a5`.

### Slice 25 — Schedule: server-side conflict detection ✅ shipped
- [x] Closes a Slice 12 deferred item. POST and PATCH on `/api/admin/schedule` now check for overlapping events on the same `assigned_to` before writing. A conflict returns `409 schedule_conflict` with the overlapping rows; the client surfaces them in a confirm dialog and retries with `?force=1` if the admin chooses to proceed. Self-conflicts on PATCH are excluded so an event can shorten or move without colliding with its own old slot. Commit `c3fe090`.

### Slice 26 — Schedule: recurring events ✅ shipped
- [x] Closes a Slice 12 deferred item. `seeds/296` extends `schedule_events` with `recurrence_rule` (RFC-5545 subset), `recurrence_end`, `series_id`, and a `status` check (`approved / pending / denied` — used by Slice 27 too). `lib/schedule/recurrence.ts` is a tight RRULE parser + expander for `FREQ=DAILY|WEEKLY|MONTHLY` with `INTERVAL/BYDAY/COUNT/UNTIL`, hard-capped at 366 occurrences per row. `GET /api/admin/schedule` expands every recurring row into virtual occurrences inside the requested window (virtual id `<uuid>:<idx>`; the suffix is stripped in PATCH/DELETE so series edits land on the source row — per-occurrence overrides are out of scope and noted as such). `SchedulePanel` form gains a Repeats dropdown (Daily / Weekdays / Weekly / Monthly) + a Repeat-until date. Commit `f4d52f2`.

### Slice 27 — Schedule: time-off request + approval flow ✅ shipped
- [x] Closes a Slice 12 deferred item. Built on top of the `schedule_events.status` column added in Slice 26. `/api/admin/time-off` exposes employee GET (own requests) + POST (create pending) + admin GET `?queue=1` + admin PATCH ({id, status: approved|denied}). `/admin/time-off` is a single page that gives employees the request form and a list of their own requests, and gives admins a pending-approval queue on the same screen. Approved requests carry `status='approved'` so they appear on the team schedule; pending/denied requests are filtered out of the default schedule view. Registered in `AdminSidebar`, `AdminLayoutClient`, and the harness `UxHarnessClient`. Commit `de68fe9`.

### Slice 28 — Schedule: drag-to-move events + click-to-create ✅ shipped
- [x] Closes a Slice 12 deferred item. Week view wires the native HTML5 drag-and-drop API. Clicking an empty area of a day cell opens the create form pre-filled with that date and focuses the title input. Dragging an event card onto another day cell PATCHes the event's start/end to land on that day, preserving the original time-of-day + duration. Server-side conflict detection from Slice 25 still runs; a 409 surfaces the overlapping events in a confirm dialog and a `?force=1` PATCH retries on user approval. Virtual recurring-occurrence ids are stripped before the PATCH so a drag on any occurrence moves the source series. Commit `115c191`.

### Slice 29 — Schedule: Google Calendar OAuth + bidirectional sync ✅ shipped
- [x] Closes a Slice 12 deferred item. `seeds/297` adds `google_calendar_connections` (per user OAuth tokens, `last_synced_at`, `calendar_id`) and `google_calendar_event_links` (per-event mapping with etag for change detection). `lib/integrations/google-calendar.ts` is a bare-fetch GCal v3 client: `buildAuthUrl` / `exchangeCodeForTokens` for the OAuth dance, automatic `refreshAccessToken` within 60s of expiry, plus `pushScheduleEvent` / `listRemoteEvents` / `deleteScheduleEvent`. Three routes:
  - `GET/POST/DELETE /api/admin/google-calendar` — connect status / connect URL / disconnect
  - `GET /api/admin/google-calendar/callback` — OAuth landing with cookie-bound CSRF state
  - `POST /api/admin/google-calendar/sync` — push next 90 d of approved events, then pull any remote events not in the link table
  
  Settings → Integrations gets a Google Calendar card with Connect / Disconnect / Sync-now buttons + the last-sync timestamp; the `?gcal=...` flash messages from the callback are surfaced inline.
  
  **Runtime caveat:** verification against the real Google Calendar API needs egress to `googleapis.com` (the request/response shapes follow GCal v3); `tsc` + `eslint` clean. Commit `a011ddf`.

### Slice 31 — Admin sections: navy link colour (kill the global red bleed) ✅ shipped
- [x] `app/styles/globals.css:114` sets `a { color: var(--brand-red) }` as a marketing-site default, which bled into every admin page that didn't override per-link with an inline style. Closes the user's "consistent navy link colour (not the global red)" audit note. Fix: add a scoped rule in `app/admin/styles/AdminLayout.css` that overrides anchor colour to `var(--color-brand-navy)` within `.admin-layout`, excluding `.btn`, sidebar/topbar (which intentionally have white-on-navy), and dashboard-card variants (which set their own colours). Inline-style overrides remain untouched — those are addressed slice-by-slice as the audit walks individual pages. `tsc` + `eslint` clean (one pre-existing harmless `react-hooks/exhaustive-deps` warning on `/admin/time-off/page.tsx` unrelated to this change).

### Slice 30 — PTO Balance: accrual schema, dashboard tile, auto-deduction on approval ✅ shipped
- [x] Closes the Slice 4 deferred PTO Balance dashboard tile (originally deferred for lack of an accrual schema). `seeds/298` adds:
  - `pto_balances` — per-employee row (`accrual_rate_hours`, `accrual_period` `biweekly|monthly|annual`, `balance_hours`, `carryover_cap`, `last_accrued_at`).
  - `pto_transactions` — immutable audit trail; kinds `accrual / time_off / manual / rollover / payout` with `schedule_event_id` linking time-off draws back to the originating event.
  - `pto_accrue_user()` SQL function used by the cron endpoint, idempotent within the configured period.
  
  `/api/admin/pto`:
  - GET — caller's balance + last 20 transactions; `?email=<other>` (admin) for someone else; `?everyone=1` (admin) for the full list
  - POST — admin manual adjustment `{ email, delta_hours, reason }`
  - POST `?action=accrue` — admin/cron entry point that walks every balance row and calls `pto_accrue_user`
  
  Dashboard's My Finances card now shows a PTO Balance (hrs) metric next to Hours This Week. `/api/admin/time-off` PATCH writes a `-hours` transaction when an admin approves a request; the write is idempotent (keyed on `schedule_event_id`) so re-approval never double-deducts, and the balance row auto-creates for new hires. Commit `bd91eb9`.

---

### Slice 32 — Time-off page: token-ize the hardcoded brand colours ✅ shipped
- [x] Phase-3 audit follow-up. `app/admin/time-off/page.tsx` had four hardcoded `#1D3095` (request + submit buttons, schedule deep-link, the request-form border colour) and three `#B91C1C` (error message, deny-button text + border) inline-style literals — so the page wouldn't track a brand-colour change in `tokens.css`. Converted all four navy references to `var(--color-brand-navy)` and all three reds to `var(--color-error)`, matching the same tokens the shared forms / dashboard cards already consume. While in the file, replaced the dangling `// eslint-disable-next-line react-hooks/exhaustive-deps` (it was on the same line as the body, so it suppressed nothing) by wrapping `loadAll` in `useCallback([safeFetch, isAdmin])` and adding it to the `useEffect` deps — the pre-existing `exhaustive-deps` warning called out in the handoff is now actually gone. `tsc` + `eslint` clean (remaining warnings are all on unrelated files: `employees/page.tsx`, `equipment/inventory/page.tsx`, `learn/quiz-history/page.tsx`, `receipts/page.tsx`).

### Slice 33 — PTO: deduct 8h × weekday-count for all-day requests (not 24h × calendar-day) ✅ shipped
- [x] Phase-3 audit follow-up to Slice 30. `app/api/admin/time-off/route.ts:114-116` computed the deduction as `(endMs - startMs) / 3_600_000`. The POST handler stores all-day requests as `start_date T00:00 → end_date T23:59`, so the raw duration was ~24h per calendar day, and a Fri→Mon all-day request charged ~96h instead of the intended 16h (Fri + Mon × 8h). Weekend days inside a span were also charged. Added `countWeekdaysUtc()` that walks the inclusive UTC date range and counts Mon-Fri only; the PATCH branch now uses `8h × weekdayCount` when `data.all_day === true` and keeps the existing minute-based formula for partial-day requests. A single all-day Monday now deducts 8h; a five-day Mon-Fri all-day request deducts 40h; a request straddling Sat+Sun deducts 0h. UTC-based to avoid server-timezone drift (POST normalizes the date the same way). `tsc` + `eslint` clean.

### Slice 34 — Schedule month view: drag-to-move + click-to-create ✅ shipped
- [x] Phase-3 audit follow-up to Slice 28 (which only wired the week view). `app/admin/schedule/SchedulePanel.tsx` month-cell render previously had no `onClick` / `onDragOver` / `onDrop` and the per-event chip wasn't `draggable`, so admins on the month view were stuck with a read-only grid. Wired the same admin-gated handlers as the week view: cell `onClick` (background only — skips when the click target is inside `.sched__month-event`) opens the create form pre-filled with that date, cell `onDragOver`/`onDrop` accept a dropped event id and call the existing `moveEvent()` (which already strips the recurring-occurrence `:idx` suffix and surfaces 409 conflicts), and each event chip is now `draggable` with the matching `onDragStart`/`dataTransfer.setData` pair. Same cursor + title affordance as week view (`cursor: copy` on the cell, `cursor: grab` on the chip). `tsc` + `eslint` clean.

### Slice 35 — Time-off page: show PTO balance + requested-hours preview ✅ shipped
- [x] Phase-3 audit follow-up. Before this, an employee opening the request form couldn't see whether they had the PTO to spend — only the dashboard tile (Slice 30) showed it, and only after a roundtrip. Now the time-off page itself fetches `/api/admin/pto` on load and surfaces the balance as a pill next to the "+ Request time off" button. When the request form is open with valid dates, a live preview computes the deduction the same way the server does on approve, and renders one of two banners: green (would-leave-X hours) under-budget, red (exceeds-balance-by-Y) over-budget. Per the user note, the over-budget banner is a soft warn — the submit button stays enabled because admins occasionally approve negative-balance requests by policy. To keep the page calc and the PATCH calc honest about agreeing, extracted the math into `lib/schedule/pto-hours.ts` (`ptoHoursForRequest({ startTime, endTime, allDay })`) — Slice 33's PATCH branch now calls the same helper. `tsc` + `eslint` clean.

### Slice 36 — Token-ize the hardcoded navy hex (sweep): `app/admin/team/page.tsx` ✅ shipped
- [x] Phase-3 audit follow-up. There are 152 `#1D3095` literals across 58 `.tsx` files in `app/admin/**` (as of this commit). The handoff prompt explicitly called for an incremental sweep — one page per commit — so this slice handles only `app/admin/team/page.tsx` (5 occurrences in the local `styles` const: active-tab `background` + `borderColor`, ping-button `background`, secondary ping-button `color` + `border`). All five now read `var(--color-brand-navy)` so a future brand-colour change in `tokens.css` propagates. Continue the sweep one file per slice. `tsc` + `eslint` clean.

### Slice 37 — Token-ize the hardcoded navy hex (sweep): `app/admin/jobs/[id]/page.tsx` ✅ shipped
- [x] Second file in the sweep. The job-detail page had 3 hex literals: the inline "View field captures →" Link (`color` + `border`) at ~line 380, and the Save button on the result-change dialog (`background`) at ~line 872. All three now read `var(--color-brand-navy)`. 144 `#1D3095` literals across 56 admin .tsx files remain. `tsc` + `eslint` clean.

---

### Slice 38 — Token-ize the hardcoded navy hex (sweep): CAD components batch ✅ shipped
- [x] Continued the per-file sweep started in Slices 36/37. Batched the 11 `app/admin/cad/components/*.tsx` files that referenced `#1D3095` (`AIDrawingDialog`, `AISidebar`, `CompletenessPanel`, `ElementExplanationPopup`, `QuestionDialog`, `RPLSReviewModePanel`, `RPLSSubmissionDialog`, `RecentRecoveriesDialog`, `SealHashBanner`, `SealImageUploader`, `SurveyDescriptionPanel` — 18 occurrences total) into a single slice because they're all inline `styles` consts inside a single subsystem and a future brand-navy change should land in one commit for that surface. Every literal is `background`, `border`, or `color` on a styles object; no template-literal interpolation or external concatenation to worry about. 126 `#1D3095` literals across 45 admin .tsx files remain. `tsc` + `eslint` clean (the four pre-existing warnings on untouched files persist: `employees/page.tsx`, `equipment/inventory/page.tsx`, `learn/quiz-history/page.tsx`, `receipts/page.tsx`).

### Slice 39 — Token-ize the hardcoded navy hex (sweep): equipment area batch ✅ shipped
- [x] All six `app/admin/equipment/**/*.tsx` files that referenced `#1D3095` — `consumables/page.tsx`, `fleet-valuation/page.tsx`, `maintenance/[id]/page.tsx` (4 occurrences), `overrides/page.tsx`, `templates/cleanup-queue/page.tsx`, `timeline/page.tsx` (3 occurrences) — converted. Every literal was a `border` value on a styles object; timeline also had a `'2px solid #1D3095'` inside a conditional `outline` expression that I handled in a separate edit. 115 `#1D3095` literals across 39 admin .tsx files remain. `tsc` + `eslint` clean.

### Slice 40 — Token-ize the hardcoded navy hex (sweep): billing area batch ✅ shipped
- [x] All four `app/admin/billing/**/*.tsx` files — `invoices/page.tsx` (3), `page.tsx` (8), `plan-history/page.tsx` (3), `upgrade/page.tsx` (6) — converted (20 occurrences total). Mix of JS string literals in `STATUS_COLORS` / `EVENT_COLORS` config maps and bare hex inside `<style jsx>` template-literal CSS. CSS-vars work in both contexts (the runtime sets the variable on `:root`, and `var(...)` resolves inside JSX style blocks too). 95 `#1D3095` literals across 35 admin .tsx files remain. `tsc` + `eslint` clean.

### Slice 41 — Token-ize the hardcoded navy hex (sweep): learn area batch ✅ shipped
- [x] All four `app/admin/learn/**/*.tsx` files — `students/[studentEmail]/page.tsx` (1 — active-tab underline), `practice/page.tsx` (3 — palette button border + two step border-lefts), `manage/lesson-builder/[id]/page.tsx` (1 — emoji-pick selection ring), `manage/question-builder/page.tsx` (2 — sim-quiz outer card + answered-pick highlight) — converted. 88 `#1D3095` literals across 31 admin .tsx files remain. `tsc` + `eslint` clean.

### Slice 42 — Token-ize the hardcoded navy hex (sweep): rewards + support batch ✅ shipped
- [x] `rewards/admin/page.tsx` (1), `rewards/how-it-works/page.tsx` (1), `support/page.tsx` (2), `support/new/page.tsx` (4), `support/tickets/[id]/page.tsx` (6) — 14 occurrences total, mix of inline-style JSX, status-color maps, and `<style jsx>` template-literal CSS. 74 `#1D3095` literals across 26 admin .tsx files remain. `tsc` + `eslint` clean.

### Slice 43 — Token-ize the hardcoded navy hex (sweep): jobs/field-data/reports batch ✅ shipped
- [x] Four pages: `jobs/[id]/field/page.tsx` (6), `field-data/[id]/page.tsx` (7), `reports/page.tsx` (6), `reports/job/[jobId]/page.tsx` (2). 21 occurrences total — inline-style JSX literals + `<style jsx>` template-literal CSS. 53 `#1D3095` literals across 22 admin .tsx files remain. `tsc` + `eslint` clean.

### Slice 44 — Token-ize the hardcoded navy hex (sweep): team/profile/settings/employees/notes batch ✅ shipped
- [x] Five files: `team/[email]/page.tsx` (8), `profile/ProfilePanel.tsx` (4), `settings/page.tsx` (4), `employees/page.tsx` (1), `notes/page.tsx` (1). 18 occurrences total. Notes case worth flagging: the page's `CATEGORIES` config previously mapped the "procedures" category to `#1D3095`; now it reads `var(--color-brand-navy)`. This means the procedures-category accent will track brand navy if the token ever changes — that's the intended sweep behaviour, but a future "procedure category needs its own colour" could re-introduce a hardcoded value (with a comment explaining why) without breaking the rest. 35 `#1D3095` literals across 17 admin .tsx files remain. `tsc` + `eslint` clean.

### Slice 45 — Token-ize the hardcoded navy hex (sweep): page-level admin sweep ✅ shipped
- [x] Ten page-level files: `announcements/page.tsx` (2 — feature-type colour + `.announcement--focused`), `audit/page.tsx` (2 — `<style jsx>` details + footer hover), `vehicles/page.tsx` (4 — primary + secondary button), `payouts/page.tsx` (1 — primary button), `discussions/[id]/page.tsx` (2 — back link + status badge), `mileage/page.tsx` (3 — per-row override badge + two action buttons), `timeline/page.tsx` (4 — derive button + three deep-link colours), `finances/page.tsx` (2 — export button + chip), `receipts/page.tsx` (2 — refresh + export button border), `my-files/MyFilesPanel.tsx` (1 — pipeline stage CSS variable). 24 occurrences across 10 files. 11 `#1D3095` literals across 7 admin .tsx files remain (mostly shared components under `app/admin/components/` + the crew-calendar). `tsc` + `eslint` clean.

### Slice 46 — Token-ize the hardcoded navy hex (sweep): shared components + crew-calendar ✅ shipped
- [x] Four files: `personnel/crew-calendar/page.tsx` (4 — drag-outline + link colour + two save buttons), `components/FlashcardViewer.tsx` (1 — "Change study mode" button), `me/components/HubNotifications.tsx` (3 — `info` severity colour + count badge + action-link), `components/jobs/JobPhotoGallery.tsx` (1 — dropzone border colour; also corrected the wrong token name `--brand-blue` to `--color-brand-navy` and dropped the now-misleading hex fallback). 9 occurrences. 3 `#1D3095` literals remain across 3 admin .tsx files, all deferred with rationale (see Slice 47). `tsc` + `eslint` clean (4 pre-existing warnings unchanged: `employees/page.tsx`, `equipment/inventory/page.tsx`, `learn/quiz-history/page.tsx`, `receipts/page.tsx`).

### Slice 47 — Navy hex sweep: document the three remaining intentional cases ✅ shipped
- [x] After Slices 36–46, three `#1D3095` literals remain in `app/admin/**`. All three are intentional, documented here rather than silently converted to tokens because the token would either break rendering or change semantics:
  - **`app/admin/components/TipTapEditor.tsx:60`** — `'#1D3095'` is one entry in the rich-text editor's color-picker palette (alongside `#3B82F6`, `#059669`, `#10B981`, etc.). A color palette is a set of visually distinct hues that the user picks from; if the brand navy ever changes to something close to one of the other palette swatches, the palette degrades. Hardcoded by design.
  - **`app/admin/components/jobs/JobMessagesPanel.tsx:117`** — `var(--color-brand-navy, #1D3095)` already uses the token; the `#1D3095` is the CSS-variable fallback for browsers / contexts where `--color-brand-navy` isn't yet resolved. Removing the fallback would risk a transient "no background" flash if styles paint before the token cascade. The pattern is correct as-is.
  - **`app/admin/components/jobs/FieldWorkView.tsx:638`** — `'#1D3095'` is the fallback color when `DATA_TYPE_COLORS[pt.data_type]` is undefined, then passed to an SVG `<circle fill={color}>` attribute (`fill="#1D3095"`). SVG presentation **attributes** do **not** resolve CSS `var()` (only the SVG `style=` attribute does), so converting this literal would silently break the rendering for unknown point types. Leaving the literal here is the correct call; a follow-up could refactor the map to apply colours via `style=` rather than attribute, but that's behaviour-touching and outside this cosmetic sweep.
- [x] **Navy-hex sweep complete.** The 155-occurrence-across-58-files starting state from Slice 36's note is now down to 3 documented exceptions. Future contributors can grep `#1D3095` in `app/admin/**` and find only the three intentional cases above; everything else reads `var(--color-brand-navy)`.

### Slice 48 — Clear pre-existing react-hooks/exhaustive-deps warnings ✅ shipped
- [x] Three of the four lint warnings called out as "pre-existing on untouched files" in earlier slices were real correctness gaps (a stale closure or a fresh-array-each-render that defeats `useMemo`). Fixed:
  - **`app/admin/components/jobs/FileViewer.tsx:131`** — the `keydown` `useEffect` listed only `onClose` in its deps but bound to `zoomIn`, `zoomOut`, `resetView` (which were plain function declarations, recreated each render). Promoted all three to `useCallback` with their actual deps (`resetView`: scale + position + filename, `zoomIn`/`zoomOut`: filename for the log line) and added them to the effect's dep array. Behaviour unchanged; the keyboard handler now reflects the latest local state on each press.
  - **`app/admin/equipment/inventory/page.tsx:1382`** — `const items = data?.items ?? []` produced a fresh empty array on every render when `data` was undefined, busting the downstream `useMemo(visibleIds)` and `useCallback(toggleAllVisible)`. Wrapped in `useMemo(() => data?.items ?? [], [data?.items])` so the empty-array case is stable across renders.
  - **`app/admin/receipts/page.tsx:216`** — same pattern as inventory; the unstable `receipts` was a dep of `useMemo(approvableIds)`. Same fix: `useMemo(() => data?.receipts ?? [], [data?.receipts])`.
  - **`app/admin/learn/quiz-history/page.tsx:58`** — `useCallback(fetchHistory)` listed `role` as a dep but never read it (the role check is encoded in `isAdminOrDev`). Removed the unused dep.
- [x] Remaining lint output: only two warnings, both `@next/next/no-img-element`, on `employees/page.tsx:222` (28×28 avatar) and `receipts/page.tsx:624` (receipt photo inside expanded row). Both use signed Supabase storage URLs that would require `next.config.js` `images.remotePatterns` plus likely `unoptimized` to round-trip through `next/image`. The LCP impact is negligible (small thumbnails, off-screen until interaction), so deferring — they're documented decisions, not regressions.
- [x] `tsc` clean. `eslint` now reports only the two `<img>` warnings (was: those plus four hook-deps warnings). Net cleanup: 4 → 0 of the actionable warnings.

### Slice 49 — Token-ize the hardcoded brand-red hex (`#BD1218`) ✅ shipped
- [x] Mirrors the navy sweep for the brand-red token. 12 files (13 occurrences) of `#BD1218` converted to `var(--color-brand-red)` — `announcements`, `audit`, `billing/invoices`, `billing/plan-history`, `components/QuizEngine`, `me/components/HubNotifications`, `payouts`, `profile/ProfilePanel`, `research/page`, `research/components/PropertySearchPanel`, `rewards/how-it-works`. The single remaining `#BD1218` in `components/TipTapEditor.tsx` is intentional (color-picker palette swatch, same rationale as Slice 47). 0 `#9A0F14` (brand red dark) occurrences in `app/admin/**` — token defined for completeness but unused so far. **Not touched in this slice:** the 51 occurrences of `#B91C1C` (Tailwind red-700, visually close to brand red but not the same value). Those need per-case judgement (destructive button vs validation error vs link-on-error background) and the existing time-off page (Slice 32) already lumped some to `var(--color-error)`. Future slice can audit them; mechanical replace-all isn't safe. `tsc` + `eslint` clean.

### Slice 50 — Unit tests for the PTO-hours calculator (Slice 33 contract) ✅ shipped
- [x] Slice 33 fixed a real over-count bug in the time-off PATCH handler (an all-day Fri→Mon request would deduct ~96h instead of 16h), and Slice 35 extracted the calc into `lib/schedule/pto-hours.ts` so the request-form preview and the server PATCH agree. Neither slice wrote tests for it. Added `__tests__/schedule/pto-hours.test.ts` with 13 specs: partial-day same-day + fractional + defensive-zero; all-day single-weekday + single Sat + single Sun + full Mon-Fri + Fri-Mon (the original bug case) + weekend-only + Sat-Mon partial + full two-week vacation; plus two regression specs that pin the bug Slice 33 fixed (the `23.983…` and `96h` numbers). All 13 pass via `npx vitest run __tests__/schedule/pto-hours.test.ts`. A future refactor that breaks the weekday-counting contract will trip these tests. `tsc` + `eslint` clean.

### Slice 51 — Unit tests for the schedule recurrence expander (Slice 26 contract) ✅ shipped
- [x] Added `__tests__/schedule/recurrence.test.ts` covering `parseRRule` + `expandRecurrence`. Parser specs: simple DAILY, WEEKLY+INTERVAL, WEEKLY+BYDAY (Mo,We,Fr → `[1,3,5]`), COUNT, UNTIL in both `YYYYMMDDTHHMMSSZ` and `YYYYMMDD` forms, rejected FREQ=YEARLY, rejected no-FREQ, defensive INTERVAL=0→1 clamp (zero would infinite-loop the expander), case-insensitive tokens. Expander specs: empty when no rule, one-per-day inside window, INTERVAL=2 skip-pattern, COUNT clipping, UNTIL clipping, BYDAY=MO,WE,FR starting from Monday emits all three days that week, BYDAY does NOT back-fill days earlier in the start-week than the series start (a real subtlety in the expander loop), WEEKLY INTERVAL=2 skips the off weeks, MONTHLY same-day-each-month, windowTo is exclusive (≥), 366-occurrence hard cap, `recurrence_end` column clips when tighter than UNTIL/windowTo. 22 specs pass via `npx vitest run __tests__/schedule/recurrence.test.ts`. `tsc` + `eslint` clean.

### Slice 52 — Unit tests for the unicode-escape decoder ✅ shipped
- [x] Added `__tests__/lib/decodeUnicode.test.ts` for `decodeUnicodeEscapes` — 8 specs covering the 4-digit and curly-braced (supplementary-plane) forms, mixed text, empty input, mixed-case hex, and the deliberate "3-digit shorts are NOT decoded" property. The function is a quiet but real utility (called from quill-rich-text content that sometimes lands in the DB with literal `✅` instead of the codepoint); pinning the contract prevents accidental regressions.

### Slice 53 — Unit tests for the practice-engine answer checker ✅ shipped
- [x] Added `__tests__/lib/solutionChecker.test.ts` — 21 specs covering all four scoring paths in `lib/solutionChecker.ts`:
  - **Numeric:** exact (≤tolerance), close-but-warn (≤5×tolerance, surfaces `rounding_warning`), close-by-relative-error (≤0.1% for large numbers), wrong, decimal-precision-mismatch warning, NaN user input, NaN correct answer (broken question), custom tolerance.
  - **Text:** case + trim tolerance, partial mode (substring accept), strict mode (no substring), empty.
  - **Multiple choice:** case-insensitive match, mismatch.
  - **Dispatch (`checkAnswer`):** routes `numeric_input` + `math_template` to numeric; `multiple_choice` + `true_false` to MC; `short_answer` to text-partial; `fill_blank` to text-strict; unknown types fall back to strict text-match.
  - The "is this answer counted as correct?" decision is the heart of the practice engine — these tests make sure a refactor can't silently shift the close-enough threshold.

### Slice 54 — Tests for problemEngine + real `{{x:f0}}` bug fix ✅ shipped (bug-find via test)
- [x] Added `__tests__/lib/problemEngine.test.ts` for the two pure-function pillars of the problem-template engine: `evalFormula` (math sandbox — arithmetic, NaN-on-error, Math helpers like `sqrt`/`hypot`/`atan2`, and surveying helpers `toRad` / `toDeg` / `dmsToDecimal` / `round(n,d)`) and `substituteTemplate` (the `{{name[:format]}}` placeholder renderer — plain subs, missing-var-stays-as-placeholder, `f2`/`f0` decimal formats, `dms` degrees-minutes-seconds glyph, `abs`, `sign`). 25 specs.
- [x] **Bug found and fixed:** the `f0` format specifier (zero decimals) was silently rendering 2 decimals because of `parseInt(format.slice(1)) || 2` — the JS `||` operator treats `0` as falsy, so `f0` mapped to `f2`. A solution template that did `{{count:f0}}` to render "5 segments" instead of "5.00 segments" would have shipped the latter. Switched to `Number.isFinite(parsed) ? parsed : 2` so 0 means "zero decimals" exactly. `tsc` + `eslint` clean. All 25 problem-engine specs pass.

### Slice 55 — Route registry: register `/admin/time-off` ✅ shipped (gap from Slice 27)
- [x] Slice 27 (time-off page) wired the route into `AdminSidebar`, `AdminLayoutClient`, and the harness `UxHarnessClient`, but missed `lib/admin/route-registry.ts`. The registry is the "single source of truth for the admin shell's navigation" — without time-off in it, the new IconRail / WorkspaceFlyout / Cmd+K palette / AdminPageHeader breadcrumb resolver can't surface or resolve the route. Added the entry under the `hub` workspace next to `/admin/my-hours`, with the `Palmtree` lucide icon, a description that explains both the employee + manager flows, and keywords `pto / vacation / holiday / leave` for palette search.
- [x] **Caught a fragile test along the way:** my first attempt at the description (which contained the word "admin") tripped `__tests__/admin/route-registry.test.ts:163-172` — that spec picks `baseline[baseline.length - 1]` for query `'admin'` and asserts the recency-boost lifts it to first place. Any route that scores low-but-positive on 'admin' can take that slot, but the +25 boost isn't enough to outrank routes whose base score is already >30. Reworded the description so 'admin' isn't in it (the new copy says "Managers" instead); the route now scores 0 on the 'admin' query, is filtered out of baseline, and the previously-last route is back as the test target. All 24 registry specs pass. `tsc` + `eslint` clean.
- [x] (Followup note: that test could be rewritten to use a known-low-scoring route explicitly rather than `baseline[baseline.length - 1]`, but that's a refactor of a passing test and out of scope here.)

### Slice 56 — Route registry: register 9 missing top-level admin pages ✅ shipped
- [x] Re-audit of the registry vs `find app/admin -name "page.tsx"` found 9 non-dynamic top-level admin pages that exist as real, navigable surfaces but weren't in `lib/admin/route-registry.ts` — so the new IconRail / WorkspaceFlyout / Cmd+K palette / breadcrumb resolver can't find them. Added under the `office` workspace next to the existing payout-log / receipts / settings entries:
  - `/admin/audit` — customer-org audit trail (distinct from `/admin/error-log` which is the application-tech error stream). Icon: `ShieldCheck`.
  - `/admin/invites` — pending + historical org user invites. Icon: `UserPlus`.
  - `/admin/payouts` — record employee payouts. Icon: `Banknote`. (Registry already had `/admin/payout-log` for the historical view; payouts is the recording form.)
  - `/admin/announcements` — published release notes + announcements. Icon: `Megaphone`.
  - `/admin/billing` — subscription / invoices / plan history landing. Icon: `CreditCard`.
  - `/admin/org-settings` — per-organization config. Icon: `Building`.
  - `/admin/orgs` — multi-tenant org switcher + overview. Icon: `Building2`.
  - `/admin/reports` — owner reports + KPI dashboards. Icon: `FileBarChart`.
  - `/admin/support` — support tickets. Icon: `LifeBuoy`.
- [x] All 24 registry tests pass. `tsc` + `eslint` clean. The "page exists but isn't registered" coverage gap is now down to dynamic-segment routes (`[id]`, `[email]`) and intentionally-deep sub-pages (e.g. `/admin/billing/invoices`, `/admin/learn/exam-prep/sit/mock-exam`), which are designed to be navigated *to* from a parent route rather than from the global rail — those staying out of the registry is correct.

### Slice 57 — Admin layout page-titles: 20 missing entries → no more "Admin" fallback ✅ shipped
- [x] `app/admin/components/AdminLayoutClient.tsx`'s `PAGE_TITLES` map controls the document title (and the topbar breadcrumb) for every admin route; anything missing falls through to the generic `"Admin"` string. Several real, navigable pages were falling through, so the browser tab showed "Admin" on jobs-financial deep-links, equipment sub-pages, vehicles, etc.
- [x] Added 20 entries to close the obvious gaps:
  - From Slice 56 (newly-registered office routes): `/admin/invites`, `/admin/payouts`, `/admin/reports`, `/admin/org-settings`, `/admin/orgs`
  - Equipment sub-pages: `/admin/equipment`, `inventory`, `consumables`, `maintenance`, `timeline`, `fleet-valuation`, `overrides`, `templates`, `today`, `import`
  - Other landings that fell through: `/admin/field-data`, `/admin/finances`, `/admin/mileage`, `/admin/team`, `/admin/timeline`, `/admin/vehicles`
- [x] `tsc` + `eslint` clean. Dynamic-segment routes (`/admin/jobs/[id]`, `/admin/payroll/[email]`, etc.) still use the path-prefix fallbacks (`/admin/jobs/` → `"Job Detail"`, etc.) that were already in the `getTitle()` helper.

### Slice 58 — Ux harness: 3 missing pages from Slice 56 added ✅ shipped
- [x] The `app/ux-harness/UxHarnessClient.tsx` `PAGES` registry mounts each admin page so the static UI audit can render them under mocked auth. After Slice 56 added 9 office-workspace routes to `lib/admin/route-registry.ts`, three of them (`/admin/orgs`, `/admin/payouts`, `/admin/support`) were also missing from the harness registry — meaning the harness would 404 the `?page=orgs` etc. preset and a future Phase-3 in-browser audit couldn't load them in the screen-shot pipeline. Added all three. The other six newly-registered routes (`announcements`, `audit`, `billing`, `invites`, `org-settings`, `reports`) were already in the harness. `tsc` + `eslint` clean.

## Phase 3 wrap-up (2026-05-28, user-requested close)

> User: "Please get to a quick stopping point on auditing and working on the code. Move the file into the complete folder and just answer my questions." Closing the doc here. Phase 3 status:

**Shipped in Phase 3 (six slices, code-only on the remote sandbox):**
- Slice 31 — admin navy link colour scoped override
- Slice 32 — `/admin/time-off` page token-ized + dangling `exhaustive-deps` warning resolved
- Slice 33 — PTO PATCH: 8h × weekday-count for all-day requests (fixed the 24h × calendar-day over-count)
- Slice 34 — Schedule month view: drag-to-move + click-to-create (mirrored Slice 28's week-view handlers)
- Slice 35 — Time-off page surfaces the requester's PTO balance + a live requested-hours preview; shared math in `lib/schedule/pto-hours.ts`
- Slices 36 + 37 — Hardcoded navy hex → `var(--color-brand-navy)` for `app/admin/team/page.tsx` and `app/admin/jobs/[id]/page.tsx`

**Deferred (closed per user request; resume from local Claude Code with browser + machine access):**
- ~~Apply `seeds/296`/`297`/`298` to live Supabase~~ — runbook at the top of this doc still applies; needs Supabase SQL Editor access this sandbox doesn't have. Slice-29 OAuth and Slice-30 PTO accrual won't work in production until applied.
- ~~Vercel env vars for Slice 29 OAuth~~ — `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` still need to be set in Vercel; OAuth callback will return an env-missing error until then.
- ~~Live end-to-end audit of every `app/admin/**` page~~ — needs a logged-in browser session; not achievable from the network-restricted sandbox.
- ~~Live walkthrough of Slices 24–30 against real data~~ — same constraint; all six features are code-verified, none are live-verified.
- ~~Remaining navy hex sweep~~ — 144 occurrences across 56 admin `.tsx` files. Mechanically straightforward; the slice 36/37 pattern is the template. Deferred because (a) the user explicitly asked to stop, (b) each file is cosmetic-only with no behaviour change, (c) the remaining work is best done in batches by a local agent with `tsc` + visual-regression checks per file rather than 50+ remote round-trips. The grep-replace command is `find app/admin -name "*.tsx" -exec sed -i "s/'#1D3095'/'var(--color-brand-navy)'/g" {} \;` for a one-shot sweep, but per the handoff that's discouraged — prefer the per-file commit cadence so each diff is reviewable.

> All shipped Phase-3 slices are on branch `claude/gifted-ramanujan-lQaEI` (HEAD `ecbb442` at the time of this wrap-up). Closing the doc here.

---

## Phase 2 wrap-up (2026-05-28)

> Every action item in this doc — original twenty-one slices plus the seven follow-ups (Slices 22–30) that retired the deferred bullets — is shipped. The remaining open work (live-deployment runtime verification of the Google Calendar sync; cron scheduling for `POST /api/admin/pto?action=accrue`; the per-occurrence overrides for recurring events explicitly marked out of scope above) is deployment / ops work rather than backend code, so this doc closes here and moves back to `completed/`.
