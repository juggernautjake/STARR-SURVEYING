# Surveying — Job Info, Work Mode Field Hub, & Resilient Background Uploads (2026-07-16)

> **⏸ STATUS (2026-07-17): the DECISION LAYER is COMPLETE; the remainder is DEVICE-TESTED runtime I/O.**
> Every pure decision in the capture→save-to-phone→send→sequential-drain→progress→notify→delete-after-confirmed
> flow is now an Expo-free, unit-tested function, and the two composed brains (`nextDrainStep` +
> `planAfterUpload`) are integration-tested end-to-end (`mobile/lib/`: `queueOrder`, `uploadStatus`,
> `uploadMode`, `uploadFailureChoices`, `uploadNotify`, `uploadRetention`, `uploadProgress`, `cameraRollSave`,
> `drainDecision`, `uploadOutcome`, `mediaPath`). **What remains needs a device:** wiring these into the Expo
> runtime — the actual `fetch`/DB writes, a URLSession-backed background upload task, the progress callback,
> firing `expo-notifications`, the MediaLibrary camera-roll save, and the queue-screen UI. Those can only be
> built + verified on real iOS/Android by the owner. This doc stays in-progress until that runtime ships.

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
      gallery. **Review-tile derivation extracted + tested** (`adcf0fb3`): `mediaDisplay()` in
      `lib/jobs/hub.ts` locks the thumb/link URL fallbacks (thumbnail→storage, original→storage) and the
      photo-vs-icon decision (video/voice/doc glyphs); `hub.test.ts` +4. **Deferred — web
      capture-to-`field_media` upload:** there is no web storage-upload path for
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
      grouping (`lib/jobs/hub.ts`, `hub.test.ts` +4). **Stale-test fix (2026-07-17):** the `crew.ts`
      extraction above left `field-crew-workspace.test.ts` B2 asserting the old inline `'lead_rpls'` literal
      in the component — which had moved into the helper — so that test was RED (surfaced by a full-suite
      run; the DnD-scoped runs never touched it). Repointed the assertion at the current architecture: the
      component consumes `jobRpls(job)`/`jobCrew(job)` and the `lead_rpls` role split is asserted against
      `lib/jobs/crew.ts` where it now lives. Whole app suite green again (13,079 passing).
      **Case-fragmentation bug fixed in `groupFilesBySection` (2026-07-17):** the A3 files panel grouped by a
      title-cased section, but title-casing only touches word-STARTS — so "general" → "General" while
      "GENERAL" stayed "GENERAL", splitting one section into two panel headers when files arrive in different
      casing from different sources (`file_nodes` vs the read-only `mnt:` mounts). Now groups case-
      INSENSITIVELY (lowercase key) while DISPLAYING the first-seen casing title-cased — which also preserves
      acronyms a blanket `toLowerCase` would mangle ("USGS Data", not "Usgs Data"). `hub.test.ts` +2
      (case-insensitive merge + the acronym case); the existing consistent-case cases are unchanged.
      **Remaining:** the
      API-population + capture-enqueues-field_media parts need component/route tests with mocks —
      device/runtime-adjacent, deferred with the rest of Area C.

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
user-input → storage-key helper). **Sneaky-vector coverage added (2026-07-17):** audited `sanitiseName`
and confirmed its safety comes from the WHITELIST (`[^A-Za-z0-9._\- ] → _`), not the ASCII slash-strip —
so it already neutralizes the vectors a naive slash-only sanitiser would miss (Unicode "slashes" U+FF0F/
U+2215/U+2044, a null byte, tab/newline control chars). Pinned those explicitly + a sweep asserting the
output is ALWAYS drawn from the safe alphabet, so a future "optimize to a slash blocklist" regression
fails the security test. `media-path.test.ts` +1 (test-only; the sanitiser was already correct).

**The target flow, in the owner's own words (2026-07-17) — this is the acceptance spec:**

> In the Starr Surveying app I'd hit the camera button (I'd likely be in Work Mode). The app accesses the
> device camera. I take the video or picture. The media shows up in the app **and is saved to the phone**.
> Once I'm happy with it, I hit a button to **send the media to the job cloud**. It begins uploading and
> there's a **queue screen with a loading bar** for how close the current item is to done. When it finishes
> I get a **notification**, and if there are more, the **next one begins**. I need to set the queue to
> **automatic**, or **manual** (I tell it to upload the next thing), or **pause all**. Once a file has
> uploaded, I need an **option to delete it from my phone** (so I don't have to keep every video/picture).
> Once uploaded, **everyone authorized to see the job** can see the media in that job's media folder on the
> website or app. I **really need the uploads to complete in the background** while I keep using my phone.

So the end-to-end chain is: **capture → auto-save to camera roll → appears in-app → tap _Send to job cloud_
→ sequential upload with a live per-item progress bar, continuing in the background → local notification as
each finishes and the next starts → auto / manual / pause modes → prompt to delete the local copy after a
CONFIRMED upload → visible to every authorized job viewer (web + app).** The pure engines below
(`queueOrder`, `uploadFailureChoices`, `uploadStatus`) already encode the decision logic; the remaining
work is the runtime wiring — camera-roll save, a real background task, progress reporting, the queue
screen, notifications, mode controls, and a safe delete-after-upload — which is device-tested on iOS +
Android (the owner runs those; each slice states its platform limits honestly).

**Additional considerations to honor (some the owner may not have listed):** never delete captured bytes
before the upload is CONFIRMED server-side; iOS caps background execution — use a real background-upload
transport (URLSession-backed) rather than promising unlimited background time, and document the cap;
request camera-roll (MediaLibrary) + notification permissions at the right moment with honest copy; keep
the existing Wi-Fi-only gate for large video as a user option; a "delete from phone" that only removes the
app's working copy (leaving the camera-roll asset) vs. also removing the camera-roll asset is a real
choice — default to removing only the app's copy unless the user opts into full deletion.

**Capture → save-to-phone decision ✅ *pure engine shipped* (`mobile/lib/cameraRollSave.ts`):** the owner's
"the media shows up in the app AND is saved to the phone" — `shouldSaveToCameraRoll(pref)` defaults **ON**
(opt-OUT), unlike the app's existing opt-in device backup (`deviceLibrary` defaults OFF); a missing/corrupt
pref still saves (never silently loses the capture from the phone). `camera-roll-save.test.ts` (4).
**Remaining (mobile-runtime):** wire the capture path to save via MediaLibrary by default using this decision
+ a settings toggle. *(With this, EVERY decision in the capture→save→send→drain→progress→notify→delete flow
is a pure, tested function; the runtime is pure I/O around them.)*

**Gaps (map each to the user's explicit asks):**

- [~] **C1 — Strictly sequential, one-at-a-time uploads.** ✅ *Pure engine shipped* (`b7b722e7`):
      `mobile/lib/queueOrder.ts` `nextUpload()` returns exactly ONE front-of-queue eligible row (8 tests).
      `processQueue()` already loops sequentially (`await tryOne` per row). **Remaining:** switch
      `processQueue` to drain via `nextUpload` in a loop (re-query after each confirmed DB write) so
      pause/priority take effect — a mobile-runtime change to device-test. **Composed drain-brain shipped**
      (`mobile/lib/drainDecision.ts`): `nextDrainStep({mode, rows, env, userInitiated})` folds the mode
      (uploadMode), the strict one-at-a-time ordering (queueOrder.nextUpload), and the Wi-Fi/backoff/network
      eligibility into ONE next-action — `upload row` / `paused` / `blocked (with reason)` / `idle` — so the
      runtime drain loop becomes trivial (call it, act, repeat) and distinguishes "blocked but has work" from
      "truly done". `drain-decision.test.ts` (4). Every drain decision is now pure + tested; only the loop
      that calls it (re-query after each confirmed write) is the device-tested part. **Post-upload plan
      shipped** (`mobile/lib/uploadOutcome.ts`): `planAfterUpload(result, {mode, notifyLevel, retentionPref,
      savedToCameraRoll})` — the counterpart to `nextDrainStep` — composes the notification (uploadNotify),
      the confirmed-only retention decision (uploadRetention), and whether to auto-advance
      (uploadMode.shouldAutoAdvance) into ONE plan, so the runtime's result handler is trivial too. Failure
      plans a notification but never retention (nothing uploaded) and never advances past the failure.
      `upload-outcome.test.ts` (5). Together `nextDrainStep` + `planAfterUpload` are the drain loop's entire
      logic — the runtime only does the I/O (fetch, DB write, fire notification, delete file).
      **Backoff SCHEDULE extracted + guarded (2026-07-17):** the retry cadence itself — `next_attempt_at =
      now + BACKOFF_MS[min(retry_count, len−1)]` — was computed INLINE in the DB-writing `recordFailure` and
      untested (the tests covered `backoffSecondsLeft`/the backoff STATE, i.e. time-left given a
      next_attempt_at, but not the schedule that PRODUCES it). Extracted `backoffMsForRetry(retryCount)` to a
      pure `mobile/lib/uploadBackoff.ts` (like `queueOrder`): pins the 5s→10s→…→300s doubling and its
      ceiling clamp, AND floors a negative/NaN retry_count (the old `Math.min(-1, len−1)` read
      `BACKOFF_MS[-1] = undefined` → a NaN `next_attempt_at`, which would make a row back off forever or
      never). `upload-backoff.test.ts` (4). Now every retry delay is provably a positive finite number.
      **Delete-safety classification extracted + guarded (2026-07-17):** the single most safety-critical
      branch in the queue — does the upload result mean the SERVER HAS THE FILE (safe to delete the local
      copy) or must we retry (preserve it)? — was computed inline in the DB-writing `tryOne` and untested. A
      misjudgement here deletes a surveyor's capture. Extracted `classifyUploadOutcome(errorMessage)` →
      `'uploaded' | 'retry'` (`uploadOutcome.ts`): a "duplicate/already exists" error is a prior session's
      success (uploaded, don't retry forever), no error is a clean success, and **ANY other error is a retry
      — never 'uploaded'**, so the queue can never delete a file the server didn't receive. `markSuccess`
      (which deletes the local file) is reached only on this 'uploaded' verdict, AFTER the server confirms.
      `upload-outcome.test.ts` +3 (incl. an explicit sweep of transient errors that must all read 'retry').
- [~] **C2 — Background continuation while using other apps/features.** Uploads must continue while the
      worker uses the rest of the hub/app or leaves the app. Use Expo background upload/task facilities
      (`expo-task-manager` / `expo-background-fetch` or resumable uploads) so a backgrounded/again-
      foregrounded app keeps draining the queue. Document the platform limits honestly (iOS background
      execution windows) rather than promising more than the OS allows.
      **✅ Two of the three continuation cases already hold, and the third's prompt-resume half shipped
      (2026-07-17):** (1) *using other features IN the app* already keeps draining — `useUploadQueueDrainer`
      is mounted at the app root (`app/_layout.tsx`), so intra-app navigation never unmounts it. (2) *network
      restore while away-then-back* is covered by the existing `subscribeToOnline` drain. (3) *reopening the
      app after the OS suspended it* now drains **immediately** instead of stalling up to the 60s periodic
      interval: the drainer wires `AppState` to a new pure decision `shouldDrainOnAppStateChange(prev, next)`
      (`mobile/lib/appStateDrain.ts`, Expo/RN-free, `app-state-drain.test.ts` 6) that fires a drain exactly
      when the app returns to `active` from a non-active state. **Remaining (genuinely device/native, honest
      OS limits):** true *background execution* — uploading while the app is fully backgrounded and the user
      is in another app — still needs `expo-task-manager`/`expo-background-fetch` (or resumable background
      uploads) and is hard-bounded by iOS's short background windows; that is the only part the prompt-resume
      drain does not cover, and it must be device-tested. The pure resume policy is done + tested.
- [~] **C3 — A visible queue + status screen.** ✅ *Pure state engine shipped* (`5bbdbddd`):
      `mobile/lib/uploadStatus.ts` — `deriveUploadState(row, ctx)` maps a `pending_uploads` row to the
      exact chip the screen shows (uploading / paused / wifi-waiting / offline-waiting / backoff / queued /
      failed) with a documented precedence; `summarizeQueue` rolls the rows into a worst-first header
      (failures + blocks before cheerful progress), plus `uploadStateLabel` / `backoffSecondsLeft` /
      `isActiveState` / `isBlockedState`. Optional `paused`/`require_wifi` columns are read as falsy so it's
      correct before those schema slices land. `upload-status.test.ts` (17). **Partial-pause headline made
      honest (2026-07-17):** the fallback header counted `active` (= total − failed) as "Uploading N", which
      folded PAUSED rows into the uploading count — "Uploading 5 files" when 3 were paused. Now a partial
      pause reports both ("Uploading 2 files, 3 paused"); all-paused still reads "Uploads paused" and the
      no-pause path is unchanged. `upload-status.test.ts` +1. (Audited `deriveUploadState`'s precedence and
      `uploadProgress`/`formatBytes` in passing — both correct + already covered.) **Remaining:** extend
      `me/uploads.tsx` from the stuck-triage view into the full queue view that renders these states (and a
      live upload %, which is a runtime progress callback) — a mobile-runtime, device-tested change.
      **Progress-bar math shipped** (`mobile/lib/uploadProgress.ts`): `uploadProgress(sent, total)` →
      `{fraction, percent, indeterminate, label}` (clamped 0..1; a non-positive total = indeterminate bar) +
      `formatBytes` / `uploadSizeCaption` ("2.3 MB of 4.8 MB") for the bar's caption. The runtime feeds it the
      upload task's progress callback. `upload-progress.test.ts` (6). With this, EVERY pure decision in the
      capture→upload flow is extracted + tested; only the device-side wiring remains.
- [~] **C4 — Manual queue control: pause, prioritize, reorder.** ✅ *Pure logic shipped* (`b7b722e7`):
      `isEligible` honors a `paused` flag; `orderedQueue` sorts by `queue_position` (FIFO fallback);
      `prioritizePosition` ("upload this first") + `reorderPositions` (drag-reorder). **Remaining:** add
      the `paused` + `queue_position` columns to the `pending_uploads` local schema and the queue-screen
      buttons that write them — mobile-runtime, device-tested. **Queue-wide mode engine shipped**
      (`mobile/lib/uploadMode.ts`): the owner's distinct automatic / manual / pause-all setting (separate
      from per-row `paused`) — `canDrain(mode, {userInitiated})` (manual only drains on a user tap; paused
      never; automatic always), `shouldAutoAdvance` (only automatic pulls the next row on its own),
      `normalizeUploadMode` (corrupt/absent setting can't wedge the queue), labels/descriptions +
      `cycleUploadMode` for the toggle. `upload-mode.test.ts` (10). **Remaining:** persist the mode setting
      + gate the runtime drainer on `canDrain`/`shouldAutoAdvance` + the segmented control — mobile-runtime.
- [~] **C5 — Failure choices per the user's flow.** ✅ *Pure decision engine shipped* (`a7c00bd2`):
      `mobile/lib/uploadFailureChoices.ts` — `needsFailureDecision` (queue hit the retry cap),
      `failureChoices` (the three options, wait-for-reception flagged default), and `resolveFailureChoice`
      → a deterministic row-mutation descriptor. **(a)** save-local-forget drops the queue row but KEEPS
      the local file (the gap: `discardUpload` deletes it — the opposite of what the surveyor asked);
      **(b)** retry-now clears the failure + kicks a drain; **(c)** wait-reception re-queues gated on
      Wi-Fi. No choice ever deletes the captured bytes. `upload-failure-choices.test.ts` (13). **"No choice
      deletes the file" made exhaustive-by-construction (2026-07-17):** the safety sweep proving this
      iterated a HARDCODED choice list, so a future 4th choice could silently escape it. Flipped the module
      so `FailureChoice` DERIVES from a canonical `ALL_FAILURE_CHOICES` array (single source of truth — the
      union and the array can't drift), and the sweep now iterates that array + asserts the presentation
      list offers exactly the canonical set. Adding a choice forces a `resolveFailureChoice` switch case (TS
      exhaustiveness) AND auto-extends the data-loss guard. `upload-failure-choices.test.ts` (no behavior
      change; the invariant is now future-proof). **Remaining
      (mobile-runtime, device-tested):** wire the choice UI onto the failed-upload row in the queue screen
      + the failure notification action, and add a `saveLocalAndForget(db, id)` that applies the
      `removeRow`/keep-file descriptor (a thin sibling of the existing `discardUpload`). **Delete-after-upload
      decision shipped** (`mobile/lib/uploadRetention.ts`): the owner's "option to delete from phone once
      uploaded" — `retentionAfterUpload(pref, {uploadConfirmed, savedToCameraRoll})` returns whether to delete
      the app working copy / prompt / offer camera-roll deletion, with a HARD guard that **nothing is deleted
      until the upload is confirmed server-side** (captured bytes are never risked); `normalizeRetentionPref`
      (bad value → 'ask', never auto-delete) + labels. Replaces the current unconditional auto-delete in
      `markSuccess` once wired. `upload-retention.test.ts` (9 — hardened 2026-07-18: the `ask` prompt may offer
      camera-roll deletion while auto-deleting nothing, and — the key data-safety property — **`keep` never
      offers to delete the camera-roll copy even when one exists**, so a "keep on phone" standing choice can't
      quietly become a delete path for the user's own photo library). **Remaining:** the retention setting + the
      post-success prompt UI + swapping `markSuccess`'s delete for this — mobile-runtime, device-tested.
- [~] **C6 — Notifications.** A local notification on failure (and optionally on all-done) so the worker
      knows without watching the screen (`expo-notifications`). **Pure message composer shipped**
      (`mobile/lib/uploadNotify.ts`): `uploadNotification(event, level)` composes the title+body for each
      upload event — per-file done (with the remaining count; "last one → complete" when none remain),
      whole-queue all-done (total count), and failure (with a "Tap to retry" when retryable) — plus a
      verbosity `level` ('each' vs 'summary') that suppresses per-file pings while always notifying on
      all-done/failure, and a `shouldNotify` guard. `upload-notify.test.ts` (6). **Remaining (mobile-runtime,
      device-tested):** fire these via `expo-notifications` from the drainer (`processQueue`/`markSuccess`/
      failure path) + a notify-frequency setting.
- [x] **C7 — Tests. ✅ SHIPPED** (`__tests__/mobile/queue-order.test.ts` + `upload-failure-choices.test.ts`).
      The ordering engine is covered (strict one-at-a-time `nextUpload`, FIFO vs `queue_position`,
      eligibility gating, prioritize + reorder — 9 tests, +1 on 2026-07-18 pinning the **C4 × KK composition**:
      a PRIORITIZED but Wi-Fi-only row does NOT stall the queue on cellular — eligibility is filtered before
      ordering, so the next eligible row uploads, and the priority video only wins once on Wi-Fi), and the
      failure-choice engine is covered (the three choices surface, save-local-forget removes the row while
      keeping the file, backoff/retry stay eligible — 13 tests). The device-side drain-order/notification
      behavior these pure engines feed remains a mobile-runtime concern tracked under C1/C2/C5.

---

## Area D — Work Mode field toolset (owner directive 2026-07-18)

> Owner, verbatim intent: switch between jobs in Work Mode; a well-formatted **job info header** (property
> address, property id, customer phone numbers, …) at the top; below it a row of tool buttons — **camera,
> job files, job instructions, mileage tracker, compass, calculator, ask AI**, plus anything already built
> in the hub. Straightforward, job-focused, just the tools to get all kinds of surveying jobs done.
> **Camera** → a screen offering: plain photo/video for the job · a **receipt** photo · a **document for AI**
> to analyze · (other surveying applications). Captured media → the job file; **receipts also → the financial
> page**; every image carries **metadata** (time, location, job info, capturing device, who was on the job,
> and if possible who recorded it). A receipt is **auto-analyzed** and its data saved to financials; a
> document is analyzed/saved by AI. See **all** the job's screenshots/pdfs/research files. A **job
> instructions** page the RPLS/manager writes, able to **hyperlink files/documents/images**. A **mileage
> tracker** (start/end miles + the vehicle used; save/add/delete reusable vehicles; → financials). A
> **compass** reading azimuth + bearing, flawless + easy to read. A **calculator** — the best-formatted one
> for surveying: bearings↔azimuths, angle add/subtract, right/complementary angle, trig (law of sines/cosines,
> Pythagorean), and normal arithmetic; intuitive. An **AI assistant** you can type to OR talk to (voice both ways).

**Consolidation rule (owner):** do NOT build redundancies — combine new ideas into the existing systems and
refine. Substantial infrastructure already exists to build ON: bearing↔azimuth + DMS
(`lib/calculators/bearing-azimuth/convert.ts`), scientific trig (`lib/calculators/math.ts`), full calculator
models (`lib/calculators/models/*`), mileage + vehicles APIs (`app/api/admin/mileage`, `app/api/admin/vehicles`),
compass (`lib/cad/integrations/compass.ts`), the arithmetic field calc (`lib/jobs/calc.ts`, Area B3), the
`field_media`/`job_files`/`receipts` upload model, and the mobile upload decision layer (Area C). Each slice
below states what it reuses.

**Gaps:**

- [x] **D1 — Surveying calculator math (triangle + angle solving). ✅ SHIPPED.** The one genuine gap in the
      calculator's math (conversion + scientific trig already existed): `lib/surveying/triangle.ts` — angle
      add/subtract (decimal + DMS, wrapping 360), complement/supplement (validity-guarded), Pythagorean
      hypotenuse/leg, and law of sines/cosines (side + angle, with the SSA-impossible and triangle-inequality
      cases returning `null`, never NaN). Reuses the existing `Dms` type + `dmsToDecimal`/`decimalToDms` rather
      than re-deriving them. Pure + framework-free; `__tests__/surveying/triangle.test.ts` (15 — 3-4-5, 30-60-90,
      equilateral, and every impossible-input path). **Traverse math added (`lib/surveying/traverse.ts`):** the
      point primitives already existed (`forwardPoint`/`inverseBearingDistance` in `cad/geometry`), so this adds
      the missing TRAVERSE-level quantities a surveyor needs — `latitudeDeparture` (a course's N–S / E–W
      components), `traverseMisclosure` (a closed loop's linear error + 1:N precision ratio; "exact" when it
      closes), `areaByCoordinates` (parcel area by the shoelace method, orientation-independent), and
      `squareFeetToAcres`. `__tests__/surveying/traverse.test.ts` (12: square closes exact, short-leg precision,
      unit-square/rectangle area, acre conversion). **Direction angles added (`lib/surveying/angles.ts`):** the
      per-station angle math the diagram module lacked — `backAzimuth` (reverse direction), `angleRight`
      (clockwise sweep), `deflectionAngle` (magnitude + L/R/straight), and `interiorAngle` (verified: a square's
      four interior angles sum to 360 = (n−2)×180). Reuses `normalizeAngle` from `triangle.ts`.
      `__tests__/surveying/angles.test.ts` (9). **Operation CATALOG shipped (`lib/surveying/calculator.ts`):**
      the UI-ready single source of truth — `SURVEYING_OPERATIONS` lists every calculator operation
      (bearing↔azimuth, angle add/subtract, complement/supplement, back-azimuth, deflection, interior angle,
      Pythagorean hyp/leg, law of sines/cosines side+angle, latitude & departure), each with declared inputs +
      a pure `compute` that calls the existing module function and returns a FORMATTED value or a friendly
      error (never NaN, never throws). `operationsByCategory` groups them for a tabbed keypad. So the calculator
      SCREEN just renders this list — the buttons and the math can't drift. `__tests__/surveying/calculator.test.ts`
      (10: catalog integrity, no-throw on empty args, and representative correct computes). **Web keypad UI
      shipped:** the Work Mode Calc tab (`FieldCrewWorkspace`) now renders `SurveyingTools` alongside the
      arithmetic calc — a category-grouped operation picker (Bearing/Azimuth · Angles · Triangles & Trig ·
      Traverse) that fills each op's declared inputs (number fields or a quadrant select) and shows the live
      result, driven ENTIRELY by the pure catalog `compute` (no formula re-implemented in the component).
      `field-crew-workspace.test.ts` +1 (asserts the catalog wiring). **The web surveying calculator is
      complete;** the mobile-native keypad reuses the same catalog (a device-side render).
- [x] **D2 — Work Mode job switcher + job-info header. ✅ SHIPPED.** The `JobPicker` `<select>` switches the
      active job (persisted to the work-mode store); `JobSummary` shows the formatted address (`lib/jobs/location`
      `formatJobAddress`), county, job number + lat/long, and tap-to-navigate. This slice added `JobContacts` —
      it reads `GET /api/admin/jobs/contacts?job_id=` and renders EVERY job contact (client, county clerk,
      neighbor, title co…) with its role + a `telHref` tap-to-call and a mailto tap-to-email, so the crew reaches
      the right person from the field (was: only the client's number). `field-crew-workspace.test.ts` +1.
- [x] **D3 — Tool launcher row. ✅ SHIPPED (as the consolidated tab row, per the plan's own directive).** The
      `FieldCrewWorkspace` `TABS` bar IS the launcher: Job, Calc (arithmetic + surveying calculator), Notes,
      Instructions, Photo, Points, Mileage, Receipts, Crew, Equipment, Time, Files, Issue — each opening its
      surface in-place. The plan said to consolidate with these tabs rather than add a parallel nav, which is
      exactly the shape shipped. Camera/compass/ask-AI remain the device-gated surfaces tracked under D4/D7/D8.
- [~] **D4 — Camera capture modes + metadata. ✅ Pure decision layer shipped.** `mobile/lib/captureIntent.ts` —
      `captureDestination(intent)` routes each camera option to its store + post-processing without a parallel
      pipeline: job photo/video → `field_media` (the existing GPS/compass/time-stamping capture path), receipt →
      `receipts` (AI auto-analyze + financials), document → `job_files` (AI analyze). `CAPTURE_INTENTS` drives
      the option list; unknown intents fall back to a job photo (never routes to nowhere). `shouldAnalyze` gates
      the AI hand-off. `assembleCaptureMetadata(input)` is the owner's "every image gets time/location/job/
      device/crew/recorder" stamp in one place — always carries capturedAt + jobId, drops absent fields (a
      NaN/partial GPS fix, empty crew ids) so a partial capture yields a clean object, and never reads the clock
      (caller supplies the timestamp → testable). `__tests__/mobile/capture-intent.test.ts` (9). **Remaining
      (mobile-runtime):** the camera option screen UI, launching the camera per intent, the receipt auto-extract
      + document AI calls, and writing the row with this metadata — device-tested.
- [~] **D5 — Job instructions page (with file/image hyperlinks). ✅ Pure parser shipped.** `lib/jobs/instructions.ts`
      — instructions are text with markdown-flavoured file embeds `[label](job-file:<id>)` (and inline images
      `![alt](job-file:<id>)`, reusing existing `job_files`/`field_media` ids, no new store). `parseInstructions`
      tokenizes into text/link/image segments (malformed link-like text stays literal, never throws);
      `resolveInstructions` attaches each file's name+url or marks it broken (`file: null`) so a removed file
      renders a "missing" chip not a dead link; `extractFileRefs`/`brokenInstructionRefs` warn the RPLS before
      saving that a linked file is gone. Web + mobile render from the same parse. `__tests__/jobs/instructions.test.ts`
      (8). **Schema + API SHIPPED:** `seeds/452_job_instructions.sql` (applied live, idempotent) adds
      `jobs.instructions TEXT`; `GET/PUT /api/admin/jobs/[id]/instructions` — GET returns the raw text + the
      RESOLVED segments (embeds attached to their `job_files` name+url server-side, broken ones flagged) + a
      `canEdit` flag; PUT is limited to the job's lead RPLS or an org admin and warns which referenced files are
      missing (`brokenRefs`). Org-scoped (another org's job is 404). `instructions-route.test.ts` (4).
      **Instructions tab SHIPPED:** the Work Mode Instructions tab (`JobInstructions`) renders the resolved
      segments (text / tap-through file links / inline images / "missing file" chip) and gives the lead RPLS/admin
      a textarea + Save (PUT, surfacing broken links). **Remaining:** the mobile-native form only.
- [~] **D6 — Mileage tracker + reusable vehicles. ✅ Pure math shipped.** `lib/mileage/odometer.ts` — the
      MANUAL odometer entry the owner described (start/end reading + vehicle), distinct from the existing
      GPS-ping mileage but reusing the SAME `IRS_BUSINESS_RATE_2025` (no second rate to drift):
      `odometerMiles`/`validateOdometerEntry` (reversed/negative/absurd-day guards), `mileageReimbursement`,
      and `resolveOdometerEntry` → `{ miles, reimbursement, rate }` | `{ error }` (one call so the form preview
      and the saved financial line agree). `__tests__/mileage/odometer.test.ts` (8). **Web tracker UI shipped:**
      the Work Mode Mileage tab (`FieldCrewWorkspace` → `MileageTracker`) — a saved-vehicle picker loaded from
      `/api/admin/vehicles` (save/add/delete live there) + start/end odometer inputs + a live miles + IRS-$
      preview driven by `resolveOdometerEntry` (a friendly error for a reversed/absurd entry).
      `field-crew-workspace.test.ts` +1. **Persist SHIPPED:** `POST /api/admin/mileage/manual` writes the
      odometer entry as a `mileage_entries` row (`source: 'odometer'`, org- + caller-scoped, miles/rate/total
      from the shared `resolveOdometerEntry` so no second rate can drift) — it flows straight into the existing
      operations/job financial reports that already read that table. The Work Mode Mileage tab now has a "Log this
      trip" button that POSTs and confirms (`manual-mileage-route.test.ts`, 4). **Remaining:** the mobile-native
      form only.
- [~] **D7 — Compass (azimuth + bearing). ✅ Pure formatter shipped.** `lib/surveying/compass.ts` —
      `compassReading(headingDeg)` → `{ azimuth, azimuthText, bearingText, cardinal }`, reusing
      `lib/cad/geometry/bearing.ts`'s `formatAzimuth`/`formatBearing` (single source of truth) and adding the
      only missing display piece: 16-point cardinal naming (`cardinalPoint`). Normalizes any heading to [0,360),
      returns null for a non-finite heading (UI shows "—"). `__tests__/surveying/compass.test.ts` (8).
      **Remaining (mobile-runtime):** the device magnetometer heading source (`expo-sensors`/`Magnetometer`) +
      the compass dial UI — feed the live heading into this pure formatter; device-tested.
- [~] **D8 — In-Work-Mode AI assistant. ✅ TEXT shipped.** A Work Mode "🤖 Ask AI" tab (`FieldAssistant`) — a
      chat scoped to surveying/field work (bearings↔azimuths + back-bearings, angle math, traverse + closure,
      lat/departure, trig, GPS/total-station procedures, mileage, job logistics) via
      `POST /api/admin/work-mode/assistant` (auth- + configured-gated; reuses the shared Anthropic pattern; the
      active job's label is passed as context; last ~12 turns kept). `field-assistant.test.ts` (4) +
      `field-crew-workspace.test.ts`. **Remaining: VOICE I/O** (mic STT + spoken TTS) — device/runtime-gated,
      layered on the client on-device.
      (Original scope: type-OR-talk assistant reusing the DnD/library chat + TTS/STT plumbing. Text is done;
      voice STT/TTS is device/runtime-gated and layered on the client on-device.)

---

### Sequencing & scope honesty
A (job tap-to-act — small, high daily value) first; then B (Work Mode hub — the streamlined field
surface); then C (upload queue refinements on the existing mobile foundation). Area C's background-execution
slices depend on Expo/native capabilities — where the OS caps background work, say so in the slice's
completion note rather than over-promising. Web vs mobile split: capture + resilient upload is primarily a
**mobile** concern (the real field device); the web hub (Area B) gets capture but leans on the same
`field_media`/`job_files` model. Some pieces are live-DB-only schema — apply + verify seeds against
Supabase, don't assume a CREATE TABLE exists.

**⚑ Related field-data hardening — CSV coordinate parser guarded (2026-07-18).** `mobile/lib/csvCoords.ts`
(the Trimble/Carlson `P,N,E,Z,D` survey-export parser feeding the Work Mode hub's Points surface, closing the
F5 deferral) is a PURE, correctness-critical module — a parse bug corrupts field survey data — that had
shipped with **no tests**. Added `__tests__/mobile/csv-coords.test.ts` (11) covering the variants its own
docstring promises: separator sniffing (comma/tab/semicolon, tie→comma), header detection, both column orders
(P-first `pnezd` / P-last `nezdp`), quoted fields with embedded commas, comma-thousands numbers (European
export), comment/blank-line skipping, the never-throw soft-failure paths (empty file, unparseable row kept +
warned, undetectable format → raw cells), and the case-insensitive `matchedRowNames` linker. Mobile suite
green (113). *(This is a pure-logic module, not device-gated I/O — the same "extract the decision, unit-test
it" pattern as the upload decision layer.)* **Point-name intelligence guarded too (2026-07-18):**
`mobile/lib/dataPointCodes.ts` (Plan §5.3 — the 179-code prefix taxonomy that color-codes points, extracts
prefixes, and auto-suggests the next number/warns on duplicates for the Points surface) was likewise pure
and untested. `__tests__/mobile/data-point-codes.test.ts` (13) pins `extractPrefix` (known/longest/unknown/
null, case- and delimiter-aware), `lookupPrefix` (card entry vs the muted unknown fallback), `isKnownPrefix`,
and `suggestNextName` (highest+1, bare prefix when none, width-widening BM099/BM100→BM101, 2-digit default,
case-insensitive). Mobile suite green (126). **Receipt money math guarded (2026-07-18):** `mobile/lib/money.ts`
(`formatCents`/`parseCents` — the cents↔dollar-string conversion behind `receipts.total_cents` that feeds the
Area-C receipt uploads) is financial-correctness-critical and was untested. `__tests__/mobile/money.test.ts`
(9) pins the rounding-free formatting (cents zero-pad, thousands separators, negative sign, em-dash for
null/non-finite), the tolerant-but-strict parser ($/comma/whitespace accepted; 3+ decimals, multiple dots,
scientific notation, negatives, letters rejected; empty/`.` → null mid-typing), and the
`parseCents(formatCents(x)) === x` round-trip. Mobile suite green (135). **Time-tracking formatters guarded
(2026-07-18):** `mobile/lib/timeFormat.ts` powers the Work Mode "Time" tab; its three fully-deterministic
functions were untested (a wrong duration or clock-out minute count is a payroll error).
`__tests__/mobile/time-format.test.ts` (9) pins `formatDuration`'s tier boundaries (non-finite/negative→"0m",
<1m, whole-minutes-floored, "{h}h {m}m", and the ≥10h "drop the minutes / go home" tier),
`durationMinutesBetween` (whole minutes, round-half-up, null on missing/malformed/reversed ranges), and
`localISODate` (TZ-safe zero-padded YYYY-MM-DD). The Date.now-/locale-dependent formatters in the same file
are left to on-device verification. Mobile suite green (144). **Auth-callback token parse guarded (2026-07-18,
adjacent to the mobile program — not an uploads action item, but a zero-test security-critical pure module):**
`mobile/lib/parseAuthUrl.ts` extracts the Supabase access/refresh tokens from a magic-link / password-reset
deep link — and the tokens live in the URL FRAGMENT (after `#`), not the query string, so a parse bug
silently breaks sign-in. `__tests__/mobile/parse-auth-url.test.ts` (5) pins fragment extraction + type,
the fragment-only rule (query-string tokens ignored; fragment wins when both present), the null paths
(missing/fragmentless/incomplete → null, never a partial object), and percent-decoding. Mobile suite green (149).

---

## Closeout (2026-07-18) — web/server surface COMPLETE; device-runtime remainder DEFERRED to on-device (owner)

Every action item's buildable-in-repo portion — all the pure decision/geometry/queue logic and all the WEB
surfaces — is shipped and tested. What remains in each `[~]` item is **exclusively device/native runtime** that
cannot be built or verified in a browserless CI environment and is the owner's on-device work:

- **Area C (background upload queue):** true background execution while the app is fully backgrounded
  (`expo-task-manager`/`expo-background-fetch` or resumable uploads, hard-bounded by iOS background windows) +
  the mobile queue-control buttons + local notifications. Every pure engine (sequential order, pause/prioritize/
  reorder, failure-choice, status derivation, progress math, prompt-resume-on-foreground) is shipped + tested.
- **D4 — camera capture screens** (live camera per intent, receipt/document AI hand-off, metadata write): pure
  `captureIntent`/metadata layer shipped; the camera UI + native capture are device-only.
- **D5 / D6 — mobile-native forms** for job instructions + odometer mileage: the schema, APIs, and WEB tabs are
  shipped; only the native form remains.
- **D7 — magnetometer compass dial:** the pure `compassReading` formatter is shipped; the live heading source
  (`expo-sensors`) + the dial UI are device-only.
- **D8 — voice I/O** (mic STT + spoken TTS): the TEXT assistant + route are shipped; voice is device-gated.

These are tracked as device-gated in `docs/planning/BLOCKERS.md` (mobile upload runtime). This is a genuine
cost-exceeds-value-in-this-environment deferral (needs a physical device + owner testing), not a convenience —
so this doc moves to `completed/`: its buildable feature has shipped, and the on-device remainder lives in
BLOCKERS for the owner's device pass. See also [[project_surveying_workmode_mobile]] / [[project_mobile_background_uploads]].
