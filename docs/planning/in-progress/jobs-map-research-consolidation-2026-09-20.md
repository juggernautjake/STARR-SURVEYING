# Jobs → research, and folding everything into the interactive map

**Phase 1 of 4: the system review.** Owner set the sequence on 2026-09-20: *"First we will have a
review of the entire system to see how it is currently built and how it should be built. Then we
will have a Q&A session to determine what design decisions we want to make. Then we will build the
full step by step planning document. Then will have you build it all out and test everything."*

This document is phase 1 only. It describes what is there, what is not, and what has to be decided.
It proposes no build order — that is phase 3.

---

## The headline

**Most of what was asked for is already built, and the parts being folded in are empty.**

The interactive map already has named layers with show/hide and colours, points with real
lat/lng, walked-path geometry with vertices, and photos/videos/documents attached to points. It has
44 live points, every one of them geocoded, every one of them on a layer, with 81 media files
attached.

Meanwhile every system proposed for folding in — field captures, collector point streaming, the
legacy field-data table — contains **zero rows**. Not "a few rows". Zero.

That changes the shape of this project completely:

> **This is not a data migration. There is nothing to migrate.** The work is absorbing three
> capabilities the map lacks, deleting four parallel systems nobody ever used, and adding one
> button.

---

## Part 1 — What exists today

### 1.1 The job panel's action row

`app/admin/jobs/[id]/page.tsx:504-574`. Five controls, in order:

| # | Lines | Label | Goes to |
|---|-------|-------|---------|
| 1 | 509–517 | Upload files | opens the upload dialog |
| 2 | 524–535 | Files & photos (+count) | the Files tab |
| 3 | 542–555 | **Create interactive map** / Interactive map (+point count) | `/admin/map?job=<id>` |
| 4 | 556–562 | **View field captures →** | `/admin/jobs/<id>/field` |
| 5 | 565–573 | Delete job | soft-delete, 30-day recovery |

Two notes the rename request needs to account for:

- The label at #3 is **already conditional** — `Create interactive map` when no map row exists,
  `Interactive map` once it does (`page.tsx:551`). "View interactive map" has to replace both
  halves, or the condition has to go.
- There is a **second copy of the same button** at `PropertyPanel.tsx:243-245`, labelled
  `Interactive map`, same href, `data-testid="job-property-map"`. Renaming one and not the other
  leaves the job page saying two different things about the same destination.

The row itself has no CSS class — it is inline-styled at `page.tsx:504`. Button styling comes from
`.job-detail__action` (`AdminJobs.css:782`) and its `--ghost` variant (`:808`).

### 1.2 There is no "Research this Property" button

Confirmed: nothing in the job header action row, nothing in `PropertyPanel`, nothing on the project
page's job cards (which are a single `<Link>` wrapping the whole card, with no actions at all).

The **only** path from a job to research is buried inside the Files tab, in the Research folder's
extras (`app/admin/jobs/[id]/page.tsx:1007-1012`):

```tsx
<a className="job-research-start__btn" href={`/admin/research?new=1&job=${jobId}`}>
  Start property research
</a>
```

Two things about it matter:

1. It **creates a research project**. It does not start a run. A run is a separate act, started
   later from inside the research project.
2. It passes **only the job id**. Address, county, parcel, owner, documents — none of it travels.

### 1.3 How a research run actually starts

Three UI entry points, all converging on one POST:
`POST /api/admin/research/[projectId]/pipeline` (`route.ts:64-388`).

The body it accepts (`:93-110`), all optional:

```
address, county, propertyId (parcel), ownerName,
operatorNotes, userFiles[], settings{}, supplemental{}, trigger
```

**The project id comes from the URL path. There is no job id and no project id in the body.**

What the route does: `auth()` only (no role check), requires `WORKER_URL` + `WORKER_API_KEY` or
returns 503, loads the `research_projects` row for address parts and `parcel_id`, attaches that
project's `research_documents` where `source_type='user_upload'`, gates on `assessRunReadiness()`,
then **proxies synchronously** to the worker at `${WORKER_URL}/research/property-lookup` with a 30s
timeout, and returns 202 with a `pollUrl`.

### 1.4 Job → research links that already exist

Three, all at the **project** level. None on `research_runs`.

| Link | Where | Status |
|---|---|---|
| `research_projects.job_id` | `seeds/090:141` | Legacy. `seeds/633:23-25` says outright: *"It stops being the source of truth; the join table is. … nothing new should read it."* |
| `research_project_jobs (research_project_id, job_id)` | `seeds/633:40-46` | **Current source of truth.** Many-to-many, FK to `jobs(id)` CASCADE. |
| `research_projects.project_id → projects(id)` | `seeds/633:31` | Nullable. |
| `research_requests.job_id → jobs(id)` | `seeds/537:36` | On the queue side. |

To reach a run from a job today: `jobs → research_project_jobs → research_projects.id →
research_runs.research_project_id`. **`research_runs` has no `job_id`.**

Unrelated but confusingly named: `job_research` is the manual notes list
(`JobResearchPanel.tsx`), nothing to do with runs.

### 1.5 The interactive map — much more built than expected

Rebuilt onto Google satellite imagery on 2026-09-19. `app/admin/map/page.tsx` is 2,367 lines with
`PropertyMap.css` at 3,899. Two modes on one page: **BROWSE** (every job's points in the viewport,
clustered, only past zoom 12) and **WORK** (`?job=<id>`, everything editable).

**Four tables, all live, all with real data:**

| Table | Live rows | What it holds |
|---|---|---|
| `job_property_maps` | 2 | `job_id`, `title`, `center_lat/lng`, `default_zoom` |
| `job_map_layers` | 3 | `name`, `ordinal`, `is_visible`, `is_default`, `colour` |
| `job_map_points` | 44 | `lat`, `lng`, `geometry`, `vertices`, `point_type`, `status`, `layer_id` |
| `job_map_point_media` | 81 | link to `job_files` — 34 video, 30 image, 17 document |

All 44 live points have lat/lng. All 44 are on a layer. Geometry in use: 56 `point`, 9 `path`,
2 `area` (across all 67 rows including deleted).

**Layers are done.** `job_map_layers` (`seeds/645`) + `job_map_points.layer_id`. Create ✅, rename
✅, delete ✅ (refuses the default; its points move to base rather than dying), hide/show ✅ —
and visibility is **saved, not per-browser**, so the other person looking at the same job sees the
same sheet turned off. Colour from a fixed 9-entry palette, deliberately not a free picker because
satellite imagery is dark, green and brown almost everywhere. Reorder is **half-built**: the API
accepts `ordinal` (`layers/route.ts:122-124`) and `sortLayers` honours it, but no UI ever sends it.

**Geometry is done.** `GeometryId = 'point' | 'fov' | 'path' | 'area'`
(`lib/jobs/property-map-shapes.ts:31`). `seeds/642:29-30` describes `path` in exactly the terms of
this request: *"a walk, for a video recorded while moving — `x`/`y` is where it started, `vertices`
are the bends after it."* Vertices are stored as real `[{lat,lng}]` since `seeds/647`, sanitised
server-side and capped at 500.

**Media on points is done** — by *link*, never by copy. `job_map_point_media.job_file_id` points at
`job_files(id)`. Three ways to attach: drag a tile from the files panel onto a pin, arm a file then
click a pin, or drop from the desktop onto the open point's panel.

### 1.6 The empty systems

Every one of these is fully built — schema, routes, pages, tests — and holds **nothing**.

| Table | Rows | Coordinates | Surfaced by |
|---|---|---|---|
| `field_data_points` | **0** | `device_lat` / `device_lon` | `/admin/jobs/[id]/field` |
| `field_media` | **0** | `device_lat` / `device_lon` | same, + `JobFieldMediaPanel` |
| `instrument_points` | **0** | `northing` / `easting` | `LiveFieldFeed` |
| `ingest_batches` | **0** | — | `CollectorArrivals` |
| `job_field_data` | **0** | `northing` / `easting` | `FieldWorkView` + a dashboard widget |

**Four separate point tables exist** — `job_map_points`, `field_data_points`, `instrument_points`,
`job_field_data` — sharing nothing but `job_id`. Two of them have nearly identical route names
(`/api/admin/jobs/field-data` vs `/api/admin/jobs/[id]/field-data`) and completely different
schemas. Three of the four are empty.

The Field Captures page is worth one specific note: it **fetches** `device_lat`/`device_lon` in
`PointSummary` (`field/page.tsx:48-49`) and **never displays them**. It renders cards, not a map.
That is the whole folding opportunity in one line — except that there is nothing in the table to
fold.

---

## Part 2 — What is genuinely missing

Nine things were asked for. Six of them are gaps; three already work.

| # | Asked for | State |
|---|---|---|
| 1 | "Research this Property" button on the job panel | **Missing.** Buried in a folder, and prefills nothing. |
| 2 | Rename to "View interactive map" | **Trivial** — but two call sites and a conditional. |
| 3 | Remove "View field captures" | **Trivial** — but see §2.1. |
| 4 | Upload a CSV / point file → a layer | **Missing entirely.** See §3.1. |
| 5 | Place photos/videos by their GPS | **Missing entirely.** See §3.2. |
| 6 | Draw the walked path for videos | **Geometry exists.** Only the track data is missing. |
| 7 | Layers for pictures / videos / notes / CSV | **Layers exist** — but see §4.1, this is the real design question. |
| 8 | Create more layers | **Works today.** |
| 9 | Duplicate points between layers | **Missing.** *Move* works (`points/route.ts:201-206`); copy does not. |

### 2.1 Removing "View field captures" is not purely a deletion

The page it links to renders things the map has no equivalent for:

- **job-level** media — photos, voice memos and videos attached to the job rather than to any point;
- the `JobNotesPanel` (`fieldbook_notes`);
- job-level files;
- a **CSV manifest** export (one row per downloadable + a 4-hour signed URL);
- a **streamed ZIP** of everything.

All of it currently displays nothing, because the tables are empty. But deleting the button without
deciding where the manifest and the ZIP go means quietly removing two export features. They may be
worth keeping on the map, or worth dropping — that is a decision, not a side effect.

---

## Part 3 — The three hard problems

Everything above is straightforward. These three are not, and two of them were not visible from the
request.

### 3.1 A surveyor's CSV is not in lat/long

A point file out of a data collector is `P,N,E,Z,D` — **northing and easting in State Plane feet**,
not latitude and longitude. To draw those on Google imagery, something must project them.

**There is no projection library in this repository.** No `proj4`, no `papaparse`, no `turf`, no
`exifr`. And this was not an oversight — `lib/cad/geo/texas-state-plane.ts` declares all five Texas
zones with their EPSG codes and then says so in its own header:

> *"**It does not re-project.** There is no projection library in this repo and adding one is a real
> decision, not a side effect of tidying a constant."*

That file also records why the declaration matters: EPSG:2277 was hardcoded in five places and
**described as two different zones** — one module called 2277 "North Central", the CAD writers
called it "Central". The CAD writers are right. A receiving system that trusts the wrong label
re-projects from the wrong zone and puts the parcel thousands of feet away, *with no error message
anywhere, because every number involved is individually plausible*.

That is exactly the failure mode a CSV import invites. A file with no declared zone, projected on an
assumption, produces points that look completely reasonable and are in the wrong county.

The same module also declines to compute combined scale factor or convergence angle, on the grounds
that *"a grid distance labelled as a ground distance is exactly the kind of confident wrong answer
this codebase's rules exist to prevent."*

**This is the single largest piece of unbudgeted work in the request**, and it needs a decision, not
a default.

### 3.2 Nothing in this repository reads GPS out of a photograph

Not one call site. No `exifr`, no `exif-parser`, no `piexif`; no `GPSLatitude` read anywhere.
`sharp(...).metadata()` is used in about fifteen places and every one of them is width/height or
orientation — two of them (`lib/media/normalise-image.ts:73`, `lib/receipts/render.ts:37`) call
`.rotate()` specifically to *apply and then strip* EXIF.

And the mobile app **disables EXIF on purpose**:

- `mobile/lib/storage/mediaUpload.ts:225` and `:240` — `exif: false` on both the camera and the
  library picker;
- `mobile/lib/fieldMedia.ts:182-192` explains why: *"expo-image-picker's exif option strips this
  when set to false (we set false to avoid a slow PHAsset round-trip), so we re-capture from the
  location helper"* — GPS and compass are read from the sensors in parallel, 8s and 1.5s timeouts,
  both best-effort.

So coordinates reach the database through `device_*` **columns**, not through file metadata. Which
means:

- a photo taken in the Starr mobile app **would** have coordinates — into `field_media`, which is
  empty, and which the map cannot see;
- a photo **uploaded from the web admin has none at all**, and nothing here can recover them;
- the 30 images and 34 videos already attached to map points have **no capture data whatsoever**.

### 3.3 The table this depends on is designed but not built

`docs/planning/in-progress/gps-capture-2026-09-19.md` already settles the data-model question, and
its answer is load-bearing. Owner, 2026-09-19:

> *"it could be that a user is clocked into the wrong job … and they record some videos and images
> without realizing… we need it so that we can move files/photos/videos easily to other jobs … and
> still retain the lat/long and other data for the capture."*

> **Therefore capture data belongs to the FILE, not to the map point.**

If the coordinates live on `job_map_points`, moving a file to another job loses them — the point
stays behind holding the position and the photograph arrives somewhere else naked. The proposed
shape:

```sql
create table job_file_captures (
  job_file_id uuid primary key references job_files(id) on delete cascade,
  captured_at timestamptz not null,
  lat double precision, lng double precision,
  accuracy_m double precision,
  track jsonb,        -- video only: [{ t: seconds-into-clip, lat, lng, acc }]
  device text, org_id uuid
);
```

The map point is **derived** from this. That doc's status line reads: **"designed, not built."**

It also already answers the walked-path question, and does it more carefully than the request did.
Phone GPS is 3–5 m at best and worse under canopy; 15 ft is ≈4.6 m, which sits *at the noise floor*.
A phone lying still on a tailgate appears to wander that far, so a video shot standing still would
draw a bird's nest of invented movement. The rule: keep a sample only when it is further than
**both** 15 ft and the accuracy the phone reported for that fix; always keep the first and last.
"Walked 20 feet" becomes a clean segment; "stood still for three minutes" becomes one point.

That is precisely the owner's *"if they walked far enough for it to matter at least"*, already
worked out — and it belongs in a pure tested module, because it is arithmetic on a list of fixes and
should not need a phone to verify.

---

## Part 4 — The design question that actually matters

### 4.1 "A layer for pictures" conflicts with what a layer is

The codebase draws a sharp, deliberate line, stated in both `seeds/645:11-24` and
`lib/jobs/property-map.ts:340-348`:

> *A layer is a **SHEET somebody made and named**; `pointType` is a **CLASSIFICATION from a fixed
> vocabulary**. They are different questions and both filter at once.*

There are already 14 point types (boundary, monument found, monument set, building, utility, fence,
street view, access, encroachment, water, vegetation, easement, hazard, generic) — and all 44 live
points are `generic`, so the classification axis is **completely unused today**.

"A layer for pictures, a layer for videos, a layer for pinned notes, a layer for the CSV points"
puts a *classification* on the *sheet* axis. That has one concrete consequence, and it is the reason
the request also asked for duplication:

> `layer_id` is a **single nullable FK**. A point is on exactly one layer. So a photo on the
> "Pictures" layer **cannot also** be on a layer called "Fence line" — which is why "duplicate
> points between layers" came up at all.

There are three ways out, and they are genuinely different products:

**(a) Duplicate, as asked.** Copy the row onto the other sheet. Simple, matches the mental model of
tracing paper — and the two copies drift the moment anybody edits one. Editing the caption on the
"Pictures" copy leaves the "Fence line" copy with the old text and no indication why.

**(b) Many-to-many.** A join table; one point, many sheets. Edit once, correct everywhere. Costs a
migration and makes "delete this point from this layer" ambiguous in a way the UI has to answer.

**(c) Use the axis that already exists.** Photos, videos, notes and CSV points become **point
types** (which is what they are — a classification), and layers stay what they are: sheets you name.
"Show me only the photos" becomes a legend toggle, which already works. Nothing is duplicated
because nothing needs to be in two places. Costs: four new entries in `POINT_TYPES`, and it does not
match how the request was phrased.

My read is that **(c) is what was actually wanted** and (a) is a workaround for a constraint that
only exists under (a) — but this is the owner's call, and it is the first question for phase 2.

---

## Part 5 — What should be deleted

Four parallel systems, zero rows between them.

| Delete | Rows | Why it is safe |
|---|---|---|
| `job_field_data` + `FieldWorkView` + `/api/admin/jobs/field-data` + the dashboard widget | 0 | A fourth points table with its own hand-drawn N/E plot. Duplicates `instrument_points` exactly. |
| ~~`instrument_points`, `ingest_batches`, `instrument_sources` + `CollectorArrivals` + `field-ingest`~~ | 0 | **RETRACTED — see §10. Do not delete this.** It is the foundation of the point-streaming feature, and it is empty because it was never switched on, not because it failed. |
| `/admin/jobs/[id]/field` + its four API routes | 0 | Field Captures. Keep the manifest/ZIP question open — see §2.1. |
| `field_data_points`, `field_media` | 0 | **Careful.** The mobile app writes here. Empty because nobody has used the mobile capture flow yet, not because it is dead. |

That last row is the one to be slow about — `field_media` is the target of a live code path in
`mobile/`.

**And the second row was a mistake, retracted in §10.** It is recorded here rather than quietly
edited out, because the reasoning that produced it is the thing to watch for: "zero rows" was read
as "abandoned", when for that stack it means "built, tested, and never given credentials". Emptiness
is evidence of disuse, not of failure, and the two want opposite decisions.

---

## Part 6 — The research prefill

Owner, 2026-09-20: *"it should inherit all of the information for the job such as any documents,
address, property id, customer name, etc, and it should use that to auto fill info for the research
run."*

Good news: the mapping is nearly one-to-one, and it already exists on both sides.

`jobs` has 62 columns, including everything needed:

```
address, city, state, zip, county, latitude, longitude,
survey_type, acreage, lot_number, subdivision, abstract_number,
client_name, client_email, client_phone, client_company,
customer_id, project_id
```

`research_projects` wants: `name`, `property_address`, `county`, `state`, `parcel_id`,
`legal_description_summary`.
The pipeline POST wants: `address`, `county`, `propertyId`, `ownerName`, `userFiles[]`.

So `address`→`property_address`, `county`→`county`, `state`→`state`, `client_name`→`ownerName`,
and `abstract_number`/`lot_number`/`subdivision` compose a legal description summary. The one
genuine gap is **parcel id**: `jobs` has `abstract_number` and `lot_number`, which are not the same
thing as a county parcel/property id.

Documents are the other open piece. The pipeline attaches `research_documents` where
`source_type='user_upload'` — a job's files live in `job_files`. Something has to carry them across,
and "carry" could mean copy the rows, reference them, or let the person choose which ones.

---

## Part 7 — Notes on gating

- **Every research API handler is session-only.** `pipeline/route.ts:65-66`, `:392-393`, `:437-438`
  and all of `app/api/admin/research/route.ts` check `auth()` and nothing else. **No role check in
  any of them.** Roles come from `middleware.ts` page prefixes; the API branch runs `apiBundleGate`,
  which is an entitlement check, not a role check.
- `/admin/research` allows `admin, developer, researcher, drawer, field_crew, tech_support`
  (`middleware.ts:204`). `/admin/map` adds `drawer` to the jobs list (`:87`).
- Every property-map route **does** check `isAdmin(session.user.roles)`. Which means the existing
  mismatch recorded earlier still stands: `/admin/map` is offered in the nav to developer, field
  crew, drawer, researcher and tech support, while its API allows admin only. Folding more into that
  page makes this matter more than it does today.

---

## Part 8 — Existing test coverage

**Map:** `property-map`, `property-map-layers`, `property-map-shapes`, `map-world`,
`map-shapes-world`, `file-thumbnails`, `maps/jobs-on-the-map`, `maps/geocode`.
**Field:** `field-data/{mobile-point-name-capture,mobile-screens-pass-point-name,reconcile}`,
`hub/widgets/field-data-pending`, `field/*`, `field-ingest/{ingest,live-feed}`.
**No e2e anywhere** for `/admin/map`, field captures, or the live feed.

Deleting the empty systems deletes their tests too — which is fine, and worth stating plainly so the
suite's count dropping is not mistaken for coverage loss.

---

---

## Part 9 — Point streaming from a Trimble controller

Owner, 2026-09-20: *"if we have a specific job opened up on a tsc5 and are shooting points, then is
it possible to stream those points as soon as they are shot so that they then show up in our
backend … Then could we have it where the interactive map point layer gets automatically updated?"*

**Yes. Two routes, and they are different projects.**

### 9.1 First — a comment in this repo is wrong

`seeds/522_field_ingest.sql` opens with:

> *"no vendor emits an event when a surveyor presses Store. Collectors sync at the job/file level."*

That is **true of the cloud sync path and false of the on-controller plugin path**. Trimble's Access
SDK documents exactly that event (§9.2). The comment is currently steering decisions away from
something that turns out to be possible, and should be corrected whichever route is chosen.

### 9.2 Route A — a TASDK plugin on the controller (true per-point, real time)

The **Trimble Access SDK (TASDK)** — *"development framework and plugin infrastructure to extend or
customize Trimble Access General Survey"* — provides the Survey Core Plugin API, which includes:

| Class | What it gives us |
|---|---|
| **`tsc_IDatabaseMonitor`** | `OnEntityAppended` — *"an object has been appended to the end of the database"*. **Fires when a point is stored to the job database.** Also `OnEntityModified`, `OnEntityReplaced`, `OnEntityDeleted`, `OnEntityUndeleted`, `OnEntityUnlinked`, `OnDatabaseClosing`. |
| `tsc_Database`, `tsc_JobPoints`, `tsc_Point` / `tsc_PointList`, `tsc_PointObservation` | Read the points and their observations out of the running job. |
| `tsc_IJobMonitor`, `tsc_IEventMonitor`, `tsc_IScAppMonitor` | Job and app lifecycle. |
| `tsc_PointStakeoutStoreEventArgs` | Stakeout-specific store event (narrower than `OnEntityAppended`). |

`OnEntityAppended` is the "presses Store" hook. It exists.

**The costs, which are large:**

- **Partner-gated.** Trimble's wording: TASDK *"allows **partner developers** to extend or
  customize Trimble Access General Survey."* Obtaining it is an application and a business
  conversation, not a download. Eligibility, fees and NDA terms are not published.
- **Native C++ plugin** on the controller, cross-platform "Android & Windows" — the TSC5 is the
  Android side. Entirely separate toolchain from this repository.
- **No documented HTTP.** The only external-communications classes in the SCAPI reference are
  serial: `tsc_Rs232Stream`, `tsc_IRs232StreamMonitor`, `tsc_Rs232PortParameters`,
  `tsc_Rs232PortLocker`. No socket, HTTP or websocket class is documented. A plugin would have to
  reach the network through the host platform's own stack, which the SDK does not cover. **This is
  the biggest unresolved risk on this route** — the event we need is documented, the transport off
  the device is not.
- The guide also warns about *"pitfalls in synchronous (blocking) methods"* in event handling —
  meaning a naive "POST on every store" handler could stall the survey app mid-shot. Any upload has
  to be queued and asynchronous.

### 9.3 Route B — poll Trimble Connect (near-real-time, minutes)

From Trimble Access's own cloud-connected-workflows documentation:

- **Upload trigger:** automatic **when job status changes** (e.g. "In progress", "Fieldwork
  complete"); manual uploads configurable in Cloud settings; and if the connection drops, data
  syncs automatically once reconnected and signed in.
- **Download cadence, for comparison:** *"Trimble Access checks for changes made to the project
  data in Trimble Connect every 5 minutes."*

Trimble Connect's published API catalogue is Core, Core Account, Model, Model Feature, Organizer,
Property Set, Topics, Workspace and Windows .NET. **No webhooks, events or push notifications are
documented anywhere in it.** So our server polls Connect for new file versions, and this repo
already has a stub for that conversation at `lib/field-ingest/trimble-connect.ts`.

**Granularity: the whole job file, on status change.** Not per point, not as-shot.

### 9.4 The question that decides between them

> Is the goal *"points appear within a few minutes"*, or genuinely *"I watch the pin appear as he
> shoots it"*?

Route B is buildable with what is already here and probably satisfies the first. Only Route A
satisfies the second, and it is a separate product with a partner agreement, a C++ toolchain, and an
unproven path off the device.

### 9.5 What neither route avoids

**The projection problem from §3.1 applies to every one of these paths.** Trimble points arrive as
northing/easting in State Plane feet. Streaming points that cannot be placed on the map is not worth
building, so §3.1 is a prerequisite for this entire section, not a parallel task.

And **photos and videos in real time is a different pipeline** — that is the mobile app and
`job_file_captures` (§3.2–3.3), sharing no transport with Trimble. The two can land on the same map
layer; they have nothing else in common.

---

## Part 10 — The point-streaming page was never deleted, and half the feature is already built

Owner, 2026-09-20: *"At some point we had a whole page built out for point streaming and stuff, and
we hid it. Can we find it and explore it?"*

Found. **It was absorbed, then hidden from navigation — not removed.** This part corrects §5 above.

### 10.1 Where it went

`app/admin/field-data/page.tsx` is now a forward:

> *"absorbed by the Jobs & Projects portal (C7). The route stays and forwards. Deleting it would
> break every bookmark — and here in particular, a field upload notification links straight here."*

And `lib/admin/route-registry.ts:483` takes it out of the rail and out of search:

```ts
{ href: '/admin/field-data', label: 'Field Data', internalOnly: true, showInRail: false,
  description: 'Field data records. Absorbed into Jobs; the row remains so
                /admin/field-data/[id] keeps its bundle gate.' }
```

**The live surface is `/admin/jobs?tab=field-data`** (`app/admin/jobs/page.tsx:64`, `:165`). The
default tab is `projects`, so it never appears on arrival. It is reachable, working, and invisible
unless you already know it is there. Restoring a nav entry is a one-line change.

Its three components moved to `app/admin/jobs/_tabs/` in commit `2946c745c` (2026-08-25) and their
header comments still name the old path — worth fixing while we are in here.

### 10.2 The Trimble poller already exists

`lib/field-ingest/trimble-connect.ts` — **235 lines, complete, tested, and never switched on.**

- `pollTrimbleConnect()` (`:90`) — cursor-based. Lists files changed since a cursor, filters by
  extension, sorts oldest-first, downloads each, calls `ingestArrival`, and advances the high-water
  mark **only after** the points are saved.
- Endpoints: `GET {base}/files?projectId=…&modifiedAfter=…` and
  `GET {base}/files/fs/{fileId}/downloadurl`, base
  `TRIMBLE_CONNECT_API_URL ?? https://app.connect.trimble.com/tc/api/2.0`.
- Auth: `Bearer ${TRIMBLE_CONNECT_TOKEN}`; throws `TrimbleConnectNotConfigured` when absent.
- `OVERLAP_SECONDS = 120` rewind on every poll; `poll_seconds` default 300.

**Why it is dark:** zero production callers (only `__tests__/field-ingest/ingest.test.ts`), no cron
entry in `vercel.json`, no watched-folder agent anywhere in `scripts/`/`server/`/`worker/`, and
neither `TRIMBLE_CONNECT_TOKEN` nor `TRIMBLE_CONNECT_API_URL` appears in any `.env` file. Its own
header says why: *"Credentials are owner-gated, the poller is not. Nobody here has one, so this
cannot be tested against the live API."*

The client is deliberately a stub rather than a guess (`:192-209`): *"a plausible-looking wrong
implementation is worse than an honest gap — it would look built, fail in production, and be
debugged by somebody who assumed it had been tested."*

### 10.3 There is already a completed spec for exactly this

`docs/planning/completed/STARR_CAD_PHASE_9_TRIMBLE_AUTOSYNC.md` — **"spec complete; implementation
deferred"**, owner Jacob Maddux, 2026-04-30. Its §1 user story is the request almost verbatim:

> *"Jacob walks the boundary, shoots a fence corner at 9:42 AM. By 9:46 AM, Hank's office screen
> shows the new point on the map. He notices it's 0.4 ft off from the deed call and texts Jacob:
> 'want to recheck that one?'"*

**It is blocked on three things, none of them code:**

1. a Trimble Connect **Business subscription**;
2. **TID OAuth client credentials**;
3. a device for real-hardware testing.

Note the spec proposes a separate Python FastAPI + APScheduler service and a Leaflet map. Both are
now redundant — we have a Next.js poller written and a Google map live, so that part of the spec
should be re-costed rather than followed.

Related: `docs/planning/completed/AI_PLAT_DRAWING_SYSTEM_PLAN.md:700` (Phase 2, not started) ranks
four approaches — hot-folder via Connect, LAN file share, Trimble dev APIs, **custom Access
plugin** — and sketches incremental drafting where each arriving point extends linework live.

### 10.4 What the earlier audit concluded, and where §9 goes further

`docs/planning/completed/PLATFORM_AUDIT_AND_LAUNCH_QUESTIONS_2026-07-29.md` §3d (lines 689–786) is
the origin of all of this, prompted by the same question: *"I would love it if when a data collector
stores a point, that point shows up on the app shortly thereafter. I don't know if this is
possible."* It carries a vendor verdict table — Trimble ✅ viable, Topcon ⚠️ partner-mediated,
Leica/GeoMax ❌ closed, Spectra ⚠️ file-only — and one directive worth keeping:

> ***"Do not promise 'instant, any brand.'** Promise 'Trimble near-live; everything else lands on
> sync or import.' Under-promising here is cheap; a firm that switches on the strength of a demo and
> then loses a day's shots in a dead zone is not a customer we get back."*

§3d's conclusion — *"no vendor emits an event on Store"* — is what `seeds/522` repeats. **That
conclusion was about the cloud path, and §9.2 of this document shows it does not hold for the
on-controller plugin path.** `tsc_IDatabaseMonitor::OnEntityAppended` is that event. §3d listed a
custom Access plugin as an option but does not appear to have researched it to this depth.

So the state of play is better than either document alone suggests:

| Piece | State |
|---|---|
| Ingest parsers (LandXML, GSI, RW5, JobXML, CSV) | **Built, tested** |
| Idempotent content-hash batching, two clocks | **Built, tested** |
| Trimble Connect cursor poller | **Built, tested, no credentials** |
| Live feed UI (15s poll, cursor-based, pauses when hidden) | **Built, hidden from nav** |
| Collector drag-and-drop upload | **Built, hidden from nav** |
| A scheduler to call the poller | **Missing** — no cron entry |
| Credentials + subscription | **Missing** — the actual blocker |
| N/E → lat/lng projection | **Missing** — §3.1, and the hard one |
| Writing arrivals into `job_map_points` | **Missing** — the map and the feed share nothing |

**Two of the nine are code we would write. One is a purchase. One is arithmetic nobody has chosen a
library for.**

### 10.5 What this changes about the plan

- **§5's delete recommendation is withdrawn** for the ingest stack. Deleting it would throw away
  the majority of the feature being asked for.
- The honest framing of "can we stream points?" is **not** "can we build this" but **"do we want to
  buy a Trimble Connect Business subscription and get OAuth credentials?"** That is a decision for
  the owner, and everything downstream waits on it.
- The remaining engineering is smaller than it looks: a scheduler, a projection decision, and a
  bridge from `instrument_points` into the map's layer/point model.

---

## Phase 2 — the questions

1. **Layers vs point types** (§4.1) — duplicate rows, many-to-many, or use the point-type axis that
   already exists and is entirely unused?
2. **CSV coordinates** (§3.1) — do we add a projection library and ask for the zone on import; do we
   accept lat/long CSVs only for now; or do we store N/E unprojected and show them on a list rather
   than the map?
3. **EXIF** (§3.2) — do we start reading GPS from uploaded files, or do coordinates only ever come
   from the mobile capture flow?
4. **Field Captures' manifest and ZIP** (§2.1) — move them onto the map, or drop them?
5. **`field_data_points` / `field_media`** (§5) — delete and let mobile write to the map's tables
   instead, or keep them and build a bridge?
6. **Research prefill: documents** (§6) — copy job files into the research project, reference them,
   or let the person pick?
7. **Research prefill: parcel id** (§6) — is `abstract_number` the right thing to send, or should it
   be left blank for the researcher?
8. **"View interactive map"** (§1.1) — one label always, and does `PropertyPanel`'s duplicate button
   stay?
9. **Point streaming ambition** (§9.4) — "within a few minutes" (Trimble Connect polling, buildable
   now) or "as he shoots it" (a TASDK partner plugin, separate product)?
10. **If Route A** (§9.2) — is opening a partner conversation with Trimble something you want to
    start now, given the transport question is unresolved until they answer?
11. **The actual blocker** (§10.3) — do we buy a Trimble Connect Business subscription and get TID
    OAuth credentials? Everything in §10 waits on this and nothing else.
12. **The hidden page** (§10.1) — restore a nav entry for `/admin/jobs?tab=field-data` now, or leave
    it hidden until there is data flowing into it?
