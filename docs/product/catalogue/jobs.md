# Jobs, projects and field work: catalogue overview

Area id `jobs`. Detail for every page, panel, mechanic and API group is in `jobs.json` (42 entries). Every claim there cites `file:line`. This file is the readable summary plus the two things the owner asked for: the job lifecycle as it is now, and a proposed clean model.

## 1. What this area is for

It is where the firm runs the work after a customer says yes: create the job, plan and dispatch it, send the crew out, collect what they find, draw, review, deliver, and get paid. It covers:

- **Jobs and projects**: `/admin/jobs` (a tabbed portal), `/admin/jobs/[id]`, `/admin/projects/*`.
- **Field**: the property map `/admin/map`, field captures, collector ingest, the "Starr Field" Expo app in `mobile/`.
- **Resources**: schedule, weather, equipment (ten tabs plus sub-pages), vehicles, compliance.
- **Utilities**: scan setup, public share link.

`/admin/work` is only a nav landing page. `/admin/timeline`, `/field-data`, `/weather`, `/vehicles`, `/schedule` and `/projects` are redirects into the portals; `/admin/share` does not exist (the only share feature is the public research report at `/share/[token]`).

## 2. How the parts fit together

```
Customer -> Project (P-YYYY-NNNN, client + site, required parent)
              \-> Job (YYYY-NNN, stage, team, money, files, map)
                    |-- files / folders (one explorer, standard folders)
                    |-- property map (job_map_points, layers, media links to files)
                    |-- field captures (field_data_points, field_media; mobile) - empty today
                    |-- collector points (instrument_points) - empty today
                    |-- schedule_events (3 phases)  |-- job_equipment (manual list)
                    |-- job_payments / job_time_entries / change_orders / deliverables (API only)
```

- A **project is required**: `jobs.project_id` is NOT NULL (`app/api/admin/jobs/route.ts:145-148`). A job inherits client and site once at creation and never again (`lib/projects/model.ts:76-111`).
- The **job page** is the workspace (1,446 lines): stage timeline, overview, schedule, files, field work, property map, financial, activity, messages.
- The **map** is the one place that ties files, photos, video and walked paths to places. It reached Google satellite on 2026-09-19 and replaced an image-based map.
- The **mobile app** is offline-first (PowerSync, local SQLite) and writes to its own tables, which the web map does not read yet.
- Multi-tenancy is handled centrally: `supabaseAdmin` is an org-scoped client (`lib/saas/org-scope.ts`), so most routes need no per-route org code.

## 3. The main user journeys

| Who | Journey | Where it works | Where it hurts |
|---|---|---|---|
| Office manager | Convert a lead to a job, set the fee, schedule it, assign a crew | `/admin/jobs/new?fromLead=`, Financial tab, Schedule tab | Lead is "accepted" while job is still "quote"; fee typed in three places; scheduling shows no conflicts |
| Party chief | See today's jobs, read instructions, go, capture, clock in | Mobile Jobs, Capture, Time tabs | Captures do not reach the map; no field-complete button; no map in the app |
| Drafter | Find what the crew saw and where, pull files, draw in CAD | `/admin/map?job=`, Files tab, CAD link | Five doors to the same data; field tables empty; CAD links in Files tab |
| RPLS | Review drawing, seal, deliver | Stage "legal" only | No review queue, no seal workflow in the UI (API exists), no deliverables panel |
| Owner | See all jobs and money, spot problems | Jobs list, project roll-up | No sort, no overdue view, no billed/unbilled, no WIP |

## 4. The job lifecycle as it is now

Starr's flow: **lead -> quote -> job -> field -> drafting -> QA -> deliver -> invoice**. Here is where each step actually lives.

| Step | Where it lives now | State model | What is confusing |
|---|---|---|---|
| 1. Lead | `/admin/leads`, `leads`, `lead_replies`, `lead_notes`, attribution | `leads.status` (new, quoted, accepted...) | Owned by the office area, not here, but a job points back via `jobs.origin_lead_id` and the older `leads.converted_job_id`. |
| 2. Quote | `lead_quotes` (versioned, append-only; seed 505), proposals extending it with line items and customer acceptance (seed 523), `leads.quote_amount` mirror | quote status, superseded chain | The quote then **reappears** as `jobs.quote_amount` and `final_amount` with its own price history (seed 603). Four places hold "the price". |
| 3. Job | `/admin/jobs/new`, `jobs` row | `jobs.stage = 'quote'` on creation | A job exists in stage **quote** before the customer has accepted. Creating it flips the lead to **accepted** (`jobs/new/page.tsx:218-232`) while the job's own checklist still asks for "Quote accepted by client". A job number is spent on every quote, including lost ones. |
| 3b. Project | `projects`, `P-YYYY-NNNN` | active, on_hold, complete, cancelled (set by hand) | Required even for a one-off job. Project status is not derived from job stages or billing. |
| 4. Research | `research_projects` (a separate platform), `JobResearchPacket`, old per-job research list | job stage `research` | The jump from job to research passes only the job id; no address, parcel or documents. "Project" means two things (a firm project vs a research run). |
| 5. Field | Mobile app; `schedule_events` (phase "Field Work"); property map; field captures page; Field Work tab (`job_field_data`); Field data tab; collector ingest | job stage `fieldwork`; no field-complete state | Five+ surfaces and four point tables (three empty). "Field Work" is a stage, a tab, a legacy component and a phase. Phone captures write to tables the map does not read. |
| 6. Drafting | CAD (`cad_drawings.job_id`), Files > CAD folder | job stage `drawing`; phase "Drawing and Deliverables" | No drafter assignment, no drawing status, no link from drawing state to job stage. |
| 7. QA / review | Stage `legal` ("legal review before signing and sealing") | stage only | There is no QA stage by name and no reviewer, comments, or approval. The word "legal" is a Starr label for RPLS review. |
| 8. Deliver | Stage `delivery`; free-text `jobs.deliverables`; `deliverables` table with revision, seal, issue and receipt (API only); file send; customer portal page | stage; deliverable state (draft, issued, final...) | Two concepts named "deliverables": a text field you can edit and a real record with no screen. The portal lists the real records, so customers see an empty list. |
| 9. Invoice | `/admin/invoices/new` (can pick a job), `job_payments`, `jobs.amount_paid`, `project_payments`, invoice payments | job stage `completed`; invoice status | No invoice button on the job; "completed" does not mean billed or paid; payments live in three places and `reconcile` has to warn when they disagree (`lib/jobs/money.ts:119-123`). |
| (cross) Change orders | `change_orders` API, customer approval page `/change-order/[token]` | draft, sent, approved, declined, void | Customer side exists; no office screen to raise one; not in the job's contract value. |
| (cross) Cancel | stage `cancelled`, `result` won/lost/abandoned, project `cancelled` | three overlapping fields | Same event recorded three ways. |

### The state and vocabulary collisions, in one list

1. **Job vs project vs work.** *Project* = a firm's engagement (P-number), also a research run, also CAD projects. *Job* = a billable piece of work inside a project (YYYY-NNN). *Work* = a nav workspace (`/admin/work`), a retired mobile "Work Mode", and in the owner's speech "a job". The firm should have two words, not four.
2. **Field.** The stage `fieldwork`, the tab "Field Work", `FieldWorkView`, `job_field_data`, the page "Field Captures" (`/admin/jobs/[id]/field`), the portal tab "Field data", and the map. Five names for what the crew did.
3. **Stage mixes three things.** Production steps (research to delivery), outcomes (`completed`, `cancelled`), and a flag (`on_hold`) are all values of one column. Putting a job on hold loses its place (only history remembers).
4. **Result.** `won`/`lost`/`abandoned` on the job, `accepted` on the lead, and `cancelled` as a stage: three win/loss records.
5. **Money.** Quote on lead, quote versions, quote on job, final amount, price history, `amount_paid`, `job_payments`, `project_payments`, invoices and their payments.
6. **Equipment on a job.** `job_equipment` (manual list), reservations, assignments, check-out events, kits and templates.
7. **Time.** `job_time_entries` (phone), the job's time tracker, hours approval and payroll elsewhere.
8. **Schedule.** Three phase picks on the job, the org calendar, and a separate equipment Gantt, with no conflict check across them.
9. **Stage list copied three times**: stage route, `JobCard.tsx` (`STAGE_CONFIG`), and the mobile schema.
10. **No gates.** Any signed-in user can move a job to any stage in either direction (`app/api/admin/jobs/stages/route.ts:26-37, 60-80`); checklists never block anything.

## 5. Proposed clean model (what a nationwide firm would recognise)

Surveying software and firms already speak: **Client -> Project -> Job (or task/work order) -> Phases -> Deliverables -> Invoice**, with **Proposal** before the project and **Change order** during it. Keep that spine and stop mixing separate questions in one field.

### Objects

| Object | What it is | Key fields |
|---|---|---|
| **Client** | Who pays and who owns the site (linked, never retyped) | name, contacts, billing terms |
| **Opportunity / Proposal** | An offer, versioned. Win/loss lives here. | versions, fee, scope, status (draft, sent, won, lost), loss reason |
| **Project** | One engagement on one property for one client | number, client, site(s) with parcel ids, manager, status derived from jobs |
| **Job** | One billable piece of work in a project (boundary, topo, ALTA, stakeout, elevation certificate) | number, type, scope, fee, due date, crew, status |
| **Phase / Task** | The steps inside a job | research, field, drafting, review, delivery; each with owner, date, done |
| **Deliverable** | What is issued | revision, file, seal, issued-to, method, receipt |
| **Change order** | Signed scope/fee change | amount (signed), days, approval |
| **Invoice** | The only record of billing and payments | lines, retainer, payments |
| **Capture** | A file with a place and a time (photo, video, voice, collector point) | file, lat/lng, accuracy, track, job |

### Three separate status axes (not one `stage` column)

1. **Production status of a job** (fixed set, firms may rename labels but not remove states):
   `Not started -> Research -> Field -> Drafting -> Review -> Ready to deliver -> Delivered -> Closed`
   Review is real: a named reviewer (RPLS) approves and seals; Delivered requires an issued deliverable.
2. **Flags**, which can apply at any time: `On hold` (with reason), `Blocked` (waiting on client, access, weather), `Cancelled` (with reason and a final invoice).
3. **Billing status** (derived from invoices): `Unbilled -> Partly billed -> Billed -> Paid`.

Project status is derived: open while any job is open, "ready to close" when all jobs are Delivered and Paid.

### Rules

- **One door for each thing.** A job has one Field panel: the map, with captures, collector points, walked paths and notes as layers. Delete the Field Work tab, `job_field_data`, the Field Captures page and the duplicate map buttons. Keep the CSV manifest and ZIP as an Export on Files.
- **Win happens on the proposal.** Create the job (and its number) when the proposal is accepted. A quote does not consume a job number. The proposal's fee copies to the job as the contract value; change orders add to it.
- **Money has one ledger.** Fee + approved change orders = contract value. Invoices and their payments are the only payment record. Time and expenses give cost and margin. Retire `jobs.amount_paid` and the separate payment tables.
- **A project can be silent.** For a one-off job the user types client and site; the project is created for them.
- **Dispatch is one board.** Day x crew with vehicles and instruments, conflict warnings (PTO, double-booked gear), weather per job. The job's Schedule tab is a filtered view of it.
- **Gates are optional per firm, on by default for seal.** No Delivered without a sealed deliverable; Field-complete needs a party-chief tap in the app; Review needs an RPLS.
- **Phone first for the field.** Three jobs only: today's jobs (instructions, map, directions), capture (photo, video, voice, point to the job map with GPS), and time (clock in with job and vehicle).
- **Configuration, not code, for firm differences**: stage labels, checklists by job type, numbering patterns, units, county and state lists, coordinate systems, seal rules.

### Mapping from today to the clean model

| Today | Clean |
|---|---|
| stage `quote` | Proposal (draft/sent) before any job |
| stage `research` | Production status Research |
| stage `fieldwork` | Field |
| stage `drawing` | Drafting |
| stage `legal` | Review (with reviewer, seal) |
| stage `delivery` | Ready to deliver / Delivered (deliverable issued) |
| stage `completed` | Closed (and billing status Paid) |
| stage `on_hold`, `cancelled`, `result` | Flags on a job; win/loss on the proposal |
| `jobs.deliverables` text | Scope line; real records in Deliverables |
| `job_equipment` | Reservation |
| `jobs.amount_paid`, `job_payments` | Invoice payments |

## 6. The biggest problems (ranked)

1. **The field data path is split and the phone does not reach the map.** Four point tables, three empty; mobile writes `field_data_points`/`field_media`; the map reads `job_map_points`. The most valuable feature (see what the crew saw and where) is built on the web and unused from the phone.
2. **The lifecycle is in one overloaded `stage` column** with no review step, no billing, no gates, and duplicated vocabulary in three code files.
3. **Money is recorded in up to nine places** and the job page does not connect to invoices.
4. **Deliverables and change orders have an API, a customer page and a portal list, but no office screen.** The firm's legal product (sealed plat) has no UI.
5. **Job vs project vs work vs field naming** makes users guess where to click; the portal defaults to Projects while called Jobs.
6. **Scheduling and equipment are three separate systems** with no conflict check, and equipment is a 17,000-line asset system larger than the core job workflow.
7. **Texas is hard-coded** in county lists, geocoding, state plane, weather default and compliance topics; Starr brand names are in buckets, app id and share footer.
8. **Large single files** (`jobs/[id]/page.tsx` 1,446 lines, `map/page.tsx` 2,367, `field-data/[id]` 1,565, equipment dialogs 1,728, template editor 1,867) make change slow and risky.
9. **Auth is loose** on some job routes (stage change by any signed-in user).
10. **Stale plan status**: `gps-capture-2026-09-19.md` still says "designed, not built" though seed 653, EXIF reader and path filter exist.

## 7. Rebuild recommendation for the area

Keep: the project/job hierarchy and numbering rules, the Files explorer, the property map and its API, the collector ingest parsers, the offline mobile architecture, the redirect habit, central org scoping.

Rebuild: the job page (around the lifecycle above), scheduling into a dispatch board, money into one ledger tied to invoices, deliverables/change orders into the job UI, equipment into Gear + Booking + Service.

Remove: `FieldWorkView` and `job_field_data`, the Field Captures page (after moving its export), `/admin/work` landing, duplicate map buttons, `jobs.amount_paid` as a truth, the `result` field as a manual job flag.

Suggested order:

1. **Stage and status model** (one constants module shared by web and mobile; split flags and billing; Review state). Everything else hangs on this.
2. **Deliverables and change orders panels** on the job (APIs and portal exist; smallest visible win for the RPLS and customer).
3. **Field to map**: finish GPS capture (phone writes the capture and track), point the mobile capture at the map's tables, drop the empty parallel systems.
4. **Money ledger** (job money from proposal + change orders + invoices; "Invoice this job").
5. **Dispatch board** with weather and equipment conflicts.
6. **Nationwide pass**: tenant config for stages, numbering, counties/states, coordinate systems, units, brand, bucket names.

## 8. Planning documents and what is still open

| Plan | Status | Open ideas |
|---|---|---|
| `in-progress/jobs-map-research-consolidation-2026-09-20.md` | Phase 1 review done; 12 questions open | Research this Property button with prefill; CSV to layer; layers vs types; copy between layers; delete empty parallel systems; where manifest/ZIP go; Trimble streaming route and subscription |
| `in-progress/interactive-property-map-2026-09-16.md` | Phases 0-5 built; 6-9 open | Survey tools (measure, print), real-world coordinates, share/client view, close-out |
| `in-progress/gps-capture-2026-09-19.md` | Partly built (seed 653, EXIF, path filter) | Phone capture to point, capture dialog and consent toggle, video marker on path, move-file behaviour |
| `completed/PROJECTS_ABOVE_JOBS_2026-08-19.md` | Done | None open; see the "single job still needs a project" point above |
| `completed/PAGE_CONSOLIDATION_2026-08-24.md` | Done | Further merges listed in this file |
| `completed/JOB_WORKSPACE_BUILDOUT.md`, `JOBS_FILES_FABRIC_2026-08-19.md` | Done | Versioning and issued lock are not covered |
| `pending/job-calendar-2026-06-16.md`, `calendar-mobile-2026-06-16.md` | Pending | Calendar-side scheduling |
| `completed/EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md` | Done | Over-built relative to need |

## 9. Gaps a real firm would expect that are missing

Job templates by type; proposals tied to jobs in the UI; a review/QA queue and seal workflow; deliverable transmittals; change-order screen; invoice from job (fixed, % complete, T&M); retainers; WIP/unbilled report; job profitability; crew dispatch board; conflict detection; field-complete action; parcel polygons and multiple parcels per job; national county and state lists; all-US coordinate systems; control and monument register; recorded-instrument references (plat, deed, volume/page) on the job; client portal with the map and status timeline; saved filters and a board view of jobs.
