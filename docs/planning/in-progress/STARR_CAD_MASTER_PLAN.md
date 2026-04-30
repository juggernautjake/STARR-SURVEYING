# STARR CAD — Master Plan (Unified)

**Owner:** Jacob Maddux · **Status:** in-progress · **Document version:** 1.0 · **Last updated:** 2026-04-30

This is the single source of truth for the Starr Surveying CAD + AI plat-drawing
system. It supersedes the high-level coordination docs listed below and points
at the existing detail docs (per-phase) for implementation specifics. The goal
of this document is that any future developer (human or AI) can read it
end-to-end and know **what is being built, why, in what order, and to what
contract**.

> **If you only read one section:** read §2 (reconciliation), §6 (AI tool
> surface contract), §10 (calculation methods library), and §11 (calculated
> points + monument recovery). Those four sections together describe the
> non-obvious architectural commitments.

---

## 1. Reading order + supersession

| Doc | Status | Role going forward |
|---|---|---|
| `STARR_CAD_MASTER_PLAN.md` (this doc) | **canonical** | Master index + new-pillar specs (document ingestion, calculation methods, calculated points, conversational workspace) |
| `STARR_CAD_IMPLEMENTATION.md` | superseded by §2 of this doc | Keep for historical context; do not extend |
| `STARR_CAD_PHASE_ROADMAP.md` | superseded by §15 of this doc | Keep for historical context; do not extend |
| `AI_PLAT_DRAWING_SYSTEM_PLAN.md` (Jacob, 2026-04-29) | adopted as constraint architecture for Phase 6 | Keep as authoritative source for the deterministic-AI-drafter philosophy; this doc cross-links into it |
| `STARR_CAD/STARR_CAD_PHASE_1..8.md` | **canonical detail docs** — unchanged | Per-phase implementation reference; this doc cross-links each |
| `PLAN.md` | broader research-renderer plan | Sibling effort; only the CAD/AI portions are governed by this doc |

**New planning artefacts produced by this doc** (each a sibling file in
`docs/planning/in-progress/STARR_CAD/`, written as the corresponding section is
executed against):

- `STARR_CAD_DOC_INGESTION.md` (detail for §9)
- `STARR_CAD_CALCULATION_METHODS.md` (detail for §10)
- `STARR_CAD_MONUMENT_RECOVERY.md` (detail for §11)
- `STARR_CAD_AI_WORKSPACE.md` (detail for §12)

Those files do not yet exist. They are created on-demand when the corresponding
phase begins; this master doc is sufficient until then.

---

## 2. Reconciliation — what's adopted from where

The existing 8-phase STARR_CAD plan and Jacob's 2026-04-29 plan are
**complementary, not competing**. Phases 1–5 of STARR_CAD are marked complete
in the existing implementation doc; Phases 6–8 are forward-looking. Jacob's
plan is the prescriptive constraint architecture for Phase 6's AI engine and
introduces test/consistency discipline that retroactively raises the bar on
Phases 1–5.

| Concern | Source of truth | Notes |
|---|---|---|
| Scene graph data model | `STARR_CAD_PHASE_1_ENGINE_CORE.md` | Implemented. Jacob's entity schema is consistent with it. |
| Snap, pan/zoom, undo/redo | Phase 1 | Implemented. |
| Importers (CSV, RW5, JobXML) | `STARR_CAD_PHASE_2_DATA_IMPORT.md` | Implemented. **Extended** by §9 of this doc to add PDF/image/legal-description ingestion. |
| Layers, line types, symbols, style cascade | `STARR_CAD_PHASE_3_STYLES_SYMBOLS.md` | Implemented. **Extended** by §11 with the `MONUMENTS_CALCULATED` and `MONUMENTS_TO_SET` layers. |
| COGO + curves + closure | `STARR_CAD_PHASE_4_GEOMETRY_TOOLS.md` | Implemented. **Formalised** by §10 of this doc into a named, registry-backed methods library that the AI tool surface can call. |
| Annotations, templates, print | `STARR_CAD_PHASE_5_ANNOTATIONS_PRINT.md` | Implemented. **Extended** by Jacob's template hierarchy (firm → job-type → project → drawing) — see §4. |
| AI engine | `STARR_CAD_PHASE_6_AI_ENGINE.md` + Jacob's plan | **Reframed** by §6 (tool surface), §7 (rules engine), §8 (validation), §12 (conversational workspace). Phase 6's confidence tiers stay; Jacob's hard constraints become the floor. |
| Delivery, sealing, exports | `STARR_CAD_PHASE_7_FINAL.md` | Implemented as planned. **Extended** by §11 to gate AI-calculated points behind an explicit RPLS review before export strips the "CALC" marker. |
| UX polish | `STARR_CAD_PHASE_8_UX_CONTROLS.md` | Implemented as planned. **Extended** by §12 with the basis-selection workspace UI. |
| Trimble live streaming | Jacob's Phase 2 | Stays as a post-Phase-8 line item. Not in this doc's roadmap; tracked separately. |

**Net effect on existing phase docs:** none rewritten. Each gets a small
"superseded sections" banner pointing at the master if and only if a section in
that doc is contradicted by something here. Otherwise the per-phase docs stay
authoritative for their phase.

---

## 3. Architectural principles (binding)

These are not negotiable without an explicit RFC + Hank sign-off:

1. **The scene graph is the single source of truth.** Frontend, backend, AI
   agent, exporters, and the conversational workspace all read from / write to
   the same scene graph. There is no parallel "AI's view" of the drawing.
2. **The AI never draws pixels.** It only emits structured tool calls (§6).
   Rendering is fully deterministic.
3. **Templates and rules are constraints, not suggestions.** The AI cannot
   deviate from template-defined styles. Validation (§8) rejects non-compliant
   tool calls and returns structured errors so the AI retries.
4. **Every operation is undoable.** Manual user actions and AI tool calls share
   a single command stack. One AI tool call = one undoable operation; one
   conversational turn may produce multiple operations grouped into a labelled
   transaction.
5. **Calculated points are visually + structurally distinct from observed
   points until explicitly accepted by the RPLS.** They live on a separate
   layer, carry full lineage metadata, and exports tag them as `CALC` until the
   RPLS clears them (§11).
6. **All AI reasoning is logged into the drawing's audit trail.** Inputs,
   chosen basis, calculation method, intermediate values, and final
   placement — all stored on the entity and visible to the RPLS.
7. **Document-extracted data is never trusted blindly.** OCR + LLM extraction
   produces *candidates*; a human confirms before the data drives a
   computation (§9).

---

## 4. Scene graph contract (recap + delta)

The scene graph is defined in `STARR_CAD_PHASE_1_ENGINE_CORE.md`. This section
records the deltas required to support the new pillars.

### 4.1 Existing entity types (Phase 1) — unchanged

`Point`, `Line`, `Polyline`, `Arc`, `Circle`, `Text`, `MText`, `Block`,
`Dimension`, `Leader`, `Hatch`, `Table`, `Image`.

### 4.2 New entity metadata fields

Every entity gains the following optional fields. They default to `null`/empty
and are written only when relevant; existing entities are not migrated.

```ts
interface EntityMetadata {
  // Existing
  id: string;
  type: EntityType;
  layer: string;
  source_points?: string[];   // for derived linework
  feature_code?: string;
  created_by: 'user' | 'ai_agent' | 'auto_draft' | 'calc_engine' | 'doc_import';
  created_at: string;          // ISO timestamp
  locked: boolean;
  visible: boolean;

  // NEW — calculated-points + provenance
  derivation?: Derivation;     // see §10.4 — populated when created_by ∈
                               // {'ai_agent','auto_draft','calc_engine'}
  source_documents?: string[]; // doc ingestion artefact ids — see §9
  rpls_status?: 'pending' | 'accepted' | 'rejected' | 'sealed';
  audit_log?: AuditEntry[];    // append-only; one entry per mutation
}
```

### 4.3 New layers (template-level)

Added to the firm-wide template baseline. Existing drawings load with these
defined-but-empty.

| Layer | Purpose | Default style |
|---|---|---|
| `MONUMENTS_FOUND` | Existing — physical monuments observed in the field | Open circle, black |
| `MONUMENTS_SET` | Existing — monuments physically set this job | Filled circle, black |
| `MONUMENTS_CALCULATED` | **NEW** — positions computed by the calc engine; not yet physically set | Dashed circle, magenta, "CALC" tag |
| `MONUMENTS_TO_SET` | **NEW** — calculated points the RPLS has approved for setting | Dashed circle, green, "TO SET" tag |
| `DOC_REFERENCES` | **NEW** — overlay shapes representing geometry pulled from uploaded documents (deed calls, old plat outlines) | Light grey, "DOC" tag |

### 4.4 Reference frames + units

Unchanged from Phase 1: drawings store coordinates in their native state plane
+ ftUS. All calculation methods (§10) operate in the drawing's native frame
unless explicitly given a transform.

---

## 5. Template hierarchy (binding)

Adopted verbatim from Jacob's plan §5; harmonised with Phase 5's template
storage.

```
Firm-wide  (Starr baseline — Hank's standards)
   ▼ overrides
Job-type   (boundary | topo | ALTA | subdivision | road | resurvey)
   ▼ overrides
Project    (per-client / per-job overrides)
   ▼ overrides
Drawing    (one-off tweaks for this sheet)
```

- Stored as YAML under `apps/cad/templates/` with a JSON-schema validator.
- Templates are versioned; switching a project's job-type template prompts a
  diff preview before applying.
- Phase 5's existing template artefacts (title block, north arrow, scale bar,
  legend, certification) are now properties of the firm-wide template.
- Texas/TBPELS rules (datum statement, basis-of-bearing requirement, RPLS seal
  area, county recording requirements) live in the firm-wide template as
  declarative validation rules, not code.

---

## 6. AI tool surface (canonical)

The full set of functions the AI agent can call. Anything not in this list is
unavailable to the AI. Every signature uses **named style references** — the
AI passes style names defined in the active template, never raw style values.

### 6.1 Geometry creation

| Tool | Signature (conceptual) | Notes |
|---|---|---|
| `add_point` | `(northing, easting, elevation?, description, feature_code, point_number?)` | Returns new point id |
| `add_line` | `(start_id, end_id, layer, style_name)` | |
| `add_polyline` | `(point_ids[], closed, layer, style_name)` | |
| `add_arc_3point` | `(p1_id, p2_id, p3_id, layer, style_name)` | |
| `add_arc_radius_chord` | `(start_id, end_id, radius, direction, layer, style_name)` | direction ∈ `cw`/`ccw` |
| `add_curve_from_field_data` | `(pc_id, pt_id, radius, delta, layer, style_name)` | Surveyor-form curve |
| `add_text` | `(content, anchor, style_name, rotation?)` | |
| `add_block` | `(block_name, insertion_point, rotation?, scale?)` | Block names from active template |

### 6.2 Annotation

| Tool | Signature | Notes |
|---|---|---|
| `label_line_bearing_distance` | `(line_id, position, style_name)` | Position from rules engine if omitted |
| `add_dimension` | `(type, points[], style_name)` | type ∈ `linear`/`angular`/`radial` |
| `add_callout` | `(target_id, leader_text, position)` | |

### 6.3 Tables

`add_point_table`, `add_leg_table`, `add_curve_table` — all take `(ids[],
position, style_name)` and pull row data from the referenced entities.

### 6.4 Layout

`place_title_block()`, `place_north_arrow(position?)`,
`place_scale_bar(position?)`, `set_drawing_scale(scale)`,
`add_notes_block(notes_template_name, position?)`.

### 6.5 Auto-draft

| Tool | Signature | Notes |
|---|---|---|
| `auto_draft_from_points` | `(point_set_id, drawing_type, options?)` | Calls the auto-draft engine. drawing_type ∈ template registry |

### 6.6 Editing

`modify_entity(id, property, new_value)`, `move_entity(id, dx, dy)`,
`delete_entity(id)`, `change_layer(id, layer_name)`.

### 6.7 Query (read-only — AI uses these to reason)

`list_entities(filter?)`, `get_entity(id)`, `measure_distance(p1_id, p2_id)`,
`compute_traverse_closure(point_ids[])`, `list_layers()`,
`summarize_drawing()`.

### 6.8 NEW — calculation methods (§10)

The AI invokes calculation methods through a single dispatcher:

```
calc_method(method_name, inputs, output_label?, output_layer?)
```

`method_name` must be a registered method (§10.2). `inputs` is a method-shaped
object validated against the method's signature. Returns a `Derivation` (§10.4)
plus the new entity id(s).

### 6.9 NEW — document ingestion (§9)

| Tool | Signature | Notes |
|---|---|---|
| `list_documents` | `()` | Returns ingested docs available to this drawing |
| `get_document_extract` | `(doc_id)` | Returns the structured extraction (calls, points, descriptions) |
| `propose_calls_from_doc` | `(doc_id, target_basis_id?)` | AI helper that returns candidate calculation chains |

### 6.10 NEW — basis selection (§12)

| Tool | Signature | Notes |
|---|---|---|
| `propose_bases` | `(targets[], constraints?)` | Returns up to 3 candidate bases ranked by expected closure error |
| `compute_basis` | `(basis_spec, targets[])` | Computes calculated points under the given basis; returns provisional entities on `MONUMENTS_CALCULATED` |
| `commit_basis` | `(basis_id)` | Promotes provisional points to drawing state, marks `rpls_status='pending'` |

### 6.11 Hard limits (the AI cannot)

- Modify locked entities, sealed entities, or any entity with
  `rpls_status='sealed'`.
- Change template-defined styles (it can override per-entity, never the
  template itself).
- Generate or modify the surveyor's certification language or seal area.
- Move physical observed monument points (`MONUMENTS_FOUND`,
  `MONUMENTS_SET`) without explicit user confirmation passed through a
  separate `confirm_observed_move(id, justification)` call.
- Auto-adjust a traverse without user approval (`compute_traverse_closure` is
  read-only; balancing requires `apply_traverse_adjustment(method, params)`
  which carries a confirm flag).

---

## 7. Rules engine

A reusable module (`packages/cad-rules/`) the AI consults but cannot override.
Phase 5's label optimiser is refactored into the engine; new rules from
Jacob's plan slot in alongside.

### 7.1 Rule categories

| Category | Examples | Authoring source |
|---|---|---|
| Drafting standards | Bearing/distance label above E-W lines, right of N-S lines; never upside down (flip 90–270°); offset = N × text-height; curve labels concave-side; point labels NE unless conflict | Hank's interview; Phase 5 baseline |
| Layer assignment | Feature code → layer + symbol map | Phase 2 + Phase 3 (existing) |
| Naming + numbering | Curve labels `C1`, `C2`…; leg labels `L1`, `L2`…; point numbering follows source | Phase 5 |
| Template compliance | Required title block / north arrow / scale bar / notes / certification per drawing type; required tables (ALTA vs boundary vs subdivision) | Firm-wide template |
| Texas / TBPELS | Datum statement, basis-of-bearing reference, RPLS seal area, county recording requirements | Firm-wide template |
| **NEW — calculated points** | Calculated points must be on `MONUMENTS_CALCULATED`; must carry a `Derivation`; must reference at least one observed point in their basis chain; tolerance per drawing-type | This doc §11 |
| **NEW — document references** | Anything created from `propose_calls_from_doc` must carry `source_documents`; raw extraction text must remain queryable | This doc §9 |

### 7.2 Rule execution model

- Rules are pure functions: `(scene_graph, entity_being_added, template,
  context) → RuleResult`.
- `RuleResult` is one of `pass`, `warn(message)`, `block(message,
  remediation)`, `auto_fix(patch)`.
- AI tool calls run through the rules engine after schema/reference/geometric
  checks (§8) and before commit. `block` returns a structured error to the AI;
  `auto_fix` applies the patch and logs it.
- A user-triggered "rules audit" command runs the entire engine over an
  existing drawing and lists all violations. Used before export.

### 7.3 Rule authoring + storage

- YAML for declarative rules (most label/template/Texas rules), TypeScript for
  rules that need geometry (label collision, curve-side detection).
- Versioned per firm-wide template; switching templates re-runs the audit.

---

## 8. Validation layer

Sits between the AI and the scene graph. Every AI tool call passes through
all five gates in order:

| Gate | Checks | On failure |
|---|---|---|
| 1. Schema | Tool name exists; arguments match the registered signature; required fields present; types correct | Return structured error to AI: `{code: 'schema', detail, expected}` |
| 2. Reference | Referenced entity ids and style names exist in the active scene + template | Return error listing valid options for the offending field |
| 3. Geometric | Operation is geometrically sensible — no zero-length lines, no self-intersecting boundary polylines, no coincident curve endpoints, coordinates inside state-plane bounds | Return error with the failing constraint |
| 4. Rule | Rules engine (§7) returns no `block` results | Return concatenated rule messages with remediation hints |
| 5. Template compliance | Final entity passes the active template's compliance rules | Return template-name + rule id |

If all five gates pass, the call commits to the scene graph as a single
undoable operation, an audit-log entry is written, and the response goes back
to the AI. The AI's expected behaviour on any error is **retry with a
corrected call**, up to 3 attempts per logical operation, after which it
surfaces the failure to the user.

---

## 8b. AI data-translation contract

Every supported input format has a **deterministic translator** that converts
raw input into a structured intermediate representation (IR). The AI does not
parse raw bytes. The IR is the only thing the AI sees from an input file.

### 8b.1 The intermediate representation

```ts
interface IngestIR {
  source: { kind: SourceKind; uri: string; sha256: string; ingested_at: string };
  raw_text?: string;             // for documents — full extracted text
  points?: ObservedPointIR[];    // for point files
  calls?: CallIR[];              // bearings/distances extracted from documents
  curves?: CurveCallIR[];
  monuments?: MonumentReferenceIR[];
  pob?: PointOfBeginningIR;      // if extractable
  legal_description?: string;
  metadata?: Record<string, unknown>;
  warnings: IngestWarning[];     // ambiguity flags, low-confidence regions
}
```

Each format has a translator that produces this IR. Translators are pure +
unit-tested + versioned.

### 8b.2 Format → translator map

| Format | Translator | IR fields populated | AI involvement |
|---|---|---|---|
| `.csv` (PNEZD + variants) | `pnezd-translator` | `points` | none — fully deterministic |
| `.txt` (delimited) | `delimited-translator` | `points` | none |
| `.rw5` (raw survey) | `rw5-translator` | `points`, `calls` (from raw observations) | none |
| `.xml` (JobXML / LandXML) | `xml-translator` | `points`, `calls`, `curves`, `metadata` | none |
| `.shp` (Shapefile) | `shapefile-translator` | `points`, `calls`, geometry overlays | none |
| `.pdf` (digital text-layer) | `pdf-text-translator` → `doc-extractor` LLM | `raw_text`, `calls`, `curves`, `monuments`, `pob`, `legal_description` | LLM extraction with strict schema |
| `.pdf` (scanned image-only) | `pdf-ocr-translator` → `doc-extractor` LLM | as above | OCR (Tesseract / vision model) → LLM extraction |
| `.jpg`/`.png`/`.tiff` (photographed plat) | `image-ocr-translator` → `doc-extractor` LLM | as above | vision-model OCR + extraction |
| Pasted legal description (text input) | `legal-desc-translator` LLM | `calls`, `curves`, `pob`, `legal_description` | LLM with strict schema |

### 8b.3 LLM extraction discipline (for the document translators)

- The LLM is called with a **strict JSON schema** (matching IR sub-types) and
  the response is parsed under that schema.
- Free-form prose is never accepted — the LLM either returns a valid IR
  fragment or returns a structured `unable_to_extract` reason that lands as a
  warning.
- Confidence per field. Below a per-field threshold (configurable per firm),
  the field becomes a *candidate* requiring human confirmation in the review
  UI.
- Source spans (page + bounding box for image inputs; character offsets for
  text inputs) are stored on every extracted field for the audit trail.

### 8b.4 Standardised translation conventions (firm-wide)

The list below is binding; deviations require an RFC. These are the
conventions that determine "how the AI translates the data" — not negotiable
per-job:

1. **Bearings.** Always stored as quadrant bearings (`N00°00'00"E`); decimal
   degrees converted on translate; azimuths converted on translate. Units:
   degrees-minutes-seconds with whole-second precision unless source is finer.
2. **Distances.** Stored in feet (US survey foot) with hundredths.
   Source-meter values are converted on translate; the original value is kept
   in `metadata.source_value` for audit.
3. **Coordinates.** State-plane only (NAD83 Texas Central by default; per-job
   overrideable). Lat/long inputs are reprojected on translate using `pyproj`
   with the project's CRS; the original lat/long stays in `metadata`.
4. **Curve definitions.** Stored as PC + PT + radius + delta + direction.
   Source forms (`Δ + R`, `R + L`, `chord + bearing`, `3-point`) are converted
   on translate; the original is kept in `metadata.source_form`.
5. **Monument descriptions.** Lower-cased, whitespace-collapsed; original
   verbatim text stays in `metadata`. Cross-referenced against the firm
   monument-description library for canonicalisation suggestions; the
   surveyor confirms.
6. **Point numbers.** If the source has them, kept verbatim; if not, assigned
   monotonically from the next free integer at ingest time. Re-ingestion of
   the same source preserves the original assignment via the `sha256` hash.
7. **Feature codes.** Looked up against the canonical Starr feature-code
   library. Unknown codes raise an `unknown_feature_code` warning and the
   surveyor either maps them or adds them to the library.
8. **Time + date stamps.** Stored in UTC, ISO-8601, even when the source
   carries local time.

### 8b.5 Why this matters

Every "the AI did something weird" debugging session reduces to one of:
(a) the translator produced a wrong IR; (b) the rules engine had the wrong
rule; (c) the AI tool surface was too permissive. By forcing all input through
the IR + translators, the AI's input is reproducible and any unexpected output
can be traced to a specific gate.

---

## 9. Document ingestion pipeline

The big new pillar. Surveyors upload PDFs, scans, photographs of paper plats,
or paste legal-description text; the system extracts structured data and feeds
it to the calculation engine + AI workspace.

### 9.1 Supported document types

| Document type | Path | Extracted |
|---|---|---|
| Old plats (digital PDF with text layer) | `pdf-text-translator` | Bearings, distances, curve calls, monuments, POB, legal description, sheet metadata |
| Old plats (scanned PDF, no text layer) | `pdf-ocr-translator` | Same; OCR-confidence flagged on every field |
| Photographed paper plats | `image-ocr-translator` | Same; rectification step before OCR |
| Field notes (typed) | `pdf-text-translator` or paste | Observations, monument descriptions, basis-of-bearing notes |
| Field notes (handwritten) | **out of scope for v1** — flagged as warning, surveyor transcribes | n/a |
| Legal descriptions (pasted text) | `legal-desc-translator` | Calls, curves, POB, exception language |
| Title commitments | `pdf-text-translator` + commitment-aware prompt | Easements, exceptions, subject property description |
| Deed records | `pdf-text-translator` | Calls, monuments, grantor/grantee, recording reference |

### 9.2 Pipeline stages

```
upload  →  format-detect  →  translator (§8b)  →  IR  →  candidate review UI
                                                            ▼
                                              accepted ──→  scene graph
                                                            (DOC_REFERENCES
                                                             layer; raw text
                                                             stored as
                                                             ingestion artefact)
                                                            ▼
                                                       available to
                                                       calc engine + AI
```

1. **Upload.** File arrives via the workspace upload control; sha256 hashed;
   stored in object storage; metadata row in DB.
2. **Format detect.** MIME + magic-byte sniff; route to translator.
3. **Translator.** Produces the IR (§8b). LLM extraction stages stream
   progress to the workspace UI.
4. **Candidate review UI.** Side-by-side: original document on the left
   (with bounding-box highlights for image inputs), extracted IR on the right
   (editable). Surveyor confirms or corrects each field. Low-confidence
   fields are pre-flagged.
5. **Acceptance.** On confirm, the IR commits as an *ingestion artefact*;
   structured data becomes queryable by the AI through `get_document_extract`;
   geometry overlays render on `DOC_REFERENCES`.
6. **Audit trail.** Every accepted field carries: source document id, page
   reference, original text span, extracted value, surveyor's correction (if
   any), confidence, accept timestamp.

### 9.3 Geometry overlays from documents

When a document includes a complete metes-and-bounds chain anchored to a POB,
the pipeline can render the chain as a **non-binding overlay** on
`DOC_REFERENCES`:

- Position is derived by anchoring the POB to a known coordinate (user-picked
  observed monument, or arbitrary origin if no known monuments exist).
- Style: light grey, dashed, "DOC: <source>" tag.
- Cannot be promoted to a real boundary without explicit user action that
  routes through the calc engine (§10) — the overlay is a visualisation
  only.

### 9.4 Multi-document reasoning

A single drawing can have N ingested documents. The AI workspace (§12) can
ask the user "this old plat says the south line bears S 89°57'00" W; the
deed says S 89°55'12" W. Which do you trust?" and route the answer into the
basis-selection workflow.

### 9.5 Storage + retention

- Original uploaded files live in object storage with the project bundle.
- IR + audit log live in the project DB.
- Re-running extraction on the same file (e.g., after a translator upgrade)
  produces a new IR version; the old IR is preserved for comparison.
- Project bundles export with original files + IR + audit log so a future
  reader can reproduce every calculation.

### 9.6 Prompt + extraction discipline

Each LLM-driven translator gets a **stable, versioned prompt** stored in
`packages/cad-ingestion/prompts/`. Prompt changes are SemVer'd; old IR
versions retain their prompt-version pointer for reproducibility. Prompt
contents:

- Strict JSON schema for the expected IR fragment.
- Examples of valid extractions for the surveying context.
- Explicit "say `unable_to_extract` rather than guessing" instruction.
- Confidence calibration guidance.
- Refusal cases (e.g., "if the document is not a survey-related artefact,
  return `out_of_scope`").

---

## 10. Calculation methods library

The registry of named, deterministic, mathematically-defined methods the
system uses to compute coordinates. Both the AI tool surface (`calc_method`,
§6.8) and the manual COGO panel call into the same registry. Phase 4's
existing geometry tools become the first batch of registered methods.

### 10.1 Goals

- One canonical implementation per method (no drift between AI-invoked and
  user-invoked calculations).
- Each method produces a `Derivation` (§10.4) — sufficient to reproduce the
  result from the inputs alone.
- Each method declares its tolerance, expected closure error, and the
  conditions under which it is the correct choice. The basis-selection
  workspace (§12) reads these declarations to rank alternatives.
- New methods can be added without touching the AI prompt — the prompt
  references the registry, not individual methods.

### 10.2 Registered methods (v1)

| Id | Name | Inputs | Output | When to use |
|---|---|---|---|---|
| `bearing_distance` | Bearing + distance from known point | `from_point`, `bearing`, `distance` | one new point | Most common — single call extending from a known monument |
| `inverse` | Inverse between two known points | `point_a`, `point_b` | bearing, distance | Reverse of above; reads from existing entities |
| `bearing_bearing_intersection` | Intersection of two bearings | `from_a`, `bearing_a`, `from_b`, `bearing_b` | one new point (or two for parallel-near-parallel warning) | Lost monument when you have two adjoining lines that meet at it |
| `bearing_distance_intersection` | Intersection of a bearing with a distance arc | `from_a`, `bearing_a`, `from_b`, `distance_b` | up to two solutions; user picks | When one neighbouring tie is bearing-only and one is distance-only |
| `distance_distance_intersection` | Intersection of two distance arcs | `from_a`, `distance_a`, `from_b`, `distance_b` | up to two solutions; user picks | Two ties from known points to the lost corner |
| `traverse_compass` | Compass-rule traverse balancing | `closed_traverse`, `closure_tolerance` | adjusted point set | Closing a measured boundary chain |
| `traverse_transit` | Transit-rule traverse balancing | `closed_traverse`, `closure_tolerance` | adjusted point set | Older surveys; angles more reliable than distances |
| `traverse_least_squares` | Least-squares network adjustment | `observations[]`, `fixed_points[]`, `weights?` | adjusted points + error ellipses | Modern adjustment when redundant observations exist |
| `curve_pc_pt_radius` | Curve solver from PC + PT + radius | `pc`, `pt`, `radius`, `direction` | arc geometry + delta + length | Resolving record-call curves |
| `curve_pc_radius_delta` | Curve solver from PC + radius + delta | `pc`, `radius`, `delta`, `tangent_in_bearing`, `direction` | arc + PT | Extending from a tangent-in |
| `curve_3point` | Arc through 3 points | `p1`, `p2`, `p3` | arc + radius + delta + center | Resolving observed-only curves |
| `offset_along_bearing` | Point at perpendicular offset from a line | `line_id`, `station`, `offset` | one new point | Staking offset positions |
| `resection` | 3-point fix from known monuments | `from_a`, `from_b`, `from_c`, `obs_a`, `obs_b`, `obs_c` | one new point | Establishing position when occupying an unknown station |
| `pob_anchored_chain` | Walks a metes-and-bounds chain from a POB | `pob`, `calls[]` | sequence of new points | Reconstructing a deed call from an extracted document |
| `proportionate_measurement` | BLM-style proportionate measurement for lost corners | `controlling_corners[]`, `record_distances[]`, `lost_position_index` | one new point + alt rule (single, double, triple) | Lost original GLO/BLM corners |
| `grid_to_ground` / `ground_to_grid` | Coordinate scale conversion | `point`, `combined_factor` (or computed from CRS + elevation) | adjusted coordinate | When mixing measured ground distances with grid-stored coordinates |

The registry is open for extension. Each new method ships with: signature
schema, implementation, unit tests against textbook examples, a "when to use"
heuristic that the basis-selection workspace can read, and a doc page in
`STARR_CAD_CALCULATION_METHODS.md`.

### 10.3 Method signature anatomy

Every registered method is a TypeScript module exporting:

```ts
export const method = {
  id: 'bearing_distance',
  display_name: 'Bearing + distance from known point',
  category: 'point_derivation',
  inputs: { /* JSON-schema */ },
  outputs: { /* JSON-schema */ },
  tolerance: {
    expected_closure_error_ft: 0.01,
    sensitivity: { /* per-input nudge factor for error propagation */ }
  },
  when_to_use: 'Single call extending from a known monument...',
  preconditions: [ /* declarative — checked before run */ ],
  compute(inputs): MethodResult,        // pure
  describe(inputs): string,             // human-readable summary for audit log
};
```

`compute()` is pure: same inputs → byte-identical outputs. No I/O, no clock.

### 10.4 The `Derivation` schema

Every entity created by a calculation method carries a `Derivation` in its
metadata:

```ts
interface Derivation {
  method_id: string;
  method_version: string;     // SemVer of the method module
  inputs: Record<string, unknown>;       // exact inputs as passed
  input_sources: InputSource[];          // where each input came from
  result_summary: string;                // human-readable (matches describe())
  computed_at: string;                   // ISO timestamp
  expected_error_ft?: number;            // if the method declared one
  notes?: string;
}

interface InputSource {
  param_name: string;
  kind: 'observed_point' | 'calculated_point' | 'document_extract'
       | 'user_entered' | 'derived_inverse';
  ref?: string;                          // entity id / document id
  document_span?: { page: number; bbox?: [number,number,number,number] };
}
```

This is what makes a calculated point reproducible and auditable: any future
reader can see *which* known points + *which* document calls + *which* method
produced it, and re-run the computation to verify.

### 10.5 Tolerance + error propagation

Each method declares per-input sensitivity. The workspace propagates the
input uncertainties (bearing ±N seconds, distance ±N hundredths) through to
an expected positional error on the output. This drives:

- The "expected closure error" displayed when ranking bases (§12).
- The visual confidence ring drawn around calculated points on the canvas.
- The "exceeds tolerance" warning that blocks export until the RPLS
  acknowledges.

### 10.6 Method governance

- New methods land via PR with: implementation, unit tests against
  textbook references (with citations), entry in
  `STARR_CAD_CALCULATION_METHODS.md`, and Hank's review.
- Method version bumps are SemVer; non-major changes preserve `compute()`
  output byte-for-byte against the test corpus, enforced in CI.
- Deprecated methods stay in the registry (so historic `Derivation`s
  remain reproducible) but are hidden from the workspace UI.

---

## 11. Calculated points + monument recovery

The end-to-end workflow for the headline use case: surveyor finds *some* of
the original monuments, has documents (deed, old plat, field notes) for the
rest, and needs the system to compute where the missing/disturbed monuments
should be — with a drawing that shows clearly which points are observed vs.
calculated, and audit trail to defend in front of the RPLS or in court.

### 11.1 User story (canonical)

> Surveyor reaches a job site, locates 3 of 8 boundary monuments, finds two
> are clearly disturbed (one knocked over, one moved by recent fenceline
> work), and one is missing entirely. They have the original 1973 plat (PDF
> scan) and the recorded deed text. They want to calculate where the
> 5 unfound monuments should be, decide which to re-set vs. accept as
> disturbed, and produce a drawing the RPLS can review and seal.

### 11.2 Workflow (happy path)

1. **Open project, upload documents.** Old plat PDF + deed PDF land in the
   ingestion pipeline (§9). Surveyor confirms extracted bearings, distances,
   curve calls, POB.
2. **Import observed points.** CSV from total station / GNSS receiver.
   Observed monuments land on `MONUMENTS_FOUND`; disturbed ones get a
   `disturbed: true` metadata flag (surveyor sets this manually or via a
   bulk-tag UI).
3. **Open the workspace (§12), pick targets.** Surveyor selects "I want to
   compute the 5 missing corners + the 2 disturbed corner positions".
4. **AI proposes bases.** Up to 3 candidate basis chains (§12.2), each
   ranked by expected closure error, with a one-line "why this basis" and
   the dependency graph (which calculated point depends on which observed
   point + which document call).
5. **Surveyor picks a basis (or asks AI to compare side-by-side).**
6. **AI computes.** Each calculated point lands on `MONUMENTS_CALCULATED`
   with full `Derivation` metadata, a confidence ring proportional to the
   expected positional error, and a `rpls_status='pending'` flag.
7. **Per-point review.** Surveyor walks each calculated point, accepts /
   rejects / tweaks. Accepted points stay on `MONUMENTS_CALCULATED`;
   rejected points are deleted; tweaked points are flagged
   `user_overridden: true` and the override goes into the audit log.
8. **Decide setting plan.** Surveyor moves "to be set" calculated points to
   `MONUMENTS_TO_SET` (single click per point or bulk-promote-accepted).
   These render with the green dashed circle + "TO SET" tag.
9. **RPLS review gate.** Before the drawing exports without the "CALC" /
   "TO SET" tagging, the RPLS runs the "review calculated points"
   command — a serial walkthrough that requires explicit acceptance or
   rejection of every entity with `rpls_status='pending'`. On full
   acceptance, the drawing's `seal_status` flips to `sealed` and exports
   strip the calc/to-set markings (per Phase 7).
10. **Field crew sets monuments.** Optional: export a "stake-out file" of
    `MONUMENTS_TO_SET` points (CSV + bearings/distances from chosen control)
    that drops directly into Trimble Access.

### 11.3 Visual treatment

| State | Layer | Symbol | Colour | Tag | Notes on plat |
|---|---|---|---|---|---|
| Observed monument | `MONUMENTS_FOUND` | Open circle w/ cross | Black | (none) | Always |
| Observed but disturbed | `MONUMENTS_FOUND` (disturbed flag) | Open circle w/ cross + small "D" | Black + orange "D" | "FND DISTURBED" call-out | Always |
| Calculated, pending RPLS | `MONUMENTS_CALCULATED` | Dashed circle | Magenta | "CALC" + confidence ring | Until RPLS clears |
| Calculated, accepted, to be set | `MONUMENTS_TO_SET` | Dashed circle w/ cross | Green | "TO SET" + confidence ring | Until physical set + re-shot |
| Set this job | `MONUMENTS_SET` | Filled circle | Black | (none) | After re-shot confirms |

The confidence ring radius = expected positional error from method's
sensitivity propagation (§10.5). User can hide rings from the layer panel.

### 11.4 Lineage UI

Clicking a calculated point opens a side panel with:

- The full `Derivation` (method, version, inputs, input sources).
- Hyperlinks to source observed points (canvas highlights on hover).
- Hyperlinks to source document spans (opens the original PDF/scan with the
  span boxed).
- "Re-run" button (applies current method version; useful after method
  upgrades).
- "Try alternate basis" button (sends the user back into §12 with this
  point as the target).
- "Accept" / "Reject" / "Override coordinate" controls.
- Export-time inclusion toggle (e.g., "show on final plat as a tie point" vs.
  "internal use only").

### 11.5 Tolerance enforcement

- Each drawing-type template declares an export tolerance (e.g., "boundary
  monuments must have expected positional error ≤ 0.05 ft").
- Calculated points exceeding the tolerance carry an `over_tolerance` flag.
- Export is blocked until either: (a) the surveyor recalculates with a
  tighter basis, or (b) the RPLS explicitly accepts the over-tolerance
  point with a justification that lands in the audit log.

### 11.6 Multi-job recall

Calculated points carry their `Derivation` with the project bundle.
Reopening the project a year later — even after method-registry version
bumps — preserves the original calculation. A "re-run with current methods"
button is offered but never automatic.

### 11.7 Liability + sealing

- Until `rpls_status='sealed'`, every export carries a watermark "DRAFT —
  AI-ASSISTED — NOT SEALED".
- The sealing step writes the RPLS's identity, timestamp, and the SHA-256 of
  the drawing's serialised state into the audit log. Future modifications
  invalidate the seal automatically.
- Disturbed monuments are *never* moved to "calculated" automatically. The
  surveyor must explicitly mark them, and the RPLS gate flags any
  surveyor-assigned `disturbed` flag for review.

---

## 12. Conversational basis-selection workspace

The chat-driven UI where the surveyor and the AI iterate on which observed
points + document calls to use as the foundation for calculating missing
points. This is the new pillar that wraps §9 + §10 + §11 into a coherent
working tool.

### 12.1 Layout

Three-pane workspace mounted alongside the CAD canvas:

```
┌────────────────────────────┬────────────────────────────────────┐
│                            │                                    │
│      CAD CANVAS            │   BASIS CANDIDATES (right rail)    │
│   (scene graph render —    │   ┌──────────────────────────────┐ │
│    canonical state +       │   │ Basis A — chain from IRF#3    │ │
│    provisional ghost       │   │   exp closure: 0.04 ft        │ │
│    points from active      │   │   anchors: IRF#3, IRF#7       │ │
│    basis)                  │   │   doc refs: 1973 plat (P2)    │ │
│                            │   │   covers: 4 of 5 missing      │ │
│                            │   └──────────────────────────────┘ │
│                            │   ┌──────────────────────────────┐ │
│                            │   │ Basis B — section corner +   │ │
│                            │   │   deed call from POB         │ │
│                            │   │   exp closure: 0.11 ft       │ │
│                            │   │   covers: 5 of 5 missing     │ │
│                            │   └──────────────────────────────┘ │
│                            │   [ + Compare A vs B side-by-side ]│
├────────────────────────────┴────────────────────────────────────┤
│   CHAT (full-width bottom pane)                                  │
│   You: which corners can you find from just the 1973 plat?      │
│   AI:  the plat gives me the south + east lines verbatim;       │
│        I can recover corners 4, 5, 6 from IRF#3 with…           │
│   You: what if i don't trust the 1973 plat's south bearing?     │
│   AI:  basis B avoids that bearing — it walks from the BLM      │
│        section corner using the deed's east-west call. trade-   │
│        off: 0.11 ft expected closure vs basis A's 0.04 ft…      │
│   [ commit basis A | commit basis B | ask another question ]    │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 Basis-proposal protocol

When the surveyor picks targets and asks "what bases work?", the AI calls
`propose_bases(targets, constraints?)`. The dispatcher under that tool:

1. **Enumerates anchor sets.** Every observed point + every document-anchored
   POB is a candidate anchor. Combinatorially restricted to anchors within a
   reasonable tie-distance of any target.
2. **Plans calculation chains.** For each anchor set, the planner walks the
   target list and decides which method from §10 reaches each target. Walks
   are scored by:
   - Sum of per-step expected positional error.
   - Number of document-extracted (vs. observed) inputs (fewer = more
     trusted).
   - Chain depth (shorter = more trusted).
   - Tolerance budget (chains exceeding the drawing-type tolerance are
     dropped unless no alternative exists).
3. **Returns up to 3 ranked bases.** Each basis is structured:
   ```ts
   interface BasisCandidate {
     id: string;
     anchors: { observed_point_ids: string[]; documents: string[] };
     coverage: { resolved_targets: string[]; unresolved_targets: string[] };
     plan: PlannedStep[];                       // ordered list of method calls
     expected_closure_error_ft: number;
     dependency_graph: DependencyEdge[];
     tradeoffs: string;                         // human-readable
     ai_confidence: 'high' | 'medium' | 'low';
   }
   ```

The cap of 3 is configurable per-firm but defaults to 3 to keep cognitive
load manageable.

### 12.3 Compute + preview

Selecting a basis triggers `compute_basis(basis, targets)`:

- Each target gets a *provisional* entity on `MONUMENTS_CALCULATED` with
  `provisional: true` metadata.
- Provisional entities render on the canvas as ghosts (50% opacity) so the
  surveyor can see the fit before commit.
- Switching to a different basis swaps the ghosts in place; nothing commits
  to the audit-trail-relevant state until `commit_basis`.

### 12.4 Compare-bases mode

The "Compare A vs B" action splits the canvas into a vertical mirror: same
viewport, two scene-graph projections, one for each basis. Differences
between the two are highlighted (target points that move > tolerance show a
red arrow A→B with the delta in feet). Below the canvas, a small table:

| Target | Basis A position | Basis B position | Δ (ft) | Notes |
|---|---|---|---|---|
| Corner 4 | N12345.67 E22345.12 | N12345.71 E22345.10 | 0.04 | both within tolerance |
| Corner 5 | N12678.91 E22612.45 | N12679.08 E22612.20 | 0.30 | **Basis B exceeds tolerance** |

### 12.5 Chat conventions

The chat is the surveyor's primary working surface for ambiguity. Conventions:

- **AI asks before computing** when the inputs are ambiguous (e.g., "the
  deed says 'thence south to the creek'; should I use the document-extracted
  south bearing of S 00°15'00" W, or the modern observed creek centerline?").
- **AI cites sources for every claim.** Every numeric value referenced in
  the chat carries a clickable source (observed point id, document span, or
  method id).
- **AI proposes preferences as user-set policy.** When the surveyor says
  "always use compass rule for boundary traverses", the AI offers to save
  this as a project-level (or firm-level) preference and references it on
  future runs.
- **AI surfaces tradeoffs, never decides for the surveyor on legally
  significant calls.** Phrases like "you should use basis A" are reserved
  for cases where one basis is *clearly* better by all metrics; otherwise
  the AI presents the tradeoff and asks.

### 12.6 Conversation memory

Per-project + per-drawing chat history is persisted with the project bundle.
Each turn carries:

- The user's message.
- The AI's response (text).
- All tool calls invoked + their structured results.
- Any state changes that resulted (provisional / committed bases, accepted
  points, rejected points).

A future reader (RPLS reviewing 6 months later, court expert in litigation)
can replay the conversation deterministically against the saved tool-call
results.

### 12.7 Manual override path

The chat is never the *only* way. Every action in the workspace has an
equivalent manual COGO panel command. The chat is a productivity layer over
the underlying methods — surveyors who prefer command-line COGO can ignore
the chat entirely without losing capability.

### 12.8 AI-assist scope (hard limits)

- The AI cannot commit a basis without explicit user action.
- The AI cannot accept calculated points on the user's behalf — it only
  proposes; the surveyor walks the per-point review.
- The AI cannot mark a monument `disturbed` — surveyor judgment only.
- The AI cannot modify document-extracted values; corrections route through
  the document review UI (§9.2 step 4).
- The AI cannot run methods that are deprecated in the current registry.

---

## 13. Auto-draft engine (point-set → linework)

This is the existing Phase 6 capability, reframed against the new tool surface
+ method registry. The auto-draft engine is the deterministic path from "I
have a coded point file" to "I have a styled draft plat" — it doesn't need
the basis-selection workspace, but it does benefit from the same scene-graph
contract and rules engine.

### 13.1 Pipeline (deterministic)

| Stage | Action | Module |
|---|---|---|
| 1. Parse | Read IR points (§8b); group by feature code | `cad-autodraft/parse` |
| 2. Categorise | Map each point to a feature category from the firm code library | `cad-feature-codes` (existing, Phase 2) |
| 3. Group | Connect points with the same line code in source order; detect curve markers (`BC`/`PC`/`PT`/`EC`) | `cad-autodraft/grouping` |
| 4. Linework | Emit polylines for connected sequences; emit arcs for curve segments via §10 method `curve_3point` or `curve_pc_pt_radius` | `cad-autodraft/linework` |
| 5. Symbols | Place feature-code-mapped blocks on observed points | `cad-autodraft/symbols` |
| 6. Labels | Run rules engine label-placement pass (bearing/distance, point labels, curve labels) | `cad-rules` (§7) |
| 7. Closure | Run `compute_traverse_closure` on boundary chains; flag if outside tolerance | `cad-cogo` (§10) |
| 8. Tables | Generate point / leg / curve tables per active template | `cad-autodraft/tables` |
| 9. Layout | Place title block, north arrow, scale bar, notes | template (§5) |
| 10. Validate | Full rules audit (§7); produce report of warnings + blocks | `cad-rules` |
| 11. Return | Surveyor reviews report; warnings remain on the drawing as flag overlays until cleared | UI |

### 13.2 AI involvement

The auto-draft engine itself is deterministic — no LLM in the data path. The
AI's involvement is at the edges:

- **Pre-draft.** Before stage 1, the AI inspects the input IR + the active
  template and may ask clarifying questions ("this CSV has feature code
  `BL3` which isn't in the firm library — should I map it to BL with a
  sub-line index, treat it as a new code, or skip it?").
- **Post-draft.** After stage 11, the AI summarises the warnings and
  proposes resolutions ("3 points on the south boundary failed closure;
  options: re-shoot, use compass rule via §10.6, or accept with a written
  justification").

### 13.3 Auto-draft → calculated-points handoff

When the auto-draft engine finishes and the surveyor opens the workspace
(§12), the workspace already has:

- All observed points loaded.
- The auto-drafted linework + labels + tables visible.
- Any closure failures flagged as targets.

If the input file lacks one or more boundary corners (an unclosed traverse),
the workspace can offer "switch to monument-recovery mode" which routes
those missing corners through §11.

### 13.4 Edge cases

Documented in `STARR_CAD_PHASE_6_AI_ENGINE.md` and re-affirmed here:

- Crossing lines: the engine never silently picks "on top"; both stay,
  rule-based label placement avoids the crossing.
- Overlapping labels: rules engine flags; AI proposes the shift.
- Non-closing parcels: never silently fudged. Closure error is shown.
- Missing curve data: arc falls back to `curve_3point`; flagged as a warning
  the surveyor must clear.
- Multi-coded points: surveyor's mapping in the firm library wins; conflicts
  flagged.
- Mistyped codes: strict by default; the AI offers a fuzzy match in the
  warnings panel for the surveyor to confirm.

---

## 14. Output + export

Cross-link to `STARR_CAD_PHASE_7_FINAL.md` for the export engine itself;
this section records the deltas the new pillars introduce.

### 14.1 Calc/seal-aware export pipeline

```
export request
   │
   ▼
seal status check ───► drawing has rpls_status='pending' entities?
   │                          │
   │                          ├── yes + RPLS gate not run → block; surface
   │                          │   the "review calculated points" command
   │                          ├── yes + RPLS gate run with rejections → block
   │                          └── yes + RPLS gate fully accepted → continue
   ▼
strip-or-keep tags ───► firm-set policy (default: strip CALC/TO-SET on sealed
                         export; keep on draft export)
   │
   ▼
format-specific writer (DXF / PDF / SVG / GeoJSON / CSV / project bundle)
   │
   ▼
audit-log entry: who exported, what format, with what tag policy, sha256 of
                 the exported bytes
```

### 14.2 Export formats

| Format | Use | Notes |
|---|---|---|
| DXF (2018+) | AutoCAD / Carlson / Civil 3D / Bricscad / Traverse PC interop | `ezdxf` writer; round-trip tested per Phase 7 |
| PDF | Plotting / signing | Vector; lineweights honoured; multi-sheet |
| SVG / PNG | Web previews | Watermarked DRAFT until sealed |
| GeoJSON | GIS handoff | Reprojected to WGS84 on export |
| CSV (PNEZD + variants) | Stake-out / archive | Includes a stake-out variant: `MONUMENTS_TO_SET` only, with bearings/distances from the surveyor-chosen control |
| Project bundle (zip) | Archive / audit | Original uploaded files + IR + scene graph + audit log + chat history + selected basis + all `Derivation`s |

### 14.3 Calculated-point markers in exports

- **Draft export (any state):** calculated and to-set points carry
  visible markers + tags + confidence rings.
- **Sealed export (`rpls_status='sealed'` on every entity):** firm-default
  strips the markers. Per-firm policy can override to keep them; a
  surveyor-set per-export choice can override that.
- **Audit-log linkage in exports:** every exported PDF embeds the project
  bundle's audit-log SHA-256 + URL in the document metadata so a future
  reader can fetch the trail.

### 14.4 Stake-out export

A first-class output for the §11 workflow. The export builds, for each point
on `MONUMENTS_TO_SET`:

- Northing / easting / elevation.
- Recommended occupied station (from the basis's anchor set).
- Bearing + distance from that station.
- Optional: bearing + distance from a backup station.
- Suggested setting note (e.g., "iron rod, 1/2 inch, 24 inch length, capped
  STARR RPLS 6706").

Exported as CSV (Trimble Access compatible) and as a printable stake-out
sheet PDF.

---

## 15. Quality, testing, consistency

### 15.1 Test corpora

| Corpus | Source | Used by |
|---|---|---|
| Coded survey corpus | 8–12 representative Starr jobs (boundary, topo, ALTA, subdivision, road, resurvey, lost-monument, partial-data) | Auto-draft engine + AI agent |
| Document corpus | 15–20 representative documents (clean PDFs, scanned PDFs, photographed plats, deeds, title commitments, legal descriptions) with hand-curated golden IRs | Document ingestion translators |
| Method-textbook corpus | Citations from canonical surveying texts (Brinker & Wolf, Wolf & Ghilani) for each registered method | §10 method unit tests |
| Calculated-point corpus | Job pairs where one job has full observation and one has partial observation + the rest of the data in documents | §11 + §12 end-to-end |
| Visual-regression corpus | Rendered PNGs of golden draft plats from each survey-corpus entry | Phase 5 + style cascade |

Each corpus entry has a manifest: inputs, expected IR or scene graph,
expected exports, expected warnings. CI runs the full suite on every PR.

### 15.2 Consistency suite

Per Jacob's plan §11.3: run the same input through the AI 10× with
randomised prompt orderings and compare:

- Final scene graphs (modulo entity ids) — must match.
- Tool-call sequences — must match modulo cosmetic ordering.
- Exported DXFs — must hash-match after entity-id normalisation.

Variation on identical input is treated as a bug. Triage:

1. Was the rules engine consulted at every relevant gate? If not, fix the
   tool surface.
2. Did the AI use a method outside the tightly-bounded tool list? If so,
   tighten the tool surface.
3. Was the system prompt drifting (over-instructing in a way that left
   creative latitude)? If so, simplify.

### 15.3 Visual regression

Each draft plat in the visual-regression corpus is rendered to PNG; CI
diffs against the golden PNG. Deltas above pixel-tolerance flag for human
review (some renderer changes are intentional and the goldens get
regenerated, but explicitly).

### 15.4 OCR + extraction QA

For the document translators specifically:

- Field-level precision/recall computed against hand-curated goldens.
- Per-field confidence calibration: bucket extractions by reported
  confidence and verify that low-confidence buckets have proportionally
  more errors. Mis-calibration is treated as a prompt bug.
- Failure modes catalogued: handwriting / poor scan / non-standard
  bearing format / mixed metric+imperial / partial OCR. Each gets a known
  warning code so triage is fast.

### 15.5 Method-registry CI gates

- New method PR cannot merge without textbook-citation tests.
- Method version bumps preserve `compute()` output byte-for-byte against
  the historical input/output corpus, enforced in CI.
- Deprecated methods stay testable until a documented "no project still
  references this method" check passes.

### 15.6 Acceptance criteria (binding)

A drawing is "ready for RPLS review" when:

1. Every entity has `created_by`, `created_at`, and (if calculated) a
   complete `Derivation`.
2. No rule violations remain unresolved.
3. The closure on every closed traverse is within the drawing-type
   tolerance, or carries an explicit `over_tolerance_acknowledgement`.
4. Every ingested document has either fully-confirmed extraction or an
   explicit `partial_extraction_acknowledgement`.
5. Every chat-driven AI tool call resulted in a committed scene-graph
   change or an explicit user reject.

---

