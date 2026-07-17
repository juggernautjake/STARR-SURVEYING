# Surveying — Job Info, Work Mode Field Hub, & Resilient Background Uploads (2026-07-16)

A grounded plan for the field-work program: rich job info (tap-to-call / tap-to-navigate), a real Work
Mode field hub that pulls a selected job's everything into one streamlined surface, and background,
resumable, queued media uploads that survive bad reception. **Verified against live code 2026-07-16** —
each slice states what exists and what the gap is, so we extend rather than rebuild.

Schema note (important): there is **no `supabase/migrations/`** — schema is numbered `.sql` in `seeds/`,
applied by `scripts/apply-seeds.mjs` (`npm run db:seed`). The core `jobs` and `job_team` tables are
**live-only** (not snapshotted in seeds); every change is `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
Apply + verify against live Supabase per `[[project_apply_seeds_to_supabase]]`. Branch off `main`, PR.

---

## Area A — Job info: everything on the job, tap-to-act

**Already built:** `jobs` has `client_phone`, `address`/`city`/`county`/`state`/`zip`, `latitude`/
`longitude`, `description`, `notes`, `lead_rpls_email`, `deliverables`. Create/edit UI:
`app/admin/jobs/new/page.tsx`, `app/admin/jobs/[id]/page.tsx` (inline edit). Multiple contacts via
`contacts` + `job_contacts` (`seeds/305`). Files via `job_files` (DB-row) + `JobFileManager.tsx`.
Research/notes exist per job.

**Gaps:**

- [x] **A1 — Tap-to-navigate address (web). ✅ SHIPPED** (`add340b3`). `lib/jobs/location.ts` `jobMapsUrl`
      (prefers exact lat/lng, else the formatted address; Google Maps universal directions URL the OS
      routes to the user's nav app) + a "🧭 Navigate to property" link on the job detail. 9 tests.
      **Mobile handler (`Linking.openURL` chooser) is a follow-up** once the mobile job screen is touched.
- [x] **A2 — Tap-to-call customer number(s) (web). ✅ SHIPPED** (`add340b3`, `2ef694f1`). `telHref` + a
      "📞 Call" link beside the client phone AND beside **every linked contact** (realtor/lender/… via
      `job_contacts`) that has a phone — so all of a job's numbers are one-tap dialable.
- [x] **A3 — One-tap access to a job's research / notes / documents. ✅ SHIPPED** (`7334139c`). The Work
      Mode hub's Files tab (`JobFiles`) fetches `/api/admin/jobs/files`, groups by section (Research,
      General, …), and opens any doc in one tap — completing B2's files panel. The job detail page already
      had `JobFileManager` for the same on the web side.
- [x] **A4 — Tests. ✅ SHIPPED** (`__tests__/jobs/location.test.ts`). Covers `formatJobAddress` (joins /
      drops missing parts / empty), `hasJobLocation` (coords-or-address, a lone lat is not a location),
      `jobMapsUrl` (prefers lat/lng, coerces string coords, falls back to the address, empty when nothing),
      and `telHref` (strips symbols, keeps a leading +, empty for no-digits). The blank/no-crash cases the
      item names are all asserted.

## Area B — Work Mode field hub (scaffold → real)

**Already built:** web work-mode store `lib/work-mode/work-mode-store.ts` (`enterWorkMode(mode, jobId?)`,
`jobId`, persisted); the "Enter Work Mode" CTA `app/admin/me/components/WorkModePrompt.tsx` → role
workspaces under `app/admin/work-mode/<role>/`. **But** `field_crew/_components/FieldCrewWorkspace.tsx` is
a non-functional scaffold — tabs (Job, Photo, Points, Mileage, Receipts, Crew, Equipment, Time, Files,
Issue) render only titles; the `JobPicker` is a placeholder input.

**Gaps:**

- [x] **B1 — Real job selection on entering Work Mode. ✅ SHIPPED** (`e0b08efe`). The placeholder input is
      a real job `<select>` loaded from `/api/admin/jobs?limit=200`; the choice persists to the work-mode
      store's `jobId`. (Filtering to the worker's own jobs via `?myJobs=1` is a small follow-up.)
- [x] **B2 — The hub pulls the selected job's customer/property/RPLS/crew. ✅ SHIPPED** (`e0b08efe`). The
      Job tab (`JobSummary`) shows customer (name + tap-to-call), property (address + county +
      tap-to-navigate via the shared `lib/jobs/location` helpers), lead RPLS (`job_team` role=`lead_rpls`
      or `lead_rpls_email`), and crew (`job_team`). **The files/research/notes panel (A3) inside the hub is
      the remaining part of B2.**
- [x] **B3 — Calculator + notes in the hub. ✅ SHIPPED** (`6753e732`). A 🧮 Calc tab (button-driven, on a
      new SAFE arithmetic evaluator `lib/jobs/calc.ts` — tokenize→shunting-yard→RPN, never eval; 6 tests)
      and a 📝 Notes tab (per-job field notes auto-saved to localStorage, keyed by job). **DB-persistence
      of notes for review-by-others is a follow-up** (local-per-device today). **Calc correctness fix**
      (`c3b10367`): `3*-(2)` gave -2 not -6 — unary minus before a `(` was modelled as `0 - …`, which a
      preceding `*`/`/` bound wrongly; replaced with a proper right-associative unary-minus operator. Tests
      hardened 6 → 14 (unary in every position, malformed input, nested precedence).
- [~] **B4 — Quick capture with notes.** ✅ *Review side shipped* (`5f18f4eb`): the hub's Photo tab
      (`JobMedia`) shows the job's captured `field_media` (signed thumbnails/originals) as a read-only
      gallery. **Deferred — web capture-to-`field_media` upload:** there is no web storage-upload path for
      field media today (capture is mobile-only, and the plan itself scopes capture as "primarily a mobile
      concern"). Building a parallel web camera→storage→field_media pipeline is lower value than the mobile
      queue work; revisit if a web-capture need is confirmed.
- [~] **B5 — Tests.** selecting a job populates the hub panels from the job APIs; the RPLS + crew list
      render from `job_team`; a captured photo enqueues a `field_media` row tied to the job.
      **RPLS/crew derivation done** (`a09ee4de`): the "who's on this job" split was pure logic inline in
      `FieldCrewWorkspace`; extracted to `lib/jobs/crew.ts` (`jobRpls`/`jobCrew`/`crewNames`) + `crew.test.ts`
      (7) — RPLS = the `lead_rpls` member's name → `lead_rpls_email` fallback → null; crew = everyone else
      (→ "Just you" when empty). Two more hub derivations extracted the same way (`9d93c1b4`): the
      `job_number · name` label (was duplicated across the picker + header) and the A3 files-by-section
      grouping (`lib/jobs/hub.ts`, `hub.test.ts` +4). **Remaining:** the API-population +
      capture-enqueues-field_media parts need component/route tests with mocks — device/runtime-adjacent,
      deferred with the rest of Area C.

## Area C — Resilient background upload queue (the core ask)

**Already built (mobile, substantial):** `mobile/lib/uploadQueue.ts` — offline-first queue on a local
`pending_uploads` table: `enqueueAndAttempt()`, `processQueue()`, exponential backoff (`MAX_RETRIES=8`),
Wi-Fi-only gating for large video (`require_wifi`), lifecycle `pending → wifi-waiting → done/failed`,
stuck-upload triage (`useStuckUploads`, `retryUpload`, `discardUpload`), drainer `useUploadQueueDrainer`.
Parent tables `receipts | field_media | job_files`. Media helpers `mobile/lib/storage/mediaUpload.ts`,
docs `mobile/lib/jobFiles.ts`. This is the foundation — the user's requirements are mostly refinements of
it, plus surfacing controls.

**Foundation fix (`7dd68d3e`):** the queue persists each captured file under a name ending in the
source's extension so the OS knows the MIME type on re-read — but `guessExtension` used
`endsWith('.jpg')`, so a content/remote URI like `photo.jpg?token=…` or `clip.mov#t=3` matched nothing
and the file was stored with NO extension. Extracted to a pure `mobile/lib/mediaPath.ts` (Expo-free,
unit-testable like `queueOrder`), now stripping any query string/fragment first. `media-path.test.ts` (3).
Also moved the storage-path **filename sanitiser** (`sanitiseName`, `1a648920`) into the same pure
module and locked its security property with tests — it can never emit a path separator, so a
`../../etc/passwd` filename can't traverse the object key. +4 tests (no behavior change; a guard on a
user-input → storage-key helper).

**Gaps (map each to the user's explicit asks):**

- [~] **C1 — Strictly sequential, one-at-a-time uploads.** ✅ *Pure engine shipped* (`b7b722e7`):
      `mobile/lib/queueOrder.ts` `nextUpload()` returns exactly ONE front-of-queue eligible row (8 tests).
      `processQueue()` already loops sequentially (`await tryOne` per row). **Remaining:** switch
      `processQueue` to drain via `nextUpload` in a loop (re-query after each confirmed DB write) so
      pause/priority take effect — a mobile-runtime change to device-test.
- [ ] **C2 — Background continuation while using other apps/features.** Uploads must continue while the
      worker uses the rest of the hub/app or leaves the app. Use Expo background upload/task facilities
      (`expo-task-manager` / `expo-background-fetch` or resumable uploads) so a backgrounded/again-
      foregrounded app keeps draining the queue. Document the platform limits honestly (iOS background
      execution windows) rather than promising more than the OS allows.
- [ ] **C3 — A visible queue + status screen.** Extend `mobile/app/(tabs)/me/uploads.tsx` into a real
      queue view: each item shows name, size, target job, and state (uploading %, queued, wifi-waiting,
      failed, done). The user wants to check status + see queued files at any time.
- [~] **C4 — Manual queue control: pause, prioritize, reorder.** ✅ *Pure logic shipped* (`b7b722e7`):
      `isEligible` honors a `paused` flag; `orderedQueue` sorts by `queue_position` (FIFO fallback);
      `prioritizePosition` ("upload this first") + `reorderPositions` (drag-reorder). **Remaining:** add
      the `paused` + `queue_position` columns to the `pending_uploads` local schema and the queue-screen
      buttons that write them — mobile-runtime, device-tested.
- [~] **C5 — Failure choices per the user's flow.** ✅ *Pure decision engine shipped* (`a7c00bd2`):
      `mobile/lib/uploadFailureChoices.ts` — `needsFailureDecision` (queue hit the retry cap),
      `failureChoices` (the three options, wait-for-reception flagged default), and `resolveFailureChoice`
      → a deterministic row-mutation descriptor. **(a)** save-local-forget drops the queue row but KEEPS
      the local file (the gap: `discardUpload` deletes it — the opposite of what the surveyor asked);
      **(b)** retry-now clears the failure + kicks a drain; **(c)** wait-reception re-queues gated on
      Wi-Fi. No choice ever deletes the captured bytes. `upload-failure-choices.test.ts` (13). **Remaining
      (mobile-runtime, device-tested):** wire the choice UI onto the failed-upload row in the queue screen
      + the failure notification action, and add a `saveLocalAndForget(db, id)` that applies the
      `removeRow`/keep-file descriptor (a thin sibling of the existing `discardUpload`).
- [ ] **C6 — Notifications.** A local notification on failure (and optionally on all-done) so the worker
      knows without watching the screen (`expo-notifications`).
- [x] **C7 — Tests. ✅ SHIPPED** (`__tests__/mobile/queue-order.test.ts` + `upload-failure-choices.test.ts`).
      The ordering engine is covered (strict one-at-a-time `nextUpload`, FIFO vs `queue_position`,
      eligibility gating, prioritize + reorder — 8 tests), and the failure-choice engine is covered
      (the three choices surface, save-local-forget removes the row while keeping the file, backoff/retry
      stay eligible — 13 tests). The device-side drain-order/notification behavior these pure engines feed
      remains a mobile-runtime concern tracked under C1/C2/C5.

---

### Sequencing & scope honesty
A (job tap-to-act — small, high daily value) first; then B (Work Mode hub — the streamlined field
surface); then C (upload queue refinements on the existing mobile foundation). Area C's background-execution
slices depend on Expo/native capabilities — where the OS caps background work, say so in the slice's
completion note rather than over-promising. Web vs mobile split: capture + resilient upload is primarily a
**mobile** concern (the real field device); the web hub (Area B) gets capture but leans on the same
`field_media`/`job_files` model. Some pieces are live-DB-only schema — apply + verify seeds against
Supabase, don't assume a CREATE TABLE exists.
