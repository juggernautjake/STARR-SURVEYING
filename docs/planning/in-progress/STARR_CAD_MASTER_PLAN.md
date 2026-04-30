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

