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
- [x] **A2 — Tap-to-call customer number (web). ✅ SHIPPED** (`add340b3`). `telHref` + a "📞 Call" link
      beside the client phone. **Multiple numbers via `job_contacts` is a follow-up** (the primary
      `client_phone` is wired now).
- [x] **A3 — One-tap access to a job's research / notes / documents. ✅ SHIPPED** (`7334139c`). The Work
      Mode hub's Files tab (`JobFiles`) fetches `/api/admin/jobs/files`, groups by section (Research,
      General, …), and opens any doc in one tap — completing B2's files panel. The job detail page already
      had `JobFileManager` for the same on the web side.
- [ ] **A4 — Tests.** the maps URL is built from lat/lng when present and falls back to the address;
      `tel:`/maps links render for each available number/address; no crash when phone/address is blank.

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
      of notes for review-by-others is a follow-up** (local-per-device today).
- [ ] **B4 — Quick capture with notes → saved immediately.** In-hub photo/video capture that attaches a
      note and writes to `field_media` (`job_id`, `media_type`, `storage_url`, capture metadata) right
      away for review. On web this uses a file/camera input; the resilient upload path is Area C. (Mobile
      already has capture — B4 is the web-hub counterpart + shared note-attach model.)
- [ ] **B5 — Tests.** selecting a job populates the hub panels from the job APIs; the RPLS + crew list
      render from `job_team`; a captured photo enqueues a `field_media` row tied to the job.

## Area C — Resilient background upload queue (the core ask)

**Already built (mobile, substantial):** `mobile/lib/uploadQueue.ts` — offline-first queue on a local
`pending_uploads` table: `enqueueAndAttempt()`, `processQueue()`, exponential backoff (`MAX_RETRIES=8`),
Wi-Fi-only gating for large video (`require_wifi`), lifecycle `pending → wifi-waiting → done/failed`,
stuck-upload triage (`useStuckUploads`, `retryUpload`, `discardUpload`), drainer `useUploadQueueDrainer`.
Parent tables `receipts | field_media | job_files`. Media helpers `mobile/lib/storage/mediaUpload.ts`,
docs `mobile/lib/jobFiles.ts`. This is the foundation — the user's requirements are mostly refinements of
it, plus surfacing controls.

**Gaps (map each to the user's explicit asks):**

- [ ] **C1 — Strictly sequential, one-at-a-time uploads.** Ensure the queue uploads exactly ONE file at a
      time and only starts the next when the current is fully committed to cloud storage + DB row
      confirmed (the user was explicit). Verify/enforce a single in-flight slot in `processQueue()`.
- [ ] **C2 — Background continuation while using other apps/features.** Uploads must continue while the
      worker uses the rest of the hub/app or leaves the app. Use Expo background upload/task facilities
      (`expo-task-manager` / `expo-background-fetch` or resumable uploads) so a backgrounded/again-
      foregrounded app keeps draining the queue. Document the platform limits honestly (iOS background
      execution windows) rather than promising more than the OS allows.
- [ ] **C3 — A visible queue + status screen.** Extend `mobile/app/(tabs)/me/uploads.tsx` into a real
      queue view: each item shows name, size, target job, and state (uploading %, queued, wifi-waiting,
      failed, done). The user wants to check status + see queued files at any time.
- [ ] **C4 — Manual queue control: pause, prioritize, reorder.** Let the user pause the active upload,
      pick a specific file to upload first (jump the queue), and drag-reorder the pending list. Back this
      with an explicit `queue_position` / priority column on `pending_uploads` and a stable ordering in
      `processQueue()`.
- [ ] **C5 — Failure choices per the user's flow.** On a failed upload, notify, and offer three actions:
      **(a)** save the media locally and forget it (drop from queue, keep the local file), **(b)** retry
      immediately, **(c)** wait and auto-retry in the background when reception improves (the default —
      already the backoff/wifi-waiting behavior; wire the explicit choice UI on top of it).
- [ ] **C6 — Notifications.** A local notification on failure (and optionally on all-done) so the worker
      knows without watching the screen (`expo-notifications`).
- [ ] **C7 — Tests.** the queue processes strictly sequentially (second starts only after first's DB row
      confirms); reordering/prioritizing changes upload order; a failure surfaces the three choices and
      "save-local-forget" removes it from the queue while keeping the file; backoff still auto-retries.

---

### Sequencing & scope honesty
A (job tap-to-act — small, high daily value) first; then B (Work Mode hub — the streamlined field
surface); then C (upload queue refinements on the existing mobile foundation). Area C's background-execution
slices depend on Expo/native capabilities — where the OS caps background work, say so in the slice's
completion note rather than over-promising. Web vs mobile split: capture + resilient upload is primarily a
**mobile** concern (the real field device); the web hub (Area B) gets capture but leans on the same
`field_media`/`job_files` model. Some pieces are live-DB-only schema — apply + verify seeds against
Supabase, don't assume a CREATE TABLE exists.
