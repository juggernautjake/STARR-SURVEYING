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

### 4.6 Equipment Manager (new role, planned via §5.12)
- Owns the digital equipment inventory: receives, labels, calibrates, retires.
- Approves dispatcher assignments when conflicts arise; nags
  crews who haven't checked gear back in at end of day.
- Prep tomorrow's kits at end of today (mobile checklist of
  every assignment due to leave the office before 7 a.m.).
- Maintains a **maintenance + calibration calendar** (annual
  NIST cert for total stations, GPS firmware, vehicle service
  intervals — vehicles already tracked via the §6.3 `vehicles`
  table).
- Reviews damage reports + low-stock alerts on consumables.
- Likely a part-time hat worn by an existing crew lead at
  Starr Surveying's current size; in larger shops becomes a
  dedicated role. The schema + UI must work for both.
- Permissions: read all jobs / assignments; write all
  equipment + maintenance + check-out/in records; cannot
  approve receipts or hours (kept distinct from the
  bookkeeper hat). Mapped to a new `equipment_manager` role
  in the existing role enum.

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

### 5.12 Equipment & supplies inventory + crew assignment + dispatch templates

**Status: planned (multi-batch).** This section is split into
sub-sections that will be filled in across several prompts. This
first pass establishes the goals, the inventory data model, and
the existing infrastructure baseline. Templates, conflict
detection, check-in/out workflow, the Equipment Manager dashboard,
maintenance/calibration, mobile UX, and tax/depreciation tie-ins
are deferred to the follow-up planning prompts noted at the
bottom of this section.

#### 5.12.0 Why this matters

A surveying shop's expensive metal — total stations, GPS rovers,
data collectors, tripods, prisms — *plus* its consumables —
paint, lath, hubs, ribbon, marker flags — *plus* its personnel
all have to converge on the right job at the right time, every
day. Today that converging happens by memory, whiteboard, and
hallway conversation. The user's directive: **make every piece of
gear and every assignment tracked digitally, every crew member's
loadout planned ahead of time, and every conflict surfaced before
it becomes a "we got to the site without a tripod" problem.**

Concretely, three coupled goals:

1. **Always know where every piece is.** A live ledger of every
   serialized instrument, every consumable's stock level, every
   kit, and which job/crew/vehicle it's currently with.
2. **Plan tomorrow's jobs today.** When the dispatcher creates a
   job, they assign equipment + supplies + personnel from a
   reusable template ("4-corner residential boundary, total
   station kit") or build the kit ad-hoc. Conflicts (already in
   use, in maintenance, low stock) surface immediately.
3. **Hold the loop closed.** Crews check gear out from the
   Equipment Manager in the morning, check it back in at end of
   day. Anything still out at sunset triggers a nag. The
   Equipment Manager (new role, §4.6) owns the daily reconcile.

Out-of-scope for v1 (planned as v2 polish): RFID auto-check-in
gates, weight-based truck-load sensors, cross-shop equipment
sharing, GPS trackers welded to expensive instruments. The v1
contract is **scan-a-QR-code-or-tap-a-row UX**, not warehouse
automation.

#### 5.12.1 Inventory data model

The schema has to handle three distinct kinds of "stuff" with
different ergonomics:

**A. Durable + serialized — the expensive metal.**
- One row per physical unit. A Trimble S9 #SN12345 is one row;
  a second S9 #SN67890 is another row. Even when "the same
  model," each unit has its own calibration cert, maintenance
  history, and check-out/check-in trail.
- Required fields: `name` ("Total Station — Trimble S9 #1"),
  `category` (`total_station` | `gps_rover` | `data_collector`
  | `tripod` | `prism` | `level` | `vehicle_*` | …),
  `manufacturer`, `model`, `serial_number`, `acquired_at`,
  `acquired_cost_cents`, `useful_life_months` (depreciation
  helper), `current_status` (`available` | `in_use` |
  `maintenance` | `loaned_out` | `lost` | `retired`),
  `home_location` (which office / truck the gear lives in when
  not deployed), `notes`, `qr_code_id`.
- Calibration / warranty fields: `last_calibrated_at`,
  `next_calibration_due_at`, `warranty_expires_at`,
  `service_contract_vendor`, `last_serviced_at`.
- Photo + cert PDFs attached via the existing files-bucket
  pattern (see §5.6 / `seeds/226`).

**B. Bulk consumables — the stuff that gets used up.**
- One row per **SKU**, not per physical unit. "Pink survey
  ribbon — 1 in × 300 ft roll" is one row with a
  `quantity_on_hand` integer that decrements as the Equipment
  Manager checks rolls out and increments when a new case
  arrives. Crews don't return ribbon at end of day — it's
  consumed in the field.
- Required fields: `name`, `category` (`paint` | `lath` |
  `hubs` | `ribbon` | `marker_flags` | `nails` | `chains` | …),
  `unit` ("can", "roll", "bundle", "lb"), `quantity_on_hand`,
  `low_stock_threshold` (alert when below — Equipment Manager
  re-orders), `last_restocked_at`, `vendor`, `cost_per_unit_cents`,
  `notes`.
- Per-job "took 3 cans of pink paint" entries are recorded as
  consumption events on the assignment rows (§5.12.6, deferred)
  — they decrement `quantity_on_hand` server-side via a
  PL/pgSQL trigger so the ledger stays consistent even when two
  dispatchers assign in parallel.

**C. Kits — pre-bundled groupings of A and/or B.**
- A "Total Station Kit #3" row referencing a JSON list of
  child-piece equipment IDs: the S9 itself, its tripod, its
  prism + pole, its data collector, its case, two batteries +
  charger. Checking out the kit checks out every child as one
  atomic operation, so the dispatcher / crew sees a single line
  on the assignment screen instead of seven.
- A kit's `current_status` is the worst-case of its children
  (`maintenance` if any child is in maintenance, etc.) with the
  reason surfaced so the dispatcher knows *why* the kit is
  unavailable.
- Kits are user-defined (Equipment Manager creates them in the
  admin UI) so the shop can model their actual workflow rather
  than fighting our taxonomy.

**Cross-cutting requirements for all three kinds:**
- `qr_code_id` printed on a physical sticker for every row
  (durable units, kit cases, consumable bins). Mobile camera
  scans the QR to pull up the row instantly — the Equipment
  Manager doesn't type serial numbers. Generated by the system
  (UUIDv7 short-form) so labels can be pre-printed in batches.
- Soft-delete via `retired_at TIMESTAMPTZ` (mirrors the receipts
  Batch CC pattern). A retired Trimble S9 stays in the schema
  for depreciation closeout; the inventory list filters
  `retired_at IS NULL` by default with an "include retired"
  toggle.
- Per-row event log: `equipment_events` table records every
  state change (assigned / checked-out / checked-in /
  maintenance / loaned-out / damaged / retired) with actor,
  timestamp, and free-form note. IRS-grade audit trail and
  also feeds the §5.12.6 reconcile dashboard.

#### 5.12.2 Existing infrastructure baseline (do not duplicate)

The live Supabase schema already has two tables shipped from an
earlier admin build, plus the API route + a reference in the
admin /admin/jobs page sidebar copy. Starr Field's equipment
work **extends** these, it does not greenfield around them.

**`equipment_inventory`** (shipped):
- Columns observed in code (`app/api/admin/jobs/equipment/route.ts`):
  `name`, `equipment_type`, `brand`, `model`, `serial_number`,
  `notes`. No status, no kit support, no calibration, no
  consumable mode, no QR codes, no soft-delete.

**`job_equipment`** (shipped):
- Columns observed: `job_id`, `equipment_name`, `equipment_type`,
  `serial_number`, `checked_out_by`, `checked_out_at`,
  `returned_at`, `notes`. Free-text `equipment_name` rather than
  an FK to `equipment_inventory.id` — meaning two dispatchers
  could "check out" the same instrument to two jobs and the
  schema wouldn't notice. Today it's an audit log, not a
  reservation system.

**`/api/admin/jobs/equipment`** (shipped):
- GET (full inventory or per-job assignments), POST (add to
  inventory or assign to job), PUT (update / mark returned).
- No availability check on POST. No template support. No
  conflict detection.

**Migration strategy** (sketch — to be detailed in the §5.12.5
sub-batch):
1. New `seeds/2NN_starr_field_equipment_v2.sql` ALTERs
   `equipment_inventory` to add the §5.12.1 fields
   (`category`, `current_status`, `qr_code_id`, calibration
   columns, `acquired_*`, `retired_at`, etc.) and ALTERs
   `job_equipment` to add an FK column
   `equipment_inventory_id UUID REFERENCES equipment_inventory(id)`
   alongside the existing `equipment_name` text (kept as a
   free-text fallback for historical rows + ad-hoc entries).
2. New tables: `equipment_kits` (kit header + JSON child list),
   `equipment_kit_items` (FK rows for relational queries),
   `equipment_events` (audit log), `equipment_templates`
   (dispatcher-defined, see §5.12.3 deferred),
   `equipment_maintenance` (calibration + service log, see
   §5.12.7 deferred).
3. The existing GET / POST / PUT route stays alive but gains
   conflict-detection + template-application code paths in a
   later sub-batch. New routes (POST /reserve, POST /check-out,
   POST /check-in, GET /availability) carry the new workflow.
4. Vehicles stay in their own `vehicles` table (already deeply
   wired into mileage + location segments) — the equipment
   schema does **not** absorb them. Cross-link via a new
   `equipment_inventory.vehicle_id NULLABLE` column for
   "this case lives on Truck 3 by default" semantics, when
   useful for the loadout view.

#### 5.12.3 Job equipment templates

The user's headline ask: *"the dispatcher can create a template
that entails all of the equipment that would be used on that
kind of job, and then could reuse that template over and over
again."* The template system is what makes the §5.12.1 inventory
ledger feel like a planning tool rather than a spreadsheet.

**Concept.** A template is a named, reusable bundle declaring
what a *type of job* typically needs:
- Equipment line items (durable + consumable + kits).
- Personnel slots ("1× RPLS, 1× field tech" — fleshed out in
  §5.12.4 Personnel).
- Optional defaults: estimated duration, required
  certifications, OSHA add-ons, "needs a vehicle with hitch."

The dispatcher builds a template once. Every future job of that
type can apply the template in one tap and the assignment list
pre-fills — the dispatcher only edits the exceptions.

**Examples the user called out** (mapped to template shape):

| Template name | Items | Notes |
|---|---|---|
| "Residential 4-corner boundary — total station" | 1× Total Station Kit, 1× tripod, 1× prism+pole, 1× data collector, 4× hubs, 1× can pink paint, 4× wood lath, 1 roll ribbon | Default duration 4 h. Personnel: 1 RPLS, 1 field tech. |
| "Residential boundary — GPS" | 1× GPS Rover Kit, 1× base, 4× hubs, 1× paint, 4× lath, 1× ribbon | Same shop / same job size, different tooling preference. |
| "Topo — large parcel" | 1× Total Station Kit, 1× GPS Rover, 1× data collector, 2× tripod, 4× prism+pole | Crew of 3. |
| "Construction stakeout — residential" | 1× Total Station Kit, 50× hubs, 4× cans paint, 8× lath bundles | Higher consumable counts. |
| "Road work — OSHA add-on" | 4× cones, 2× safety vests, 1× flagger paddle | Stackable add-on, see "composition" below. |

The shop will end up with 10–25 templates over time. The schema
must support that growth without becoming a maintenance burden.

**Schema sketch — `equipment_templates` table** (one row per
named template):
- `id UUID PK`
- `name TEXT NOT NULL` (display label — "Residential 4-corner
  boundary — total station")
- `slug TEXT UNIQUE` (for stable references — `residential_4corner_total_station`)
- `description TEXT` (one-paragraph context for the dispatcher)
- `job_type TEXT` (free-form tag — `boundary`, `topo`,
  `stakeout`, `road_work`. Indexed; powers the "templates for
  this kind of job" picker.)
- `default_crew_size INT`
- `default_duration_hours NUMERIC` (rough planning hint;
  bookkeeper uses this for IRS time-on-site estimates pre-clock-in)
- `requires_certifications TEXT[]` (e.g. `{ 'rpls' }`;
  §5.12.4 Personnel uses this)
- `version INT NOT NULL DEFAULT 1` (every save bumps; see
  "Versioning" below)
- `is_archived BOOLEAN DEFAULT false` (soft-archive when a
  template is no longer used, so historical jobs that
  referenced it still resolve)
- `created_by UUID REFERENCES auth.users(id)`
- `created_at TIMESTAMPTZ DEFAULT now()`
- `updated_at TIMESTAMPTZ DEFAULT now()`

**Schema sketch — `equipment_template_items` table** (one row
per line item inside a template):
- `id UUID PK`
- `template_id UUID FK → equipment_templates(id) ON DELETE CASCADE`
- `item_kind TEXT CHECK (item_kind IN ('durable', 'consumable', 'kit'))`
- `equipment_inventory_id UUID NULL` (FK; populated for
  durable/kit when the template wants a specific instrument —
  e.g. "always Total Station Kit #3 because it's our newest")
- `category TEXT NULL` (populated when the template wants ANY
  item of a category — "any total station kit," chosen at
  apply-time. This is the common case; pinning a specific
  instrument is rare.)
- `quantity INT NOT NULL DEFAULT 1` (consumables count rolls;
  durables are typically 1 but could be 2 for "two tripods")
- `is_required BOOLEAN DEFAULT true` (when false, a missing
  item is a soft warning rather than a hard block. Lets a
  template say "ribbon if available, paint if not.")
- `notes TEXT` (free-form — "spare battery for cold-weather
  jobs")
- `sort_order INT` (display ordering; the dispatcher's UI lets
  them drag rows)

The split between `equipment_inventory_id` (specific instrument)
and `category` (any-of-kind) is the linchpin: a template that
pins SN12345 of an S9 means *that exact unit goes out*; a
template that pins `category='total_station_kit'` means *any
available kit at apply-time*. Conflict detection (§5.12.5,
deferred) interprets the two differently — a category match has
substitution flexibility; a specific match either works or
doesn't.

**Composition: stackable add-ons.** OSHA road-work gear is a
canonical example of an add-on that layers onto a base template.
Rather than maintain "Residential boundary," "Residential
boundary — road-frontage," "Topo," "Topo — road-frontage" as
four separate templates, the model supports composition:
- `equipment_templates.composes_from UUID[] NULL` — array of
  parent template IDs. When applied, the system unions the
  current template's items with each parent's items.
- Conflicts are de-duped by (`equipment_inventory_id` OR
  `category`) — applying "Residential boundary" + "OSHA road
  work" pulls a single 4-pack of cones, not two.
- Quantities sum across parents for consumables (10× hubs in
  base + 4× hubs in add-on = 14× hubs).
- Cycles are blocked by a recursion guard (`MAX_DEPTH=4`).
  Practically this only ever needs depth 2 ("base + one
  add-on"), but the guard makes a typo safe.

**Versioning.** Templates change. The dispatcher tunes "Residential
4-corner" after running it three times — adds a spare battery,
drops the 4th lath. A naive overwrite would mean the historical
record of *what was assigned to Job #427 last week* drifts to
match the new template, and audit gets confused. Two-part rule:
1. The `equipment_templates` row is **mutable** — `name`,
   `description`, item list — but every save:
   - Bumps `version`
   - Inserts a snapshot into `equipment_template_versions` (id,
     template_id, version, items_jsonb, saved_at, saved_by).
2. The `job_equipment` row records the **applied** items
   verbatim, with a `from_template_id` + `from_template_version`
   pair. The audit trail asks the snapshot, not the live
   template, when answering "what did Job #427 actually go
   out with?"

This mirrors the receipts soft-delete pattern (Batch CC) where
the audit trail outlives the user-facing edit.

**"Apply template" UX flow** (admin web):
1. Dispatcher creates / opens a job.
2. Job detail screen has an "Equipment + supplies" panel.
3. Empty panel shows two buttons: **"Apply template"** (opens a
   picker filtered by `job_type` first, then all) and **"Build
   custom"** (drops to manual line-item editor).
4. Picking a template renders a preview: every line item with
   resolved availability info from §5.12.5 (✓ available · ⚠
   in-use until Friday · ✗ in maintenance · ⚠ low stock —
   only 2 left). The dispatcher sees the conflicts BEFORE
   committing.
5. Dispatcher edits the preview (swap a specific instrument,
   bump a consumable count, remove an item) — every edit shown
   as a "diff vs. template" so the audit trail records intent
   ("dispatcher swapped S9-#1 → S9-#2 because #1 is in
   maintenance; dispatcher dropped 1× ribbon — already plenty
   on the truck").
6. **Reserve.** Items flip to status='reserved' for the job's
   scheduled window — see §5.12.5 for the lock semantics.
   Reservation does NOT yet check the gear out — that's the
   morning-of step in §5.12.6.
7. **Apply.** The job's equipment list is now populated. The
   Equipment Manager sees it in their reconcile dashboard
   (§5.12.7) so they can pre-stage the kit overnight.

**"Save as template"** shortcut on a custom-built job loadout —
one-tap promotes the dispatcher's ad-hoc kit to a reusable
template, naming it on the spot. Reduces the friction of the
"I built this from scratch and want to use it again" path that
otherwise leads to dispatchers giving up on templates.

**Permissions.**
- Create / edit / archive templates: `admin`, `equipment_manager`
  (see §4.6). Dispatchers without the equipment_manager hat
  can *use* templates but not create them — keeps the catalog
  curated rather than fragmenting into 50 near-duplicate
  templates.
- View templates: any internal role.
- Apply a template to a job: any role with job-edit
  permission (`admin`, `developer`, `tech_support`, plus
  whoever owns dispatch).

**Edge cases worth calling out now** (so they don't get lost
when §5.12.5 conflict detection is fleshed out):
- **Template references a retired instrument.** When the
  dispatcher applies a template that pins `equipment_inventory_id`
  for an instrument now `retired_at IS NOT NULL`, the apply
  flow surfaces a warning + prompts substitution to a
  category-of-kind match. Templates are not auto-rewritten on
  retire — Equipment Manager gets a "templates referencing
  retired gear" cleanup queue.
- **Template's category-of-kind has zero available units.**
  ("Any total station kit" but all four are out.) Hard-block
  the apply with the next-available date; offer "reserve for
  Friday instead?" inline.
- **Template's required certification has zero matching
  personnel today.** Soft-warn — surveyor staffing is more
  fluid than equipment, and the dispatcher may already know
  someone's coming back from PTO.
- **Cross-template conflicts during a multi-job day.** When
  two templates applied to two same-day jobs both pin the same
  S9 #1, the SECOND apply errors. Resolution: the second job
  picks a different instrument or pushes its window. The
  template apply does NOT silently win the race.
- **Bulk-apply to imported jobs.** When the existing
  `/admin/jobs/import` flow lands 50 jobs at once, an optional
  `default_template_slug` column in the import CSV pre-applies
  a template to each — turns a CSV import into a 50-job
  loadout draft in one operation. Conflicts surface as a
  pre-import preview.

**What §5.12.3 explicitly does NOT cover** (handled by later
sub-sections, sketched at the end of §5.12):
- The actual conflict-detection algorithm + reservation lock
  semantics (§5.12.5).
- Personnel slots, skill matching, capacity calendars
  (§5.12.4).
- The morning check-out / evening check-in workflow that
  consumes a reservation (§5.12.6).
- The Equipment Manager's "templates referencing retired gear"
  cleanup queue UI (§5.12.7).


#### 5.12.4 Personnel assignment + crew capacity

The user's directive: *"they can also assign personnel to the
specific crew for the job."* Equipment is half the loadout; the
other half is **who is on the truck**. This sub-section makes
crew assignment mirror the equipment model from §5.12.5 — same
reservation-window vocabulary, same conflict-detection ergonomics
— so the dispatcher learns one mental model, not two.

**Existing infrastructure (extend, do not duplicate).** The live
schema already has `job_team` (referenced in `app/api/admin/jobs/team/route.ts`,
`app/admin/components/jobs/JobCard.tsx`, the §5.2 jobs spec).
Today's columns: `job_id`, `user_email`, `user_name`, `role`,
`removed_at`. It's currently a *who's on this job at all* list —
no time windows, no skill matching, no capacity awareness.
Starr Field's personnel work ALTERs `job_team` and adds parallel
tables; it does NOT introduce a `job_personnel` rename.

**Schema additions** (extend `job_team` in place):
- `assigned_from TIMESTAMPTZ NULL` (start of the assignment
  window — defaults to job's scheduled start when NULL,
  matching the equipment reservation pattern)
- `assigned_to TIMESTAMPTZ NULL` (end of window — defaults to
  scheduled end + 1h overrun grace)
- `slot_role TEXT NULL` (the slot the person fills, e.g.
  `'rpls'`, `'party_chief'`, `'field_tech'`, `'drone_pilot'`,
  `'instrument_op'`, `'rod_person'`. Distinct from the existing
  `role` column which is generic — `slot_role` is the
  template-defined need; `role` is what they actually bring)
- `state TEXT CHECK (state IN ('proposed', 'confirmed',
  'declined', 'cancelled')) DEFAULT 'proposed'`
  - `proposed` — dispatcher pencilled them in but the surveyor
    hasn't acknowledged
  - `confirmed` — surveyor saw the assignment + tapped accept
    (mobile push notification flow, see "Surveyor flow" below)
  - `declined` — surveyor said no (PTO, conflict, sick); the
    dispatcher gets notified to re-staff
  - `cancelled` — dispatcher pulled them off; symmetric with
    equipment reservation cancellation
- `confirmed_at TIMESTAMPTZ NULL`, `declined_at TIMESTAMPTZ NULL`,
  `decline_reason TEXT NULL`
- `is_crew_lead BOOLEAN DEFAULT false` (one per job — the
  decision-maker, runs the §5.12.6 check-out, can soft-override
  per §5.12.5 if granted)
- `notes TEXT`

**New tables.**

`personnel_skills` — per-user catalogue of skills + certs:
- `id UUID PK`
- `user_id UUID FK auth.users(id)`
- `skill_code TEXT` (open enum — `rpls` (Registered Professional
  Land Surveyor), `lsit` (Surveyor in Training), `field_tech`,
  `party_chief`, `drone_pilot_part_107`, `osha_30`, `flagger`,
  `cdl_class_a`, `instrument_specialist_total_station`,
  `instrument_specialist_gnss`, custom strings allowed)
- `acquired_at DATE`, `expires_at DATE NULL` (cert expiry — the
  RPLS license, the OSHA 30-card, the Part 107 — all renewable
  on different cycles)
- `cert_document_url TEXT NULL` (PDF in the §5.6 files bucket)
- `state TEXT CHECK (state IN ('active', 'expired', 'revoked'))`
- `notes TEXT`

`personnel_unavailability` — PTO / sick / training / off-duty:
- `id UUID PK`
- `user_id UUID FK auth.users(id)`
- `unavailable_from TIMESTAMPTZ`, `unavailable_to TIMESTAMPTZ`
- `kind TEXT CHECK (kind IN ('pto', 'sick', 'training',
  'doctor', 'other'))`
- `reason TEXT NULL`, `is_paid BOOLEAN`
- `approved_by UUID NULL`, `approved_at TIMESTAMPTZ NULL`
- Cross-links to the existing time-off / PTO infrastructure
  if/when that lands; until then this table is the source of
  truth.

Indexes on both new tables mirror the equipment side: composite
`(user_id, range)` plus a partial on active/non-expired rows.

**Template hooks — required slots + certifications.** §5.12.3
already declared `equipment_templates.requires_certifications
TEXT[]` plus per-template-item `default_crew_size INT`. We
flesh that out:
- `equipment_templates.required_personnel_slots JSONB` —
  one entry per slot the template insists on. Example for
  "Residential 4-corner boundary — total station":
  ```json
  [
    { "slot_role": "rpls", "min": 1, "max": 1,
      "required_skills": ["rpls"] },
    { "slot_role": "field_tech", "min": 1, "max": 2,
      "required_skills": [] }
  ]
  ```
- "OSHA road-work add-on" template (composed via
  `composes_from`, §5.12.3) injects:
  ```json
  [{ "slot_role": "flagger", "min": 1, "max": 1,
     "required_skills": ["flagger"] }]
  ```
- The dispatcher's apply flow (§5.12.3 step 4) renders these
  slots alongside the equipment lines. Each slot widget says
  "1× RPLS needed" with a typeahead picker filtered to users
  who:
  1. Have a matching `personnel_skills` row with
     `state='active'` AND (`expires_at IS NULL OR expires_at >
     window_to`)
  2. Have no overlapping `job_team` row in `'confirmed' OR
     'proposed'` state for the same window
  3. Have no overlapping `personnel_unavailability` row

**The four "is this person assignable?" checks** (parallel to
the equipment four checks in §5.12.5):
1. **Skill check.** Does the user have an active, unexpired
   `personnel_skills` row matching the slot's required_skills?
   Hard-block when the slot is template-required; soft-warn when
   the dispatcher is filling a slot ad-hoc with an underqualified
   person ("Jacob's not a Part 107 pilot — assign anyway?").
2. **Capacity check.** Overlap with another `job_team` row in
   `proposed`/`confirmed` state. Hard-block by default — the
   user can split-shift across two jobs but only via explicit
   `assigned_from` / `assigned_to` windows that DON'T overlap.
   Suggested resolution: shrink one window or swap the person.
3. **Unavailability check.** Overlap with a
   `personnel_unavailability` row → hard-block, with the
   reason + kind shown so the dispatcher knows whether it's
   an "ask to skip PTO" conversation or a "they're at the
   doctor" non-starter.
4. **Cert-expiry-during-window check.** If a required cert
   `expires_at` falls inside the assignment window, soft-warn:
   *"Jacob's RPLS expires 3 days into this job — confirm he
   plans to renew."* Becomes hard-block when the cert is
   expired before the window even starts.

**Soft-override path.** Same vocabulary as §5.12.5 — `admin`
or `equipment_manager`-flagged dispatcher can override with a
required text reason. Override inserts the assignment as
normal but tags the row + notifies the affected user.

**Surveyor confirmation loop** (the part the user didn't
spell out, but that the directive demands — *"They can also
assign personnel"* implies an assignment is push, not a silent
schedule change):
1. Dispatcher applies a template / picks a person → assignment
   row lands in `state='proposed'`.
2. Notification (§5.10.4) hits the surveyor: *"Henry assigned
   you to [Job #427 — Smith Boundary] tomorrow 8am-noon. Tap
   to accept or decline."*
3. Mobile inbox shows a card with [Confirm] / [Decline +
   reason] buttons.
4. Confirm → `state='confirmed'`. The mobile app's daily
   schedule view (Time tab) now shows the job. The
   `next-day Today's captures rollup` (Batch II) keys off
   confirmed assignments rather than the old free-for-all
   list.
5. Decline → `state='declined'` + reason → re-fires a
   notification to the dispatcher who then re-staffs.
6. Dispatchers can also mark assignments `confirmed` on
   behalf of the surveyor — useful for a "they verbally
   agreed in person" flow. Audit log records the bypass.

**Crew lead designation.** Exactly one assignment per job has
`is_crew_lead=true`. The crew lead:
- Owns the §5.12.6 morning check-out (when the Equipment
  Manager isn't physically present)
- Is the default recipient of job-level dispatch pings
- Can soft-override per-row equipment conflicts when granted
  the `equipment_self_checkout` flag (§5.12.6)

If the dispatcher tries to confirm a job-day with no crew
lead set, the system soft-warns and auto-promotes the most
senior person (RPLS > LSIT > field tech > general role) — the
warning surfaces so the dispatcher can correct.

**Capacity calendar view** (admin web — UI brief, deferred to
implementation): a week-grid of every internal user × day,
each cell coloured by state (white = open · green = confirmed
job · yellow = proposed · grey = unavailable). Click a cell
to drill into the assignment / PTO. Lets the dispatcher see
"Jacob is fully booked Wed-Fri but open Mon-Tue" at a glance
before applying a template that needs his RPLS.

**Subcontractor / 1099 personnel** — see §4.5. Out of scope for
v1: 1099s have separate consent + permissions + tracking
scope. Schema-wise they'll hang off `auth.users` like W-2s but
with a `is_contractor=true` flag that gates location-tracking
and capacity-calendar visibility. v1 only assigns W-2
employees through `job_team`.

**Worked example** — dispatcher applies "Residential 4-corner
boundary — total station" to Job #427 Friday 8am-noon, with
the slots `[ {rpls × 1}, {field_tech × 1-2} ]`:
1. RPLS slot widget filters to active RPLS holders. Henry
   (admin, unbooked Friday) and Jacob (RPLS, on Job #422
   8-noon Thursday — clear by Friday) appear. Dispatcher picks
   Jacob.
2. Capacity check on Jacob: clear for Friday window. ✓
3. `personnel_unavailability` check: clear. ✓
4. RPLS expires 2027 — well past window. ✓ green tick.
5. Field-tech slot: dispatcher picks James. Capacity overlap
   with Job #428 1pm-5pm — fine, doesn't overlap 8-noon. ✓
6. Each assignment row inserts in `state='proposed'`. Both
   surveyors get a notification within seconds.
7. Jacob taps Confirm; James taps Decline (sick) with reason.
   Dispatcher gets a re-staff notification, picks Carlos, who
   confirms. Assignment is final.

**Race-safety.** Two dispatchers picking Jacob for overlapping
windows simultaneously: same `SELECT … FOR UPDATE` pattern as
§5.12.5 (lock the user_id row in a `personnel_locks` helper
table while the assignment insert tx runs). Second dispatcher
sees the conflict + has to substitute.

**API sketch** (provisional):
- `GET /api/admin/personnel/availability?from=&to=&skills=&user_id=`
  → returns assignable users + their conflict reasons
- `POST /api/admin/personnel/assign` — body `{ job_id, slots:
  [{ user_id, slot_role, from, to, is_crew_lead?,
    override_reason? }] }`. Atomic — all-or-none.
- `POST /api/admin/personnel/respond` — surveyor-side
  endpoint hit by the mobile [Confirm]/[Decline] buttons.
  Body `{ assignment_id, response: 'confirm'|'decline',
  decline_reason? }`.
- `POST /api/admin/personnel/cancel-assignment` — symmetric
  cancel, mirrors equipment-reservation cancel.

**What §5.12.4 explicitly does NOT cover:**
- The actual capacity-calendar UI (week-grid heatmap) —
  goes in the §5.12.7 Equipment Manager dashboards sub-section
  alongside the equipment timeline view.
- Skill / cert PDF storage workflow — re-uses the §5.6
  files-bucket pattern; no new infrastructure.
- 1099 / subcontractor onboarding (§4.5, out of v1 scope).
- The mobile inbox rendering of [Confirm]/[Decline] cards —
  re-uses Batch B notification UX with two action buttons.

#### 5.12.5 Availability + conflict detection

The user's other headline ask: *"the system should track this
and notify the dispatcher that the equipment is not available."*
This sub-section is the algorithm + data model behind that
warning — the piece that turns the §5.12.3 templates spec from
a glorified shopping list into a real planning tool.

**The central question.** When a dispatcher applies a template
or adds a line item to a job, the system must answer in
&lt;500ms:

> "Is this specific instrument (or any unit of this category)
> available for the job's scheduled window? If not, who has it,
> when does it come back, and what's the next-best
> substitution?"

**Reservation windows, not point-in-time.** The naive model —
`equipment_inventory.current_status='in_use'` — only knows
*right now*. Real planning happens days / weeks ahead: "Friday
morning crew needs an S9; Thursday's job runs late and an S9
gets stuck on-site overnight." The system needs to model time
windows, not just a current flag.

**Schema sketch — `equipment_reservations` table** (one row per
job × instrument × window, the source of truth for availability
queries):
- `id UUID PK`
- `equipment_inventory_id UUID FK NOT NULL` (specific unit;
  category-of-kind requests resolve to a specific unit at
  reserve-time, not at apply-time, so reservations always pin
  a real unit)
- `job_id UUID FK NOT NULL`
- `from_template_id UUID FK NULL`, `from_template_version INT NULL`
  (audit — see §5.12.3 versioning rule)
- `reserved_from TIMESTAMPTZ NOT NULL` (start of the window —
  default = job's scheduled start; dispatcher can adjust)
- `reserved_to TIMESTAMPTZ NOT NULL` (end of window — default
  = scheduled end + 1h overrun grace; dispatcher can adjust)
- `state TEXT NOT NULL CHECK (state IN ('held', 'checked_out',
  'returned', 'cancelled'))`
  - `held` — reservation exists but the gear hasn't been
    physically picked up yet (the §5.12.3 apply step lands here).
  - `checked_out` — Equipment Manager scanned the QR (§5.12.6).
    Carries `actual_checked_out_at`.
  - `returned` — Equipment Manager scanned at return.
    Carries `actual_returned_at`. Reservation closes.
  - `cancelled` — dispatcher pulled back before check-out.
    Free for re-reservation.
- `reserved_by UUID FK auth.users(id)`
- `notes TEXT` (substitution reason, soft-override reason, etc.)
- `created_at`, `updated_at`

**Key derived columns** on `equipment_inventory` (kept in sync
by triggers so availability lookups stay one-table fast):
- `next_available_at TIMESTAMPTZ` — earliest moment with no
  active reservation. NULL = available right now.
- `current_reservation_id UUID NULL` — points to the
  `held`/`checked_out` row that owns the unit at `now()`, if
  any. The §5.12.7 reconcile dashboard reads this directly.

**Indexes.**
- `(equipment_inventory_id, reserved_from, reserved_to)` —
  range-overlap lookups
- Partial: `(equipment_inventory_id) WHERE state IN ('held', 'checked_out')`
  — the "what's locked right now or in the future" filter
- GiST `tstzrange(reserved_from, reserved_to)` for native
  Postgres range-overlap (`&&`) queries when we have lots of
  reservations

**The four "is this assignable?" checks** (all must pass for
green-tick assignment; any failure surfaces a typed reason):

1. **Status check.** `equipment_inventory.current_status` ∈
   {`maintenance`, `loaned_out`, `lost`, `retired`} → not
   assignable, reason `'unavailable_status'` + the specific
   status. `retired_at IS NOT NULL` is also a hard fail.
2. **Reservation overlap check.** `EXISTS` an
   `equipment_reservations` row for the same instrument with
   `state IN ('held', 'checked_out')` AND
   `tstzrange(reserved_from, reserved_to) && tstzrange(window_from, window_to)`.
   Reason: `'reserved_for_other_job'` + the conflicting job
   summary + `reserved_to` (so the UI can suggest "available
   after Friday 5pm").
3. **Calibration / certification check.** When
   `next_calibration_due_at < window_to`, the unit is
   technically usable but past-due during the window. Reason:
   `'calibration_overdue'`. **Soft-warn**, not hard-block — a
   day-one-past-due tripod is still functional; the Equipment
   Manager just needs to schedule cal. Hard-block if
   configurable threshold passes (default 30 days past due).
4. **Stock check (consumables only).** When `item_kind='consumable'`,
   `quantity_on_hand &lt; quantity_needed` → reason
   `'low_stock'` + on-hand count + restock-eta from the
   vendor field on the SKU row. Soft-warn if at-or-above the
   `low_stock_threshold` minus the requested count (because
   the threshold itself is a re-order trigger, not a hard
   floor); hard-block when truly zero.

**Hard block vs. soft warn — the rule.** Templates and
dispatcher-tuned loadouts both flow through the same checks,
but the response differs:
- **Hard block** = the apply / reserve action fails with the
  typed reason. Dispatcher must substitute, defer, or
  soft-override (see below).
- **Soft warn** = the action proceeds but the row is tagged
  `notes` with the warning. The Equipment Manager's reconcile
  dashboard (§5.12.7) lists soft-warned rows as "review."

**Soft-override path** (for genuine emergencies — boundary job
where the only S9 is past calibration but the surveyor needs
something *today*):
- Dispatchers with role `admin` OR `equipment_manager` can
  click "Override conflict" on a hard-blocked row. Required:
  free-text `override_reason`. Recorded as a row in the
  per-row event log (§5.12.1) with the actor + timestamp +
  reason.
- Override does NOT collapse two reservations into one — it
  inserts a second `equipment_reservations` row with
  `notes='OVERRIDE: ' || override_reason`. The conflict
  remains visible; the Equipment Manager sees both reservations
  on the timeline and decides who gets the gear when the
  collision actually happens.
- Per the user's directive: nothing is silent. Every
  override surfaces as a `notification` (§5.10.4) to the
  Equipment Manager + a daily digest line so it doesn't get
  lost.

**Substitution suggestions** (the "what's the next-best
option?" half of the user's ask):
- When a specific-instrument check fails, the system widens
  to category-of-kind and surfaces:
  - All available units of the same category, ranked by
    proximity (same office / same vehicle home-base — see
    §5.12.1 `home_location`)
  - The blocked unit's `next_available_at` so the dispatcher
    can choose to push the job's window instead
- When a category-of-kind check fails (every unit busy):
  - Earliest `next_available_at` across all units in the
    category — "next S9 available Friday 3pm"
  - Compatible substitution categories — total station and
    GPS rover are not interchangeable in the field, but the
    template's `notes` field can declare substitution rules
    on a per-line basis (e.g. "OK to swap to GPS Rover Kit if
    no total station is free"). v1: free-form notes;
    v2 polish: structured substitution graph.

**Worked example** — dispatcher applies "Residential 4-corner
boundary — total station" template to Job #427 scheduled
Friday 8am-noon:
1. Template's category line `category='total_station_kit'`
   resolves at apply-time to the four kits in inventory.
2. Kit #1 — `current_status='in_use'`, `current_reservation_id`
   points to Job #422 with `reserved_to='Friday 6pm'`. ❌
   conflict: `reserved_for_other_job`, available Friday 6pm.
3. Kit #2 — `current_status='maintenance'`, scheduled to
   come out next Wednesday. ❌ conflict: `unavailable_status`.
4. Kit #3 — fully clear for the window. ✓ green tick. System
   pins this kit, creates the `equipment_reservations` row in
   `state='held'`.
5. Kit #4 — fully clear too (alternate). Surfaced in the UI
   as "Kit #3 reserved; Kit #4 also available — switch?"

The dispatcher sees all four states at once. Decision is
explicit, fast, and audited.

**Race-safety.** Two dispatchers applying templates at the
same instant could both try to reserve Kit #3. Resolution:
- All inserts to `equipment_reservations` go through a
  `SELECT … FOR UPDATE` of the target `equipment_inventory`
  row inside a transaction — same race-safe pattern as
  Batch QQ's `mark-exported` UPDATE.
- The second insert reads the freshly-locked row, re-runs the
  four checks, fails on reservation overlap, and surfaces the
  collision to the second dispatcher as a normal hard block.

**API sketch** (deferred to the implementation batch — names
provisional):
- `GET /api/admin/equipment/availability?from=&to=&category=&id=`
  — runs the checks, returns assignable units + conflicts
- `POST /api/admin/equipment/reserve` — body `{ job_id,
  items: [{equipment_id?, category?, quantity, from, to,
  override_reason? }] }`. Atomically reserves all items or
  none.
- `POST /api/admin/equipment/cancel-reservation` — `{
  reservation_id }`. Sets state='cancelled'.

**What §5.12.5 explicitly does NOT cover** (kept distinct so
the implementation batches stay focused):
- The morning-of QR-scan that flips `state='held'` →
  `'checked_out'` (§5.12.6).
- Personnel availability — same rules conceptually but
  different data (`job_team` rather than `equipment_reservations`).
  See §5.12.4.
- The Equipment Manager's day-of reconcile dashboard that
  reads from these reservations (§5.12.7).
- The notification routing for unreturned-at-end-of-day gear
  (§5.12.6 + §5.10.4).
#### 5.12.6 Daily check-in / check-out workflow

The user's third headline ask: *"Crews would have to rely on the
equipment manager to get them what they need for the job, and
they would have to always turn in their stuff back to the
equipment manager too at the end of the day."* This sub-section
is the daily ritual that physically consumes a §5.12.5
reservation, plus the safety nets that catch unreturned gear
before it walks off.

**The two scan moments.** The whole workflow hinges on the QR
sticker glued to every durable / kit case / consumable bin
(§5.12.1):
- **Morning check-out** flips a reservation `state='held' → 'checked_out'`,
  records the receiving crew member, stamps `actual_checked_out_at`,
  optionally captures a condition photo.
- **Evening check-in** flips `'checked_out' → 'returned'`,
  stamps `actual_returned_at`, captures a condition photo +
  optional damage note. For consumables, the difference between
  reserved quantity and returned quantity is the consumed
  count.

Both scans are first-class on the mobile app (the Equipment
Manager + crew lead use cases) and on the admin web (the
office walk-up case). The same RPC drives both surfaces so
behaviour stays uniform.

**Schema additions** (extend the §5.12.5 `equipment_reservations`
table in place — these columns are NULL until the relevant
scan happens):
- `checked_out_by UUID FK auth.users(id) NULL` — who scanned
  the gear out (typically the Equipment Manager OR an authorised
  crew lead — see "self-service after-hours" below)
- `actual_checked_out_at TIMESTAMPTZ NULL`
- `checked_out_condition TEXT CHECK (… IN ('good', 'fair', 'damaged'))`
- `checked_out_photo_url TEXT NULL` (signed-bucket reference,
  same pattern as receipts photos)
- `checked_out_to_user UUID FK auth.users(id) NULL` — the
  crew member receiving the gear (often the same person who
  scanned, but a crew lead can scan-out for a junior surveyor)
- `checked_out_to_vehicle UUID FK vehicles(id) NULL` — which
  truck the gear is loaded onto. Auto-pre-filled from the
  job's assigned vehicle (see §5.12.4 Personnel) when present.
- `actual_returned_at TIMESTAMPTZ NULL`
- `returned_by UUID FK auth.users(id) NULL`
- `returned_condition TEXT CHECK (… IN ('good', 'fair', 'damaged', 'lost'))`
- `returned_photo_url TEXT NULL`
- `returned_notes TEXT NULL`
- For consumable lines: `consumed_quantity INT NULL` (how many
  units were used in the field; `reserved_quantity -
  consumed_quantity` go back into stock).

Every transition emits a row into the §5.12.1 `equipment_events`
audit log so a future "who had this when it broke?" query is
one join away.

**Kit batch check-out — one scan, all children.** Per §5.12.1.C
a kit is a parent row with a child item list. Scanning the kit's
QR pulls every child's reservation forward atomically:
1. The scan resolves to the kit's `equipment_inventory_id`.
2. The mobile RPC fetches every child reservation with the
   same `job_id` + `state='held'` + `reserved_from` overlapping
   today.
3. All matching children + the parent flip to `'checked_out'`
   in a single transaction.
4. The condition photo is captured once at the kit level (the
   case exterior); per-child conditions inherit unless the
   crew flags an exception inline.

The reverse holds at check-in — one scan returns the whole kit
unless the surveyor explicitly marks an item missing or damaged
mid-scan.

**Condition documentation.** A condition photo isn't required
for `'good'` returns, but it IS required for `'damaged'`,
`'fair'`, or `'lost'` so the audit trail has visual evidence.
The mobile capture flow re-uses the receipts camera mode (high
contrast, edge detection, brightness correction — §5.11.1) so
the surveyor learns the affordance once.

**Damage triage flow** (when `returned_condition='damaged'`):
1. Equipment Manager gets a notification immediately (§5.10.4
   pings).
2. The instrument's `current_status` flips to `maintenance`,
   blocking further reservations (§5.12.5 status check).
3. A `maintenance_event` row is created (data model lands in
   §5.12.8) with the photo + the surveyor's note.
4. The Equipment Manager triages — repair in-shop, send to
   vendor, retire. Status flips again when the resolution
   lands.

**Lost-on-site protocol** (when `returned_condition='lost'` —
the $200-prism-in-the-woods case):
- The reservation auto-attaches the surveyor's
  most-recent-clock-in `location_pings` cluster (last 1h
  before clock-out) so the search has GPS context.
- A `lost_equipment` notification routes to admin +
  Equipment Manager + the on-site crew lead, with a deep link
  to the map view.
- The instrument's `current_status` flips to `lost`. Insurance
  packet generation is a §5.12.11 polish item; v1 records
  enough state for a manual claim.

**End-of-day unreturned-gear nag** — the user's directive made
this explicit:
- Cron tick at 6pm and 9pm Mon-Fri (configurable). Query:
  `equipment_reservations WHERE state='checked_out' AND
   reserved_to < now()`.
- For each row, push a notification (§5.10.4) to the
  `checked_out_to_user`: *"You haven't returned [Kit #3]. Drop
  it off or extend the reservation — tap to act."*
- The notification has two actions inline: **Extend until
  tomorrow 8am** (extends `reserved_to`, no further nag
  tonight) and **Mark in transit** (you're driving it back
  right now; nag silenced until midnight). Anything else gets
  re-nagged at 9pm.
- Daily digest at 10pm to admin + Equipment Manager listing
  every still-unreturned row plus its on-site GPS so morning
  follow-ups have context.

**Crew clock-out gating.** A surveyor tapping "Clock out" on
the Time tab triggers a check: any active `equipment_reservations`
with `state='checked_out' AND checked_out_to_user = me`?
- If yes → modal: "You have 3 items still checked out: Kit
  #3, GPS Rover #2, 12× ribbon. Returning now? [Scan to
  return] [Keep overnight]." Keeping overnight stamps the
  reservation `extended_overnight_at` so the daily digest
  surfaces it.
- If no → clock-out proceeds normally.

The check is local-fast (the mobile app already has the user's
reservations cached via PowerSync) so it doesn't add network
latency to the clock-out path.

**Self-service after-hours protocol.** Reality check: the
Equipment Manager isn't always at the office at 6am when the
crew leaves for a 7am job site. Two flavours:
1. **Authorised crew lead.** Some surveyors get
   `equipment_self_checkout=true` on their user row. They can
   scan-out gear themselves before/after office hours. The
   audit log makes the actor distinct from the Equipment
   Manager so accountability is clear.
2. **Smart-locker / drop-box.** v2 polish — a physical
   locker that opens via a one-time code generated by the
   reservation. v1: just trust + the audit log.

Either way, the schema doesn't change; only the actor on the
event log differs.

**Consumables: a different ritual.** Durables have one-out /
one-in symmetry. Consumables don't — paint is sprayed, lath
is driven into the ground, ribbon is left on a fence. The
check-in step asks *how many units came back*:
- Reserved 4 cans of paint, returned 1 → `consumed_quantity=3`,
  `equipment_inventory.quantity_on_hand` decremented by 3 via
  the same trigger that handles direct stock changes (§5.12.1).
- Reserved 50 hubs, returned 0 → `consumed_quantity=50`,
  same decrement.
- Reserved 1 roll of ribbon, returned 1 (still mostly on the
  roll) → `consumed_quantity=0`. The roll lives on; partial
  consumption doesn't drop the SKU count until the
  Equipment Manager weighs / inspects and adjusts manually
  (low-fidelity by design — chasing fractional rolls isn't
  worth the friction).

When `quantity_on_hand` crosses below `low_stock_threshold`
the Equipment Manager gets a §5.12.7-dashboard alert (deferred)
and the Schedule-C-feed sees a "consumables consumed" line
for the period.

**API sketch** (provisional names — implementation batch will
finalise):
- `POST /api/admin/equipment/check-out` — body `{ qr_code_id,
  job_id?, condition, photo_url?, to_user, to_vehicle? }`.
  Resolves QR → equipment_id → matching held reservation,
  flips to `checked_out`, writes the event log row.
- `POST /api/admin/equipment/check-in` — body `{ qr_code_id,
  condition, photo_url?, notes?, consumed_quantity? }`. Same
  resolution, flips to `returned`.
- `POST /api/admin/equipment/extend-reservation` — body `{
  reservation_id, new_reserved_to }`. Used by the nag-action
  inline button.
- `GET /api/admin/equipment/my-checkouts` — for the mobile
  "what's in my truck right now" tab (§5.12.9, deferred).

**Offline-first behaviour.** The mobile check-out / check-in
flows must work in a parking-lot dead zone:
- Scan + photo + form submit lands in the existing
  `pending_uploads` queue (§5.9 / `lib/uploadQueue.ts`).
- The reservation's local PowerSync row optimistically flips
  to `checked_out`/`returned` so the surveyor sees instant
  feedback.
- Server-side conflict resolution: a second-actor scan that
  reaches Postgres first wins; the PowerSync replay surfaces
  a "this was already returned by [other user]" toast and
  rolls back the local optimistic flip.

**What §5.12.6 explicitly does NOT cover:**
- The Equipment Manager's reconcile dashboard listing every
  open / overdue / coming-back-tonight reservation
  (§5.12.7).
- The maintenance event lifecycle that consumes a
  `damaged` return (§5.12.8).
- Insurance-packet generation for `lost` returns (§5.12.11).
- The "what's in my truck right now" surveyor view
  (§5.12.9).
#### 5.12.7 Equipment Manager dashboards

The §4.6 Equipment Manager runs the daily flow that the
preceding sub-sections describe. They need one role-specific
landing page that surfaces everything actionable today —
*what's leaving, what's coming back, what's broken, what's
running low* — without having to bounce across 5 admin
screens. This sub-section is the UI brief for that landing
page plus four supporting dashboards.

The schema work for these dashboards is already done — every
view here reads from tables defined in §5.12.1, §5.12.4,
§5.12.5, and §5.12.6. The implementation batch only adds
queries + UI; no migrations.

**Sidebar anchor.** New section in `app/admin/components/AdminSidebar.tsx`
called **"Equipment"** sitting between *Work* and *Rewards & Pay*:
- 🛠 Today (`/admin/equipment` — landing page below)
- 📋 Reservations (`/admin/equipment/reservations`)
- 🧰 Inventory (`/admin/equipment/inventory`)
- 🛡 Maintenance (`/admin/equipment/maintenance`)
- 📦 Consumables (`/admin/equipment/consumables`)
- 👥 Crew calendar (`/admin/equipment/crew-calendar`)
- 💼 Fleet valuation (`/admin/equipment/valuation`)

Roles: `['admin', 'developer', 'tech_support', 'equipment_manager']`,
`internalOnly: true`. The dashboard pages also degrade
gracefully for `admin` / `developer` who don't carry the
equipment_manager hat — they see read-only views.

##### 5.12.7.1 Today (the landing page)

The single most-visited screen. Three vertical strips, each
glanceable in 2 seconds:

**Strip A — Going out today** (top third):
- Pulls `equipment_reservations` rows where `state='held'`
  AND `reserved_from::date = today`.
- Grouped by job. Each job card shows: job number + name,
  scheduled crew, scheduled equipment items, scheduled vehicle,
  go-time. Soft-warn badges surface anything from §5.12.5
  (calibration due, low stock, stale config) so the
  Equipment Manager sees the problems BEFORE the truck
  rolls.
- Per-card action: **"Pre-stage kit"** button → records a
  `pre_staged_at` timestamp on the reservations + emits an
  audit event ("Equipment Manager pre-staged Job #427 at 5:42pm").
  Lets Equipment Manager check off "I built tomorrow's kit
  tonight" without involving a QR scanner.
- Per-card action: **"Hand off (no scanner)"** override →
  same effect as a QR scan check-out (§5.12.6) but logged
  with `actor='equipment_manager'` + `reason='manual_override'`.
  For the case where a sticker fell off or the camera won't
  focus.

**Strip B — Out right now** (middle third):
- `equipment_reservations` rows where
  `state='checked_out'` AND `reserved_to >= now()`.
- Sorted by `reserved_to` ascending — what comes back next
  is at the top.
- Each row: equipment label, who has it, which job, when it's
  due back, an "On time / Overdue / At risk" pill (overdue =
  past `reserved_to`; at risk = within 1h of `reserved_to`
  but the surveyor's location_pings cluster doesn't yet
  show movement back toward the office).
- The "at risk" tag uses the same location infrastructure the
  Batch DD missing-receipt scan keys off of — proactive nag
  before the gear is officially late.

**Strip C — Already returned today** (bottom third, collapsed
by default):
- `equipment_reservations` rows where `state='returned'` AND
  `actual_returned_at::date = today`.
- One row per item, condition badge (✓ good · ⚠ fair · ⚡
  damaged · ❓ lost). Damaged + lost rows link straight into
  the §5.12.8 maintenance flow / §5.12.11 lost-equipment
  packet.
- Strip serves as the daily reconcile artifact — Equipment
  Manager can confirm at end of day that every morning's
  Strip-A row eventually landed in Strip C, with a count
  guard at the top: *"42 went out · 39 returned · 3 still
  out (see Strip B)."*

**Top-of-page banners.**
- Red banner: any `personnel_unavailability` rows starting
  today that the dispatcher hasn't yet re-staffed — pulls
  through from §5.12.4 to keep the Equipment Manager in the
  loop on people-side gaps that affect today's gear plans.
- Amber banner: any `low_stock_threshold` consumables that
  dropped below threshold yesterday + are reserved for today's
  jobs.
- Blue banner: maintenance windows starting today
  (§5.12.8).

**Mobile parity.** The Equipment Manager mobile app gets a
trimmed version of this same view as their default home tab
— the morning + evening rituals happen at the gear cage, not
at a desk.

##### 5.12.7.2 Reservations (timeline view)

A horizontal Gantt-style timeline of every
`equipment_reservations` row across the next 14 days,
swappable to per-equipment vs per-job grouping:
- **Per-equipment row** — one swimlane per durable / kit,
  showing back-to-back reservations as colored bars
  (`held` = light blue, `checked_out` = solid blue,
  `returned` = grey, `cancelled` = strikethrough). Gaps
  visualise availability windows.
- **Per-job row** — one swimlane per job, showing every
  piece of equipment reserved to it as bars.
- Click a bar → drilldown drawer shows the reservation row
  + the four §5.12.5 check results + soft-override history.
- Drag-resize a `held` bar to extend / shrink the window
  without leaving the page (re-runs availability checks +
  flags any new conflicts inline).
- Filter chips at the top: equipment category, job type,
  state, overdue-only.

This view is the Equipment Manager's *long-range planning*
tool. The §5.12.7.1 Today page is for the next 24h; this page
is for "do we have what we need for next week's jobs?"

##### 5.12.7.3 Inventory (catalogue view)

The list of every row in `equipment_inventory`:
- Filterable by category, status, home_location, calibration
  due, retired_at IS NULL/NOT NULL.
- Inline-edit columns for the Equipment Manager:
  `home_location`, `notes`, `current_status`. Calibration
  fields are read-only here — they edit through the §5.12.8
  maintenance flow.
- Per-row actions: **Print QR sticker** (PDF download —
  pre-formatted to a Brother label printer), **View
  history** (the equipment_events audit log), **Retire**
  (sets `retired_at`; soft-archives in templates per the
  §5.12.3 cleanup queue).
- Top-of-page action: **Add unit** (modal that wraps the
  POST `/api/admin/jobs/equipment` `inventory_item` mode
  already shipped in the existing route, plus the new
  §5.12.1 columns).
- Top-of-page action: **Bulk QR sticker print** (selected
  rows → multi-page PDF).

##### 5.12.7.4 Maintenance (calibration calendar)

Twin views:
- **Calendar grid** — month view colored by service events.
  Each cell shows "S9 #1 cal due", "Truck 2 oil change due"
  (vehicles cross-link in here for one-stop fleet upkeep).
  Click a cell → drilldown.
- **Upcoming list** — prioritised by days-until-due ascending.
  Default range: next 60 days. Each row has a one-click
  **Schedule** button that opens a modal for the
  §5.12.8 service event creation flow.

Cross-links:
- Receipts (Batch QQ): a calibration invoice receipt
  attached to a maintenance event auto-decrements the
  equipment's depreciation reserve; the Equipment Manager
  doesn't have to re-enter the cost. (Detail in §5.12.10
  tax tie-in.)
- Reservations: when an instrument has an upcoming
  maintenance window, the §5.12.7.2 timeline shades that
  range red so dispatchers can't accidentally reserve
  through it. The §5.12.5 status check already enforces
  the hard-block; this is the visual reinforcement.

##### 5.12.7.5 Consumables (low-stock + restock)

A flat list of every `equipment_inventory` row with
`item_kind='consumable'`:
- Sorted by *days-of-stock-remaining* ascending — the lowest
  rolls float to the top. Estimated from the trailing
  30-day consumption rate (consumed_quantity totals from
  §5.12.6 returns).
- Per-row badges: **OK** (≥ 14 days estimated stock),
  **Reorder soon** (7–14), **Reorder NOW** (< 7 OR below
  `low_stock_threshold` regardless of rate).
- Inline actions: **Restock arrived** (modal — quantity +
  cost + receipt photo upload, the latter wires straight
  into the receipts pipeline so the bookkeeper sees it
  too), **Update threshold**, **Mark discontinued**.
- Top of page: monthly burn-rate chart per consumable
  category (paint, lath, hubs, ribbon, marker_flags) —
  helps the Equipment Manager spot a rate change before
  it bites a job.

##### 5.12.7.6 Crew calendar (week heatmap)

The capacity-calendar view referenced in §5.12.4. Week-grid:
rows = internal users, columns = days. Each cell coloured by
state:
- White = open (no `job_team` row)
- Light green = `proposed` assignment
- Solid green = `confirmed` assignment
- Yellow = partial day (split-shift)
- Grey = `personnel_unavailability` (PTO / sick / training)
- Red = unconfirmed assignment past notification grace
  (default 24h — auto-fires a re-prompt to the surveyor)

Click any cell → drilldown shows the assignment / unavailability
detail + actions. Drag-create a new unavailability row or
shift an assignment between adjacent days.

The same view is the dispatcher's primary planning tool too —
exposed in the existing /admin/jobs flow via a "View crew
availability" link.

##### 5.12.7.7 Fleet valuation

Read-only page that rolls every non-retired
`equipment_inventory` row's `acquired_cost_cents`,
`acquired_at`, `useful_life_months` into a three-column
summary:
- **Cost basis** — sum of acquisition costs.
- **Accumulated depreciation** — straight-line per
  useful_life_months (refined per §5.12.10 tax tie-in;
  Section 179 immediate-expense overrides still flow through
  the receipt category logic).
- **Book value remaining** — basis minus accumulated dep.

Group-by toggles: category, home_location, vehicle, year
acquired. Export-to-CSV button feeds the Batch QQ tax-summary
endpoint a "depreciation by category" line that lands on
Schedule C Line 13. Closes the loop the §5.11.4 receipt
categories opened — `equipment` receipts now have a downstream
ledger.

Insurance valuation export (PDF) is a v2 polish item —
template documents the insurer wants in their format.

##### 5.12.7.8 Templates referencing retired gear

The cleanup queue called out in §5.12.3 — surfaced as a
small badge on the sidebar item when non-zero. Page itself is
a list of templates pinned to a `retired_at IS NOT NULL`
instrument with one-click "Swap to category-of-kind" or
"Swap to alternate unit" actions. Empty state when
everything's clean ("All templates point to active gear ✓").

**What §5.12.7 does NOT cover:**
- The maintenance event create / edit flow itself (§5.12.8).
- The mobile surveyor "what's in my truck right now" view
  (§5.12.9).
- The depreciation algorithm + tax line plumbing (§5.12.10).
- The lost-equipment insurance packet generator (§5.12.11).
#### 5.12.8 Maintenance + calibration

The §4.6 Equipment Manager's other major hat: **keep every
piece of expensive metal calibrated, serviced, and trustworthy.**
Total stations need annual NIST calibration. GNSS receivers
need firmware updates. Tripods need tightening. Trucks (already
tracked via §6.3 `vehicles`) need oil changes. A surveyor whose
S9 is 6 months past calibration is producing legally
questionable measurements — the Equipment Manager has to keep
that from happening.

**Two-axis classification.** Service events split along two
dimensions; the schema captures both:

| Axis | Values | Notes |
|---|---|---|
| `kind` | `calibration`, `repair`, `firmware_update`, `inspection`, `cleaning`, `scheduled_service`, `damage_triage`, `recall`, `software_license` | What kind of work is being done. |
| `origin` | `recurring_schedule`, `damaged_return`, `manual`, `vendor_recall`, `cert_expiring`, `lost_returned` | Why the event was created. Recurring + cert-expiring are auto-scheduled by the cron; damaged_return + lost_returned auto-create on the §5.12.6 check-in flow; the rest are Equipment Manager-initiated. |

**Schema sketch — `maintenance_events`** (one row per service
occurrence, current or historical):
- `id UUID PK`
- `equipment_inventory_id UUID FK` (or `vehicle_id UUID FK
  vehicles(id)` — exactly one of these is non-null. The
  schema uses an `xor` CHECK so vehicles flow through the same
  pipeline without forcing them into the equipment table.)
- `kind`, `origin` (CHECKs above)
- `state TEXT CHECK (state IN ('scheduled', 'in_progress',
  'awaiting_parts', 'awaiting_vendor', 'complete',
  'cancelled', 'failed_qa'))`
- `scheduled_for TIMESTAMPTZ NULL` (when the work is planned —
  drives the §5.12.7.4 calendar)
- `started_at TIMESTAMPTZ NULL`, `completed_at TIMESTAMPTZ NULL`
- `expected_back_at TIMESTAMPTZ NULL` (when the gear should be
  available again; drives the §5.12.5 reservation hard-block
  and the §5.12.7.2 timeline shading)
- `vendor_name TEXT NULL`, `vendor_contact TEXT NULL`,
  `vendor_work_order TEXT NULL`
- `performed_by_user_id UUID FK NULL` (in-shop work — Equipment
  Manager or designee. Mutually exclusive with vendor fields
  when `kind='calibration'` because a NIST cert requires a
  third-party.)
- `cost_cents BIGINT NULL` (parts + labour total when known)
- `linked_receipt_id UUID FK receipts(id) NULL` (when the
  Equipment Manager attaches a calibration / parts invoice)
- `summary TEXT NOT NULL` (one-line — "Annual NIST cal sent
  to Trimble Service Houston")
- `notes TEXT` (long-form — what was wrong, what was done)
- `qa_passed BOOLEAN NULL` (post-cal accuracy check; false
  routes the event to `failed_qa`)
- `next_due_at TIMESTAMPTZ NULL` (auto-computed when the event
  completes — see "Recurring schedules" below)
- `created_at`, `created_by`, `updated_at`

**Schema sketch — `maintenance_event_documents`** (PDF
attachments — calibration certs, work orders, parts receipts):
- `id UUID PK`
- `event_id UUID FK ON DELETE CASCADE`
- `kind TEXT CHECK (kind IN ('calibration_cert',
  'work_order', 'parts_invoice', 'before_photo',
  'after_photo', 'qa_report', 'other'))`
- `storage_url TEXT` (re-uses the §5.6 files-bucket pattern
  with per-equipment-folder RLS)
- `uploaded_by`, `uploaded_at`, `description TEXT`

**Schema sketch — `maintenance_schedules`** (recurring rules
attached to a specific equipment row OR to a category):
- `id UUID PK`
- `equipment_inventory_id UUID NULL` (specific unit) OR
  `category TEXT NULL` (every unit of the category — e.g. all
  total stations get annual cal)
- `kind` (FK to the `kind` enum above)
- `frequency_months INT` (12 = annual; 6 = semi-annual; etc.)
- `lead_time_days INT DEFAULT 30` (how far ahead the
  Equipment Manager sees the alert)
- `is_hard_block BOOLEAN DEFAULT true` (true → §5.12.5 hard-
  blocks reservations past the due date; false → soft-warn
  only)
- `auto_create_event BOOLEAN DEFAULT true` (whether the cron
  pre-creates a `state='scheduled'` event when due)
- `notes TEXT`

The Equipment Manager seeds these once per category at
onboarding; the cron handles the rest.

**Recurring schedule cron** (worker job, runs daily at 3am):
1. For every active schedule, compute the most recent
   completed event for the matched equipment (by category or
   specific id).
2. Add `frequency_months` to its `completed_at` → the
   `next_due_at`.
3. If `next_due_at - lead_time_days <= now()` and there's no
   open event for that schedule:
   - If `auto_create_event=true` → INSERT a
     `state='scheduled'` event with `origin='recurring_schedule'`
     and a sensible `scheduled_for` placeholder.
   - Either way, push a notification (§5.10.4) to the
     Equipment Manager: *"Total Station S9 #1 — annual NIST
     cal due in 30 days."*
4. The §5.12.7.1 Today blue banner picks up any schedule
   whose due date is today or this week; the §5.12.7.4
   calendar pages plot the full lookahead.

**Cert-expiring auto-creation.** Distinct from recurring
schedules — driven by the `personnel_skills.expires_at` and
`equipment_inventory.next_calibration_due_at` columns. Cron
emits warnings at the 60-day, 30-day, and 7-day marks. The
§5.12.4 personnel side handles the surveyor cert path; this
sub-section handles the equipment side.

**Damage triage entry path** (called out in §5.12.6):
- A `returned_condition='damaged'` check-in triggers the
  flow that creates a `kind='damage_triage'`,
  `origin='damaged_return'`, `state='scheduled'` event with
  the photo + surveyor's note pre-attached.
- The `equipment_inventory.current_status` flips to
  `maintenance` and `expected_back_at` is left NULL until
  the Equipment Manager sets it during triage. While NULL,
  §5.12.5 treats the unit as indefinitely unavailable.
- Equipment Manager opens the event, decides:
  - **Repair in-shop** — sets `state='in_progress'`,
    `performed_by_user_id`, an `expected_back_at` estimate.
  - **Send to vendor** — sets `state='awaiting_vendor'`,
    fills vendor fields. `expected_back_at` per the vendor's
    quoted turnaround.
  - **Retire** — closes the event with
    `state='cancelled'`, sets `equipment_inventory.retired_at`.
    Triggers the §5.12.3 cleanup queue badge.

**Out-for-service workflow.**
- While `state IN ('in_progress', 'awaiting_parts',
  'awaiting_vendor')`, the equipment row stays
  `current_status='maintenance'`. Reservations cannot be
  created against it (§5.12.5 status check).
- Equipment Manager updates `expected_back_at` as the work
  progresses; each update emits a notification to anyone who
  had been WAITING on the unit (the §5.12.7.2 timeline knows
  who via overlapping `held` reservations that were forced
  onto alternates).
- Completing the event flips `current_status` back to
  `available` and opens the unit for new reservations.

**QA gate on calibration completion.** Calibration events have
a mandatory accuracy check before flipping `qa_passed=true`:
- Equipment Manager runs a known-baseline shot (or accepts
  the vendor's cert + serial-matched accuracy report).
- Result entered as a JSON `qa_results` field on the event.
- Failed QA → `state='failed_qa'`, notification to admin,
  unit stays in `maintenance`. Surfaces on the §5.12.7.4
  page as a red row.

**Vendor management.**
- v1: vendor info lives on each event row (free-text
  `vendor_name` / `vendor_contact`). Good enough for the
  ~5 vendors a small shop uses.
- v2 polish: dedicated `equipment_vendors` table with default
  turnaround times, contact history, ratings, integration
  with the receipts pipeline so vendor invoices auto-attach.
- The Equipment Manager dashboard (§5.12.7.4 maintenance
  calendar) groups upcoming events by vendor so a single
  trip to Trimble Service Houston can batch multiple
  instruments.

**Receipt cross-link** (the user's directive again — *"don't
double-count things"*):
- The §5.11 receipts pipeline already extracts vendor + total
  + category. When the Equipment Manager opens a maintenance
  event and clicks **Attach receipt**, a picker shows
  recently-approved receipts in category `equipment` /
  `professional_services` that aren't already linked.
- Alternatively, when reviewing a freshly-extracted receipt
  in the Money tab, the surveyor sees an *"Is this for
  equipment maintenance?"* prompt with a typeahead picker if
  the receipt vendor matches a known maintenance vendor.
- The link drops the receipt's `total_cents` onto the event's
  `cost_cents` field and prevents the bookkeeper from
  expensing the same dollar twice — Schedule C Line 22
  (Supplies) for the receipt OR Line 13 (Depreciation) for
  the equipment, never both. §5.12.10 owns the full ledger
  reconciliation.

**Maintenance history page** on each inventory unit:
- Sortable table of every event ever attached to the unit.
- Cumulative cost (running total of all linked
  `cost_cents`).
- Mean time between failures (auto-computed from the
  damage_triage event sequence).
- Cert PDFs inline-viewable (the §5.6 files-bucket signed
  URL pattern).
- Drives the "is this unit reliable?" decision when an
  Equipment Manager is debating retirement vs another repair.

**API sketch** (provisional names):
- `POST /api/admin/equipment/maintenance-events` — create.
- `PATCH /api/admin/equipment/maintenance-events/[id]` —
  update state / fields.
- `POST /api/admin/equipment/maintenance-events/[id]/documents`
  — multipart attachment upload.
- `POST /api/admin/equipment/maintenance-events/[id]/link-receipt`
  — body `{ receipt_id }`.
- `POST /api/admin/equipment/maintenance-events/[id]/qa` —
  body `{ qa_passed, qa_results }`.
- `GET /api/admin/equipment/[id]/history` — full event log
  for a unit.

**Notification routing.** Every state transition pushes
through the §5.10.4 stack:
- `equipment_manager` → all events.
- `admin` → `failed_qa`, `cancelled` (when retiring an asset),
  cost-cents over a configurable threshold.
- Surveyors who had reservations forced onto alternates →
  `expected_back_at` updates so they know when their preferred
  unit is back.
- The §5.12.7.1 Today page red banner picks up any
  `state='failed_qa'` row.

**What §5.12.8 explicitly does NOT cover:**
- The depreciation accounting that links cost_cents to
  Schedule C Line 13 / Section 179 (§5.12.10).
- The mobile-side lost-on-site insurance packet (§5.12.11).
- The vehicle-service overlap detail (cross-linked into
  §5.12.7.4 today; the dedicated vehicle service log is
  owned by the existing `/admin/vehicles` flow with one
  ALTER to add `vehicle_id` support to the
  `maintenance_events` schema above).
#### 5.12.9 Mobile UX (surveyor + Equipment Manager)

The admin-web side from §5.12.7 is the Equipment Manager's
desk. This sub-section is the **phone**: where the surveyor
actually picks up gear at 6:30am, returns it at 6pm, and
reports a busted prism in between. The user's directive was
explicit on the daily ritual being phone-driven (*"Crews would
have to rely on the equipment manager to get them what they
need for the job, and they would have to always turn in their
stuff back to the equipment manager too at the end of the
day."*) — this is that.

**Two phone audiences, one app, one mental model.** Surveyor
flows live in the existing 5-tab Starr Field layout (Jobs ·
Capture · Time · Money · Me). Equipment Manager flows live in
the same app under a **role-gated 6th tab** (🛠 Gear) that
only renders when the user's roles array includes
`equipment_manager`. Same mobile binary, no second download.

**Scaffolding.** New mobile module `mobile/lib/equipment.ts`
mirrors the `receipts.ts` / `fieldMedia.ts` shape:
- `useMyCheckouts()` — PowerSync hook returning the
  surveyor's open `equipment_reservations` (`state='checked_out'`,
  `checked_out_to_user = me`)
- `useMyAssignments()` — PowerSync hook returning the
  surveyor's `job_team` rows in `'proposed'` / `'confirmed'`
  state
- `useEquipmentByQr(qrCodeId)` — resolves a scanned QR to
  the inventory row (cached locally)
- `useCheckOut`, `useCheckIn`, `useReportDamage`,
  `useReportLost`, `useExtendCheckout`, `useConfirmAssignment`,
  `useDeclineAssignment` — mutation hooks that enqueue via
  `lib/uploadQueue.ts` so every action is offline-safe

##### 5.12.9.1 Surveyor-side flows

**Pre-job loadout preview.** When a surveyor opens an
upcoming or in-progress job (Jobs tab → job detail), the
existing job screen gets a new **Loadout** card right under
the job header:
- Equipment list (kits + items) with a status pill per row
  (✓ ready · ⏳ awaiting check-out · ⚠ in maintenance ·
  ✗ unavailable)
- Personnel slots (who else is on the crew + their slot_role)
- Vehicle assignment
- Below the fold: **"Confirm assignment"** (surveyor's
  own §5.12.4 push response) and **"Open Equipment Manager
  chat"** (deep-link into Batch B notifications targeted to
  `equipment_manager` role recipients) buttons
- Empty / non-applicable jobs (e.g. "Office") simply hide
  the card

This is the morning pre-flight check — by the time the
surveyor walks to the gear cage, they know what they're
expecting to receive and can spot mistakes BEFORE Equipment
Manager hands the wrong kit over.

**"What's in my truck right now" — Me tab section.** A new
section on the Me tab between *Storage* and *Privacy*:
- Card list of every active checkout for the current user
- Each card: thumbnail of the inventory photo (when present),
  label + serial, due-back time, condition pill, vehicle pill
- Tap → drilldown shows the original loadout + check-out
  photo + the one-tap **Return** button
- Long-press → quick actions: Mark damaged · Mark lost ·
  Extend until tomorrow 8am · Open in vehicle map
- Empty state: *"No gear checked out. Tap a job's Loadout
  card to start a check-out scan."* (deep-links into Jobs
  tab)

This solves the "I forgot what I took" problem 30 minutes
into a job. Always offline-readable via PowerSync local
cache.

**QR check-out / check-in scanner.** A full-screen camera
overlay reachable from three places:
- Loadout card → "Scan to check out"
- Me tab "What's in my truck" → per-card "Return" button
- Persistent FAB on the Me tab when ANY check-out is open
  (so check-in is always one tap away regardless of
  navigation state)

Implementation reuses `expo-camera` (already a dependency
for receipts in §5.11). The scanner overlay:
- Renders a centred reticle that pulses when a QR is
  detected
- Confirms with haptic + a top-of-screen toast: *"S9 Total
  Station #3 — checking out"*
- Drops to a confirmation sheet: condition selector
  (good / fair / damaged), optional photo (defaults to a
  fresh shot for damaged), notes textbox
- Submit → enqueues via `lib/uploadQueue.ts`, optimistic
  PowerSync flip per §5.12.6
- On collision (server returned a different state), surfaces
  a non-blocking toast and rolls back the optimistic flip

**Kit batch scanner.** Scanning a kit-parent QR triggers the
§5.12.6 atomic batch flow. The confirmation sheet shows every
child item with per-row condition selectors that default to
the kit-level pick — surveyor can flag exceptions inline
("Tripod leg loose, but everything else is fine").

**Damage report flow.** Triggered from the per-card long-
press menu OR from a check-in's `condition='damaged'` path:
- Required: photo of the damage + free-text description
- Optional: location (auto-pre-filled from current GPS) +
  voice memo (re-uses §5.5 voice infrastructure for
  hands-free reporting)
- Submit → flips the inventory unit's `current_status` to
  `maintenance`, creates a §5.12.8 `damage_triage` event,
  notifies the Equipment Manager
- Surveyor sees a "Reported · waiting for triage" badge on
  the original card until the Equipment Manager acts

**Lost-on-site flow.** Triggered from the per-card long-press
menu when the gear is genuinely missing:
- Required: a "last seen" location (defaults to the most
  recent location_pings cluster from the open job; surveyor
  can drag the pin)
- Required: a brief description of the circumstances
- Optional: photos of the area
- Submit → creates a §5.12.8 `lost_returned` event, flips
  status to `lost`, fires a notification to admin +
  Equipment Manager + crew lead with a deep-link to the map
- The surveyor's open job's notes get an auto-appended
  "Equipment lost on site" note so end-of-day reconcile
  picks it up

**Consumables ritual on the phone.** When a surveyor checks
in a kit at end-of-day, any consumable line item gets a
quantity selector:
- Default: full reserved quantity (assumes "we used what we
  brought")
- Surveyor adjusts down ("brought 4 rolls, used 2, two go
  back")
- Submit decrements `quantity_on_hand` server-side per the
  §5.12.6 trigger logic

Surveyors don't track partial-roll consumption — that's a
design choice from §5.12.6. They count whole units.

**Notifications stack.** Re-uses Batch B notification
infrastructure (§5.10.4) plus three new `source_type` values:
- `equipment_assignment` — fired when an assignment lands in
  `'proposed'`. Tap → Loadout card with [Confirm] / [Decline]
- `equipment_overdue` — the §5.12.6 6pm + 9pm nag. Tap →
  scanner pre-loaded for return
- `equipment_status_change` — when a unit you had a
  reservation on is no longer available (someone else got
  it via override, or it broke). Tap → updated Loadout card
  with the substitution

Push payloads always include `equipment_id` + `reservation_id`
so deep-links resolve even when the app cold-boots from a
notification.

**Confirmation card UI** (§5.12.4 push response):
- Renders inline in the Notifications inbox + as a sticky
  card on the Jobs tab while pending
- Two buttons: **Confirm** (one-tap) · **Decline** (opens a
  reason picker — sick / scheduled off / scheduling conflict
  / other-with-text)
- Decline immediately re-fires a re-staff notification to the
  dispatcher with the reason

**Self-service after-hours.** Surveyors with
`equipment_self_checkout=true` (§5.12.6) see the regular QR
scanner; surveyors without the flag instead see a soft
warning: *"Equipment Manager isn't around — text Henry to
authorise this check-out, or wait until 7am."* — with a
shortcut to the equipment_manager chat.

##### 5.12.9.2 Equipment Manager-side flows (the 🛠 Gear tab)

A trimmed, action-first home screen mirroring §5.12.7.1
Today but optimised for one-handed phone use at the gear
cage:
- **Top: scanner FAB** — always visible, opens the QR camera.
  Smart routing: if the scanned unit has a held reservation
  for today, default to check-out; if it has a checked-out
  reservation, default to check-in. Equipment Manager can
  override with a 2-button toggle on the confirmation sheet.
- **Strip 1 (Going out)** — tappable list of today's held
  reservations. Each row has a "Pre-staged ✓" indicator the
  Equipment Manager can flip with one tap (mirrors the
  §5.12.7.1 web button).
- **Strip 2 (Out right now)** — sorted by `reserved_to`
  ascending. Inline action: send a poke notification to the
  surveyor ("Just checking — still on schedule?"). Cheap way
  to nudge before the formal 6pm cron fires.
- **Strip 3 (Returns waiting)** — anything coming back this
  hour or already overdue.
- **Notifications inbox** — same as the surveyor tab,
  filtered to gear-related events.

**Walk-up service flow.** When a surveyor walks up with gear
to return, Equipment Manager:
1. Pulls phone out, scanner FAB.
2. Scans the kit / item.
3. Confirmation sheet appears with the surveyor + job
   already filled. Equipment Manager confirms condition,
   adds note if needed, taps Submit.
4. Repeats for additional items, or scans a kit parent for
   batch.

End-to-end target: **&lt; 5 seconds per item** (the user's
implicit ergonomic bar — anything slower and the system
gets bypassed).

**Pre-stage workflow.** Evening prep ritual:
1. Equipment Manager opens 🛠 Gear → Strip 1 (Going out
   tomorrow).
2. Walks to the cage, scans each item or kit to flip its
   Pre-staged flag.
3. Bins / labels by job number per the existing shop layout.
4. Morning the surveyor walks up, Equipment Manager just
   hands over the pre-staged bin (no re-scan needed —
   the morning scan flips state to `checked_out` in one
   step).

**Maintenance + low-stock alert handling.** Push
notifications from the §5.12.8 cron + §5.12.7.5 low-stock
detector route to the Equipment Manager mobile inbox with
deep-links to the relevant create-event / restock screens.

##### 5.12.9.3 Cross-cutting mobile patterns

**Offline-first.** Every flow above (check-out, check-in,
damage report, lost report, confirmation, decline, restock)
goes through `lib/uploadQueue.ts`. Optimistic local writes
land instantly; server collisions surface non-blocking
toasts; the §5.10.4 stuck-uploads triage page (Batch D) is
the existing safety net.

**PowerSync sync rules.** Three new sync rules:
- `equipment_inventory` — global read-only for all internal
  users (the catalogue is shop-wide; pricing visibility
  scoped to admin/equipment_manager)
- `equipment_reservations` — scoped by
  `(checked_out_to_user = me OR job_id IN [my open jobs])`
  so a surveyor sees their own + their crew's
- `maintenance_events` — scoped to admin / equipment_manager
  only. Surveyors see status-only summaries (the
  current_status pill is enough for their workflow)

**Sun-readability.** Every new screen reads
`useResolvedScheme()` per Batch PP — the cage is often
outdoors and the surveyor is always outdoors.

**Offline scanner caching.** The mobile app pre-fetches the
QR-code-id → equipment-id mapping for the user's open
reservations + the full catalogue so QR scans resolve
instantly even with no signal at the gear cage's metal-
shed dead zone.

**Battery-aware capture.** Damage / lost photos honour the
existing §5.10.3 battery-aware tier — degrade JPEG quality
under 20% battery to keep the 30-second damage report
guaranteed.

##### 5.12.9.4 Surveyor self-service inventory edits

Limited write surface for surveyors who aren't equipment_managers
but need to record reality:
- **"Borrowed from another crew"** — surveyor scans an item
  not on their reservation list. Modal: *"This isn't yours
  — borrowing from [Henry / Job #422]?"* Confirmation creates
  a `borrowed_during_field_work` event log entry and routes
  a notification to both crew leads + Equipment Manager.
  Inventory reservation isn't auto-rewritten — Equipment
  Manager reconciles manually using the audit trail.
- **"Personal kit"** flag on the surveyor's user row marks
  certain items (their own field tools brought from home —
  hammers, machetes, gloves) so they're tracked but not
  managed. Schema-wise these live in `equipment_inventory`
  with `is_personal=true` + `owner_user_id`; they don't
  appear in the Equipment Manager dashboards.

##### 5.12.9.5 What §5.12.9 does NOT cover

- The depreciation accounting that ties `cost_cents` from
  damage triage events to the tax ledger (§5.12.10).
- The lost-equipment insurance packet generator
  (§5.12.11).
- The dispatch-side template apply UI — that's web-admin
  per §5.12.3, not mobile (dispatchers don't plan jobs from
  their phones; they use the desk).
#### 5.12.10 Tax + depreciation tie-in (closes the Batch QQ loop)

Recap the two coupled directives the user gave during the
Batch QQ build:
1. *"Make it so we can use the data to keep really great
   track of everything and make dealing with taxes super
   easy!"*
2. *"if data has already been managed or used for it's
   intended purpose … they are handled and marked well so
   that there is no confusion. We don't want things getting
   counted twice, or not counted at all in the total."*

§5.11 / Batch QQ delivered the receipts side of those
directives — every approved/exported receipt rolls into the
Schedule-C-shaped tax summary. But equipment acquisitions are
NOT a single-line expense — they're a **multi-year capital
asset** whose cost is recovered over time via depreciation
(or in one year via §179 election). Without a closed loop
between the receipts pipeline and the equipment ledger, a
$3,000 total station lands twice on Schedule C: once as
"Supplies / Equipment" the year it was bought, then again as
depreciation in subsequent years. **Or — equally bad — it
lands zero times** because the bookkeeper saw the receipt was
"big" and excluded it without anything else picking it up.

This sub-section is the rule set that prevents either
mistake.

**The two acquisition paths.**

| Path | Trigger | Schema effect |
|---|---|---|
| **Receipt-driven** | Bookkeeper approves a receipt with `category='equipment'` AND `total_cents >= EQUIPMENT_RECEIPT_THRESHOLD_CENTS` (default $250000 = $2,500, configurable) | A modal pops on receipt approval: *"This looks like a capital asset. Create inventory row?"* Confirm → INSERT into `equipment_inventory` with `acquired_cost_cents` = `receipt.total_cents`, `acquired_at` = `receipt.transaction_at`, `linked_acquisition_receipt_id` = `receipt.id`. Status defaults `available`; Equipment Manager fills calibration / serial / QR fields after physical receipt. |
| **Admin-entered** | Equipment Manager adds a unit via §5.12.7.3 inventory page when no receipt exists (gift, owner's contribution, transferred from old shop, etc.) | Standard INSERT; `linked_acquisition_receipt_id` stays NULL. Bookkeeper must manually classify on Schedule C. |

The threshold matters. Below $2,500 (the IRS de minimis safe
harbour), small purchases like a $40 hammer don't need
asset-tracking — they expense as Supplies in the year bought.
Above the threshold, the system pushes for a capital-asset
treatment. Threshold lives in `app_settings` so the bookkeeper
can tune it as IRS rules evolve.

**Anti-double-count guard rail.** Per the user's directive,
the Batch QQ tax summary endpoint must skip receipts that
have been promoted to inventory rows:
- New column on `receipts`: `promoted_to_equipment_id UUID
  REFERENCES equipment_inventory(id) NULL`. Set when the
  acquisition modal confirms.
- Batch QQ tax summary's WHERE clause adds `AND
  promoted_to_equipment_id IS NULL` on the receipts side.
- Equipment depreciation lands on a SEPARATE Schedule C row
  (Line 13) computed from the equipment ledger.
- Both feeds total to a single bottom-line. Receipt totals +
  depreciation totals = no overlap.

**Schema additions on `equipment_inventory`** (extend the
§5.12.1 baseline):
- `linked_acquisition_receipt_id UUID NULL` (FK above)
- `depreciation_method TEXT CHECK (depreciation_method IN
  ('section_179', 'straight_line', 'macrs_5yr', 'macrs_7yr',
  'bonus_first_year', 'none')) DEFAULT 'straight_line'`
- `placed_in_service_at DATE` (the day the asset was actually
  put to work; can differ from `acquired_at` for items
  bought-and-stored)
- `disposed_at DATE NULL`, `disposal_proceeds_cents BIGINT
  NULL`, `disposal_kind TEXT CHECK (disposal_kind IN
  ('sold', 'traded', 'scrapped', 'lost', 'stolen', 'donated'))
  NULL` — closes the books when the unit retires
- `tax_year_locked_through INT NULL` — the latest tax year
  that's been "locked" via the §5.12.10 annual close ritual
  (mirrors Batch QQ's `exported_period`)

**Depreciation algorithm** (worker function — runs on
demand for the Batch QQ tax summary endpoint):

```
For each equipment row where retired_at IS NULL OR
retired_at >= start_of_tax_year:

  if depreciation_method = 'section_179' AND placed_in_service_at
     within tax year:
     this_year_depreciation = acquired_cost_cents
     # Whole basis recovered in year-1; subsequent years = 0
  elif depreciation_method = 'straight_line':
     months_elapsed = months_overlap(window, placed_in_service..disposed_or_now)
     this_year_depreciation = acquired_cost_cents *
                               (months_elapsed / useful_life_months)
  elif depreciation_method in ('macrs_5yr', 'macrs_7yr'):
     # IRS table-driven; ship a constants table mirroring Pub 946
     this_year_depreciation = acquired_cost_cents *
                               MACRS_TABLE[method][year_index]
  else:
     this_year_depreciation = 0

  # Cap at remaining basis so we never depreciate below zero
  this_year_depreciation = min(this_year_depreciation,
                                remaining_basis(row))

  # Apply mid-year convention for assets bought / sold mid-year
  apply_half_year_or_mid_quarter_convention(...)
```

**Section 179 election workflow.** §179 is a one-time choice
per asset, made the year placed in service. The Equipment
Manager (or admin) flags the choice when promoting a receipt:
- Acquisition modal has a *"Tax treatment"* picker
  defaulting to `straight_line` for most items
- Total stations / GPS rovers / similarly-pricey instruments
  prompt with `section_179` as the suggested default with a
  hover-text explainer
- Vehicles get auto-suggested `macrs_5yr` (light truck rule)
- Section 179 election is recorded in `equipment_inventory`
  AND copied into a freeze record on
  `equipment_tax_elections` (immutable per-year per-asset)
  so the choice survives later edits

**Schema sketch — `equipment_tax_elections`** (immutable
per-year-per-asset record):
- `id UUID PK`
- `equipment_inventory_id UUID FK`
- `tax_year INT NOT NULL`
- `method TEXT NOT NULL` (snapshot of the
  depreciation_method at the time)
- `cost_basis_cents BIGINT NOT NULL` (snapshot)
- `useful_life_months INT NOT NULL` (snapshot)
- `recorded_depreciation_cents BIGINT NOT NULL` (the actual
  amount filed on Schedule C this year)
- `placed_in_service_at DATE` (snapshot)
- `convention TEXT` (`half_year`, `mid_quarter`, `mid_month`)
- `locked_at TIMESTAMPTZ NULL` (set during annual close)
- `notes TEXT`

**Annual close ritual** (mirrors Batch QQ `mark-exported`):
1. Bookkeeper opens `/admin/finances` for the closing year
   and clicks **"Lock equipment depreciation"** (new button
   alongside the existing receipts Lock).
2. The endpoint:
   - Computes the depreciation for every active row using
     the algorithm above
   - Inserts a row into `equipment_tax_elections` for each
     row depreciated this year
   - Sets `equipment_inventory.tax_year_locked_through =
     YYYY` on every affected row
   - Returns the totals + per-asset breakdown for CSV export
3. The Batch QQ tax summary refuses to re-compute
   depreciation for a locked year — pulls the frozen
   `equipment_tax_elections` rows directly. Re-running the
   close after lock surfaces *"Year YYYY already locked on
   DDDD by EEEE"* with a hard-block, mirroring the receipts
   path.

**Service / repair / cal receipts (§5.12.8 cross-link).**
Distinct from acquisition:
- `kind='calibration'` / `'cleaning'` / `'inspection'` —
  Schedule C Line 21 (Repairs & Maintenance). Linked
  receipts get `promoted_to_equipment_id IS NULL`
  (unchanged) but get a new
  `receipts.linked_maintenance_event_id` so the bookkeeper
  sees them threaded under the equipment row.
- `kind='repair'` if material — depending on amount, may
  capitalise vs expense. Bookkeeper sees a hint
  ("$1,200 repair on a $4,000 asset — re-evaluate
  capitalisation?") but final call stays manual.
- `kind='firmware_update'` / `'software_license'` — Line 22
  (Supplies) for one-off; Line 8 (Advertising) is wrong but
  surfaces sometimes in vendor receipts; bookkeeper
  reclassifies. Schema doesn't try to be smart here.
- `kind='damage_triage'` cost — same as repair logic above.
- `kind='lost_returned'` cost — N/A (the asset itself goes
  through disposal flow below).

**Disposal accounting** (when an asset is retired):
- `disposal_kind='sold'` + `disposal_proceeds_cents` →
  potentially a gain (proceeds > book value) or loss; Form
  4797 territory. v1 surfaces the calculation but the
  bookkeeper / CPA does the form.
- `disposal_kind='traded'` — basis carries to replacement;
  simplistically out of scope for v1, manually handled.
- `disposal_kind='scrapped'` / `'donated'` — write off
  remaining basis to Line 27a (Other expenses).
- `disposal_kind='lost'` / `'stolen'` — Form 4684 casualty
  loss territory. v1 surfaces remaining basis + the §5.12.11
  insurance packet; CPA handles the form.

**Anti-double-count enforcement points** (the "no confusion"
half of the user directive):

| Risk | Guard |
|---|---|
| Receipt promoted to inventory ALSO showing as Schedule C Line 22 supplies | `receipts.promoted_to_equipment_id IS NOT NULL` filter on Batch QQ summary |
| Equipment depreciation pulled twice (re-computation after lock) | `equipment_inventory.tax_year_locked_through` + frozen `equipment_tax_elections` rows |
| Calibration receipt counted as both maintenance AND supplies | `receipts.linked_maintenance_event_id IS NOT NULL` filter routes the row to Line 21 only |
| Disposal gain/loss missed | `equipment_inventory.disposed_at IS NOT NULL` triggers a year-end review queue on the §5.12.7.7 fleet valuation page |
| Personal kit (`is_personal=true`) creeping onto company tax | Tax summary excludes `is_personal=true` rows entirely |

**Audit-friendly export.** The annual close generates a PDF
"Asset Detail Schedule" — one row per asset showing year,
method, cost basis, prior accumulated dep, this-year dep,
remaining basis. Standard CPA artifact, no re-keying.
Also pushes the same data as a CSV alongside the Batch QQ
tax summary so the CPA's spreadsheet workflows still work.

**API sketch** (provisional):
- `POST /api/admin/equipment/promote-receipt` — body
  `{ receipt_id, depreciation_method, useful_life_months,
  placed_in_service_at }`. Atomic: creates inventory row +
  sets `receipts.promoted_to_equipment_id`.
- `POST /api/admin/equipment/dispose` — body
  `{ equipment_id, disposed_at, disposal_kind,
  disposal_proceeds_cents }`.
- `POST /api/admin/finances/lock-equipment-year` — body
  `{ tax_year }`. Mirrors Batch QQ mark-exported semantics.
- Updated `GET /api/admin/finances/tax-summary` — gains
  `equipment` block alongside `receipts` and `mileage`,
  reading the locked elections (or computing live for the
  current year).

**What §5.12.10 explicitly does NOT cover:**
- The Form 4797 / Form 4562 / Form 4684 generation
  (CPA's domain — v1 just surfaces the source data).
- Bonus depreciation phase-out math beyond the IRS table
  (Pub 946 ships annually; we update the constant table on
  IRS publish, no schema change).
- Multi-state apportionment (Texas has no state income tax;
  out of scope for v1's TX-only deployment).
- The §5.12.11 insurance packet generation that consumes a
  `disposal_kind='lost'` event.
#### 5.12.11 Edge cases

The user asked me to think about *"anything that I have not
considered."* This sub-section is that audit — collecting
edge cases earlier sub-sections referenced + a handful of
scenarios the rest of §5.12 hasn't addressed yet. Each entry
states the trigger, the schema effect, and the UI ergonomics.

##### A. Borrowed equipment (in-flow)

A surveyor needs an extra prism for a Friday job; Starr borrows
one from another local firm for the day. We need to track
that gear in the field log without polluting the asset
ledger.

- New table `equipment_borrowed_in` — `id`, `name`,
  `category`, `borrowed_from_org TEXT`, `borrowed_from_contact`,
  `borrowed_at`, `expected_return_at`, `actually_returned_at`,
  `condition_in`, `condition_out`, `notes`, `created_by`.
- Borrowed items can be assigned to jobs via the §5.12.3
  template apply flow with an "Add borrowed item" affordance
  — the row gets a temporary reservation that auto-expires
  at `expected_return_at`.
- They do NOT appear in `equipment_inventory`, so they don't
  flow through depreciation, fleet valuation, or the §5.12.7.7
  page. They DO appear in the §5.12.7.1 Today landing page's
  Strip B with a distinct "borrowed" badge so the Equipment
  Manager doesn't lose track.
- Daily nag fires if `expected_return_at < today AND
  actually_returned_at IS NULL` — same notification stack as
  unreturned company gear.

##### B. Lent equipment (out-flow)

Reverse of (A): another firm needs a tripod for the weekend.
- Existing `equipment_inventory.current_status` gains
  `'loaned_out'` (already in §5.12.1 enum). Loan rows live
  in a new `equipment_loans_out` table — `equipment_id`,
  `loaned_to_org`, `loaned_to_contact`, `loaned_at`,
  `expected_return_at`, `actually_returned_at`,
  `condition_out`, `condition_in`, `cost_collected_cents`
  (if charged), `notes`, `approved_by` (admin-only).
- §5.12.5 hard-blocks reservations against loaned-out units
  for the loan window. Equipment Manager UI surfaces an
  "Approve loan" two-tap flow that requires admin sign-off
  (this is shop-policy territory — no junior dispatchers
  unilaterally lending the $40k receiver).
- The §5.12.10 tax tie-in: lent units stay on Schedule C
  depreciation as normal (it's still our asset).

##### C. Theft / catastrophic loss

Beyond the per-unit lost-on-site flow (§5.12.6) — what
happens when a truck is stolen with a full kit, or there's
a cage break-in?

- New admin action **"Bulk-mark stolen"** on the §5.12.7.3
  inventory page — multi-select units, fill one shared form
  (`stolen_at`, `last_known_location`, `police_report_number`,
  `incident_summary`), and the system flips every selected
  unit's status to `lost` with the same metadata.
- Insurance packet generator (the v2 polish item promised in
  §5.12.6 / §5.12.10) runs against the `disposal_kind='stolen'`
  rows and outputs a single PDF: cover sheet · per-asset
  detail page (photos · serial · acquisition cost · book
  value remaining · acquisition receipt PDF) · maintenance
  history snippet · police report number · last GPS pings
  cluster (when available). Attaches to a single
  `incident_packets` row for archive.
- Disaster mode: if the Equipment Manager flags an incident
  as `kind='catastrophic'`, the §5.12.5 reservation engine
  refuses ALL pending reservations for affected units
  (instead of the per-unit hard-block) and dispatches a
  notification to admin asking to re-staff downstream jobs.

##### D. Cross-office transfers (multi-location growth)

Starr is one office today. If/when a second opens, gear
needs to move:
- Schema: existing `equipment_inventory.home_location` from
  §5.12.1 already supports this — value is just a string
  today; expanded to a FK on a new `offices` table when the
  second location opens.
- New event log entry kind `transfer` with
  `from_location → to_location` + transit window.
- During transit (`status='in_transit'`, new enum value),
  reservations against the unit are hard-blocked. Arrival
  scan flips back to `available` and updates `home_location`.
- Cross-office templates: a template can declare
  `valid_at_locations TEXT[]` so a dispatcher at office A
  doesn't accidentally apply a template that pins
  office-B-only units.

##### E. Consumable reorder workflow

Touched in §5.12.7.5 but worth a dedicated edge-case treatment
since the math + workflow span multiple modules:
- New table `equipment_reorder_requests` — `equipment_id`
  (consumable SKU), `requested_quantity`, `requested_by`,
  `requested_at`, `vendor_preferred`, `state` (`requested`,
  `approved`, `ordered`, `received`, `cancelled`),
  `expected_arrival_at`, `actual_arrival_at`,
  `linked_receipt_id`, `notes`.
- Trigger paths:
  1. **Cron auto-suggest** — when `quantity_on_hand`
     crosses below `low_stock_threshold`, system pre-creates
     a `state='requested'` row with quantity = a default
     restock multiple (configurable per SKU).
  2. **Manual** — Equipment Manager creates one from
     §5.12.7.5 inline action.
- On `state='received'` + linked receipt:
  - `quantity_on_hand` increments by the actual received
    quantity (which may differ from requested)
  - The receipt is auto-categorised as `category='supplies'`
    on the §5.11 receipt review screen, with a hint linking
    back to the reorder row
  - Bookkeeper confirms; Schedule C Line 22 (Supplies) gets
    the cost
- Approval gating: orders over a configurable threshold
  (default $500) require admin sign-off before
  `state` can advance to `'ordered'`.

##### F. Calibration-overdue override (the "we need it today" case)

§5.12.5 says a calibration-overdue unit hard-blocks past 30
days, soft-warns inside that window. The override path:
- Override picker on the apply / reserve screen with
  pre-canned reason categories: `customer_emergency` ·
  `vendor_delay` · `weather_window` · `crew_already_on_site`
  · `other_with_freetext`. Reason is mandatory.
- Override fires a notification (1) to admin (always),
  (2) to the surveyor about to receive the gear (so they
  know to flag any anomalous shots in the field notes), and
  (3) to the bookkeeper at end-of-month for tax-sensitivity
  review.
- Audit log retains a permanent record. The §5.12.7.4
  maintenance dashboard surfaces a "Recently overridden
  past-cal" rollup so accumulating override fatigue doesn't
  become a silent risk.
- Liability hint surfaced inline: *"This unit is X days
  past calibration. Survey accuracy may not meet
  professional standards. Document any anomalous results in
  the job's field notes."* — protects the firm without
  legalese.

##### G. Personal kit boundary

§5.12.9.4 introduced `is_personal=true` items the surveyor
owns. Edge cases that come up:
- **Surveyor leaves the firm** — admin action "Mark all
  personal items as exited" on the user offboarding flow.
  Personal-kit rows get `retired_at` set; they don't appear
  in any future view but stay in the audit log per the
  §5.12.1 7-year retention.
- **Personal item used on a contested job** — admin can
  flip an `is_personal` flag (with audit reason) for legal-
  hold purposes. Doesn't reattribute ownership, but ensures
  the item appears in compliance exports.
- **Personal item receipt** — when a surveyor submits a
  receipt for a hammer they bought for personal use, the
  Money tab gains a "This is for my personal kit, not the
  company" toggle that prevents the receipt from being
  expensed. v2 polish.

##### H. Onboarding bulk import (system-go-live)

When this module ships, the existing fleet (50+ items today)
needs to land in `equipment_inventory` without a per-row
manual entry:
- Admin-only `/admin/equipment/import` page — paste a CSV
  with name / category / serial / acquired_at /
  acquired_cost / etc. + bulk QR sticker generation
- Photo backfill is deferred — Equipment Manager fills in
  per-row photos as they handle each unit through normal
  workflow. A "needs photo" sidebar badge gives them a
  trickle of cleanup work post-import.
- The import flow generates `equipment_events` rows with
  `kind='imported'` so the audit log distinguishes
  pre-system gear from gear acquired through the system.

##### I. Software licences pinned to a unit

Modern instruments (Trimble Access, Carlson SurvCE) ship with
software activation keys tied to a specific receiver serial.
When the receiver is replaced, the licence transfers — and
when the receiver is retired, the licence loses value.
- New table `equipment_software_licenses` —
  `equipment_id`, `vendor`, `product`, `license_key_hash`
  (we don't store the raw key — admin retrieves from a
  vault on demand), `seats_total`, `seats_used`,
  `expires_at`, `transfer_history_jsonb`, `notes`.
- Transfer workflow: when admin retires unit A and assigns
  the licence to unit B, the system records the transfer
  + emits a notification to whoever's about to use unit B
  ("Software activation may take 24h after vendor approves
  transfer").

##### J. Crew-truck-overnight at remote job site

Some jobs run multiple days; the truck stays on-site
overnight with the kit locked inside. The §5.12.6 6pm
unreturned-gear nag would fire incorrectly.
- Job-detail flag `multi_day_overnight=true` (admin-set on
  the job before the crew leaves)
- When set, reservations on equipment for that job auto-
  extend `reserved_to` daily through the job's scheduled
  end + grace, and the nag is silenced
- Each morning the system pushes a soft *"Still on site?
  Tap to confirm"* notification — surveyor confirms with one
  tap, declining triggers the regular check-in flow

##### K. Discovery / FOIA / litigation hold

If a survey is contested in court, the firm may receive a
discovery request to produce records of the equipment used.
- Admin-only "Apply litigation hold" on a job → freezes the
  job's `equipment_reservations` rows + their linked
  `equipment_events` from automated archival/purge for
  the §5.12.1 7-year retention period (held items get
  retained until hold is released, not auto-purged at the
  retention deadline)
- Generated PDF: chain-of-custody report — every check-out /
  check-in / damage / cal event for every piece of gear
  used on the contested job, plus the operator history
  (who held the gear when)
- Out of scope: actual e-discovery export to opposing
  counsel's tool. v1 just produces the PDF + the underlying
  audit-log CSV.

##### L. Counterfeit / suspect serial numbers (rare but worth
defending)

When the Equipment Manager registers a high-end instrument,
the system checks the serial against a known-bad list (vendor-
published recall lists for cloned / stolen units when
available). v1: free-text vendor fields + manual flag
`serial_suspect=true`. v2 polish: API integration with the
Trimble fraud database when/if vendor publishes one. Mostly
relevant to second-hand acquisitions.

##### Closing note

These edge cases are NOT all v1. Phase F10 (planned in §9)
ships the §5.12.1-§5.12.7 backbone first — the daily ritual
loop. Edge cases land as polish batches in priority order:
F (override), C (theft / disaster), E (reorder), A/B
(borrow / lend), then the remainder as they're encountered
in real operation. This keeps Phase F10 tractable without
losing the "I considered everything" brief.

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

**Forward reference — Phase F10 schema (seeds/233-237).** The
schema below is the F0 baseline (`seeds/220`). Subsequent
phases land additional tables in their own seed files:
seeds/221-228 land F2-F6 schema (already documented inline
through their respective batch entries in §9.x); seeds/229-232
land F2 polish (Batch Z review queue · Batch CC retention ·
Batch GG video thumbnails · Batch QQ tax-period locking).
**Phase F10** introduces the equipment + crew assignment
ledger via seeds/233-237 — full schema sketches live in
§5.12.1 / §5.12.3 / §5.12.4 / §5.12.5 / §5.12.6 / §5.12.8 /
§5.12.10 / §5.12.11 rather than being re-stated here. The
F10 tables ALTER existing schemas (`equipment_inventory`,
`job_equipment`, `job_team`) plus add `equipment_kits` /
`_kit_items` / `_events` / `_templates` / `_template_items` /
`_template_versions` / `_reservations` / `_borrowed_in` /
`_loans_out` / `_software_licenses` / `_reorder_requests` /
`_tax_elections` / `personnel_skills` / `personnel_unavailability`
/ `maintenance_events` / `_event_documents` / `_schedules` /
`incident_packets`. See the §9 Phase F10 entry for the apply
order; activation gates list them in seeds/233-237 sequence.

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
- [x] Expo project scaffolded (TypeScript, ESLint, Prettier matching Next.js repo) — `mobile/package.json`, `tsconfig.json`, `babel.config.js`
- [x] Supabase Auth wired in (sign-in, biometric unlock) — `mobile/lib/auth.tsx` + `mobile/lib/biometric.ts` + `(auth)/sign-in.tsx`. Magic-link + Apple Sign-In both wired (`AppleSignInButton.tsx`, `parseAuthUrl.ts`, deep-link callback at `(auth)/auth-callback.tsx`).
- [x] Local SQLite + sync queue scaffolding (PowerSync — `mobile/lib/db/{schema,connector,index}.tsx`); 14 tables in `AppSchema` covering jobs, time tracking, receipts, field data, location pings, notifications, plus the local-only `pending_uploads` queue.
- [x] Tab bar shell, navigation, theme (`mobile/app/(tabs)/_layout.tsx` + `lib/theme.ts`); 5 tabs (Jobs / Capture FAB / Time / Money / Me) with nested stacks under Jobs / Time / Money / Me / Capture.
- [/] EAS Build configured (TestFlight + internal Android) — `mobile/eas.json` defines development / preview / production channels; submit credentials still placeholders (`REPLACE_WITH_*`); first TestFlight build pending operator action.
- [/] OTA updates working (Batch HH) — `mobile/lib/otaUpdates.ts` ships cold-start silent-update + manual-check-with-restart hooks, `<OtaUpdatesReconciler />` mounts at root, Me-tab "About" section shows app version + EAS channel + bundle ID + "Check for updates" / "Restart to apply" buttons. `app.json` now has the `updates` block (`enabled: true`, `checkAutomatically: 'ON_LOAD'`, `fallbackToCacheTimeout: 0`). **Operator step:** replace `"url": "REPLACE_WITH_EAS_UPDATE_URL"` with the real EAS Update URL after running `eas update:configure`. Until then, both hooks degrade safely — `Updates.isEnabled` is false in dev/unconfigured builds and the About row tells the user to install from the App Store / Play Store instead.
- [x] Crash reporting (Sentry) — `mobile/lib/sentry.ts` + `initSentry()` in root layout; passthrough when DSN missing so dev still works.

Audit additions:
- [x] Idle-lock state machine — `mobile/lib/lockState.ts` + `LockOverlay.tsx`. AsyncStorage-persisted idle threshold; computes elapsed background time on resume; biometric re-prompt via `lib/biometric.ts`.
- [x] App-router root index that bounces signed-out users to `(auth)/sign-in` — `app/index.tsx` + redirect in `(tabs)/_layout.tsx`.
- [x] Network reachability primitives — `mobile/lib/networkState.ts` (used by upload queue + future surfaces).

**Exit:** team installs app, signs in, sees empty home. **Status:** mobile-side scaffold complete. EAS submit credentials + OTA channel URL are operator-side hand-offs.

### Phase F1 — Jobs + basic time logging (Week 3–5)
- [x] Job list, create, edit, search/filter — `(tabs)/jobs/index.tsx` + `(tabs)/jobs/[id]/index.tsx`, backed by `lib/jobs.ts`
- [x] Job detail with placeholder tabs — `(tabs)/jobs/[id]/_layout.tsx`
- [x] Clock-in / clock-out from home — `(tabs)/time/index.tsx` driven by `lib/timeTracking.ts` `useClockIn`/`useClockOut`. Pick-job modal at `(tabs)/time/pick-job.tsx`.
- [ ] Lock-screen widget — not implemented. Requires native iOS WidgetKit + Android shortcut. Tracked separately from the in-app clock-in surface above.
- [x] Job auto-suggest by GPS proximity (one-shot, not continuous tracking) — `lib/jobs.ts` proximity sort + selection in `(tabs)/time/pick-job.tsx`
- [x] Manual time editing with audit trail — `lib/timeEdits.ts` + `time_edits` table, see `(tabs)/time/edit/[id].tsx` and `lib/TimeEditHistory.tsx`. Per-field row inserts (one row per field changed per edit), reason required when edits move a boundary by >15 min.
- [x] "Still working?" smart prompts — `lib/timePrompts.ts` (10 h + 14 h schedules) + `lib/notifications.ts` for the OS local-notification surface.
- [x] Timesheet view + CSV export — `(tabs)/time/index.tsx` + `lib/csvExport.ts`. Weekly + 14-day views.
- [x] Submit-for-approval workflow — `lib/timesheetActions.ts` `useSubmitWeek` flips `'open' → 'pending'` so the existing admin Hours-Approval queue surfaces mobile-submitted rows alongside web-direct ones. `DailyLogStatus` union in `lib/timesheet.ts` unifies the previously-divergent enums (web `'pending' / 'adjusted' / 'disputed'` ∪ mobile `'open' / 'submitted'`); legacy `'submitted'` preserved as alias. Status chip + lock banner copy handles every state.

Resilience additions landed in F2/F3 batches but belong to F1's surface (referenced in §5.8 hardening):
- [x] Stale clock-in detection (>16 h banner with "Fix the time" route to time-edit) — `(tabs)/time/index.tsx`
- [x] Last-known GPS fallback when live fix fails — `lib/location.ts` `getCurrentPositionWithFallback`
- [x] GPS failure-reason routing (no_permission / timeout / hardware) drives Settings deep-link via `lib/permissionGuard.ts`
- [x] Unsaved-changes guard for the time-edit screen — `lib/useUnsavedChangesGuard.ts`

Audit additions (not in original F1 list but shipped):
- [x] Mobile background-tracking lifecycle wired into clock-in/out — see Batch C (§9.x). Boundary `clock_in` / `clock_out` pings always written; background task only when `Always` permission granted.
- [/] Idempotency keys for clock-in / clock-out — `client_id` column exists on `job_time_entries` and is set to `entryId` at insert time; PowerSync's CRUD queue replays use this for dedup. Server-side UPSERT on `client_id` not yet enforced (post-F1 hardening per §10 risk).

**Exit:** Jacob runs an entire week of work using the app for time. **Status:** F1 mobile surface complete. Remaining: lock-screen widget (deferred — sub-feature, not blocking the exit), EAS build/OTA flip from F0.

### Phase F2 — Receipts + AI extraction (Week 6–8)
- [x] Receipt capture flow (camera, edge detection, deskew) — `lib/receipts.ts` `useCaptureReceipt` + `lib/storage/mediaUpload.ts` `pickAndCompress`. Edit step on (`allowsEditing: true`) for receipt deskew.
- [x] Claude Vision API integration for field extraction — `worker/src/services/receipt-extraction.ts` + `worker/src/cli/extract-receipts.ts` cron + on-demand POST `/starr-field/receipts/extract` in `worker/src/index.ts`. Per-row `extraction_status` (`queued | running | done | failed`) drives mobile UI.
- [x] Category, job association, payment method, tax flag — `(tabs)/money/[id].tsx` editor with `useUpdateReceipt` in `lib/receipts.ts`. `category_source` flips to `'user'` on user edit.
- [x] Receipt list view, edit, approve workflow — `(tabs)/money/index.tsx` + per-receipt `(tabs)/money/[id].tsx`. Status enum: `pending / approved / rejected / exported`.
- [x] Per-job and per-period rollups — `useJobReceiptRollup` in `lib/receipts.ts` + `ReceiptRollupCard.tsx`, surfaced on `(tabs)/jobs/[id]/index.tsx`.
- [x] Bookkeeper export (CSV, QuickBooks-ready) — `lib/csvExport.ts` (mobile) + web admin export at `/api/admin/receipts/export`.

Resilience additions:
- [x] Offline-first capture: row INSERT first, then `enqueueAndAttempt` via `lib/uploadQueue.ts`. Receipts visible in list immediately when offline; photo lands when reception returns.
- [x] Per-receipt local-fallback URL via `usePendingUploadLocalUri` so the gallery shows the snapshot without waiting for the signed URL.
- [x] Optional device-Photos backup (off by default — receipts have card numbers) via `lib/deviceLibrary.ts`.

Audit additions:
- [/] Soft-delete + IRS 7-year retention (Batch CC) — `seeds/230_starr_field_receipt_retention.sql` adds `deleted_at TIMESTAMPTZ` + `deletion_reason TEXT` (`'user_undo' | 'duplicate' | 'wrong_capture'`) to `receipts` plus partial indexes for visible-row reads + the retention sweep. Mobile `useDeleteReceipt` now soft-deletes (sets `deleted_at = now()`); list hooks (`useReceipts`, `useJobReceiptRollup`, `useReceiptsNeedingReview`) filter `deleted_at IS NULL`. Detail-screen hooks deliberately do NOT filter so a user can navigate to a tombstoned row to review the audit trail. Discarded duplicates from Batch Z's resolver path also tombstone with `deletion_reason='duplicate'`. **Pending:** worker retention sweep CLI that hard-deletes rows past the IRS retention window (3 years for clean returns, 7 years for substantial under-reporting; rejected/never-approved rows can purge after 90 days). Tracked as v2 polish.
- [ ] Bookkeeper sign-off audit on the web admin — currently mobile shows status flips but no per-receipt admin audit log entry for who approved when. Tracked separately.

**Exit:** Jacob can replace expense reports for v1 use. **Status:** shipped; bookkeeper validation outstanding; soft-delete polish remains.

### Phase F3 — Data points + photos (Week 9–12)
- [x] Create data point with name from 179-code library — `lib/dataPoints.ts` + `lib/dataPointCodes.ts`. Capture flow at `(tabs)/capture/index.tsx` and per-point detail at `(tabs)/jobs/[id]/points/[pointId].tsx`.
- [x] Camera capture, multi-photo — `lib/fieldMedia.ts` `useAttachPhoto`. Burst-grouping via `burst_group_id` ready in schema; UI for burst capture pending (F3 polish).
- [x] Phone GPS / altitude / compass heading metadata — captured in `useAttachPhoto` (and now `useAttachVideo` + `dataPoints.create`). Heading lands via `getCurrentHeadingOrNull()` in `lib/location.ts`, wrapping `expo-location.getHeadingAsync()` (no new native dep). Best-effort with a 1.5 s timeout so a slow magnetometer doesn't block capture; trueHeading preferred (geo-north) with magHeading fallback when declination hasn't been computed yet; calibration-needed readings (`accuracy < 1`) drop to null. Admin viewer renders a `↑ 273° W` badge with rotating arrow on the point meta cell + every photo / video card. (Batch V)
- [/] Photo annotation — `lib/PhotoAnnotator.tsx` (full-screen react-native-svg editor with PanResponder freehand strokes, 4-colour palette, undo + clear + save) + `lib/photoAnnotation.ts` data model (z-ordered `AnnotationDocument` with normalised 0..1 coordinates so strokes render identically on phone / tablet / web admin) + `useUpdateMediaAnnotations` hook. Originals NEVER touched per plan §5.4 — overlay rendered live from JSON in `field_media.annotations`. PhotoLightbox shows existing strokes + has "Annotate" / "Edit annotations" entry button. Web admin `/admin/field-data/[id]` lightbox renders the same SVG overlay using the shared `lib/photoAnnotationRenderer.ts` helpers. **Pen tool only in v1**; arrow / circle / text primitives have schema slots reserved for v2.
- [x] Job-level photo upload (no point assignment) — `attachPhoto({ dataPointId: null, jobId })` and the gallery at `(tabs)/capture/[pointId]/photos.tsx`.
- [x] Office reviewer sees points + photos in web app — `/admin/field-data` list with date range + employee + job + free-text filters; per-point detail at `/admin/field-data/[id]` with full photo gallery (lightbox, signed URLs for storage / thumbnail / original / annotated tiers), creator info, GPS metadata + Maps deep-link, offset / correction flags, and a link back to the parent `/admin/jobs/[id]`. APIs at `/api/admin/field-data` (list with thumbnails) + `/api/admin/field-data/[id]` (full detail). Sidebar entry under Work group.

Resilience additions (same offline-first pattern as F2):
- [x] INSERT field_media first → enqueue upload; `upload_state` flips `pending → done`/`failed` via `lib/uploadQueue.ts`
- [x] Optional device-Photos backup via `lib/deviceLibrary.ts` (opt-in toggle on Me tab)
- [x] Per-photo `usePendingUploadLocalUri` fallback for the gallery (same as receipts)

**Exit:** Found-monument workflow <60s. **Status:** core capture loop + admin viewer shipped; annotation overlay + compass heading remain.

### Phase F4 — Voice + video + notes (Week 13–16)
- [x] Voice memo capture + transcription — `lib/voiceRecorder.ts` (expo-av Audio.Recording with M4A mono preset, 5-minute auto-stop cap, idempotent permission cache, mid-flight cancel + cleanup), `lib/fieldMedia.ts` `useAttachVoice` (mirrors `useAttachPhoto` — INSERT first with `transcription_status='queued'`, enqueue upload to `starr-field-voice` bucket via `lib/uploadQueue.ts`, opt-in MediaLibrary backup via `lib/deviceLibrary.ts`), `(tabs)/capture/[pointId]/voice.tsx` capture screen with per-memo playback row (long-press to delete). **Server-side transcription via OpenAI Whisper** lands in Batch R: `seeds/228` adds `transcription_status` / `transcription_error` / `transcription_started_at` / `transcription_completed_at` / `transcription_cost_cents` to `field_media`; `worker/src/services/voice-transcription.ts` polls `WHERE upload_state='done' AND transcription_status='queued'`, race-safe `claimRow` flips to `'running'`, fetches the M4A via signed URL, calls Whisper-1 (en hint), writes back with cost in cents (~$0.006/min). Watchdog re-queues stale `'running'` rows after 5 min. CLI at `worker/src/cli/transcribe-voice.ts` for cron; `POST /starr-field/voice/transcribe` for on-demand. Admin `/admin/field-data/[id]` shows ⏳ queued / 🎧 transcribing / ✓ done / ⚠ failed badges + the transcript text once landed.
- [/] Video capture — `lib/storage/mediaUpload.ts` `pickVideo()` wraps `expo-image-picker.launchCameraAsync` with the Videos media type + 5-min cap (per plan §5.4), `lib/fieldMedia.ts` `useAttachVideo` mirrors the photo + voice pattern (INSERT field_media row with `media_type='video'`, enqueue upload to `starr-field-videos` bucket via `lib/uploadQueue.ts`, opt-in MediaLibrary backup which goes to Camera Roll). "📹 Record video" button on the photos screen footer. Admin `/admin/field-data/[id]` renders native `<video controls>` with mp4 + quicktime fallback `<source>` tags, duration in mm:ss, download link. **Mobile video review shipped (Batch U)**: Photos / Videos tab toggle on the per-point capture screen + a full-screen player at `(tabs)/capture/[pointId]/video-player.tsx` with native expo-av controls + delete + offline-first playback via `useFieldMediaVideoUrl` (falls back to local `documentDirectory` URI before the bytes sync). **Pending:** server-side thumbnail extraction (FFmpeg via worker) so the gallery thumbnail isn't a placeholder; WiFi-only original-quality re-upload tier per plan §5.4.
- [x] Free-text notes + structured templates (offset, monument, hazard, correction) — `lib/fieldNotes.ts` (`useAddFieldNote` / `usePointNotes` / `useJobLevelNotes` / `useArchiveFieldNote` + `summariseStructuredPayload` + `parseStructuredPayload` helpers), per-template typed payload interfaces, body-summary derivation so the existing `/admin/notes` grep + future search-across-notes work without parsing JSON. Add-note screen at `/(tabs)/jobs/[id]/notes/new` accepts `?point_id=&template=` query params; in-app pill picker switches between Free-text / Offset shot / Monument found / Hazard / Correction with per-template form (typed inputs, choice pills for enums, severity colour-coding). Point detail screen (`(tabs)/jobs/[id]/points/[pointId].tsx`) gets a Notes section with reactive list + long-press archive + "+ Add note" button. Admin `/admin/field-data/[id]` surfaces attached notes with template tag, body, structured payload as a key/value table, author + age stamp, archived badge — `/api/admin/field-data/[id]` returns the parsed structured payload alongside the note row. Job-level note hook (`useJobLevelNotes`) is ready for a future job-detail surface.
- [ ] Voice-to-text shortcut — bound to a hardware key for hands-free dictation. Need expo-speech-recognition or a Whisper-via-API path.
- [x] Search across notes + transcriptions (Batch BB) — `useSearchFieldNotes(query, limit)` hook in `mobile/lib/fieldNotes.ts` runs a parametrised LIKE scan across the local PowerSync SQLite, joining body + structured_data + note_template + parent point name + parent job name + job_number in one query. Mobile screen at `(tabs)/jobs/search.tsx` opens as a modal with auto-focused input + clear button + result cards (template badge · age stamp · highlighted match excerpt · job + point footer). Results stay reactive to PowerSync — new notes arriving via sync mid-typing appear in the list. Tap a result → navigates to the relevant point detail (or job detail for job-level notes). Decision: LIKE-only for v1 (works fully offline, no schema changes). Server-side `tsvector` index for cross-user admin search at scale is v2 polish.

**Exit:** Field documentation fully replaces paper notes. **Status:** voice memo + video capture + free-text/structured notes + admin viewers all shipped (Batches I + K + L). Voice transcription + voice-to-text shortcut + cross-notes search remain.

### Phase F5 — Files + CSV (Week 17–18)
- [x] File upload from device, cloud, web link — `seeds/226_starr_field_files.sql` lands the `job_files` table + `starr-field-files` storage bucket (100 MB cap, per-user-folder RLS). `lib/jobFiles.ts` `usePickAndAttachFile` opens `expo-document-picker` (handles iCloud + Google Drive providers via the OS picker), enforces the 100 MB cap, INSERTs row with `upload_state='pending'`, enqueues the bytes through `lib/uploadQueue.ts` (offline-first), and supports archive via `useDeleteJobFile`. "+ Attach file" button on the point detail screen.
- [x] PDF / image / CSV preview — admin `/admin/field-data/[id]` Files block branches on MIME type: `image/*` renders inline at max-height 320 px; `application/pdf` mounts an `<iframe>` at 480 px tall; `text/csv` (or `.csv` extension) auto-fetches the signed URL + parses the first 50 rows into a scrollable table (comma OR tab separator detection + quoted-field handling). Everything else falls back to the Download link. Bookkeeper reviews most files without leaving the page.
- [x] Pin-to-device for offline access — `mobile/lib/pinnedFiles.ts` + new local-only `pinned_files` table. Tap-pin on a file row resolves a signed URL, streams the bytes to `documentDirectory/pinned/<file_id>.<ext>` via `FileSystem.downloadAsync`, INSERTs a pinned row. Tap-open uses the local URI when pinned (offline-safe + instant) or signs a fresh URL + caches to `cacheDirectory` for one-shot reads when not pinned. Tap-unpin drops the row + unlinks the file. Me-tab Storage section shows "N files · X MB pinned." Mount-once reconciler reaps stale pinned_files rows whose local file disappeared between launches. Deleting a parent `job_files` row cascades to drop the pin so we don't leak disk. (Batch W)
- [x] CSV parser (P,N,E,Z,D and variants) — `mobile/lib/csvCoords.ts` (Batch AA). Pure module, separator auto-detect (comma / tab / semicolon), header-row auto-detect, P,N,E,Z,D and N,E,Z,D,P column-order detection, RFC-4180 quoted-field handling, comma-as-thousands-separator tolerance, soft-warning collection.
- [x] Auto-link CSV rows to phone-side data points by name (Batch AA). Tapping a CSV file row routes to the in-app preview screen at `/(tabs)/jobs/[id]/files/[fileId]/preview` instead of the share sheet. Preview shows stats bar (rows · matched · new), detected format, per-row table with N/E/Z + description + ✓ / "New" match badge against `useJobPointNames(jobId)`, plus an "Open in another app" fallback that hands off to the OS share sheet for surveyors who want Numbers / Excel.

**Exit:** Raw survey data and reference docs at fingertips. **Status:** capture + admin viewer shipped (Batch O); preview + parser + pin remain.

### Phase F6 — Location tracking + dispatcher view (Week 19–24)
- [x] One-time consent flow — `lib/TrackingConsentModal.tsx` shows the privacy explainer (when / what / cadence / who sees / storage / OS indicators) BEFORE the OS Always-location prompt fires. `lib/trackingConsent.ts` persists the consent flag in AsyncStorage so the modal shows once per install (resetting via `resetTrackingConsent` after uninstall is the correct re-prompt path). Pick-job clock-in flow gates `useClockIn` behind the modal: tap "Continue" → persist consent + clock in (which then triggers the OS prompt for "Always" via `startBackgroundTracking`); tap "Skip tracking for now" → clock in WITHOUT background tracking (boundary pings still capture clock-in/out coordinates via `lib/location.ts`). The skip path leaves the flag unset so the explainer re-shows on the next clock-in.
- [x] Background location with battery-conscious modes — `lib/locationTracker.ts` (high / balanced / low tiers based on battery %), `seeds/223_starr_field_location_pings.sql`, native config in `mobile/app.json` (UIBackgroundModes + ACCESS_BACKGROUND_LOCATION + foreground service). Cold-start reconciliation in `LocationTrackerReconciler` (app/_layout.tsx) recovers from phone-died-mid-shift.
- [/] Stop detection — `seeds/224_starr_field_location_derivations.sql` lands `location_stops` + `location_segments` tables and a deterministic PL/pgSQL aggregator `derive_location_timeline(p_user_id, p_log_date)`. Algorithm (v1, no AI / no map-matching): cluster pings within 50 m for ≥5 min into stops, sum Haversine distances along intermediate pings into segments (with 200 km single-jump glitch guard, matching `/api/admin/mileage`). Idempotent — DELETEs prior derivations except `user_overridden` stops. **Geofence classifier shipped in Batch Q** (`seeds/227`): `derive_location_timeline` now joins `jobs.{centroid_lat, centroid_lon, geofence_radius_m}` and labels each stop with the matching job's name + `category_source='geofence'`. Cheap bounding-box prefilter (~5 km lat/lon delta) before the Haversine check keeps the per-stop cost bounded. Closest match wins for overlapping fences. AI classifier + reverse-geocoded place names still deferred to v2 polish.
- [x] Daily timeline view (employee + admin) — admin: `/admin/timeline?user=&date=` reads the derived stops/segments and renders a stop → segment → stop timeline with per-stop time window, duration, Maps deep-link, optional category/place name, links to job + field-data. "Recompute" button POSTs to derive on-demand for fresh pings. APIs: `GET /api/admin/timeline` reads, `POST /api/admin/timeline` re-derives. Sidebar entry under Work group + per-card Timeline link from `/admin/team`. Employee: `(tabs)/me/privacy.tsx` surfaces the same stops/segments alongside the raw pings via `useOwnStopsForDate` / `useOwnSegmentsForDate` / `useOwnTimelineSummary` (PowerSync-backed). Three-stat summary card (stops · miles · stationary) matches the dispatcher's totals so surveyors see exactly what the office sees.
- [x] Mileage log generation (IRS-format export) — `GET /api/admin/mileage?from=&to=&user_email=&format=json|csv`. Server-side Haversine sum across consecutive pings per `(user, UTC date)` with a 200 km / single-jump glitch guard; CSV download for QuickBooks / tax import. Admin UI at `/admin/mileage` with date-range picker, per-user grouping, per-employee subtotals + download. Per-user drill-down link from each `/admin/team` card.
- [x] Vehicle assignment + driver/passenger — `seeds/225_starr_field_vehicles.sql` lands the `vehicles` table that's been declared in the mobile schema since seeds/220 + wires the FK from `job_time_entries.vehicle_id` (existing column) and `location_segments.vehicle_id` (added by seeds/224). `/admin/vehicles` page provides full CRUD (add / edit / archive / reactivate; soft-archive preserves historical refs). Mobile vehicle picker on the clock-in `pick-job` modal with optional vehicle pill row + "I'm driving" toggle (defaults true since most clock-ins are the driver themselves; passengers explicitly flip it off so mileage attribution stays clean for IRS). `useClockIn` accepts `vehicleId` + `isDriver`; persists to `job_time_entries.vehicle_id` + `is_driver`. `lib/vehicles.ts` `useVehicles` + `useVehicle` hooks back the picker. **Per-vehicle mileage breakdown** on `/admin/mileage` shipped (Batch P): each (user, date) row expands to per-vehicle subtotals with driver / passenger badges so bookkeepers see "Jacob drove Truck 3 for 28 mi AND rode passenger in Truck 1 for 12 mi" — only the driver miles are IRS-deductible. CSV export gains `vehicle_id` / `vehicle_name` / `is_driver` columns for QuickBooks pivots.
- [x] Dispatcher live map (web app, partial) — `/admin/team` shows last-known GPS + battery + staleness, with Google-Maps deep-link per card. Full live map (continuous trace, polling) pending.
- [ ] Day-replay scrubber (web app) — depends on the worker-derived segments above.
- [x] Missing-receipt cross-reference prompts (Batch DD + EE) — `worker/src/services/missing-receipt-detection.ts` + `worker/src/cli/scan-missing-receipts.ts`. Hourly cron scans `location_stops` from the last 24h that are ≥5 min long, have no `job_id` (geofence didn't match a known site), aren't user-overridden, and have NO `receipts.transaction_at` within ±30 min of the stop window. Pushes a notification with `source_type='missing_receipt'`, `link='/(tabs)/money/capture?stopId=...&stopArrivedAt=...'`. **Batch EE** wires the capture screen to consume those query params: shows an amber "Forget a receipt?" callout with the human-readable stop time + pre-stamps the new row with `transaction_at` = stop arrival + `location_stop_id` = stop UUID so AI extraction has a head-start, dedup fingerprinting works on insert, and the bookkeeper can trace from receipt back to the stop. Idempotent via stop_id in the link. Per-user-per-scan cap of 5. Soft-deleted receipts don't count toward "covered" (Batch CC).
- [x] Privacy controls panel (employee-facing) — `/(tabs)/me/privacy` shows what we capture, when (only between clock-in/out), cadence (battery-aware tier table), who sees it, and the storage path; plus a today's-timeline list of every `location_pings` row the user wrote in the last 24 h. **No** "pause tracking" toggle — that would violate the privacy contract from the other side (dispatcher would think the user left a job site mid-shift); the only way to stop tracking is to clock out, which does so atomically.

Audit additions:
- [x] Per-user `/admin/team/[email]` drilldown (Batch X) — single-page "what is X up to today?" view that aggregates clock-in state · today's clock-in history table · today's miles + stops + pings + captures + receipts stat bar · today's captures grid (with thumbnails) · today's receipts list · today's dispatcher pings sent. Header has quick-action buttons (send log_hours / submit_week ping; deep-link to Timeline / Mileage / All captures). Powered by a single `GET /api/admin/team/{email}/today?date=` aggregator that runs every section query in parallel via `Promise.all` so the page renders in one round trip. Linked from each `/admin/team` card via "📋 Open profile."

**Exit:** Full location-aware feature set live. **Status:** background-tracking + dispatcher last-seen + privacy panel + mileage export shipped. Stop detection / day-replay / vehicle picker / consent modal / missing-receipt prompts remain.

### Phase F7 — Polish + offline hardening (Week 25–28)
- [x] Storage management UI — Me-tab Uploads section + drilldown (`(tabs)/me/uploads.tsx`); per-row retry/discard, in-flight / failed filter tabs.
- [x] Sync UI improvements (per-asset progress, retry surfaces) — `useUploadQueueStatus` + the Uploads screen + Me-tab summary row that surfaces failed counts in danger colour.
- [x] High-contrast / sun-readable theme (Batch Y) — `lib/theme.ts` adds a third `'sun'` palette (pure white background, pure black text + borders, saturated accents) on top of the existing light + dark variants. `lib/themePreference.tsx` is the AsyncStorage-backed user preference (`'auto' | 'light' | 'dark' | 'sun'`) with a `<ThemePreferenceProvider>` mounted at the root, plus `useResolvedScheme()` hook that screens use in place of `useColorScheme()`. The provider mirrors the choice through `Appearance.setColorScheme()` so legacy `useColorScheme()` callers get a sensible light/dark fallback (sun maps to light). Me-tab Display section has a 4-pill picker with description copy. Capture entry, per-point capture (photos + voice + video player), time tab, pick-job modal, point detail, and Me tab now all read `useResolvedScheme()` so flipping to sun-readable propagates through the full surveyor field workflow.
- [ ] Battery profile audit — needs real-device measurement against the §2 goal of <50% over 8-hour field day with location tracking on. Test rig + measurement protocol both pending.
- [/] Tablet layout (truck-mounted iPad) — `supportsTablet: true` set in `app.json`. `lib/responsive.ts` provides `useResponsiveLayout()` + `tabletContainerStyle()` helpers (≥600 dp = tablet; clamp content to 720 px max + centre). Applied to the four main tab screens (Jobs / Time / Money / Me); detail / drilldown screens still inherit phone defaults — split-pane layouts and a tablet-specific Jobs+map combo are post-v1.
- [ ] Conflict resolution UX for multi-device — per §10 risk: per-field LWW for non-media, "both photos kept" for media. Currently no test coverage of the multi-device path.
- [ ] Stress-test: 30 days of data on 5 devices — operator concern; needs scripted nightly job + a few volunteer devices.

Audit additions:
- [x] Notification permission UX — Me-tab Notifications section with status indicator + Settings deep-link; AppState 'active' listener re-reads permission so toggling outside the app updates the row immediately. `lib/notifications.ts` `requestNotificationPermission` busts the cached promise so the re-prompt works.
- [x] Network-restore drainer — `useUploadQueueDrainer` mounts in root layout and fires on app launch + `subscribeToOnline` flips + every 60 s.

**Exit:** v1 shippable to all surveying employees with confidence. **Status:** storage + sync UI surfaces shipped. High-contrast / battery audit / tablet / conflict resolution / stress test all pending.

### Phase F8 — Trimble Access file exchange (Week 29–32)
- [ ] Watched cloud folder for Trimble JobXML / CSV
- [ ] Auto-import with preview
- [ ] Auto-link by name with unmatched-name surfacing

**Exit:** Trimble integration v1 (Path A from §8.1).

### Phase F9+ — Real-time integrations, AR, watch app, fuel-card reconciliation (research)

### Phase F10 — Equipment & supplies inventory + dispatcher templates (Week 33–40)

Implements the §5.12 spec. Single largest feature area outside
the F2/F6 capture loops. Sequenced so the daily ritual (the
user's headline ask) lands first; the tax + edge-case polish
follows.

**F10.0 — Schema + seeds + role wiring (Week 33). ✅ SHIPPED.**
The original plan had one fat `seeds/233` covering all of
inventory v2 + kits + events + templates. During the build we
split it into five smaller, independently-reviewable seed files
(231-line max each instead of one ~700-line file). Reservations,
personnel, maintenance, and tax stayed in their planned slots
but their seed numbers shifted from 234-237 to 238-241 to
accommodate the split.
- [x] `seeds/233_starr_field_equipment_inventory_v2.sql` —
      extends `equipment_inventory` with item_kind / category /
      current_status / qr_code_id / cost basis / calibration /
      consumable / home_location / vehicle_id / is_personal /
      retired_at / serial_suspect (§5.12.1, F10.0a-i) `[b8d239f]`
- [x] `seeds/234_starr_field_job_equipment_fk.sql` —
      adds `equipment_inventory_id UUID` FK on `job_equipment`
      with two indexes (per-inventory + open-assignments)
      while keeping the free-text columns for historical rows
      (§5.12.2, F10.0a-ii) `[dec1865]`
- [x] `seeds/235_starr_field_equipment_kits.sql` —
      `equipment_kits` wrapper + `equipment_kit_items` join
      with quantity / is_required / sort_order; CASCADE on
      kit, RESTRICT on child (§5.12.1.C, F10.0a-iii) `[90827da]`
- [x] `seeds/236_starr_field_equipment_events.sql` —
      universal append-only audit log with open-string
      event_type, FKs to equipment + jobs, deferred FKs for
      reservation_id / maintenance_event_id; 5 indexes; RLS
      append-only (§5.12.1 cross-cutting + §5.12.6 + §5.12.11.K,
      F10.0a-iv) `[fb94f61]`
- [x] `seeds/237_starr_field_equipment_templates.sql` —
      `equipment_templates` header + items (with the crucial
      XOR between `equipment_inventory_id` and `category` for
      §5.12.5 conflict-detection) + `equipment_template_versions`
      immutable snapshots (§5.12.3, F10.0a-v) `[e566747]`
- [x] `equipment_manager` role added to `lib/auth.ts ALL_ROLES`
      + 4 `Record<UserRole, …>` consumers updated
      (`AdminSidebar`, `users/page.tsx`, `employees/page.tsx`,
      `auth.ts ROLE_LABELS / DESCRIPTIONS / PRIORITY`); no DB
      migration needed since `registered_users.roles` is
      `text[]` with no enum CHECK. Sidebar entries for the
      new "Equipment" group intentionally NOT added — those
      land in F10.6 alongside the dashboards they link to.
      (§4.6 + §5.12.7, F10.0e) `[ded0b67]`

Subsequent F10 sub-phases reference seed numbers shifted by 4:
* F10.3 reservations seed: was `234` → now `238`
* F10.4 personnel seed: was `235` → now `239`
* F10.7 maintenance seed: was `236` → now `240`
* F10.9 tax tie-in seed: was `237` → now `241`

**F10.1 — Inventory catalogue + QR codes (Week 33–34).**
The "list of every piece of metal" surface — the foundation
the rest of F10 reads from. Broken into 10 small sub-batches:
- [x] **F10.1a** — `GET /api/admin/equipment` endpoint
      `[1122ecc]`. Reads all 30+ seeds/233 columns; filters
      by status, category, item_kind, include_retired, q
      (substring on name+model+serial); auth gates on
      admin/developer/tech_support/equipment_manager;
      response includes total_count + filters_applied.
- [x] **F10.1b** — `/admin/equipment/inventory` read-only
      page. Filter row (status / kind / search / include-
      retired toggle) + results table with status pills,
      personal/suspect/retired badges, low-stock highlight
      on consumables, cost basis + next-cal-due columns.
      Sidebar entry NOT yet added (lands in F10.6).
- [x] **F10.1c** — Add Unit modal + `POST /api/admin/equipment`
      endpoint. **F10.1c-i (POST endpoint)** + **F10.1c-ii
      (modal UI)** both shipped. Modal validates name + item_kind
      required, conditionally shows consumable-only fields
      (unit / quantity_on_hand / low_stock_threshold) when
      item_kind='consumable', auto-generates qr_code_id
      server-side when blank, refetches the catalogue + shows a
      success toast on create.
- [x] **F10.1d** — Inline edit (`PATCH /api/admin/equipment/[id]`
      + form on the catalogue rows). **F10.1d-i (PATCH endpoint)**
      + **F10.1d-ii (edit-modal UI)** both shipped. Edit modal
      pre-fills from the row, locks `item_kind` (changing kind
      invalidates kit memberships / templates / reservations —
      retire+recreate path), surfaces extra fieldsets for cost
      basis (§5.12.10) + calibration/warranty (§5.12.7.4) that
      the Add modal explicitly defers, status select editable
      so admins can move a unit through the lifecycle.
      Per-row "Edit" button on the catalogue table; retired
      rows get the button disabled with hover hint pointing
      to the F10.1e retire action.
- [x] **F10.1e** — Retire action (soft-archive via
      `retired_at` + `retired_reason` from seeds/233).
      **F10.1e-i (POST `/api/admin/equipment/[id]/retire`
      + `/restore` endpoints) + F10.1e-ii (UI)** both shipped.
      Per-row Retire (red ghost) / Restore (green ghost)
      buttons next to Edit; one `RetireRestoreModal` handles
      both modes via a `mode` prop; canonical reason picker
      (10-value enum) for retire + freeform notes; single
      notes field for restore. Audit-log rows written by the
      endpoints make the §5.12.7.3 history tab one join away.
- [x] **F10.1f** — QR sticker PDF (single row, label-printer
      sized). `GET /api/admin/equipment/[id]/qr-sticker`
      returns a Brother DK-1201-sized (2.4×1.1 in) PDF with
      QR + name + category + brand/model/serial + qr_code_id
      text. Per-row "QR" link in the catalogue Actions cell
      triggers the browser download. Uses `qrcode` package
      (newly added to package.json) + the existing pdfkit
      dep. 422 if the row has no qr_code_id (operator edits
      to assign one first).
- [x] **F10.1g** — Bulk QR PDF (multi-page; selected rows →
      sheet). **F10.1g-i (endpoint) + F10.1g-ii (UI)** both
      shipped. Endpoint accepts `{ ids: string[] }` OR `{ filter:
      {…} }` (mutually exclusive), 200-row cap, parallel QR
      encode, X-Stickers-Skipped response header for the
      "3 skipped — assign QR via Edit" toast. Catalogue UI adds
      a checkbox column (with header indeterminate state when
      partially selected), per-row checkboxes, a blue bulk-action
      bar that floats above the table when selection > 0
      (selected count · Clear · Print N QR), and a "Print all
      QR (filtered)" button next to + Add unit. Selection
      persists across filter changes for cross-page batches.
- [x] **F10.1h** — Bulk CSV importer at
      `/admin/equipment/import` (§5.12.11.H, system-go-live
      fleet seeding). **F10.1h-i (POST `/api/admin/equipment/
      import` endpoint) + F10.1h-ii (page UI)** both shipped.
      Endpoint accepts `{ csv, mode: 'dry_run' | 'execute' }`,
      RFC-4180 quoted-field parser, auto-detects comma vs tab,
      validates required headers + the §5.12.1 enums + integer/
      date columns, surfaces row-attributed errors, detects
      intra-batch qr_code_id duplicates, atomic execute (one
      bad row rolls back the whole batch), 1000-row hard cap.
      Page wires file picker + paste textarea + dry-run / execute
      buttons, errors highlighted in a per-row table, success
      banner with link back to catalogue. Sidebar entry lands
      in F10.6.
- [x] **F10.1i** — Mobile `useEquipmentByQr` resolver hook
      + offline cache pre-fetch (`mobile/lib/equipment.ts`).
      Shipped. Local-SQLite-first via PowerSync (per
      §5.12.9.3 offline-first contract — every lookup runs
      against the synced rows so QR scans resolve at the
      cage's metal-shed dead zone). Three hooks:
      `useEquipmentByQr(qrCodeId)` (case-insensitive,
      retired_at IS NULL filter), `useEquipment(id)` (UUID
      drilldown), `useEquipmentList(filter?)` (catalogue
      browse with optional status / category / itemKind /
      includeRetired filters). Mobile schema extended with
      `equipment_inventory` table; sync rule wiring deferred
      to F10.5 activation gate (operator updates server-side
      sync rules before exposing F10.1j scanner).
- [x] **F10.1j** — Mobile camera scanner overlay
      (`mobile/lib/QrScanner.tsx`). Shipped. Reusable
      forwardRef component handling permissions (request +
      Open Settings fallback when denied), live `CameraView`
      with `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`,
      single-shot decode (parent calls `rearm()` via the
      imperative ref to scan again — supports the §5.12.6
      kit-batch flow), animated scan-line inside a 240pt
      reticle with corner brackets, dim spotlight overlay,
      bottom hint text + top-right ✕ close. Pairs with
      F10.1i `useEquipmentByQr` resolver — host screens
      decoded-string→equipment-row in F10.5+ workflows.
      `expo-camera ~16.0.10` added to mobile/package.json.

**F10.2 — Templates + dispatcher apply flow (Week 34–35).**
Broken into smaller sub-batches per the established pattern.
- [x] **F10.2a** — Templates list endpoints. **F10.2a-i
      (`GET /api/admin/equipment/templates` list)** + **F10.2a-ii
      (`GET /api/admin/equipment/templates/[id]` detail)** both
      shipped. Detail endpoint joins items (ordered by
      sort_order) + version_count + latest_snapshot_at via
      4 parallel queries, returns 404 on missing row, UUID-
      validates the path-param.
- [x] **F10.2b** — Templates create/edit endpoints
      (POST + PATCH + DELETE). **All three (b-i POST, b-ii PATCH
      header, b-iii DELETE → soft-archive)** shipped. DELETE flips
      is_archived=true with version bump + snapshot write
      (idempotent — already-archived rows return 200 +
      already_archived:true; race-guarded UPDATE against
      `is_archived=false`). Hard-delete intentionally NOT
      supported per §5.12.3 (would orphan job_equipment.
      from_template_id audit chain). Restore via PATCH
      `{ is_archived: false }`.
- [x] **F10.2c** — Items endpoints (POST/PATCH/DELETE for
      line items inside a template). **All three (c-i POST,
      c-ii PATCH, c-iii DELETE)** shipped — each bumps the
      parent's version + writes a fresh snapshot capturing
      the FULL post-mutation items array per the §5.12.3
      audit-trail rule. PATCH runs the XOR check on MERGED
      state (current row + incoming patch) so the operator
      can swap equipment_inventory_id ↔ category in a single
      request. DELETE hard-deletes the item row (no item-level
      soft-archive — audit chain runs through the parent's
      prior version snapshot which still carries the deleted
      row in its items_jsonb). All three return 404 on
      (templateId, itemId) mismatch — defends against spoofed
      itemIds belonging to a different template.
- [x] **F10.2d** — `/admin/equipment/templates` list page.
      Catalogue browse w/ job_type / search / include-archived
      filters · per-row name+description+cert badges · job_type
      pill · item_count · default crew + duration · composes-from
      indicator (⊕ N) · version code · last-edited date · active /
      archived status badge · per-row Edit link + Archive/Restore
      button (uses DELETE for archive, PATCH for restore).
      "+ New template" button navigates to /new (queued). Sidebar
      entry deferred to F10.6.
- [✓] **F10.2e** — Templates create + edit pages. **F10.2e-i
      create + F10.2e-ii-a edit page shell + F10.2e-ii-b items
      table + F10.2e-ii-c Add-item modal + F10.2e-ii-d Edit-item
      modal (PATCH w/ XOR swap) + F10.2e-ii-e Delete-item
      confirm + DELETE** all shipped. Edit modal pre-fills from
      the row, auto-detects resolution mode (specific vs
      category) from initial state, lets operator swap modes
      mid-edit — submit explicitly clears the OTHER field so
      the F10.2c-ii server-side merged-state XOR check accepts
      the swap as a single PATCH. Delete confirm modal shows
      the row's contents (kind + specific/category + qty +
      notes) inside the confirm card, calls DELETE per
      F10.2c-iii, surfaces "✓ Item deleted. Bumped to v<N>;
      snapshot recorded." Per-row Edit + Delete buttons now
      functional. Phase F10.2e is fully shipped — F10.2f
      (save-as) + F10.2g (apply) remain deferred per below.
- [◐] **F10.2f** — Save-as-template shortcut. Split:
  - [✓] **F10.2f-i** — `POST /api/admin/equipment/templates/save-from-job`
        (equipment items only) shipped. Body `{ job_id,
        name, slug?, description?, job_type?,
        default_crew_size?, default_duration_hours?,
        requires_certifications? }`. Walks the job's
        `equipment_reservations` rows in state ∈ held |
        checked_out | returned (cancelled rows omitted —
        the dispatcher pulled them back so they shouldn't
        ride into the saved template). Per reservation:
        preserves `equipment_inventory_id` (specific
        instrument; dispatcher edits the resulting template
        to switch to category-of-kind via the existing
        item-edit UI), resolves `item_kind` from
        `equipment_inventory.item_kind`, emits
        `quantity=1` (consumables decrement happens
        per-row at check-in; v1 of save-as emits 1 each
        and dispatcher edits), `is_required=true`,
        carries forward `notes`, `sort_order = i*10`.
        Creates the equipment_templates header (v1) with
        `required_personnel_slots=[]`, then batch inserts
        the items with cleanup-on-failure (drops the
        header if items insert fails so the dispatcher
        doesn't end up with an empty-template ghost).
        Snapshots v1 into `equipment_template_versions`
        per the §5.12.3 audit chain (non-fatal on failure).
        Slug collision (23505) returns typed 409
        `slug_collision`. Empty source returns
        `no_source_reservations` 400 ("apply equipment to
        the job first, then save-as"). Auth: admin /
        developer / equipment_manager.
  - [✓] **F10.2f-ii** — personnel slot derivation shipped.
        `derivePersonnelSlots(jobId)` helper walks
        `job_team` rows in `proposed|confirmed` state +
        groups by `slot_role` (lowercased + trimmed) →
        emits one `required_personnel_slots` entry per
        role with `min=max=count` (the apply flow honors
        these in F10.2g). `required_skills` derived from
        `ROLE_TO_REQUIRED_SKILLS` canonical map (`rpls →
        ['rpls']`, `lsit → ['lsit']`, `flagger →
        ['flagger']`, `drone_pilot_part_107 →
        ['drone_pilot_part_107']`); other slot_roles ship
        with `required_skills=[]` and the dispatcher fills
        in via the existing template edit UI. Threaded
        into both the header insert AND the v1 snapshot so
        the §5.12.3 audit chain captures the slot
        derivation. Response summary now carries
        `slot_count`. job_team read failure logs but
        falls back to an empty slots array — saving the
        template still succeeds, dispatcher edits as
        needed.

      F10.2f closes out: dispatcher can promote a custom-
      built job loadout — both equipment AND crew slots —
      into a reusable template via one POST. **Phase F10.2
      fully shipped.**
- [◐] **F10.2g** — Apply-template flow. Split into 2 + 2 sub-
      batches now that F10.3 + F10.4 prerequisites are shipped:
      F10.2g-a-i (composition resolver lib) · F10.2g-a-ii
      (GET /preview endpoint) · F10.2g-b-i (POST /apply
      equipment side) · F10.2g-b-ii (POST /apply personnel
      side + cleanup-on-partial-failure).
  - [✓] **F10.2g-a-i** — `lib/equipment/template-resolver.ts`
        shipped. Pure function `resolveTemplate(templateId,
        client?)` walks the template + its `composes_from`
        chain DFS up to `MAX_COMPOSITION_DEPTH=4`. Cycle
        detection via a visited-set raises typed
        `cycle_detected`; archived mid-chain parents raise
        `archived_parent` (top-level archived templates ARE
        re-applicable per spec — historical loadout). Items
        dedupe by composite key (`unit:<uuid>` for specific
        instruments, `cat:<category>` for any-of-kind);
        quantities sum across parents per §5.12.3, is_required
        ORs (any-required wins), notes concatenate with `|`
        separator, sort_order takes the smallest contributor,
        `source_template_ids[]` accumulates for the audit
        trail. Personnel slots dedupe by `slot_role` with
        min/max sums + skill-set union (lowercased + deduped).
        Returns `{ resolved: { root, items, personnel_slots,
        resolution_chain, resolution_depth } }` or `{ error:
        ResolverError }` for typed surfacing in the GET
        endpoint. Centralised so both /preview (g-a-ii) and
        /apply (g-b-*) share identical resolution semantics
        — no drift possible. Accepts an optional `client` so
        the apply handler can pass its own connection if it
        ever needs a transaction-aware read.
  - [✓] **F10.2g-a-ii** — `GET /api/admin/equipment/templates/
        [id]/preview?from=&to=[&job_id=]` shipped. Wraps the
        F10.2g-a-i resolver + the F10.3-b equipment engine
        (per item: unit-mode → 1 assessment; category-mode →
        every unit in the category) + the F10.4-b personnel
        engine (per slot: cohort assess across users holding
        ≥1 of `required_skills`, with `skillsAreSoft=false`
        for template-required strict-fail). Returns
        `{ window, job_id, template, resolution: { chain,
        depth }, items: [{ resolved, assessments,
        assignable_count, blocked_count }],
        personnel_slots: [{ resolved, candidates,
        assignable_count, blocked_count }], summary: {
        item_count, blocked_items, slot_count,
        unfilled_slots, ready_to_apply } }`. Read-only — no
        writes; the F10.2g-b apply path re-runs the resolver
        + availability inside its transaction so a stale
        preview can't slip through. Resolver errors map to
        typed status codes: missing_template → 404,
        cycle_detected / depth_exceeded / archived_parent →
        409. Item assessments parallelised via `Promise.all`
        so 10-item templates round-trip fast. Auth: admin /
        developer / tech_support / equipment_manager (same
        read-side gate as `/availability`).
  - [✓] **F10.2g-b-i** — `POST /api/admin/equipment/templates/
        [id]/apply` equipment side shipped (strict-fail v1 —
        no per-item overrides yet; that lands as a follow-up
        F10.2g-b-iii batch when the dispatcher UI demands it).
        Body `{ job_id, from, to }`. Re-runs the F10.2g-a-i
        resolver inside the handler so a stale preview can't
        slip through; per item runs the F10.3-b engine; for
        category-mode picks the first assignable winner
        (proximity ranking already lives in the engine for
        future tuning); on any block aborts with 409 carrying
        every conflict in the same shape as the preview so
        the dispatcher UI handles pre- and mid-insert
        collisions identically. On full clear, batch-inserts
        `equipment_reservations` with
        `from_template_id=<this template>` +
        `from_template_version=<resolved.root.version>` audit
        stamps so the §5.12.3 versioning rule holds (the
        snapshot answers "what did Job #427 actually go out
        with?", not the live mutable template). Inherits race-
        safety from F10.3-c: PostgREST batch INSERT runs in
        one transaction, seeds/239's GiST EXCLUDE catches
        concurrent overlap, Postgres 23P01 maps to typed
        `reserved_for_other_job`. Auth: admin / developer /
        equipment_manager.
  - [✓] **F10.2g-b-ii** — `POST /apply` personnel side +
        cleanup-on-partial-failure shipped. Body extends with
        optional `slot_assignments: [{ slot_role, user_email,
        is_crew_lead?, override_reason? }]`. Each entry's
        slot_role must match a resolved slot, per-role count
        must satisfy slot.min/max, no duplicate user-in-slot.
        Slot-misuse codes (`unknown_slot_role`,
        `count_below_min`, `count_above_max`,
        `duplicate_user_in_slot`) surface as `slot_conflicts[]`
        alongside the equipment `conflicts[]` so the dispatcher
        sees everything in one 409. Per-row F10.4-b engine
        assessment skipped when slot_misuse already attached
        (no double work). On full clear: equipment commits
        first via the existing batch INSERT (F10.2g-b-i path),
        then personnel commits in a second batch INSERT into
        `job_team` with `assigned_from=window.from`,
        `assigned_to=window.to`, `state='proposed'`. If
        personnel fails AFTER equipment commits, the handler
        issues a delete-by-id batch against the just-inserted
        reservations (`WHERE id IN (...) AND state='held'`) so
        a concurrent check-out can't lose its row to our
        cleanup. Cleanup result lands in the response as
        `cleanup: { rolled_back_reservation_count }` so the
        caller knows what happened. PG error mapping mirrors
        F10.4-c: 23P01 → `capacity_overlap`, 23505 →
        `crew_lead_already_set`. Cleanup failures log loudly
        (equipment_events still records the reservations so
        audit survives) but don't block the 409. Auth
        unchanged: admin / developer / equipment_manager.

      **F10.2g closes out.** Both halves shipped — preview
      (a-i + a-ii) and apply (b-i + b-ii) — so the §5.12.3
      worked example runs end-to-end: dispatcher applies
      "Residential 4-corner boundary — total station" template
      to Job #427 → preview shows resolved items + slot
      candidates with availability info → dispatcher picks
      crew → POST /apply commits equipment_reservations +
      job_team rows atomically with from_template_id +
      from_template_version stamps. Per-item override (swap /
      drop / force) lands in F10.2g-b-iii when the dispatcher
      UI demands it; until then overrides route through
      F10.3-c /reserve directly.

**F10.3 — Availability + conflict detection engine (Week 35).**
Split into 6 sub-batches per the small-chunks discipline:
F10.3-a (schema seed) · F10.3-b (availability engine + GET) ·
F10.3-c (POST reserve, atomic FOR UPDATE) · F10.3-d
(substitution suggestions) · F10.3-e (soft-override path) ·
F10.3-f (POST cancel-reservation).
- [✓] **F10.3-a** — `seeds/239_starr_field_equipment_reservations.sql`
      shipped. Adds the `equipment_reservations` table (id,
      equipment_inventory_id, job_id, from_template_id/version,
      reserved_from/to, state ∈ held|checked_out|returned|
      cancelled, actual_*_at scan stamps, notes, reserved_by) +
      a GiST EXCLUDE constraint that makes overlapping
      `held`/`checked_out` rows for the same instrument
      structurally impossible (the §5.12.5 race fence —
      Postgres rejects the second insert directly so two
      dispatchers can never co-grant Kit #3). Plus partial
      indexes on the active-state read paths, derived columns
      `equipment_inventory.next_available_at` +
      `current_reservation_id` kept in sync by an AFTER
      INSERT/UPDATE/DELETE trigger that walks chained back-to-
      back reservations as a single "busy until" answer, and
      the deferred FK from `equipment_events.reservation_id`
      (which seeds/236 stubbed without a constraint).
- [✓] **F10.3-b** — `GET /api/admin/equipment/availability`
      shipped. `lib/equipment/availability.ts` exposes
      `assessUnit(id, opts)` + `assessCategory(category, opts)`
      pure functions that run the four §5.12.5 checks (status
      hard-block list · reservation overlap with the same '[)'
      range semantics as seeds/239's GiST EXCLUDE · calibration
      soft-warn that escalates to hard-block past
      `calibrationHardBlockDays` (default 30) · consumable
      stock hard-block on insufficient + soft-warn at/below
      reorder threshold). Each `UnitAssessment` carries
      `hard_blocks` + `soft_warns` arrays of typed
      `AvailabilityReason` so callers (UI, F10.3-c reserve,
      §5.12.7 reconcile) render uniformly. The thin GET
      endpoint validates `from`/`to` ISO + XOR `id`/`category`
      + optional `qty` / `calibration_hard_block_days`,
      dispatches to the lib, and returns `{ window,
      assignable_count, blocked_count, assessments[] }`.
      F10.3-c reserve will reuse the same lib inside its
      FOR UPDATE transaction by passing its own `client` so
      assessment + insert see one snapshot.
- [✓] **F10.3-c** — `POST /api/admin/equipment/reserve` shipped.
      Atomic all-or-none reservation. Body
      `{ job_id, items: [{equipment_inventory_id|category,
      quantity?, reserved_from, reserved_to, notes?,
      from_template_id?, from_template_version?}] }`. Per-item
      flow: validate → assess (engine from F10.3-b) → for
      category mode pick the first assignable unit (proximity
      ranking lands in F10.3-d) → collect resolved rows. If any
      item is blocked, return 409 with **all** items'
      reasons in one response so the dispatcher fixes
      everything in one pass. On full success, batch-insert all
      reservations via PostgREST's array `.insert()` (single
      transaction guarantee); the seeds/239 GiST EXCLUDE catches
      any concurrent overlap that beat the engine's check, which
      we map (Postgres error code 23P01 → typed
      `reserved_for_other_job` conflict) so the dispatcher sees
      the same error vocabulary regardless of where the conflict
      was caught. Auth: admin / developer / equipment_manager
      (tech_support read-only). Substitution suggestions
      (F10.3-d) and soft-override path (F10.3-e) intentionally
      not in this batch — handler returns clean typed conflicts;
      next batches build the UX affordances on top of the same
      shape.
- [✓] **F10.3-d** — substitution suggestions shipped.
      `lib/equipment/availability.ts` adds
      `proposeSubstitutionsForUnit(anchor, opts)` +
      `proposeSubstitutionsForCategory(category, opts)`. Score
      function: assignable + same `home_location` (top), then
      assignable + same `vehicle_id`, then assignable +
      category-only, then blocked-alternates ranked by
      `next_available_at` ASC so the dispatcher sees the
      earliest "wait" option last but visible. Tied scores
      break on name ASC for stable ordering. Default cap = 5.
      `UnitAssessment` gains `home_location` + `vehicle_id` so
      the GET response carries enough for the UI to render
      "near you" badges without a second roundtrip. GET
      `/availability` extended: when a unit-mode request is
      blocked OR when category-mode finds zero assignable
      units, the response carries a top-level
      `substitutions: SubstitutionSuggestion[]`. POST
      `/reserve` swap: per-item conflicts now carry
      `substitutions[]` so the dispatcher fixes blocks in one
      pass; category-mode picker centralised in
      `pickProximityWinner` (v1 = name ASC; tunable). Surfaces
      the §5.12.5 worked-example "kit #3 reserved; kit #4
      also available — switch?" UX directly from the wire
      shape. Compatible-category swap graph (template-`notes`-
      declared "OK to swap to GPS rover kit") is v2 polish per
      the spec.
- [✓] **F10.3-e** — soft-override path shipped.
      `seeds/240_starr_field_equipment_reservation_override.sql`
      adds `is_override BOOLEAN DEFAULT false` and
      `override_reason TEXT` to `equipment_reservations` + a
      CHECK that `is_override=true` requires non-empty
      `override_reason` + a partial admin index on
      `WHERE is_override=true`. The seeds/239 GiST EXCLUDE is
      replaced with an override-aware version that only fires
      when `is_override=false` for both rows, so a soft-override
      lands as a SECOND active row alongside the conflicting
      reservation per §5.12.5 — both rows stay on the timeline
      and the Equipment Manager picks at QR-scan time. POST
      `/reserve` accepts optional `override_reason` per item
      (specific-unit-mode only — category overrides are nonsense
      since they bypass the substitution path); when set, the
      handler skips the assignable gate, sets `is_override=true`,
      writes the reason to both `override_reason` and
      `notes='OVERRIDE: <reason>'` (separate column for clean
      admin queries; prefix in notes for timeline UI), and after
      a successful insert fans out a §5.10.4 notification with
      escalation_level='high' to every `equipment_manager` user
      + the actor (looked up via `registered_users.roles cs
      '{equipment_manager}'`). Per the user's "nothing is
      silent" directive: the override surfaces in the
      notification inbox + daily digest of every relevant
      stakeholder so it cannot be lost. Notify failures are
      best-effort and don't roll back the reservation — events
      audit trail (§5.12.1) provides the recoverable record.
      Auth: only admin / developer / equipment_manager can hit
      the route at all, so the role gate on override is the
      same gate as the rest of the endpoint.
- [✓] **F10.3-f** — `POST /api/admin/equipment/cancel-reservation`
      shipped. Body `{ reservation_id, reason? }`. Flips a
      `held` reservation to `cancelled`; refuses 409 on any
      terminal state (`checked_out` → use §5.12.6 check-in
      flow, `returned`/`cancelled` → already terminal). The
      UPDATE guards on `state='held'` (belt-and-suspenders for
      TOCTOU between read + write); on guard miss, re-reads the
      latest state so the caller sees what beat them. Optional
      `reason` (≤500 chars) appends as `CANCEL: <reason>` to
      `notes`, preserving any prior `OVERRIDE: ` prefix so the
      timeline carries both. The seeds/239 AFTER-UPDATE sync
      trigger automatically releases
      `equipment_inventory.current_reservation_id` +
      `next_available_at` for the affected unit, so the
      §5.12.7.1 Today landing-page card refreshes without any
      extra writes here.

      **F10.3 closes out.** All six sub-batches shipped: the
      schema layer (a), the availability engine + GET (b), the
      atomic POST /reserve (c), substitution suggestions (d),
      the soft-override path with notification fan-out (e), and
      cancel-reservation (f). The §5.12.5 worked-example UX
      ("kit #3 reserved; kit #4 also available — switch?")
      runs end-to-end against the wire shape.

**F10.4 — Personnel side (Week 36).**
Split into 5 sub-batches per the small-chunks discipline (mirrors
F10.3): F10.4-a (schema seed) · F10.4-b (availability engine +
GET) · F10.4-c (POST /assign atomic + override + notification) ·
F10.4-d (POST /respond — confirm/decline mobile-card endpoint) ·
F10.4-e (POST /cancel-assignment + crew-lead helpers).
- [✓] **F10.4-a** — `seeds/241_starr_field_personnel_capacity.sql`
      shipped. ALTERs `job_team` to add the §5.12.4
      assignment-window + state-machine columns
      (`assigned_from`/`_to`, `slot_role`, `state ∈ proposed |
      confirmed | declined | cancelled`, `confirmed_at`/
      `declined_at`/`decline_reason`, `is_crew_lead`,
      `is_override`, `override_reason`) — additive only, the
      live `app/api/admin/jobs/team/route.ts` keeps working
      against pre-F10.4 NULL-state rows. GiST EXCLUDE on
      (user_email, [assigned_from, assigned_to)) WHERE state ∈
      (proposed, confirmed) AND is_override=false — same
      structural race fence as seeds/239 for capacity overlap.
      Crew-lead exactly-one-per-job via partial UNIQUE on
      (job_id) WHERE is_crew_lead=true AND state ∈
      (proposed, confirmed); cancelling/declining the lead
      frees the slot automatically. Two new tables:
      `personnel_skills` (per-user catalogue keyed on
      user_email, with skill_code, acquired_at,
      expires_at NULL = doesn't expire, cert_document_url for
      §5.6 files-bucket PDFs, state ∈ active | expired |
      revoked) and `personnel_unavailability` (PTO / sick /
      training / doctor / other, with from/to window, reason,
      is_paid, approved_by/at). GiST overlap indexes on both
      so the F10.4-b engine's queries stay fast. updated_at
      triggers on the new tables. Seed numbering: was
      provisionally 240 in earlier plan revisions, but
      seeds/240 shipped as the F10.3-e equipment-override
      schema; renumbered to 241 to match actual ship order.
- [✓] **F10.4-b** — `GET /api/admin/personnel/availability`
      shipped. `lib/personnel/availability.ts` exposes
      `assessPerson(userEmail, opts)` +
      `assessForSkillCohort(opts)` pure functions running the
      four §5.12.4 checks: missing-skill (per `required_skills`
      entry; hard-block when slot is template-required, soft-
      warn when `skillsAreSoft=true` for ad-hoc fills),
      capacity overlap (job_team rows in proposed|confirmed
      with `[)` overlap on the window — same range semantics as
      seeds/241's GiST EXCLUDE), unavailability (PTO/sick/
      training/doctor/other with reason + kind so the UI
      differentiates "ask to skip PTO" from "they're at the
      doctor"), and cert-expiry-during-window (skill row
      exists + active but `expires_at` falls inside the window
      → soft-warn so the dispatcher can remind the surveyor
      to renew). Each `PersonAssessment` carries `hard_blocks`
      + `soft_warns` arrays of typed
      `PersonnelAvailabilityReason` so callers (UI, F10.4-c
      assign, capacity calendar) render uniformly. Cohort
      mode walks every active user holding ≥1 of the requested
      skills + assesses each (returns blocked rows too so the
      typeahead shows "Jacob has the cert but is on Job
      #422"); user-mode hits a single email. Optional cohort
      fallback walks `registered_users` when no skills given,
      for the bare PTO/capacity calendar. Three parallel reads
      (skills · capacity · unavailability) batched per
      assessment so the engine round-trips at most 3 + 1 to
      the DB regardless of cohort size. F10.4-c assign will
      reuse the same engine inside its FOR-UPDATE-equivalent
      transaction by passing its own `client`.
- [✓] **F10.4-c** — `POST /api/admin/personnel/assign` shipped.
      Atomic all-or-none multi-slot. Body
      `{ job_id, slots: [{ user_email, slot_role,
      assigned_from, assigned_to, required_skills?,
      skills_are_soft?, is_crew_lead?, notes?,
      override_reason? }] }`. Per-slot flow validates →
      assesses via the F10.4-b engine → either resolves
      (assignable OR overridden) or attaches a
      `SlotConflict` with reasons + user_not_found marker.
      Pre-insert intra-batch checks reject duplicate
      (user_email × overlapping window) within the same call
      and refuse > 1 `is_crew_lead=true` per call. Atomic
      batch INSERT into `job_team` (single transaction;
      partial assignments impossible by construction);
      seeds/241's GiST EXCLUDE catches concurrent races and
      maps Postgres 23P01 → typed `capacity_overlap`; the
      crew-lead partial UNIQUE catches 23505 → typed
      `crew_lead_already_set` so dispatchers see the right
      remediation. Post-insert: each surveyor gets a §5.10.4
      `personnel_assignment_proposed` notification keyed to
      `/admin/jobs/<id>` with the F10.4-d /respond UX
      driving Confirm / Decline; override rows ALSO fan out
      a high-priority audit notification to every
      `equipment_manager` + actor per the "nothing is silent"
      directive (mirrors F10.3-e). Notify failures are
      best-effort and don't roll back. Auth: admin /
      developer / equipment_manager (mutating; tech_support
      read-only).
- [✓] **F10.4-d** — `POST /api/admin/personnel/respond`
      shipped. Body
      `{ assignment_id, response: 'confirm'|'decline',
      decline_reason? }`. Two auth paths: the assigned
      surveyor (`job_team.user_email === session.email`) is
      the primary case via the mobile inbox card; admin /
      equipment_manager can hit on behalf of the surveyor for
      the §5.12.4 step 6 "verbally agreed in person" bypass
      (audit-logged with `privileged_bypass=true` on the
      response so reviewers see the actor + on-behalf-of).
      State machine: only `proposed` is respondable;
      confirmed/declined/cancelled return 409 with
      `current_state`. UPDATE guards on `state='proposed'`
      (TOCTOU — re-reads on guard miss so the caller sees
      what beat them). Confirm = quiet success
      (`state='confirmed'`, `confirmed_at=now()`, no
      notification — the dispatcher's roster shows the flip
      on refresh). Decline = `state='declined'`,
      `declined_at=now()`, `decline_reason` set, fan out a
      §5.10.4 `personnel_assignment_declined` notification to
      every admin + equipment_manager (filtered to exclude
      the actor + declining surveyor) so any dispatcher can
      re-staff. Decline notifications carry
      escalation_level='high' when the declined slot was
      `is_crew_lead=true` since losing the lead is more
      urgent. Required `decline_reason` (≤500 chars,
      non-blank) so the dispatcher can decide between
      "ask again" and "find someone else".
- [✓] **F10.4-e** — two endpoints close out F10.4.
      `POST /api/admin/personnel/cancel-assignment` (mirror of
      F10.3-f equipment cancel): body
      `{ assignment_id, reason? }`. Cancels from `proposed` OR
      `confirmed` (the post-confirm pull-back is rare but legal
      — surveyor got sick day-of and the dispatcher swaps out);
      refuses 409 on declined/cancelled/null state; UPDATE
      guards on `state IN (proposed, confirmed)` for TOCTOU,
      re-reads on miss; appends `CANCEL: <reason>` to notes
      preserving any prior `OVERRIDE: ` prefix; notifies the
      affected surveyor (escalation_level='high' when
      `is_crew_lead=true`). `POST
      /api/admin/personnel/promote-crew-lead`: implements the
      §5.12.4 auto-promote heuristic. Body
      `{ job_id, prefer_user_email? }`. If a lead is already
      set, returns it with `ranking_reason='already_set'`.
      Otherwise walks the job's active assignments + ranks by
      tiers — RPLS holders > LSIT holders > `party_chief`
      slot_role > `field_tech` / `instrument_specialist_*`
      > alphabetical-by-name fallback — and promotes the
      winner. The seeds/241 crew-lead partial UNIQUE catches
      the race where two dispatchers promote at the same
      instant; the handler maps 23505 → typed
      `crew_lead_already_set` so the loser refetches.
      `prefer_user_email` lets the dispatcher hand-pick from
      the active roster (still validates membership); skipping
      it triggers the auto-rank.

      **F10.4 closes out.** All five sub-batches shipped:
      schema (a), engine + GET (b), atomic POST /assign with
      override + notification (c), POST /respond mobile-card
      endpoint (d), and POST /cancel-assignment + crew-lead
      auto-promote (e). The §5.12.4 worked-example UX
      ("dispatcher picks Jacob → 'proposed' → mobile inbox
      → tap Confirm → 'confirmed'") runs end-to-end. The
      personnel surface is the F10.3 mirror by intent —
      same vocabulary, same state machine, same race-fence
      pattern — so dispatchers learn one mental model and the
      apply-template flow (F10.2g) can address equipment +
      personnel uniformly.

**F10.5 — Daily check-in/check-out workflow (Week 36–37).**
The user's headline ritual. Lands AFTER reservations work
end-to-end so the QR scan has something to flip. Split into 8
sub-batches per the small-chunks discipline:
- [✓] **F10.5-a** — `seeds/242_starr_field_equipment_check_inout.sql`
      shipped. Extends `equipment_reservations` with the
      check-out columns (`checked_out_by`,
      `checked_out_to_user`, `checked_out_to_vehicle`,
      `checked_out_condition` ∈ good|fair|damaged,
      `checked_out_photo_url`), the check-in columns
      (`returned_by`, `returned_condition` ∈ good|fair|
      damaged|lost, `returned_photo_url`, `returned_notes`,
      `consumed_quantity` ≥ 0 for consumables) and the nag-
      extend audit columns (`extended_overnight_at`,
      `original_reserved_to` — captured the first time
      reserved_to is bumped via nag-extend so the trail shows
      schedule slipped vs ran long). seeds/239 already had
      `actual_checked_out_at` + `actual_returned_at` so they
      stay there. Conditional FKs for `auth.users` (3 actor
      columns) + `vehicles`. Partial indexes for the four hot
      reads: "what's in my truck right now"
      (checked_out_to_user + state), "every overdue checked-
      out row" (the 6pm/9pm nag query), damage-triage routing
      (returned_condition damaged|lost), vehicle drilldown
      (checked_out_to_vehicle). Column comments document
      §5.12.6 invariants for future readers.
- [✓] **F10.5-b** — `POST /api/admin/equipment/check-out`
      shipped. Body XOR `qr_code_id` (mobile-scanner / office-
      walk-up path) OR `reservation_id` (dispatcher walk-up
      path). When QR-mode: looks up `equipment_inventory` by
      `qr_code_id`, refuses on retired (typed `retired`),
      finds a unique held reservation overlapping `now()`,
      filters by optional `job_id` for disambiguation. Returns
      `qr_unknown` 404 / `no_matching_held_reservation` 404 /
      `ambiguous_match` 409 (with candidate list so the caller
      can pass `job_id`). When reservation_id-mode: direct row
      lookup. Both paths converge on the state-machine guard:
      must be `held`; otherwise typed 409 with `current_state`.
      Required fields: `condition` ∈ good|fair|damaged,
      `to_user` UUID. Optional: `to_vehicle`, `photo_url`.
      Photo is REQUIRED when condition ∈ damaged|fair —
      audit trail anchor for §5.12.6 + the F10.5-g
      maintenance triage. UPDATE guards on `state='held'`
      (TOCTOU); on miss, re-reads so the caller sees what beat
      them. seeds/239's AFTER-UPDATE sync trigger refreshes
      `equipment_inventory.current_reservation_id` +
      `next_available_at` automatically. Damage triage hook
      (F10.5-g) and kit-batch flow (F10.5-e) and self-service
      after-hours flag (F10.5-h) explicitly NOT in this batch
      — handler is the single-row state-flip core. Auth: admin
      / developer / equipment_manager.
- [✓] **F10.5-c** — `POST /api/admin/equipment/check-in`
      shipped. Symmetric counterpart to /check-out. Body XOR
      `qr_code_id` / `reservation_id`. State flip:
      `checked_out → returned`; refuses non-checked_out states
      with typed 409 + current_state. Required `condition` ∈
      good|fair|damaged|lost; photo_url required when
      condition ≠ 'good' (audit anchor for §5.12.6 + the
      F10.5-g triage flow). Consumables: handler reads
      `equipment_inventory.item_kind` after resolving the
      reservation; when `consumable`, requires
      `consumed_quantity` (non-negative integer); after the
      state-flip UPDATE succeeds, decrements
      `equipment_inventory.quantity_on_hand` in a separate
      best-effort UPDATE (cross-table tx isn't available
      through PostgREST). Decrement failure logs loudly +
      surfaces `stock_decrement_warning` in the response
      payload so the EM can reconcile manually; the audit
      anchor still survives. Retired-instrument check
      INTENTIONALLY skipped on the /check-in side — a retired
      unit may still have an outstanding checked_out row that
      needs to come back in; refusing on retire would block
      the cleanup. (The /check-out side DOES refuse retire,
      which is the gate that prevents new check-outs.)
      Disambiguation 409 returned when multiple checked_out
      rows match a QR — should be unreachable per seeds/239's
      EXCLUDE but defensive surface kept. Damage triage
      (`damaged`) + lost-on-site (`lost` + location_pings
      cluster) hooks NOT in this batch — F10.5-g layers them
      on top of the column persistence here. Auth: admin /
      developer / equipment_manager.
- [✓] **F10.5-d** — `POST /api/admin/equipment/extend-reservation`
      shipped. Body
      `{ reservation_id, new_reserved_to, source? }` where
      source ∈ nag|clock_out|manual (default manual). Auth
      gate: admin / equipment_manager OR the row's
      `checked_out_to_user` (so the surveyor with gear in
      their truck can action the inline 6pm/9pm nag button +
      the mobile clock-out "Keep overnight" choice via their
      own session). State guard: only `held`/`checked_out`
      are extendable; refuses 409 on returned/cancelled +
      `null state`. New `reserved_to` must be strictly after
      the current one — shrinking is a cancel-and-re-reserve
      operation, not an extend. Audit invariants: captures
      `original_reserved_to` ONLY on the first extend so the
      trail records "schedule slipped" once, never overwritten
      on subsequent extends; sets `extended_overnight_at` only
      when source ∈ nag|clock_out (deliberate overnight
      retention markers) AND not already set, so a manual
      dispatch extend after a nag-extend doesn't clobber the
      nag's audit anchor. seeds/239 GiST EXCLUDE catches
      collisions when the new window overlaps another active
      reservation for the same instrument; Postgres 23P01
      maps to typed `extend_collides` 409 with a friendly
      message ("Extending to T would overlap … pick an
      earlier end time"). UPDATE guards on
      `state IN (held, checked_out)` (TOCTOU); on miss,
      re-reads. seeds/239 sync trigger refreshes
      `equipment_inventory.next_available_at` automatically
      since the active-window changed.
- [◐] **F10.5-e** — Kit batch flow per §5.12.1.C. Split into
      two sub-batches:
  - [✓] **F10.5-e-i** — `lib/equipment/kit-resolver.ts`
        shipped. `resolveKit(parentEquipmentId, client?)`
        returns the parent inventory row + its
        `equipment_kit_items` children (sorted by sort_order
        ASC) joined with display fields (name, item_kind,
        qr_code_id) so the F10.5-e-ii caller doesn't need a
        second roundtrip. Typed errors:
        `parent_not_found` (no inventory row),
        `parent_is_not_a_kit` (inventory row exists but no
        `equipment_kits` wrapper). Companion
        `loadActiveReservationsForKit(resolved, opts)` walks
        every reservation across the parent + children at a
        target state (`held` for check-out fan-out,
        `checked_out` for check-in fan-out) with optional
        `jobIdFilter` + window bounds. Returns
        `{ parent_reservation_id, child_reservations[] }` —
        children without matching reservations stay absent
        from the array so callers handle "kit was applied
        without one of its optional children" cleanly.
        Read-only — state-flip writes stay in F10.5-e-ii so
        the route handlers own the audit-trail orchestration.
        Accepts an optional `client` for transaction-aware
        reads.
  - [◐] **F10.5-e-ii** — wire the resolver into
        `/check-out` + `/check-in`. Split into two:
    - [✓] **F10.5-e-ii-α** — `/check-out` kit-mode shipped.
          Body adds `kit_mode?: boolean` (requires
          `qr_code_id`; rejects with `reservation_id`
          400). When true: QR-resolves to the kit parent,
          calls `resolveKit` (rejects `parent_is_not_a_kit`
          / `parent_not_found`), refuses if any child is a
          consumable (`kit_has_consumable_child` 400 — kits
          in practice hold durables; consumables ride the
          single-row path until a hybrid kit lands), calls
          `loadActiveReservationsForKit(state='held',
          windowFrom=now, windowTo=now)` to find the
          parent + every matching child reservation,
          enforces a missing-required-children gate
          (`missing_required_children` 409 with the
          incomplete child list so the dispatcher knows
          what's missing), then issues a single
          `UPDATE … WHERE id IN (...) AND state='held'`
          flipping every row to `checked_out` with shared
          audit fields (one condition photo at the
          case-exterior level per §5.12.6 spec; per-child
          exception flagging is v1+ polish). Partial-flip
          detection via row-count compare returns
          `partial_kit_flip` 409 so the dispatcher refetches
          on race. seeds/239's sync trigger refreshes
          inventory derived columns for every flipped row.
          Response shape carries `mode: 'kit'` + the kit
          metadata + every flipped reservation, so callers
          render uniformly without inspecting the request.
    - [✓] **F10.5-e-ii-β** — `/check-in` kit-mode shipped.
          Symmetric to α: body adds `kit_mode?: boolean`
          (requires `qr_code_id`; refuses with
          `reservation_id` 400). Differences from morning
          path: retired-instrument gate is INTENTIONALLY
          absent (a retired unit may have an outstanding
          checked_out row that needs to come back —
          single-row spec'd this same way and the kit path
          mirrors); state filter is `checked_out` (no window
          bounds since the seeds/239 EXCLUDE guarantees one
          active row per instrument); `consumed_quantity`
          is rejected up front in kit-mode (v1 kits hold
          durables). Same gates: `parent_is_not_a_kit` 400,
          `kit_has_consumable_child` 400,
          `no_matching_kit_reservation` 404,
          `missing_required_children` 409 (when individual
          children were already returned via single-row
          check-in but the kit-mode call expected them all
          checked-out — dispatcher reconciles via
          single-row). Single condition photo + notes apply
          uniformly across parent + children;
          partial-flip detection returns 409 on race.
          Response shape mirrors α with `mode: 'kit'`
          discriminator and `previous_state: 'checked_out'`.

      F10.5-e closes out: kit composition resolver shipped
      and wired into both scan endpoints. The §5.12.1.C
      one-scan-flips-the-whole-kit promise lives end-to-end
      for durable kits.
- [◐] **F10.5-f** — End-of-day nag cron + actions. Split:
  - [✓] **F10.5-f-i** — `seeds/244_starr_field_equipment_nag_silence.sql`
        shipped. Adds `nag_silenced_until TIMESTAMPTZ` to
        `equipment_reservations` with a CHECK that silence
        windows must be in the future when set + a partial
        index for the cron's silence-aware refinement query.
        Drives the "Mark in transit" inline action on the
        6pm/9pm nag — the surveyor is driving gear back right
        now and doesn't want a 9pm nag if 6pm just fired.
        "Extend until 8am" doesn't need this column because
        F10.5-d's reserved_to bump naturally excludes the row
        from the cron's `reserved_to < now()` filter. Column
        comment documents the §5.12.6 invariant for future
        readers. Apply AFTER seeds/239.
  - [✓] **F10.5-f-ii** — `app/api/cron/equipment-overdue-nag/route.ts`
        shipped + Vercel cron config in `vercel.json` at
        `0 0,3 * * 2-6` (UTC; 6pm + 9pm CST Mon–Fri). Auth via
        `Authorization: Bearer <CRON_SECRET>` header. Runs the
        overdue query (`state='checked_out' AND reserved_to <
        now() AND (nag_silenced_until IS NULL OR
        nag_silenced_until <= now())`), batch-resolves
        `checked_out_to_user` UUIDs to emails via
        `registered_users.id` and equipment IDs to display
        names via `equipment_inventory.name`, then fans out
        per-row §5.10.4 notifications with
        `type='equipment_overdue_return'`,
        `escalation_level='high'`, source ids that the mobile
        client matches against to render the inline action
        buttons (Extend → F10.5-d, Mark in transit →
        F10.5-f-iii). Returns
        `{ sent, skipped, scanned }` so a manual debug trigger
        gets clean numbers. Skipped rows (missing email
        lookup, notify failure) log loudly but don't fail the
        tick — re-runs are idempotent. DST-aware tuning is a
        v1+ polish — the EM admin edits vercel.json if
        seasonal drift becomes annoying.
  - [✓] **F10.5-f-iii** — `POST /api/admin/equipment/silence-nag`
        shipped. Body `{ reservation_id, until? }`. Default
        `until` = next 00:00 UTC (midnight tonight); explicit
        values must be in the future and ≤ end-of-day-tomorrow
        (anything longer routes through F10.5-d /extend-
        reservation). Auth: admin / equipment_manager OR the
        row's `checked_out_to_user` (so the surveyor with the
        gear can action the inline button via their own
        session). State guard: only `checked_out` rows are
        silenceable; held/returned/cancelled return 409 with
        current_state. UPDATE guards on `state='checked_out'`
        for TOCTOU; on miss re-reads. Sets
        `nag_silenced_until`; the F10.5-f-ii cron query
        excludes silenced rows until the timestamp passes.
        Returns the updated row + `previous_silenced_until`
        for audit context.
  - [✓] **F10.5-f-iv** — `app/api/cron/equipment-overdue-digest/route.ts`
        shipped + Vercel cron entry at `0 4 * * 2-6` (10pm
        CST = 04:00 UTC). Auth via Authorization: Bearer
        CRON_SECRET (mirrors F10.5-f-ii). Same overdue query
        as the nag tick BUT INTENTIONALLY ignores
        `nag_silenced_until` — silence applies to the
        surveyor's nag, not the office's nightly bookkeeping;
        if gear hasn't physically come back, the office should
        know. Recipients: every `admin` + `equipment_manager`
        looked up via
        `registered_users.roles cs '{admin}'` +
        `roles cs '{equipment_manager}'`. Single summary
        notification per recipient (not per row): title
        carries the count (`Overdue gear — 3 unreturned` /
        `… all clear`), body lists up to 25 rows in
        `• name — holder, due <ts>` format with
        `…+N more` overflow tail. Resolves equipment names +
        holder display fields via batch lookups
        (`equipment_inventory` + `registered_users`) so the
        body has human-readable context. `escalation_level`
        downgrades to `low` on all-clear ticks so the
        notification surfaces but doesn't beep. v1+ polish:
        on-site GPS context (location_pings cluster) per the
        spec call-out, cooldown guard for manual
        re-triggers, recipient-side digest collapse.

      F10.5-f closes out: nag-tick + silence-action + daily
      digest all live. The §5.12.6 end-of-day flow runs end-
      to-end against the wire shape.
- [◐] **F10.5-g** — Damage / lost triage hooks. Split:
  - [✓] **F10.5-g-i** — `seeds/245_starr_field_maintenance_events.sql`
        shipped. Creates the §5.12.8 `maintenance_events`
        table — one row per service occurrence, current or
        historical. XOR target (`equipment_inventory_id`
        OR `vehicle_id` non-null) so vehicles flow through
        the same pipeline. `kind` enum covers calibration /
        repair / firmware_update / inspection / cleaning /
        scheduled_service / damage_triage / recall /
        software_license. `origin` enum covers
        recurring_schedule / damaged_return / manual /
        vendor_recall / cert_expiring / lost_returned —
        F10.5-g-ii uses `damaged_return`, F10.5-g-iii uses
        `lost_returned`. `state` lifecycle scheduled →
        in_progress → awaiting_parts/vendor → complete /
        cancelled / failed_qa. Vendor + in-shop fields
        (vendor_name, work_order, performed_by_user_id),
        cost tracking (cost_cents + linked_receipt_id),
        QA gate (qa_passed). Conditional FKs to
        equipment_inventory / vehicles / auth.users /
        receipts following the seeds/234+236 defensive
        pattern. Four read-path partial indexes
        (per-unit history, per-vehicle history, calendar
        scheduled query, open-work landing). updated_at
        trigger. Backfills the deferred
        `equipment_events.maintenance_event_id` FK that
        seeds/236 stubbed (ON DELETE SET NULL —
        chain-of-custody continuity). The full F10.7
        layer (maintenance_event_documents,
        maintenance_schedules, calendar UI, 3am due-date
        cron) builds on this foundation.
  - [✓] **F10.5-g-ii** — single-row damage-triage hook in
        `/check-in` shipped. When condition='damaged' lands
        on the single-row path, `triggerDamageTriage`
        helper fans out three best-effort actions
        post-success: (1) INSERT a `maintenance_events` row
        with origin='damaged_return', kind='damage_triage',
        state='scheduled', summary anchored to the
        instrument's display name, notes from the surveyor;
        (2) UPDATE
        `equipment_inventory.current_status='maintenance'`
        so the F10.3-b status check blocks future
        reservations until the EM resolves; (3) notifyMany
        every admin + equipment_manager with
        escalation_level='high', body cites actor + job +
        notes + status flip. All three are best-effort —
        the reservation update already committed, so
        failures log loudly + roll up into a
        `damage_triage_warning` string surfaced in the
        response payload alongside the inserted
        `maintenance_event_id`. The EM reconciles partials
        from the §5.12.7 dashboard. Kit-mode damage triage
        (parent kit return with damaged condition fans out
        per-child maintenance_events rows) is deferred to a
        future batch — kit-mode condition currently
        persists uniformly without triage; the single-row
        path is the dominant damage flow in practice.
  - [✓] **F10.5-g-iii** — single-row lost-on-site hook in
        `/check-in` shipped. `triggerLostTriage` helper
        mirrors the damage-triage shape with three
        differences: (1) maintenance_events insert uses
        `origin='lost_returned'`, summary "Lost on site —
        search + insurance pending"; (2)
        `equipment_inventory.current_status='lost'` (catalogue
        tags red, F10.3-b status check blocks future
        reservations); (3) recipient set adds the on-site
        crew lead — looked up from `job_team` WHERE
        `is_crew_lead=true AND state IN (proposed,confirmed)`
        — alongside the standard admin + equipment_manager
        audit list, with `escalation_level='critical'` so
        the search can start immediately. Crew-lead lookup
        is best-effort; standard recipients still get the
        notification even if the lookup fails.
        `triageWarning` + `maintenance_event_id` flow into
        the same response payload as damage-triage. GPS
        context auto-attach (location_pings cluster from the
        last 1h before clock-out) is deferred until the
        location_pings ingest pipeline lands; the immediate
        notification with the job link gets the search
        underway without it.

      F10.5-g closes out: maintenance_events table + damage
      triage + lost triage all live. The §5.12.6
      damaged/lost return paths run end-to-end against the
      wire shape. Kit-mode triage fan-out (parent kit return
      with damaged/lost condition fans out per-child
      maintenance_events rows) remains deferred — the
      single-row path covers the dominant flow in practice.
- [◐] **F10.5-h** — Clock-out gating + self-service after-
      hours. Split:
  - [✓] **F10.5-h-i** — `GET /api/admin/equipment/my-checkouts`
        shipped. Backs the §5.12.6 clock-out gating modal.
        Returns every `state='checked_out'` reservation
        owned by the authenticated session user
        (`checked_out_to_user = session.user.id`), ordered
        by `reserved_to` ASC so "due back soonest" lands
        first. Auth gate is intentionally generous — any
        authenticated user can fetch THEIR OWN list (no
        role check beyond authenticated; the query is
        keyed on `checked_out_to_user=me` so cross-user
        leakage is impossible). Enriches each row with
        `equipment_name`, `equipment_item_kind`,
        `equipment_qr_code_id` via a single batch lookup
        so the mobile modal renders names without further
        roundtrips. Computes `overdue: boolean` per row so
        the modal can flag "this is already past
        reserved_to" without client-side date-parsing
        gymnastics. Empty list returns `{ reservations:
        [] }` so the mobile clock-out flow proceeds
        without modal interruption.
  - [✓] **F10.5-h-ii** — `seeds/246_starr_field_self_checkout_flag.sql`
        + `/check-out` auth-gate update shipped. Adds
        `equipment_self_checkout BOOLEAN NOT NULL
        DEFAULT false` to `registered_users` with a partial
        index on the truthy subset. The
        `/check-out` POST loosens its forbidden gate: when
        the actor isn't admin/equipment_manager, the
        handler reads `registered_users.equipment_self_checkout`
        for the session email; when true, lets the request
        through with `selfServiceBypass=true` threaded into
        the success log on both single-row + kit paths so
        the §5.12.7 reconcile dashboard differentiates
        flag-driven check-outs from admin/EM walk-ups for
        the audit trail. Hank toggles the flag per-user via
        the existing `/admin/users` page; default-off means
        nobody is grandfathered in. Lookup-failure fallback
        keeps the gate strict (logs the failure but doesn't
        silently grant access). Per the §5.12.6
        self-service after-hours protocol.

      F10.5-h closes out: clock-out gating data source +
      self-service flag both live. **F10.5 fully shipped**
      (16 sub-batches: a + b + c + d + e-i + e-ii-α + e-ii-β
      + f-i + f-ii + f-iii + f-iv + g-i + g-ii + g-iii +
      h-i + h-ii). The §5.12.6 daily check-in/check-out
      ritual runs end-to-end: morning scan → evening scan
      → consumables decrement → kit-batch fan-out → nag
      cron + silence + digest → damage/lost triage → my-
      checkouts gate + self-service.

**F10.6 — Equipment Manager dashboards (Week 37–38).**
The §5.12.7 admin web surface that pulls everything together.
Split across the seven §5.12.7 sub-panels per the small-chunks
discipline.
- [✓] **F10.6-a** — Sidebar "Equipment" group + role-gated
      nav shipped. New `EQUIPMENT_ROLES` constant
      (admin / developer / tech_support / equipment_manager
      per §4.6) + new "Equipment" section in
      `app/admin/components/AdminSidebar.tsx` between Work
      and Research with the existing F10.1 catalogue + F10.2
      templates links. Future F10.6-b..g panels add their
      own entries as they ship; F10.7 maintenance lands its
      links here too. The equipment_manager hat now has a
      visible nav home — surveyors with just that role see
      the Equipment section and nothing else admin-wide,
      matching the §4.6 access matrix.
- [◐] **F10.6-b** — §5.12.7.1 Today landing page. Split:
  - [✓] **F10.6-b-i** — `GET /api/admin/equipment/today?date=`
        aggregator endpoint shipped. Returns the full
        Today payload — three strips + three banners — in
        one round-trip so the page UI stays thin and the
        EM mobile-parity surface (§5.12.9 home tab) can
        reuse it. Strips: `going_out` (state='held',
        reserved_from in date window), `out_now`
        (state='checked_out', sorted by reserved_to ASC,
        each row pillged on_time / at_risk / overdue with
        a 1h at-risk window before due), `returned`
        (state='returned', actual_returned_at in date
        window). Banners: `unstaffed_pto`
        (personnel_unavailability starting today),
        `low_stock_consumables` (consumables ≤ threshold
        with held reservations today), `maintenance_
        starting_today` (maintenance_events scheduled in
        the window in any open state). Display fields
        (equipment names, holder display names) resolved
        in batch lookups across all strips so per-row
        renders skip second roundtrips. Date param
        defaults to today; YYYY-MM-DD lets the EM scrub.
        Banner queries are fail-open — read errors degrade
        to empty arrays so a single banner outage doesn't
        nuke the strips. Auth: EQUIPMENT_ROLES.
  - [✓] **F10.6-b-ii** — `app/admin/equipment/today/page.tsx`
        + sidebar entry shipped. Renders the three strips
        (going_out / out_now / returned) + three banners
        (PTO red / low-stock amber / maintenance blue) from
        the F10.6-b-i aggregator. Date scrubber input
        +"Today" jumper +"Refresh" button at the top so the
        EM can move forward/back without URL editing.
        Strip B rows carry the on_time / at_risk / overdue
        pill from the server payload and the Strip B
        header surfaces an overdue count if non-zero.
        Strip C is collapsed by default (it's the
        end-of-day reconcile artefact, not the live view);
        the header shows the spec's count guard
        ("42 went out · 39 returned · 3 still out"). Per-
        row condition badges (good/fair/damaged/lost) on
        returned rows route the EM toward the §5.12.8 /
        §5.12.11 next steps. Job-id chips deep-link to
        `/admin/jobs/<id>`. OVERRIDE badge surfaces on
        rows with `is_override=true`. Sidebar entry added
        as the FIRST Equipment link (above Catalogue) since
        Today is the dispatcher's daily-driver. Inline
        styles per the rest of `/admin/equipment/*`. Auth:
        `useSession` gate; the aggregator enforces the
        EQUIPMENT_ROLES gate server-side.

      F10.6-b closes out: aggregator + page UI shipped,
      §5.12.7.1 Today landing page lives end-to-end.
- [◐] **F10.6-c** — §5.12.7.2 Reservations Gantt timeline.
      Split:
  - [✓] **F10.6-c-i** — `GET /api/admin/equipment/reservations-timeline`
        aggregator shipped. Returns every
        `equipment_reservations` row whose
        `[reserved_from, reserved_to)` overlaps the window
        (default today → today+14d), grouped into
        swimlanes per `group_by` ∈ equipment | job.
        Filter chips: `category` (pre-resolves matching
        equipment_ids; empty match short-circuits to []),
        `state` (one of held/checked_out/returned/
        cancelled), `overdue_only=1` (state='checked_out'
        AND reserved_to < now() — the "what's late RIGHT
        NOW" filter). Bars carry `equipment_name` +
        `holder_email` resolved via batch lookup so the
        F10.6-c-ii UI renders without per-row roundtrips.
        Equipment swimlane meta carries `category` +
        `item_kind` for the drilldown drawer; job swimlane
        meta carries the bare `job_id`. Stable swimlane
        ordering — alphabetical by label. Auth:
        EQUIPMENT_ROLES. Presentation-agnostic so the
        §5.12.9 mobile timeline + future
        `/admin/jobs/[id]/timeline` embed reuse the same
        payload.
  - [✓] **F10.6-c-ii** — `app/admin/equipment/timeline/page.tsx`
        + sidebar entry shipped. Read-only Gantt: 200px
        label gutter + flexible bar area per swimlane row.
        Bar `left%`/`width%` computed from the time
        window so any window size renders without per-day
        grid math; bars clip cleanly at the window edges
        (clamp 0–100). Tick row across the top with a
        date label per day. Bar colors per state — held
        light-blue, checked_out solid blue, returned grey,
        cancelled white-with-dashed-border-and-line-through.
        Override outline (`is_override=true`) renders a 2px
        amber border. Hover title carries every drilldown
        field (equipment name + state + job + window +
        holder + override flag) until the F10.6-c-iii
        drawer ships. Filter bar at top: group_by toggle
        (Equipment / Job), state dropdown, category text
        input, overdue-only checkbox. Date scrubbers + a
        "Reset to 14d" jumper for window control.
        Empty-state cleanly handles no-results-in-window.
        Sidebar 'Timeline' link added between Today and
        Catalogue. Inline styles per the rest of
        `/admin/equipment/*`.
  - [✓] **F10.6-c-iii** — drilldown drawer shipped. Click
        any bar opens a 480px right-side drawer with
        backdrop dismissal + ✕ close + escape-key
        equivalent (click-outside via backdrop). Drawer
        body shows: reservation_id (truncated, monospace),
        deep-linked job, deep-linked equipment, full
        window (from / to with locale-formatted
        timestamps), holder email, returned_condition (when
        present), notes. Header carries the bar's state as
        a colored badge (matches the Gantt color set) +
        OVERRIDE badge when `is_override=true` + the
        swimlane label for context. Footer has two action
        buttons: "Open equipment" (secondary) and "Open
        job →" (primary). Bars converted from `<div>` to
        `<button type="button">` so keyboard nav lands on
        each bar correctly. Aggregator extended to carry
        `notes` on every bar so the drawer renders
        override reasons + cancel justifications inline.
        Filter chips on the page bar already shipped in
        F10.6-c-ii so this batch focused on the drawer
        itself. Drag-resize on `held` bars (with the
        F10.5-d /extend-reservation hookup) lands as
        F10.6-c-iv.
  - [✓] **F10.6-c-iv** — drag-resize on held bars shipped.
        `state='held'` bars get a 6px right-edge handle
        (subtle gradient overlay so it's discoverable on
        hover without cluttering the read view); other
        states omit the handle. Mousedown captures the
        bar-area DOM rect + the original reserved_to;
        window-level mousemove/mouseup listeners mean the
        cursor can leave the bar mid-gesture without
        breaking the drag. Mouse-x position maps to a
        timestamp via the same `(x - rectLeft) / rectWidth
        * windowSpan` math as the static layout, snapped to
        nearest 15-minute boundary so the EM doesn't
        accidentally land on a sub-minute reserved_to.
        Mouseup commits via POST F10.5-d
        `/extend-reservation` with `source='manual'`. No-op
        guard rejects drags < 15 min from the original
        (avoids accidental "I just clicked the handle"
        network calls); backward-drag rejected pre-flight
        with a clear error toast (shrinking is a
        cancel-and-re-reserve, not an extend). Live preview
        — the bar's right edge follows the cursor during
        the drag with a Starr-blue outline so the EM sees
        the new end live before commit. Optimistic refetch
        on success refreshes the Gantt; failure surfaces
        a typed error toast (typically extend_collides
        409 from the seeds/239 GiST EXCLUDE catching an
        overlap with another active reservation). Click vs.
        drag disambiguation: handle has its own
        onMouseDown w/ stopPropagation so it never opens
        the drilldown drawer; the bar's onClick guards on
        `extending` to avoid edge-case post-drag click
        misfires.

      F10.6-c closes out: aggregator + Gantt UI + drilldown
      drawer + drag-resize all live. The §5.12.7.2
      timeline runs end-to-end.
- [◐] **F10.6-d** — §5.12.7.5 Consumables low-stock view.
      Split:
  - [✓] **F10.6-d-i** — `GET /api/admin/equipment/consumables`
        aggregator shipped. Pulls every non-retired
        `item_kind='consumable'` row + sums
        `consumed_quantity` from returned reservations in
        the trailing 30 days, joins per equipment_id to
        compute `daily_rate = consumed_30d / 30` and
        `days_remaining = quantity_on_hand / daily_rate`
        (capped at 999 to avoid surfacing "this paint will
        last 47 years" as a real number). `reorder_badge`
        tier:
          `reorder_now`   days_remaining < 7 OR
                          quantity_on_hand ≤
                          low_stock_threshold (the latter
                          wins regardless of rate so the
                          reorder floor stays a hard
                          trigger)
          `reorder_soon`  7 ≤ days_remaining < 14
          `ok`            ≥ 14 OR no signal yet
        Rows without 30-day consumption (recently added
        inventory) come back with `daily_rate=null`,
        `days_remaining=null`, `reorder_badge='ok'` so
        they don't false-positive into the reorder
        queue. Sort: days_remaining ASC; null values land
        last (alphabetical tiebreak). Summary carries
        per-tier counts so the F10.6-d-ii page header
        can show "3 reorder NOW · 5 reorder soon" without
        client-side filtering. Auth: EQUIPMENT_ROLES.
  - [✓] **F10.6-d-ii** — `app/admin/equipment/consumables/page.tsx`
        + sidebar entry shipped. Flat table consuming the
        F10.6-d-i aggregator. Filter chips at the top
        (All / Reorder NOW / Reorder soon / OK) — counts
        from the aggregator's summary block render
        client-side without a refetch on chip toggle.
        Sortable columns: Name / On hand / 30d used /
        Days left (default = days_remaining ASC). Per-row
        BadgePill (red/amber/green for the three tiers)
        + row-level background tint matching the badge so
        the reorder-now rows are visible at a glance.
        Each name links to `/admin/equipment/<id>` for
        the inventory drilldown. Days-left formatter:
        `<1` for sub-day, `999+` for cap. Sidebar
        'Consumables' link added between Timeline and
        Catalogue. Inline styles per the rest of
        `/admin/equipment/*`. Auth: useSession gate; the
        aggregator enforces EQUIPMENT_ROLES server-side.
  - [◐] **F10.6-d-iii** — Inline action modals. Split:
    - [✓] **F10.6-d-iii-α** — Restock arrived shipped.
          `POST /api/admin/equipment/[id]/restock` body
          `{ quantity_added, cost_cents?, vendor?,
          receipt_photo_url?, notes? }`. Refuses non-
          consumables (typed `not_consumable` 400) +
          retired rows (typed `retired` 409).
          Increments `quantity_on_hand` by
          `quantity_added`, stamps
          `last_restocked_at=now()`, optionally updates
          `vendor` and computes
          `cost_per_unit_cents = round(cost_cents /
          quantity_added)`. Best-effort
          `equipment_events` audit row with
          `event_type='restock'` + structured
          `notes` field carrying the full restock
          context (qty, per-unit cost, vendor, before
          → after, receipt URL, free-form notes) since
          the v1 events table has no dedicated summary/
          photo columns. Page UI: per-row "Restock"
          button opens a modal with required quantity,
          optional total-cost (auto-converts to
          per-unit), vendor (pre-filled), receipt URL,
          and notes. Submit refetches the table +
          flashes a success toast at the top of the
          rows. Auth: admin / developer /
          equipment_manager.
    - [✓] **F10.6-d-iii-β** — Update-threshold modal
          shipped. The existing PATCH
          `/api/admin/equipment/[id]` endpoint already
          validates `low_stock_threshold` (non-negative
          integer); modal just wires to it. Per-row
          "Threshold" outline button next to "Restock"
          opens the modal pre-filled with the row's
          current threshold. Live preview chip below the
          input compares `current_on_hand` vs the
          proposed value: red "row will flag Reorder
          NOW" when at-or-below, green "above this
          threshold" otherwise. Save flashes the same
          green action banner as Restock at the top of
          the rows. `0` is allowed (removes the floor
          entirely).
    - [✓] **F10.6-d-iii-γ** — Mark-discontinued modal
          shipped. Per-row red-tinted "Discontinue" button
          opens a confirm modal; required `reason` field
          (audit anchor) + optional notes; warning box
          when `current_on_hand > 0` ("count becomes
          inaccessible after discontinue"). Submit POSTs
          to the existing F10.1e-i `/equipment/[id]/retire`
          endpoint — sets `retired_at=now()`, flips
          `current_status='retired'`, writes an
          equipment_events row with
          `event_type='retired'` for the §5.12.7.3
          history tab. Discontinued row drops off the
          consumables list on the next refetch since the
          F10.6-d-i aggregator filters
          `retired_at IS NULL`. Templates pinning the
          discontinued row will surface in the F10.6-f
          §5.12.7.8 cleanup queue.

      F10.6-d closes out: aggregator + page UI + all three
      action modals shipped. The §5.12.7.5 consumables
      surface runs end-to-end.
- [◐] **F10.6-e** — §5.12.7.6 Crew calendar week heatmap.
      Split:
  - [✓] **F10.6-e-i** — `GET /api/admin/personnel/crew-calendar`
        aggregator shipped. Returns the (user × day) cell
        grid with state derivations so the F10.6-e-ii
        heatmap renders without per-cell roundtrips.
        Default window = current week's Monday → Sunday
        (UTC); `?from=YYYY-MM-DD&to=YYYY-MM-DD` lets the
        EM scrub forward/back.
        Cell-state derivation per (user, day):
          `unavailable`           any
                                  `personnel_unavailability`
                                  overlap (PTO / sick /
                                  training / doctor) — hard
                                  floor, beats every other
                                  state
          `confirmed`             ≥1 confirmed assignment,
                                  no others
          `split_shift`           ≥2 active rows on the day
                                  (any mix of proposed +
                                  confirmed)
          `proposed`              ≥1 proposed, no confirmed
          `unconfirmed_overdue`   proposed AND
                                  `now() - created_at >
                                  24h` (the spec's
                                  notification grace)
          `open`                  nothing on the day
        Internal-user filter via `registered_users.roles`
        — excludes users whose roles are entirely
        `{guest, student}`. Empty-roster short-circuits to
        `[]` so the page handles it cleanly. Each cell
        carries `primary_assignment_id` +
        `primary_unavailability_id` for the F10.6-e-iii
        drilldown drawer + assignment_count /
        unavailability_count for the split-shift badge.
        Summary block carries per-state cell counts so
        the page header shows "12 confirmed · 3 PTO · 1
        overdue" without client-side reduce. Auth:
        EQUIPMENT_ROLES.
  - [✓] **F10.6-e-ii** — `app/admin/personnel/crew-calendar/page.tsx`
        + sidebar entry shipped. Week-grid table: 200px
        sticky-left user column + 7 day columns. Each cell
        colored per the F10.6-e-i state cascade —
        `confirmed` solid Starr green, `proposed` light
        green, `split_shift` amber with "N×" tag,
        `unavailable` grey with "PTO" tag,
        `unconfirmed_overdue` red with "!" tag, `open`
        white. Header carries Prev/Next-week navigation
        + "This week" jumper + Refresh; the F10.6-e-i
        aggregator handles the date math so the page
        stays presentation-only. Summary bar at top with
        per-state counts as a colored-swatch legend so
        the EM scans "12 confirmed · 1 overdue" without
        eyeballing the grid. User column shows display
        name + email; cell tooltips give "<email> ·
        <day> · <state>" for the full audit context
        until the F10.6-e-iii drilldown drawer ships.
        Sidebar 'Crew calendar' link added between
        Timeline and Consumables. Path lives under
        `/admin/personnel/` rather than
        `/admin/equipment/` since it's a personnel-side
        view, but the sidebar groups it with Equipment
        per §5.12.7 (the EM owns crew capacity).
  - [✓] **F10.6-e-iii** — Cell drilldown drawer shipped.
        New `GET /api/admin/personnel/crew-calendar/cell?
        user_email=&day=` detail endpoint returns the
        full `job_team` rows + `personnel_unavailability`
        rows overlapping that (user × day) pair so the
        drawer renders rich context without forcing the
        page to fetch each row separately. Click any
        non-empty cell opens a 480px right-side drawer
        (mirrors the F10.6-c-iii Gantt drawer pattern):
        backdrop dismissal + ✕ close. Header shows the
        user + state badge + day. Body has two cards
        sections — Unavailability (kind, window, reason,
        is_paid, approved_by) and Assignments (job link,
        slot_role with CREW LEAD badge when applicable,
        state badge with OVERRIDE pill when override_
        reason set, window, confirmed_at / declined_at +
        decline_reason, override_reason, notes).
        `open` cells short-circuit the drawer (nothing
        to show until F10.6-e-iv adds drag-create);
        unavailability shows above assignments since
        PTO is the dominant context when both apply.
        Loading state surfaces during the fetch.
  - [✓] **F10.6-e-iv** — Drag-create new unavailability /
        assignment.
    - [✓] **F10.6-e-iv-α** — POST /api/admin/personnel/
          unavailability endpoint. Write path for the
          `personnel_unavailability` table from seeds/241.
          Validates user_email + ISO timestamps
          (`unavailable_to` strictly &gt; `unavailable_from`,
          mirroring the seeds/241 CHECK so we 400 cleanly
          instead of 23514) + kind enum (pto / sick /
          training / doctor / other) + optional reason +
          optional is_paid. Stamps `approved_by` /
          `approved_at` with the actor since admin /
          equipment_manager rows are inherently approved on
          insert; future surveyor self-serve POST will leave
          those null until the EM confirms. Auth: admin /
          equipment_manager. Returns the inserted row.
    - [✓] **F10.6-e-iv-β** — Drag-create UX + modal on the
          crew calendar grid. Mouse-down on a cell anchors the
          selection; mouse-enter on other cells in the SAME
          row extends `dragEnd` (different-row hovers are
          ignored so the EM can&apos;t accidentally PTO two
          people in one gesture). A global `mouseup` listener
          commits when the gesture spans multiple cells —
          single-cell mouseups fall through to the existing
          onClick → drilldown drawer. Visual feedback: in-drag
          cells get a 2px blue outline + light-blue fill +
          `userSelect: none` on the base cell so text doesn&apos;t
          highlight during a drag. The mouse-up commit opens a
          `<CreateUnavailabilityModal>` pre-populated with the
          user_email + day range. Modal: kind dropdown (PTO /
          sick / training / doctor / other) with auto-toggling
          is_paid (PTO defaults paid, others default unpaid),
          optional reason textarea, Save → POSTs to
          F10.6-e-iv-α with half-open `[fromIso 00:00,
          dayAfter(toIso) 00:00)` so a single-day PTO covers
          00:00–24:00 exactly like §5.12.5 reservation
          windows. Refetches the calendar on success.
- [◐] **F10.6-f** — §5.12.7.8 Templates-referencing-retired-
      gear cleanup queue. Split:
  - [✓] **F10.6-f-i** — `GET /api/admin/equipment/templates/
        cleanup-queue` aggregator shipped. Walks every
        `equipment_template_items` row pinning a specific
        `equipment_inventory_id` (category-mode rows auto-
        resolve at apply-time and aren't stale on
        retirement), filters to those whose target has
        `retired_at IS NOT NULL` (covers both F10.1e-i
        retire AND F10.6-d-iii-γ discontinue), groups by
        `template_id`, joins template header + total item
        count so the page renders "3 of 8 lines stale".
        Each stale item carries template-side fields (id,
        kind, qty, required, notes, sort_order) +
        equipment-side details (name, category,
        retired_at, retired_reason, current_status) so
        the F10.6-f-ii page UI works without per-row
        roundtrips. Sort: archived templates last (less
        urgent), most-stale-first within each bucket,
        alphabetical tiebreak. Empty short-circuits
        cleanly. Auth: EQUIPMENT_ROLES.
  - [✓] **F10.6-f-ii** — `app/admin/equipment/templates/cleanup-queue/page.tsx`
        + sidebar entry shipped. Per-template card layout
        — header with name + "N of M lines stale" + archive
        badge + "Edit template →" deep link. Body: table
        of stale items with `#` (sort_order), retired
        instrument name (deep-linked to catalogue), category,
        retired_at, retired_reason, qty, required/optional
        badge. Empty-state shows a positive "✓ Nothing to
        clean up" with copy explaining new retirements/
        discontinues will re-populate the list as they
        happen. Archived templates render with a dashed
        border + 0.85 opacity to visually de-prioritise
        without hiding them. No inline action modals —
        fixes happen via the existing F10.2e-ii edit page
        (Edit row → swap to category-of-kind OR repoint at
        a replacement specific instrument); the §5.12.3
        version-bump + snapshot audit chain runs there
        already so this page's "fix" path inherits the
        history-preservation contract for free. Footer
        suggests the canonical fix pattern (swap to
        category-of-kind to avoid retire-risk later).
        Sidebar 'Cleanup queue' link added below
        Templates.

      F10.6-f closes out: aggregator + page UI both
      shipped. The §5.12.7.8 retired-gear cleanup queue
      runs end-to-end.
- [◐] **F10.6-g** — §5.12.7.7 Override audit panel. Split:
  - [✓] **F10.6-g-i** — `GET /api/admin/equipment/overrides
        ?since=YYYY-MM-DD&type=both|equipment|personnel
        &limit=N` aggregator shipped. Unions every
        `is_override=true` row across
        `equipment_reservations` (F10.3-e soft-override) and
        `job_team` (F10.4-c soft-override) into a single
        time-sorted feed so admins review the
        "nothing-is-silent" trail in one place. Default
        since = 30 days; default type = both; default limit =
        200 (capped 1000). Per row carries `kind` discriminator,
        actor_email (resolved from
        `reserved_by → registered_users.email` for equipment;
        null on personnel side since `job_team` has no
        historical actor column — future polish: add
        `created_by`), target_label (equipment name OR
        user_email), job_id, state, reason, notes (carries
        the 'OVERRIDE: …' prefix from the insert path), and
        the row's window. Summary block reports per-kind
        counts + `truncated` flag when limit hit. Auth:
        EQUIPMENT_ROLES.
  - [✓] **F10.6-g-ii** — `app/admin/equipment/overrides/page.tsx`
        + sidebar entry shipped. Read-only audit table
        consuming the F10.6-g-i aggregator. Filter bar
        carries Since date scrubber (default 30d, "last
        30d" jumper) + Both/Equipment/Personnel toggle.
        Per-row columns: Kind (color-coded badge — amber
        for equipment, blue for personnel), When (locale
        timestamp), Actor (deep email or em-dash for
        personnel-side rows where job_team has no
        historical actor column), Target (equipment name
        deep-linked to catalogue, or user_email),
        Job (deep link), State badge (matches the rest
        of the equipment-state palette), Reason +
        secondary notes line, Window. Empty-state shows
        a positive "✓ Clean window" with copy on widening
        the since date. Truncated pill surfaces when the
        aggregator caps at limit. Footer documents the
        personnel-actor null gap + points at the future
        polish (add `created_by` to job_team).
        Sidebar 'Overrides audit' link added below
        Cleanup queue.

      F10.6-g closes out: aggregator + page UI shipped.
      The §5.12.7.7 override audit panel runs end-to-end.

      **F10.6 fully shipped** (apart from the deliberately
      deferred F10.6-e-iv drag-create on the crew calendar
      — heavier interactivity, lower payoff than the
      shipped panels). Equipment Manager dashboards cover
      the seven §5.12.7 panels: Today landing (b),
      Reservations Gantt (c), Consumables low-stock + 3
      action modals (d), Crew calendar heatmap +
      drilldown (e), Templates cleanup queue (f),
      Overrides audit (g).

**F10.7 — Maintenance + calibration (Week 38–39).**
Closes out the §5.12.8 schema started in F10.5-g-i and lights
up the recurring-schedule cron + calendar UI. Split into
sub-batches per the small-chunks discipline:
- [✓] **F10.7-a** — `seeds/247_starr_field_maintenance_documents_schedules.sql`
      shipped. Adds the two companion tables to seeds/245's
      `maintenance_events`:
      * `maintenance_event_documents` — PDF / photo
        attachments per event (calibration certs, work
        orders, parts invoices, before/after photos, QA
        reports). Storage URL via the §5.6 files-bucket
        pattern; per-event drilldown index +
        kind-+-recency index for the §5.12.11.K chain-of-
        custody sweep across all instruments.
      * `maintenance_schedules` — recurring rules with
        XOR target (specific equipment_id OR category;
        category is the dominant pattern for "every
        total station gets annual cal"). Carries
        frequency_months (CHECK > 0), lead_time_days
        (default 30), `is_hard_block` (drives §5.12.5
        reservation hard-block when due-date lapses),
        `auto_create_event` (drives the F10.7-h cron's
        pre-create vs notify-only behavior). FKs
        conditional on referenced tables per the
        seeds/234+236 defensive pattern. updated_at
        trigger reuses the seeds/245 helper.
- [✓] **F10.7-b** — `GET /api/admin/maintenance/events`
      shipped. Filters: `equipment_id` / `vehicle_id` /
      `state` / `kind` / `origin` (each gated against the
      seeds/245 + 247 enums) + `since` / `until` date
      window + `open_only=1` convenience flag (state IN
      scheduled|in_progress|awaiting_parts|awaiting_vendor)
      + `limit` (default 50, max 500). Order: scheduled_for
      ASC then created_at DESC so calendar-feed callers
      get chronological slots first + one-off rows fall
      back to recency. Joins equipment_inventory.name +
      vehicles.name + actor display fields
      (created_by_label + performed_by_label) via batch
      lookups so the F10.7-f calendar UI + F10.7-g detail
      page render without per-row roundtrips. Summary
      block carries `total` / `open_count` / per-`state` +
      per-`kind` + per-`origin` counts + `truncated` flag
      so the page header surfaces "12 open · 3 cal · 2
      repair" without client-side reduce. Auth:
      EQUIPMENT_ROLES.
- [◐] **F10.7-c** — `POST` + `PATCH` maintenance event CRUD
      + state machine. Split:
  - [✓] **F10.7-c-i** — `POST /api/admin/maintenance/events`
        shipped. Manual-create endpoint for EM-initiated rows
        (the F10.5-g damage/lost triage path inserts directly
        via the helper; the F10.7-h recurring-schedule cron
        will also POST here with origin='recurring_schedule').
        Body validates: XOR `equipment_inventory_id` /
        `vehicle_id` (pre-checked for cleaner error than the
        seeds/245 CHECK), required `kind` + `summary` (≤ 200),
        optional `origin` (default 'manual'), `state` (default
        'scheduled'), `scheduled_for`, `expected_back_at`,
        `vendor_name` / `_contact` / `_work_order`,
        `performed_by_user_id`, `cost_cents`, `linked_receipt_id`,
        `notes`. All enums gated against the seeds/245 CHECK
        sets. Stamps `created_by` from the session. Per-field
        validation extracted into reusable
        `parseOptional{Iso,Uuid,Int,String}` helpers so future
        endpoints (PATCH next) inherit the same cleanup style.
        Auth: admin / developer / equipment_manager (mutating).
  - [✓] **F10.7-c-ii** — `PATCH /api/admin/maintenance/events/
        [id]` shipped. State machine + field updates with
        explicit transition gate. Allowed transitions:
        `scheduled → in_progress | awaiting_parts |
        awaiting_vendor | complete | cancelled`;
        `in_progress → awaiting_parts | awaiting_vendor |
        complete | failed_qa | cancelled`; etc. — full
        adjacency table in the route file. `complete` and
        `cancelled` are terminal; `complete` re-opens via
        explicit `reopen=true` body flag (clears
        `completed_at` + `qa_passed` for a fresh service
        history entry on re-completion). Auto-stamps:
        `started_at = now()` on entry to `in_progress`,
        `completed_at = now()` on entry to `complete` (only
        when not explicitly set in same PATCH).
        `qa_passed=false` posted alongside `state=complete`
        auto-routes to `state=failed_qa` per §5.12.8.
        Calibration third-party gate fires on transition
        into `complete` AND `kind='calibration'`: refuses
        with typed `calibration_requires_vendor` 400 if
        vendor_name is null, OR
        `calibration_excludes_performed_by` 400 if
        performed_by is set (NIST cert needs third-party).
        Cross-checks merged state (existing + patch) so a
        multi-field PATCH that sets vendor_name and moves
        to complete in one shot lands cleanly. TOCTOU
        guard via `state` row-equality on the UPDATE; on
        miss re-reads the latest state. Validators
        extended to `Maybe<T>` shape with explicit `set`
        flag to distinguish "user passed null" (clear the
        column) from "field omitted" (leave it). No-op
        short-circuits when nothing to write.

      F10.7-c closes out: POST + PATCH cover the full
      maintenance_events CRUD surface.
- [✓] **F10.7-d** — `app/api/admin/maintenance/events/[id]/
      documents/route.ts` shipped with two handlers.
      `GET` returns every attachment for one event ordered
      newest-first with batched uploader display fields
      resolved server-side so the F10.7-g detail-page
      history tab renders without per-file roundtrips.
      `POST` records metadata for an already-uploaded
      file: validates `kind` against the seeds/247 enum
      (`calibration_cert` / `work_order` / `parts_invoice`
      / `before_photo` / `after_photo` / `qa_report` /
      `other`), `storage_url` (≤ 2000 chars), optional
      `filename` (≤ 255), `size_bytes` (non-negative int),
      `description`. Pre-validates parent event exists for
      a clean 404 (the seeds/247 FK ON DELETE CASCADE
      handles structural orphan prevention either way).
      Splits upload-bytes from upload-metadata
      intentionally — the F10.7-g UI requests a signed
      upload URL from a §5.6 file-bucket signing helper,
      uploads bytes directly to storage, then POSTs here
      with the resulting `storage_url`. Keeps streamed
      bytes off Next.js / Vercel functions (important for
      50 MB calibration PDFs). Auth: GET = EQUIPMENT_ROLES;
      POST = admin / developer / equipment_manager.
- [✓] **F10.7-e** — `GET /api/admin/maintenance/calendar`
      shipped. Returns the data the §5.12.7.4 month-grid
      page needs in one roundtrip:
      `month` window (from / to) · `days[]` one entry per
      calendar day with the events scheduled that day ·
      `upcoming[]` next-30-days events sorted ASC for the
      sidebar list · `next_due_per_equipment[]`
      schedule-driven rollup (for every
      `maintenance_schedule`, find latest completed event
      matching, project `next_due_at = last_completed_at +
      frequency_months`; category schedules fan out to
      every non-retired unit in the matching category) ·
      `summary` with per-state counts + due-in-lead-window
      tally for the page header. Filters `?month=YYYY-MM`
      (default current month), optional `equipment_id`,
      optional `kind`. Equipment names + categories
      resolved in one batch lookup across the union of
      month + upcoming events. Schedules-with-no-completed-
      event-yet treat next_due_at = now() so the EM sees
      "this never had a cal; schedule one" rather than the
      schedule disappearing. Auth: EQUIPMENT_ROLES.
      **Build-fix:** the F10.6-d-ii Update threshold
      modal hint and F10.6-g-ii overrides page subtitle
      had unescaped apostrophe + double-quote chars that
      tripped Vercel's ESLint
      `react/no-unescaped-entities` rule; replaced with
      `&apos;` / `&ldquo;` / `&rdquo;` so the build
      passes. No behavior change.
- [✓] **F10.7-f** — `app/admin/equipment/maintenance/page.tsx`
      shipped + sidebar entry. Three regions consuming the
      F10.7-e aggregator in one fetch:
      * Month grid — 7-column calendar (Sun–Sat). Leading
        empty pad cells align day-1 to the correct
        weekday. Each day cell shows the date + up to 3
        chip links + "+N more" overflow indicator. Chip
        background colors match the seven seeds/245 states
        (scheduled blue · in_progress solid Starr blue ·
        awaiting_parts/vendor amber · complete green ·
        failed_qa red · cancelled white-dashed). Click any
        chip routes to the F10.7-g detail page (queued).
      * Upcoming sidebar — next-30-days open events with
        per-row deep link, scheduled date, state chip,
        summary line.
      * Next-due table — schedule-driven rollup from the
        aggregator. Past-due rows tint red, in-lead-window
        rows tint amber. Columns: Equipment (deep link to
        catalogue), Kind, Frequency (mo), Last completed
        date or "never", Next due, Days-until.
      Header: prev/next/this-month navigation + Refresh.
      Filter bar: equipment_id text input + kind dropdown
      (passes through to aggregator). Summary bar above
      the grid surfaces "month_count · open · upcoming ·
      schedules-in-lead-window" with amber highlight when
      the lead-window count is non-zero.
      Sidebar 'Maintenance' link added between Consumables
      and Catalogue. Inline-styles per the rest of
      `/admin/equipment/*`.
- [◐] **F10.7-g** — Per-event detail page UI. Split:
  - [✓] **F10.7-g-i** — `GET /api/admin/maintenance/events/
        [id]` shipped (added to the same route file as the
        existing F10.7-c-ii PATCH). Returns the full event row
        + joined display fields (equipment + vehicle minimal
        rows; actor labels for `created_by` and
        `performed_by_user_id`) + `maintenance_event_documents`
        list with uploader labels resolved server-side. The 4
        round-trips (event read · equipment / vehicle / actor
        lookup · documents read) run in parallel via
        `Promise.all` so the page hydrates in one slow read,
        not four. Uploader display lookups for the documents
        section run as a follow-up batch since the document
        IDs aren't known until the docs read returns. Auth:
        EQUIPMENT_ROLES (read).
  - [◐] **F10.7-g-ii** — page UI. Split into 4 micro-batches:
    - [✓] **F10.7-g-ii-α** — read-only detail page shipped
          at `app/admin/equipment/maintenance/[id]/page.tsx`.
          Renders the F10.7-g-i detail payload across five
          card-style sections — Target (equipment + vehicle
          links + category / item_kind / qr_code), Schedule
          + actuals (scheduled_for / started_at /
          completed_at / expected_back_at / next_due_at),
          Vendor (name / contact / work_order /
          performed_by / cost / linked_receipt), Notes,
          Documents (table with kind badge, filename
          download link to storage_url, size, description,
          uploader, uploaded_at), Audit
          (created/updated/event_id). Header carries
          state/kind/origin badges + QA passed/failed pill
          + summary line + back-to-calendar link. Two stub
          buttons next to the header preview the future
          state-transition + edit-fields flows
          (F10.7-g-ii-β/-γ); Documents header has a stub
          Upload button for F10.7-g-ii-δ. Inline-styles per
          the rest of `/admin/equipment/*`. Auth:
          `useSession` sign-in gate; the detail endpoint
          enforces EQUIPMENT_ROLES server-side.
    - [✓] **F10.7-g-ii-β** — state-transition controls
          shipped on the detail page. New "Transition state"
          section above the read-only body renders a
          `TransitionBar` button row with one button per
          allowed next-state per the F10.7-c-ii adjacency
          table (kept in sync via the page-side
          `ADJACENCY` constant). Cancel + failed_qa buttons
          tint red; complete tints green; the rest are
          neutral. Cancelled state shows "Terminal — no
          transitions"; complete state shows a single
          "↺ Re-open" button that PATCHes with `state=
          in_progress` + `reopen=true` (the route clears
          completed_at + qa_passed automatically). Click
          any button opens `TransitionModal` — confirm
          dialog with state-specific copy + conditional
          fields:
          * Calibration → complete + no vendor_name yet
            → required vendor_name input (NIST traceability
            gate from §5.12.8). The PATCH route's
            `calibration_requires_vendor` 400 is the
            server-side fence; the modal pre-flights it.
          * Calibration → complete + performed_by_user_id
            still set → "Clear performed_by" checkbox
            (default checked) so the
            `calibration_excludes_performed_by` 400 doesn't
            surprise the EM.
          * Cancelled / failed_qa → optional notes field
            for the audit trail.
          Submit posts JSON to F10.7-c-ii PATCH with the
          right body shape; success refetches the detail
          page + flashes a green action banner. Errors
          surface inline in the modal. Auth: PATCH route
          enforces admin / equipment_manager.
    - [✓] **F10.7-g-ii-γ** — editable fields with save-to-
          PATCH integration. Inline edit-mode toggle replaces
          the read-only Schedule + Vendor + Notes sections
          with a single EditForm pre-filled from the event row.
          Editable fields: summary (≤ 200 chars, required),
          scheduled_for / started_at / completed_at /
          expected_back_at / next_due_at (datetime-local with
          a `toLocalInput` ↔ `localToIso` round-trip), vendor
          name / contact / work-order, cost (USD dollars input
          → integer cents), linked_receipt_id (UUID), notes,
          and qa_passed (tristate select: unset / true / false).
          Save diffs against the original snapshot and PATCHes
          ONLY the changed fields — the F10.7-c-ii Maybe<T>
          shape leaves omitted fields untouched, so over-
          shipping the whole form would silently overwrite
          concurrent edits. Cancel discards. On success the
          page refetches + flashes a green banner. Server-
          side guards (state machine, calibration NIST gate,
          summary length) propagate inline errors. The Edit
          button hides on cancelled events (terminal). Auth:
          PATCH route enforces admin / equipment_manager.
    - [✓] **F10.7-g-ii-δ** — documents upload modal
          (signed URL → bucket upload → POST F10.7-d
          metadata). Replaces the disabled "Upload" stub on
          the maintenance event detail page with a modal:
          file picker + kind dropdown (calibration_cert,
          work_order, parts_invoice, before_photo, after_photo,
          qa_report, other) + optional description. Three-step
          flow:
            (1) POST /api/admin/maintenance/events/[id]/documents/
                upload-url → server returns
                { signedUrl, storagePath, publicUrl } from
                supabaseAdmin.storage.createSignedUploadUrl()
                against the new MAINTENANCE_DOCUMENTS_BUCKET
                ('maintenance-documents'). Server validates
                parent event exists, filename ≤ 255, fileSize
                ≤ 50 MB, calls ensureStorageBucket() so the
                bucket auto-provisions on first use.
            (2) Client PUTs file bytes directly to signedUrl —
                bypasses the Vercel function body limit so
                50 MB calibration PDFs land cleanly.
            (3) Client POSTs metadata to F10.7-d with
                storage_url = publicUrl + filename + size_bytes
                + kind + description. Splitting upload from
                metadata-record means a network failure on PUT
                leaves no orphan DB row; a stranded storage
                object is the only risk (cheap to GC).
          On success the detail page refetches the document
          list + flashes a green "Uploaded {filename}" banner.
          Progress states (signing → uploading → recording)
          surface inline. Auth: equipment_manager / admin /
          developer (write).
- [✓] **F10.7-h** — Daily 3am cron — recurring schedule
      due-date computation + 60/30/7-day notifications +
      auto-create events.
    - [✓] **F10.7-h-i** — Schedule-tick cron + auto-create
          events. New `/api/cron/maintenance-schedule-tick`
          (Bearer CRON_SECRET, idempotent) walks every
          `maintenance_schedules` row, fans category-targeted
          schedules out to all matching `equipment_inventory`
          rows, and projects `next_due_at` per (target, kind)
          via three anchors: (1) the most-recent completed
          event's `next_due_at` if set, (2) `completed_at +
          frequency_months` months otherwise, (3) `now()` for
          never-serviced units. When `days_until ≤
          lead_time_days` AND `auto_create_event` is true AND
          no open event already covers the target+kind,
          INSERTs a new `state='scheduled'` row with
          `origin='recurring_schedule'`, `scheduled_for =
          next_due_at`, and a summary that captures the
          anchor reason. `?dry=1` returns the projected
          actions without writing. Vercel cron runs daily at
          08:00 UTC (3am CST) — early enough that the EM sees
          a populated calendar at first login. Duplicate
          suppression keys on (equipment_id, kind) with state
          ∈ {scheduled, in_progress, awaiting_parts,
          awaiting_vendor} so a rerun within the day is a
          no-op. Batched reads + single multi-row insert keep
          the cron O(N schedules + M targets), not O(N×M).
    - [✓] **F10.7-h-ii** — 60/30/7-day notification fan-out
          to admin + equipment_manager recipients. Same scan
          as h-i; the per-target loop adds a boundary check
          (`days_until ∈ {60, 30, 7}` AND no open event for
          the target+kind) and pushes into a
          `pendingNotifications` queue. After the auto-create
          insert, the queue is fanned out via `notifyMany()`:
          equipment names resolved in one batched read, body
          tuned per window (low / normal / high escalation +
          📅 / 🛠️ / ⚠️ icon + window-specific copy that nudges
          coordination at 60d, action at 30d, urgency at 7d).
          Boundary-only firing (cron runs once/day) means each
          window triggers exactly once per cycle without an
          extra dedup table. Schedules with
          `auto_create_event=false` still get notifications —
          the gate is independent of the auto-create gate.
          `?dry=1` returns the queued notifications without
          writing. Recipients are looked up via
          `roles.cs.{admin},roles.cs.{equipment_manager}`
          mirroring the equipment-overdue-digest pattern.
          Returns `{ scanned, projected, created, notified,
          skipped }`.
- [✓] **F10.7-i** — Cert-expiring auto-creation cron +
      §5.12.7.1 Today blue banner integration.
    - [✓] **F10.7-i-i** — Cert-expiring Today banner. Extends
          the §5.12.7.1 Today aggregator with a fourth banner
          driven by `equipment_inventory.next_calibration_due_at`
          (the canonical NIST-cert-expiry column from
          seeds/233). New `loadCertExpiring(nowIso)` helper
          reads every non-retired / non-lost row whose
          `next_calibration_due_at ≤ now() + 60 days`, sorted
          ASC, with `days_until` projected for the banner copy.
          The Today page's `BannerStack` splits the result into
          two visually distinct banners: **red** for overdue
          certs ("⚠ N calibration cert(s) overdue · ItemA (5d
          ago)…") since a survey with a lapsed NIST cert is
          legally suspect, and **blue** for upcoming ("🧪 N
          calibration cert(s) expiring within 60d · ItemA (in
          43d)…"). Both surface the soonest-due 3 by name with
          a `+N more` overflow. Best-effort lookup degrades to
          empty array on Postgres errors. The data flows from
          the maintenance event triggers in seeds/233 that
          maintain `next_calibration_due_at` whenever a
          calibration event lands `state='complete'`.
    - [✓] **F10.7-i-ii** — Cert-expiring auto-creation
          cron (Pass 2). Extended the F10.7-h schedule-tick
          cron with a second pass that walks
          `equipment_inventory.next_calibration_due_at`
          (≤ now() + 60 days, non-retired/lost) and
          auto-creates a `state='scheduled'` calibration event
          with `origin='cert_expiring'` for any unit NOT
          covered by a maintenance_schedules row (specific
          equipment_inventory_id OR category match). Three-
          layer dedup: (1) calibrationCovered set built from
          the loaded schedules guarantees pass 2 never
          duplicates a pass-1 action, (2) pass-1 in-memory
          queued actions are scanned defensively, (3) the
          existing event-bucket open-count check skips units
          with an already-open calibration event. The events
          query is widened to cover the union of schedule
          targets + cert units in one read so dedup is O(1)
          per unit. Insert-mapping uses `a.origin` so pass-1
          rows still get `origin='recurring_schedule'` and
          pass-2 rows get `origin='cert_expiring'` with a
          summary that flags the missing schedule. Response
          adds `cert_units_scanned` + `cert_expiring_created`
          counters for observability. Idempotent — reruns
          within the day are no-ops because each pass detects
          its own queued events.
- [✓] **F10.7-j** — QA gate on calibration completion +
      `failed_qa` red-row surfacing on the calendar.
    - [✓] **F10.7-j-i** — QA gate on calibration completion.
          Server-side: F10.7-c-ii PATCH route refuses the
          silent-null path with a typed
          `calibration_requires_qa_decision` 400 when
          transitioning a calibration event to complete with
          neither a body-supplied `qa_passed` nor a row-level
          one already set. ExistingRow now pulls `qa_passed`
          so the gate is precise — the reopen path nulls
          qa_passed (per F10.7-c-ii), forcing a fresh
          decision on next completion. UI: TransitionModal
          gains a `requiresQaDecision` flag and a paired
          green/red "QA passed / QA failed" button group
          that&apos;s required to enable the submit button.
          &ldquo;QA failed&rdquo; sends `qa_passed: false` with
          `state: complete`, which the server auto-routes to
          `failed_qa`; the submit button label flips to
          &ldquo;Move to failed_qa&rdquo; to make the
          server-side route obvious before the click. The
          calibration vendor + clear-performed-by gates from
          F10.7-g-ii-β remain alongside this — three
          orthogonal NIST-traceability checks fire as a unit.
    - [✓] **F10.7-j-ii** — failed_qa red-row surfacing on the
          calendar. Server: F10.7-e calendar aggregator gains
          a date-unfiltered `failed_qa` query (state='failed_
          qa', sorted DESC, limit 50, honors equipment +
          kind filters) so events that lapsed last month
          don&apos;t fall off the EM&apos;s radar when the
          month scrubs forward. Equipment-name resolution
          extends across the now three-array union (month +
          upcoming + failed_qa). Response gains
          `failed_qa: CalEvent[]` + `summary.failed_qa_count`.
          UI: a dedicated `<FailedQaPanel>` renders above
          the month-grid layout — only when count &gt; 0 —
          with a red-tinted card containing a 4-column
          grid (equipment / kind chip / summary / date)
          per item, each row left-bordered with a 3px red
          accent, click → detail page (where the EM can
          re-open back to in_progress). The summary bar
          gains a "N failed QA" red counter; per-event
          chips on the day grid get a 1.5px solid-red
          border on top of the existing pink fill so
          they stand out from the soft `complete` chips.
          List shows the most-recent 10 with a +N more
          overflow hint when needed.
- [✓] Receipt cross-link UI (Attach-receipt picker + Money-tab
      "Is this for equipment maintenance?" prompt).
    - [✓] Maintenance-side picker. Replaces the raw-UUID
          input on the detail page&apos;s "Linked receipt" row
          with an Attach receipt / Change button that opens
          a modal listing receipts from
          `GET /api/admin/receipts?status=approved` (default;
          status filter switches to pending / all). Free-text
          search filters client-side across vendor name /
          category / submitter email / job number / job name.
          Each row shows vendor / amount / date / status pill
          / category / job / submitter, with a "current link"
          badge on the actively-linked one. Click → PATCHes
          the maintenance event with `linked_receipt_id`;
          F10.7-c-ii&apos;s Maybe<T> shape means the rest of
          the row is untouched. A Detach button next to the
          current link sends `linked_receipt_id: null` for an
          explicit unlink. Loading + error states surface
          inline; rows over 50 trigger a "narrow your search"
          hint.
    - [✓] Money-tab "Is this for equipment maintenance?"
          prompt. Server: `/api/admin/receipts` GET endpoint
          now annotates each row with a
          `linked_maintenance_events` array — one batched
          query against `maintenance_events` keyed by
          `linked_receipt_id` for the whole returned page,
          plus a second batch for joined equipment names.
          Failures degrade to "no links" so a maintenance
          schema mismatch can&apos;t break the bookkeeper
          queue. UI: every expanded receipt row gets a blue
          🔧 panel above the workflow buttons. Already-linked
          events render as Link-wrapped grid rows
          (equipment / kind chip / state chip / summary)
          with a per-event Detach button (PATCHes
          linked_receipt_id=null + refetches). The "Link to
          maintenance event" button opens a MaintenancePicker
          modal that lists events from
          `/api/admin/maintenance/events` (open by default,
          completed togglable), free-text search across
          summary / kind / equipment / state, click → PATCH
          the event with this receipt&apos;s id. Already-
          linked events show an "already linked" badge and
          can&apos;t be re-clicked. Symmetric counterpart to
          the maintenance-side picker — same one column on
          maintenance_events carries both directions.
- [✓] Per-unit maintenance history page. Equipment drilldown
      (`/admin/equipment/[id]`) gains a "Maintenance history"
      Section between Assignment history and Notes. Server
      side: extended the F10.1 drilldown GET aggregator with a
      third parallel query — last 50 `maintenance_events` for
      this `equipment_inventory_id`, sorted by `scheduled_for`
      DESC nulls last, includes kind / origin / state /
      scheduled_for / completed_at / vendor_name / cost_cents
      / qa_passed / next_due_at / summary. Best-effort: read
      errors degrade to an empty array + warning banner. UI
      side: a 7-column table (state pill linking to detail /
      kind chip + QA-fail badge / scheduled / completed /
      vendor / cost in dollars / summary). State pills mirror
      the calendar's color scheme so a unit with a recent
      `failed_qa` event jumps out. Failed-QA rows get a
      red-tinted background + 3px left border for extra
      prominence. Click anywhere row → detail page (where the
      EM can re-open or document upload).

**F10.8 — Mobile UX polish (Week 39).**
- [✓] Pre-job loadout preview card on mobile job detail
      (§5.12.9.1). New `useJobLoadout(jobId, myUserId)`
      hook in `mobile/lib/equipment.ts` issues a single
      PowerSync useQuery that LEFT-JOINs the freshly-
      synced `equipment_reservations` to `equipment_
      inventory` and aggregates per-row stats client-side
      (totals, mine, held / checked out, override count,
      calibration overdue / due-soon counts). Companion
      `JobLoadoutCard.tsx` renders the rollup: header
      with item count, three-stat summary row (yours /
      held / checked out), red/amber/blue contextual
      banners for overdue cals, near-due cals, and EM
      overrides, then up to 8 per-item rows with the
      equipment name + QR/category + state pill +
      &ldquo;yours&rdquo; badge for rows checked out to
      the signed-in surveyor specifically. Calibration
      lapse computed client-side via Date.parse so a
      stale local cache still produces correct status
      pills. Wired into `app/(tabs)/jobs/[id]/index.tsx`
      between the Today rollup and the Client section;
      hides itself entirely when the job has zero active
      reservations.
- [✓] "What's in my truck right now" Me-tab section. New
      `useMyCheckouts(myUserId)` hook in `mobile/lib/
      equipment.ts` issues a single PowerSync useQuery
      that LEFT-JOINs `equipment_reservations` to
      `equipment_inventory` AND `jobs`, filters by
      (state='checked_out' AND checked_out_to_user = me),
      orders by reserved_to ASC so soonest-due rows
      surface first, and aggregates overdue + cal-lapsed
      counts client-side. Companion `MyTruckSection.tsx`
      renders the rollup: header "🛻 What&apos;s in my
      truck", summary row with item count + red "N
      overdue" + amber "N cal lapsed" badges, then up to
      8 per-item rows with equipment name + job number/
      name + relative due date ("in 4h" / "tomorrow" /
      "in 3d") + per-row red left-border for overdue
      items. Tap a row → navigate to job detail.
      Hides itself entirely when nothing is checked out.
      Wired into `app/(tabs)/me/index.tsx` between the
      header block and the Security section so it&apos;s
      the first actionable info a surveyor sees on the
      Me tab.
- [✓] Persistent scanner FAB when any check-out is open.
      New `mobile/lib/ScannerFab.tsx` consumes
      `useMyCheckouts(myUserId)` and renders only when the
      summary&apos;s total > 0 — the FAB hides itself when
      the surveyor has nothing out (no point pestering them
      with a scanner they don&apos;t need). When visible, it
      sits absolutely-positioned in the bottom-right above
      the tab bar (bottomInset = TAB_BAR_HEIGHT + 16) with a
      green camera glyph + a small white badge showing the
      checkout count. Tapping opens a fullscreen Modal
      hosting the F10.1j QrScanner. On scan: the decoded QR
      runs through `useEquipmentByQr` (PowerSync local
      lookup); a match that&apos;s in the surveyor&apos;s
      truck gets a "Open job to return / extend?" alert with
      Cancel / Open Job actions; a match that&apos;s not
      theirs surfaces "this isn&apos;t checked out to you,
      hand it to the EM"; an unrecognised QR shows "not in
      catalogue" and re-arms. Mounted in
      `app/(tabs)/_layout.tsx` as a sibling of the Tabs
      navigator inside a flex:1 wrapper so the FAB persists
      across every tab screen.
- [✓] 🛠 Gear tab (role-gated 6th tab) for Equipment Manager
      mobile flows (§5.12.9.2). New `useMyRoles()` /
      `useIsEquipmentManager()` hooks in `mobile/lib/myRoles.ts`
      fetch the signed-in user&apos;s `registered_users.roles`
      array via Supabase (anon key + RLS), with a 5-min in-
      memory cache so consumers don&apos;t re-fetch per render.
      Tab visibility gated in `(tabs)/_layout.tsx` — the new
      `<Tabs.Screen name="gear">` ships with
      `href: isEquipmentManager ? '/(tabs)/gear' : null` so
      non-EMs don&apos;t see it but deep links still resolve.
      The screen itself defensively re-checks the role and
      shows an "Ask an admin to add the equipment_manager
      role" empty state for non-EMs hitting it via deep link.
      Dashboard contents: four tap-able stat tiles (Open
      maintenance / Failed QA / Cert expiring 60d / Out
      today) sourced from PowerSync local SQLite count
      queries against the F10.8-projected `maintenance_
      events` + `equipment_inventory` + `equipment_
      reservations` tables. Failed QA + Cert expiring tiles
      flip red / amber when count > 0. Each tile + an
      "Open admin web" quick action deep-link to
      `EXPO_PUBLIC_ADMIN_WEB_URL` (defaulting to
      app.starrsurveying.com) for the full drilldown — mobile
      drilldowns + scan-to-checkout land in F10.8 v2.
      Footnote reminds the EM that PowerSync sync rules must
      be deployed for the counts to populate.
- [◐] Three new notification source_types
      (`equipment_assignment` / `_overdue` / `_status_change`).
    - [✓] `equipment_assignment` on check-out (single-item).
          POST /api/admin/equipment/check-out emits a notify()
          row to the receiving surveyor after the reservation
          flips to `state='checked_out'`. New helper
          `emitAssignmentNotification()` resolves the
          recipient&apos;s email + equipment name + job display
          fields in three parallel reads, then fires
          `type='equipment_assignment'` /
          `source_type='equipment_assignment'` /
          `source_id=reservation_id` so the §5.12.9 mobile
          inbox can render a &ldquo;you got X for tomorrow&apos;s
          job&rdquo; card with the right inline actions. Body
          includes the equipment name, job label, and
          reserved_to date. Best-effort: the check-out is
          committed before this runs; failures log a warning
          and continue. Kit-checkout path stays quiet at child
          rows to avoid an inbox flood — single parent
          notification will land in a follow-up.
    - [✓] `equipment_assignment` on the kit-checkout path.
          The kit batch (parent + N children flipped to
          checked_out in one PostgREST UPDATE) now fires ONE
          notification at the parent reservation rather than
          N+1 child entries flooding the surveyor&apos;s inbox.
          The shared `emitAssignmentNotification()` helper
          gains an optional `kit: { parentName, childCount }`
          arg; when set, the body copy reads
          &ldquo;GPS-2024 kit (8 items) is yours…&rdquo;
          instead of the single-item form. Equipment-name
          lookup short-circuits via the resolved kit context
          so the helper still does only three batched reads.
    - [✓] `equipment_status_change` when the EM flips
          `current_status`. PATCH /api/admin/equipment/[id]
          now reads the row&apos;s old current_status before
          the update (skipped when the body doesn&apos;t touch
          current_status, so common edits don&apos;t pay the
          cost), then post-update fires
          `equipment_status_change` notifications. Two
          flip-classes trigger:
            * **Disrupting** (any → maintenance / lost /
              retired): high-escalation alert — &ldquo;X
              active reservation(s) may need to be rebooked.&rdquo;
            * **Restoring** (maintenance / lost / retired →
              available / in_use): normal escalation — &ldquo;X
              active reservation(s) can proceed as planned.&rdquo;
          Affected reservation set = state ∈ {held,
          checked_out} AND reserved_to ≥ now(). Recipients =
          union of (checked_out_to_user, reservation creator).
          UUIDs resolved to emails in one batched read; sent
          via `notifyMany` for a single PostgREST insert.
          Best-effort: failures log + continue. Cosmetic
          flips (in_use ↔ loaned_out) don&apos;t fan out.
    - [ ] `equipment_overdue` source_type rename / unify with
          the existing `equipment_overdue_return` +
          `equipment_overdue_digest` types.
- [✓] PowerSync sync rules per §5.12.9.3. Mobile
      `lib/db/schema.ts` gains three new Tables —
      `equipment_reservations`, `maintenance_events`,
      `personnel_unavailability` — registered in
      AppSchema alphabetically. Each Table mirrors the
      seeds/239 / 245 / 241 columns relevant to the
      §5.12.9 mobile flows (loadout preview, "what's in
      my truck", Me-tab PTO list, Gear tab dashboard).
      `mobile/lib/db/sync-rules.yaml` ships the canonical
      bucket definitions (six buckets total — equipment_
      inventory + two reservation buckets + two
      maintenance buckets + two unavailability buckets)
      to paste into the PowerSync Cloud editor (or
      commit alongside a self-hosted powersync.yaml).
      Buckets scope by signed-in user so a single device
      doesn&apos;t pull the company-wide ledger:
      reservations match (checked_out_to_user = me) OR
      (job_team membership), maintenance matches my
      checked-out gear OR equipment_manager role, PTO
      matches my email OR equipment_manager role. README
      updated with the new file. Mobile UI components
      that consume these tables (LoadoutCard, "what's
      in my truck", Gear tab) ship as separate batches.
- [◐] Surveyor self-service paths — borrowed-from-other-crew
      event log, personal-kit flag.
    - [✓] **Borrow audit endpoint (write path).** New
          `POST /api/admin/equipment/borrow-from-other-crew`
          inserts ONE `equipment_events` row with
          `event_type='borrowed_during_field_work'` (per the
          seeds/236 canonical enum) so the chain-of-custody
          stays preserved when a surveyor scans gear that
          isn&apos;t on their reservation list. The
          reservation row stays untouched — the EM
          reconciles manually using this audit trail. Body
          accepts equipment_id + current_job_id (required
          UUIDs) + borrowed_from_user_id + borrowed_from_job_
          id + notes (all optional). Auth: any signed-in user
          (the whole point of self-service is the EM
          isn&apos;t in the loop in real time). Payload
          captures the borrow context for the EM&apos;s later
          reconciliation without chasing other tables.
    - [✓] **Borrow audit endpoint — equipment-retired guard.**
          Single `select('id, retired_at')` maybeSingle()
          before the audit insert. Returns 404 when the
          equipment_id doesn&apos;t resolve, 409 with
          `code: 'retired'` when `retired_at IS NOT NULL`
          ("Ask the EM to restore it first"). Keeps the
          audit log clean of "borrow against retired" rows
          the EM would have to chase later.
    - [✓] **Borrow audit endpoint — notification fan-out.**
          New `resolveBorrowRecipients()` helper unions (job_
          team rows where `is_crew_lead=true` for current
          and origin jobs, when borrowed_from_job_id is set)
          + (admin / equipment_manager broadcast via
          `roles.cs.{admin},roles.cs.{equipment_manager}`),
          deduped through a Set. Notify body resolves friendly
          job labels via two parallel `jobs` lookups. Sent
          via `notifyMany` for a single PostgREST insert with
          `type='equipment_borrowed_in'` /
          `source_type='equipment_event'` /
          `source_id=<event_id>`. Best-effort: failures log
          and continue — the audit row IS the source of
          truth, not the inbox. Response now includes a
          `notified` count for the mobile UI to show "logged
          + N people notified."
    - [✓] **Mobile ScannerFab borrow CTA.** When the scanner
          resolves a QR that&apos;s NOT in the surveyor&apos;s
          truck, the alert now branches: if the surveyor is
          on the clock with a specific job (`useActiveTime
          Entry().active.job_id`), the alert offers a
          &ldquo;Borrow&rdquo; button alongside Cancel; when
          off the clock OR on overhead time the original
          &ldquo;hand to EM&rdquo; fallback stands (no job
          to attribute the borrow to). Tapping Borrow inserts
          a `borrowed_during_field_work` row directly into
          `equipment_events` via Supabase (mobile uses
          Supabase auth, not NextAuth, so it can&apos;t hit
          the admin endpoint shipped earlier). On success a
          &ldquo;Borrow logged&rdquo; confirmation surfaces,
          on failure the error bubbles up via logError
          + a friendly fallback. Notification fan-out from
          the mobile path lands via the Postgres trigger
          shipped in seeds/248 (see below) — the admin
          endpoint&apos;s notify code remains for the web
          reconciliation path.
    - [✓] **Borrow notification trigger (seeds/248).**
          Postgres `notify_mobile_borrow_event()` function
          + AFTER INSERT trigger on equipment_events. Fires
          ONLY when (event_type='borrowed_during_field_
          work' AND payload.source='mobile_scanner_fab') so
          we don&apos;t double-fire alongside the admin
          endpoint&apos;s own notifyMany. Inserts one
          notification per recipient (current job&apos;s
          crew leads + origin job&apos;s crew leads when
          payload.borrowed_from_job_id is set + admin /
          equipment_manager broadcast, deduped via
          DISTINCT). Body resolves equipment + job display
          fields with fallbacks for missing joins. SECURITY
          DEFINER so the trigger runs with elevated rights
          — mobile&apos;s authenticated role can&apos;t
          read registered_users / job_team directly.
          Closes the mobile-borrow notification parity gap
          with the admin endpoint.
    - [✓] **Personal-kit flag.** Mobile Me-tab section for
          the surveyor to mark their own brought-from-home
          tools (`equipment_inventory.is_personal=true` +
          `owner_user_id`). Already in seeds/233; needs UI.
        - [✓] **Read-only Me-tab section.** New
              `useMyPersonalKit(myUserId)` hook in
              `mobile/lib/equipment.ts` queries
              `equipment_inventory WHERE is_personal=1 AND
              owner_user_id=me AND retired_at IS NULL`.
              Companion `MyPersonalKitSection.tsx` lists up
              to 8 items per row (name + qr/category +
              brand/model). Hides itself when zero items.
              Wired into `app/(tabs)/me/index.tsx` between
              the truck section and Security so the surveyor
              can confirm their personal kit list at a glance.
        - [✓] **Claim / release flow.** Surveyor-side action
              to mark an existing inventory row as personal
              (claims) or unmark (releases). Edits
              is_personal + owner_user_id; logs an
              equipment_events row.
            - [✓] **Release.** Each row in the personal-kit
                  Me-tab section gets a Release button.
                  Tap → confirmation Alert
                  ("Release X from your personal kit? It
                  returns to the company catalogue and the
                  EM can manage it again.") → on confirm,
                  the mobile updates `equipment_inventory`
                  via Supabase (`is_personal=false`,
                  `owner_user_id=null`) + writes an
                  `equipment_events` row with
                  `event_type='updated'` + `payload.change=
                  'personal_kit_released'`. Best-effort
                  audit: a non-fatal failure logs to Sentry
                  but doesn&apos;t bubble. PowerSync sync
                  picks up the row update + the local list
                  drops the released item on the next tick.
            - [✓] **Claim.** Mobile ScannerFab CTA on the
                  not-yours branch. Buttons stack
                  dynamically: Cancel always; Borrow when
                  the surveyor is on the clock against a
                  job; Claim as personal when the row
                  isn&apos;t already someone&apos;s personal
                  kit (`row.is_personal === 0`). When the
                  scanned row IS already someone else&apos;s
                  personal kit (`row.is_personal === 1`),
                  the alert short-circuits to a
                  &ldquo;hand it back to them&rdquo;
                  message. `submitClaim()` updates
                  `equipment_inventory` (is_personal=true,
                  owner_user_id=me) + best-effort audit
                  via equipment_events.event_type='updated'
                  + payload.change='personal_kit_claimed'.
                  PowerSync re-projects the row so
                  MyPersonalKitSection picks it up on the
                  next tick.
        - [✓] **Admin EM-dashboard filter.** Exclude
              is_personal=true rows from the EM Today
              rollup, calendar, maintenance pages, and the
              cert-expiring banner so personal axes
              don&apos;t balloon the EM&apos;s open-work count.
            - [✓] **Cert-expiring banner filter.**
                  `loadCertExpiring()` in
                  `/api/admin/equipment/today` adds
                  `.eq('is_personal', false)` so the EM&apos;s
                  cert-expiring banner doesn&apos;t flag a
                  surveyor&apos;s personal axe whose
                  &ldquo;cal&rdquo; is just a sticker.
                  Mirrors the seeds/233 tax-summary filter
                  predicate.
            - [◐] **Maintenance rollups filter.** Exclude
                  personal-kit rows from
                  `loadMaintenanceStartingToday()` and the
                  `/api/admin/maintenance/calendar` event
                  queries.
                - [✓] **Today maintenance banner.** New
                      `loadPersonalEquipmentIds()` helper
                      reads every `is_personal=true`
                      equipment_inventory id once per
                      request. The Today aggregator passes
                      the resulting Set into
                      `loadMaintenanceStartingToday()`,
                      which post-filters the PostgREST
                      result so personal-kit events
                      don&apos;t leak into the EM&apos;s
                      Today banner. Same Set will fan into
                      the calendar + low-stock filters in
                      follow-up slices.
                - [✓] **/admin/maintenance/calendar.**
                      Same Set filter applied to the
                      calendar aggregator&apos;s month +
                      upcoming + failed_qa lists between
                      the enrich step and the response. A
                      `filterPersonal()` generic strips
                      rows whose `equipment_inventory_id`
                      is in the personal-kit Set. Day
                      buckets, summary counts, and the
                      response payload all consume the
                      filtered lists so personal-kit
                      events disappear consistently from
                      every surface the §5.12.7.4 calendar
                      page renders.
            - [✓] **Low-stock filter.** `loadLowStock
                  Consumables()` adds `.eq('is_personal',
                  false)` so a surveyor&apos;s personal
                  supplies (their own can of WD-40)
                  don&apos;t hit the EM low-stock alert.
                  Belt-and-suspenders alongside the
                  §5.12.9.4 rule that personal kit
                  isn&apos;t consumables in the first place.

**F10.9 — Tax + depreciation tie-in (Week 40).**
Closes the Batch QQ loop — lands at the END of F10 so the
inventory + maintenance ledgers are mature before the tax
side reads them.
- [✓] Tax-tie-in schema (was planned as `seeds/237`; lands
      as 249 + 250 since 237 is taken by templates).
    - [✓] **seeds/249_starr_field_equipment_tax_columns.sql.**
          ALTER TABLE adds the §5.12.10 tax + disposal
          columns to `equipment_inventory`
          (`linked_acquisition_receipt_id` FK to receipts,
          `depreciation_method` TEXT enum default
          'straight_line', `disposed_at`,
          `disposal_proceeds_cents`, `disposal_kind` TEXT
          enum, `tax_year_locked_through`) plus
          `receipts.promoted_to_equipment_id` FK back to
          equipment_inventory. CHECK constraints + FKs
          guarded by DO blocks for idempotent re-apply.
          Two indexes: linked_acquisition_receipt_id
          partial (powers the receipt-promotion modal&apos;s
          prior-promotion check) and (depreciation_method,
          placed_in_service_at) partial WHERE disposed_at
          IS NULL AND retired_at IS NULL (powers the
          §5.12.7.7 fleet valuation rollup). Receipts side
          gains an unpromoted partial index for the Batch
          QQ tax-summary `WHERE promoted_to_equipment_id IS
          NULL` filter.
    - [✓] **seeds/250_starr_field_equipment_tax_elections.sql.**
          New `equipment_tax_elections` table. Per-asset
          per-year frozen depreciation snapshot — the
          §5.12.10 lock-year ritual writes one row per
          active asset per tax year, freezing the
          depreciation_method, the per-year amount, and
          the running accumulated total. Once locked_at
          is set the row is treated as immutable by the
          application so Schedule C numbers stay
          reproducible audit-side. Columns: equipment_id
          (FK CASCADE), tax_year (INT &gt;= 2000),
          depreciation_method (TEXT enum mirroring
          equipment_inventory&apos;s), depreciation_amount_
          cents (BIGINT &gt;= 0), accumulated_depreciation_
          cents, basis_cents (snapshot of acquired_cost
          at lock time so later edits don&apos;t
          retroactively change locked years), locked_at,
          locked_by, notes. UNIQUE (equipment_id,
          tax_year) prevents double-lock duplicates. Two
          read-path indexes: (tax_year DESC, locked_at)
          for the Schedule C generator + (equipment_id,
          tax_year DESC) for the Asset Detail per-row
          drilldown. updated_at trigger mirrors the rest
          of the F10.x table conventions.
- [✓] Receipt-promotion modal on bookkeeper approval
      (§5.12.10 acquisition path).
    - [✓] **Server endpoint
          (POST /api/admin/equipment/promote-from-receipt).**
          Validates the receipt exists, is in
          approved/exported state, isn&apos;t already
          promoted, and has a non-zero total_cents.
          Creates an `equipment_inventory` row carrying
          `acquired_cost_cents = receipt.total_cents`,
          `acquired_at = receipt.transaction_at ??
          created_at`, and `linked_acquisition_receipt_id
          = receipt.id`. Caller can pin name + category +
          item_kind + useful_life_months +
          depreciation_method + placed_in_service_at +
          notes. After insert, updates
          `receipts.promoted_to_equipment_id` to point at
          the new asset; if that update fails, deletes
          the freshly-inserted asset so a half-promoted
          row doesn&apos;t survive (compensating-
          transaction pattern since PostgREST doesn&apos;t
          expose real transactions to the worker). Auth:
          admin / equipment_manager.
    - [ ] **Threshold detection.** Reads
          EQUIPMENT_RECEIPT_THRESHOLD_CENTS from
          app_settings ($250000 default) so the bookkeeper
          UI knows when to offer the modal. Capability
          stub for v1; the modal can be opened manually
          for any receipt regardless of threshold.
    - [✓] **Bookkeeper UI integration.** Expanded receipt
          row gets a yellow `<PromoteToAssetPanel>` between
          the maintenance link panel and the workflow
          buttons — only when `category='equipment'`. Three
          states render:
            * Already promoted → "🏛 Promoted to capital
              asset" badge + "View asset →" link to
              `/admin/equipment/<id>` so the bookkeeper can
              jump to the depreciation ledger.
            * Approved/exported but unpromoted → "Promote
              to asset" button → opens
              `<PromoteToAssetModal>` with form fields
              (name defaults to vendor_name; category;
              item_kind dropdown; depreciation_method
              dropdown; useful_life_months optional;
              placed_in_service_at defaults to
              transaction_at; notes). Submit POSTs to the
              F10.9 endpoint and refreshes the list on
              success.
            * Pending/rejected → button greyed out with
              hint "Approve the receipt first."
          Receipts list endpoint already returns
          `promoted_to_equipment_id` via the existing
          `select('*')` clause, so no aggregator change
          needed. Threshold detection ($2500 default from
          spec) still pending — for now any equipment
          receipt can be promoted manually.
- [✓] Section 179 / MACRS algorithm + Pub 946 constants
      table.
    - [✓] **Pure-function library
          (lib/equipment/depreciation.ts).** Ships
          `computeDepreciationSchedule(asset)` returning
          the full year-by-year schedule for an asset, plus
          `depreciationForYear(asset, year)` for the
          single-row lookup the lock-year ritual + tax-
          summary endpoint need. Six method branches:
          section_179 (full expense year 1, capped from the
          §179 cap table; remaining basis goes through
          MACRS-5 — the standard hybrid path), straight_
          line (half-year convention; year 1 + final year
          get half a year, middle years a full year; final
          year absorbs rounding so totals reconcile),
          macrs_5yr + macrs_7yr (Pub 946 Table A-1 half-
          year percentages, 6-year and 8-year stubs), bonus_
          first_year (TCJA phase-out: 2017-22=100%, 2023=80%,
          2024=60%, 2025=40%, 2026=20%, 2027+=0%; remaining
          basis goes through MACRS-5; falls back to MACRS-5
          with an audit note when phased out), none. Pub
          946 constants tabulated by year (§179 cap +
          bonus phase-out) so historical re-runs reproduce
          original Schedule C numbers. Floor-on-intermediate
          + remainder-on-last rounding strategy means every
          schedule sums exactly to acquired_cost_cents to
          the penny.
    - [✓] **Lock-year worker
          (POST /api/admin/equipment/lock-tax-year).**
          Walks every active depreciable asset, computes
          its depreciation for the requested tax year via
          `computeDepreciationSchedule`, and writes one
          `equipment_tax_elections` row per asset with
          `locked_at` + `locked_by` stamps set. After the
          insert, bumps each asset&apos;s
          `tax_year_locked_through` so future PATCHes to
          depreciation_method don&apos;t retroactively
          change a frozen Schedule C. Auth: admin only —
          highest-stakes bookkeeper operation. Body
          accepts `tax_year` (required, 2000-2100) +
          `dry_run` (returns the would-be inserts without
          writing — drives the §5.12.7.7 fleet page&apos;s
          preview-lock button). Idempotent via UPSERT
          with `ignoreDuplicates: true` on the seeds/250
          UNIQUE (equipment_id, tax_year) constraint, so
          a re-run for the same year is a no-op rather
          than 23505. Refuses future-year locks
          (`code: 'future_year'`). Mixed-source
          accumulated depreciation reconciliation — sums
          locked prior years + live-computed prior years
          + this year — keeps the numbers correct even
          when a fleet straddles multiple lock cycles.
    - [✓] **Inline rollup endpoint
          (GET /api/admin/equipment/depreciation-rollup).**
          Walks every active depreciable asset (not retired,
          not disposed, depreciation_method ≠ 'none',
          acquired_cost_cents &gt; 0) and returns the per-row
          schedule for `?tax_year=YYYY` (defaults to current
          year). Sources from `equipment_tax_elections` when
          the year is locked (year ≤ asset.tax_year_locked_
          through); falls back to the on-the-fly
          `computeDepreciationSchedule` library when it
          isn&apos;t. Per-asset row carries the year&apos;s
          amount + basis + remaining + accumulated-through-
          year, with `is_locked` flag for UI affordances.
          Bottom-line aggregate sums all four columns. One
          batched `equipment_tax_elections` read keyed by
          (equipment_id IN ..., tax_year ≤ taxYear) covers
          the whole page; mixed-source accumulation handles
          assets that are partially locked. Auth: admin /
          bookkeeper / equipment_manager.
- [✓] §5.12.7.7 Fleet valuation page. New
      `/admin/equipment/fleet-valuation` consumes the
      F10.9 rollup endpoint for the per-asset table:
      asset name (links to drilldown) + category +
      method chip + placed-in-service date + cost basis
      + this-year amount (bold) + accumulated +
      remaining + locked/live state pill. Year selector
      defaults to current year + Refresh button. Bottom
      summary bar with five tiles (active assets count,
      this-year depreciation in accent color, accumulated,
      remaining basis, original basis muted). Footer row
      sums the table cleanly. Admin-only "Lock {year}"
      button opens a confirmation modal that previews via
      `dry_run=true` first (shows projected count + total
      dollars + skipped count); confirm POSTs the live
      lock + refreshes the rollup. Wired into the Equipment
      sidebar group with 🏛 icon. Auth: EQUIPMENT_ROLES
      for read; admin-only for the lock ritual (defensive
      gate already on the lock-tax-year endpoint).
- [ ] "Lock equipment depreciation" button on
      `/admin/finances` (mirrors Batch QQ mark-exported).
- [✓] Tax summary endpoint extension — adds `equipment`
      block alongside `receipts` + `mileage`; reads frozen
      `equipment_tax_elections` for locked years.
      `/api/admin/finances/tax-summary` gains
      `equipment: { tax_year, total_depreciation_cents,
      asset_count, by_method, by_status: { locked, live } }`
      from a new `loadEquipmentBlock(taxYear)` helper.
      Walks every active depreciable asset (same predicate
      as the rollup + lock worker), reads
      `equipment_tax_elections` rows for the year (single
      batched query), and falls back to live
      `depreciationForYear()` for unlocked assets. The
      block&apos;s total folds into `totals.deductible_
      cents` so Schedule C Line 13 reconciles. **Anti-
      double-count guard:** the receipts query also gains
      `is('promoted_to_equipment_id', null)` so receipts
      that were promoted to capital assets don&apos;t
      double-count — their dollars land on the
      depreciation ledger via the equipment block instead.
- [ ] Asset Detail Schedule PDF + CSV export.
- [◐] Disposal flow (`POST /api/admin/equipment/dispose`)
      with kind branches.
    - [✓] **Server endpoint
          (POST /api/admin/equipment/dispose).**
          Body: equipment_id (UUID, required) +
          disposal_kind (sold / traded / scrapped / lost /
          stolen / donated, required) +
          disposal_proceeds_cents (required for sold /
          traded; optional otherwise) +
          disposed_at (defaults today) + notes. Updates
          equipment_inventory: disposed_at,
          disposal_proceeds_cents, disposal_kind,
          retired_at (defaults to now if not already set),
          retired_reason (composed from kind + proceeds +
          notes), current_status='retired'. Race-guarded
          via `.is('disposed_at', null)` on the UPDATE
          (refuses 409 when another writer beat us).
          Writes an `equipment_events` audit row with
          `event_type='retired'` + payload.disposal_kind /
          proceeds / actor_email so the chain-of-custody
          preserves the reason. §179 / MACRS recapture
          rules NOT computed here — bookkeeper reviews the
          Asset Detail Schedule manually for v1; recapture
          worker is post-F10.9 polish. Auth: admin /
          equipment_manager.
    - [ ] **Asset Detail Schedule PDF + CSV export.**
          Endpoint that emits the IRS Schedule C-shaped
          asset listing for a tax year (one row per
          asset: cost basis, accumulated depreciation,
          this-year amount, disposal info). PDF + CSV
          formats; hits the lock-tax-year worker first to
          freeze the year on demand if needed.

**Exit (Week 40):** A surveyor walks to the gear cage at
6:30am. Equipment Manager scans a kit QR. The kit + its
seven children flip to checked-out, the surveyor confirms
condition with a photo, and the truck rolls 90 seconds
later. At 6pm the surveyor gets a return-reminder push,
walks back to the cage, scans the same kit. Damage = next
morning's maintenance triage. Lost = a packet for the
insurance claim. End of year, the bookkeeper hits "Lock
depreciation" on `/admin/finances` and the Schedule C
flows through to the CPA without re-keying anything. **The
user's full directive — track everything, keep crews
supplied, no double-counting on taxes — closes.**

**Edge-case polish (post-F10).** Per §5.12.11 closing note,
edge cases ship as priority-ordered polish batches AFTER
F10 backbone is stable in real operation. Suggested order:
F (calibration override) → C (theft / disaster) → E
(reorder workflow) → A/B (borrow / lend) → D (multi-office)
→ I (software licenses) → G (personal kit polish) → J
(overnight) → K (litigation hold) → H (bulk import already
landed in F10.1) → L (counterfeit DB).

**Activation gates** (apply in order before exposing any
F10 admin/mobile route). Updated to reflect the F10.0 split +
the seeds/238 polish add (per the user's "image / condition /
team-history" follow-up):
1. `seeds/233` — equipment_inventory v2 ✅ shipped
2. `seeds/234` — job_equipment FK ✅ shipped
3. `seeds/235` — equipment_kits + items ✅ shipped
4. `seeds/236` — equipment_events audit log ✅ shipped
5. `seeds/237` — equipment_templates + items + versions ✅ shipped
6. `seeds/238` — equipment richer metadata (photo_url +
   condition enum + condition_updated_at + needs-attention
   partial idx) ✅ shipped — addresses the "image / condition"
   gap in seeds/233; team-assignment history is already in
   `job_equipment` (no schema change, surfaced when the
   inventory drilldown lands)
7. `seeds/239` — reservations (queued for F10.3, was 238)
8. `seeds/240` — personnel skills + unavailability (queued for F10.4, was 239)
9. `seeds/241` — maintenance (queued for F10.7, was 240)
10. `seeds/242` — tax tie-in (queued for F10.9, was 241)
11. `seeds/243` — equipment-photos storage bucket policy
    ✅ shipped — companion to seeds/238 photo_url. Bucket
    `starr-field-equipment-photos` (private, 10 MB cap, image
    MIME types). Shop-wide read for any authenticated user;
    writes via service_role only (catalogue stays curated).
    Path convention: `{equipment_id}/{filename}.{ext}` so
    multiple photos per unit can land without schema change.

Operator action: apply seeds/233-238 to live Supabase before
the F10.1 admin UI is exercised; apply seeds/243 alongside the
upcoming photo-upload endpoint. Subsequent seeds (239-242) gate
their respective F10.3-F10.9 sub-phases.

---

## 9.w — Inventory snapshot (state-of-the-build)

*Audited at commit `f2917de` against the actual filesystem, then
incrementally updated through commit `ded0b67` (Phase F10.0e —
closes the equipment + supplies schema foundation).* Plan claims
throughout this document are spot-verified — the lists below are
the reconciled truth, not a re-statement of the per-phase
checkboxes. Update this section every time a Batch lands.

### A. Shipped & verified in code

**Mobile (Expo / `mobile/`):**
- All five tabs wired (Jobs / Capture FAB / Time / Money / Me) with
  nested stacks. Tab + drilldown screens listed in §9.y matrix.
- Auth + biometric (Supabase Auth, Apple Sign-In, magic link, idle
  re-prompt) — `lib/auth.tsx`, `lib/biometric.ts`, `lib/lockState.ts`.
- PowerSync DB layer — `lib/db/{schema,connector,index}.tsx` with 14
  tables incl. local-only `pending_uploads` queue.
- Offline-first capture pipeline — `lib/uploadQueue.ts` (durable
  retry, backoff, stuck-uploads triage at `(tabs)/me/uploads.tsx`),
  applied to receipts / photos / voice / video / files / notes.
- Camera + voice + video + files + notes capture surfaces
  (Batches I, K, L, O — confirmed all `lib/*.ts` modules + `(tabs)`
  screens present).
- Photo annotation (Batch O) — `lib/PhotoAnnotator.tsx`,
  `lib/photoAnnotation.ts`, originals never modified, web admin
  renders via shared `lib/photoAnnotationRenderer.ts`.
- Background GPS + battery-aware tiers + boundary pings (Batch C).
- Tracking-consent modal (Batch P) — `lib/TrackingConsentModal.tsx`
  + `lib/trackingConsent.ts`.
- Vehicle picker on clock-in + `is_driver` toggle (Batch M).
- Mobile timeline reader on `(tabs)/me/privacy.tsx` (Batch N) —
  stops + segments + summary stats.
- Notification inbox + dispatcher → user pings (Batch B).
- Submit-for-approval bridge (Batch E) — `DailyLogStatus` enum
  unifies web + mobile.
- Responsive primitives (`lib/responsive.ts`) applied to four main
  tab screens.

**Web admin (`app/admin/`):**
- `/admin/field-data` (list) + `/admin/field-data/[id]` (detail with
  photo lightbox + annotation overlay + notes + files + voice
  transcripts + video player).
- `/admin/jobs/[id]/field` (per-job consolidated view, Batches S+T).
- `/admin/timeline` (stops/segments + Recompute + "Set as job site"
  geofence capture, Batches J+Q).
- `/admin/mileage` (per-user + per-vehicle subtotals + IRS-grade
  CSV, Batches G+P).
- `/admin/vehicles` (CRUD + soft-archive, Batch M).
- `/admin/team` (last-seen + battery + drill-downs, Batch B+G).

**Admin APIs (`app/api/admin/`):** `field-data`, `field-data/[id]`,
`jobs/[id]/field-data`, `jobs/[id]/field-data/manifest` (CSV with
uploader columns), `jobs/[id]/field-data/zip` (server-streamed ZIP),
`jobs/[id]/geofence`, `timeline` (GET+POST), `mileage`, `vehicles`
(CRUD), `team`, `team/[email]/today` (per-user drilldown
aggregator, Batch X), `notifications`, `time-logs/*`,
`receipts/*` (incl. `bulk-approve`, Batch JJ; `?include_deleted=1`
for tombstones, Batch FF), `finances/tax-summary`
(JSON+CSV Schedule-C report w/ status split, Batch QQ),
`finances/mark-exported` (period-lock action, Batch QQ),
**`equipment` (Phase F10.1a GET catalogue; F10.1c-i POST create
w/ enum + integer guards + 409 on qr_code_id collision; F10.1d-i
`PATCH [id]` inline-edit + `GET [id]` drilldown read endpoint
w/ joined assignment history (last 50 from job_equipment + jobs)
+ 1h signed photo URL + `/admin/equipment/[id]` drilldown page
(photo + status/condition pills + cost basis + calibration
+ consumable accounting + assignment history table w/ job
links + open/returned indicator + back link; per-row "View"
button on the catalogue) — surfaces "what team has been assigned
to" per the user's follow-up directive; F10.1e-i `POST [id]/retire` + `/restore`
lifecycle endpoints w/ equipment_events audit trail; F10.1f
`GET [id]/qr-sticker` single-row Brother DK-1201 PDF; F10.1g-i
`POST /qr-stickers` bulk multi-page PDF accepting `ids: string[]`
or `filter: {…}` — 200-row cap, parallel QR encode, X-Stickers-
Printed / X-Stickers-Skipped response headers; F10.1h-i
`POST /import` CSV bulk-import w/ RFC-4180 parser, dry-run +
execute modes, 1000-row cap, per-row error attribution;
F10.2a `GET /templates` list w/ embedded item_count + `GET /templates/[id]` detail w/ joined items + version metadata;
F10.2b-i `POST /templates` atomic create w/ items + v1 snapshot;
seeds/238 `photo_url` + `condition` enum (new/good/fair/poor/damaged/needs_repair) + `condition_updated_at` plumbed
through GET + POST + PATCH (`condition_updated_at` stamped server-side
on every condition change) + Add/Edit modal pickers + per-row
catalogue condition badge w/ "last checked" hover hint;
seeds/243 `starr-field-equipment-photos` storage bucket + shop-wide-read /
service-role-write RLS + `POST /api/admin/equipment/[id]/photo`
upload endpoint (multipart form-data, 10 MB cap, image MIME
allow-list, replaces prior path on extension change, returns
60-min signed URL for immediate preview, db rollback on update
failure to avoid orphaned uploads) + GET catalogue
`?include_photo_urls=1` opt-in flag returning per-row signed
URLs (parallel storage roundtrips so 200-row pages stay fast)
+ Edit modal Photo widget (file picker · preview · 10 MB +
MIME client-side guards · inline error · auto-refresh on
upload) + catalogue thumbnail column showing the signed-URL
preview;
equipment_manager role gated; tech_support read-only)**.

**Worker (`worker/src/services/`):**
- `receipt-extraction.ts` + `cli/extract-receipts.ts` + endpoint at
  `/starr-field/receipts/extract` (Phase F2).
- `voice-transcription.ts` + `cli/transcribe-voice.ts` + endpoint at
  `/starr-field/voice/transcribe` (Batch R).
- `missing-receipt-detection.ts` + `cli/scan-missing-receipts.ts`
  (Batch DD — hourly cron pushes "Forget a receipt?" notifications
  for unclassified ≥5-min stops with no nearby receipt).
- `video-thumbnail-extraction.ts` + `cli/extract-video-thumbnails.ts`
  (Batch GG — ffmpeg-static spawn extracts a JPG thumb from each
  uploaded video; thumbs land in the photos bucket so `VideoGrid`
  surfaces them).

**Seeds (`seeds/`):** 220 (receipts) · 221 (data points) ·
222 (notifications) · 223 (location pings) · 224 (location
derivations) · 225 (vehicles) · 226 (files) · 227 (geofence
classifier) · 228 (voice transcription) · 229 (receipt review +
dedup fingerprint, Batch Z) · 230 (receipt soft-delete +
retention, Batch CC) · 231 (video thumbnail tracking columns,
Batch GG) · 232 (receipts.exported_at + exported_period for
tax-period locking, Batch QQ) · **233 (equipment_inventory v2
extensions, Phase F10.0a-i) · 234 (job_equipment FK, F10.0a-ii)
· 235 (equipment_kits + items, F10.0a-iii) · 236 (equipment_events
audit log, F10.0a-iv) · 237 (equipment_templates + items +
versions, F10.0a-v) · 238 (equipment richer metadata —
photo_url + condition + condition_updated_at + needs-attention
partial idx, F10 polish per the user's "image / condition /
team-history" follow-up) · 243 (equipment-photos storage bucket
+ shop-wide-read / service-role-write RLS, F10 polish companion
to seeds/238)** — all present on disk.
**Activation gates pending live apply:** 229, 230, 231, 232,
233, 234, 235, 236, 237, 238, 243. (Subsequent equipment seeds
239-242 will land alongside their respective F10 sub-phases —
239 reservations, 240 personnel, 241 maintenance, 242 tax
tie-in.)

**Roles (`lib/auth.ts`):** standard 10 roles plus `equipment_manager`
(Phase F10.0e `[ded0b67]`); 4 `Record<UserRole, …>` consumers
updated. Sidebar entries for the new "Equipment" group
intentionally NOT yet added — those land in F10.6 alongside
the dashboards they link to.

### B. Partial (started; polish deferred)

| Area | Done | Deferred |
|---|---|---|
| F2 receipts | Capture, extraction, approval, CSV export, duplicate detection + review-before-save (Batch Z), soft-delete foundation (Batch CC), bulk-approve (Batch JJ), "Show deleted" admin toggle (Batch FF), Money-tab "needs review" filter (Batch LL) + persisted across launches (Batch OO), tax-summary endpoint + period-lock schema (Batch QQ — API + seeds shipped) | Worker retention sweep CLI (purges rows past IRS retention threshold); per-receipt admin sign-off audit; `/admin/finances` page UI + sidebar entry (Batch QQ sub-batch — planned next) |
| F3 photos | Multi-photo, GPS, EXIF, annotator, compass heading (Batch V) | Arrow / circle / text annotation primitives (schema slots reserved; pen-only in v1) |
| F4 video | Capture, upload, admin player, mobile review tab + full-screen player (Batch U), server-side FFmpeg thumbnails (Batch GG), WiFi-only gating for large clips (Batch KK) | True dual-tier transcoding (cellular 480p + original 1080p) via worker ffmpeg pipeline; surveyor "data-saver" toggle |
| F4 voice | Recorder, Whisper transcription, admin player | Voice-to-text shortcut for hands-free dictation (no `expo-speech-recognition`) |
| F4 notes | Free-text + four structured templates + admin viewer + cross-notes search (Batch BB) | Server-side `tsvector` index for cross-user admin search at scale; FTS5 ranking when the LIKE scan tops 10k notes per device |
| F5 files | Document picker + admin Files block + image/PDF/CSV preview + pin-to-device offline read (Batch W) + P,N,E,Z,D parser w/ point-match preview (Batch AA) | Auto-import unmatched CSV rows as new data points |
| F6 stops | Geofence classifier + idempotent re-derivation | AI classifier for ambiguous stops; reverse-geocoded `place_name`/`place_address`; PostGIS `path_simplified` for day-replay scrubber; pg_cron nightly schedule |
| F6 dispatcher | Last-seen card; per-user mileage drilldown; per-user `/admin/team/[email]` daily drilldown (Batch X); missing-receipt prompts via worker scan (Batch DD) | Continuous live-map trace; day-replay scrubber UI |
| F7 polish | Storage / sync UI, network-restore drainer, notification UX, sun-readable theme (Batch Y) | Battery profile audit on real devices; tablet split-pane layouts on drilldown screens; multi-device conflict-resolution UX + tests; 30-day stress test on 5 devices |
| F0 ops | Expo scaffold, biometric, PowerSync, Sentry, OTA wiring (Batch HH; needs operator to fill EAS Update URL) | Lock-screen widget (iOS WidgetKit / Android shortcut); EAS submit credentials still `REPLACE_WITH_*`; first TestFlight build pending |

### C. Pending (planned but not started)

- **Batch QQ part-2** — the `/admin/finances` page UI on top of
  the now-shipped tax-summary + mark-exported endpoints + the
  `Finances` sidebar entry under the Work group (`['admin',
  'developer', 'tech_support']`, `internalOnly: true`). Split
  out from QQ part-1 to keep the React component build-out
  scoped to a single sub-batch. See the Batch QQ entry in
  §9.x for the full UI brief (status-segmented stat cards,
  Schedule C breakdown table, mileage section, Lock + Export
  CSV buttons).
- ~~**Worker retention sweep CLI**~~ — **shipped as Batch RR**
  `[07bee84]`. `worker/src/services/receipt-retention-sweep.ts`
  + `worker/src/cli/sweep-receipt-retention.ts` purge
  soft-deleted receipts past the IRS window (90d for rejected;
  7y default for everything else, env-overridable). DRY-RUN by
  default; `--execute` flag required to actually delete;
  storage purge fires before db delete (safer to leave an
  orphan db row than an unreachable blob). Operator schedule:
  nightly dry-run cron + weekly `--execute` after review.
- ~~**AI-usage tracker integration for Whisper**~~ — **shipped
  as Batch SS** `[f3fcaa5]`. `worker/src/lib/ai-usage-tracker.ts`
  service enum extended with `'whisper-transcribe'`; `record()`
  accepts optional `costUsd` override (Whisper bills per second,
  not per token); `address` made optional. `worker/src/services/
  voice-transcription.ts` adds `releaseClaim()` + pre-batch +
  per-row gate checks + record-on-success-and-failure. Closes
  the §9.w D architectural deviation — Starr Field voice spend
  now trips the same circuit breaker that protects Recon's
  Vision spend. Receipt extraction was already wired (uses
  `service: 'vision-ocr'`).
- **Per-row admin sign-off audit trail on receipts** — Batch JJ
  bulk-approve writes `approved_by` + `approved_at`; deferred
  is a richer per-row event log (who approved, when, from what
  device / IP) for the audit-trail-as-product story.
- **Phase F8** — Trimble Access file exchange (Path A from §8.1):
  watched cloud folder, JobXML / CSV auto-import, name-based
  auto-link.
- **Phase F9+** — real-time Trimble streaming (Path C); QuickBooks
  Online direct API (could subsume the Batch QQ CSV bridge for
  customers who prefer pull-sync over CSV import); Civil 3D
  round-trip; Apple Watch / Wear OS; fleet fuel-card
  reconciliation; AR overlay; drone import; weather metadata.
- **Server-side UPSERT idempotency on `client_id`** — currently
  PowerSync's CRUD queue dedupes on replay; server-side enforcement
  per §10 risk register has not landed.
- **AI-usage tracker integration for Whisper + receipt
  extraction** — both worker services land per-row spend in
  their own cents column; the shared circuit breaker doesn't
  trip on Starr Field spend yet (see "Architectural deviations"
  below).
- **EAS Update URL fill-in** — Batch HH wired the OTA scaffold
  but `app.json` still ships `"url": "REPLACE_WITH_EAS_UPDATE_URL"`.
  Operator step: run `eas update:configure`, paste the URL, ship
  a build. The `<OtaUpdatesReconciler />` already degrades
  safely on un-configured builds.
- **Phase F10 — equipment + supplies inventory + dispatcher
  templates** — **F10.0 SHIPPED, F10.1–F10.9 PENDING.** §5.12
  spec'd Apr 2026. Ten sub-phases (F10.0a-i through F10.9)
  originally sized for Weeks 33–40; the F10.0 schema work
  shipped early via 6 commits (5 seed files + role wiring).
  - **✅ F10.0a-i** seeds/233 equipment_inventory v2 `[b8d239f]`
  - **✅ F10.0a-ii** seeds/234 job_equipment FK `[dec1865]`
  - **✅ F10.0a-iii** seeds/235 equipment_kits + items `[90827da]`
  - **✅ F10.0a-iv** seeds/236 equipment_events audit log `[fb94f61]`
  - **✅ F10.0a-v** seeds/237 equipment_templates + items + versions `[e566747]`
  - **✅ F10.0e** equipment_manager role + 4 consumers `[ded0b67]`
  - **✅ F10.1** Inventory catalogue UI + QR codes — fully shipped (F10.1a-j: GET endpoint · catalogue page · POST + Add modal · PATCH + Edit modal · Retire/Restore endpoints + UI · single-row QR PDF · bulk QR PDF endpoint + bulk-select UI · CSV import endpoint + page · mobile useEquipmentByQr resolver + schema · mobile camera scanner overlay)
  - **◐ F10.2** Templates + dispatcher apply flow — F10.2a (list + detail GET endpoints) shipped; F10.2b-g pending (POST/PATCH/DELETE templates · items endpoints · list page · edit page · save-as-template · apply flow)
  - **⨯ F10.3** Availability + conflict engine (seeds/239 reservations + GiST overlap + 4 checks + atomic reserve with `SELECT … FOR UPDATE` race guard + soft-override)
  - **⨯ F10.4** Personnel side (seeds/240 personnel_skills + unavailability; mobile [Confirm]/[Decline] cards; crew-lead heuristic)
  - **⨯ F10.5** Daily check-in/out workflow (the user's headline ritual; QR scanner sheets; damage triage; lost-on-site; 6pm/9pm nag cron)
  - **⨯ F10.6** Equipment Manager dashboards (sidebar group; Today landing; Reservations Gantt; Consumables; Crew calendar; retired-gear cleanup queue)
  - **⨯ F10.7** Maintenance + calibration (seeds/241; events CRUD; 3am cron; QA gate; receipt cross-link; per-unit history)
  - **⨯ F10.8** Mobile UX polish (pre-job loadout card; what's-in-my-truck; persistent FAB; 🛠 Gear tab; 3 new notification source_types; PowerSync rules; surveyor self-service)
  - **⨯ F10.9** Tax + depreciation tie-in (seeds/242; receipt-promotion modal; §179/MACRS; Lock-equipment-depreciation button; equipment block on tax-summary; Asset Detail Schedule PDF; disposal flow)

  Twelve §5.12.11 edge-case batches sequenced as post-F10 polish
  (priority: F → C → E → A/B → D → I → G → J → K → H → L).
  Forty §12 open questions (#21-#40) document decision-required
  items requiring user / surveyor / CPA sign-off — twelve §15
  Phase F10 prereqs flag the operator action items needed
  before F10.1 can fully ship (Equipment Manager role mapping,
  walk-the-cage CSV, QR sticker label-printer choice, etc.).

### D. Architectural deviations from the plan

1. **No `/api/mobile/*` REST namespace exists.** The plan §13
   declares Supabase-JWT-gated mobile routes (data-points,
   time-entries, receipts, location-stops). Reality: mobile uses
   PowerSync's CRUD queue + Supabase RLS for **all** writes; REST is
   only used for worker-triggered actions which currently route to
   `/starr-field/*` on the worker, not `/api/mobile/*` on Next.
   §13 contracts are aspirational documentation, not implemented
   endpoints. **Action:** §13 should be re-framed as "PowerSync
   table writes" rather than "REST contracts" — or the REST
   endpoints should be added if a non-PowerSync client ever needs
   them. No urgency until a non-PowerSync caller emerges.
2. ~~**Receipt AI extraction does not currently integrate with
   the global `AiUsageTracker`**~~ — **resolved.** Receipts have
   always routed through `getGlobalAiTracker()` via
   `service: 'vision-ocr'` (the deviation note was stale).
   Whisper voice transcription was the actual gap; closed by
   Batch SS `[f3fcaa5]` — service enum extended with
   `'whisper-transcribe'`, `record()` accepts an explicit
   `costUsd` override (Whisper bills per second not per token),
   pre-batch + per-row gate checks on the call sites.
   Per-row spend still lands in `extraction_cost_cents` /
   `transcription_cost_cents` for audit; the shared circuit
   breaker now also fires on Starr Field spend.

### E. Outstanding bootstrapping (operator + legal prerequisites)

From §15 (re-verified — see also patches below). Most items below
are operator / legal actions, not engineering work:

- [ ] App name decision (working title still "Starr Field")
- [ ] Apple Developer + Google Play accounts under Starr Software
- [ ] App icon + splash screen (no `mobile/assets/` directory yet)
- [ ] `seeds/214_starr_field_existing_schema_snapshot.sql` —
  **blocks** fresh `./seeds/run_all.sh --reset` runs because seeds
  220+ ALTER `jobs` / `time_entries` from the live schema
- [ ] 179-code point taxonomy import to `point_codes` (currently
  offline, in Henry's printout)
- [ ] Reserve `app.starr.software/field` deep-link domain
- [ ] Privacy policy + ToS drafts (required for store submission +
  consent flow)
- [ ] Texas-licensed employment attorney engagement letter for
  location-tracking review
- [ ] Internal alpha tester list (Jacob, dad, 1–2 crew)
- [ ] MVP success metric — *"Jacob does a full week using only
  Starr Field for time, receipts, and notes"*
- [ ] Raise unified `AI_DAILY_CAP_USD` $50 → $60 + rename env var
  across root + worker `.env.example`
- [ ] Google Cloud Places / Distance Matrix billing alerts
- [ ] Verify PostGIS extension on live Supabase
- [ ] Confirm with Hank Maddux RPLS that `fieldbook_notes` is the
  right home for structured mobile notes

### F. Open product / policy questions

20 unresolved questions in §12 (single-app vs per-product, photo
retention, multi-tenant, crew-role granularity, Trimble integration
scope, pricing, TX compliance, backup strategy, watch app scope,
1099 location-tracking policy, receipt approval threshold, mileage
rate, QuickBooks integration phasing, per diem, driver detection,
PTO tracking, schedule integration). These are decision-required
items, not engineering work.

### G. One-line verdict

Core v1 capture loop + admin review + bundle download is
**code-complete and offline-first**. Store submission, legal
review, and 12 of 14 §15 bootstrapping items separate the codebase
from a production rollout — none of which are engineering blocked.

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

**Batch F — privacy panel**
- [x] `useOwnLocationPings(hours)` + `useOwnLocationPingSummary` in
      `lib/locationTracker.ts` — reactive read of the user's own
      `location_pings` rows scoped by `user_id`. RLS already restricts
      SELECT to owner (seeds/223), so no additional gating needed.
- [x] `(tabs)/me/privacy.tsx` — disclosure block (what / when /
      cadence / who sees / storage) plus a today's-timeline list of
      every ping with timestamp, source label, lat/lon, accuracy,
      battery snapshot.
- [x] Me-tab Privacy summary row showing `N pings · last Xm ago`
      with deep-link to the panel.
- [x] Deliberate non-feature: no pause-tracking toggle. Pausing
      mid-shift would silently break the "tracking-while-clocked-in"
      contract from the dispatcher's POV. The only stop path is
      clock-out (atomic via `useClockOut` + `stopBackgroundTracking`).

**Batch S — per-job consolidated field-data view (MVP)**

Per the user's request: *"There needs to be a list of all of the
points that have been logged in the app for a given job, and if
they select a point it should open that point info and show all
of the comments, files, or media relating to that point. They
should also be able to download any media in any job."*

Reduced-scope MVP — the per-point drilldown
(`/admin/field-data/[id]`) already exists and renders comments +
files + media for the selected point, so this batch only needs
the per-job points-list + bulk download. Job-level media / notes
/ files inline blocks deferred to the next round.

API:
- `GET /api/admin/jobs/[id]/field-data` — single round trip
  returning `{ job, points[], job_media[], job_notes[],
  job_files[], stats }`. Per-point summaries include a signed
  thumbnail URL, media + note counts so the list cards render
  without per-point fetches. Bulk-resolves creator emails via
  one `registered_users` IN-query. Sign failures cap at 3 log
  lines per request.
- `GET /api/admin/jobs/[id]/field-data/manifest` — CSV with one
  row per downloadable (`point_name, kind, filename,
  content_type, size_bytes, duration_seconds, captured_at,
  signed_url`). 4-hour TTL on the signed URLs (configurable via
  `?ttl_hours=`, max 24). Audit-log line per pull so ops can
  correlate manifest pulls with user activity. Bookkeeper
  pipes to `xargs wget` or opens in Excel.

Admin page (`/admin/jobs/[id]/field`):
- Header: job name + number + client + address.
- Stats bar: Points / Photos / Videos / Voice / Notes / Files
  counts.
- Points grid: thumbnail + name + offset/correction flag pills
  + "code · creator · captured-at" meta + media/note counts.
  Each card links to the existing `/admin/field-data/{point_id}`
  drilldown.
- "⬇ Download all media (CSV)" button hits the manifest
  endpoint + triggers a browser download. Disabled when the
  job has zero media + files.
- Empty state explains how points appear ("As crew uses the
  mobile app, points appear here within seconds of regaining
  reception").
- Logging + error handling: every fetch surfaces failures via
  the visible error banner; sign-failure thumbnails fall back
  to a placeholder.

Cross-link from existing job detail:
- `/admin/jobs/[id]/page.tsx` gets a "📍 View field captures →"
  pill button next to the existing "Back to Jobs" link, prominently
  visible at the top so dispatchers find it immediately.
- Inline-styled to avoid touching the existing job-detail
  stylesheet.

Deferred for the next round (after the user reviews the MVP):
- Job-level media block (photos / voice / video attached at job
  level, no point assignment) inline on the new page. The API
  already returns `job_media[]`; the UI just needs to render it.
- Job-level notes inline on the new page (`job_notes[]`).
- Job-level files inline on the new page (`job_files[]`).
- ZIP-stream download (vs. CSV manifest of signed URLs).

**Batch R — voice transcription via OpenAI Whisper (F4 closer)**

Closes the last F4 plan deliverable — voice memos are now searchable
for the office. Mirrors the receipts-extraction worker pattern so
deployment / monitoring / retries are uniform.

Schema (seeds/228_starr_field_voice_transcription.sql):
- ALTER TABLE field_media adds five columns:
  `transcription_status` (queued/running/done/failed),
  `transcription_error`, `transcription_started_at`,
  `transcription_completed_at`, `transcription_cost_cents`.
  Idempotent via ADD COLUMN IF NOT EXISTS + DO blocks for the
  CHECK constraint.
- Two partial indexes:
  `idx_field_media_transcription_queued` on `(created_at ASC) WHERE
  media_type='voice' AND upload_state='done' AND
  transcription_status='queued'` for the worker poll.
  `idx_field_media_transcription_running` on
  `transcription_started_at WHERE transcription_status='running'`
  for the watchdog sweep.

Mobile capture (lib/fieldMedia.ts useAttachVoice):
- Voice INSERT now sets `transcription_status='queued'` so the
  worker picks the row up the moment `upload_state='done'`.
  No other capture-flow change.

Worker (worker/src/services/voice-transcription.ts):
- `processVoiceTranscriptionBatch(supabase, { batchSize?, logger? })`
  fetches up to `batchSize` queued rows, race-safe `claimRow` flips
  to `'running'`, fetches the M4A via signed URL, calls Whisper-1
  (English hint) via the OpenAI SDK, writes the transcript +
  cost in cents back to `field_media`. Failures land as
  `transcription_status='failed'` with truncated `transcription_error`.
- Hard caps: skip rows over 10 min duration (mark failed —
  surveyors record short field memos; longer is usually an
  accidentally-left-on recording). The Whisper API supports up
  to 25 MB but quality + cost don't justify the long-tail use case.
- Watchdog: rows stuck in `'running'` past 5 min get re-queued at
  the start of the next batch. Crashed worker → max 5 min stuck.
- Cost: Whisper $0.006/min ($0.0001/sec). Per-row spend lands in
  `transcription_cost_cents`. v1 doesn't integrate with the global
  ai-usage-tracker (its service enum is closed; v2 polish extends
  it to include 'whisper-transcribe').
- Logging: every step (claim / fetch / Whisper call / write-back /
  watchdog sweep) emits a structured log line via the project's
  ProcessLogger pattern so Sentry sees breadcrumbs.

CLI + endpoint:
- `worker/src/cli/transcribe-voice.ts` mirrors extract-receipts
  (one-shot OR --watch loop with 60s polling). Always emits a
  summary line so a healthy idle worker is distinguishable from
  a stuck cron job.
- `npm run transcribe-voice -- --watch` for cron / pm2 / systemd.
- `POST /starr-field/voice/transcribe` (auth-gated) for on-demand
  triggers + retry-this-one. Body: `{ batchSize?, mediaId? }` —
  `mediaId` flips a single failed row back to queued before
  running the batch.

Admin viewer (/admin/field-data/[id]):
- Voice cards now show a transcription status badge (⏳ queued /
  🎧 transcribing / ✓ done / ⚠ failed) above the existing
  transcript text block. Failed rows show the truncated error
  inline so the bookkeeper can spot pattern issues (rate-limited,
  malformed audio, etc.).

Activation gates:
- Apply seeds/228 to live Supabase before the worker starts
  polling (the worker's UPDATE would 4xx without the new
  columns).
- Set `OPENAI_API_KEY` on the worker before enabling. The CLI +
  endpoint short-circuit + log a warn breadcrumb when the key
  is missing rather than dropping rows.

**Batch Q — geofence classifier (stop-detection v2 phase 1)**

- `seeds/227_starr_field_geofence_classifier.sql` — `CREATE OR
  REPLACE FUNCTION` that adds the geofence pass to
  `derive_location_timeline`. After clustering pings into stops,
  each stop centroid is checked against every job whose
  `centroid_lat / centroid_lon / geofence_radius_m` are populated.
  Bounding-box prefilter (~5 km lat/lon delta) keeps the work
  bounded; the closest job within radius wins. Match writes
  `category=jobs.name`, `category_source='geofence'`,
  `job_id=jobs.id` (overrides the time-entry's job_id since
  bookkeepers care about WHICH SITE the crew was at, not which
  time-entry happened to be open).
- v1 protections preserved: `user_overridden=true` stops are never
  touched; idempotent via DELETE-then-INSERT pattern; same Haversine
  glitch guards.
- `PATCH /api/admin/jobs/[id]/geofence` accepts
  `{ centroid_lat, centroid_lon, geofence_radius_m? }` and writes
  the three columns on the jobs row. Validates lat / lon bounds +
  radius (25–5000 m). Default radius 200 m when omitted.
- `/admin/timeline` Stop card adds "📍 Set as job site →" button
  when the stop is linked to a job AND not already classified by a
  geofence. One tap captures the stop's centroid + 200 m radius
  onto the job. Future stops at that location auto-classify on the
  next Recompute. Confirms with `confirm()` before writing.
- The "magic moment" loop: surveyor visits a job → phone tracks
  pings → admin Recomputes → unclassified stop appears at the new
  site → admin clicks "Set as job site" → next Recompute labels
  every stop there with the job's name. Works for jobs that were
  never set up with an address, or where the address geocode is
  off.

**Phase F10.0 — equipment + supplies schema foundation (5 seeds + role)**

Closes Phase F10.0 of the §5.12 spec. Six commits:

* `seeds/233_starr_field_equipment_inventory_v2.sql` `[b8d239f]`
  — extends the existing `equipment_inventory` table in place
  with item_kind ('durable'|'consumable'|'kit'), category,
  current_status, qr_code_id (UNIQUE), cost basis (acquired_at,
  acquired_cost_cents, useful_life_months, placed_in_service_at),
  calibration + warranty + service tracking, consumable
  accounting (unit, quantity_on_hand, low_stock_threshold,
  vendor, cost_per_unit_cents), home_location + optional
  vehicle_id FK, is_personal + owner_user_id (§5.12.9.4),
  retired_at + retired_reason soft-delete (§5.12.1 audit
  pattern), serial_suspect flag (§5.12.11.L), audit timestamps.
  Five partial indexes for the hot reads.
* `seeds/234_starr_field_job_equipment_fk.sql` `[dec1865]` —
  adds `equipment_inventory_id UUID` FK with ON DELETE SET NULL
  (retired unit doesn't nuke historical assignment trail).
  Free-text `equipment_name` / `serial_number` columns kept in
  place (historical archive + §5.12.11.A borrowed-gear fallback).
  Two indexes: per-inventory + open-assignments composite.
* `seeds/235_starr_field_equipment_kits.sql` `[90827da]` —
  `equipment_kits` wrapper (one row per kit, FK to its own
  inventory row with item_kind='kit', UNIQUE(inventory_id),
  ON DELETE CASCADE) + `equipment_kit_items` join with quantity
  (handles "two batteries"), is_required (false → §5.12.5
  soft-warn instead of hard-block), sort_order, UNIQUE(kit_id,
  child_equipment_id), CHECK quantity ≥ 1, FK to kit CASCADE,
  FK to child RESTRICT (refuse to drop an inventory row while
  it's a kit member). Two indexes.
* `seeds/236_starr_field_equipment_events.sql` `[fb94f61]` —
  universal append-only audit log with open-string event_type
  (~20 canonical values listed in comment, but log MUST NOT
  fail on a new code path's previously-unseen event), actor +
  job + reservation_id + maintenance_event_id (FKs deferred to
  seeds/239 + 241), notes + payload JSONB. Five indexes covering
  the read patterns. RLS append-only.
* `seeds/237_starr_field_equipment_templates.sql` `[e566747]` —
  `equipment_templates` header (name, slug, job_type,
  composes_from[], requires_certifications, version, is_archived,
  required_personnel_slots JSONB) + `equipment_template_items`
  with the crucial XOR between `equipment_inventory_id`
  (specific) and `category` (any-of-kind) enforced by CHECK +
  `equipment_template_versions` immutable per-save snapshots.
  Composition recursion guard (MAX_DEPTH=4) at app layer.
* `lib/auth.ts` + 4 `Record<UserRole, …>` consumers `[ded0b67]`
  — `equipment_manager` added to ALL_ROLES, ROLE_LABELS,
  ROLE_DESCRIPTIONS, ROLE_PRIORITY. `AdminSidebar` ROLE_DISPLAY,
  `users/page.tsx` ROLE_LABELS+COLORS+DESCRIPTIONS,
  `employees/page.tsx` ROLE_LABELS+COLORS updated. No DB
  migration needed (text[] column with no enum CHECK).
  Sidebar entries for the new "Equipment" group NOT added —
  those land in F10.6 alongside the dashboards.

Activation gate: apply seeds/233 → 234 → 235 → 236 → 237 in
order before exposing F10.1+ admin/mobile routes.

Subsequent F10 sub-phases each bring their own seed + UI batch:
F10.1 (catalogue + QR) · F10.2 (templates UI) · F10.3 (seeds/239
+ availability engine) · F10.4 (seeds/240 + personnel) · F10.5
(check-in/out workflow) · F10.6 (Equipment Manager dashboards) ·
F10.7 (seeds/241 + maintenance) · F10.8 (mobile UX polish) ·
F10.9 (seeds/242 + tax + depreciation tie-in).

**Batch SS — Whisper into shared AI-usage tracker (§9.w D closer)**

`worker/src/lib/ai-usage-tracker.ts` `[f3fcaa5]`:
* Service enum extended with `'whisper-transcribe'` (additive,
  no breaking changes for Recon's variant-generation /
  vision-ocr / ai-parse callers).
* `record()` accepts optional `costUsd` override — Whisper bills
  per-second, not per-token; the tracker's Sonnet token-math
  was wrong for it.
* `address` parameter now optional with `''` default.

`worker/src/services/voice-transcription.ts`:
* New `releaseClaim()` helper mirrors the receipt-extraction
  pattern — flips `transcription_status='running' → 'queued'`
  when the breaker opens after we've claimed but before we've
  called Whisper. Soft-stop, not failure.
* Pre-batch gate check at the top of
  `processVoiceTranscriptionBatch` — if the breaker is wide
  open, skip the batch with a logged warn and return zero work.
* Per-row gate re-check immediately before the Whisper call
  (audio fetch can take seconds; sibling rows in the batch can
  flip the gate).
* Both success and failure branches call `tracker.record()` —
  failures count toward consecutive-failure threshold so a
  Whisper outage opens the circuit instead of silently draining
  retries. Successful records pass `costUsd: minutes *
  WHISPER_USD_PER_MINUTE` for accurate ledger tracking.

Closes the §9.w D architectural deviation. Receipts were
already wired (uses `service: 'vision-ocr'`); this completes
the Whisper half so a runaway Starr Field voice backlog now
trips the same gate that protects Recon's Vision spend.

**Batch RR — receipt retention sweep CLI (Batch CC v2 closer)**

`worker/src/services/receipt-retention-sweep.ts` `[07bee84]`:
* Two retention buckets, both env / CLI-overridable:
  - `status='rejected'`: 90 days from `deleted_at` (per Batch
    QQ part-1 plan-doc note — never went into accounting)
  - everything else: 7y default (IRS substantial-under-reporting
    conservative window). Operator may tighten to 3y for
    clean-return shops.
* Storage cleanup BEFORE db delete — safer to leave an orphan
  db row than an unreachable blob. If storage delete fails the
  row stays, surfaces as `storage-only-skip` in the result.
* Per-batch cap (default 100) so a sudden backlog doesn't spike
  Postgres / Storage IO.
* Race guard on db delete — re-checks `deleted_at IS NOT NULL`
  so an un-delete between scan and purge is respected.

CLI (`worker/src/cli/sweep-receipt-retention.ts`):
* DRY-RUN BY DEFAULT. The sweep only deletes when `--execute`
  is supplied. No accidental mass-deletes from a misconfigured
  crontab.
* `--watch` mode loops every 24h.
* Exit codes: 0 clean / 1 infra / 2 per-row errors. Surfaces
  to cron monitoring.
* npm script: `npm run sweep-receipt-retention -- --execute`.

Operator activation: schedule a nightly dry-run cron (logs to
syslog/journal) → review 2-3 reports to confirm bucket math →
schedule a weekly `--execute` cron. `SUPABASE_SERVICE_ROLE_KEY`
required.

**Batch QQ — tax-time financial summary + anti-double-counting (F2 ↔ F6 closer)**

Closes the user's coupled directives:
1. *"For things dealing with receipts and finances, please build
   systems that keep track of everything and make it super easy to
   manage and export data. Make it so that we can use the data to
   keep really great track of everything and make dealing with
   taxes super easy!"*
2. *"if data has already been managed or used for it's intended
   purpose, such as old receipts being calculated into business
   costs, that they are handled and marked well so that there is
   no confusion. We don't want things getting counted twice, or
   not counted at all in the total."*

Joins approved/exported receipts + per-vehicle business mileage +
the IRS standard mileage rate into one Schedule-C-shaped report,
with a status-bucket split so the bookkeeper can distinguish
*new* deductions (status='approved', `exported_at IS NULL`) from
*already-filed* ones (status='exported') without ever having to
guess. The "Lock this period as exported" action seals the new
bucket into a named tax period so subsequent summaries don't
double-count.

Schema (`seeds/232_starr_field_finances_lock.sql`) — **shipped**:
- `receipts.exported_at TIMESTAMPTZ` — wall-clock when the row
  was first locked. NULL = never exported.
- `receipts.exported_period TEXT` — human label (`'2025'`,
  `'2025-Q4'`, `'2025-Apr'`, etc.) for traceback from row to CPA
  submission.
- Partial index `idx_receipts_export_pending` on
  `(created_at DESC) WHERE status IN ('approved','exported') AND
  deleted_at IS NULL AND exported_at IS NULL` — drives the "X new
  since last export" stat without scanning the full table.
- Idempotent — every ALTER + index guards on existence.

Admin API (`app/api/admin/finances/`) — **shipped**:
- `GET /api/admin/finances/tax-summary?year=YYYY` (or
  `?from=&to=`) `&status=approved|exported|all&format=json|csv`.
  - JSON shape includes `period`, `irs_rate_cents_per_mile`
    (env-overridable via `IRS_MILEAGE_CENTS_PER_MILE`, default 67¢
    — 2025 rate), `status_filter`, plus three top-level blocks:
    - `receipts` — `total_cents`, `count`,
      `by_status` (`approved` vs `exported` split with
      `count` / `total_cents` / `deductible_cents`),
      `by_category` (one row per Schedule C line — fuel→Line 9,
      meals→24b, supplies→22, equipment→13, lodging→24a,
      professional_services→17, office_supplies→18,
      client_entertainment→27a, other→27a),
      `by_tax_flag` (`full|partial_50|none|review`),
      `top_vendors` (top 10 by spend),
      `by_user` (per-submitter totals),
      `exported_periods` (which prior periods do exported rows
      trace back to — empty until the first lock).
    - `mileage` — `total_miles`, `deduction_cents`,
      `by_user`, `by_vehicle` (driver-only via
      `location_segments.vehicle_id` + `is_business`).
    - `totals` — `deductible_cents` (receipts deductible +
      mileage deduction), `expense_cents` (gross).
  - CSV variant flattens to a tax-prep-friendly section-grouped
    layout: header (period · rate · status filter), by-status
    split, Schedule C lines, by tax flag, top vendors, per-user,
    prior-export traceback, mileage by user / vehicle, grand
    totals row. Bookkeeper hands the file to the CPA.
  - `?status=approved` → only rows ready to lock; `?status=exported`
    → only rows already filed; `?status=all` (default) → both,
    with the by_status split so neither bucket is missed.
  - Soft-deleted (Batch CC) + rejected + pending receipts are
    excluded from every aggregation. Auth: admin / developer /
    tech_support.
- `POST /api/admin/finances/mark-exported` — body
  `{ year } | { from, to, period_label }`. Bulk UPDATE flips
  matching `status='approved' AND exported_at IS NULL AND
  deleted_at IS NULL` rows in the window to `status='exported',
  exported_at=now(), exported_period=<label>`. Race-safe
  (`exported_at IS NULL` guard in the WHERE clause), idempotent
  (re-running for an already-locked period is a no-op zero-row
  UPDATE), audited (every call logs counts +
  `admin_email`). Response: `{ locked, already_exported,
  pending_or_rejected, soft_deleted, period_label, exported_at,
  window }` so the page UI can render an at-a-glance summary
  even when the lock did nothing.

Tax-summary endpoint reads the new columns + reports the
`by_status` split + the `exported_periods` traceback. CSV emits
both blocks. **Both endpoint changes are shipped;** mark-exported
is fully wired to the new schema.

Web admin page (`/admin/finances`) — **planned** (next sub-batch):
- Year / quarter / month / custom-range picker. Defaults to
  current calendar year.
- Status-segmented stat cards at the top: "X new (approved,
  ready to lock)" + "Y already filed (exported)" so the
  bookkeeper sees the split before scrolling.
- Schedule C breakdown table (one row per category, with line
  number + count + total + deductible + drill-down link to
  filtered receipts list).
- By-tax-flag audit cross-check table.
- Top vendors + per-submitter sections.
- Mileage section (total miles · IRS rate · deduction; per-user +
  per-vehicle subtotals).
- Grand totals row.
- "⬇ Export CSV" button (hits the same endpoint with
  `format=csv`).
- "🔒 Lock this period as exported" button — confirms via
  `confirm()` with the count of rows about to lock + the
  `period_label`, calls the POST endpoint, refreshes the page.
  Disabled when the approved-bucket count is zero.
- Sidebar entry under "Work" group: `/admin/finances`, label
  "Finances", icon 💼. Roles: `['admin', 'developer',
  'tech_support']`, `internalOnly: true`.

Why the page split out from the build: the React UI is a large
self-contained component (~400 LOC) and the user asked us to
de-risk the agent runway by tackling it as a separate sub-batch
on top of the now-shipped API + schema foundation. Splitting it
also means the API can be exercised today via curl / Postman by
the bookkeeper while the page UI lands.

Anti-double-counting design notes (so the user's directive stays
visible to future authors):
- Once a row's `exported_at` is set, no admin path flips it back
  to `status='approved'` without surgery. The bookkeeper is
  expected to re-issue a corrected period if a row was filed in
  the wrong year — same as how QuickBooks handles closed periods.
- The bulk-approve endpoint (Batch JJ) already refuses to touch
  `status='exported'` rows; that ground-rule continues to hold.
- The per-row PATCH endpoint at `/api/admin/receipts/[id]`
  remains the only way to manually flip an exported row back —
  intentionally noisy in the audit log so any "un-export" leaves
  a trail.
- The mobile Money tab + receipts hooks treat `'exported'` as a
  display-only status (no inline edit). Surveyors don't see
  exported rows differently from approved ones — the distinction
  is bookkeeper-facing.

Activation gates:
- Apply `seeds/232_starr_field_finances_lock.sql` to live
  Supabase before exposing `/admin/finances` (the GET endpoint
  short-circuits without the columns; `mark-exported` would 4xx
  on the UPDATE).
- No env var or worker change required.

Pending v2 polish (queued but not started):
- Per-month drill-in chart on the page (12-bar stacked
  approved/exported by month). Today's table view is
  CPA-friendly; a chart helps the owner spot seasonal lumps.
- "Reverse a lock" admin action (one-receipt scope) for the rare
  case the bookkeeper exported the wrong period. Today: edit via
  the per-row PATCH endpoint (audited).
- Email the locked CSV to the CPA on lock — `mailto:` shortcut
  in v1, real SMTP via the worker queue in v2.
- Quarterly estimated-tax preview: project current-YTD into a
  full-year estimate via simple linear extrapolation (rough
  guidance, not a tax filing).
- Cross-link from the per-employee page (`/admin/team/[email]`)
  to a pre-filtered Finances view scoped to that submitter.
- IRS rate auto-fetch from a daily cron once the IRS publishes
  the 2026 rate (today's rate is hard-coded with an env-var
  override).



Closes the Batch MM v2 polish item *"Auth + layout screens
migration (~10 files; trivial once prioritised)."* Plus 5 leaf
components Batch MM missed (`AppleSignInButton`, `TimeEditHistory`,
`VideoGrid`, `ReceiptRollupCard`, `CategoryPicker`).

Net: **zero** `useColorScheme()` callers remain anywhere in the
app — every screen + every leaf component reads the user's
chosen theme via `useResolvedScheme()`. Sun-readable now
propagates through 100% of the surface.

Migrated screens (auth + layouts + 404):
- `(auth)/sign-in.tsx`, `forgot-password.tsx`,
  `reset-password.tsx`, `auth-callback.tsx`
- `(tabs)/_layout.tsx` (tab bar chrome)
- `(tabs)/jobs/_layout.tsx`, `jobs/[id]/_layout.tsx`,
  `me/_layout.tsx`, `money/_layout.tsx`, `time/_layout.tsx`,
  `capture/_layout.tsx` (per-stack chrome)
- `+not-found.tsx`

Migrated leaf components:
- `lib/AppleSignInButton.tsx`, `TimeEditHistory.tsx`,
  `VideoGrid.tsx`, `ReceiptRollupCard.tsx`,
  `CategoryPicker.tsx`.

The only `useColorScheme()` references left in the codebase
are inside `lib/themePreference.tsx` itself — that hook drives
the legacy `Appearance` API and uses the OS scheme as a
fallback when the user's preference is `'auto'`. No further
migration is meaningful.

**Batch OO — Money-tab filter persists across launches (closes Batch LL v2 gap)**

Closes the Batch LL v2 polish item *"Persist the chosen filter
across launches (e.g. AsyncStorage) so a surveyor reviewing one
item at a time keeps their place between captures."* Surveyors
who flip the "needs review" filter on, capture one receipt,
backgroud the app, and come back hours later now find the
filter still active — no re-flip needed.

Mobile lib (`mobile/lib/receipts.ts`):
- New `usePersistedReceiptFilter()` hook returning the same
  `[filter, setFilter]` tuple shape `useState` did, plus an
  `AsyncStorage`-backed `useEffect` that hydrates from
  `@starr-field/receipt_filter` on mount and persists every
  set call. Mirrors the `useThemePreference` pattern from
  `themePreference.tsx`.
- Persistence is best-effort: AsyncStorage failures log via
  `logWarn` but don't reject the setState — the local state
  update is the user-visible contract. Default is `'all'` for
  the first paint and for any corrupted-key recovery.
- Hook stays screen-level (no provider) since the filter is
  per-device UX, not cross-component state.

Mobile screen (`mobile/app/(tabs)/money/index.tsx`):
- Drop-in swap: `useState<ReceiptListFilter>('all')` →
  `usePersistedReceiptFilter()`. Tuple shape matches.
- Removed unused `useState` and `ReceiptListFilter` type
  imports.

Logging:
- `receipts.usePersistedReceiptFilter` warns on hydrate /
  persist failures so a corrupted prefs file is visible in
  Sentry.

Pending v2 polish:
- Add a "Reset Money tab to default view" toggle in Me-tab
  Display section so a surveyor stuck in a forgotten filter
  can clear without finding the chip.

**Batch NN — CSV preview "unknown format" fall-through (closes Batch AA v2 gap)**

Closes the small UX gap from Batch AA: when `parseCoordCsv`
detected `format='unknown'` (the file isn't P,N,E,Z,D or
N,E,Z,D,P), the preview screen still rendered the structured
6-column grid with `—` cells in every numeric / point / match
column. Surveyors saw a useless wall of em-dashes.

Now: unknown formats fall through to a generic raw-cells table
that uses `parseCoordCsv`'s `columnLabels` as headers + `row.raw`
as the cell values. Non-coord CSVs (vendor invoices, address
lists, anything tabular the surveyor attached) preview usefully
without leaving the app.

UI (`mobile/app/(tabs)/jobs/[id]/files/[fileId]/preview.tsx`):
- New `RawCellsTable` component renders horizontally-scrollable
  table with 110 px columns + 24-char per-cell truncation.
  Caps at 12 columns (footer says "+ N more columns hidden,
  open in another app to see them all").
- Stats bar branches on format: structured formats keep
  Rows / Matched / New; unknown formats swap Matched/New for a
  single Columns count (since name-matching is meaningless
  without a parseable point-name column).
- Footnote copy branches too: structured says "✓ means a data
  point with that name already exists"; unknown says "the
  format didn't match P,N,E,Z,D or N,E,Z,D,P — showing raw
  cells so you can still review the file."
- Format banner ("Detected format: Unknown — showing raw cells")
  was already in place from Batch AA; now it accurately
  describes the screen below.

Logging: no new lines — the parser already logs format
detection via the existing `csvPreview.parse` info breadcrumb.

Pending v2 polish:
- Pinch-to-zoom on the raw table for tablets.
- Detect specific known-non-coord shapes (Trimble JobXML CSV
  export, Carlson note-export) and render bespoke layouts.
- "Force PNEZD parsing" override that lets the surveyor try
  the structured grid even when auto-detect failed.

**Batch MM — sun-readable theme coverage audit (closes Batch Y v2 polish)**

Closes the Batch Y v2 polish item *"Migrate the remaining ~50
screens to `useResolvedScheme()` so the choice propagates
everywhere; current scope is the surveyor's daily field workflow
only."* Sun-readable mode now propagates through every screen
the surveyor lays eyes on plus every leaf component rendered
inside one.

26 files migrated in one batch (8 surveyor screens + 18 leaf
components). The migration is mechanical — swap
`useColorScheme() ?? 'dark'` → `useResolvedScheme()` and add the
`from '@/lib/themePreference'` import next to the existing
`from '@/lib/theme'` import. A Python regex pass handled it
consistently so no file was forgotten.

Migrated screens (`mobile/app/`):
- `(tabs)/jobs/index.tsx` (Jobs list)
- `(tabs)/jobs/[id]/index.tsx` (per-job detail)
- `(tabs)/jobs/[id]/notes/new.tsx` (add note modal)
- `(tabs)/money/index.tsx` (Money list)
- `(tabs)/money/capture.tsx` (receipt capture)
- `(tabs)/money/[id].tsx` (receipt detail)
- `(tabs)/me/uploads.tsx` (stuck-upload triage)
- `(tabs)/me/privacy.tsx` (privacy panel)
- `(tabs)/time/edit/[id].tsx` (time-entry edit)

Migrated leaf components (`mobile/lib/`):
- `Button.tsx`, `JobCard.tsx`, `PointCard.tsx`,
  `ReceiptCard.tsx`, `ThumbnailGrid.tsx`, `PhotoLightbox.tsx`,
  `TextField.tsx`, `StatusChip.tsx`, `NotificationBanner.tsx`,
  `TrackingConsentModal.tsx`, `LockOverlay.tsx`,
  `CaptureFab.tsx`, `Timesheet.tsx`, `PhotoAnnotator.tsx`,
  `Placeholder.tsx`, `RemotePhoto.tsx`, `LoadingSplash.tsx`.

Why this matters: a screen migrated in Batch Y but using a leaf
component still on `useColorScheme()` rendered the leaf in the
`'light'` palette (Appearance fallback) instead of `'sun'`. So a
surveyor flipped to sun-readable saw `palette.text='#000000'`
on the screen text but `JobCard`'s body text still rendered at
`#0B0E14` — close but not max-contrast. After Batch MM, every
foreground-text rendering inside a sun-readable surveyor screen
honours the high-contrast palette.

Out of scope (intentional):
- Auth screens (sign-in / forgot-password / reset-password /
  auth-callback) — pre-login, dim-lit indoor use; not high-
  priority for sun-read. Will migrate when touched for other
  reasons.
- `_layout.tsx` files — pass theme through `Stack.screenOptions`
  for chrome only; foreground readability isn't affected.
- Dev-only utilities (`Placeholder.tsx` was migrated since it's
  used in early-flow screens; `LockOverlay` since it surfaces
  during field idle-lock).

Logging: no new log lines — this is a pure refactor that
preserves runtime behaviour. The migration script pattern is
documented inline in this plan entry so future batches can
re-run it after new screens land.

Pending v2 polish:
- Auth + layout screens migration (~10 files; trivial once
  prioritised).
- Auto-detect "screen still uses useColorScheme" via a CI lint
  rule so the surveyor's surface stays at 100% sun-readable
  coverage.

**Batch LL — mobile receipts "needs review" filter (closes Batch Z UX gap)**

The amber "👀 N receipts need your review" badge from Batch Z was
informational only — tapping it did nothing. Surveyors with a
busy day asked "where ARE those?" and had to scroll the full
list. Batch LL makes the badge tappable: tap → filter the list
to needs-review only; tap × on the active chip → clear back to
all.

Mobile lib (`mobile/lib/receipts.ts`):
- `ReceiptListFilter` union (`'all' | 'needs-review'`).
- `useReceipts(limit, filter='all')` switches its SQL between
  the existing all-receipts query and a new needs-review query
  that exactly mirrors `useReceiptsNeedingReview`'s filter
  (extraction done · user_reviewed_at null · status pending ·
  not duplicate-discarded · deleted_at null). Both reach the
  same set so the badge count and the filtered list always
  agree.

Mobile screen (`mobile/app/(tabs)/money/index.tsx`):
- New `filter: ReceiptListFilter` state. Defaults to `'all'`.
- The amber review badge becomes a `<Pressable>` — tap →
  `setFilter('needs-review')`. Adds a `→` glyph to signal
  "tap me." Accessibility hint explains the filter behaviour.
- When the filter is active, the badge hides and a row above
  the list shows a "Filter: N receipts needing review" amber
  chip plus a circular `×` clear button. Tapping × restores
  `'all'`.
- New empty-state copy when the filter has zero matches: "All
  caught up — Nothing left to review. Tap clear to see all
  your receipts again." with a Clear-filter button.

Pending v2 polish:
- More filter chips: `'pending'` / `'rejected'` / `'this job
  only'` / `'last 7 days'`. v1 limits scope to needs-review
  since that's the only one with a count badge driving it.
- Persist the chosen filter across launches (e.g.
  AsyncStorage) so a surveyor reviewing one item at a time
  keeps their place between captures.

**Batch KK — Wi-Fi-only video upload gating (F4 closer)**

Closes the F4 deferral *"WiFi-only original-quality re-upload
tier per plan §5.4 (v1 uploads single-tier at the picker's
videoQuality: 0.7)."* Pragmatic v1 interpretation: the picker
now captures at original quality (1.0) and the upload queue
holds large clips (>10 MB) off cellular until Wi-Fi returns —
no separate transcode pipeline, no mystery wait, no surprise
bill. A true dual-tier transcoding pipeline is tracked as v2
polish.

Picker (`mobile/lib/storage/mediaUpload.ts`):
- Default `videoQuality` bumped 0.7 → 1.0 so the upload IS the
  original. Smaller clips (typical ≤30 s @ 1080p ≈ 8 MB)
  still upload immediately on cellular; a 5-minute walkthrough
  (~50 MB) waits for Wi-Fi.

Network (`mobile/lib/networkState.ts`):
- New `isOnWifiNow()` sync read + `useIsOnWifi()` reactive hook
  on top of NetInfo's `state.type`. Treats `'wifi'` and
  `'ethernet'` as no-cellular-budget concern; everything else
  (cellular / unknown / VPN / bluetooth) gates Wi-Fi-only
  uploads.

Schema (`mobile/lib/db/schema.ts`):
- `pending_uploads.require_wifi` integer column added to the
  local-only queue table. PowerSync's localOnly contract means
  no seed migration is needed — schema bumps roll out with
  the next mobile build.

Upload queue (`mobile/lib/uploadQueue.ts`):
- `EnqueueOptions.requireWifi?: boolean` plumbed through.
- Synchronous attempt path skips the upload when
  `requireWifi && !isOnWifiNow()`, AND flips the parent
  `field_media.upload_state` to `'wifi-waiting'` so the mobile
  tile shows the right badge instead of a stuck "Uploading…".
- `processQueue` SQL filters `require_wifi=0` rows on cellular,
  pulls all rows on Wi-Fi. The drainer subscribes to NetInfo
  on every change so a cellular → Wi-Fi transition fires
  another batch automatically.

Capture (`mobile/lib/fieldMedia.ts`):
- New `WIFI_ONLY_BYTES_THRESHOLD = 10 MB`.
- `useAttachVideo` computes `requireWifi = file_size >
  threshold` and passes it through to `enqueueAndAttempt`.
- Success log line carries `require_wifi: bool` for ops
  visibility ("how often does this kick in?").

Pending v2 polish:
- True dual-tier transcoding: the worker (already has
  ffmpeg-static from Batch GG) transcodes the original →
  480p cellular tier on upload, mobile reads
  `cellular_url` first / `original_url` when on Wi-Fi.
- Me-tab "data-saver" toggle that drops the threshold to
  zero (everything Wi-Fi-only) for surveyors with strict
  data plans.
- Per-job override on long shoots (sometimes the surveyor
  WANTS the cellular hit on a critical clip).

**Batch JJ — admin receipts bulk-approve (closes Batch FF v2 polish)**

Closes the Batch FF v2 polish item *"Bulk-approve action —
checkboxes in the row + a top-of-list '✓ Approve N selected'
button so the bookkeeper can clear the pending queue in one tap."*
A bookkeeper with 30 pending receipts can now clear the whole
queue in one click instead of 30 individual taps.

API (`app/api/admin/receipts/bulk-approve/route.ts`):
- `POST /api/admin/receipts/bulk-approve` body `{ ids: string[] }`,
  returns `{ approved: string[], skipped: { id, reason }[] }`.
- Hard cap: 200 rows per request (queue rarely exceeds 50/day;
  ceiling stops a runaway client from approving thousands by
  accident).
- Per-row classifier surfaces typed skip reasons —
  `not_found | already_approved | rejected | exported |
  soft_deleted | unknown_status`. The UI surfaces these so the
  bookkeeper sees why a row didn't transition.
- Single bulk UPDATE with `WHERE status='pending'` guard so a
  TOCTOU between SELECT and UPDATE (someone approved a row
  manually mid-batch) is caught — those rows surface as
  `already_approved` skips so the count math still holds.
- Resolves the admin's `auth.users.id` once for the batch via
  the same `listUsers` lookup the per-row PATCH uses, then
  stamps `approved_by` + `approved_at = now()` +
  `rejected_reason = null` on every approved row.

Page (`app/admin/receipts/page.tsx`):
- New `selectedIds: Set<string>` + `bulkBusy` state on the
  pending tab. Selection clears whenever the active tab
  changes so a stale set can't leak.
- Per-row checkbox sibling to the existing row-summary
  button. `stopPropagation` keeps the checkbox click from
  toggling row expansion. Only renders when the row is
  approve-able (status='pending' + not deleted).
- "Select all N pending" label at the top of the list when
  there are approve-able rows. Uses `every`-style logic so the
  checkbox stays consistent when the bookkeeper expands /
  collapses the selection.
- Sticky action bar pinned to the bottom of the page when
  selection > 0: "N selected · Clear · ✓ Approve N selected."
  Confirms with `window.confirm` ("Approve N receipts? This
  stamps your name as the approver.") before commit.
- After commit, clears the selection + reloads the list. Skip
  reasons surface as a single alert ("Approved X · skipped Y
  (reasons…)") so the bookkeeper isn't surprised.

Logging:
- `console.log` summary line on every commit
  (`requested=N approved=M skipped=K admin_email=…`) for
  audit-trail correlation.
- `console.error` on the underlying SELECT / UPDATE failures.

Pending v2 polish:
- Bulk-reject mirror with a shared rejection-reason input
  (currently rejection is per-row only because reasons are
  per-receipt).
- Admin keyboard shortcut: ⌘A select-all on the pending tab.
- Surface the audit-trail of bulk-approves on the receipt
  detail screen so the bookkeeper can answer "did I bulk-
  approve this row, or hand-approve it?" months later.

**Batch II — mobile per-job "Today's captures" rollup**

Surveyors arriving at a job in the truck want a one-glance answer
to *"where am I on this job today?"* — clock state, hours logged
so far, captures by type, receipts so far. Mobile mirror of the
admin `/admin/jobs/[id]/field` rollup.

Mobile lib (`mobile/lib/jobs.ts`):
- New `useJobTodayRollup(jobId)` hook. Reactive against PowerSync's
  local SQLite — fully offline, updates as the surveyor captures
  throughout the day.
- Single SQL query joins **eleven** aggregations in one round-trip:
    - points / photos / videos / voice / notes / files / receipts
      counts (per current user, per job, today)
    - receipts total in cents
    - closed time-entries' duration_minutes sum
    - open time-entries count + earliest open `started_at`
- Per-user scope — every count filters by `created_by =
  :userId` (or `user_email` for time / notes; `user_id` for
  receipts) so two crew members on the same job each see their
  own day. Job is the shared context; captures aren't.
- "Today" anchored on the device-local midnight ISO so a 6 AM
  cold-start shows the right day even if the user crossed
  midnight in airplane mode.
- `minutesToday` is exact: closed entries' stored
  `duration_minutes` plus the open entry's
  `(now − started_at)` → live ticker accurate.
- `isClockedIn` flips to true when any open entry exists for the
  user on this job today.

UI (`mobile/lib/JobTodayRollup.tsx`):
- New `<JobTodayRollupCard>` component with:
    - Top row: "Today · Tue Apr 28" label + clock-state pill
      ("🟢 Clocked in" green when active, "⚪ Off the clock"
      neutral otherwise).
    - Big primary number: `H:MM` worked today (36 px font;
      drives at-a-glance orientation).
    - Six-tile grid (3 cols × 2 rows): 📍 points · 📷 photos
      · 🎬 videos · 🎙 memos · 📝 notes · 📎 files. Zero-counts
      render at 55% opacity so a fresh-morning card reads
      "fresh start" without looking empty/broken.
    - Receipts strip (only when `receiptsToday > 0`):
      `🧾 N receipts · $X.YZ`.
    - Empty hint when nothing has been captured.
    - Big "+ Capture" CTA at the bottom — tap deep-links to
      `/(tabs)/capture?jobId=...`.

Per-job screen (`mobile/app/(tabs)/jobs/[id]/index.tsx`):
- New `<JobTodayRollupCard>` rendered between the header
  actions row and the Client section so it's the first
  scrollable block the surveyor sees.

Logging:
- `jobs.useJobTodayRollup` logs query failures with `job_id`
  for ops correlation.

Pending v2 polish:
- Per-day paging — let the surveyor scrub backwards to
  yesterday / last week to review historical days.
- Add today's miles + stops counts when those become naturally
  per-job (currently only the geofence-classifier-tagged stops
  carry `job_id`).
- Tap-into deep-links from each tile (📷 → photos screen with
  date filter, 🧾 → receipts list filtered to this job + today).

**Batch HH — OTA updates wiring (F0 closer)**

Closes the F0 deferral *"OTA updates working — `expo-updates`
installed but `app.json` has no `'updates'` block (no channel URL
set). Need to flip on once EAS Update is provisioned."* JS-only
fixes can now ship without an EAS build + store-review delay
(once the operator provisions the EAS Update channel).

Two-channel update strategy:

1. **Silent cold-start check** (`useCheckForUpdatesOnLaunch`)
   mounts at the root layout. On every launch, in production builds
   with reception:
     - `Updates.checkForUpdateAsync()` against the EAS CDN
     - On `isAvailable=true` → `fetchUpdateAsync()` →
       `reloadAsync()` so the next paint runs the new bundle
     - 60 s timeout caps blocked startups; offline / dev / not-
       enabled paths skip silently
2. **Manual "Check for updates"** (`useManualUpdateCheck`) lives
   on the Me tab "About" row. Returns explicit state
   (`'idle' | 'checking' | 'downloading' | 'no-update' |
   'ready-to-restart' | 'error'`) so the UI can render captions +
   the "Restart to apply" CTA. Surveyor finishes their current
   task before yanking the JS context.

Mobile lib (`mobile/lib/otaUpdates.ts`):
- Both hooks wrap every async call in try/catch + log a warn
  breadcrumb. Network failures, CDN 5xx, no-channel-configured
  all degrade silently.
- `getAppVersionInfo()` returns `{ appVersion, runtimeVersion,
  channel, updateId, enabled }` for the About row.

Root layout (`mobile/app/_layout.tsx`):
- New `<OtaUpdatesReconciler />` sibling to
  `<UploadQueueDrainer />` + `<PinnedFilesReconciler />`.

Me-tab About section (`mobile/app/(tabs)/me/index.tsx`):
- New `AboutRow` component renders inside an "About" section.
  Shows app name + `v0.0.1 · production channel` + bundle ID
  prefix when running an OTA. State-aware caption underneath
  ("You're up to date." / "Update ready. Tap 'Restart to apply'
  to use it." / "Couldn't check: No reception").
- Primary action: "Check for updates" → "Restart to apply"
  (state-aware) → `Updates.reloadAsync()`.
- When `Updates.isEnabled === false`, the row tells the user to
  install from the App Store / Play Store instead.

Config (`mobile/app.json`):
- `updates` block added: `enabled: true`,
  `checkAutomatically: 'ON_LOAD'`, `fallbackToCacheTimeout: 0`,
  `url: 'REPLACE_WITH_EAS_UPDATE_URL'`.
- `runtimeVersion: { policy: 'appVersion' }` was already in
  place.

Activation gate (operator):
1. Run `eas update:configure` to get the channel URL (e.g.
   `https://u.expo.dev/<project-id>`).
2. Replace the `REPLACE_WITH_EAS_UPDATE_URL` placeholder.
3. Build + submit a binary that bakes the URL in. Subsequent
   JS-only fixes ship via `eas update --branch=production`
   without a new build.

Logging:
- `otaUpdates.coldStart` info/warn for the silent path.
- `otaUpdates.manualCheck` for user-triggered checks.
- All log lines carry `current_id` so a Sentry trace can
  correlate stale-bundle reports.

Pending v2 polish:
- Per-environment EAS channels (dev / preview / production)
  with auto-routing via `EAS_BUILD_PROFILE`.
- "What's new" changelog modal that surfaces release notes from
  the update manifest's `extra` field on first cold-start after
  applying.
- Forced-update gate that blocks the surveyor from continuing
  on a known-bad bundle (rare; useful when a critical bug
  ships).

**Batch GG — server-side video thumbnail extraction (F4 closer)**

Closes the F4 deferral *"server-side thumbnail extraction (FFmpeg
via worker) so the gallery thumbnail isn't a placeholder."* Every
video the surveyor records now gets a real poster-frame JPEG
written to the photo bucket and surfaced in `field_media.thumbnail_url`
within ~30 s of upload — admin viewer + mobile Videos grid switch
from the 🎬 placeholder glyph to a recognizable still automatically.

Schema (`seeds/231_starr_field_video_thumbnails.sql`):
- `field_media.thumbnail_extraction_status` (`queued | running |
  done | failed`) — same state machine as
  `extraction_status` (receipts) and `transcription_status`
  (voice).
- `field_media.thumbnail_extraction_error` for the truncated
  failure reason.
- `field_media.thumbnail_extraction_started_at` +
  `thumbnail_extraction_completed_at` for the watchdog +
  ops-correlation.
- Two partial indexes: `idx_field_media_thumb_extract_queued` for
  the worker poll, `idx_field_media_thumb_extract_running` for
  the watchdog sweep.
- Apply AFTER seeds/221.

Mobile (`mobile/lib/db/schema.ts`, `mobile/lib/fieldMedia.ts`):
- Schema mirrors the four new columns.
- `useAttachVideo` INSERT now sets
  `thumbnail_extraction_status='queued'` so the worker's
  poll-filter immediately sees the row when `upload_state` flips
  to `'done'`.

Worker service (`worker/src/services/video-thumbnail-extraction.ts`):
- `processVideoThumbnailBatch(supabase, opts)` returns
  `{ total, done, failed, skipped, results }`.
- Uses the **ffmpeg-static** binary (~50 MB prebuilt; no host
  ffmpeg dep). Spawn pattern: `-ss 1 -i input.mp4 -frames:v 1
  -vf scale=640:-2 -q:v 4 out.jpg`. For very short clips
  (`duration_seconds < 1.5`) seeks to 0 instead of 1 s so the
  fade-out doesn't return a black frame.
- 30 s ffmpeg timeout per video. Hard 200 MB cap on input
  (skips with `over_size_cap` reason).
- Race-safe `claimRow` UPDATE flips `queued → running` so two
  workers can't double-process the same row.
- Watchdog sweeps `running` rows whose
  `thumbnail_extraction_started_at` is older than 5 min and
  re-queues them (covers crashed workers + container restarts).
- Cleanup is bullet-proof: `mkdtemp` per row + `rm -rf` in
  `finally` — no temp leaks.

Storage path convention:
- Thumbnail uploads to `starr-field-photos` at
  `{user_id}/{media_id}-thumb.jpg`. The `user_id` segment is
  parsed from the source video's `storage_url` so the photo
  bucket's RLS aligns with the source.
- `upsert: true` so re-extracts (rare) overwrite cleanly
  without leaking storage objects.

CLI (`worker/src/cli/extract-video-thumbnails.ts`):
- Mirrors the receipt + voice CLIs: one-shot mode + `--watch`
  loop polling every 60 s. Tunable `--batch-size` (default 5,
  max 20).
- npm script: `npm run extract-video-thumbnails -- --watch`.

Worker package: adds `ffmpeg-static ^5.2.0` dep + the new npm
script. No host ffmpeg required — the prebuilt binary ships
with the package.

Logging:
- `video-thumb` ProcessLogger emits structured logs at
  info/warn/error. Per-row context (`media_id`, `storage_url`,
  `thumb_bytes`, `seek_sec`) so Sentry can correlate failures
  with bucket-config issues.
- CLI summary line on every batch: `done=N failed=M skipped=K
  KB written`.

Activation gate: apply `seeds/231` to live Supabase + run
`npm install` on the worker (adds ~50 MB for ffmpeg-static)
before scheduling the cron. Mobile insert already writes the
`'queued'` state so the worker picks rows up immediately on
startup.

Pending v2 polish:
- WiFi-only original-quality re-upload tier per plan §5.4 (the
  last F4 deferral). Currently single-tier upload at the
  picker's `videoQuality: 0.7`.
- Multi-frame thumbnail for videos > 60 s (so the gallery
  shows a 4-up grid representative of the whole clip).
- Time-travel thumbnail (let the surveyor scrub to a frame
  they want as the poster instead of the auto-1s default).

**Batch FF — admin "Show deleted" toggle on /admin/receipts (closes Batch CC audit-trail UX)**

Closes the Batch CC v2 polish item *"Admin 'Show deleted' toggle on
`/admin/receipts` so the bookkeeper can review tombstones for audit
prep."* Tombstoned receipts (Batch CC) are an audit-trail artifact
— hidden from the daily queue, but the office reviewer needs them
visible during IRS prep + dispute resolution.

API (`app/api/admin/receipts/route.ts`):
- New `?include_deleted=1` (also `true` / `yes`) query param.
- Default behaviour is unchanged: tombstones are filtered via
  `deleted_at IS NULL`.
- When `include_deleted` is truthy, the filter is skipped so
  tombstones flow through. Existing `select('*')` already pulls
  the `deleted_at` + `deletion_reason` columns.

Page (`app/admin/receipts/page.tsx`):
- New "Show deleted" checkbox in the filter row, with a tooltip
  explaining the audit-prep use case.
- Reactive — toggling re-runs the load with the new query param.
- ReceiptRow's right-side chip column now renders a "🗑 deleted"
  red chip when `deleted_at` is set. Hover-tooltip shows the
  deletion timestamp + reason ("user_undo" / "duplicate" /
  "wrong_capture") so the bookkeeper has the full context
  without expanding the row.
- AdminReceiptRow type extended with `deleted_at` +
  `deletion_reason` mirroring the API row shape.

Pending v2 polish:
- Bulk-approve action — checkboxes in the row + a top-of-list
  "✓ Approve N selected" button so the bookkeeper can clear the
  pending queue in one tap. Requires a new
  `POST /api/admin/receipts/bulk-approve` endpoint with array
  body + per-row error-collection.
- "Restore" action on tombstoned rows — flips `deleted_at`
  back to null when the bookkeeper decides a delete was
  premature (e.g. user discarded a real-but-similar receipt as
  duplicate).

**Batch EE — missing-receipt deep-link pre-fill (closes Batch DD UX loop)**

Closes the Batch DD v2 polish item *"Receipt-capture screen
consumes `?stopId=` + `?stopArrivedAt=` query params to pre-fill
`transaction_at`. v1 routes to the capture screen but doesn't
pre-fill."* Tapping a "Forget a receipt?" notification now lands
on the capture screen with:
  - an amber "🧾 Forget a receipt?" callout banner above the
    capture controls, telling the surveyor we'll stamp the
    receipt with the stop's arrival time
  - the new receipt row pre-stamped with `transaction_at` =
    stop arrival ISO + `location_stop_id` = stop UUID

`transaction_at` pre-fill matters because:
  - AI extraction has a head-start — Claude Vision compares
    against the pre-filled value rather than parsing it from
    scratch.
  - The Batch Z dedup-fingerprint is computable on insert
    (vendor will land later, but the date component is already
    correct).
  - The Batch CC review screen's "Captured" row shows a
    sensible default while AI is still running.

`location_stop_id` pre-fill matters because:
  - The bookkeeper can trace from the receipt to the stop that
    prompted it, useful for audit prep.
  - The Batch DD scan auto-skips stops with already-linked
    receipts on subsequent runs (the receipt-window check picks
    them up via `transaction_at` proximity).

Notification routing (`mobile/lib/notificationsInbox.ts`):
- `'missing_receipt'` joins `AdminPingSourceType` so type-aware
  consumers can branch on it.
- `deepLinkForSourceType('missing_receipt')` returns
  `{ pathname: '/(tabs)/money/capture' }` as a fallback when the
  notification's `link` couldn't be parsed.

Capture flow (`mobile/lib/receipts.ts`):
- `CaptureOptions` gains `transactionAt?: string | null` +
  `locationStopId?: string | null`.
- INSERT carries both fields (or null) so the row is correct
  from creation. PowerSync's CRUD queue replays the full row.
- Success log line includes `prefilled_transaction_at` +
  `prefilled_stop_id` flags so ops can correlate adoption.

Capture screen (`mobile/app/(tabs)/money/capture.tsx`):
- Reads `useLocalSearchParams` for `stopId` + `stopArrivedAt`.
- Renders the amber "Forget a receipt?" callout with the human
  readable stop time when both params are present.
- Passes both through to `useCaptureReceipt`.

Logging:
- `receipts.capture` 'attempt' line carries
  `prefilled_transaction_at` + `prefilled_stop_id` booleans for
  ops visibility.

Pending (still v2):
- Per-user notification preferences for opting out of
  missing-receipt prompts on the Me tab.
- AI categorization that lets the prompt body say "gas station"
  vs "restaurant" instead of generic "stop."

**Batch DD — missing-receipt cross-reference prompts (F6 closer)**

Closes the F6 deferral *"Missing-receipt cross-reference prompts —
should compare clocked-in geofences against receipt timestamps
and prompt 'you spent 12 min at a gas station yesterday but no
receipt was logged.' Worker job + mobile inbox notification."*

Hourly cron scans the last 24h of `location_stops` and pushes a
notification through the existing dispatcher-ping inbox flow
(Batch B) when a long-enough non-job-site stop has no associated
receipt. Surveyor taps the inbox row → deep-link straight to the
receipt-capture screen with the stop time encoded in the URL.

Worker service (`worker/src/services/missing-receipt-detection.ts`):
- `processMissingReceiptScan(supabase, opts?)` returns
  `{ candidateStops, receiptCovered, alreadyNotified, capped,
   inserted, errors }` so the CLI can emit a summary.
- Detection rule (v1):
    - duration_minutes ≥ 5 (skip parking-stoplight stops)
    - arrived_at within last 24h (don't spam old stops)
    - `job_id IS NULL` — geofence classifier (Batch Q) sets
      job_id on matched-fence stops; we skip those because a
      known job site is by definition a place we don't expect a
      separate receipt for.
    - `user_overridden != true` (surveyor has explicit category
      control over overridden stops).
    - NO `receipts.transaction_at` within ±30 min of
      `arrived_at..departed_at`. Soft-deleted receipts (Batch
      CC) don't count.
    - NOT already notified — we encode the stop_id in the
      notification link so a SELECT against `link LIKE
      '%stop_id%'` gives idempotency without a new column.
- Performance pattern: single bulk fetch of stops + receipts +
  prior notifications, then in-memory per-stop matching. O(n)
  per scan, no per-stop SQL hit.
- Per-user-per-scan cap: 5 notifications. A surveyor with a
  busy day of unknown stops gets the most-recent 5 instead of a
  flood.

CLI (`worker/src/cli/scan-missing-receipts.ts`):
- Mirrors the `transcribe-voice` + `extract-receipts` patterns:
  one-shot mode (`node dist/cli/scan-missing-receipts.js`),
  `--watch` mode (1-hour poll loop), tunable
  `--per-user-cap` / `--min-duration` /
  `--receipt-window` / `--hours-back`.
- npm script alias: `npm run scan-missing-receipts -- --watch`.

Notification shape:
- title: "Forget a receipt?"
- body: "You stopped for 18 min at Tue 3:42 PM. If that was a
  gas / food / supplies run, snap the receipt now — tap to
  capture."
- icon: 🧾
- link: `/(tabs)/money/capture?stopId=...&stopArrivedAt=...`
  — the existing notification-route handler routes the tap to
  the receipt capture screen.
- expires_at: 48 h from creation. Stale prompts auto-tomb.

Activation gate:
- Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on the
  worker. Schedule the CLI hourly via cron / pm2 / systemd.
- Geofence classifier (seeds/227 + Batch Q) should already be
  applied so matched-job-site stops get filtered out at the
  source — without it, every job-site visit would generate a
  spurious "forget a receipt?" prompt. v1 will still send
  prompts for un-fenced visits to known sites; the dispatcher
  uses `/admin/timeline` "📍 Set as job site" to capture
  those over time.

Pending v2 polish:
- AI categorization: classify "fuel" vs "food" vs "supplies"
  per stop so the prompt body is more specific ("You spent 18
  min at a gas station — snap the receipt"). Depends on the
  deferred AI stop classifier from Batch J.
- Receipt-capture screen consumes `?stopId=` + `?stopArrivedAt=`
  query params to pre-fill `transaction_at`. v1 routes to the
  capture screen but doesn't pre-fill.
- Per-user notification preferences (opt-out of missing-receipt
  prompts entirely on the Me tab).

**Batch CC — receipt soft-delete + IRS retention foundation (F2 audit closer)**

Closes the F2 audit-additions deferral *"Soft-delete + IRS 7-year
retention — receipts table currently hard-deletes on user
delete."* Surveyor-side delete now leaves the audit trail in
place (the row tombstones with `deleted_at` instead of being
purged), which is the IRS contract. The retention sweep CLI
that actually hard-deletes rows past the retention window is
tracked as v2 polish.

Schema (`seeds/230_starr_field_receipt_retention.sql`):
- `receipts.deleted_at TIMESTAMPTZ` — NULL = visible, non-null
  = soft-deleted.
- `receipts.deletion_reason TEXT` with a CHECK constraint to
  `'user_undo' | 'duplicate' | 'wrong_capture'`. Optional;
  helps the bookkeeper triage why a row was tombstoned.
- Partial index `idx_receipts_user_time_visible (user_id,
  created_at DESC) WHERE deleted_at IS NULL` so the per-user
  list scan stays fast even after years of accumulation.
- Partial index `idx_receipts_deleted_at` covering rows where
  `deleted_at IS NOT NULL` so the future retention sweep is
  cheap.
- New RLS policy `receipts_owner_soft_delete` allows the user
  to UPDATE `deleted_at` + `deletion_reason` on their own
  pending / rejected rows. Hard DELETE remains revoked from
  `authenticated` — only `service_role` (worker) can purge.

Mobile contract (`mobile/lib/db/schema.ts`,
`mobile/lib/receipts.ts`):
- Mobile schema mirrors the two new columns.
- `useDeleteReceipt(receipt, reason?)` now `UPDATE`s
  `deleted_at + deletion_reason + updated_at` instead of
  `DELETE`-ing. Rejects the call when `status` is
  `'approved' | 'exported'` (same lock as before).
- `removeFromBucket` cleanup is dropped from the delete path
  — the photo stays in storage so an IRS auditor reviewing
  a tombstoned row can still see the captured image. The
  retention sweep is the only path that purges bucket
  objects.
- `useReceipts` (Money-tab list), `useJobReceiptRollup`
  (per-job mileage rollups), and `useReceiptsNeedingReview`
  (Batch Z review badge count) all filter `deleted_at IS
  NULL` so tombstoned rows disappear from the surveyor's
  view.
- `useReceipt(id)` and `useReceiptRow(id)` deliberately do
  NOT filter so a user can navigate to a tombstoned row to
  review the audit trail (and see "Discarded as duplicate"
  on the dedup banner if applicable).
- `useResolveReceiptDuplicate` discard path also stamps
  `deleted_at + deletion_reason='duplicate'` so the
  duplicate-discard flow naturally creates an audit-ready
  tombstone in one transaction.

Activation gate: apply `seeds/230` to live Supabase before the
mobile build that ships this batch — without the columns, the
`UPDATE … SET deleted_at = …` would fail. PowerSync CRUD
queue replay handles the transition naturally for any in-flight
mobile delete that lands after the seed applies.

Pending v2 polish:
- Worker retention sweep CLI: scans for rows where
  `deleted_at < now() - retention_threshold` and hard-deletes
  bucket object + DB row in one transaction. Threshold per
  IRS class (3 yr for clean returns, 7 yr for substantial
  under-reporting, 90 days for never-approved).
- Mobile "Recently deleted" panel under Me → Storage so the
  surveyor can undo within ~24h.
- Admin "Show deleted" toggle on `/admin/receipts` so the
  bookkeeper can review tombstones for audit prep.

**Batch BB — cross-notes search (F4 closer)**

Closes the F4 deferral *"Search across notes + transcriptions —
depends on the above + an FTS index. Need to confirm whether
server-side `tsvector` columns or local SQLite FTS5 is the
better path."* Surveyors hit the 🔍 button on the Jobs tab and
type a few characters; results render across every active note
on this device with the matched term highlighted.

Decision: **offline-first LIKE-scan for v1**, not FTS5 / tsvector.
Reasoning:
  - PowerSync's local SQLite mirrors `fieldbook_notes` +
    `field_data_points` + `jobs` already, so a six-column LIKE
    join lands fully offline with no schema changes.
  - Per-user note volume in v1 (~5 surveyors × ~10 notes/day ×
    weeks of retention) stays well under the 1k-row threshold
    where LIKE starts to feel slow on a phone.
  - FTS5 (or server `tsvector`) becomes worthwhile when the
    dataset crosses ~10k rows per device or when admin-side
    cross-user search ships. Tracked in §9.w as v2 polish.

Mobile lib (`mobile/lib/fieldNotes.ts`):
- New `useSearchFieldNotes(query, limit = 50)` hook. Returns
  `{ hits, isLoading }` where `hit = { note, jobName,
  jobNumber, pointName }`. Empty hits when the trimmed query
  is <2 chars (avoids "a" returning everything).
- Single SQL query joins fieldbook_notes ⨝ field_data_points ⨝
  jobs and ORs six LIKE clauses against `body`,
  `structured_data`, `note_template`, point name, job name,
  and job_number. Results sorted by `created_at DESC`.
- Returns active rows only (`is_current = 1`).

Mobile screen (`mobile/app/(tabs)/jobs/search.tsx`):
- Modal-presented (slides up from the bottom) with auto-focus
  text input + glyph + clear button.
- Empty states for: nothing typed yet · 1 char so far · search
  in progress · zero results.
- Result count line ("12 results") with a "(capped)" suffix
  when the limit hits.
- ResultCard with template pill / "Free-text" badge, age stamp,
  highlighted match excerpt clipped to a 140-char window
  centred on the first match, and a footer with job number +
  name + point name.
- HighlightedText component splits the body around every
  case-insensitive match and renders matches in the accent
  colour, bold. Preserves original casing.
- Tap a result → push `(tabs)/jobs/[id]/points/[pointId]` for
  point-attached notes; push `(tabs)/jobs/[id]` for job-level
  notes.

Routing (`mobile/app/(tabs)/jobs/_layout.tsx`):
- New `<Stack.Screen name="search" />` registered with
  `presentation: 'modal'` + `slide_from_bottom` for the modal
  feel. Cancel button at the top dismisses.

Entry (`mobile/app/(tabs)/jobs/index.tsx`):
- 🔍 Search pill in the Jobs-tab header (right of the count)
  pushes the search screen.

Logging:
- Query failures log via `fieldNotes.useSearchFieldNotes` with
  the trimmed query for ops correlation.

Pending v2 polish:
- Server-side `tsvector` index for cross-user admin search at
  scale (so the office can grep across every surveyor's notes
  for compliance reviews).
- SQLite FTS5 ranking when local datasets exceed ~10k notes —
  drops the LIKE scan in favour of a ranked virtual-table
  query.
- Voice-transcript search (currently `field_media.transcription`
  isn't joined into the search; needs a UNION query when the
  Whisper worker results land).

**Batch AA — CSV (P,N,E,Z,D) parser + match-to-points preview (F5 closer)**

Closes the F5 deferral *"CSV parser (P,N,E,Z,D and variants);
auto-link CSV rows to phone-side data points by name."* When a
surveyor attaches a Trimble / Carlson / Topcon coordinate export
to a job and taps the file row, they now land on an in-app
preview that auto-detects the format, parses the rows, and
matches each row's point name against the points already captured
in the field. ✓ rows are tied; "New" rows are unrecorded.

Pure parser (`mobile/lib/csvCoords.ts`):
- `parseCoordCsv(text)` returns `{ format, separator, hasHeader,
  columnLabels, rows, parsedCount, warnings }`.
- Separator auto-detect (`sniffSeparator`): comma / tab /
  semicolon, picked by frequency on first 500 chars; tab beats
  comma when both present.
- Header-row auto-detect via `looksLikeHeader`: a row with no
  numeric cells + ≥3 columns is a header (e.g. `P,N,E,Z,D`);
  data rows have 3+ numerics. Falls back to "treat first row as
  data" when the data-row sample fails to detect a format.
- Format auto-detect via `detectFormat`: looks at the first 5
  data rows + counts how many fit each candidate. P,N,E,Z,D
  (point name first) wins when col 0 is alpha + cols 1..3 are
  numeric. N,E,Z,D,P (point name last) wins when cols 0..2 are
  numeric + col 3 is alpha.
- RFC-4180-ish `splitLine` handles double-quote escapes +
  embedded separators inside quoted cells.
- `isNumeric` accepts comma-as-thousands-separator (some
  European exports). `toNumber` strips commas before parseFloat.
- `matchedRowNames(rows, knownNames)` returns a Set for O(1)
  match lookups in the UI.
- Pure module. No React, no Supabase, no expo. Trivially
  testable.

Preview screen (`mobile/app/(tabs)/jobs/[id]/files/[fileId]/preview.tsx`):
- Resolves bytes via three-tier cascade:
    1. pinned_files.local_uri (offline-safe; instant)
    2. pending_uploads.local_uri (upload queue's copy if not
       synced yet)
    3. signed-URL fetch to cacheDirectory (only path needing
       reception)
  Shows "Loaded from your pinned copy" / "from the upload
  queue" / "from the server" so the user knows which path won.
- 5 MB cap on in-memory parsing — over that, the screen offers
  the share-sheet fallback so the user can open in Numbers /
  Excel without freezing the JS thread.
- Stats bar: Rows · Matched · New.
- Format banner: "P, N, E, Z, D — point name first · comma-
  separated · header row skipped" (or "Unknown — showing raw
  cells").
- Coordinate grid: per-row #, Point + Description, N / E / Z,
  Match column with ✓ / "New" / "—" badges.
- "Open in another app" fallback button hands the file to
  `useOpenJobFile()` so the share-sheet path stays one tap
  away.

Routing (`mobile/app/(tabs)/jobs/[id]/_layout.tsx`):
- New `<Stack.Screen name="files/[fileId]/preview" />` registered
  alongside the existing per-point and notes routes.

UX integration (`mobile/app/(tabs)/jobs/[id]/points/[pointId].tsx`):
- File-row tap branches: CSV files (by content_type or `.csv`
  extension) push the preview screen; everything else still hits
  the share-sheet open path.
- File-row title prefix flips: 📊 for CSV (signals "tap to
  preview"), 📍 for pinned, 📎 for everything else.

Logging:
- `csvPreview.parse` logs format + row count + warnings + byte
  source on success; `csvPreview.parse` logs errors on failure.
- Cleanup on the cache copy is left to the OS (cacheDirectory
  is reaped automatically on low-storage events).

Pending v2 polish:
- Auto-import unmatched rows as new data points — a "+ Import N
  unmatched rows" CTA at the top of the preview that creates
  field_data_points entries with the parsed N/E/Z + description.
  Needs a coordinate-system picker (state plane vs lat/lon) so
  the captured-on-device GPS columns match the import.
- Per-row reverse-matching by GPS distance for rows whose names
  don't match — surveyors sometimes rename a point in Trimble
  after capture; matching by proximity catches those.

**Batch Z — receipt duplicate detection + review-before-save (F2 closer)**

Closes the user's directive: *"We also need to make sure we are
not uploading duplicate receipts, so AI needs to be able to
recognize whenever there is likely a duplicate receipt and needs
to prompt the user to ask them if they still want to save it or
discard the duplicate. Also, whenever a receipt is uploaded, it
needs to scan the receipt and store the data, but it needs to ask
the user to review the information to make sure it is actually
correct."*

Two coupled features ship together because they share the same
post-extraction lifecycle stage.

Schema (`seeds/229_starr_field_receipt_review.sql`):
- New `receipts.dedup_fingerprint TEXT` — computed by the worker:
  `lower(alnum-only(vendor)) || '|' || total_cents || '|' ||
  YYYY-MM-DD(transaction_at)`. Two receipts from "Lowe's #1234"
  and "LOWES STORE 1234" both normalise to `lowes1234` and match.
- New `receipts.dedup_match_id UUID REFERENCES receipts(id)` —
  the prior matching row the worker found (if any).
- New `receipts.dedup_decision TEXT 'keep' | 'discard'` — the
  user's call.
- New `receipts.user_reviewed_at TIMESTAMPTZ` — set the moment
  the user taps "Confirm receipt." Until then the row shows the
  yellow "👀 Tap to review" badge in the list.
- New `receipts.user_review_edits JSONB` — sparse audit trail
  of which fields the user changed during review. Empty object
  = "reviewed, no edits noted." Distinct from null = "never
  reviewed."
- Two partial indexes: dedup-lookup `(user_id, dedup_fingerprint)
  WHERE dedup_fingerprint IS NOT NULL AND status != 'rejected'`
  for the worker's match query; needs-review
  `(user_id, created_at DESC) WHERE user_reviewed_at IS NULL AND
  extraction_status = 'done' AND status = 'pending'` for the
  list-side reactive query.

Worker (`worker/src/services/receipt-extraction.ts`):
- `markDone()` now computes the fingerprint AFTER picking the
  final values (post-COALESCE so user mid-edit values win),
  then runs a single SELECT to find a prior non-rejected
  receipt with the same `(user_id, dedup_fingerprint)`.
- When a match is found, writes `dedup_match_id` on the new row.
  We do NOT auto-discard — two $5 coffees on the same day at
  the same shop are legit; the user makes the call.
- Dedup query failures log + continue (worse case the warning
  card doesn't render; the receipt still saves).
- New exported `computeDedupFingerprint(vendor, totalCents,
  transactionAt)` helper — pure function, easy to test, used by
  the mobile side too if a future "instant client-side dup
  preview" wants to call it.

Mobile lib (`mobile/lib/receipts.ts`):
- `useConfirmReceiptReview(id, edits?)` — stamps
  `user_reviewed_at = now()` + writes `user_review_edits` JSON.
- `useResolveReceiptDuplicate(id, 'keep' | 'discard')` — records
  the decision; 'discard' also flips status to 'rejected' with
  `rejected_reason = 'duplicate'`.
- `useReceiptRow(id)` — non-loading-wrapper variant that powers
  the duplicate-match preview card (different from the existing
  `useReceipt(id)` which returns `{receipt, isLoading}`).
- `useReceiptsNeedingReview()` — reactive count for the Money
  tab header pill.

Mobile UI:
- `(tabs)/money/[id].tsx` (receipt detail):
    - New `<DuplicateBanner>` at the top — amber when undecided,
      flips to muted-confirmed once the user picks. Shows the
      matching receipt's vendor / total / date.
    - New `<ReviewBanner>` below — accent-coloured "Please
      review" CTA with a "✓ Confirm receipt" button. Hidden
      when extraction is in flight, when already user-confirmed,
      when locked, or when discarded as duplicate.
- `(tabs)/money/index.tsx` (receipts list):
    - New "👀 N receipts need your review" pill under the
      heading when count > 0.
- `lib/ReceiptCard.tsx`:
    - "⚠ Possible duplicate" amber badge on cards where
      `dedup_match_id` is set + `dedup_decision` is null.
      Prioritised over the regular review badge.
    - "👀 Tap to review" accent badge on cards that finished
      extraction without user confirmation.
    - "Discarded as dup" label on rejected-via-dedup rows.
- `(tabs)/money/capture.tsx`:
    - Snap-tips block now mentions: "AI will read the vendor +
      total + date and ask you to confirm. We'll also flag a
      possible duplicate if it matches an earlier receipt."

Logging:
- `receipts.confirmReview` / `receipts.resolveDuplicate` log the
  decision + edit count for ops visibility.
- Worker dedup-query failures log a warn so a misconfigured
  index is visible.

Activation gate: apply `seeds/229_starr_field_receipt_review.sql`
to live Supabase before the worker pushes the next image —
without the columns the worker's UPDATE 4xx's. The mobile UI
gracefully handles a null `dedup_match_id` / null
`user_reviewed_at`, so the rollout order is: seed → worker →
mobile (or mobile-first works too; the new badges hide until
the worker writes the columns).

Pending v2 polish:
- Fuzzy matching: "near-duplicate" detection on amounts ±$0.10
  (cashier rounding) or vendor variants the normalisation
  doesn't catch. v1 is exact-match only.
- Per-field review wizard that diffs AI vs user edits and
  records each one into `user_review_edits` (currently we just
  stamp the timestamp).
- Photo-perceptual hash so two receipts captured from the same
  paper but with slightly different lighting still match.

**Batch Y — sun-readable theme (F7 closer)**

Closes the F7 deferral *"High-contrast / sun-readable theme — dark
mode default exists per lib/theme.ts; high-contrast variant
pending. Acceptance: legible in direct 100°F sun."* Surveyors
flip "☀ Sun" on the Me tab once and every screen they touch in
the cab (capture, time, point detail) renders pure-black-on-pure-
white with saturated accents.

Palette (`mobile/lib/theme.ts`):
- New `'sun'` palette joins the existing `'light'` + `'dark'`.
- background `#FFFFFF`, surface `#FFFFFF` (no contrast surface —
  flatten everything for max readability), border `#000000` (full
  black so borders read in glare), text `#000000`, muted
  `#262626` (regular `#6B7280` muted disappears at high
  brightness), accent `#001A8C` (deeper saturated brand blue),
  danger `#9F0014`, success `#004D1A`.
- `Scheme` type extended from `'light' | 'dark'` → `'light' |
  'dark' | 'sun'`.

Preference store (`mobile/lib/themePreference.tsx`):
- `<ThemePreferenceProvider>` wraps the entire app; mounted at
  the root layout above `<AuthProvider>` so every screen sees the
  context.
- AsyncStorage key `@starr-field/theme_pref` persists the choice
  across launches; default is `'auto'` (follows OS).
- Two-channel coordination so the migration is incremental:
    1. `Appearance.setColorScheme()` mirrors the choice for legacy
       `useColorScheme()` callers (sun → light fallback).
    2. React context exposes the actual choice (`'sun'` included)
       so opted-in screens get the high-contrast palette via
       `useResolvedScheme()`.
- Subscribes to OS scheme changes so an `'auto'` preference
  re-renders when the user toggles dark mode in OS Settings.
- Hook ergonomics: `useThemePreference()` returns
  `[pref, setPref]` for the picker; `useResolvedScheme()`
  returns the active scheme for screens.

Me-tab Display section (`mobile/app/(tabs)/me/index.tsx`):
- New "Display" section above Storage with a 4-pill picker
  (Auto / Light / Dark / ☀ Sun). Active pill lifts to the accent
  fill for unmistakable selection. Caption copy explains what
  each mode does ("Sun-readable picks max-contrast colours so
  the screen reads in direct sunlight.").
- Me tab itself uses `useResolvedScheme()` so the toggle is
  immediately visible in-place.

Migrated screens (use `useResolvedScheme()`):
- `(tabs)/capture/index.tsx` (point creation)
- `(tabs)/capture/[pointId]/photos.tsx` (photo + video grids)
- `(tabs)/capture/[pointId]/voice.tsx` (memo recorder)
- `(tabs)/capture/[pointId]/video-player.tsx` (full-screen player)
- `(tabs)/jobs/[id]/points/[pointId].tsx` (point detail)
- `(tabs)/time/index.tsx` (timesheet)
- `(tabs)/time/pick-job.tsx` (clock-in modal)
- `(tabs)/me/index.tsx` (Me tab)

Other screens (Money tab, Jobs tab, auth, dispatcher list)
continue to read `useColorScheme()` and resolve via the
`Appearance.setColorScheme()` mirror — they get the closest
match (light or dark) until they're touched. No regression.

Logging:
- AsyncStorage hydrate failures log a warn breadcrumb so a
  corrupted prefs file is visible in Sentry.

Pending v2 polish:
- Boost font scaling under sun-readable for surveyors who also
  squint in glare (currently colour-only; bumping `fontSize`
  app-wide is invasive).
- Shake-to-toggle so a one-handed surveyor flips between dark
  and sun without tabbing to Me.
- Migrate the remaining ~50 screens to `useResolvedScheme()` so
  the choice propagates everywhere; current scope is the
  surveyor's daily field workflow only.

**Batch X — per-user team drilldown (`/admin/team/[email]`)**

Closes the F6 deferral *"Per-user `/admin/team/[email]` drilldown —
natural extension of the team-card view."* The dispatcher used to
have to open four pages (`/admin/timeline`, `/admin/mileage`,
`/admin/field-data`, `/admin/receipts`) plus the team list to
answer "what is Lance up to today?" — now it's one page.

API (`/api/admin/team/[email]/today/route.ts`):
- Single-round-trip aggregator. Resolves the email →
  `registered_users.id`, then runs every section query in parallel
  via `Promise.all`:
    - Today's `job_time_entries` (closed + open)
    - Today's `location_pings` (sample for visualisation +
      head-count for the stat bar)
    - Today's `location_stops` (count only — full detail on
      `/admin/timeline`)
    - Today's `location_segments` distances (summed for miles)
    - Today's `field_data_points` (last 12 with thumbnails +
      total count)
    - Today's `receipts` (last 12 + total count)
    - Today's `notifications` (dispatcher pings sent)
- Bulk lookup of every `job_id` referenced by entries + captures
  in one `IN`-query so the page can render `{job_number} ·
  {job_name}` without per-row fetches.
- Bulk thumbnail signing for the captures grid (1-hour TTL).
- Open `job_time_entries.duration_minutes` is computed
  server-side from `started_at → now()` so the stat bar reads
  correctly for live entries.
- Auth: admin / developer / tech_support. Hard-fails on the first
  errored section query rather than rendering partial data — a
  silent "0 receipts" because the query 5xx'd would mislead.

Page (`/admin/team/[email]/page.tsx`):
- Header card: name + roles + last-sign-in + clock-state badge
  ("🟢 Clocked in · 4h 23m" / "⚪ Off the clock") + last-seen
  badge with battery glyph.
- Quick-action column (right side): "⏱ Ping: log hours" / "✓
  Ping: submit week" buttons (POST `/api/admin/notifications`
  with the same dedup contract as `/admin/team`) + deep links
  to Timeline / Mileage / All captures.
- Stats bar (6 columns): Worked / Miles / Stops / Pings /
  Captures / Receipts.
- "On the clock" card (only when active): job name + duration +
  Maps links for clock-in spot + last-seen.
- Today's clock-ins table with active-row highlighting.
- Captures grid (3-col responsive) with thumbnails + flag pills
  ("offset" / "correction") — links to the existing per-point
  detail page. "See all N →" footer when capped at 12.
- Receipts list with vendor + total + status — links to receipt
  detail.
- Dispatcher pings sent today with delivered + read state.

Cross-link: every member card on `/admin/team` now leads with a
"📋 Open profile" button (the existing 🚗 Mileage and 🗺️ Timeline
links remain for one-click jumps to the deep views).

Logging + error handling:
- Section query failures log via console.error with the user
  email + error message, then 500 so the page surfaces the
  failure inline.
- Thumbnail sign failures log a warn (per-tile fallback to a
  📍 placeholder) but don't fail the request.
- The page's pinging buttons surface failures via the inline
  error banner; the rest of the data stays visible.

**Batch W — file pin-to-device + open-on-tap (F5 closer)**

Closes the F5 deferral *"Pin-to-device for offline access — files
are kept on disk through the queue's `documentDirectory` copy
until upload succeeds, then deleted."* Surveyors now mark a plat /
deed / CSV "Pin offline" once at the office; the file opens
instantly in the cab even with no LTE.

Schema (`mobile/lib/db/schema.ts`):
- New local-only `pinned_files` table — `(job_file_id, local_uri,
  file_size_bytes, pinned_at)`. PowerSync `localOnly: true` keeps
  the device-specific path off the wire; each device decides
  independently which files to pin.

Mobile lib (`mobile/lib/pinnedFiles.ts`):
- `useIsPinned(jobFileId)` — reactive bool for the badge + button.
- `usePinFile()` — guards on `upload_state === 'done'` + online
  reception, signs a 5-minute URL, streams bytes via
  `FileSystem.downloadAsync` to a stable per-file path
  (`documentDirectory/pinned/<id>.<ext>` so re-pinning a renamed
  file doesn't leak two rows), INSERTs the pinned_files row.
  Half-written files are best-effort cleaned on fetch failure.
- `useUnpinFile()` — DELETE the row + `FileSystem.deleteAsync` the
  local file.
- `useOpenJobFile()` — prefers the local pinned copy, falls back
  to a one-shot signed-URL → `cacheDirectory` download for
  unpinned reads (OS-managed cleanup; no row tracking). Opens via
  `expo-sharing.shareAsync` so the OS picks the renderer
  (Quick Look on iOS, system intent on Android). Surfaces a
  helpful error when offline + not pinned.
- `usePinnedFilesReconciler()` — mount-once cleanup that drops
  pinned_files rows whose local file disappeared between
  launches (user deleted via Files app, OS reaped during a
  low-storage event). Without this, an offline open would resolve
  to a dead path.

UX (`mobile/app/(tabs)/jobs/[id]/points/[pointId].tsx`):
- File row is now tap-to-open (was metadata-only). Tap → share
  sheet; long-press → delete confirm (unchanged).
- Pin button on the right side, pill-style with accent fill when
  pinned. Disabled while `upload_state !== 'done'` so users can't
  pin a still-uploading row.
- Title row shows 📍 prefix when pinned (vs 📎 for unpinned) so a
  scan of the file list reads the pin state at a glance.

Me-tab Storage section (`mobile/app/(tabs)/me/index.tsx`):
- New "Pinned files" row: `N files · X MB on this device. Unpin
  from the point to free space.` Read-only — actual unpin happens
  next to the file itself, where the user remembers what each pin
  is.

Cascade (`mobile/lib/jobFiles.ts`):
- `useDeleteJobFile` now drops the pinned_files row + unlinks the
  local file BEFORE deleting the parent so a delete cascade
  doesn't leak disk.

Mount in root layout (`mobile/app/_layout.tsx`):
- New `<PinnedFilesReconciler />` sibling to `<UploadQueueDrainer />`.

Logging + error handling:
- Every pin / unpin / open emits structured logs
  (`pinnedFiles.pin`, `pinnedFiles.unpin`, `pinnedFiles.open`,
  `pinnedFiles.reconcile`) with `file_id` so Sentry can correlate
  failures with bucket-config issues per file.
- User-facing errors: friendly copy on offline pin attempts
  ("No reception. Pin this file when you have signal — the bytes
  need to download once."), pin-not-yet-done ("Wait for the upload
  to finish before pinning."), share-not-available, signed URL
  failure, HTTP failure.

Pending v2 polish:
- Bulk-pin from the per-job page so the office can pre-pin "all
  the documents for tomorrow's job" with one tap.
- Auto-pin policy ("everything under 5 MB on the active job").
- Pinned-files panel on the Me tab with per-row unpin (currently
  the row is read-only; unpin happens next to each file).

**Batch V — compass heading on every photo / video / point**

Closes the F3 deferral *"`expo-sensors` magnetometer not yet wired;
the `device_compass_heading` column is left null pending
integration."* Surveyors photograph monuments from a specific
direction; the office reviewer needs to know which face of the
rebar they're looking at. Until this batch the column was always
null.

Implementation chose `expo-location.getHeadingAsync()` over a new
`expo-sensors` Magnetometer wiring because:
1. expo-location already gates on the same foreground-permission
   grant the GPS calls use, so no extra prompt or rationale dialog.
2. The OS handles magnetic-declination → true-north conversion
   once it has a recent GPS fix; rolling our own would mean
   shipping a declination table or hitting NOAA WMM.
3. expo-location is already in the dep tree; expo-sensors would
   add a native module + iOS / Android plugin entries.

`mobile/lib/location.ts` `getCurrentHeadingOrNull()`:
- Calls `Location.getHeadingAsync()` behind a 1.5 s timeout (the
  capture flow already costs ~8 s waiting for GPS; another 5 s
  on a cold magnetometer is not acceptable).
- Prefers `trueHeading` (geo-north) over `magHeading`. Falls back
  to magnetic when the OS hasn't computed declination yet (no
  recent GPS fix → trueHeading reports `-1`).
- Drops readings where `accuracy < 1` (Apple's "calibration
  needed" enum) so we don't store bearings that point at a steel
  I-beam instead of magnetic north.
- Normalises to 0..360 (defensive against iOS hardware that
  occasionally returns -180..180), rounds to 0.1°.
- Returns null on permission denied / timeout / unavailable
  sensor / hardware error — same null-degrades-to-graceful
  contract as the GPS helper.

Capture flows (`mobile/lib/fieldMedia.ts`, `mobile/lib/dataPoints.ts`):
- `useAttachPhoto`, `useAttachVideo`, `dataPoints.create` now
  fetch GPS + heading in parallel via `Promise.all` so total
  wall-time stays bounded by the slower of the two timeouts (8 s
  GPS / 1.5 s heading), not their sum.
- Heading writes to `field_media.device_compass_heading` on every
  photo + video, and `field_data_points.device_compass_heading`
  on every new point.
- Voice memos still write null — bearing is irrelevant for audio.
- Success log lines now include `has_heading: bool` for ops
  visibility into how often the magnetometer is producing a
  reading in the wild.

Admin viewer (`/admin/field-data/[id]` + `/admin/jobs/[id]/field`):
- New `<HeadingBadge deg={n} />` component renders a north-anchored
  ▲ arrow rotated to the bearing, plus the degree + cardinal
  abbreviation (`273° W`). 8-point cardinals (N / NE / E / SE / S
  / SW / W / NW) are the sweet spot for "rebar's NW face" without
  crowding the badge with NNE / ENE / etc.
- Rendered on the point meta cell (Heading column) AND on every
  photo / video card (Facing row) — only when present, so legacy
  rows captured before this batch don't show stale "—" rows.
- Per-job API `GET /api/admin/jobs/[id]/field-data` extended to
  include `device_compass_heading` on every `JobMediaRow` so the
  per-job page can render the same badge on its job-level media
  cards.

Logging + error handling:
- `location.getCurrentHeadingOrNull` logs at info level on
  permission denial, timeout, and low-accuracy drop so an ops
  flag (e.g. "every photo from this device is null-headed") is
  visible.
- All capture-flow logs include `has_heading: bool` so we can
  correlate magnetometer availability with device model in
  Sentry.

**Batch U — mobile video review (Photos / Videos tab + full-screen player)**

Closes the F4 deferral *"mobile-side video gallery — captures land
on the web admin but don't show in the mobile photos.tsx grid."*

Field: surveyor records a 30-second monument walkthrough → previously
the only way to confirm the recording wasn't accidentally muted /
shaky was to wait until the truck pulled back to the office and
load the web admin. Now they tap **Videos** on the capture screen,
see the tile, tap to play full-screen.

UI:
- `mobile/lib/VideoGrid.tsx` — 3-column tile grid mirroring
  `ThumbnailGrid` for photos, with: server-thumbnail when present
  (placeholder ▶ + 🎬 glyph until the F4 FFmpeg-thumbnail polish
  lands), bottom-left `mm:ss` duration pill, top-right upload-state
  badge (↑ pending / WiFi waiting / ! failed). Same vocabulary as
  the photo grid so surveyors learn the pictograms once.
- `mobile/app/(tabs)/capture/[pointId]/photos.tsx` — adds a
  `Photos · N` / `Videos · M` pill toggle below the header.
  Active pill lifts to the accent colour for glove-vision
  contrast. Empty-state copy is type-aware ("No videos yet — tap
  'Record video' below to capture one").
- `mobile/app/(tabs)/capture/[pointId]/video-player.tsx` —
  full-screen modal with native `<Video>` controls
  (`expo-av` ResizeMode.CONTAIN), back button + Delete button in
  the header bar, meta block underneath (Duration · Size · State
  · Captured). On delete → `router.back()` lands back on the
  Videos tab. Errors surface as a banner over the placeholder,
  never a crash.
- Stack route registered in `(tabs)/capture/_layout.tsx`.

Resilience: the player resolves its source via the new
`useFieldMediaVideoUrl` hook (parallel to the existing
`useFieldMediaPhotoUrl`), which falls back to the local
`documentDirectory` URI from the upload queue when the bytes
haven't synced yet. Net: a freshly-captured walkthrough plays back
**immediately** in airplane mode, before the upload queue even
fires — same offline-first contract as photos and voice.

Logging + error handling:
- `videoPlayer.onError` → `logError` with `{ media_id, point_id,
  upload_state }` so a wedged signed URL (expired TTL,
  misconfigured bucket) is visible to ops.
- `videoPlayer.onDelete` → mirrors the photo delete path with
  Alert confirm + `useDeleteMedia` + Sentry on failure.
- `photosScreen.onPressVideo` → simple navigation, no error case
  beyond an obviously-corrupt route param.

UX touches:
- "Save without photos?" guard on Done now counts photos +
  videos (a point with only a walkthrough is still considered
  captured). Button label flips to "Done (skip captures)" only
  when both grids are empty.
- Long-press delete on either grid shares the same handler with
  type-aware Alert copy ("Delete this video?" vs "Delete this
  photo?").

Pending v2 (still listed in §9.w):
- Server-side FFmpeg thumbnail extraction so the placeholder tile
  becomes a real frame.
- WiFi-only original-quality re-upload tier (currently single-tier
  upload at the picker's `videoQuality: 0.7`).

**Batch T — author attribution everywhere + ZIP bundle download (closes Batch S follow-ups)**

Closes the user's most-recent two-part request: *"any point or
information or media that is uploaded to a job should have the name
of who uploaded it and the timestamp ... Those reviewing the job
should be able to download all of the media in the csv manifest or
like a zip file. They should also be able to download single media
files."*

Per-job consolidated review surface (`/admin/jobs/[id]/field`):
- New page lists every point captured for the job as clickable
  thumbnail cards (each links to `/admin/field-data/{point_id}`
  for the existing per-point detail view), plus three job-level
  inline blocks for media / notes / files attached at the job
  level (no `data_point_id`).
- Stats bar at the top: points · photos · videos · voice · notes
  · files. One round trip via `/api/admin/jobs/{id}/field-data`
  (signs every URL once with a 1-hour TTL).
- Pill-button entry from `/admin/jobs/[id]` ("📍 View field
  captures →") so bookkeepers don't have to remember the URL.

Author attribution — uploader name + timestamp on every uploaded
item (per the user's directive):
- `/api/admin/jobs/[id]/field-data` resolves `created_by` UUIDs in a
  single bulk `IN`-query against `registered_users` for points +
  media + files; returns `uploaded_by_email` / `uploaded_by_name`
  on every `JobMediaRow` + `JobFileRow`.
- `/api/admin/field-data/[id]` (per-point detail) does the same:
  one bulk lookup covers the point creator AND every media + file
  uploader; the response payload mirrors the per-job shape.
- UI surfaces an "Uploaded by Lance · Apr 27 14:22" line on every
  photo / voice / video / file card on both `/admin/jobs/[id]/field`
  and `/admin/field-data/[id]` (italic small caps above the meta
  rows so it's scannable without competing with capture metadata).

Bundle + single-file downloads:
- `/api/admin/jobs/[id]/field-data/manifest` (CSV) gains
  `uploaded_by_name` + `uploaded_by_email` columns. Bookkeeper can
  now grep the CSV for "everything Lance shot today" without
  cross-referencing.
- New `/api/admin/jobs/[id]/field-data/zip` endpoint streams a
  server-side ZIP with every photo (original tier) / video / voice
  memo / generic file in the job, organised as
  `{job_number}/{photos|voice|videos|files}/{point-name|job-level}/{filename}`,
  plus a `manifest.csv` at the ZIP root for offline cross-reference.
  HEAD returns 200/404 so the UI can disable the button when there's
  nothing to bundle. Streamed via JSZip's `generateInternalStream`
  bridged into a Web `ReadableStream` so memory stays bounded by
  the largest single file (no full-archive buffer). Caps at
  5,000 objects per request — runaway jobs fall back to the CSV
  manifest. `STORE` compression (no deflate) since photos /
  videos are already compressed.
- `JSZip` added to `package.json` as a direct dependency (was
  transitive before).
- Per-card "Download →" / "Download video →" / "Download audio →"
  links remain (signed URLs from the JSON APIs) so a single file
  can be grabbed without bundling the whole job.

Logging + error handling: every signed-URL or fetch failure inside
the ZIP route caps at 3 log lines per request to avoid floods;
fallthrough is always "skip this object + keep the archive going"
rather than 500 the whole request. The stream's `cancel()` pauses
the underlying JSZip stream so a browser-cancel doesn't keep the
function spinning.

**Batch P — three closer items (consent + per-vehicle mileage + inline file preview)**

Three small closer items, no native deps, that finish open loops
from earlier batches.

Tracking-consent modal (closes F6 #consent-flow):
- `lib/trackingConsent.ts` — AsyncStorage-backed flag with cached
  read, `setTrackingConsent` / `resetTrackingConsent` helpers.
- `lib/TrackingConsentModal.tsx` — full-screen page-sheet modal
  with the same disclosure block surveyors see on
  `(tabs)/me/privacy` (when / what / cadence / who sees /
  storage / OS indicators) plus a "your phone OS will ask next"
  callout setting expectations for the system dialog.
- Pick-job clock-in flow gates `useClockIn` behind the modal:
  Continue → persist consent + clock in (which then triggers the
  OS Always-location prompt via `startBackgroundTracking`); Skip
  → clock in WITHOUT background tracking. Skip leaves the flag
  unset so the explainer re-shows on the next clock-in. The
  modal shows once per install — re-prompt on uninstall is the
  correct behaviour for a privacy disclosure.

Per-vehicle mileage breakdown (closes F6 polish deferral):
- `/api/admin/mileage` now joins `location_pings.job_time_entry_id`
  → `job_time_entries.{vehicle_id, is_driver}` → `vehicles.name`
  in two follow-up bulk queries. New `VehicleSubtotal` shape
  attached to each `MileageDayRow.by_vehicle[]`.
- Sub-rows render under each (user, date) row on `/admin/mileage`
  with Driver / Passenger pills (Driver in accent blue;
  Passenger in muted grey). IRS attribution becomes scannable —
  bookkeepers see who actually drove what for how many miles.
- CSV export gains three columns (`vehicle_id`, `vehicle_name`,
  `is_driver`) so QuickBooks pivots can slice by vehicle.

Inline file preview on admin (closes F5 polish deferral):
- `FileCardItem` on `/admin/field-data/[id]` branches on MIME:
  - `image/*` → inline `<img>` at max-height 320 px
  - `application/pdf` → `<iframe>` at 480 px tall
  - `text/csv` (or `.csv` extension) → fetches the signed URL
    and renders the first 50 rows as a scrollable table. Tiny
    pure-JS CSV parser handles comma OR tab separators with
    quoted-field escapes; "(Preview limited to 50 rows…)"
    footer when truncated.
- Everything else falls back to the Download link. Bookkeeper
  reviews most files without leaving the page.

**Batch O — device-access audit + photo annotation + F5 files + offline-first verification**

This batch responds to the user's directive: *"Make sure that we
can actually get access to the tablet/phone camera within the app
whether it is apple or android or other OS. Make sure it asks for
permissions and all of that. Make sure it can get access to the
camera roll. Make sure we can upload audio and videos and pictures
and files to job or specific points in a job. Make sure the proper
user prompts are in place for all of this. Make sure we have proper
logging and error handling. Make sure the app really can work as a
stand alone app whenever internet is down."*

Permissions audit + fixes (`mobile/app.json`):
- Added `NSMicrophoneUsageDescription` (voice + video recording
  would have failed on iOS without this).
- Added `NSPhotoLibraryAddUsageDescription` (MediaLibrary
  device-Photos backup would have silently failed on iOS 14+).
- Added Android 13+ media perms: `READ_MEDIA_IMAGES` /
  `READ_MEDIA_VIDEO` / `READ_MEDIA_AUDIO`. Added explicit
  `CAMERA`, `RECORD_AUDIO`, `READ_EXTERNAL_STORAGE`,
  `WRITE_EXTERNAL_STORAGE`, `VIBRATE` (the existing list relied
  on plugin auto-injection; explicit is safer for production).
- Added expo-av plugin entry (microphone permission) +
  expo-media-library plugin entry (savePhotosPermission +
  isAccessMediaLocationEnabled) + expo-document-picker plugin
  entry (iCloud container).
- expo-image-picker plugin entry now also declares
  `microphonePermission` (video capture).

`mobile/lib/permissionGuard.ts` extended:
- Added `'microphone'` and `'mediaLibraryAdd'` permission kinds with
  per-kind copy + Settings deep-link.
- `isPermissionDeniedError` now detects "Microphone permission
  denied." + "Media library permission denied." so caller screens
  branch into the Settings prompt instead of a generic alert.
- `lib/voiceRecorder.ts` `startRecording` throws the exact phrase
  that `isPermissionDeniedError` matches.

Photo annotation (F3 #6 closer):
- `react-native-svg` + `lib/PhotoAnnotator.tsx` (full-screen
  editor: 4 colours, freehand pen, undo + clear + save). Original
  bytes never modified per plan §5.4 — annotations live in
  `field_media.annotations` JSON, rendered live as SVG overlay.
- Coordinates normalised 0..1 over image so strokes render
  identically on phone / tablet / web admin lightbox.
- `lib/photoAnnotation.ts` data model + `useUpdateMediaAnnotations`
  PowerSync hook.
- `PhotoLightbox` shows existing annotations + "Annotate" /
  "Edit annotations" entry button. Computes the contained-image
  rect so strokes plot on the photo, not the letterbox bars.
- Web admin `/admin/field-data/[id]` Lightbox renders the same
  SVG overlay using the shared `lib/photoAnnotationRenderer.ts`
  helpers (pure functions — no React Native dep in the Next
  build).
- API `/api/admin/field-data/[id]` now returns
  `field_media.annotations` alongside the signed URLs.

F5 files capture (Batch O):
- `seeds/226_starr_field_files.sql` adds the `job_files` table
  (lifecycle + content metadata + `upload_state` enum mirroring
  field_media), `starr-field-files` bucket (100 MB cap, no MIME
  restriction so PDF / CSV / DXF / DWG / TXT all flow), per-user-
  folder storage RLS, owner CRUD on the row + storage object.
- `mobile/lib/jobFiles.ts` `usePickAndAttachFile` — opens
  `expo-document-picker` (handles iCloud + Google Drive providers
  via the OS picker), defensive size probe, hard-fail at 100 MB,
  INSERT row → enqueue upload, sanitised storage path.
- `lib/uploadQueue.ts` `ParentTable` extended with `'job_files'`;
  upload-state flips on success / failure / discard mirror the
  field_media branch.
- "+ Attach file" button on the point detail screen with a Files
  list (per-row state badge + long-press delete confirm).
- Admin `/admin/field-data/[id]` gets a Files block above Photos
  with per-file metadata + Download link via signed URL.

Offline-first verification:
- Audited every capture path (`receipts.ts`, `fieldMedia.ts` ×3
  for photo / voice / video, `fieldNotes.ts`, `jobFiles.ts`):
  every flow INSERTs the parent row FIRST then enqueues bytes
  via `enqueueAndAttempt`. Row visible in the gallery / list the
  moment of capture; bytes upload when reception returns. Queue
  persists to `FileSystem.documentDirectory` and survives app
  kills + reboots.
- Notes (text-only) skip the byte queue — PowerSync's CRUD queue
  handles the small JSON payload directly.

Activation gate: apply `seeds/226_starr_field_files.sql` to live
Supabase before the file picker ships. PowerSync sync-rule snippet
adds `job_files` (last 90 days, scoped by `created_by`).

**Batch N — mobile timeline reader (F6 employee timeline)**
- [x] `lib/locationTracker.ts` — `useOwnStopsForDate(offset)` /
      `useOwnSegmentsForDate(offset)` reactive hooks scoped to the
      current user via PowerSync. Date offset (0=today) lets future
      day-paging work without changing the call site.
      `useOwnTimelineSummary(offset)` aggregates count + miles +
      dwell, matching the dispatcher's totals on `/admin/timeline`.
- [x] `(tabs)/me/privacy.tsx` — when stops or segments exist, renders
      a "Today's day, summarised" card ABOVE the raw-pings list with
      a three-stat header (Stops · Miles · Stationary) + a stop →
      segment → stop list mirroring the admin layout. Surveyors see
      EXACTLY what the office sees, closing the dispatcher↔surveyor
      parity loop.
- The card hides entirely when no stops have been derived (the
  pings are still visible below). Server-side derivation runs on
  the dispatcher's "Recompute" tap or — once pg_cron is wired —
  overnight. PowerSync sync rule already includes
  `location_stops` + `location_segments` (last 7 days, scoped by
  user_id) per `mobile/lib/db/README.md`.

**Batch M — vehicles + IRS mileage attribution (F6 vehicle-picker)**
- [x] `seeds/225_starr_field_vehicles.sql` — adds the `vehicles`
      table that's been declared in the mobile schema since
      seeds/220 (was a dangling reference). CHECK on non-empty
      name, unique active license_plate (case-insensitive,
      trimmed), `active` flag for soft-archive. RLS: service-role
      full + authenticated SELECT on active rows only. Defensive
      DO blocks wire FKs from `job_time_entries.vehicle_id` and
      `location_segments.vehicle_id` (added by 220 + 224
      respectively) only when those columns exist.
- [x] `/api/admin/vehicles` GET / POST / PUT / DELETE — admin-only
      writes (tech_support read-only); soft-archive on DELETE
      preserves historical references. Length caps + plate/VIN
      uppercase normalisation.
- [x] `/admin/vehicles` page — list with active + archived filter,
      add/edit form, archive + reactivate buttons, sidebar entry
      "🛻 Vehicles" under Work group.
- [x] `mobile/lib/vehicles.ts` — `useVehicles` (active only,
      alphabetical) + `useVehicle(id)` reactive hooks backed by
      PowerSync.
- [x] Mobile clock-in vehicle picker — pill row at top of the
      `(tabs)/time/pick-job` modal, "I'm driving" toggle that
      defaults true (passengers explicitly flip off so IRS
      attribution stays clean), passes `vehicleId` + `isDriver`
      through `useClockIn` to `job_time_entries`. Picker hides
      entirely when no vehicles have been seeded by the office,
      so the flow degrades gracefully.
- [x] `useClockIn` signature extended with `vehicleId?` +
      `isDriver?` opt-in params; `is_driver` coerced to 0/1 for
      SQLite, null when no vehicle picked.
- Deliberate non-features (deferred to F6 polish):
  - Per-vehicle mileage breakdown on `/admin/mileage` — **shipped
    in Batch P** (data + UI + CSV columns).
  - Default-vehicle preference per surveyor (so the next clock-in
    pre-picks the truck they used yesterday).
  - In-vehicle status indicator on the active-clock-in card so the
    surveyor confirms they're tracked as the driver vs passenger.

**Batch L — free-text + structured notes (F4 notes)**
- [x] `mobile/lib/fieldNotes.ts` — `useAddFieldNote` /
      `usePointNotes` / `useJobLevelNotes` / `useArchiveFieldNote`
      reactive hooks (PowerSync-backed, scoped by data_point_id /
      job_id with `is_current=1` filter so archived notes hide on
      mobile but stay visible to the office reviewer). Per-template
      typed payload interfaces (`OffsetShotPayload` /
      `MonumentFoundPayload` / `HazardPayload` / `CorrectionPayload`)
      + `summariseStructuredPayload(template, payload)` derives a
      one-line body summary so the existing `/admin/notes` grep +
      future search-across-notes feature work without parsing JSON.
      `parseStructuredPayload(json)` is the defensive read-side
      counterpart.
- [x] Mobile add-note screen at `(tabs)/jobs/[id]/notes/new` —
      accepts `?point_id=&template=` query params (so a future
      photo-screen "+ Add hazard" deep-link could pre-pick the
      template). In-app pill picker switches between Free-text /
      Offset shot / Monument found / Hazard / Correction; each
      template has its own typed form (numeric inputs for distance
      and depth, choice pills for monument type and severity with
      danger-tinted "high" pill). Save handler composes the JSON
      payload + body summary; `disabled` logic per template.
      Stack route registered in `(tabs)/jobs/[id]/_layout.tsx`.
- [x] Point detail screen Notes section — reactive list using
      `usePointNotes`, per-card template tag + body + relative-time
      stamp, long-press → archive confirm Alert. "+ Add note" button
      pushes the add-note screen with `point_id` pre-filled.
      Tablet-friendly via the existing `tabletContainerStyle` flow.
- [x] Admin `/api/admin/field-data/[id]` extended — bulk-fetches
      `fieldbook_notes` for the point alongside media, returns a
      `notes` array with `structured_payload` JSON pre-parsed
      (defensive try/catch keeps a malformed row from breaking the
      response). New `AdminFieldNoteRow` interface exported.
- [x] Admin `/admin/field-data/[id]` page renders a Notes block
      ABOVE Photos — per-note card shows template tag (Free-text
      pill when null), body, structured payload as a key/value
      table, author + age stamp, "archived" badge when
      `is_current=false`. Plays nicely with the existing voice +
      video + photo cards on the same screen.

**Batch K — video capture (F4 video half)**
- [x] `lib/storage/mediaUpload.ts` `pickVideo()` — wraps
      `expo-image-picker.launchCameraAsync` (and the library
      counterpart) with `mediaTypes: Videos`, `videoMaxDuration: 300`
      (5-min cap per plan §5.4), `videoQuality: 0.7` (cellular-budget
      sane default), defensive `getInfoAsync` fallback when the
      picker doesn't report `fileSize`, hard-fail when the captured
      duration exceeds the cap by 50%+ (older Android picker bug).
      Returns `{ uri, fileSize, durationSeconds, contentType }`.
- [x] `lib/fieldMedia.ts` `useAttachVideo` — INSERT `field_media`
      row with `media_type='video'` + `duration_seconds` +
      `file_size_bytes` + GPS, enqueue upload to `starr-field-videos`
      bucket via `lib/uploadQueue.ts` (offline-first contract
      preserved; queue's `guessExtension` already supported `.mp4` /
      `.mov`), opt-in MediaLibrary backup goes to Camera Roll.
      Extension inferred from picker uri + mime so iOS .mov stays
      .mov (the bytes are HEVC-in-MOV; native players accept both
      via the dual `<source>` tags).
- [x] Photos screen footer "📹 Record video" button — mutually
      exclusive with photo + library buttons via the unified `busy`
      state machine (`'camera' | 'library' | 'video-camera'`).
      Permission denial routes through the existing
      `permissionGuard` Settings deep-link.
- [x] Admin `/admin/field-data/[id]` — PhotoCard branches on
      `media_type === 'video'`, renders `<video controls
      preload="metadata">` with mp4 + quicktime `<source>` fallbacks
      and a thumbnail poster (when populated by future server-side
      extraction). Duration in mm:ss, file size, upload state badge,
      "Download video" link to the signed URL.
- Deliberate non-features (deferred to F4 polish):
  - Server-side thumbnail extraction (FFmpeg via worker) so the
    gallery list can show a real video thumb instead of a placeholder.
  - WiFi-only original-quality re-upload tier per plan §5.4 (v1
    uploads single-tier at the picker's `videoQuality: 0.7`).
  - Mobile-side video gallery — captures land on the web admin but
    don't show in the mobile photos.tsx grid (which filters
    `media_type='photo'`). A "Videos (N)" tab on the photos screen
    is the polish.

**Batch J — stop detection + daily timeline (F6)**
- [x] `seeds/224_starr_field_location_derivations.sql` — adds
      `location_stops` + `location_segments` (with FKs to
      `auth.users` + `job_time_entries` + each other; CHECK
      constraints on lat/lon/window), three indexes (user-recent,
      per-job, per-entry), RLS service-role full + owner SELECT,
      and explicit REVOKE of INSERT/UPDATE/DELETE from
      authenticated (derivation runs server-side only). Pure-SQL
      `haversine_m(lat1, lon1, lat2, lon2)` function.
- [x] `derive_location_timeline(p_user_id UUID, p_log_date DATE)`
      PL/pgSQL aggregator (SECURITY DEFINER, granted to
      service_role only). Walks pings in time order, accumulates a
      cluster centroid, emits a `location_stops` row when the
      cluster dwells ≥5 min within ~50 m AND breaks (next ping
      >50 m from centroid OR >10 min gap). Sums Haversine distance
      between consecutive pings into the bridging
      `location_segments` row. Idempotent — DELETEs prior
      derivations except `user_overridden=true` stops (so admin /
      surveyor manual category fixes survive recomputes). Returns
      `(stops_written, segments_written)` counts.
- [x] `GET /api/admin/timeline?user_email=&date=` — reads the
      derived stops/segments for a (user, date) bucket, returns
      `{ stops, segments, total_distance_miles, total_dwell_minutes,
      derived_at }`. `POST /api/admin/timeline` calls the
      aggregator via `supabaseAdmin.rpc('derive_location_timeline')`
      and returns the counts.
- [x] `/admin/timeline?user=&date=` page — stop → segment → stop
      timeline render. Per-stop card shows time window, duration,
      Maps deep-link, optional category/place name, "View job",
      "Field data" deep-links. Per-segment rail shows distance +
      transit duration. "Recompute" button POSTs to derive on-
      demand. Sidebar entry "🗺️ Daily Timeline" + per-card
      Timeline link from `/admin/team`.
- Deliberate non-features (deferred to v2):
  - Geofence-based category assignment (job site / office / home /
    gas station). Schema columns ready (`category`,
    `category_source`, `ai_confidence`).
  - AI classification via worker for ambiguous stops.
  - Reverse-geocoded `place_name` / `place_address`.
  - PostGIS `path_simplified` polyline for the day-replay scrubber.
  - Mobile reader for stops + segments (raw pings already on
    `(tabs)/me/privacy.tsx`; the summary view is the polish).
  - pg_cron nightly schedule (currently on-demand via the
    Recompute button).

**Batch I — voice memo capture (F4 audio half)**
- [x] `mobile/lib/voiceRecorder.ts` — expo-av wrapper with
      `ensureRecordingPermission` (cached, busts via
      `resetRecordingPermissionCache`), `startRecording` (M4A mono
      HIGH_QUALITY preset; iOS audio-mode flip for silent-switch
      override), polled `getRecordingStatus`, `stopRecording`
      (returns `{ uri, durationMs, fileSize, contentType }`), and
      idempotent `cancelRecording` that deletes the temp file.
- [x] `mobile/lib/fieldMedia.ts` `useAttachVoice` — INSERT
      `field_media` row with `media_type='voice'` + `duration_seconds`
      + GPS metadata, then enqueue upload to `starr-field-voice`
      bucket via `lib/uploadQueue.ts` (offline-first contract
      preserved), then opt-in MediaLibrary backup. Mirrors the
      photo path so resilience is identical.
- [x] `(tabs)/capture/[pointId]/voice.tsx` — full-screen recorder UI
      with live duration counter (250 ms tick), 5-min auto-stop
      cap, Stop & Save / Cancel buttons, and a memo list with
      tap-to-toggle playback (loads on first tap, unloads on
      unmount) + long-press to delete. expo-router stack route
      registered in `(tabs)/capture/_layout.tsx`.
- [x] Photo screen footer — added "🎙 Record voice memo" button
      that Stack-pushes the recorder; preserves the photo capture
      flow as primary.
- [x] Admin audio player on `/admin/field-data/[id]` — when a
      `field_media` row's `media_type === 'voice'`, render a
      native `<audio controls>` (with both `audio/mp4` + `audio/mpeg`
      `<source>` tags for browser fallback), duration in mm:ss,
      transcript display when populated (future), and "Download
      audio" link to the signed URL.
- [x] `expo-av ~15.0.2` added to `mobile/package.json`.

**Batch H — field-data admin viewer + tablet support**
- [x] `GET /api/admin/field-data` — list of every captured data point
      with bulk-joined job + creator + first-thumbnail signed URL
      (1-hour TTL). Filters: `job_id`, `user_id`, `user_email`,
      `from`, `to`, `limit`, `offset`. Bulk look-ups (jobs / users /
      media) executed in parallel so a 50-row page is one round trip
      after the initial query.
- [x] `GET /api/admin/field-data/[id]` — single point + every
      attached `field_media` row, with per-tier signed URLs (storage,
      thumbnail, original, annotated). Returns null per URL when the
      sign call fails so the UI can render a "no image" placeholder
      instead of crashing.
- [x] `/admin/field-data` page — date-range filter (default 14 days),
      employee + job + free-text search (client-side for now;
      server-side `tsvector` index TBD). Card grid with thumbnail,
      offset / correction flag chips, capture metadata, paging
      (50 per page).
- [x] `/admin/field-data/[id]` detail page — point metadata block
      (lat/lon/accuracy/altitude/heading + Maps deep-link), notes,
      photo gallery with lightbox + "Open full-resolution" link to
      the original tier (WiFi-only sync per plan §5.4 — admin web
      always sees originals via the signed URL). Sidebar entry under
      Work group.
- [x] `mobile/lib/responsive.ts` — `useResponsiveLayout()` hook +
      `tabletContainerStyle()` helper. Applied to Jobs / Time /
      Money / Me tab screens; drilldowns + capture flow inherit
      phone-portrait defaults until F7 polish.
- [x] Web-integration coverage matrix added to §9.y so future
      mobile features have a checklist for "did I also add an admin
      surface for this data?" before they ship.

**Batch G — mileage report (IRS-grade, F6)**
- [x] `GET /api/admin/mileage` — Haversine sum of consecutive
      `location_pings` per `(user_email, UTC date)`, with a 200 km
      single-jump glitch guard (cell-tower-triangulation outliers
      excluded from totals; surfaced as `dropped_jump_count` for
      audit). Server-bounded to 92-day max range. Two formats:
      `format=json` (default) returns `{ days[], total_miles }`;
      `format=csv` returns a download with explicit columns for
      QuickBooks / IRS-grade tax docs.
- [x] `/admin/mileage` page — date-range picker (default last 7 d),
      optional employee filter, per-user grouping + subtotals,
      per-row + bulk CSV export. Sidebar entry under Work group.
- [x] `/admin/team` Mileage drill-down — every team-card has a
      "🚗 Mileage" link that pre-fills the user filter on
      `/admin/mileage`.
- [x] Privacy-by-construction: pings only happen while clocked in,
      so mileage totals are business-miles by definition; personal
      commute / off-clock driving never enters the dataset.
- Deliberate non-features (deferred to F6 #stop-detection):
  - No per-trip break-down (start, stop, route polyline). That
    needs the worker-derived `location_segments` rows, which haven't
    landed yet.
  - No driver-vs-passenger distinction. Depends on the vehicle-picker
    on clock-in, also pending.

**Activation gates (live Supabase apply order):**
1. `seeds/220_starr_field_receipts.sql` — receipts + per-user storage
   bucket. F2 dependency.
2. `seeds/221_starr_field_data_points.sql` — field_data_points +
   field_media + three private storage buckets. F3 dependency.
3. `seeds/222_starr_field_notifications.sql` — before the mobile
   NotificationBanner + admin /admin/team Ping button ship.
4. `seeds/223_starr_field_location_pings.sql` — before EAS-building
   a release with background tracking enabled (the native config in
   `app.json` requests Always-On location + foreground service
   permission, which won't make sense without the table to write to)
   AND before the `/admin/mileage` page is exposed to admins (the
   page reads from `location_pings`).
5. `seeds/224_starr_field_location_derivations.sql` — before
   `/admin/timeline` is exposed. Adds `location_stops` +
   `location_segments` + the `derive_location_timeline()` PL/pgSQL
   aggregator + the `haversine_m()` helper. Derivation is on-demand
   via the admin "Recompute" button; pg_cron nightly schedule
   recommended in v2.
6. `seeds/225_starr_field_vehicles.sql` — before the mobile vehicle
   picker ships. Adds the `vehicles` table + the FKs from
   `job_time_entries.vehicle_id` and `location_segments.vehicle_id`.
   Office must seed the fleet via `/admin/vehicles` before the
   picker is meaningful.
7. `seeds/226_starr_field_files.sql` — before the mobile file picker
   ships. Adds the `job_files` table + `starr-field-files` storage
   bucket (100 MB cap, per-user-folder RLS) + owner CRUD policies.
   Powers `lib/jobFiles.ts` `usePickAndAttachFile` and the Files
   block on `/admin/field-data/[id]`.
8. `seeds/227_starr_field_geofence_classifier.sql` — `CREATE OR
   REPLACE FUNCTION` that adds geofence-based stop classification
   to `derive_location_timeline`. Idempotent — safe to re-apply.
   Apply AFTER seeds/224. Once applied, dispatchers use the "📍
   Set as job site" button on `/admin/timeline` to capture each
   job's geofence from any real stop centroid; future stops there
   auto-classify on the next Recompute.
9. `seeds/228_starr_field_voice_transcription.sql` — adds the
   five `transcription_*` tracking columns to `field_media` plus
   two partial indexes for the Whisper worker poll + watchdog.
   Apply AFTER seeds/221. Set `OPENAI_API_KEY` on the worker
   before enabling. The mobile UI continues to function without
   transcription (the columns are nullable + the existing flow
   doesn't read them).
10. `seeds/229_starr_field_receipt_review.sql` (Batch Z) —
    receipt review queue + dedup fingerprint columns
    (`needs_review`, `review_reason`, `dedup_fingerprint`) + the
    partial index that drives the bookkeeper's "X need review"
    badge. Apply AFTER seeds/220. Idempotent via ADD COLUMN
    IF NOT EXISTS.
11. `seeds/230_starr_field_receipt_retention.sql` (Batch CC) —
    `receipts.deleted_at TIMESTAMPTZ` + `receipts.deletion_reason
    TEXT` (`'user_undo' | 'duplicate' | 'wrong_capture'`) +
    partial indexes for visible-row reads + the retention sweep.
    Mobile `useDeleteReceipt` already soft-deletes against this
    schema; without the seed the UPDATE 4xx's. Apply AFTER
    seeds/220.
12. `seeds/231_starr_field_video_thumbnails.sql` (Batch GG) —
    adds `field_media.thumbnail_status` + `thumbnail_storage_url`
    + `thumbnail_started_at` + `thumbnail_completed_at` +
    `thumbnail_error` plus the worker-poll partial index. Apply
    AFTER seeds/221. Worker requires `npm install` on
    `worker/` to pull `ffmpeg-static` before
    `extract-video-thumbnails` runs.
13. `seeds/232_starr_field_finances_lock.sql` (Batch QQ) —
    `receipts.exported_at TIMESTAMPTZ` +
    `receipts.exported_period TEXT` + the export-pending partial
    index. Apply AFTER seeds/220 + 230. Required before exposing
    `/admin/finances` (Batch QQ part-2) — the GET tax-summary
    short-circuits and the POST mark-exported UPDATE 4xx's
    without these columns. Idempotent.

PowerSync sync rules to update (snippet in `mobile/lib/db/README.md`):
- `notifications` — scoped by `target_user_id` OR case-insensitive
  `user_email`.
- `location_pings` — scoped by `user_id` + last 24h (keeps local
  SQLite bounded; older pings live server-side for F6 reports).

**Pending in the resilience track:**
- (Consent modal shipped in Batch P — `lib/TrackingConsentModal.tsx`
  gates the first `requestBackgroundPermissionsAsync()` call.)
- (Voice transcription shipped in Batch R via OpenAI Whisper
  worker — `worker/src/services/voice-transcription.ts`. On-device
  transcription via `expo-speech-recognition` for Apple's
  on-device dictation API still pending if low-latency
  hands-free dictation is needed; server-side Whisper covers the
  searchable-archive use case.)
- Video polish: server-side FFmpeg thumbnail extraction (so the
  gallery list shows a real thumb rather than a placeholder) +
  WiFi-only original-quality re-upload tier per plan §5.4 + a
  mobile video gallery tab on the photos screen.
- Cross-notes search across the `body` column (free-text + summarised
  template payloads) — needs either a server-side `tsvector` index
  or local SQLite FTS5 wiring. F4 plan item.
- Stop-detection v2: geofence-based category assignment (job site /
  office / home / gas station) using `jobs.centroid_lat/lon` +
  radius; AI classification via worker for ambiguous stops; reverse-
  geocoded place names; PostGIS `path_simplified` column for the
  day-replay scrubber.
- (Mobile reader for `location_stops` + `location_segments` shipped
  in Batch N — see below.)

---

## 9.y — Web-integration coverage matrix

Per the user's deployment requirement: *"I need it to fully integrate
with the website. Everything that happens and shows up in the app
should also be recorded and stored and show up in the online website
as well."* Every mobile-write table is replicated to Supabase via
PowerSync's CRUD queue — that half is automatic. This matrix tracks
the **observable** half: where on the web admin can you see each
slice of mobile-written data?

| Mobile data | Supabase table | Admin surface | Status |
|---|---|---|---|
| Clock-in / clock-out | `daily_time_logs`, `job_time_entries` | `/admin/hours-approval`, `/admin/payroll`, `/admin/my-hours` | ✓ shipped |
| Time edits + audit trail | `time_edits` | History column on `/admin/hours-approval` (existing) | ✓ shipped |
| Receipts + line items | `receipts`, `receipt_line_items` | `/admin/receipts` + `/admin/receipts/[id]` + CSV export | ✓ shipped |
| Field data points | `field_data_points` | `/admin/field-data` list + `/admin/field-data/[id]` detail (this batch) | ✓ shipped |
| Field media (photos) | `field_media` (`media_type='photo'`) | Photo gallery on `/admin/field-data/[id]` with lightbox + per-tier signed URLs | ✓ shipped |
| Field media (voice) | `field_media` (`media_type='voice'`) | `<audio>` player on `/admin/field-data/[id]` with download link + duration display | ✓ shipped |
| Field media (video) | `field_media` (`media_type='video'`) | `<video controls>` player on `/admin/field-data/[id]` with download link + duration display (Batch K) | ✓ shipped |
| Background GPS pings | `location_pings` | `/admin/team` last-seen card + `/admin/mileage` per-day aggregates | ✓ shipped (raw + aggregate) |
| Stops + segments | `location_stops`, `location_segments` | `/admin/timeline` (per-user / per-day) + Recompute button + sidebar entry; mobile reader on `(tabs)/me/privacy.tsx` (Batch N) | ✓ shipped |
| Notifications (admin pings) | `notifications` | `/admin/team` Ping buttons + existing NotificationBell + POST `/api/admin/notifications` | ✓ shipped |
| Vehicle assignments | `vehicles` | `/admin/vehicles` CRUD page (add / edit / archive); mobile picker on clock-in populates `job_time_entries.vehicle_id` + `is_driver` (Batch M) | ✓ shipped |
| Jobs (mobile read-only v1) | `jobs` | `/admin/jobs` (existing) | ✓ shipped |
| Fieldbook notes (learning) | `fieldbook_notes` (`module_id`/`lesson_id`/etc.) | `/admin/learn/{fieldbook,notes}` (existing) | ✓ shipped |
| Field notes (job/point) | `fieldbook_notes` (`job_id`/`data_point_id`/`note_template`/`structured_data`) | Notes block on `/admin/field-data/[id]` with template tag + structured payload table; mobile add screen at `/(tabs)/jobs/[id]/notes/new` (Batch L) | ✓ shipped |
| Per-job consolidated review | `field_data_points` + `field_media` + `fieldbook_notes` + `job_files` (joined) | `/admin/jobs/[id]/field` — points list (Batch S) + job-level media/notes/files inline blocks + "Uploaded by X · timestamp" attribution on every item (Batch T) | ✓ shipped |
| Job media bundle download | `field_media` + `job_files` (signed) | `/api/admin/jobs/[id]/field-data/manifest` (CSV manifest, Batch S; uploader columns added in Batch T) + `/api/admin/jobs/[id]/field-data/zip` (server-streamed ZIP, organised by media_type/point, Batch T) — single-file Download links on every card on the per-job + per-point pages | ✓ shipped |
| Tax-time finances | `receipts` (joined w/ `location_segments` + `vehicles`) | `/api/admin/finances/tax-summary` (Schedule-C JSON+CSV w/ status split, Batch QQ) + `/api/admin/finances/mark-exported` (period-lock action) — admin page UI deferred to Batch QQ part-2 | ◐ API shipped, page pending |
| Equipment inventory | `equipment_inventory` (extended per §5.12.1) | Full F10.1 stack: admin web (F10.1a-h GET / page / POST+Add / PATCH+Edit / Retire+Restore / single-row QR PDF / bulk QR + checkbox UI / CSV import) + mobile useEquipmentByQr/useEquipment/useEquipmentList resolver hooks + schema (F10.1i) + reusable QrScanner overlay (F10.1j). Daily check-in/out flows that consume the scanner land in F10.5. | ✓ F10.1 fully shipped |
| Equipment kits | `equipment_kits`, `equipment_kit_items` | Inline kit composer on the Inventory catalogue page; one-scan kit batch check-out via `equipment_events` rows (§5.12.6) | ⨯ planned (F10.1) |
| Equipment templates | `equipment_templates`, `equipment_template_items`, `equipment_template_versions` | `/admin/equipment/templates` admin CRUD + Apply-template flow on existing job detail page (Phase F10.2) | ⨯ planned (F10.2) |
| Equipment reservations | `equipment_reservations` | `/admin/equipment/reservations` Gantt timeline (§5.12.7.2); per-job reservations panel on existing job detail page; mobile loadout preview (§5.12.9.1) | ⨯ planned (F10.3) |
| Equipment availability | derived `equipment_inventory.next_available_at` + `current_reservation_id` | `GET /api/admin/equipment/availability` runs the four §5.12.5 checks; Today landing-page status pills (§5.12.7.1) | ⨯ planned (F10.3) |
| Personnel skills + certs | `personnel_skills`, `personnel_unavailability` | `/admin/employees/[email]/skills` admin pages (Phase F10.4); cert PDFs via `seeds/226` files bucket | ⨯ planned (F10.4) |
| Job team assignments + state | `job_team` (extended w/ `assigned_from`/`_to` + `state` machine) | Assignment slot widget on existing job detail page; mobile [Confirm]/[Decline] cards in inbox; week-grid heatmap on `/admin/equipment/crew-calendar` (§5.12.7.6) | ⨯ planned (F10.4) |
| Equipment events (audit) | `equipment_events` | History drawer accessible from every inventory unit + every reservation drilldown; powers chain-of-custody PDF for §5.12.11.K litigation hold | ⨯ planned (F10.5) |
| Daily check-in/check-out | `equipment_reservations` (`state='checked_out'`/`returned'` + condition fields) | Equipment Manager mobile 🛠 Gear tab + admin Today landing page; QR-scan flows on both surfaces; 6pm/9pm unreturned-gear nag cron | ⨯ planned (F10.5) |
| Maintenance + calibration | `maintenance_events`, `maintenance_event_documents`, `maintenance_schedules` | `/admin/equipment/maintenance` calendar + per-unit history page; daily 3am cron for due-date notifications | ⨯ planned (F10.7) |
| Consumables (bulk) | `equipment_inventory` (`item_kind='consumable'`) + `equipment_reorder_requests` | `/admin/equipment/consumables` low-stock list w/ days-of-stock-remaining sort + restock receipt linkage (§5.12.7.5) | ⨯ planned (F10.6) |
| Borrowed-in equipment | `equipment_borrowed_in` | Inline section on Today landing page + per-job loadout panel (§5.12.11.A) | ⨯ planned (post-F10) |
| Lent-out equipment | `equipment_loans_out` | Admin-gated loan approval flow + reservation hard-block linkage (§5.12.11.B) | ⨯ planned (post-F10) |
| Equipment depreciation | `equipment_tax_elections` (per-year-per-asset frozen records) | "Lock equipment depreciation" button on `/admin/finances` (mirrors Batch QQ); `equipment` block on `tax-summary` JSON; Asset Detail Schedule PDF + CSV (§5.12.10) | ⨯ planned (F10.9) |
| Software licenses | `equipment_software_licenses` | Per-unit license card on inventory drilldown w/ seats_total / seats_used + transfer history (§5.12.11.I) | ⨯ planned (post-F10) |

**Activation gate**: every admin surface above bypasses RLS via
`supabaseAdmin` (service role), so the data flows even if user-JWT
RLS isn't fully configured yet. New mobile screens that write
should be added to this matrix as they ship.

---

## 9.z — Tablet & responsive support

Per the user's deployment requirement: *"I am going to need to build
this app to work on tablets and all kinds of phones."* Tracked as a
cross-cutting concern rather than a single F7 checkbox.

**Currently:**
- `mobile/app.json` declares `supportsTablet: true` (iOS).
- `mobile/lib/responsive.ts` (this batch) exposes
  `useResponsiveLayout()` + `tabletContainerStyle()` so a screen can
  opt into a max-readable-width layout with two lines of code.
  Breakpoints: `<600 dp` = phone, `≥600 dp` = tablet. Tablet content
  clamps to 720 px and centres.
- Applied to the four main tab screens: Jobs (`(tabs)/jobs/index.tsx`),
  Time (`(tabs)/time/index.tsx`), Money (`(tabs)/money/index.tsx`),
  Me (`(tabs)/me/index.tsx`).

**Pending:**
- Drill-down screens (`jobs/[id]/`, `money/[id]`, `me/uploads`,
  `me/privacy`, `time/edit/[id]`, `time/pick-job`, capture flows)
  still inherit phone-portrait defaults. Same helper applies trivially.
- Split-pane layouts for tablet landscape — Jobs list + map next to
  each other; Time tab + active-job preview side-by-side. Tracked
  under F7 "Tablet layout (truck-mounted iPad)" with the responsive
  primitives now in place.
- Real-device testing: 6.1" iPhone, 6.7" iPhone, 11" iPad, 12.9" iPad
  in both orientations. No automated testing of layouts — manual QA.

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

### Phase F10 incremental cost (equipment + supplies inventory)

Phase F10 adds storage + a few cron jobs but no per-receipt
AI cost (the equipment promotion path reuses the existing
§5.11 receipt extraction; nothing new to bill).

| Item | Monthly | Notes |
|---|---|---|
| Supabase Storage — calibration cert PDFs + maintenance event documents | $1–5 | ~50 instruments × ~5 PDFs × 200KB + before/after damage photos |
| Supabase Storage — equipment catalogue photos + QR sticker PDFs | $0–2 | One photo per durable; bulk QR sheets cached on the admin side |
| Supabase compute — daily 3am maintenance cron + 6pm/9pm unreturned-gear cron | $0 | Within existing Pro plan; queries are tiny |
| Push notifications — assignment confirms / overdue nags / cert-expiry warnings | $0 | Expo free tier |
| Worker compute — Asset Detail Schedule PDF generation (annual) | $0 | One-shot annual job; runs on existing worker |
| **Total F10 incremental** | **~$1–7/mo** | Negligible vs the receipts/Anthropic line; Schedule C Line 13 deduction recovery dwarfs it |

### Phase F10 ROI

Per-asset visibility + IRS-grade depreciation tracking +
calibration-overdue prevention has compound value:

- **Avoided lost / forgotten gear**: typical small surveying
  shop loses ~$2–5K/yr to "left it on site" + "took it home
  and forgot" + un-recoverable damaged items. Closed-loop
  daily check-in + lost-on-site GPS recovery typically
  recovers 60–80% of that.
- **Section 179 / depreciation accuracy**: a single
  $40K total station with §179 election + accurate
  placed-in-service date saves ~$8–12K in year-1 federal
  tax depending on bracket. Mis-classifying it as supplies
  (or depreciating wrong) can leave that on the table.
- **Calibration-overdue avoidance**: the cost of a single
  contested boundary survey caused by an out-of-cal
  instrument can be $5K–$50K in re-shoot + legal exposure.
  Hard-block past 30 days past due is cheap insurance.
- **Equipment Manager labour**: ~3–5 hours/week of manual
  cage tracking → ~30 min/week of digital review.
  ~$5K/yr at a $35/hr fully-loaded rate.

Net: **~$15K–$70K/yr in recovered value** depending on shop
size + asset profile, against ~$50/yr incremental cloud cost.
ROI is dominated by the §179 / depreciation accuracy line —
the rest is gravy.

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

### Equipment + crew assignment (Phase F10 — added per §5.12)

21. **Equipment Manager role mapping.** Is this a dedicated
    person at Starr's current size, or a hat worn by an
    existing crew lead / Henry? Affects sidebar visibility +
    push-notification routing default. (Lean: hat worn by
    one of the existing admin / dev users initially, with
    the role + permissions modeled cleanly so a dedicated
    hire later doesn't require a refactor.)

22. **Reservation conflict default — hard-block or
    soft-warn?** §5.12.5 ships hard-block as the default with
    a soft-override path. Should some conflict types
    soft-warn instead (e.g. low-stock consumables that the
    Equipment Manager can resolve with a quick restock)?
    (Lean: ship hard-block universally; iterate after 3
    months of usage data.)

23. **Calibration-overdue grace window.** §5.12.5 soft-warns
    inside 30 days past due, hard-blocks beyond. Is 30 days
    the right number for total stations? GPS receivers? Should
    it vary per category? (Decision-required from a licensed
    surveyor — defaults are sketches.)

24. **Section 179 default behaviour.** §5.12.10 picker
    defaults `straight_line` for most items, suggests
    `section_179` for total stations / GPS / similarly-pricey
    instruments. Should the bookkeeper / CPA override the
    suggestion globally, or per-acquisition? (Lean: per-
    acquisition; reflects real-world tax planning where the
    §179 election interacts with annual income shape.)

25. **Equipment receipt threshold.** §5.12.10
    `EQUIPMENT_RECEIPT_THRESHOLD_CENTS` defaults to $2,500
    (IRS de minimis safe harbour). Should this float with
    annual IRS updates, or stay pinned? (Lean: env-overridable
    constant, surfaced in admin Settings so the bookkeeper
    can update on annual IRS publish.)

26. **QR sticker ergonomics + label printer.** What label
    stock + printer is Starr planning to use? (Affects
    §5.12.7.3 bulk QR PDF page geometry — Brother QL-820NWB
    vs DYMO LabelWriter vs generic Avery.) (Lean: Brother
    DK-1201 2.4" × 1.1" address labels — peel-and-stick,
    weatherproof variant exists.)

27. **Personal kit policy.** §5.12.9.4 introduces
    `is_personal=true` for surveyor-owned tools. Does Starr
    want to track these AT ALL, or stay out of personal
    property entirely? (Important for liability + 1099
    boundaries. Lean: track only when surveyor opts in via
    the Money tab "personal" toggle; never assume.)

28. **Borrowed equipment recordkeeping.** §5.12.11.A
    `equipment_borrowed_in` table records gear borrowed from
    other firms. Any TX-survey-board reporting requirements
    we should bake in (chain of custody for a borrowed
    receiver used on a recorded survey)? (Decision required
    from licensed surveyor.)

29. **Lent equipment liability.** §5.12.11.B
    `equipment_loans_out` requires admin sign-off. Does Starr
    want a written agreement template the system generates +
    e-signature flow for the borrower? (Lean: v1 — printed
    PDF Equipment Manager hands over physically; e-sign in
    v2.)

30. **Multi-day overnight default behaviour.** §5.12.11.J
    `multi_day_overnight=true` flag silences the §5.12.6
    nag. Should the default be on for jobs flagged as
    `out_of_state` / `multi_day_estimated_duration`? (Lean:
    no — explicit per-job flag avoids surprise nag-silence
    on a job that ran overtime.)

31. **Cross-template substitution graph.** §5.12.5 v1 lets
    template `notes` declare substitution rules in free-form
    ("OK to swap to GPS Rover Kit if no total station is
    free"). Does Starr want a structured graph in v2 (e.g.
    `category='total_station_kit'` substitutes-to
    `['gps_rover_kit']`)? (Lean: yes for v2 polish, but only
    after 3 months of seeing what surveyors actually
    substitute in real operation.)

32. **Reservation lookahead window.** §5.12.7.2 ships a
    14-day Gantt view by default. Is 14 days the right
    horizon? (Surveying jobs typically book 2–4 weeks out.
    Lean: configurable per user with 14 as default; admins
    extend to 60 days for quarterly planning.)

33. **Software license seat counts.** §5.12.11.I tracks
    seats_total / seats_used per Trimble Access /
    Carlson SurvCE entry. Does Starr need to enforce a
    hard-block when seats_used reaches seats_total at
    check-out time? (Lean: yes — block the check-out, force
    the Equipment Manager to free a seat or buy another.)

34. **Equipment depreciation lock cadence.** §5.12.10
    annual close ritual mirrors Batch QQ. Should this be
    triggered manually only, or auto-fire on the bookkeeper's
    fiscal-year-end + a confirmation prompt? (Lean: manual
    only — too consequential for auto-fire.)

35. **Surveyor decline reason — open enum or fixed?**
    §5.12.4 surveyor decline picker. Should the reason set be
    pre-canned (sick / scheduled-off / scheduling-conflict /
    other-with-text) or fully open? (Lean: pre-canned for
    statistical visibility; "other" path always free-text.)

36. **Fleet valuation export format.** §5.12.7.7 ships CSV +
    PDF "Asset Detail Schedule." Does Starr's CPA prefer one
    format over the other, or want both? Any specific column
    ordering? (Decision-required from CPA.)

37. **Cage / office hours default.** §5.12.6 self-service
    after-hours requires an `equipment_self_checkout` flag.
    Should the system know what "after hours" means (e.g.
    7am–5pm Mon–Fri)? Affects when the soft warning fires
    vs the regular scanner flow. (Lean: configurable per-
    office time-of-day window; surveyors with the flag bypass
    the warning regardless.)

38. **Notification consolidation.** Equipment-related
    notifications could pile up (overdue + maintenance due +
    low stock + assignment confirm). Does the user want a
    per-day digest mode for non-urgent equipment events, or
    individual pings? (Lean: individual for action-required,
    digest for FYI / low-stock / cert-expiring.)

39. **Litigation hold scope.** §5.12.11.K applies a hold to
    a job's reservations + events. Should the hold also
    freeze the linked maintenance events / receipts /
    surveyor location pings? (Lean: yes — full chain-of-
    custody requires the related rows; admin-only action.)

40. **F10 launch prerequisite — fleet inventory.** §5.12.11.H
    bulk import. Is the existing fleet documented anywhere
    (spreadsheet, paper, vendor invoices)? F10.1 needs source
    data. (Action item before F10 starts: Equipment Manager
    walks the cage with a clipboard.)

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

### Equipment kit check-out (target <5s, per §5.12.9.2)

The Equipment Manager's bar — anything slower and the system
gets bypassed for hand-written cage logs.

| Step | Target | Notes |
|---|---|---|
| 🛠 Gear tab → Scanner FAB | 0.5s | Persistent FAB, single tap |
| QR scan resolves | <0.5s | Pre-cached lookup table from offline pre-fetch (§5.12.9.3) |
| Confirmation sheet renders | 0.5s | Crew + job pre-filled from `state='held'` reservation |
| Default condition = good (one tap to submit) OR photo + condition selector | 1–3s | Photo path adds ~2s for capture |
| Server roundtrip + optimistic local flip | <0.5s | Background; local state updates immediately |
| **Total (kit, default condition)** | **~3s** | |
| **Total (item with damage photo)** | **~6s** | |

Kit batch check-out flips parent + N children in one
transaction — same 3s budget regardless of kit size (§5.12.6).

### Equipment kit check-in (target <5s)

| Step | Target | Notes |
|---|---|---|
| 🛠 Gear tab → Scanner FAB | 0.5s | |
| QR scan + smart routing | <0.5s | System auto-detects this is a return because reservation is in `state='checked_out'` |
| Confirmation sheet — condition + consumed_quantity (consumables only) | 1–2s | |
| Submit + audit log + `quantity_on_hand` decrement (if consumable) | <0.5s | |
| **Total (durable, good condition)** | **~3s** | |
| **Total (consumable w/ count)** | **~4s** | |

### Surveyor assignment confirmation (target <10s)

| Step | Target | Notes |
|---|---|---|
| Notification arrives | (push) | |
| Tap notification → confirmation card | 1s | |
| Read job + crew + equipment list | 5–7s | User-driven |
| Tap **Confirm** OR **Decline + reason picker** | 1–3s | Decline path 3s for reason selection |
| **Total** | **~7–10s** | |

---

## 15. Appendix C — bootstrapping checklist (Phase F0)

- [ ] Decide app name (working title: Starr Field)
- [ ] Apple Developer + Google Play accounts under Starr Software
- [ ] App icon + splash screen
- [x] Initialize Expo at `mobile/` in this monorepo (`npx create-expo-app mobile --template`) — see §6 preamble. Done; scaffold + tab bar + auth + PowerSync wired (Phase F0).
- [ ] **Schema audit + snapshot:** export the live Supabase schema for `jobs`, `job_tags`, `job_team`, `job_equipment`, `job_files`, `job_research`, `job_stages_history` (and any other `job_*` tables) plus `time_entries` and related payroll tables, into a tracked `seeds/214_starr_field_existing_schema_snapshot.sql`. Without this, `seeds/220_starr_field_tables.sql` will fail against a fresh `./seeds/run_all.sh --reset` because `ALTER TABLE jobs` and `ALTER TABLE time_entries` reference tables not in the seed pipeline. **Blocks every other Phase F0 item that touches those tables.**
- [ ] **Inventory the 179-code point taxonomy:** locate the canonical list (printout, spreadsheet, or interview Henry), encode as a CSV, and seed `point_codes` in the same migration. Without this, `field_data_points.code_category` is unenforceable.
- [x] PowerSync vs WatermelonDB 1-day spike (per §6.1) — committed to PowerSync; `mobile/lib/db/{schema,connector,index}.tsx` running in production.
- [ ] Reserve `app.starr.software/field` deep-link domain
- [ ] Privacy policy + terms of service drafted (required for store submission AND for location-tracking consent flow)
- [ ] **Texas-licensed employment attorney engagement letter for location-tracking review**
- [ ] Internal alpha tester list (Jacob, dad, 1–2 crew)
- [ ] MVP success metric ("Jacob does a full week using only Starr Field for time, receipts, and notes")
- [ ] **Raise unified `AI_DAILY_CAP_USD` from $50 → $60** (per §11) and rename the env var across both root and worker `.env.example` files; coordinate the rename with the self-healing plan's bootstrapping
- [ ] Google Cloud project + Places/Distance Matrix billing alerts
- [ ] Verify PostGIS extension enabled on the live Supabase project (`SELECT extname FROM pg_extension WHERE extname='postgis'`)
- [ ] Confirm with Hank Maddux RPLS that `fieldbook_notes` is the right home for mobile structured notes (per §5.5) — if not, decide on a parallel `field_notes` table with explicit reasons

### Phase F10 prerequisites (equipment + supplies inventory + dispatcher templates)

These items don't block Phase F0–F9 but ARE prereqs before
F10.0 (Week 33) can start. Listed in roughly the order needed.

- [ ] **Decide Equipment Manager role mapping** (per §12 #21):
      hat worn by an existing admin / dev user, or new hire?
      Affects role-enum value semantics + push-notification
      routing default. Lean: hat worn initially with role
      modeled cleanly so a future dedicated hire is a
      permission-flip, not a refactor.
- [ ] **Walk-the-cage inventory** (per §12 #40 + §5.12.11.H):
      Equipment Manager produces a CSV (or paper tally
      transcribed) listing every durable + kit + consumable
      currently in the cage with: name, category, manufacturer
      / model, serial number (when applicable), acquired_at
      (best estimate ok), acquired_cost_cents (from invoice
      if available; otherwise estimate), useful_life_months,
      home_location. Powers F10.1 bulk import.
- [ ] **Decide QR sticker label-printer** (per §12 #26):
      Brother QL-820NWB + DK-1201 weatherproof labels
      recommended; alternates: DYMO LabelWriter or generic
      Avery + sheet printer. Affects F10.1 bulk QR PDF page
      geometry.
- [ ] **Calibration grace window per category** (per §12 #23):
      30-day default soft-warn before hard-block. Decision
      required from licensed surveyor — does this hold for
      total stations? GPS receivers? Levels?
- [ ] **Equipment receipt threshold** (per §12 #25):
      $250000 cents ($2,500 — IRS de minimis safe harbour) is
      the §5.12.10 default. Confirm with bookkeeper / CPA
      whether to raise / lower for Starr's fiscal profile.
- [ ] **CPA conversation on tax surfaces** (per §12 #36 + #34):
      preferred export format (CSV vs PDF Asset Detail Schedule
      vs both); column ordering; whether Section 179 picker
      defaults are useful or noise; annual lock cadence
      (manual only is the lean).
- [ ] **TX-survey-board chain-of-custody review** (per §12 #28):
      do borrowed-from-other-firm receivers used on a recorded
      survey require any specific recordkeeping that
      `equipment_borrowed_in` should bake in? Decision
      required from Hank Maddux RPLS or equivalent.
- [ ] **Reservation lookahead horizon** (per §12 #32): default
      14 days OK or extend to 30 / 60? Affects §5.12.7.2 Gantt
      page-load size + the §5.12.5 conflict-detection scan
      window.
- [ ] **Existing fleet → category taxonomy mapping**: the
      `equipment_inventory.category` enum is open in §5.12.1 but
      every unit needs one. Equipment Manager + a licensed
      surveyor agree on the canonical list (`total_station`,
      `gps_rover`, `data_collector`, `tripod`, `prism`, `level`,
      `vehicle_*`, `consumable_paint`, …). v1 stays small;
      categories added as new gear arrives.
- [ ] **Existing software-license inventory** (per §12 #33):
      list every Trimble Access / Carlson / Topcon activation
      currently bound to a specific receiver, plus seats_total
      / seats_used + expiry. Powers F10.7 / §5.12.11.I when
      that polish batch lands.
- [ ] **Personnel skill catalogue seeding**: list every active
      RPLS / LSIT / Part-107 / OSHA-30 / flagger / CDL credential
      across the team with `acquired_at` + `expires_at` +
      cert PDF if available. Powers F10.4 personnel availability
      checks.
- [ ] **Cage hours definition** (per §12 #37): time-of-day
      window for "in office hours" vs "after hours"
      self-service. Default 7am–5pm Mon–Fri; configurable per
      office once §5.12.11.D lands.

---

## 16. Decision log

| Date | Decision | Rationale | Decider |
|---|---|---|---|
| 2026-04-25 | Plan v1 drafted | Initial RFC | Jacob + Claude |
| 2026-04-25 | Plan v2 — add time/location/receipts | Field productivity + financial tracking + dispatcher visibility | Jacob + Claude |
| 2026-04-25 | Plan v3 — codebase-alignment audit pass (20 edits) | Initial draft introduced parallel systems for jobs / notes / time tracking even though substantial admin infrastructure already exists in `/admin/jobs/`, `/admin/payroll/`, `/admin/hours-approval/`, `/admin/my-hours/`, and `seeds/099_fieldbook.sql`. v3 rewrites §5.2 / §5.5 / §5.8 to extend those existing systems, drops the standalone `field_notes` table in favor of ALTERing `fieldbook_notes`, frames receipt AI extraction and storage as reuses of `worker/src/lib/ai-usage-tracker.ts` and `worker/src/lib/storage.ts`, converts §6.3 SQL to project seed conventions (`BEGIN/COMMIT`, `IF NOT EXISTS`, `DO $$ ... END $$` constraint guards) and pins it to `seeds/220_starr_field_tables.sql`, replaces the generic RLS paragraph with the concrete `service_role` pattern from `seeds/099_fieldbook.sql`, renames §9 phases `Phase 0/1/.../9+` → `Phase F0/F1/.../F9+` to disambiguate from the project-wide Phase 0/A/B/C/D taxonomy in `RECON_INVENTORY.md` §12, restricts §7.4 dispatcher view to the existing `/admin/` route tree, namespaces mobile-callable APIs at `/api/mobile/*` (Supabase JWT) instead of overloading `/api/admin/*` (NextAuth-cookie-only), commits to PowerSync (default) over WatermelonDB, declares the mobile code lives at `mobile/` in this monorepo, and adds the schema-snapshot prerequisite (`seeds/214_*`) and shared `AI_DAILY_CAP_USD=60` to §15 bootstrapping. Net: +380 / -212 lines vs v2 assembly. | Jacob + Claude |

---

*End of plan.*
