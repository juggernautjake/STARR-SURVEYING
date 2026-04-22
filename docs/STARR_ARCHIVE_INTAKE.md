# Starr Archive — Intake Flow Sketch

**Status:** Design sketch (no code yet)
**Owner:** Jacob, Starr Software
**Last Updated:** April 2026
**Companion docs:** `docs/STARR_SOFTWARE_SUITE.md`, `docs/RECON_INVENTORY.md`

---

## 1. Why Starr Archive Exists

Starr Surveying has decades of work product sitting in three places that are not searchable, not backed up, and not feeding the Starr Recon pipeline:

1. **Filing cabinets** in the Belton office — physical job folders with hand-drawn field notes, recorded plats, photos, staked-out boundary diagrams, hand-written closure calcs, customer correspondence.
2. **Dad's PC** — the working files (CAD drawings, scanned documents, exported PDFs, surveyor's reports, draft drawings, photos pulled off a digital camera).
3. **Flash drives** — the "I'm taking this to the field" snapshots and the "I'm bringing this back from the courthouse" drops. Some are years old; nobody has a definitive list.

Starr Archive is the system that turns this trio into a structured, searchable archive of historical job records — and, as a side benefit, into an ever-growing pool of ground-truth fixtures for the Starr Recon regression set.

**Two-track value proposition:**

| Track | Value |
|---|---|
| **Operational** | Dad and the field crew can pull up "every job we ever did at this address / for this client / in this section" in seconds, including the hand-drawn field notes. Backed up and not single-points-of-failure on one PC and one filing cabinet. |
| **Product** | Every fully-digitized historical job becomes a candidate ground-truth fixture for Starr Recon. The bigger the regression set grows, the harder Starr Recon is to silently break. The unfair advantage that no Browserbase-funded competitor can match. |

This document sketches **the intake flow only** — the part where raw stuff (paper, files, USB sticks) gets turned into structured records. The downstream search UI, share functionality, and long-term retention policy are out of scope here and get their own docs when implementation begins.

---

## 2. Personas

| Persona | Who | Primary action | Friction tolerance |
|---|---|---|---|
| **Field Surveyor (Dad)** | Licensed PLS, 30+ years in the field | Bring back paper notes from a job; drop scanned PDFs; expect them filed somewhere sensible without thinking about it | **Very low.** If it takes more than ~30 seconds of his time per job, he won't do it consistently. |
| **Office Staff** | Whoever is in the office (admin, future hires) | Bulk-scan a stack of job folders from a filing cabinet; sort flash-drive contents | **Medium.** Will follow a reasonable workflow if it's well-documented. |
| **Jacob (engineering)** | Building Starr Software | Configure Archive, fix incorrectly-tagged jobs, harvest fixtures into the Starr Recon regression set | **High.** Will use a CLI, write SQL, debug. |

The intake flow MUST optimize for Dad's experience. Office Staff and Jacob are the recovery / cleanup tier. If Dad won't use it, the whole archive stays in the filing cabinets.

---

## 3. Three Intake Paths

Different sources need different ergonomics. The Archive accepts all three, normalizes everything to the same record shape, and lets the catalog hide the source distinction from search.

### Path A — Bulk PC + Flash-Drive Import (one-shot ingest)

The legacy bulk problem: years of files already on Dad's PC and on N flash drives. We want to ingest these once, with as little manual sorting as possible.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   User points the Archive Importer at:                          │
│     - a directory on Dad's PC (e.g. C:\Surveys\)                │
│     - a mounted flash drive (e.g. E:\)                          │
│     - a local folder containing copies of either                │
│                                                                 │
│         ↓                                                       │
│                                                                 │
│   Importer walks the tree, hashing every file (SHA-256)         │
│                                                                 │
│         ↓                                                       │
│                                                                 │
│   For each file:                                                │
│     1. Skip if hash already in Archive (dedupe across drives)   │
│     2. Classify by extension/MIME (drawing, doc, image, raw)    │
│     3. Probe parent-folder name + filename for a job number     │
│        (regex: ^[0-9]{2,4}-[0-9]{2,4}, "Job ####", etc.)        │
│     4. Extract embedded metadata (PDF Title, EXIF date,         │
│        DXF $TDCREATE)                                           │
│     5. Stage file → R2 cold bucket as content-addressed blob    │
│        path: archive/raw/<sha256[0:2]>/<sha256>.<ext>           │
│     6. Insert archive_files row with provisional metadata       │
│                                                                 │
│         ↓                                                       │
│                                                                 │
│   Importer prints a summary:                                    │
│     "Ingested 2,847 files (1,205 GB).                           │
│      1,432 auto-grouped into 87 jobs.                           │
│      1,415 unassigned — review at /admin/archive/triage"        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key properties:**

- **Idempotent.** Re-running the importer over the same directory adds zero rows. Re-running over an overlapping directory dedupes by content hash.
- **No file destruction.** The originals on Dad's PC and the flash drives stay untouched. The Archive is a copy.
- **Resumable.** Crash mid-import, re-run, picks up where it left off (state in `archive_import_runs`).
- **Provisional grouping.** Files are tentatively assigned to a Job by folder-name and filename heuristics. The Office Staff persona reviews unassigned files in a triage UI later.
- **Speed target.** 1 GB/min sustained on local SSD, gated by R2 PUT throughput (~50 MB/s realistic per connection; parallelize 8 connections).

### Path B — Scan Station for Paper

A dedicated Brother / Fujitsu-class duplex scanner sits in the office. Dad or office staff drops a stack of paper from one job folder, scans it as a single PDF, and the file lands in a watched directory.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Scanner outputs PDF to:                                       │
│     \\office-nas\scans\inbox\<auto-named>.pdf                   │
│                                                                 │
│         ↓                                                       │
│                                                                 │
│   Watcher (Archive worker, runs continuously):                  │
│     1. Detects new PDF                                          │
│     2. Computes hash                                            │
│     3. Runs OCR (out-of-scope for this sketch — see §5)         │
│     4. Looks for a Job number on page 1 (handwritten or         │
│        stamped). Falls back to OCR'd address.                   │
│     5. If Job number found → auto-attach to existing Job        │
│        (or create new one if unknown)                           │
│        If not → file lands in the triage queue                  │
│                                                                 │
│         ↓                                                       │
│                                                                 │
│   Scanner UI (a simple screen on a tablet next to the scanner): │
│     "Scan #43 — auto-detected Job 2018-447. Confirm? [Yes/No]   │
│      Or pick a different Job from the list."                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Dad's actual workflow is two clicks:** drop pages, push scan button, glance at the tablet, tap Yes. That's the friction budget.

### Path C — Mobile Capture (field + opportunistic)

A surveyor in the field photographs a wall-mounted plat, a recorded subdivision diagram in the courthouse, or a hand-sketch on a job site. The phone uploads to a private S3 / R2 endpoint via a thin mobile app (or a PWA for v1).

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Phone app (or PWA):                                           │
│     1. Camera with rectification (perspective-correct a         │
│        photographed page so it looks like a flat scan)          │
│     2. Multi-shot batch (one job = N photos)                    │
│     3. Tag with: Job (autocomplete from recent Jobs),           │
│        category (field notes, plat, courthouse doc, photo of    │
│        monument, etc.)                                          │
│     4. Background-upload over wifi or LTE                       │
│                                                                 │
│         ↓                                                       │
│                                                                 │
│   Server side: same content-addressed staging as Path A         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

V1 is a PWA — no app-store friction. Camera + upload + tag is a long evening's worth of work in React, not a real product.

---

## 4. The Job Folder — Canonical Unit

Every file lives inside a **Job Folder**, which is the unit Dad already thinks in. Roughly:

```
Job Folder
├── identification
│   ├── job_number          (e.g. "2018-447", canonical, unique within Starr)
│   ├── client_name
│   ├── address             (parsed via existing worker/src/services/address-normalizer.ts)
│   ├── county_fips
│   ├── parcel_id           (if known)
│   ├── job_type            (boundary, topo, ALTA, subdivision plat, ROW, etc.)
│   └── opened_date / closed_date
│
├── files[]
│   └── { archive_file_id, category, page_range, captured_at, source_path }
│
├── linked_starr_recon_project_id     (when a Recon job has been run on this property)
└── regression_fixture_status
        none | candidate | curated | active
```

### Job-number identification strategy

Files are mapped to Jobs by, in priority order:

1. **Explicit job number** in the path or filename (`2018-447 SMITH BOUNDARY/`, `2014-091.dxf`)
2. **Job number found by OCR on page 1** of a scan (Dad writes job numbers on the cover sheet)
3. **Folder grouping** — sibling files in the same folder probably belong to the same job; if any one of them maps to a known job, the rest tentatively join
4. **Address match** — the OCR'd address parses to a known job's address
5. **Triage queue** — none of the above worked; office staff manually assigns

Heuristics 1–4 are best-effort. Triage is the safety net. The Archive never *guesses* — provisional matches below a confidence threshold land in triage with a "we think this is Job X (62% confidence) — confirm?" UI.

---

## 5. Storage Tier Strategy

| Tier | Where | What lives there | Why |
|---|---|---|---|
| **Hot metadata** | Supabase Postgres (`archive_*` tables) | Job records, file records, tags, triage queue, audit log | Fast search/filter; the bulk of read traffic hits this |
| **Warm extracts** | R2 standard bucket `archive-extracted/` | OCR text, PDF page thumbnails, downsized previews, extracted CAD-element JSON | Searchable + viewable in the UI without paying egress for raw multi-MB blobs |
| **Cold raw** | R2 standard bucket `archive-raw/` (with `Storage-Class: STANDARD` for now; consider Infrequent-Access tier once volume justifies it) | Original scans, original CAD files, original photos — content-addressed by SHA-256 | Cheap, durable, immutable. Almost never read once OCR'd. |
| **Glacier-equivalent** | (not in v1) | Decade-old archive snapshots | Wait until the volume actually warrants the read-latency cost |

R2 is preferred over Supabase Storage for raw because Cloudflare's egress-free pricing makes "we re-process this entire archive when the OCR engine improves" a feasible operation.

**No physical destruction.** Even after a job is fully digitized and indexed, the physical filing-cabinet folder stays put — for legal/professional-records reasons and because Dad isn't ready for that yet. Archive includes a `physical_location` field on each Job (e.g. "Cabinet 3, Drawer B, folder labeled SMITH 2018") so the digital record points back at the paper. Stretch goal: a labeling step that prints/writes a barcode sticker for the physical folder so a future "scan to find paper" UX is possible.

---

## 6. The Triage Queue

This is the honest answer to "what about everything the heuristics couldn't classify?"

**UI shape** (sketch — actual screens come with the v1 build):

```
┌──────────────────────────────────────────────────────────────────┐
│  Starr Archive — Triage Queue                          1,415 ⓘ  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Filter: [unassigned ▾]  [from PC ▾]  [last 30 days ▾]           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ ▢ scan_2024-11-03_14-22.pdf       3.4 MB   12 pages        │  │
│  │   Suggested: Job 2018-447 (62% — address match on page 1)  │  │
│  │   [ Confirm ] [ Pick another job ▾ ] [ New job ] [ Trash ] │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ ▢ untitled-1.dxf                  87 KB                    │  │
│  │   No suggestion — open in viewer to inspect                │  │
│  │   [ Confirm ] [ Pick another job ▾ ] [ New job ] [ Trash ] │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Bulk: [ ▾ Pick action for selected ]                            │
└──────────────────────────────────────────────────────────────────┘
```

**Triage SLOs:**

- A Path-A bulk import generates triage volume in proportion to how messy the source is. We expect first-import to surface a queue of ~50% of imported files. That's fine — it's a one-time backlog, processed at office-staff pace.
- Path B (scan station) and Path C (mobile) should produce <5% triage volume in steady state. If they don't, the heuristics need work.
- Triage items older than 90 days are auto-flagged as "stale" — Jacob reviews and either fixes the heuristics or marks them junk.

---

## 7. Schema Sketch (will move to `seeds/210_archive.sql` when implementation begins)

Not implemented in this PR — schema is sketched here for review.

```
archive_jobs
  id (uuid PK)
  job_number             text unique
  client_name            text
  address                text          -- normalized via worker/src/services/address-normalizer
  county_fips            text
  parcel_id              text          -- nullable
  job_type               text          -- 'boundary' | 'topo' | 'alta' | 'subdivision' | 'row' | 'other'
  opened_date            date          -- nullable
  closed_date            date          -- nullable
  physical_location      text          -- 'Cabinet 3, Drawer B'
  recon_project_id       uuid          -- nullable; FK → research_projects
  fixture_status         text          -- 'none' | 'candidate' | 'curated' | 'active'
  notes                  text
  created_at, updated_at timestamptz

archive_files
  id (uuid PK)
  sha256                 text unique   -- content-addressed dedupe key
  job_id                 uuid          -- nullable; null = unassigned/triage
  category               text          -- 'field_notes' | 'recorded_plat' | 'closure_calc' |
                                       --   'cad_drawing' | 'photo' | 'correspondence' | 'other'
  filename               text          -- last-known filename (provenance only)
  source_path            text          -- where it came from on the original device
  source_drive_id        uuid          -- FK → archive_source_drives
  size_bytes             bigint
  mime_type              text
  page_count             int           -- nullable (PDFs)
  captured_at            timestamptz   -- nullable (EXIF / PDF metadata / DXF $TDCREATE)
  ocr_status             text          -- 'pending' | 'done' | 'failed' | 'not_applicable'
  ocr_text               text          -- nullable; mirrored to a tsvector index
  r2_raw_key             text          -- 'archive-raw/<sha256[0:2]>/<sha256>.<ext>'
  r2_thumbnail_key       text          -- nullable
  triage_confidence      decimal(4,3)  -- 0..1; null when not triaged
  triage_suggestion      jsonb         -- { suggested_job_id, reason, evidence }
  created_at             timestamptz

archive_source_drives
  id (uuid PK)
  label                  text          -- 'Dad PC C:\Surveys', 'Flash drive #4 (red)'
  device_uuid            text          -- when available (volume serial / fs UUID)
  first_seen, last_seen  timestamptz

archive_import_runs
  id (uuid PK)
  source_drive_id        uuid
  started_at, finished_at timestamptz
  files_seen, files_added, files_skipped int
  status                 text          -- 'running' | 'done' | 'failed'
  error                  text

archive_audit_log
  id (uuid PK)
  actor                  text
  action                 text          -- 'create' | 'reassign' | 'merge' | 'delete' | ...
  entity_type            text          -- 'job' | 'file'
  entity_id              uuid
  before, after          jsonb
  at                     timestamptz
```

Full-text search uses a `tsvector` on `archive_files.ocr_text` plus the existing JSONB pattern. Index strategy lifts from `seeds/200_recon_graph.sql`.

---

## 8. Integration with Starr Recon

Two-way wiring, both feature-flagged off until v1 ships.

### Recon → Archive (lookup)

When a user starts a new Starr Recon project on an address, Recon checks the Archive for prior jobs at the same address (or same parcel_id). If found:

- A "Prior Starr work at this address" panel appears in the intake screen
- Linked job folders surface in the document library tab
- Hand-drawn field notes from the prior job are presented as candidate ground truth (with appropriate "this is Starr's prior work, not a public record" labeling)

### Archive → Recon regression set (harvest)

When a Job is fully digitized and a Recon project has been run on that same property:

1. The archive admin marks the Job's `fixture_status = candidate`
2. Jacob (or a regression-curation workflow) compares the Recon output to the digitized Starr work
3. Where Starr's known answer is authoritative (boundary calls, owner history Starr personally documented), the discrepancies become the basis for a new fixture in `worker/src/__tests__/regression/fixtures/<county>/<job_number>.json`
4. `fixture_status` flips to `curated` then `active`

This is the path by which the regression set grows from 1 (synthetic) → 5 → 15 → 50, per the Phase A/B/D plan in `docs/RECON_INVENTORY.md §11`.

---

## 9. What's Out of Scope Here (separate sketches when needed)

- **Search UI.** The /admin/archive/search screen design.
- **Sharing.** Letting clients see their own historical jobs (probably uses the same `report_share_service.ts` pattern as Recon).
- **OCR pipeline detail.** Tesseract vs cloud OCR vs Anthropic Vision; layout detection; handwriting recognition (handwritten field notes are a real challenge).
- **Mobile app proper** (vs PWA). Decision deferred until PWA tells us whether the friction is worth the app-store overhead.
- **Physical-archive labeling system.** The barcode/QR-code workflow that ties physical folders back to digital records.
- **Retention + deletion policy.** What can ever be deleted. (Surveyors' working files have professional-records implications; this requires a real conversation, not a unilateral engineering decision.)
- **Staff permissions.** Who can reassign, merge, delete. Defer to v1 implementation.
- **Cost projection.** R2 storage and OCR pricing at the projected volume of decades of jobs. Will write up when implementation is greenlit.

---

## 10. Build Sequencing (when greenlit)

This is the rough sequencing **whenever Starr Archive becomes a build priority** — likely after Starr Recon Phase B (intelligence layer) is stable. Not a commitment to any timeline.

| Step | Deliverable | Depends on |
|---|---|---|
| Archive-0 | This sketch (✅ done in this PR) | — |
| Archive-1 | `seeds/210_archive.sql` schema | R2 buckets provisioned (Phase A of Recon) |
| Archive-2 | Path A bulk importer CLI | Schema |
| Archive-3 | Triage UI in `/admin/archive/triage` | CLI generates triage rows |
| Archive-4 | Path B scan-station watcher + tablet UI | Triage UI exists; OCR pipeline picked |
| Archive-5 | Recon → Archive lookup integration | Both products operating against same Supabase |
| Archive-6 | Path C mobile PWA capture | All of the above |
| Archive-7 | Archive → Recon regression-fixture harvest workflow | A handful of digitized jobs exist to test against |

---

## 11. Decision Log

| Date | Decision | Reason |
|---|---|---|
| Apr 2026 | Public name = "Starr Archive" (single-word codename, matches naming rules in `docs/STARR_SOFTWARE_SUITE.md`) | Reserves "Starr Vault" for signed-final-deliverable storage, which is a meaningfully different product. |
| Apr 2026 | R2 over Supabase Storage for raw blobs | Egress-free pricing makes future re-processing affordable. |
| Apr 2026 | Content-addressed (SHA-256) storage paths | Free dedupe across overlapping flash-drive contents; immutability for the audit log. |
| Apr 2026 | No physical destruction in v1 | Legal / professional-records sensitivities; barcode-back-to-folder workflow is a stretch goal. |
| Apr 2026 | Triage UI is non-optional | Heuristics will never be 100% on legacy filing-cabinet content. Pretending they will be produces silently wrong indexing. |
