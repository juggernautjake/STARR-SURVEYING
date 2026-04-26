# Starr Field — Mobile Field Companion App Planning Document

**Status:** Planning / RFC — v2
**Owner:** Jacob (Starr Software / Starr Surveying)
**Component:** Starr Field — mobile companion to the Starr Software web stack
**Created:** 2026-04-25
**Last updated:** 2026-04-25 (v2: time/location/expense tracking expanded)
**Target repo path:** `docs/planning/in-progress/STARR_FIELD_MOBILE_APP_PLAN.md`

---

## 1. Executive summary

Starr Field is a cross-platform mobile app (iOS + Android, phone + tablet) for Starr Surveying employees working in the field. It is a first-class client of the existing Starr Software web stack — the same backend, the same jobs, the same files — but with a UI engineered exclusively for one-handed, sun-readable, glove-compatible, often-offline operation in the field.

The app's core jobs are:

1. Compress field documentation (photos, video, voice, notes against a named **data point**) from minutes to **30–60 seconds**
2. Replace paper time cards with location-aware clock-in / clock-out plus a per-day activity timeline
3. Eliminate manual expense reports through receipt photo + AI extraction
4. Give office staff (Jacob's dad / dispatcher) live visibility into where crews are, what they've captured, and what they've spent

The primary v1 user is Jacob (field surveyor). The primary v1 *consumer* of the data is the office reviewer — every feature is designed with the question "can he open this on his desk in 10 seconds and understand what happened?" in mind.

**Headline targets:**
- Capture-to-saved time for a data point: <60 seconds
- Receipt-to-categorized: <15 seconds (snap, AI extracts, save)
- Works fully offline; sync is invisible
- Battery use during a typical 8-hour field day with location tracking on: <50% on a modern phone
- All field data replicated to the web app within 5 minutes of phone regaining signal

---

## 2. Goals & non-goals

### Goals
1. Replace paper field notes with a faster, richer, instantly-shared digital equivalent
2. Replace paper time cards with location-aware time tracking
3. Replace expense reports with photo-based AI-audited receipt capture
4. Give office staff real-time visibility into crew location, captures, and spending
5. Capture rich context around survey points: photos, videos, voice, notes, GPS
6. Manage job files (plats, deeds, prior surveys) for quick field reference
7. Operate fully offline, sync when possible, never lose data
8. Integrate with the existing 179-code point system as a first-class concept (the canonical list is **not yet codified in the repo** — it currently lives offline as a printout / in Henry's head; importing it into the `point_codes` table is a Phase F0 deliverable, see §15)
9. Generate IRS-compliant mileage logs as a free byproduct of location tracking
10. Lay groundwork for future Trimble Access integration

### Non-goals (v1)
- Replacing Trimble Access, Civil 3D, or any survey-grade computation tool
- Survey-grade GPS — phone GPS is for context only, not measurements
- Customer-facing features (this is internal/employee only initially)
- Drawing/CAD on the phone — that lives in Starr CAD on the desktop
- Real-time collaborative editing of the same record by two users
- Full HR / payroll / benefits — time data feeds payroll but the app isn't payroll
- Full accounting — receipts feed bookkeeping but the app isn't QuickBooks
- Anything in Starr Compass, Forge, or Orbit (those are separate products)

---

## 3. Where this fits in the Starr Software ecosystem

```
┌────────────────────────────────────────────────────────────────────┐
│                    STARR SOFTWARE PLATFORM                          │
├────────────────────────────────────────────────────────────────────┤
│  Starr Compass       Starr Forge       Starr Orbit                 │
│  (pre-dev research)  (construction)    (HOA/community)             │
├────────────────────────────────────────────────────────────────────┤
│  Starr CAD (desktop survey CAD)                                    │
├────────────────────────────────────────────────────────────────────┤
│  Existing /admin (Next.js, in this monorepo):                      │
│    jobs, payroll, hours-approval, my-hours, my-pay, employees,     │
│    fieldbook (notes), leads, schedule, research, learn             │
│    + worker (worker/) for STARR RECON pipelines                    │
├────────────────────────────────────────────────────────────────────┤
│  ★ STARR FIELD ★  ← this document                                  │
│  Mobile: capture, time + location, receipts, notes                 │
│  Reads/writes the same tables as /admin (single source of truth)   │
├────────────────────────────────────────────────────────────────────┤
│  Shared backend: Next.js 14 + Supabase (Postgres, Auth, Storage)   │
│  Plus: R2 (media via worker/src/lib/storage.ts), Anthropic API     │
│        (via worker/src/lib/ai-usage-tracker.ts)                    │
└────────────────────────────────────────────────────────────────────┘
```

Starr Field is a mobile client against the same Supabase database the web app uses. Jobs created on the phone show up in the web app instantly. Receipts uploaded in the field appear on the bookkeeper's screen by the time the truck pulls back to the office. Single source of truth.

---

## 4. User personas

### 4.1 Jacob — field surveyor (primary user)
- In the field 60–80% of work hours
- Often holding a rod, notebook, or instrument controls in one hand
- Phone is in cargo pocket or on belt clip; gloves frequently
- Operates 30°F to 105°F, often in direct sunlight
- Cellular signal unreliable — LTE → 3G → none, sometimes mid-job
- Battery anxiety is real; phone may also be tethering for the rover

### 4.2 Henry / dad — office reviewer & dispatcher (primary consumer)
- At a desk in front of two monitors
- Reviews field work, asks Jacob questions about specific points
- Wants to see live: where crews are, today's captures, today's hours, today's receipts
- Approves time edits, expense submissions, mileage logs
- Doesn't install the mobile app — sees field data through the web app

### 4.3 Bookkeeper / office admin (secondary consumer)
- Processes receipts, exports to QuickBooks
- Reconciles fuel cards / credit card statements against uploaded receipts
- Generates mileage logs at tax time
- Mostly works from web app reports

### 4.4 Future: field crew member (post-v1)
- A second person on a job assisting Jacob
- May have their own phone capturing media, time, expenses for the same job
- Multi-device-same-job conflict resolution becomes relevant

### 4.5 Future: subcontractor or 1099 helper (post-v1)
- Time-limited access to specific jobs only
- Permissions model needs to support this
- 1099 contractors **cannot** be tracked the same way as W-2 employees — separate consent and feature set

---

## 5. Core feature specifications

### 5.1 Authentication & session management

- **Supabase Auth directly** (email + password, magic link, OR Apple/Google native SDK) — same `auth.users` table the web app's NextAuth v5 resolves to. NextAuth itself is browser-only and is **not** used on mobile; mobile sessions are independent of NextAuth sessions but identity is unified at the `auth.users.id` UUID. API routes called from mobile must accept Supabase JWTs (not NextAuth cookies); see §13 Appendix A for the namespacing decision.
- Biometric unlock (Face ID / fingerprint) after first sign-in
- Auto-lock after configurable idle (default 15 min)
- Stay-signed-in across app restarts; explicit sign-out only on demand
- Re-auth required for destructive actions (delete job, delete point, delete time entry)

### 5.2 Jobs

**Existing infrastructure (do not duplicate).** The `jobs` table already exists in the live Supabase schema along with ~11 related tables (`job_tags`, `job_team`, `job_equipment`, `job_files`, `job_research`, `job_stages_history`, …) and is wired into 9 API routes under `/api/admin/jobs/` and the admin UI under `/admin/jobs/` (`page.tsx`, `[id]/`, `new/`, `import/`). Starr Field reads through these existing structures — it does **not** introduce a parallel jobs schema. The §6.3 `ALTER TABLE jobs` adds field-state columns only. New mobile-only behavior (geofence, on-site detection) hangs off ALTER columns and join tables, never a renamed/duplicated `jobs`.

**Create job (in-app, online or offline):**
- Job name (required), job number (auto `YYYYMMDD-NNN` if blank)
- Client / property reference (free text or pick from existing)
- Job type (boundary, topo, construction stake, ALTA, easement, other)
- Geographic context: tap-to-set on map, or auto-fill from GPS
- Crew members (multi-select from employee list)
- **Job geofence** (auto-suggested radius around centroid; used for arrival/departure detection)
- Notes field

**Job list view:** sorted by recently-touched, with visual indicators (⚡ active today, ☁ syncing, ⚠ unsynced changes, 📍 crew on-site now). Search, filter by status, pinned favorites at top.

**Job detail view:** map of all data points, tabs for Points, Media, Files, Notes, Time, Expenses, Crew. Floating "+ Point" action button.

**Job lifecycle:** `draft` → `active` → `field_complete` → `office_review` → `closed` → `archived`. State transitions logged with user + timestamp. Closed jobs become read-only on phone.

### 5.3 Data points (the central concept)

A data point is a named record that aggregates everything observed about one location during a survey. The name matches the point name shot on the instrument (e.g., `BM01`, `IR03`, `FL-CORNER-NE`). Field crews shoot a point on the GPS rover, then immediately pull out the phone and create a matching data point with photos, voice, and notes — when the office processes the CSV later, every point with a phone-side data point has rich context attached.

**Data point fields:**
- `name` (required, autocompletes from 179-code library)
- `code_category` (auto-derived from name prefix)
- `description` (free text)
- `device_gps` (lat / lon / altitude / accuracy / timestamp, auto-captured)
- `device_compass_heading` (auto-captured)
- `created_at`, `created_by`, `job_id`
- Attached: 0..N photos, 0..N videos, 0..N voice memos, 0..N text notes, 0..N coordinate sets

**Quick-create flow (target <60s):**
1. From job → tap "+ Point"
2. Point name field (autocomplete; last-used codes float to top)
3. Camera comes up immediately — first shot can happen before name is even confirmed
4. After shot: stay in capture mode with bottom toolbar (more photos / video / voice / notes)
5. "Done" saves the point; phone sets queued-for-sync state

**Point name intelligence:** recognizes 179-code prefixes (`BM`, `IR`, `HC`, `SI`, etc.), color-codes by category to match arm-sleeve cards, suggests next number in sequence, warns on duplicates.

**Special point types:**
- **Offset shot** — flagged; UI prompts for offset distance/direction + voice walkthrough
- **Correction** — links to the earlier point being corrected; both retained
- **Reference / control** — promoted in UI, shown on map at higher zoom levels

### 5.4 Media capture

**Photos:** native camera optimized for quick shutter. Burst mode. EXIF embeds phone GPS, compass heading, altitude. Annotation post-capture (arrows, circles, freehand, text labels). Compression: store original locally, upload medium-quality first for fast sync, original syncs over WiFi only by default.

**Videos:** 1080p default at 30fps, toggle to 720p. Hard cap 5 min/clip. Same metadata embedded.

**Voice memos:** one-tap record from anywhere. Auto-transcribed via on-device speech recognition (iOS Speech / Android SpeechRecognizer). Transcription is editable and searchable.

**Annotations:** drawing tools (arrow, circle, rectangle, freehand, text label) with high-contrast color picker. Original photo always preserved unmodified; annotation is a separate layer.

### 5.5 Notes

**Existing table (extend, do not duplicate).** Notes write through to the existing `fieldbook_notes` table (`seeds/099_fieldbook.sql`) which already has `is_public`, `job_id`, `job_name`, `job_number`, `is_current`, `user_email`, `updated_at`, plus the `fieldbook_categories` + `fieldbook_entry_categories` taxonomy. The mobile app extends this table with mobile-specific columns (point-link FK, structured-template type, voice-transcript ref) via ALTER. The §6.3 `field_notes` table is **dropped** in favor of this — see edit log for rationale. Web (`/admin/my-notes/`, `/admin/notes/`) and mobile read the same table.

- **Quick note:** free text attached to job or point
- **Structured note** templates: offset shot, monument found (rebar/pipe/stone, condition, depth), hazard observed (type, severity), correction (what changed, why)
- **Voice-to-text shortcut** for hands-free dictation
- All notes timestamped, signed by capturing user

### 5.6 Files

**Upload to job:** from device, cloud (iCloud / Google Drive / Dropbox), or web link.

**Quick view on device:** PDFs render natively (plats, deeds, prior surveys); images including TIFFs; DWG/DXF preview via server-side conversion; CSVs render as scrollable tables.

**Organization:** folders within job (`Plats`, `Deeds`, `Field Notes`, `Deliverables`, custom) with tags (`reference`, `current`, `superseded`). Pin a file for guaranteed offline availability.

### 5.7 CSV upload (raw survey data)

- Paste, import from Files / cloud / AirDrop
- Parser supports `P,N,E,Z,D` (point/north/east/elevation/desc), Trimble JobXML, generic
- Preview points in list and on map
- **Auto-link to data points** by matching name (the magic moment: instrument data + phone-side photos+notes joined automatically)
- Unmatched names highlighted

### 5.8 Time logging

This is one of v1's two highest-priority features (alongside data point capture). Goal: replace paper time cards entirely while making it harder to forget to clock out and easier to fix mistakes when it happens.

**Existing infrastructure (extend, do not duplicate).** The live Supabase schema already has a time-tracking system feeding `/api/admin/time-logs/`, `/api/admin/time-logs/approve`, `/api/admin/time-logs/advances`, and `/api/admin/time-logs/bonuses`, surfaced in `/admin/payroll/`, `/admin/payroll/[email]/`, `/admin/hours-approval/`, `/admin/my-hours/`, and `/admin/my-pay/`. **Phase F1 of Starr Field begins with a schema audit of those tables and an ALTER-only migration** to add mobile-specific columns: location at clock-in/out, smart-prompt acknowledgement timestamps, geofence trigger flags, and edit-audit trail rows. The §6.3 `time_entries` and `time_entry_edits` tables shown below are the **target shape after the ALTER**, not greenfield additions — pre-migration column inventory is a Phase F0 deliverable. The advances/bonuses surface stays in the web admin UI and is **read-only** on mobile through Phase F4.

#### 5.8.1 Clock-in / clock-out (basic)

- One tap from home screen widget, app dashboard, or lock screen shortcut
- Auto-suggests current job based on GPS proximity to recent jobs (top suggestion + 2 alternates)
- Manual job pick if no proximity match; "Office" and "Travel" are always available as choices
- Timer visible on home screen so user can see they're still on the clock at a glance
- Clock-out asks two quick questions: confirm job (auto-filled), any notes for the day (optional, can skip)

#### 5.8.2 Smart "are you still working?" prompts

Not random nags. Triggered by:
- **End-of-typical-day rule:** based on the user's own historical clock-out time (rolling 30-day median ± 1h), prompts after that window with no clock-out
- **Stationary too long:** no significant movement for 90+ minutes after typical end-of-day
- **Left the geofence:** clocked into Job X but phone has been outside Job X's geofence for 30+ minutes (could be a real long break or a forgotten clock-out)
- **Phone went idle for 8+ hours** while still clocked in (almost certainly a forgotten clock-out the night before)

Prompt UX: silent push notification (no sound, no vibration after 7pm), single-line ("Still working at Smith Boundary?"), one-tap actions: `Yes` / `Clock out now` / `Edit time`.

User can mute these per session ("don't ask again until tomorrow") or globally configure them.

#### 5.8.3 Time editing with audit trail

After clock-out (or at any time within 7 days), employee can edit:
- Clock-in time
- Clock-out time
- Job assignment
- Break start/end (if breaks were tracked)
- Notes

Every edit creates an `edit_history` row showing original value, new value, who edited, when, and a required reason field for any edit >15 min from the original. Office reviewer can approve or reject edits before they affect payroll exports.

After 7 days (or after timesheet approval, whichever is sooner), edits are locked and require admin override.

#### 5.8.4 Break tracking

Two modes, configurable:

- **Implicit (default):** no manual break tracking; lunch and incidental breaks roll up into total clocked time. Simplest for hourly field crews.
- **Explicit:** manual "Start break" / "End break" buttons, or automatic detection from location (stop ≥20 min at non-work location classified as food/coffee = candidate break with one-tap confirm).

Texas labor law doesn't mandate paid breaks for adult employees, so this is a company policy decision. The app supports both, controlled by a per-company setting.

#### 5.8.5 Multi-day and overnight handling

- Clock-in spanning midnight: handled correctly; daily totals split at midnight for reporting
- Multi-day overnight job: optional "overnight mode" pauses tracking 10pm–6am (configurable) without requiring clock-out
- Travel-day vs work-day distinction (per-diem implications, see §5.10)

#### 5.8.6 Timesheet view

- This week, last week, custom range
- Per-job hours rollup
- Total / billable / unbillable / travel / office / overtime
- One-tap export to CSV / PDF
- "Submit for approval" workflow → office reviewer signs off on the web app
- Once approved: locked, exported to payroll system (CSV for v1, QuickBooks integration future)

#### 5.8.7 Geofence-based auto-prompts (opt-in)

If user opts in:
- Arriving at the home office in the morning → "Clock in?" notification
- Leaving the home office at end of day → "Clock out?" notification
- Arriving at a known job site → "Switch to Job X?" notification

These are suggestions, never automatic. The decision to actually start/stop the clock is always the employee's tap.

### 5.9 Sync and offline-first

**Local-first:** every action writes to local SQLite (WatermelonDB or PowerSync) first. Sync engine pushes to Supabase when network is healthy. UI never blocks on network.

**Sync prioritization:**
1. Time entries (smallest, highest business value — payroll depends on these)
2. Receipts (small, high audit value)
3. Notes and structured data
4. Voice memo audio
5. Compressed photos
6. Original-resolution photos
7. Videos (largest; default WiFi-only)
8. Location tracking buffer (chunked uploads, see §5.10)

**Conflict resolution:**
- Notes / data points: per-field last-write-wins
- Media: never conflicts (additive)
- Time entries: pre-approval edits use last-write-wins; post-approval edits require admin
- Job metadata changes: phone keeps local edits, prompts user to merge on reconnect

**Storage management:** configurable cap (default 10 GB). Auto-purge synced media older than N days (default 30, configurable per job). Pin-to-device option keeps a job's media local indefinitely.

### 5.10 Location tracking & activity insights

This feature is **opt-in, employee-facing, and bounded by clock-in state**. It exists to make payroll/billing accurate, generate IRS-compliant mileage logs, and give the dispatcher visibility — not surveillance.

**Identity model.** All `user_id` columns in this section (and in `time_entries`, `location_stops`, `location_segments`, `receipts`) reference `auth.users` (Supabase Auth). The web app's NextAuth v5 sessions and the mobile app's Supabase sessions both resolve to the same `auth.users.id` UUID — the surveyor's identity is unified across clients even though session mechanics differ (§5.1).

#### 5.10.1 Privacy & consent (non-negotiable foundation)

**Hard rules baked into the architecture, not enforced by policy alone:**

1. **Tracking is only active while the user is clocked in.** Clock out → all location streaming stops within 60 seconds. The OS background-location indicator (iOS blue pill, Android persistent notification) goes away. This is enforced in code; it is impossible to track an off-the-clock employee without changing the app.
2. **One-time consent flow on first activation** — full-screen, plain-language disclosure of exactly what is tracked, how it's used, who sees it, how long it's retained, and how to disable it. Employee must accept; declining means they cannot use location-aware features (but can still use basic clock-in/out without location).
3. **Always-visible indicator inside the app** — small icon in the header showing "📍 location tracking on" while clocked in. Tap to open a "what's being tracked right now" page.
4. **Employee sees their own data** — full timeline of their tracked day available to them, same view the dispatcher sees.
5. **Retention cap** — raw location pings retained for 90 days, then aggregated to stop summaries and deleted. Aggregated stop data retained per company policy (default 7 years for tax compliance).
6. **Per-company setting** — owner can disable location tracking entirely for some or all employees (e.g., for 1099 contractors, who legally cannot be tracked the same way).
7. **Texas-specific:** Texas is generally employer-friendly on this, but legal review before rollout is recommended (see Open Questions §12). For multi-state expansion, per-state legal review is required.

#### 5.10.2 What gets tracked

While clocked in, the app records:

- **Stop events:** anywhere the device is stationary >5 minutes
- **Movement segments:** between stops (start time, end time, distance, simplified path)
- **Geofence transitions:** entering/leaving the home office, known job sites, etc.

Not tracked: the user's continuous breadcrumb path. The system uses the OS's "significant location change" APIs (cheap, battery-friendly) for general tracking, only switching to high-accuracy GPS when entering a job-site geofence. Continuous breadcrumb tracking would (a) destroy battery and (b) feel surveillance-y; stop-and-segment is what the business actually needs.

#### 5.10.3 Stop classification

Each stop gets a category, assigned in this priority order:

1. **Geofence match** — inside known geofence (office, job site) → categorized automatically
2. **Reverse geocode + AI classifier** — Google Places category for the coordinates, fed to Claude with stop duration and time-of-day context, returns one of: `office`, `job_site`, `fuel`, `food`, `supplies`, `client_meeting`, `personal`, `other`
3. **Manual** — user can override any classification with one tap

**Classification cost:** ~$0.005–0.01 per stop. Typical day: 8–15 stops → ~$0.05–0.15/day per employee. Geofence matches are free.

User-visible categories on the timeline: 🏢 office / 📍 job site / ⛽ fuel / 🍔 meal / 🛒 supplies / 🤝 meeting / 🚗 travel / ❓ other.

#### 5.10.4 Daily timeline view (employee + dispatcher)

A vertical timeline of the day:

```
06:54  📍 Clock in @ Home Office              0:00
06:54  🏢 Home Office                        47 min
07:41  🚗 Travel → Smith Boundary            38 min
08:19  📍 Smith Boundary (Job #20260418-003) 3h 12m
11:31  🚗 Travel → Whataburger               12 min
11:43  🍔 Whataburger Belton                 28 min
12:11  🚗 Travel → Smith Boundary            14 min
12:25  📍 Smith Boundary                     2h 47m
15:12  🚗 Travel → Lowes                     9 min
15:21  🛒 Lowes #1234                        18 min  💳 receipt uploaded
15:39  🚗 Travel → Home Office               21 min
16:00  🏢 Home Office                        45 min
16:45  📤 Clock out                           
       ──────────────────────────────────────────
       Total: 9:51 clocked
       On-site Smith: 5:59  •  Travel: 1:34  •  Office: 1:32  •  Meal: 0:28
```

Tap any segment to see detail (path on map, full address, receipt if any, who else was there).

#### 5.10.5 Dispatcher live map

Real-time view of all active employees:

- Pin per active crew, colored by status (on job site / traveling / on break / at office)
- Tap a pin → today's timeline + current job + last seen
- Time-of-day playback ("show me where everyone was at 2pm")
- Day-replay ("scrub through Jacob's day")
- Anomaly flags: "Crew at unexpected location for >30 min" (e.g., not at scheduled job)

Access controlled by role — only admins see the full live map.

#### 5.10.6 Mileage tracking (IRS-compliant)

Auto-derived from movement segments:

- Per trip: start address, end address, distance (from device or routed via Google Distance Matrix for accuracy), business purpose (job name), driver, vehicle
- Per day: total business miles
- Per pay period / month / year: rollup
- Export: IRS-compliant mileage log (date, start, end, miles, business purpose, vehicle) as CSV or PDF

**Why this matters financially:** at the 2026 IRS standard mileage rate (~$0.70/mile), a surveyor driving 100 mi/day is generating ~$70/day in deductible business miles. Across a year that's ~$17,500 in legitimate deductions, often missed when miles are tracked by hand.

#### 5.10.7 Vehicle assignment

- Crew picks the company truck/vehicle they're using at start of day (one tap)
- Mileage attributed to that vehicle for fleet management / fuel cost allocation
- "Driver" vs "Passenger" toggle — passenger's mileage doesn't double-count
- Vehicle-level reports: miles per truck per month, fuel cost per truck (cross-referenced with receipts)

#### 5.10.8 Battery management strategy

This is the hard engineering problem:

- **Default mode (90% of the day):** OS significant-location-change APIs. Wakes app every 500m of movement or every ~10 minutes. Battery cost: ~3–5%/day.
- **Geofence approach mode:** high-accuracy GPS turned on within 200m of a known job-site or office geofence. Captures precise arrival/departure timestamps. Auto-drops back to low-power after 60 seconds stationary.
- **Movement mode:** medium-accuracy GPS during driving (detected via OS motion APIs). Records path with simplification. Drops back to low-power on stop.
- **Off-the-clock:** zero. No background activity. OS indicator goes away.

Combined with normal phone use, target: <15% additional battery drain over an 8-hour clocked-in day.

User-visible: battery indicator inside the app shows current draw; if location is being unusually battery-heavy, banner suggests checking GPS-precision settings.

### 5.11 Expense & receipt management

The other big-ticket v1 feature. Goal: make a $42 hardware-store receipt take 15 seconds to capture and end up correctly categorized in QuickBooks without anyone re-typing anything.

#### 5.11.1 Capture flow

1. Tap "+ Receipt" from anywhere (home, job, shortcut widget)
2. Camera opens in receipt mode (high-contrast, edge-detection guides)
3. Snap — auto-cropped, deskewed, brightness-corrected
4. AI extraction begins immediately (parallel to user adding context)
5. While AI runs (~3–5s), user picks/confirms job and adds optional note
6. Save — receipt is queued for sync; AI extraction visible when done

Multiple receipts in one session: tap "+ another" to keep going without leaving capture mode.

#### 5.11.2 AI-extracted fields

Using Claude Vision API, extract:

- **Vendor name** (and address if visible)
- **Date and time** of transaction
- **Subtotal**, **tax**, **tip**, **total**
- **Payment method** (card last 4 if visible, "cash", "check")
- **Line items** (description + amount; for receipts where individual items are clear)
- **Suggested category** (`fuel`, `meals`, `supplies`, `equipment`, `tolls`, `parking`, `lodging`, `professional_services`, `office_supplies`, `client_entertainment`, `other`)
- **Tax-deductibility flag** (best effort; bookkeeper confirms)
- **Confidence score** per field

User can edit any extracted field. Original photo is always preserved alongside structured data.

**Anthropic SDK wrapper.** Claude Vision calls go through `worker/src/lib/ai-usage-tracker.ts` (the existing in-process circuit breaker + cost tracker, with `getGlobalAiTracker()` singleton). Tag every receipt extraction call with `(adapter_id='starr-field', phase='extract', incident_id=null)` so receipts roll into the same `ai_cost_ledger` table planned for self-healing (`seeds/202_adapter_self_healing.sql`). Reuse the existing budget-cap mechanism rather than building a parallel one — see the cost-cap discussion in §11 and the shared-cap rule in §13/§14.

**Cost per receipt:** ~$0.01–0.04 with Claude Sonnet 4.6 (verify current pricing via `/mnt/skills/public/product-self-knowledge/`). At a generous 200 receipts/employee/month, that's $2–8/month per employee in AI cost. Trivial vs. the bookkeeper time saved.

#### 5.11.3 Job association

- Default: receipt assigned to the job the user is currently clocked into
- If clocked into "Office" or "Travel": prompts for job pick (or `Overhead`)
- Can be changed later
- Bookkeeper can re-assign on web app

#### 5.11.4 Categories and tax flags

Categories map cleanly to QuickBooks classes (configurable per company). Each category has default tax flags:

- `fuel` → fully deductible vehicle expense
- `meals` → 50% deductible (IRS rule for 2026)
- `equipment` → may be capitalized vs expensed depending on amount; flag for bookkeeper review if >$2,500
- `client_entertainment` → 0% deductible since 2018
- etc.

Flags are guidance, not law. The bookkeeper has final say.

#### 5.11.5 Missing-receipt detection

Cross-references location data with receipt uploads:

- Location shows a 12-minute stop classified as `fuel`, but no receipt uploaded that day → end-of-day prompt: "You stopped at Buc-ee's Belton at 2:15pm. Receipt?"
- Long stop at `supplies` location with no receipt → same prompt
- Configurable: prompt threshold (default: stops >5 min at non-job/non-office locations)

This catches the receipts that fall through the cracks. Big value for bookkeeping accuracy.

#### 5.11.6 Approval and export workflow

- Submitted receipts go into bookkeeper's web-app queue
- Bookkeeper reviews extraction, confirms category, approves
- Approved receipts can be:
  - Bulk-exported to QuickBooks (CSV import for v1, direct QBO API integration for v2)
  - Bulk-exported to a generic accounting CSV
  - Per-employee expense reimbursement reports (if employee paid out of pocket)

#### 5.11.7 Per-job and per-period rollups

- Per-job expense rollup (visible to crew + admins): how much has been spent on this job's materials, fuel, meals
- Per-pay-period rollup per employee: useful for reimbursement
- Per-month / per-year company-wide rollup
- All rollups exportable

#### 5.11.8 Fuel card reconciliation (post-v1)

If Starr Surveying uses a fleet fuel card (Wex, Comdata, Voyager):

- Card transactions ingested via API
- Auto-matched to uploaded receipts by date + amount + location
- Unmatched card transactions flagged for missing receipt
- Unmatched receipts flagged for verification

This catches both ends of fuel-cost auditing automatically.

#### 5.11.9 IRS-compliant retention

- Original photo + extracted data retained 7 years
- Annual archival: receipts older than current tax year + 1 archived to cold storage (cheaper R2 archive class)
- Receipts queryable, exportable, and audit-package-able by date range

---

## 6. Architecture

**Mobile code lives in this monorepo at `mobile/`** — adjacent to `app/`, `worker/`, and `lib/`. Reasoning: shared TypeScript types (especially `worker/src/shared/research-events.ts` for the realtime channel and the eventual mobile-event variants per §6.4), shared lint config, single CI pipeline, single git history for a feature spanning web admin + mobile + worker. Trade-off: monorepo build complexity (Next.js, worker, and React Native all live in one node_modules tree). **Escape hatch:** if mobile build noise becomes a real problem at end of Phase F1, split to a separate repo with the shared types extracted to a published npm package — but do not start there.

### 6.1 Tech stack recommendation

**Mobile framework: React Native + Expo**

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **React Native + Expo** | TS reuse with Next.js, mature camera/GPS/background-location modules, OTA updates | Slight performance gap vs native | ✅ **Choose** |
| Native iOS + Android | Best performance, best background-location reliability | 2x dev cost forever | Only if RN proves insufficient |
| Capacitor (wrap web app) | Fastest to ship | Camera/offline/background-location feel sluggish | ❌ |
| Flutter | Great UX | No code reuse with Next.js | ❌ |

**Why Expo specifically:**
- `expo-location` supports background location with proper iOS/Android permission flows
- `expo-camera`, `expo-av` (audio/video), `expo-file-system`, `expo-sqlite` cover ~95% of needs
- `expo-notifications` for the "still working?" prompts and "missing receipt?" prompts
- EAS Build produces signed iOS + Android binaries
- OTA updates push JS/asset changes without App Store re-review

**Local database: PowerSync (default), WatermelonDB (fallback).** PowerSync works directly with Supabase Postgres via its sync rules, requiring less custom plumbing for our schema. WatermelonDB is more battle-tested but requires writing custom Supabase sync adapters. **Decision deadline: end of Phase F0.** A 1-day spike against `field_data_points` + `field_media` + `time_entries` deltas should settle it.

**Backend: existing Supabase + Next.js**, plus:
- **R2** for media archival (zero egress fees for the bookkeeper pulling receipts)
- **Anthropic API** for receipt extraction and stop classification (already in stack)
- **Google Places API + Distance Matrix** for stop geocoding and accurate mileage

### 6.2 Storage strategy

**All storage goes through `worker/src/lib/storage.ts`**, the existing project-wide R2/local abstraction (see `seeds/102_storage_buckets.sql` and `docs/platform/STORAGE_LIFECYCLE.md`). Mobile media uses the namespace `field/<user_id>/<job_id>/<media_id>` mirroring the existing `documents/<jobId>/...` and (planned) `canaries/<adapter_id>/...` patterns. R2 backend selected via `STORAGE_BACKEND=r2`; local dev defaults to `./storage/`. **Never call AWS SDK / Supabase Storage SDK directly** — that bypasses the lifecycle rules and the local-dev fallback.

| Asset type | Where (resolved by `storage.ts`) | Why |
|---|---|---|
| Voice memos (≤5 MB) | Supabase Storage (hot tier) | Small, audited frequently |
| Receipt photos (≤5 MB) | Supabase Storage (hot tier) | Hot, audit-frequent |
| Photos (compressed, ≤2 MB) | Supabase Storage (hot tier) | Hot |
| Photos (originals, 5–20 MB) | R2 | Larger, cheaper egress |
| Videos (10–500 MB) | R2 | Large, write-once-read-rare |
| Files / PDFs | Supabase Storage (hot tier) | Reference docs |
| Receipts older than current tax year + 1 | R2 archive class (lifecycle rule per `STORAGE_LIFECYCLE.md`) | Cold, IRS-retention only |

### 6.3 New Supabase tables (additions)

**Migration file:** `seeds/220_starr_field_tables.sql` — `213_text_to_uuid_fks.sql` is the highest currently-tracked seed; the next free slot for Starr Field is 220 (leaving 214–219 reserved for in-flight Recon and self-healing work). Follows the project's seed conventions: `BEGIN; … COMMIT;` wrapper, `CREATE TABLE IF NOT EXISTS`, `ADD CONSTRAINT IF NOT EXISTS` via `DO $$ … END $$` blocks (see `seeds/201_captcha_solves.sql` and `seeds/099_fieldbook.sql` for the exact patterns). Re-applying in CI restore drills must be idempotent.

**PostGIS prerequisite.** `location_segments.path_simplified` uses the PostGIS `GEOMETRY` type. Verify with `SELECT extname FROM pg_extension WHERE extname='postgis'` before applying; if absent, the migration's first statement is `CREATE EXTENSION IF NOT EXISTS postgis;`. Most Supabase projects have it by default but assume nothing.

**Notes table — none here.** `field_notes` does **not** appear below: per §5.5, mobile notes write through to the existing `fieldbook_notes` table. ALTER columns for `fieldbook_notes` (e.g. `data_point_id`, `note_template`, `structured_data` JSONB, `voice_transcript_media_id`) ship in the same migration but extend the existing schema rather than creating a parallel table.

**`jobs` table prerequisite.** The live Supabase has `jobs` and ~11 related tables (per §5.2) but those tables are **not currently tracked in `seeds/`**. The `ALTER TABLE jobs` below assumes they exist. Phase F0 deliverable (§15): snapshot the live `jobs` schema into a tracked seed file before this migration runs against a fresh restore.

```sql
-- ============================================================================
-- 220_starr_field_tables.sql
-- Starr Field — mobile-app foundational schema (Phase F0)
--
-- Tables added:
--   field_data_points       — surveyor data points captured on mobile
--   field_media             — photos, videos, voice memos linked to points
--   vehicles                — fleet for mileage and time-entry attribution
--   time_entries (ALTER)    — extend existing time-logs (NOT a new table; see note)
--   time_entry_edits        — audit trail for clock-in/out edits
--   location_stops          — classified stops along a clocked-in day
--   location_segments       — driving segments between stops (PostGIS)
--   receipts                — receipt photos + AI-extracted fields
--   receipt_line_items      — itemized lines from receipts
--   point_codes             — Starr Surveying 179-code taxonomy (see §5.3)
--
-- Tables ALTERED, not created:
--   jobs                    — adds field_state, pinned_for_users, geofence
--   fieldbook_notes         — adds mobile-specific columns (per §5.5)
--   time_entries (existing) — see §5.8 preamble; concrete shape TBD by F0 audit
--
-- Migration is held until Phase F0 schema audit completes — do NOT apply
-- against production before then. See §15 bootstrapping.
-- ============================================================================

BEGIN;

-- PostGIS prerequisite for location_segments.path_simplified
CREATE EXTENSION IF NOT EXISTS postgis;

-- ── jobs ALTER (existing table — see §5.2) ──────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS field_state TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pinned_for_users UUID[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS centroid_lat NUMERIC;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS centroid_lon NUMERIC;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS geofence_radius_m INT;

-- ── Field data points ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_points (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                  UUID NOT NULL REFERENCES jobs ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  code_category           TEXT,                              -- references point_codes.code
  description             TEXT,
  device_lat              NUMERIC,
  device_lon              NUMERIC,
  device_altitude_m       NUMERIC,
  device_accuracy_m       NUMERIC,
  device_compass_heading  NUMERIC,
  is_offset               BOOLEAN NOT NULL DEFAULT false,
  is_correction           BOOLEAN NOT NULL DEFAULT false,
  corrects_point_id       UUID REFERENCES field_data_points,
  created_by              UUID REFERENCES auth.users,        -- shared identity (§5.10 preamble)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_id               TEXT,                              -- offline-sync dedup key
  UNIQUE(job_id, name)
);

CREATE INDEX IF NOT EXISTS idx_field_data_points_job ON field_data_points (job_id);
CREATE INDEX IF NOT EXISTS idx_field_data_points_created_by ON field_data_points (created_by, created_at DESC);

-- ── Field media (photos, videos, voice memos) ───────────────────────────────
CREATE TABLE IF NOT EXISTS field_media (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                  UUID NOT NULL REFERENCES jobs ON DELETE CASCADE,
  data_point_id           UUID REFERENCES field_data_points ON DELETE CASCADE,
  media_type              TEXT NOT NULL,                     -- 'photo'|'video'|'voice'
  storage_url             TEXT NOT NULL,                     -- resolved by storage.ts (§6.2)
  thumbnail_url           TEXT,
  original_url            TEXT,
  duration_seconds        INT,
  file_size_bytes         BIGINT,
  device_lat              NUMERIC,
  device_lon              NUMERIC,
  device_compass_heading  NUMERIC,
  captured_at             TIMESTAMPTZ,
  uploaded_at             TIMESTAMPTZ,
  transcription           TEXT,
  annotations             JSONB,
  created_by              UUID REFERENCES auth.users,
  client_id               TEXT
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_media_type_chk') THEN
    ALTER TABLE field_media
      ADD CONSTRAINT field_media_type_chk CHECK (media_type IN ('photo','video','voice'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_field_media_job ON field_media (job_id);
CREATE INDEX IF NOT EXISTS idx_field_media_data_point ON field_media (data_point_id) WHERE data_point_id IS NOT NULL;

-- ── fieldbook_notes ALTER (existing table — see §5.5) ───────────────────────
-- Mobile-specific columns extending the existing fieldbook_notes table from
-- seeds/099_fieldbook.sql. The mobile app and the web's /admin/my-notes/
-- read the same rows.
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS data_point_id UUID
  REFERENCES field_data_points ON DELETE CASCADE;
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS note_template TEXT;
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS structured_data JSONB;
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS voice_transcript_media_id UUID
  REFERENCES field_media ON DELETE SET NULL;
ALTER TABLE fieldbook_notes ADD COLUMN IF NOT EXISTS client_id TEXT;

-- ── Vehicles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID,
  name            TEXT NOT NULL,
  license_plate   TEXT,
  vin             TEXT,
  active          BOOLEAN NOT NULL DEFAULT true
);

-- ── Time entries (ALTER existing — see §5.8 preamble) ───────────────────────
-- The shape below is the TARGET after the Phase F0 schema audit identifies
-- the actual column set on the existing time-logs table. New columns added
-- ONLY if missing; never DROP/RENAME existing payroll columns.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS is_driver BOOLEAN DEFAULT true;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS break_minutes INT DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS entry_type TEXT;     -- 'on_site'|'travel'|'office'|'overhead'
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS clock_in_lat NUMERIC;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS clock_in_lon NUMERIC;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS clock_out_lat NUMERIC;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS clock_out_lon NUMERIC;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS prompted_continue_at TIMESTAMPTZ;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS geofence_trigger_id TEXT;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS client_id TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_entry_type_chk') THEN
    ALTER TABLE time_entries
      ADD CONSTRAINT time_entries_entry_type_chk
        CHECK (entry_type IS NULL OR entry_type IN ('on_site','travel','office','overhead'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS time_entry_edits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id   UUID NOT NULL REFERENCES time_entries ON DELETE CASCADE,
  field_name      TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  reason          TEXT,                                       -- required if delta > 15min (enforced in API)
  edited_by       UUID REFERENCES auth.users,
  edited_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entry_edits_entry ON time_entry_edits (time_entry_id, edited_at DESC);

-- ── Location stops & segments (mileage IRS-compliant per §5.10.6) ───────────
CREATE TABLE IF NOT EXISTS location_stops (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users,
  time_entry_id     UUID REFERENCES time_entries,
  job_id            UUID REFERENCES jobs,
  category          TEXT,                                     -- 'office'|'job_site'|'fuel'|'food'|...
  category_source   TEXT,                                     -- 'geofence'|'ai'|'manual'
  ai_confidence     NUMERIC(3,2),
  lat               NUMERIC NOT NULL,
  lon               NUMERIC NOT NULL,
  place_name        TEXT,
  place_address     TEXT,
  arrived_at        TIMESTAMPTZ NOT NULL,
  departed_at       TIMESTAMPTZ,
  duration_minutes  INT,
  user_overridden   BOOLEAN NOT NULL DEFAULT false
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_stops_category_source_chk') THEN
    ALTER TABLE location_stops
      ADD CONSTRAINT location_stops_category_source_chk
        CHECK (category_source IS NULL OR category_source IN ('geofence','ai','manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_location_stops_user_time ON location_stops (user_id, arrived_at DESC);

CREATE TABLE IF NOT EXISTS location_segments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users,
  time_entry_id     UUID REFERENCES time_entries,
  vehicle_id        UUID REFERENCES vehicles,
  start_stop_id     UUID REFERENCES location_stops,
  end_stop_id       UUID REFERENCES location_stops,
  started_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ,
  distance_meters   NUMERIC,
  path_simplified   GEOMETRY,                                 -- PostGIS, simplified to ~50 points
  is_business       BOOLEAN NOT NULL DEFAULT true,
  business_purpose  TEXT
);

CREATE INDEX IF NOT EXISTS idx_location_segments_user_time ON location_segments (user_id, started_at DESC);

-- ── Receipts (AI-extracted via worker/src/lib/ai-usage-tracker.ts, §5.11) ───
CREATE TABLE IF NOT EXISTS receipts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users,
  job_id                   UUID REFERENCES jobs,
  time_entry_id            UUID REFERENCES time_entries,
  location_stop_id         UUID REFERENCES location_stops,
  vendor_name              TEXT,
  vendor_address           TEXT,
  transaction_at           TIMESTAMPTZ,
  subtotal_cents           INT,
  tax_cents                INT,
  tip_cents                INT,
  total_cents              INT,
  payment_method           TEXT,
  payment_last4            TEXT,
  category                 TEXT,
  category_source          TEXT,                              -- 'ai'|'user'|'rule'
  tax_deductible_flag      TEXT,                              -- 'full'|'partial_50'|'none'|'review'
  notes                    TEXT,
  photo_url                TEXT NOT NULL,                     -- resolved by storage.ts
  ai_confidence_per_field  JSONB,
  status                   TEXT NOT NULL DEFAULT 'pending',   -- 'pending'|'approved'|'rejected'|'exported'
  approved_by              UUID REFERENCES auth.users,
  approved_at              TIMESTAMPTZ,
  client_id                TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_status_chk') THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_status_chk
        CHECK (status IN ('pending','approved','rejected','exported'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_tax_flag_chk') THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_tax_flag_chk
        CHECK (tax_deductible_flag IS NULL OR tax_deductible_flag IN ('full','partial_50','none','review'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_receipts_user_time ON receipts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_job ON receipts (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts (status, created_at DESC) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS receipt_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id    UUID NOT NULL REFERENCES receipts ON DELETE CASCADE,
  description   TEXT,
  amount_cents  INT,
  quantity      NUMERIC,
  position      INT
);

-- ── Point codes (179-code Starr Surveying taxonomy — see §5.3) ──────────────
-- Phase F0 deliverable: import the canonical list before this row count
-- can grow. The list currently lives offline (Henry/dad's printout); Phase
-- F0 inventories and codifies it.
CREATE TABLE IF NOT EXISTS point_codes (
  code            TEXT PRIMARY KEY,
  category        TEXT NOT NULL,
  display_color   TEXT,
  description     TEXT,
  is_custom       BOOLEAN NOT NULL DEFAULT false
);

COMMIT;
```

**RLS.** Follows the existing project pattern from `seeds/099_fieldbook.sql` and `seeds/210_hardening.sql`: explicit `service_role` full-access policies wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` blocks, plus authenticated-user policies scoped by `user_id` (employees) or company-membership (admins). Location data has stricter rules — only the user themselves and explicit admins (not all employees) can read another user's location records. Concrete example for `field_data_points`:

```sql
ALTER TABLE field_data_points ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_field_data_points
    ON field_data_points FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY field_data_points_owner_read
    ON field_data_points FOR SELECT TO authenticated
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

The same pattern repeats for every new table. For `location_stops` and `location_segments`, the SELECT policy additionally checks an `is_admin_for_company()` SECURITY DEFINER function (defined in `seeds/210_hardening.sql`) rather than allowing arbitrary `authenticated` reads — location is the most sensitive surface in the schema (§5.10.1).

### 6.4 Offline sync engine

Same architecture as v1. Adds:

- Time entries: highest-priority sync class (payroll-critical)
- Receipts: high-priority (small payload, high-value)
- Location data: chunked uploads (every 10 min while online, batched to 100 pings or 5 min of motion per chunk; entirely deferrable on bad signal)
- Receipt AI extraction: client uploads photo first; server runs Claude Vision (via `worker/src/lib/ai-usage-tracker.ts` per §5.11); result pushed back via the existing Supabase Realtime channel

**Realtime channel reuse.** Server-pushed updates (receipt-extraction-complete, time-edit-approved, dispatch-reassignment) ride the existing `research-events` bus defined in `worker/src/shared/research-events.ts` (zod-validated discriminated union, 8 event types). The mobile client subscribes via Supabase Realtime mirroring how the web app's `useResearchProgress` hook works (`lib/research/useResearchProgress.ts`). Phase F0 task: extend the discriminated union with mobile-specific event variants (e.g. `field.receipt.extracted`, `field.time_entry.approved`) — no second realtime channel.

---

## 7. UI/UX principles

### 7.1 Field-optimized design rules

1. **One-handed reachable** — primary actions in bottom 40% of screen
2. **Large tap targets** — minimum 60×60 px (glove-friendly)
3. **Sun-readable** — high-contrast theme, 1-tap toggle in lock screen widget
4. **Voice-driven where possible** — every text field has a mic shortcut
5. **Predictable layout** — primary action always in the same place
6. **Speed over decoration** — no animations >200ms, no splash after first launch
7. **Battery-aware** — dark mode default, GPS at minimum useful frequency, in-app battery indicator
8. **Failure-tolerant** — every action has retry / try later; offline never feels like an error
9. **Privacy-visible** — location-tracking indicator always visible while active

### 7.2 Information architecture

```
Tab bar (always visible):
  [ Jobs ]  [ Capture ]  [ Time ]  [ $ ]  [ Me ]
              ↑ floating big button, always reachable
                long-press = capture without job
```

`$` is the receipts tab. `Time` is the timesheet/clock view. `Me` is settings/profile.

### 7.3 Empty / error states

- No signal: subtle banner, never modal
- No GPS lock: photo still captures, GPS field stays empty
- Storage full: banner with one-tap cleanup
- Battery <20%: subtle banner, offer to reduce capture quality + GPS precision
- Location permission denied: explanation + one-tap to open OS settings
- Camera permission denied: same

### 7.4 Dispatcher web view

**Lives inside the existing `/admin/` app, not a separate route tree.** Reuses the existing admin auth, layout (`app/admin/layout.tsx`), and role gating. Recommended new pages:

- `/admin/dispatcher` — live crew map (top of dashboard)
- `/admin/field/today` — today's activity feed (clock-ins, captures, receipts, anomalies) as a stream
- `/admin/field/[user]` — per-employee timeline view (drill-down)
- Approval queues piggyback on existing `/admin/hours-approval/` (time edits) and `/admin/payroll/` (advances/bonuses); receipts and mileage approval add `/admin/receipts/` and `/admin/mileage/` siblings.

No parallel `/dispatcher/` or `/field-admin/` route tree — that would duplicate auth, layout, and the admin role gating already in place.

---

## 8. Future integrations

### 8.1 Trimble Access integration (post-v1)

**Path A — File exchange (simplest):** Trimble Access exports JobXML or CSV to a watched cloud folder; Starr Field auto-imports and links by name. ~80% of value with ~20% effort. **v1.5 candidate.**

**Path B — Trimble Connected Community / Sync API:** polls or webhooks for job updates; bidirectional. Requires Trimble developer account. **v2 candidate.**

**Path C — Real-time point streaming:** local Bluetooth/WiFi link between phone and Trimble controller; every shot appears in Starr Field within seconds. Requires Trimble SDK access. **v2.5 / v3 candidate.**

### 8.2 Other future integrations
- **QuickBooks Online direct API** — bypass CSV export for receipts and time
- **Civil 3D round-trip** — export field-captured points + media as a Civil 3D-friendly bundle
- **Starr CAD direct link** — open captured photo from inside Starr CAD by clicking the point
- **Apple Watch / Wear OS companion** — clock-in/out, voice memo, view current job
- **Fleet fuel card APIs** — Wex, Comdata, Voyager auto-reconciliation
- **AR overlay** — point camera at property, see captured points overlaid (long-term R&D)
- **Drone footage import** — drag folder of drone photos, GPS-match to property
- **Weather / sun angle metadata** — auto-tag captures with conditions

---

## 9. Phased build plan

**Phase numbering note.** These phases are scoped to **Starr Field only** and use the prefix `F` (`F0`, `F1`, …) to disambiguate from the build-phase taxonomy in `docs/platform/RECON_INVENTORY.md` §12 (which uses `Phase 0/A/B/C/D/E/F/G` for STARR RECON). Starr Field is a separate product whose phases run independently — `F0` does not block on Recon's `Phase A`, and Recon's `Phase F` (public go-live) does not block on Starr Field's `F6`. Each phase below is independently shippable.

### Phase F0 — Foundation (Week 0–2)
- [x] Expo project scaffolded (TypeScript, ESLint, Prettier matching Next.js repo)
- [x] Supabase Auth wired in (sign-in, biometric unlock)
- [x] Local SQLite + sync queue scaffolding (PowerSync — `mobile/lib/db/{schema,connector,index}.tsx`)
- [x] Tab bar shell, navigation, theme (`mobile/app/(tabs)/_layout.tsx` + `lib/theme.ts`)
- [ ] EAS Build configured (TestFlight + internal Android) — `eas.json` exists; first TestFlight push pending
- [ ] OTA updates working — `expo-updates` installed; channel wiring pending
- [x] Crash reporting (Sentry) — `mobile/lib/sentry.ts` + `initSentry()` in root layout

**Exit:** team installs app, signs in, sees empty home. **Status:** mobile-side scaffold green; build/OTA hand-off remains.

### Phase F1 — Jobs + basic time logging (Week 3–5)
- [x] Job list, create, edit, search/filter
- [x] Job detail with placeholder tabs
- [x] Clock-in / clock-out from home + lock-screen widget — clock surface in `(tabs)/time/index.tsx`; lock-screen widget pending (F1 polish)
- [x] Job auto-suggest by GPS proximity (one-shot, not continuous tracking)
- [x] Manual time editing with audit trail — `lib/timeEdits.ts` + `time_edits` table, see `(tabs)/time/edit/[id].tsx`
- [x] "Still working?" smart prompts — `lib/timePrompts.ts` (10h + 14h)
- [x] Timesheet view + CSV export — `(tabs)/time/index.tsx` + `lib/csvExport.ts`
- [x] Submit-for-approval workflow — `lib/timesheetActions.ts` `useSubmitWeek` flips `'open' → 'pending'` so the existing admin Hours-Approval queue surfaces mobile-submitted rows alongside web-direct ones. `DailyLogStatus` union in `lib/timesheet.ts` unifies the previously-divergent enums (web `'pending' / 'adjusted' / 'disputed'` ∪ mobile `'open' / 'submitted'`); legacy `'submitted'` preserved as alias. Status chip + lock banner copy handles every state.

Resilience additions landed in F2/F3 batches but belong to F1's surface (referenced in §5.8 hardening):
- [x] Stale clock-in detection (>16h banner with "Fix the time" route to time-edit)
- [x] Last-known GPS fallback when live fix fails — `lib/location.ts` `getCurrentPositionWithFallback`
- [x] GPS failure-reason routing (no_permission / timeout / hardware) drives Settings deep-link

**Exit:** Jacob runs an entire week of work using the app for time. **Status:** F1 mobile surface complete. Lock-screen widget + EAS build/OTA flip from F0 are the only remaining infra pieces before the exit ships to TestFlight.

### Phase F2 — Receipts + AI extraction (Week 6–8)
- [x] Receipt capture flow (camera, edge detection, deskew) — `lib/receipts.ts` + `lib/storage/mediaUpload.ts`
- [x] Claude Vision API integration for field extraction — worker-side; mobile reads `extraction_status` per row
- [x] Category, job association, payment method, tax flag — `(tabs)/money/[id].tsx` editor
- [x] Receipt list view, edit, approve workflow — `(tabs)/money/index.tsx`
- [x] Per-job and per-period rollups — `useJobReceiptRollup` in `lib/receipts.ts`, surfaced on job detail
- [x] Bookkeeper export (CSV, QuickBooks-ready) — `lib/csvExport.ts` (mobile) + web admin `/api/admin/receipts/export`

Resilience additions:
- [x] Offline-first capture: row INSERT first, then `enqueueAndAttempt` via `lib/uploadQueue.ts`. Visible in list immediately when offline; photo lands when reception returns.
- [x] Per-receipt local-fallback URL via `usePendingUploadLocalUri` so the gallery shows the snapshot without waiting for the signed URL.

**Exit:** Jacob can replace expense reports for v1 use. **Status:** shipped; bookkeeper validation outstanding.

### Phase F3 — Data points + photos (Week 9–12)
- [x] Create data point with name from 179-code library — `lib/dataPoints.ts` + `lib/dataPointCodes.ts`
- [x] Camera capture, multi-photo — `lib/fieldMedia.ts`
- [x] Phone GPS / compass / altitude metadata — captured in `useAttachPhoto`; compass heading still pending (`expo-sensors` magnetometer not yet wired)
- [ ] Photo annotation (arrow, circle, text) — `field_media.annotated_url` column reserved; F3 #6 in flight
- [x] Job-level photo upload (no point assignment) — `attachPhoto({ dataPointId: null, jobId })`
- [ ] Office reviewer sees points + photos in web app — admin viewer pending

Resilience additions (same offline-first pattern as F2):
- [x] INSERT field_media first → enqueue upload; `upload_state` flips `pending → done`/`failed` via `lib/uploadQueue.ts`
- [x] Optional device-Photos backup via `lib/deviceLibrary.ts` (opt-in toggle on Me tab)

**Exit:** Found-monument workflow <60s. **Status:** core capture loop shipped; annotation overlay + admin viewer remain.

### Phase F4 — Voice + video + notes (Week 13–16)
- [ ] Voice memo + on-device transcription
- [ ] Video capture (1080p, 5min cap)
- [ ] Free-text notes + structured templates (offset, monument, hazard, correction)
- [ ] Voice-to-text shortcut
- [ ] Search across notes + transcriptions

**Exit:** Field documentation fully replaces paper notes. **Status:** not started.

### Phase F5 — Files + CSV (Week 17–18)
- [ ] File upload from device, cloud, web link
- [ ] PDF / image / CSV preview
- [ ] Pin-to-device for offline access
- [ ] CSV parser (P,N,E,Z,D and variants)
- [ ] Auto-link CSV rows to phone-side data points by name

**Exit:** Raw survey data and reference docs at fingertips. **Status:** not started.

### Phase F6 — Location tracking + dispatcher view (Week 19–24)
- [ ] One-time consent flow — permission rationale + privacy disclosure UI
- [x] Background location with battery-conscious modes — `lib/locationTracker.ts` (high/balanced/low tiers based on battery %), `seeds/223_starr_field_location_pings.sql`, native config in `mobile/app.json` (UIBackgroundModes + ACCESS_BACKGROUND_LOCATION + foreground service)
- [ ] Stop detection, geofence + AI classification — derives from `location_pings` once F6 worker lands
- [ ] Daily timeline view (employee + admin) — `location_segments` / `location_stops` tables planned in 224 seed
- [ ] Mileage log generation (IRS-format export) — depends on stop/segment derivation
- [ ] Vehicle assignment + driver/passenger — `vehicles` table exists; mobile picker pending
- [x] Dispatcher live map (web app, partial) — `/admin/team` shows last-known GPS + battery + staleness; full live map pending
- [ ] Day-replay scrubber (web app)
- [ ] Missing-receipt cross-reference prompts
- [ ] Privacy controls panel (employee-facing) — pause-tracking + view-my-own-timeline

**Exit:** Full location-aware feature set live. **Status:** background-tracking infra + dispatcher last-seen shipped; stop-detection, mileage export, day-replay remain.

### Phase F7 — Polish + offline hardening (Week 25–28)
- [x] Storage management UI — Me-tab Uploads section + drilldown (`(tabs)/me/uploads.tsx`); per-row retry/discard
- [x] Sync UI improvements (per-asset progress, retry surfaces) — `useUploadQueueStatus` + the Uploads screen
- [ ] High-contrast / sun-readable theme — dark mode default exists; high-contrast variant pending
- [ ] Battery profile audit — needs real-device measurement
- [ ] Tablet layout (truck-mounted iPad) — `supportsTablet:true` set; layout work pending
- [ ] Conflict resolution UX for multi-device
- [ ] Stress-test: 30 days of data on 5 devices

**Exit:** v1 shippable to all surveying employees with confidence. **Status:** offline hardening shipped early (alongside F2/F3 capture). Other items pending.

### Phase F8 — Trimble Access file exchange (Week 29–32)
- [ ] Watched cloud folder for Trimble JobXML / CSV
- [ ] Auto-import with preview
- [ ] Auto-link by name with unmatched-name surfacing

**Exit:** Trimble integration v1 (Path A from §8.1).

### Phase F9+ — Real-time integrations, AR, watch app, fuel-card reconciliation (research)

---

## 9.x — Resilience batches (cross-cutting, completed)

These batches landed alongside F1–F3 work to satisfy the user's
explicit resilience requirement: *"sometimes the user will lose
reception … the application needs to be able to save images and
videos and voice recordings to the app and the data also need to
be able to be saved to the phone storage as well … if the gps
signal is lost, we just need to keep track of the last known
location of the user's phone until they get reception again …
the admin/dispatcher needs to be able to notify the user that
they need to log their hours."*

They span multiple phases (capture from F2/F3, GPS from F6,
notifications from F1+) so they're tracked here rather than
under one phase.

**Batch A — offline-first capture + last-known GPS + stale clock-in**
- [x] `mobile/lib/networkState.ts` — `useIsOnline()` / `subscribeToOnline()` / `isOnlineNow()`
- [x] `mobile/lib/uploadQueue.ts` — durable retry queue rooted at
      `FileSystem.documentDirectory`. Backoff `[5s, 10s, 20s, 40s, 80s, 160s, 5min, 5min]`,
      `MAX_RETRIES = 8`. Includes `usePendingUploadLocalUri` so receipts/photos
      render the local file before the signed URL lands.
- [x] `pending_uploads` localOnly table in `mobile/lib/db/schema.ts`
- [x] `mobile/lib/receipts.ts` + `mobile/lib/fieldMedia.ts` refactored to
      INSERT row first, then enqueue
- [x] `mobile/lib/location.ts` — `rememberPosition()` /
      `getLastKnownPosition()` / `getCurrentPositionWithFallback()`
- [x] `mobile/lib/deviceLibrary.ts` — opt-in MediaLibrary backup to
      "Starr Field" album (off by default for receipts privacy)
- [x] Stale clock-in banner (`>16h`) with "Fix the time" route
- [x] Network-restore + 60s periodic drainer mounted in `_layout.tsx`

**Batch B — dispatcher → user notifications**
- [x] `seeds/222_starr_field_notifications.sql` — non-breaking ALTER on
      the existing web `notifications` table; adds `target_user_id` UUID +
      `delivered_at` / `dismissed_at` / `expires_at`, RLS for mobile owners,
      column-level GRANTs, `notifications_inbox` view, SECURITY-DEFINER trigger
      for case-insensitive email→UUID back-fill.
- [x] `mobile/lib/notificationsInbox.ts` — reactive inbox + dispatcher
      hook that fires OS-level local banner + flips `delivered_at`
- [x] `mobile/lib/NotificationBanner.tsx` — in-app banner overlay
      with source_type → mobile route map
- [x] `_layout.tsx` foreground handler that suppresses OS banner only
      for `data.kind === 'admin-ping'` (F1 #7 still-working prompts
      keep their full OS banner)
- [x] `_layout.tsx` cold-start tap-response handler with process-scope
      dedup
- [x] POST `/api/admin/notifications` with input validation +
      30-min server-side dedup for log_hours/submit_week
- [x] `/admin/team` page + sidebar link + GET `/api/admin/team`
      with last-known clock-in + last log_hours ping per user
- [x] Me-tab notification permission UX (status indicator + Settings
      deep-link)

**Batch C — background GPS while clocked in**
- [x] `seeds/223_starr_field_location_pings.sql` — append-only
      `location_pings` with battery snapshot + RLS owner SELECT/INSERT
      only (UPDATE/DELETE explicitly REVOKE'd)
- [x] `mobile/lib/locationTracker.ts` — expo-task-manager headless
      task with battery-aware accuracy tier (high >50% / balanced
      21–50% / low ≤20%) + iOS deferred updates + Android foreground
      service notification
- [x] `mobile/lib/db/index.tsx` — `getDatabaseForHeadlessTask()`
      escape hatch for the task body
- [x] `mobile/lib/timeTracking.ts` — clock-in writes a `clock_in`
      boundary ping + starts the task; clock-out writes `clock_out`
      + stops the task
- [x] `_layout.tsx` `LocationTrackerReconciler` — restarts the task
      on cold-start when there's still an open `job_time_entries`
      row (covers "phone died mid-shift, app reopened next day")
- [x] `mobile/app.json` native config — `UIBackgroundModes` +
      Android `ACCESS_BACKGROUND_LOCATION` + foreground service
      flags + expo-battery / expo-task-manager deps
- [x] `/admin/team` last-seen column with battery glyph and Maps link
- [x] PowerSync sync-rule snippet + activation gate in
      `mobile/lib/db/README.md`

**Batch D — stuck-uploads triage**
- [x] `useStuckUploads` / `retryUpload` / `discardUpload` helpers in
      `lib/uploadQueue.ts`
- [x] Me-tab Storage section showing pending + failed counts
- [x] `/(tabs)/me/uploads` drilldown with In-flight / Failed tabs +
      per-row retry / discard (Alert-confirmed destructive action)

**Batch E — submit-for-approval enum bridge**
- [x] `DailyLogStatus` union in `lib/timesheet.ts` unifies the
      previously-divergent web (`'pending' / 'approved' / 'rejected' /
      'adjusted' / 'disputed'`) and mobile (`'open' / 'submitted' /
      'approved' / 'rejected' / 'locked'`) enums. Legacy `'submitted'`
      preserved as an alias for `'pending'`.
- [x] `lib/timesheetActions.ts` `useSubmitWeek` flips `'open' →
      'pending'` so the existing `/admin/hours-approval` queue (which
      filters on `status = 'pending' OR 'disputed'`) surfaces
      mobile-submitted rows alongside web-direct ones.
- [x] `LOCKED_DAY_STATUSES` includes `'pending'` and `'adjusted'` so
      mobile blocks edits the moment the row leaves the surveyor's
      side.
- [x] `StatusChip` + `lockedDayTitle` recognise the full set
      (`'pending'`, `'submitted'`, `'approved'`, `'rejected'`,
      `'adjusted'`, `'disputed'`, `'locked'`).

**Activation gates (live Supabase apply order):**
1. `seeds/222_starr_field_notifications.sql` — before mobile
   NotificationBanner ships.
2. `seeds/223_starr_field_location_pings.sql` — before EAS-building
   a release with background tracking enabled.

PowerSync sync rules to update: `notifications` (scoped by
`target_user_id` OR case-insensitive `user_email`) + `location_pings`
(scoped by `user_id` + last 24h). Snippet in `mobile/lib/db/README.md`.

---

## 10. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Lost data due to offline sync bug | M | H | Battle-tested sync libs; sync queue tests; "export local DB" emergency button |
| Photo/video uploads consume cellular plan | H | M | Default WiFi-only originals; configurable; in-app data report |
| Phone overheats / dies in 100°F sun | M | M | Battery-aware throttling; "low power mode" for app; insulated-pouch recommendation |
| User accidentally deletes job/point/receipt | M | H | Soft delete + 30-day undo; biometric re-auth for delete |
| Two crew edit same point simultaneously | M | M | Per-field last-write-wins; media never conflicts |
| Glove use makes touch targets miss | M | M | 60+px targets; voice fallback; volume-key shortcut for capture |
| Sun glare makes screen unreadable | H | M | High-contrast theme; auto-brightness boost in capture mode |
| **Location tracking battery drain** | H | H | Significant-location-change APIs; geofence-only high accuracy; <15% target; user-visible battery panel |
| **Employee perceives location tracking as surveillance** | M | H | Hard-coded clock-out = tracking-off; transparent timeline visible to employee; opt-in consent flow; clear privacy disclosure |
| **Legal exposure on location tracking (state law)** | L | H | Texas-only at first; legal review before each new state; explicit consent; data retention limits |
| **AI hallucinates receipt fields** | M | M | Confidence score per field; bookkeeper approval required before export; original photo always retained |
| **Receipts arriving without job association during overhead time** | H | L | Default to `Overhead` job; bookkeeper can re-assign |
| Trimble integration depends on partner SDK | H | M | Build Path A first; treat C as bonus |
| App Store / Play Store rejection delays | L | M | TestFlight + internal track for staff; only public listing if needed |
| Storage costs balloon with video usage | M | M | 720p default; 5-min cap; R2 archival; per-job storage report |
| User signs out by accident, loses unsaved data | L | H | Sign-out warns if queue non-empty; local changes survive sign-out |
| **Mileage log challenged in IRS audit** | L | H | Source data + raw segments retained 7 years; IRS-format export; vehicle + business purpose mandatory |
| **Background location permission revoked by OS / user** | M | M | Detect and prompt; degrade gracefully to manual time entry; never silently fail |
| iOS / Android API changes break native modules | M | M | Pin Expo SDK; staging build catches regressions |

---

## 11. Cost model

### Development cost (one-time)
- Solo dev (Jacob), v1 (Phases F0–F7): ~7 months
- Outsourced equivalent: ~$80K–$160K
- Apple Developer: $99/yr; Google Play: $25 one-time

### Anthropic budget — shared with STARR RECON

Receipt extraction and stop classification both go through `worker/src/lib/ai-usage-tracker.ts`. They share the global daily cap with STARR RECON's adapter-repair calls (`SELF_HEAL_DAILY_CAP_USD=50` per `Self_healing_adapter_system_plan.md` §13). Before Starr Field activates Phase F2 (receipts) the cap must be raised to absorb projected mobile spend:

| Consumer | Projected daily | Notes |
|---|---|---|
| STARR RECON (self-healing) | ~$50/day worst case | Per self-healing plan §7 Scenario C |
| Starr Field (receipts) | ~$2–5/day at 5 employees | ~10–20 receipts/day × $0.02–0.04 |
| Starr Field (stop classification) | ~$1–2/day | ~10 stops/employee/day × $0.01 |
| **Recommended unified cap** | **`AI_DAILY_CAP_USD=60`** | Renamed from `SELF_HEAL_DAILY_CAP_USD` to reflect shared use |

The `AiUsageTracker` circuit breaker trips **before** the per-product budget allocation breaks, so a runaway Starr Field deploy cannot starve STARR RECON adapter repairs. Per-product attribution comes from the `(adapter_id, phase)` tags in `ai_cost_ledger`.

### Ongoing cost — ~5 employees daily, full feature set

| Item | Monthly |
|---|---|
| Supabase Pro (already paid for web) | $0 incremental |
| Supabase Storage / bandwidth | $5–20 |
| R2 storage (originals + receipts archive) | $5–30 |
| EAS Build + Update | $0–19 |
| Sentry crash reporting | $0–26 |
| Push notifications (Expo) | $0 |
| Speech-to-text (on-device) | $0 |
| **Anthropic API — receipt extraction** | $10–50 (5 emp × 100–200 receipts × $0.02–0.04) |
| **Anthropic API — stop classification** | $10–25 (5 emp × ~10 stops × 22 days × $0.01) |
| **Google Places + Distance Matrix** | $5–30 (depends on geofence cache hit rate) |
| **Total incremental** | **~$35–200/mo** |

### Per employee per month: ~$7–40

### Annualized

| Scenario | Cost | Value |
|---|---|---|
| 5 employees, full feature set | ~$1,500–$2,400/yr | Replaces paper time cards (~5h/week of admin = ~$13K/yr) + receipt re-keying (~3h/week = ~$8K/yr) + IRS-compliant mileage (~$15K/yr in deductions per active driver) |
| **ROI** | | **5–15x** |

The mileage log alone — at IRS standard rate × actual miles driven — typically pays for the entire system many times over.

---

## 12. Open questions

1. **Single-app or per-product apps?** Recommend single Starr Field with role-based features.
2. **Web reviewer experience** — extend existing job views or new screens?
3. **Photo retention policy** — forever, or purge after job closes + N years?
4. **Multi-tenant readiness** — Starr-only, or eventually offered to other firms?
5. **Crew roles + permissions granularity** — Admin / Lead / Crew / 1099?
6. **Equipment integration scope** — Trimble first; Topcon, Leica, Carlson next?
7. **Pricing if external** — bundled with Starr Software, or separate per-seat?
8. **Compliance** — TX land-survey-record retention rules?
9. **Backup strategy** — beyond Supabase + R2, client-owned ZIP export?
10. **Apple Watch / Wear OS** — separate phase or never?
11. **Location tracking legal review** — which Texas-licensed employment attorney does the review before launch?
12. **Tracking opt-out mechanics** — if an employee declines location tracking, do they still have a job? (Policy decision, not technical.)
13. **1099 contractor location tracking** — strictly disabled by default, or opt-in available with separate consent? (Lean: strictly disabled.)
14. **Receipt approval threshold** — auto-approve under $X, manual review over $X?
15. **Mileage rate** — IRS standard, custom rate, or per-vehicle actual cost?
16. **QuickBooks integration version** — QBO API direct integration vs CSV import for v1? (Lean: CSV first, API in v2.)
17. **Per diem auto-calculation** — overnight stays trigger IRS per-diem rate by ZIP? (Nice-to-have; Phase F8+.)
18. **Driver detection** — manual toggle vs. auto-detect via OS motion APIs? (Manual is fine for v1.)
19. **Time-off / PTO tracking** — in-app, or stays in whatever payroll system you use?
20. **Schedule integration** — show employees their assigned jobs for the day, with deviation alerts? (Phase F8+.)

---

## 13. Appendix A — sample API contracts

**Route namespace decision.** Mobile-callable routes live under **`/api/mobile/*`**, not under `/api/admin/*` (which is browser-only and gated by NextAuth cookies) and not under bare `/api/field/*` (no auth-model implication). The `/api/mobile/*` tree is gated by Supabase JWT, accepting `Authorization: Bearer <supabase_jwt>` headers. This split lets the same backend serve both the web admin (NextAuth) and the mobile client (Supabase JWT) without a session-translation layer. Examples below use the `/api/mobile/` prefix.

### POST /api/mobile/data-points
```json
{
  "client_id": "uuid",
  "job_id": "uuid",
  "name": "BM01",
  "description": "Found 1/2 inch rebar with cap",
  "device_gps": { "lat": 31.05789, "lon": -97.46512, "altitude_m": 192.4, "accuracy_m": 4.2, "heading": 273.5 },
  "is_offset": false,
  "captured_at": "2026-04-25T14:23:11Z"
}
```

### POST /api/mobile/time-entries (clock-in)
```json
{
  "client_id": "uuid",
  "job_id": "uuid",
  "vehicle_id": "uuid",
  "is_driver": true,
  "entry_type": "on_site",
  "clock_in": "2026-04-25T06:54:00Z",
  "clock_in_lat": 31.057,
  "clock_in_lon": -97.465
}
```

### PATCH /api/mobile/time-entries/:id (edit)
```json
{
  "clock_out": "2026-04-25T16:45:00Z",
  "edit_reason": "Forgot to clock out — actual end was 4:45pm based on memory",
  "edited_field": "clock_out",
  "old_value": null
}
```

### POST /api/mobile/receipts (multipart)
```
fields:
  client_id: uuid
  job_id: uuid
  time_entry_id: uuid
  notes: string
files:
  photo: binary

response (after AI extraction completes, via Realtime push):
{
  "id": "uuid",
  "vendor_name": "Lowes #1234",
  "transaction_at": "2026-04-25T15:21:00Z",
  "subtotal_cents": 4287,
  "tax_cents": 354,
  "total_cents": 4641,
  "category": "supplies",
  "category_source": "ai",
  "tax_deductible_flag": "full",
  "ai_confidence_per_field": { "vendor_name": 0.98, "total_cents": 0.99, "category": 0.86 },
  "line_items": [...]
}
```

### POST /api/mobile/location-stops (batch)
```json
{
  "stops": [
    {
      "client_id": "uuid",
      "user_id": "uuid",
      "time_entry_id": "uuid",
      "lat": 31.057, "lon": -97.465,
      "arrived_at": "2026-04-25T11:43:00Z",
      "departed_at": "2026-04-25T12:11:00Z",
      "category_hint": "food"
    }
  ]
}
```

### Mileage log export
```
GET /api/mobile/mileage-log.csv?user_id=...&start=2026-01-01&end=2026-12-31
→ CSV: date,vehicle,start_address,end_address,miles,business_purpose,job_number
```

---

## 14. Appendix B — capture-flow timing budgets

### Data point with photos (target 60s)

| Step | Target | Notes |
|---|---|---|
| Lock screen → app | 2s | Face ID auto-unlock |
| App → Quick Capture | 0.5s | Tab bar |
| Capture → first photo | 1s | Pre-warmed camera |
| Photo 2, 3 | 2s | Stay in capture |
| Switch to voice | 0.5s | Bottom toolbar |
| 20s voice memo | 20s | User-driven |
| Point name `BM01` | 3s | Autocomplete |
| Save | <1s | |
| **Total** | **~30s** | Half budget |

### Receipt capture (target 15s)

| Step | Target | Notes |
|---|---|---|
| Tab `$` → Camera | 1s | |
| Snap | 1s | Edge-detected, deskewed |
| AI extracts in background | 3–5s | Non-blocking |
| Confirm job (auto-filled) | 1s | |
| Optional note | 0–10s | Skippable |
| Save | <1s | |
| **Total** | **~7–18s** | |

### Clock-in (target 5s)

| Step | Target | Notes |
|---|---|---|
| Lock screen widget tap | 1s | |
| Confirm auto-suggested job | 1s | |
| Confirm vehicle | 1s | |
| Done | <1s | |
| **Total** | **~3s** | |

---

## 15. Appendix C — bootstrapping checklist (Phase F0)

- [ ] Decide app name (working title: Starr Field)
- [ ] Apple Developer + Google Play accounts under Starr Software
- [ ] App icon + splash screen
- [ ] Initialize Expo at `mobile/` in this monorepo (`npx create-expo-app mobile --template`) — see §6 preamble
- [ ] **Schema audit + snapshot:** export the live Supabase schema for `jobs`, `job_tags`, `job_team`, `job_equipment`, `job_files`, `job_research`, `job_stages_history` (and any other `job_*` tables) plus `time_entries` and related payroll tables, into a tracked `seeds/214_starr_field_existing_schema_snapshot.sql`. Without this, `seeds/220_starr_field_tables.sql` will fail against a fresh `./seeds/run_all.sh --reset` because `ALTER TABLE jobs` and `ALTER TABLE time_entries` reference tables not in the seed pipeline. **Blocks every other Phase F0 item that touches those tables.**
- [ ] **Inventory the 179-code point taxonomy:** locate the canonical list (printout, spreadsheet, or interview Henry), encode as a CSV, and seed `point_codes` in the same migration. Without this, `field_data_points.code_category` is unenforceable.
- [ ] PowerSync vs WatermelonDB 1-day spike (per §6.1)
- [ ] Reserve `app.starr.software/field` deep-link domain
- [ ] Privacy policy + terms of service drafted (required for store submission AND for location-tracking consent flow)
- [ ] **Texas-licensed employment attorney engagement letter for location-tracking review**
- [ ] Internal alpha tester list (Jacob, dad, 1–2 crew)
- [ ] MVP success metric ("Jacob does a full week using only Starr Field for time, receipts, and notes")
- [ ] **Raise unified `AI_DAILY_CAP_USD` from $50 → $60** (per §11) and rename the env var across both root and worker `.env.example` files; coordinate the rename with the self-healing plan's bootstrapping
- [ ] Google Cloud project + Places/Distance Matrix billing alerts
- [ ] Verify PostGIS extension enabled on the live Supabase project (`SELECT extname FROM pg_extension WHERE extname='postgis'`)
- [ ] Confirm with Hank Maddux RPLS that `fieldbook_notes` is the right home for mobile structured notes (per §5.5) — if not, decide on a parallel `field_notes` table with explicit reasons

---

## 16. Decision log

| Date | Decision | Rationale | Decider |
|---|---|---|---|
| 2026-04-25 | Plan v1 drafted | Initial RFC | Jacob + Claude |
| 2026-04-25 | Plan v2 — add time/location/receipts | Field productivity + financial tracking + dispatcher visibility | Jacob + Claude |
| 2026-04-25 | Plan v3 — codebase-alignment audit pass (20 edits) | Initial draft introduced parallel systems for jobs / notes / time tracking even though substantial admin infrastructure already exists in `/admin/jobs/`, `/admin/payroll/`, `/admin/hours-approval/`, `/admin/my-hours/`, and `seeds/099_fieldbook.sql`. v3 rewrites §5.2 / §5.5 / §5.8 to extend those existing systems, drops the standalone `field_notes` table in favor of ALTERing `fieldbook_notes`, frames receipt AI extraction and storage as reuses of `worker/src/lib/ai-usage-tracker.ts` and `worker/src/lib/storage.ts`, converts §6.3 SQL to project seed conventions (`BEGIN/COMMIT`, `IF NOT EXISTS`, `DO $$ ... END $$` constraint guards) and pins it to `seeds/220_starr_field_tables.sql`, replaces the generic RLS paragraph with the concrete `service_role` pattern from `seeds/099_fieldbook.sql`, renames §9 phases `Phase 0/1/.../9+` → `Phase F0/F1/.../F9+` to disambiguate from the project-wide Phase 0/A/B/C/D taxonomy in `RECON_INVENTORY.md` §12, restricts §7.4 dispatcher view to the existing `/admin/` route tree, namespaces mobile-callable APIs at `/api/mobile/*` (Supabase JWT) instead of overloading `/api/admin/*` (NextAuth-cookie-only), commits to PowerSync (default) over WatermelonDB, declares the mobile code lives at `mobile/` in this monorepo, and adds the schema-snapshot prerequisite (`seeds/214_*`) and shared `AI_DAILY_CAP_USD=60` to §15 bootstrapping. Net: +380 / -212 lines vs v2 assembly. | Jacob + Claude |

---

*End of plan.*
