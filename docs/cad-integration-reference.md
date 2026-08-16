# CAD integrations — what each one is, expects, and does when it fails

> **C44e** of `docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md`.
> Companion to `docs/cad-integration-points.md`, which is the generated *reachability* list.
> That one answers **where each module is reached from**. This one answers **what it does, what it
> needs, and how it tells you when it cannot**.

Every claim here was read in the source, not inferred from a name. Where an integration is gated on
an environment variable, the gate is named — and so is **what unconfigured actually looks like**,
because *"configured"* and *"working"* have been confused in this repo before, and the distance
between them is usually one boolean that reads `true` either way.

---

## The one thing to read first: a webhook that is not configured returns `ok: true`

All three third-party syncs (Compass, Forge, Orbit) share this shape. When their `*_WEBHOOK_URL` is
unset, the route:

- logs the payload to the server console (`[admin/cad/<name>-sync] webhook not configured — skipped`),
- returns **HTTP 200** with `{ ok: true, forwardedTo: null, message: "…not set — payload logged but not forwarded." }`.

This is deliberate and it is defensible: the seal transition that triggered the sync has already
completed, and 503-ing the request would fail an operation the surveyor did successfully. **But
`ok: true` is what a caller checks.** The only thing separating "delivered to Forge" from "written
to a log nobody reads" is the `forwardedTo` field.

`CADLayout` reads it correctly — it logs `(logged; webhook not configured)` — but that is a
`cadLog.info`, which means the surveyor sees **nothing at all** either way. There is no on-screen
signal that a sync happened or didn't.

**So: on this surface, "it worked" is not evidence. Check `forwardedTo`, or check the receiving
system.**

---

## File formats

These need no configuration. They are pure functions over text, they run in the browser, and they
fail by throwing or by reporting — never by returning empty and quiet (C44d).

| Integration | What it is | Expects | How it fails |
|---|---|---|---|
| **TRV** (`lib/cad/io`) | The native Traverse PC format — the round trip this product is built around. Import *and* export. | `.TRV` text: layer table (`86`), points (`0`/`2` blocks), traverses (`30` + `10,<id>` refs). | Unrecognised lines are **skipped**, by design (vendor extensions). A file with no TRV records at all is reported as *"No Traverse PC records were found in this file"* — added in C44d, because before it a text file opened as a blank drawing with nothing wrong. |
| **LandXML** (`lib/cad/import/landxml-parser.ts`, `lib/cad/delivery/landxml-writer.ts`) | COGO interchange that Civil 3D, Carlson, Trimble Business Center and Traverse PC all read. | `<LandXML>` root, `<Units>`, `<CgPoints>` as `northing easting [elevation]`. | Throws, naming the root it found *and where the other two XML survey formats are handled*. The best failure message on this surface — a surveyor who uploaded a JobXML by mistake is told where to go next, in the error itself. |
| **DXF** (`lib/cad/delivery/dxf-writer.ts`, `lib/cad/delivery/dxf-reader.ts`) | The CAD lingua franca. Round-trips. | DXF text; entities on named layers. | Per-entity `warnings[]` on the result, surfaced as an "imported with N warnings" count. |
| **GeoJSON** (`lib/cad/delivery/geojson-writer.ts` + `lib/cad/delivery/geojson-reader.ts`) | GIS hand-off. Round-trips, reprojecting to WGS84 on the way out. | A `FeatureCollection`. Needs the drawing's `stateplaneZoneKey` to project. | Invalid JSON throws. Valid JSON that is not GeoJSON returns with `warnings[]` rather than an empty collection. Round-trips to **0.01 ft**, not to the bit — the reprojection is lossy by nature and that is far tighter than any boundary dispute. |
| **RW5** (`lib/cad/import/rw5-parser.ts`) | Carlson / Topcon / Spectra raw field data. **Import only.** | `JB`/`MO`/`SP`/`OC`/`SS` records. | Row-level `error` per bad row; every row is accounted for as parsed **or** errored, so 47 points out of 48 cannot import silently. |
| **Leica GSI** (`lib/cad/import/gsi-parser.ts`) | Leica / GeoMax field data, GSI-8 and GSI-16. **Import only.** | Word-index blocks (`WI....±value`). Information character 6 decides millimetres. | Row-level `error`. A truncated block is reported, not dropped. |
| **Trimble JobXML** (`lib/cad/import/jobxml-parser.ts`) | Trimble field data. **Import only.** | `<JOBFile>` with `<Reductions>`/`<Point>`. | Row-level `error`. A point with no `<Grid>` is **not** imported at 0,0 — that would put a boundary corner in the Gulf of Mexico, silently. |
| **CSV** (`lib/cad/import/csv-parser.ts`) | Delimited coordinates from anywhere. **Import only.** | Any delimiter; needs a **column mapping** chosen by the surveyor before import. | Detection reports `csv` with the reason *"needs a column mapping before import"* rather than guessing which column is northing. |

`detectSurveyFormat` picks between them by **content first**, extension second, and returns
`unknown` with a reason rather than guessing at a file it cannot place.

---

## Deliverable production (`lib/cad/delivery`)

No environment configuration. Reachable from the CAD page; produces the files a client receives.

| Module | What it is | Notes that matter |
|---|---|---|
| `deliverable-bundle` | Assembles the set of files a job ships. | |
| `completeness-checker` | Refuses to bundle a drawing that is missing required elements. | The gate before a seal. |
| `pdf-writer` | The plat itself. | |
| `seal-engine` / `rpls-workflow` | RPLS review states and the seal transition. | **DELIVERED is what fires Forge and Orbit** — see below. Interim seal events deliberately do not. |
| `scope-document`, `sleeve-cards`, `description-generator` | Supporting paperwork generated from the drawing. | |
| `traversepc-bundle` | The TRV-side package. | |

---

## Third-party sync

All three are **owner-configured** and all three are inert without their URL. None of them blocks
anything when unconfigured.

| Integration | Direction | Fires when | Env gate | Unconfigured behaviour |
|---|---|---|---|---|
| **Compass** (`lib/cad/integrations/compass.ts`, `lib/cad/integrations/compass-sync.ts`) | **Both.** In: a job hand-off dropped into `localStorage['starr-cad-pending-compass']`, consumed on mount to patch the title block and offer field/deed files for import. Out: seal-status webhook. | Inbound: CAD mount. Outbound: seal transitions. | `COMPASS_WEBHOOK_URL` (+ optional `COMPASS_WEBHOOK_SECRET`, sent as `X-Starr-Compass-Secret`) | `ok: true`, `forwardedTo: null`, console line. The **inbound** half needs no configuration at all — it is a localStorage hand-off between two apps on the same origin. |
| **Forge** (`lib/cad/integrations/forge-sync.ts`) | Out. Boundary polygon, building footprints and utility lines as as-built base layers for construction management. | Drawing reaches **DELIVERED**. Once per job — `lastForgeSyncedRef` guards a repeat. | `FORGE_WEBHOOK_URL` (+ optional `FORGE_WEBHOOK_SECRET` → `X-Starr-Forge-Secret`) | `ok: true`, `forwardedTo: null`, console line. |
| **Orbit** (`lib/cad/integrations/orbit-sync.ts`) | Out. Boundary, utilities and monument points for the field-mapping app. | Drawing reaches **DELIVERED**, independently of Forge — one failing does not suppress the other. | `ORBIT_WEBHOOK_URL` (+ optional `ORBIT_WEBHOOK_SECRET` → `X-Starr-Orbit-Secret`) | `ok: true`, `forwardedTo: null`, console line. |

**Forge sends only three layer categories** — BOUNDARY, BUILDINGS, UTILITIES, picked by regex on the
layer name. Everything else (notes, control, traverse) is dropped from the payload deliberately, so
survey-only working layers do not reach the construction surface.

**Orbit receives state-plane US feet**, not WGS84, with an EPSG hint stamped in
`crs.properties.name`; Orbit reprojects on import. The spec asks for WGS84 out of the box and that
flips to a writer-side conversion once `proj4` is in the dependency tree.

---

## AI

| Path | What it is | Env gate | Unconfigured behaviour |
|---|---|---|---|
| `POST /api/admin/cad/ai-propose` → `lib/cad/ai/claude-proposer.ts` | Turns a surveyor's prompt into reviewable **proposals** against the tool registry. Derives its Anthropic tool list from `toolRegistry` — a tool added there is callable here by existing. | `ANTHROPIC_API_KEY` | **503** with *"AI is offline — ANTHROPIC_API_KEY is not configured."* Named, not silent. |
| `POST /api/admin/cad/drawing-chat` | The conversational surface. Runs registry tools via `CALL_TOOL`; its capability list is generated from `toolRegistry`, not hand-written. | `ANTHROPIC_API_KEY` | **503**, naming the variable and the environment. |
| `POST /api/admin/cad/sketch-reconcile` | Reconciles a hand sketch against measured points. | `ANTHROPIC_API_KEY` | **503**, naming the variable — corrected in C44e. It used to fold the missing key in with every upstream failure and return **502**, and those lead somewhere different: a 502 says Anthropic failed so retry, an unset key says nobody has configured this yet so go set it. |
| `lib/cad/ai/mock-proposer.ts` | Test/dev double. **Deliberately has no surface** — giving it one would ship a fake AI. | — | n/a |

**Reach:** the AI can drive **20 of the editor's 51 tools** (C39). The Copilot sidebar carries the
figure as a chip whose tooltip names what it *cannot* do; `lib/cad/ai/reach.ts` is the source, and a
tool added to the editor without an entry there does not compile.

**Review before apply:** every writing tool goes through a proposal the surveyor accepts (C38), and
each proposal ghosts what it will do first — including `deleteFeatures`, which outlines what will
go. Accepting is one undo (C37).

---

## Where each fact is enforced

Documentation drifts; these do not.

| Claim | Enforced by |
|---|---|
| Every integration module reaches a page or a route | `__tests__/cad/cad-integrations-reach-a-surface.test.ts` |
| Formats round-trip without moving or mirroring geometry | `__tests__/cad/integration-round-trips.test.ts`, `__tests__/cad/landxml-round-trip.test.ts` |
| Bad input fails legibly, never empty-and-quiet | `__tests__/cad/integration-failure-paths.test.ts` |
| The AI's editor reach, and its gap list | `__tests__/cad/ai-reach-ratchet.test.ts` |
| Every AI proposal can actually be applied | `__tests__/cad/ai-preview-before-apply.test.ts` |

The env gates are the exception: nothing here can test that `FORGE_WEBHOOK_URL` is set in
production, because it is a deployment fact rather than a code fact. That is precisely why they are
written down — and why `forwardedTo`, not `ok`, is the field to check.
