# Starr Archive — Intake Flow Sketch

**Status:** Design sketch (no code yet)
**Owner:** Jacob, Starr Software
**Last Updated:** April 2026 (deepened in PR 2)
**Companion docs:** `docs/platform/STARR_SOFTWARE_SUITE.md`, `docs/platform/RECON_INVENTORY.md`

> **Document layout note (Apr 2026):** PR 1 relocated this draft from
> `docs/STARR_ARCHIVE_INTAKE.md` to `docs/product/starr-archive.md` and
> renamed its top-level sections to match the canonical sketch outline
> (PURPOSE → INTAKE FLOW → DATA MODEL HOOKS → PRODUCT TIER FIT →
> PHYSICAL INTAKE LOGISTICS → OPEN QUESTIONS). PR 2 deepened each
> canonical section with the spec detail described in the round-2
> prompt: a 7-step canonical intake walk-through, concrete graph-node
> schema additions (`archive_origin`, `ARCHIVED_FROM`, `PhysicalArtifact`),
> a tier-fit sketch, expanded scanner/OCR logistics, a Starr-Recon
> integration section, and four added open questions. Every existing
> section is preserved; sections that don't map 1:1 to a canonical
> heading are grouped under **ADDITIONAL NOTES** with original
> numbering retained for traceability.

---

## PURPOSE
### 1. Why Starr Archive Exists

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

## ADDITIONAL NOTES (sections that don't map to a canonical heading)

The remaining sections — **Personas (2)**, **The Job Folder — Canonical Unit (4)**, **The Triage Queue (6)**, **Integration with Starr Recon (8)**, and **Build Sequencing (10)** — are kept inline with their original numbering for traceability. They cover supporting context that informs PURPOSE / INTAKE FLOW / DATA MODEL HOOKS but isn't a 1:1 fit for any single canonical heading. The PR 2 polish pass may further inline them under the canonical sections.

### 2. Personas

| Persona | Who | Primary action | Friction tolerance |
|---|---|---|---|
| **Field Surveyor (Dad)** | Licensed PLS, 30+ years in the field | Bring back paper notes from a job; drop scanned PDFs; expect them filed somewhere sensible without thinking about it | **Very low.** If it takes more than ~30 seconds of his time per job, he won't do it consistently. |
| **Office Staff** | Whoever is in the office (admin, future hires) | Bulk-scan a stack of job folders from a filing cabinet; sort flash-drive contents | **Medium.** Will follow a reasonable workflow if it's well-documented. |
| **Jacob (engineering)** | Building Starr Software | Configure Archive, fix incorrectly-tagged jobs, harvest fixtures into the Starr Recon regression set | **High.** Will use a CLI, write SQL, debug. |

The intake flow MUST optimize for Dad's experience. Office Staff and Jacob are the recovery / cleanup tier. If Dad won't use it, the whole archive stays in the filing cabinets.

---

## INTAKE FLOW

### 3.0. Canonical 7-Step Walk-Through

The three intake paths below (A bulk, B scan-station, C mobile) all funnel into the same seven-step canonical pipeline. This is the spec the implementation should map to one-to-one. Whether a file arrives via flash-drive walker, scanner watch directory, or PWA upload, by the time it leaves Step 7 it has the same shape and the same provenance.

**Step 1 — Ingest.** A file lands on the platform. The ingest worker assigns it a SHA-256 content hash, stages the raw bytes into the R2 cold bucket at a content-addressed path (`archive-raw/<sha256[0:2]>/<sha256>.<ext>`), and writes an `archive_files` row with `ocr_status = 'pending'` and `job_id = NULL`. Re-ingesting the same bytes is a no-op (dedupe by hash). Source provenance — which scanner, which drive, which device — is captured in `source_drive_id` and `archive_origin` (see §7) so we can always answer "where did this file come from."

**Step 2 — Auto-classification.** A classifier assigns the file one of nine categories: `deed`, `plat`, `survey`, `field_notes`, `sketch`, `photo`, `correspondence`, `invoice`, or `miscellaneous`. The classifier is a small ensemble: filename + path heuristics first (cheap), then PDF text-content fingerprints (medium), then a Claude-Vision call on the first page for stubborn cases (expensive, batched). Confidence below the configured threshold drops to `miscellaneous`. **`miscellaneous` is the safety valve and is never an error — a document classified as `miscellaneous` is still indexed, still searchable, and still appears in triage.** The Archive never forces a classification it doesn't trust; doing so silently corrupts every downstream query.

**Step 3 — Metadata extraction.** From the text content, OCR result, EXIF / PDF / DXF embedded metadata, and the parent path, the extractor pulls **all of**: `date`, `county`, `surveyor_name`, `client_name`, `project_number`, `instrument_number` (if a recorded document), `recording_reference` (volume/page or document number), `address`, `parcel_id`. **Every one of these is optional.** Archive's defining property — the thing that distinguishes it from Recon's structured intake — is that it accepts documents which may have *none* of these fields populated and still be useful. A field-notes scrap with only "Smith Job, 1987" written on the corner is still a record. The extractor records what it found, marks the rest `null`, and moves on.

**Step 4 — Suggested links.** The linker proposes connections from the new file to existing graph entities (jobs, properties, parties, prior documents) using a tiered confidence model. The tiers, in descending strength: **exact `parcel_id` match → high confidence**; **fuzzy address match (normalized via `worker/src/services/address-normalizer.ts`, Levenshtein under threshold) → medium**; **fuzzy owner-name match (token-set ratio) → low**; **`(date ± 6 months) AND county` overlap → very low**. Every suggestion carries a numeric `confidence ∈ [0, 1]` and an `evidence` blob explaining which signals fired. The user accepts or rejects each link individually in Step 5. **The linker never auto-applies high-confidence matches** — the cost of a wrong auto-link in a legal-records system is far higher than the cost of one extra click.

**Step 5 — User review.** Every classification, every extracted metadata field, and every suggested link from Steps 2–4 surfaces in the triage UI as a proposal awaiting user confirmation. Archive is **"user-confirmed by default"** — the inverse of Recon's posture, which is "auto-extracted and user-flagged for inconsistencies." The reasoning: Recon's source documents are public-record documents whose structure is highly regular and whose quality is high; Archive's source documents are decades of mixed-quality material from filing cabinets. Auto-applying classifications and links here would propagate noise into the graph forever. The triage UI is therefore not optional; it's the thing that makes Archive trustworthy. (The triage UI is sketched in §6.)

**Step 6 — Graph integration.** Once the user confirms, the file becomes a first-class node in the property-intelligence graph with a **`source: "starr_archive"`** provenance flag set on the node and on every edge it participates in. The graph layer treats Archive nodes identically to Recon-discovered nodes for traversal, scoring, and query — same `Document` table, same edge types, same indexes. The only difference is the provenance flag, which the UI uses to render Archive nodes with a distinct visual indicator (an archive-folder icon, a subtle background tint, or a corner badge — to be locked in the screen-build round). This means a single property's graph can mix Recon and Archive evidence freely; users always know which is which.

**Step 7 — Search integration.** Archive documents and Recon documents share a single unified search index (Postgres `tsvector` over `ocr_text` + JSONB structured-field index, mirroring `seeds/200_recon_graph.sql`). Default search returns hits from both sources interleaved by relevance; a single facet filter (`source: [archive, recon, both]`) lets the user scope results. The default is "both" because the whole point of integrating Archive into the platform is that prior Starr work surfaces in the same query as new public-record discovery, without the user having to remember to look in two places.

---

### 3. Three Intake Paths

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

### 4. The Job Folder — Canonical Unit

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

## PRODUCT TIER FIT
### 5. Storage Tier Strategy

| Tier | Where | What lives there | Why |
|---|---|---|---|
| **Hot metadata** | Supabase Postgres (`archive_*` tables) | Job records, file records, tags, triage queue, audit log | Fast search/filter; the bulk of read traffic hits this |
| **Warm extracts** | R2 standard bucket `archive-extracted/` | OCR text, PDF page thumbnails, downsized previews, extracted CAD-element JSON | Searchable + viewable in the UI without paying egress for raw multi-MB blobs |
| **Cold raw** | R2 standard bucket `archive-raw/` (with `Storage-Class: STANDARD` for now; consider Infrequent-Access tier once volume justifies it) | Original scans, original CAD files, original photos — content-addressed by SHA-256 | Cheap, durable, immutable. Almost never read once OCR'd. |
| **Glacier-equivalent** | (not in v1) | Decade-old archive snapshots | Wait until the volume actually warrants the read-latency cost |

R2 is preferred over Supabase Storage for raw because Cloudflare's egress-free pricing makes "we re-process this entire archive when the OCR engine improves" a feasible operation.

**No physical destruction.** Even after a job is fully digitized and indexed, the physical filing-cabinet folder stays put — for legal/professional-records reasons and because Dad isn't ready for that yet. Archive includes a `physical_location` field on each Job (e.g. "Cabinet 3, Drawer B, folder labeled SMITH 2018") so the digital record points back at the paper. Stretch goal: a labeling step that prints/writes a barcode sticker for the physical folder so a future "scan to find paper" UX is possible.

### 5.1. Commercial Tier Fit (sketch — no commitments)

| Phase | Tier exposure | Notes |
|---|---|---|
| **Phase 1** | **Free for Starr Surveying internal use only.** | Starr is the dogfooding customer. No external pricing model required to ship. |
| **Phase 2** | **Paid add-on for Crew + Enterprise tiers** of the existing Starr Software pricing structure (see `docs/platform/STARR_SOFTWARE_SUITE.md`). Not bundled into Surveyor Pro. | Solo surveyors generally don't have the filing-cabinet backlog problem at the scale that justifies the storage / OCR cost. Crew + Enterprise customers do. |
| **Phase 2 (cont.)** | **Storage cost model is separate from Recon's storage cap.** | An Archive is by definition a large, slowly-growing pool. Counting it against the Recon storage cap would penalize firms with rich archives — exactly the firms whose archives produce the most regression-set value. Treat Archive storage as its own metered line item with its own pricing curve. |
| **Phase 2 (cont.)** | **Pricing TBD.** | Two plausible models on the table: (i) per-GB stored per month with a generous bundled allowance; (ii) per-active-job per month with unlimited storage per job. The choice depends on how customers actually use the system; defer until we have real usage data from Phase 1 dogfooding. **Flagged for the pricing-decisions doc when that doc exists.** |
| **Phase 3+** | Possible higher tier ("Records Vault") that adds the `PhysicalArtifact` node type, barcode-printing workflow, and signed-deliverable retention. | Not a commitment; just a placeholder so we don't accidentally name something else "Vault." Reserved name per `docs/platform/STARR_SOFTWARE_SUITE.md`. |

This whole subsection is a **sketch** — no pricing decisions are being locked here. The point is to capture the constraints (Archive ≠ Recon storage cap, Solo tier doesn't get it, pricing model is TBD) so they don't get lost between now and the Phase 2 build.

---

### 6. The Triage Queue

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

## DATA MODEL HOOKS
### 7. Schema Sketch (will move to `seeds/210_archive.sql` when implementation begins)

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

### 7.1. Graph-Node Schema Additions (the part that touches Recon's existing `Document` table)

The tables above (`archive_jobs`, `archive_files`, …) are Archive's *own* persistence. But Step 6 of the canonical intake flow promotes confirmed files into the **property-intelligence graph**, which is the same `Document`/`Party`/`Property` graph Recon writes to. Three additions to that graph land alongside the Archive build:

**(a) `Document.archive_origin` — JSONB attribute, nullable**

Added to the existing `Document` node table. Populated only on nodes whose `source = 'starr_archive'`. Captures the physical-world provenance the rest of the graph doesn't know about.

```jsonc
{
  "scanner_id": "office-fujitsu-01",      // which scanner ingested this; null for Path A bulk imports
  "scan_date": "2026-04-15T14:22:00Z",    // when the scan happened (ingest time, not document creation)
  "original_location": "Cabinet 3, Drawer B, folder 'SMITH 2018-447'",
                                           // human-readable filing-cabinet pointer; free-text
  "physical_status": "filed",             // 'filed' | 'lost' | 'returned-to-client' | 'destroyed' |
                                           //   'transferred' | 'unknown'
  "scan_quality": "good"                   // 'good' | 'partial' | 'illegible'
}
```

`physical_status` defaults to `'filed'` and is only updated when the operator records a custody event (the paper got returned to a client, the folder went missing, etc.). `scan_quality` is set by the OCR step or by an operator override during triage; queries that demand high-fidelity inputs (e.g. a regression-fixture harvest) filter to `scan_quality = 'good'`.

**(b) `ARCHIVED_FROM` edge — `Document → Document`, new edge type**

Used when a digitized document is known to have a specific physical original *and that physical original is also tracked as a node* (typically a `PhysicalArtifact` node — see (c)). The digitized `Document` is the source of the edge; the physical original is the target. Examples:

- A scanned PDF of a recorded plat → ARCHIVED_FROM → the physical plat sheet stored in Cabinet 3.
- A photo of a hand-drawn field-note page → ARCHIVED_FROM → the field-book the page came from.

The edge carries no attributes beyond the standard provenance trio (`created_at`, `created_by`, `confidence`). It's mostly a navigation primitive: "show me the physical custody history of this document I'm looking at."

`ARCHIVED_FROM` is distinct from the existing `DERIVED_FROM` edge (which expresses "this document was extracted/cropped/reprocessed from another digital document"). The two can coexist on the same node.

**(c) `PhysicalArtifact` node — new node type — Phase 2, sketch only, not in initial build**

Optional. For firms that want to track the physical items themselves rather than only the digital scans of them. Most users will never need this; the Belton office almost certainly will (the filing-cabinet inventory is the long-tail problem we keep gesturing at).

```jsonc
{
  "id": "uuid",
  "artifact_type": "field_book",        // 'plat_sheet' | 'field_book' | 'job_folder' |
                                         //   'cad_plot' | 'photo_print' | 'flash_drive' |
                                         //   'cassette' | 'other'
  "location": "Cabinet 3, Drawer B, folder 'SMITH 2018-447'",
  "condition": "good",                  // 'good' | 'fragile' | 'damaged' | 'missing'
  "last_seen": "2026-04-15T14:22:00Z",
  "custody_history": [                  // append-only; oldest first
    {
      "at": "1987-06-12T00:00:00Z",
      "actor": "Wayne Starr (PLS)",
      "action": "filed",
      "location": "Cabinet 3, Drawer B"
    },
    {
      "at": "2024-09-03T11:00:00Z",
      "actor": "Jacob Starr",
      "action": "removed-for-scanning",
      "location": "Office workstation"
    },
    {
      "at": "2024-09-03T16:30:00Z",
      "actor": "Jacob Starr",
      "action": "refiled",
      "location": "Cabinet 3, Drawer B"
    }
  ]
}
```

**`PhysicalArtifact` is explicitly Phase 2 of Archive — sketch only, not in the initial build.** The reason: every firm's filing-cabinet ontology is different. Trying to lock the schema before we've ingested even one real cabinet's worth of paper is premature optimization. v1 ships with `Document.archive_origin.original_location` as a free-text pointer; that's enough to find the paper without committing to a schema for tracking it as its own first-class entity. When/if a customer actually needs cabinet-level inventory and barcode-scan workflows, the `PhysicalArtifact` node type lifts out of this section into its own spec doc.

---

### 8. Integration with Starr Recon

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

This is the path by which the regression set grows from 1 (synthetic) → 5 → 15 → 50, per the Phase A/B/D plan in `docs/platform/RECON_INVENTORY.md §11`.

### 8.1. Active Research View — Archive Surfacing UX

The two-way wiring above is the data pipe; this section is what the user actually sees.

**When a Recon project is opened on a property and Archive contains documents matching that property** (matched via the same parcel-id / fuzzy-address heuristics used in Step 4 of the canonical intake flow), the active-research view changes in three specific ways:

1. **A "Prior Starr Work at this Address" banner** appears at the top of the project intake screen, listing the matched archive jobs (by job number + year + client name). Clicking through opens the job folder in a side panel without leaving the Recon project.

2. **Archive matches appear in the Document Viewer panel alongside the public-record documents Recon discovers.** They render with a distinct visual indicator — an **archive-folder icon in the corner** of the document tile (the exact glyph and color get locked in the screen-build round; for now, "visually distinct from public-record documents at a glance" is the requirement). Hovering reveals "From Starr Archive — Job 2018-447" tooltip. The visual treatment is a corner badge rather than a wholesale color change because the user needs to see Archive matches as a peer source, not as a second-class one.

3. **Archive matches are opt-in to the report.** This is the load-bearing requirement of this section. **Archive documents do NOT auto-flow into the generated report.** The user must explicitly include each Archive document the same way they explicitly include any other discovered document. The reasoning: a Recon report is a deliverable a customer pays for; including Starr's prior internal work in it without an explicit "yes, include this" gesture risks (a) embedding stale information, (b) confusing the report's evidentiary base, and (c) violating the implicit trust contract that says "the report contains only what you confirmed should be in the report." The rule is the same one Recon already follows for low-confidence public-record discoveries: nothing enters the report without a click.

These three behaviors map cleanly to existing affordances in `app/admin/research/`, so the build cost is low — a new banner component, an icon-overlay variant of the existing document tile, and an `is_archive_source` flag on the report-inclusion picker.

---

## PHYSICAL INTAKE LOGISTICS

### 9.0. Hardware, OCR, and Operations

This section is the operational counterpart to Path B (scan-station) and Path C (mobile) above — what equipment, what software, what workflow.

**Bulk scanner recommendations.** The choice depends on the document mix.

| Scenario | Recommended | Why |
|---|---|---|
| **Loose-leaf bulk batch** (job folders pulled apart for scanning) | **Fujitsu ScanSnap iX1600** | Sheet-fed duplex, ~40 ppm color, automatic blank-page detection, cheap per page, lives next to the office workstation. The de-facto choice for paper-heavy small offices and the option Dad will tolerate. |
| **Bound documents** (field books with stitched bindings, recorded-document binders that can't be separated) | **Czur ET24 Pro** (or Czur Aura X for portability) | Overhead camera with curve-flattening firmware. Doesn't require unbinding the source. ~10× slower per page than a sheet-fed but doesn't damage the binding. |
| **One-off field captures** (a wall-mounted plat at a courthouse, a hand-drawn sketch on the hood of a truck) | **Phone camera fallback via the PWA** | No dedicated hardware; perspective-correction in the PWA before upload (see Path C). Quality is "good enough for OCR if the lighting is reasonable." |
| **Microfilm or microfiche** (if any decade-old courthouse rolls turn up) | **Out of scope for v1.** Note for the future. | Microform scanners are expensive and rarely needed; vendor-out when it comes up. |

**OCR workflow.** Tiered by document type and content.

| Source | Engine | Notes |
|---|---|---|
| **Typed text** (recorded deeds, plats with engraved labels, modern surveyor reports, invoices, correspondence) | **Tesseract 5** | Open-source, runs on the worker pool, free. Good enough for clean typed text. Layout-aware mode (`--psm 6`) for mixed-content pages. |
| **Mixed typed-and-handwritten** (forms with handwritten fill-ins, marked-up plats, annotated drawings) | **Tesseract for the typed regions, Anthropic Claude Vision for the handwritten regions.** | The classifier in Step 2 of the canonical flow sets a `has_handwriting` flag; downstream OCR routes accordingly. Claude Vision is paid per call, so it's only used when needed. |
| **Pure handwritten field notes** (Dad's notebook pages, hand-drawn sketches with measurements, pencilled closures) | **Claude Vision** with a survey-domain prompt. | Tesseract handwriting is unusable for survey field notes. Claude is the only option that gets close enough to be useful, and even it requires user-confirmation on extracted measurements before they enter the graph. |
| **Photo of paper** (a phone snap of a wall plat, low light, perspective-skewed) | **PWA-side perspective correction → Claude Vision.** | The PWA does the geometric rectification before upload; the worker doesn't try to undo bad camera angles. |
| **Already-OCR'd PDFs** (the text layer is embedded) | **Skip OCR; use the embedded text directly.** | Saves cost and is more accurate than re-OCR. Detected by checking for a non-empty PDF text layer at ingest time. |

OCR runs in a **separate worker queue** from Recon. Reasons in §11.4 (added below).

**Filing-cabinet tracking.** Out of scope for v1 — the `PhysicalArtifact` node type sketched in §7.1(c) is the hook for it when the time comes. v1 ships with `Document.archive_origin.original_location` as a free-text field; that's enough to write "Cabinet 3, Drawer B" into the record without committing to a structured cabinet inventory.

**Vendor scanning services.** For firms that don't want to do scanning in-house — or for backlogs too large to chew through with the office scanner — third-party document-scanning vendors (e.g. Iron Mountain, local records-management firms) are a viable option. The Archive workflow accepts vendor output the same way it accepts in-house Path A bulk imports: the vendor returns a directory of files (typically named PDFs with a manifest CSV), the operator points the bulk-importer CLI at it, and the canonical 7-step pipeline takes over. **Note this only as an option in the customer-facing material; do not build vendor-specific integrations in v1.** If a customer with a giant backlog needs help, they ship a USB drive to a vendor and the vendor ships back a USB drive — that's a workflow problem, not an integration problem.

---

### 9. What's Out of Scope Here (separate sketches when needed)

- **Search UI.** The /admin/archive/search screen design.
- **Sharing.** Letting clients see their own historical jobs (probably uses the same `report_share_service.ts` pattern as Recon).
- **OCR pipeline detail.** Tesseract vs cloud OCR vs Anthropic Vision; layout detection; handwriting recognition (handwritten field notes are a real challenge).
- **Mobile app proper** (vs PWA). Decision deferred until PWA tells us whether the friction is worth the app-store overhead.
- **Physical-archive labeling system.** The barcode/QR-code workflow that ties physical folders back to digital records.
- **Retention + deletion policy.** What can ever be deleted. (Surveyors' working files have professional-records implications; this requires a real conversation, not a unilateral engineering decision.)
- **Staff permissions.** Who can reassign, merge, delete. Defer to v1 implementation.
- **Cost projection.** R2 storage and OCR pricing at the projected volume of decades of jobs. Will write up when implementation is greenlit.

---

### 10. Build Sequencing (when greenlit)

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

## OPEN QUESTIONS

### 11.1. Worker Queue Topology — Archive vs Recon

Should Archive ingest run on the **same worker pool** as Recon, or get its **own background queue**?

**Recommendation: separate queue, lower priority.** Archive ingest is bursty (a Path-A bulk import can dump 5,000 files at once) and tolerant of latency (nobody is waiting in real time for that 1987 deed to finish OCR'ing). Recon jobs, by contrast, are interactive — the user kicked one off and is waiting on the screen. Sharing a queue means an Archive bulk-import can starve a live Recon job; that's the kind of behavior that erodes trust in the platform fast.

Concretely: a separate `archive-ingest` queue with its own worker concurrency cap, run on the same worker fleet but at a lower priority than `recon-jobs`. If we ever scale to dedicated workers, Archive moves to its own pool. **Decision pending — flagged for the queue-architecture discussion when worker resourcing comes up.**

### 11.2. Bulk-Import UX

What's the actual user experience for a 5,000-file Path-A import?

Three plausible shapes, each with a different friction profile:

- **Drag a folder onto a web page.** Browser walks the folder, uploads one file at a time, shows a progress bar. Works well up to a few hundred files; falls over past that because of browser memory and connection-stability problems.
- **Email-to-import.** User mails a zip to `archive@<their-tenant>.starr.app`; server-side worker unpacks and ingests. Works for any size; works around browser limits; loses interactive feedback.
- **Scanner direct integration.** The office scanner POSTs straight to the Archive intake endpoint (most modern document scanners support custom HTTP destinations). Best ergonomics for the steady-state Path B workflow; doesn't help the one-shot Path A backlog.

Likely answer for v1: **drag-and-drop in the browser for small batches (<500 files), CLI for large batches (`npx starr-archive import ./path`), scanner direct POST for Path B.** Email-to-import deferred unless customers specifically ask for it. **Open for input.**

### 11.3. Duplicate Detection UX

If a user uploads the same deed twice — same content, different filenames, different upload sessions — what should happen?

Mechanically, the SHA-256 dedupe in Step 1 of the canonical flow ensures we never store the bytes twice. But the user-facing question is: should the second upload be **silently ignored**, **explicitly reported** ("we already have this — we attached your upload to the existing record"), or **prompted** ("we already have this — keep both, merge metadata, or discard the new one")?

Recommendation: **explicit-report by default, prompt only when the metadata diverges.** The user uploaded it for a reason; silently ignoring violates the principle that every user action gets a visible response. But if both copies have identical metadata, there's nothing to prompt about. If the new upload has different metadata than the stored record (different `job_id`, different `category`, different `address`), the prompt offers merge / replace / keep-as-second-copy. **Pending UX review.**

### 11.4. Privacy and Permission Model

Which org members can see Archive contents? **Same as Recon job permissions, or Archive-specific?**

Two pulls in opposite directions. (a) **Same as Recon** is simpler — fewer concepts, one permissions model to reason about. (b) **Archive-specific** acknowledges that Archive contains genuinely more sensitive material than Recon: client correspondence, internal decision notes, hand-drawn drafts that were never meant to leave the office. A junior crew member who has access to a Recon job for a specific property might reasonably *not* have access to the Archive folder for that property's prior client.

Likely answer: **Archive-specific permissions layered on top of the Recon permissions model.** Default = inherit Recon permissions; opt-in to Archive-only roles for sensitive material. This requires no schema changes Recon doesn't already need (the existing role system covers it), just a new `archive_*` permission scope. **Pending decision.**

### 11.5. Decision Log

| Date | Decision | Reason |
|---|---|---|
| Apr 2026 | Public name = "Starr Archive" (single-word codename, matches naming rules in `docs/platform/STARR_SOFTWARE_SUITE.md`) | Reserves "Starr Vault" for signed-final-deliverable storage, which is a meaningfully different product. |
| Apr 2026 | R2 over Supabase Storage for raw blobs | Egress-free pricing makes future re-processing affordable. |
| Apr 2026 | Content-addressed (SHA-256) storage paths | Free dedupe across overlapping flash-drive contents; immutability for the audit log. |
| Apr 2026 | No physical destruction in v1 | Legal / professional-records sensitivities; barcode-back-to-folder workflow is a stretch goal. |
| Apr 2026 | Triage UI is non-optional | Heuristics will never be 100% on legacy filing-cabinet content. Pretending they will be produces silently wrong indexing. |
