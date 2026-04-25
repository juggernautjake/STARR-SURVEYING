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
8. Integrate with the existing 179-code point system as a first-class concept
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
┌──────────────────────────────────────────────────────────────────┐
│                    STARR SOFTWARE PLATFORM                        │
├──────────────────────────────────────────────────────────────────┤
│  Starr Compass       Starr Forge       Starr Orbit               │
│  (pre-dev research)  (construction)    (HOA/community)           │
├──────────────────────────────────────────────────────────────────┤
│  Starr CAD (desktop survey CAD)                                  │
│  Starr Surveying internal tools                                  │
├──────────────────────────────────────────────────────────────────┤
│  ★ STARR FIELD ★  ←  this document                               │
│  Mobile: capture, time + location, receipts, notes               │
├──────────────────────────────────────────────────────────────────┤
│  Shared backend: Next.js 14 + Supabase (Postgres, Auth, Storage) │
│  Plus: R2 (media archival), Anthropic API (receipt + stop AI)    │
└──────────────────────────────────────────────────────────────────┘
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
- Supabase Auth (same accounts as the web app)
- Biometric unlock (Face ID / fingerprint) after first sign-in
- Auto-lock after configurable idle (default 15 min)
- Stay-signed-in across app restarts; explicit sign-out only on demand
- Re-auth required for destructive actions (delete job, delete point, delete time entry)

### 5.2 Jobs

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

**Cost per receipt:** ~$0.01–0.04 with Claude Sonnet. At a generous 200 receipts/employee/month, that's $2–8/month per employee in AI cost. Trivial vs. the bookkeeper time saved.

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
