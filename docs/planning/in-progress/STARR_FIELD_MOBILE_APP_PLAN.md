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

#### 5.12.3 Templates · 5.12.4 Personnel · 5.12.5 Availability + conflicts · 5.12.6 Daily check-in/out · 5.12.7 Equipment Manager workflows · 5.12.8 Maintenance + calibration · 5.12.9 Mobile UX · 5.12.10 Tax + depreciation tie-in · 5.12.11 Edge cases

**Deferred to follow-up planning prompts.** Sketches of what each
sub-section will cover (so the user can pick the next chunk):

- **5.12.3 Templates** — dispatcher-defined reusable kits ("4-corner
  residential boundary, total-station flavour"; "GPS rover flavour";
  "OSHA-mandated road work add-on"). Per-job-type defaults.
  Template versioning so old jobs don't drift when the template
  is updated.
- **5.12.4 Personnel assignment** — `job_team` already exists. We
  layer crew skills / certifications (RPLS, field tech, party
  chief), per-day capacity ("Jacob is on Job A 8am-noon, Job B
  noon-5pm"), and template hooks ("template requires at least one
  RPLS").
- **5.12.5 Availability + conflict detection** — central rule:
  any `equipment_inventory` row whose `current_status='in_use'`
  OR has an unreturned `job_equipment` row OR is reserved for a
  future overlapping window is **not assignable**. Dispatcher
  sees the conflict + the reason + a suggested alternative
  (next-available date or a substitutable kit). Hard-block by
  default, soft-override with audit reason for emergencies.
- **5.12.6 Daily check-in/check-out** — Equipment Manager mobile
  screen with QR scan. Morning: scan kit → it flips to `in_use`,
  records the crew + job. Evening: scan kit on return → flips to
  `available`, records condition. Crews who clock out without
  returning gear get a nag notification (reuses the §5.10.4
  notifications stack).
- **5.12.7 Equipment Manager dashboards** — daily reconcile view
  (what's out, what's overdue, what's coming back tonight),
  maintenance calendar, low-stock consumables alerts, fleet
  valuation page (rolls into the §11 cost model + Batch QQ tax
  summary's depreciation line).
- **5.12.8 Maintenance + calibration** — service events table,
  PDF cert attachments, "next calibration due in 14 days"
  alerts, integration with the receipts module so a calibration
  invoice receipt links back to the equipment row.
- **5.12.9 Mobile UX** — "what's in my truck right now" tab for
  surveyors; QR-scan check-in on return; lost-on-site flow
  (mark a piece lost with last-known job GPS).
- **5.12.10 Tax + depreciation tie-in** — `acquired_cost_cents`
  + `useful_life_months` feeds the Schedule C Section 13
  depreciation line. Receipt category `equipment` already maps
  to that line (Batch QQ); §5.12.10 closes the loop so
  acquiring a tripod via the receipts flow auto-creates the
  inventory row.
- **5.12.11 Edge cases** — loaned-in (rented from another firm)
  vs loaned-out (lent to another firm); stolen / damaged
  workflows + insurance packet generation; cross-office
  transfers; consumable reorder workflow; calibration-overdue
  hard-block ("S9 #1 is 30 days past calibration; assign
  anyway?").

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

---

## 9.w — Inventory snapshot (state-of-the-build)

*Audited at commit `f2917de` against the actual filesystem, then
incrementally updated through Batch QQ.* Plan claims throughout
this document are spot-verified — the lists below are the
reconciled truth, not a re-statement of the per-phase checkboxes.
Update this section every time a Batch lands.

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
`finances/mark-exported` (period-lock action, Batch QQ).

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
tax-period locking, Batch QQ) — all present on disk.
**Activation gates pending live apply:** 229, 230, 231, 232.

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
- **Worker retention sweep CLI** — closes the Batch CC v2
  polish item: hard-delete receipts past the IRS retention
  window (3 yr clean returns, 7 yr substantial under-reporting,
  90 d for never-approved rejections). Tombstone columns +
  partial index already shipped (`seeds/230`); only the worker
  service + cron entry remain.
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
2. **Receipt AI extraction does not currently integrate with the
   global `AiUsageTracker`** (Whisper transcription same — Batch R
   notes this explicitly). Per-row cost lands in
   `transcription_cost_cents` / receipt-side equivalent, but the
   shared circuit breaker doesn't trip on Starr Field spend. v2
   polish per the cost model in §11.

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

---

## 16. Decision log

| Date | Decision | Rationale | Decider |
|---|---|---|---|
| 2026-04-25 | Plan v1 drafted | Initial RFC | Jacob + Claude |
| 2026-04-25 | Plan v2 — add time/location/receipts | Field productivity + financial tracking + dispatcher visibility | Jacob + Claude |
| 2026-04-25 | Plan v3 — codebase-alignment audit pass (20 edits) | Initial draft introduced parallel systems for jobs / notes / time tracking even though substantial admin infrastructure already exists in `/admin/jobs/`, `/admin/payroll/`, `/admin/hours-approval/`, `/admin/my-hours/`, and `seeds/099_fieldbook.sql`. v3 rewrites §5.2 / §5.5 / §5.8 to extend those existing systems, drops the standalone `field_notes` table in favor of ALTERing `fieldbook_notes`, frames receipt AI extraction and storage as reuses of `worker/src/lib/ai-usage-tracker.ts` and `worker/src/lib/storage.ts`, converts §6.3 SQL to project seed conventions (`BEGIN/COMMIT`, `IF NOT EXISTS`, `DO $$ ... END $$` constraint guards) and pins it to `seeds/220_starr_field_tables.sql`, replaces the generic RLS paragraph with the concrete `service_role` pattern from `seeds/099_fieldbook.sql`, renames §9 phases `Phase 0/1/.../9+` → `Phase F0/F1/.../F9+` to disambiguate from the project-wide Phase 0/A/B/C/D taxonomy in `RECON_INVENTORY.md` §12, restricts §7.4 dispatcher view to the existing `/admin/` route tree, namespaces mobile-callable APIs at `/api/mobile/*` (Supabase JWT) instead of overloading `/api/admin/*` (NextAuth-cookie-only), commits to PowerSync (default) over WatermelonDB, declares the mobile code lives at `mobile/` in this monorepo, and adds the schema-snapshot prerequisite (`seeds/214_*`) and shared `AI_DAILY_CAP_USD=60` to §15 bootstrapping. Net: +380 / -212 lines vs v2 assembly. | Jacob + Claude |

---

*End of plan.*
