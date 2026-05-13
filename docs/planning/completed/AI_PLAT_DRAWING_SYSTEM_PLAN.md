> **Status — archived as architectural reference (2026-05-12).**
> This doc's planning function is discharged: every milestone has either shipped
> under the STARR_CAD per-phase docs or has been reframed under
> `STARR_CAD_MASTER_PLAN.md`. It is kept as the canonical reference for the
> deterministic-AI-drafter philosophy (scene graph as single source of truth,
> tool-call-only AI, rules engine + validation layer, consistency discipline)
> per `docs/planning/README.md` ("Kept for historical decision context"). For
> any forward-looking decision, read the master plan; this doc is no longer
> extended.
>
> **Section absorption map** (where each section's content now lives):
>
> | This doc § | Owner going forward |
> |---|---|
> | §3 Architecture | `STARR_CAD_MASTER_PLAN.md` §3 (architectural principles) |
> | §4 Scene graph | `STARR_CAD/STARR_CAD_PHASE_1_ENGINE_CORE.md` (shipped) · master plan §4 (delta) |
> | §5 Templates | `STARR_CAD/STARR_CAD_PHASE_3_STYLES_SYMBOLS.md` · master plan §5 |
> | §6 CAD tool functionality | Phases 1–5 (shipped) · master plan §13 (auto-draft) |
> | §7 AI agent design | master plan §6 (tool surface), §7 (rules engine), §8 (validation), §8b (data-translation contract) |
> | §8 Auto-drafting engine | master plan §13 + `STARR_CAD/STARR_CAD_PHASE_6_AI_ENGINE.md` |
> | §9 Data ingestion | `STARR_CAD/STARR_CAD_PHASE_2_DATA_IMPORT.md` (shipped) · master plan §9 (PDF/legal-description extension) |
> | §10 Output & export | `STARR_CAD/STARR_CAD_PHASE_7_FINAL.md` · master plan §14 |
> | §11 Quality / testing / consistency | master plan §15 |
> | §12 Tech stack | master plan §16 |
> | §13 Phase 1 roadmap (M1–M8) | master plan §17 (reframed) + per-phase detail docs |
> | §14–§19 Phase 2 (Trimble) | `STARR_CAD_PHASE_9_TRIMBLE_AUTOSYNC.md` (spec shipped 2026-04-30; implementation deferred — needs Trimble Connect Business + TDC600) |
> | §20 Cross-cutting concerns | master plan §18 |
> | §21 Risks & open questions | master plan §19 |
> | §22 Immediate next steps | Stack/repo/MVP-scope items met by current code; tribal-knowledge gathering (drafting standards, feature-code library) is ongoing under Phase 3/6 work |
>
> **Milestone status** (Phase 1 = §13 here; Phase 2 = §19 here):
>
> | Milestone | Status | Tracking doc |
> |---|---|---|
> | M1 Foundations (scene graph, undo/redo, persistence) | Shipped | Phase 1 (completed/) |
> | M2 Manual CAD tools | Shipped | Phase 1 (completed/) |
> | M3 Templates & styles | Shipped | Phase 3 (in-progress, items complete) · Phase 5 (in-progress) |
> | M4 Import & export | Shipped | Phase 2 (completed/) · Phase 7 (in-progress) |
> | M5 Feature code library | Shipped | Phase 3 (in-progress, items complete) |
> | M6 Auto-draft engine | Forward-looking under Phase 6 | `STARR_CAD_PHASE_6_AI_ENGINE.md` + master plan §13 |
> | M7 AI agent integration | Forward-looking under Phase 6 | `STARR_CAD_PHASE_6_AI_ENGINE.md` + master plan §6–§8 |
> | M8 Polish & internal beta | Blocked on M6/M7 | Phase 8 (in-progress) |
> | M9–M12 Trimble Access streaming | Shipped | Phase 9 (in-progress, items complete) |

# AI-Powered Plat Drawing System — Project Plan
 
**Prepared for:** Starr Surveying
**Author / Owner:** Jacob Maddux
**Document Version:** 1.0 (Initial Planning Draft)
**Date:** April 29, 2026
 
---
 
## 1. Executive Summary
 
This document outlines a two-phase plan to build an AI-assisted CAD drafting system specialized for land surveying plats. The system pairs a deterministic, web-based CAD engine with a conversational AI agent that interprets survey data, draws plats according to firm-defined templates, and accepts natural-language edits — while preserving full manual editability of every drawing element.
 
**Phase 1 (the foundation):** Build the CAD engine, template system, and AI drafting agent. The agent must produce *consistent* results every time, governed by tightly curated rules, templates, and validation layers — not by free-form image generation.
 
**Phase 2 (the field integration):** Integrate Trimble Access so field shots stream into the system and the AI drafts the plat as data arrives, with the drawing potentially complete moments after the final shot is recorded.
 
The guiding principle throughout: **the AI is a drafter, not the surveyor.** The licensed surveyor (RPLS) reviews, edits, and seals every plat. The AI's job is to produce a near-final draft that requires minimal cleanup.
 
---
 
## 2. Project Goals & Success Criteria
 
### 2.1 Primary Goals
 
1. Reduce time from field data collection to draft plat from hours/days to minutes.
2. Standardize Starr Surveying's plat output so every drawing reflects the firm's drafting standards regardless of who drafted it.
3. Make every element of a generated plat individually editable using familiar CAD operations.
4. Enable conversational refinement ("move the call-out 5 feet north," "add a curve table for the cul-de-sac").
5. Support real-time drafting as field shots come in (Phase 2).
### 2.2 Non-Goals (At Least For Now)
 
- Replacing the surveyor's professional judgment.
- Producing sealed final plats without RPLS review.
- Full feature parity with AutoCAD or Civil 3D — focus is on plats specifically, not general civil drafting.
- Cadastral GIS workflows (separate problem space).
### 2.3 Success Criteria
 
- A coded CSV of survey points produces a draft plat that is **>90% correct** before any human editing.
- Every entity on the drawing is selectable, editable, and re-styleable.
- The AI agent responds to natural-language edit requests with the correct CAD operation **>95% of the time**.
- Output DXF opens cleanly in AutoCAD, Carlson, and Civil 3D.
- Generated plats meet Texas TBPELS recording requirements out of the box.
---
 
## 3. System Architecture (High-Level)
 
```
┌────────────────────────────────────────────────────────────┐
│                    WEB FRONTEND (Browser)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  CAD Canvas  │  │  Chat Panel  │  │  Properties  │      │
│  │  (SVG/Canvas)│  │  (AI Agent)  │  │  Inspector   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼─────────────────┼─────────────────┼───────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌────────────────────────────────────────────────────────────┐
│                       BACKEND API                           │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  Scene Graph     │  │   AI Orchestrator│                │
│  │  Engine (state)  │◄─┤   (Tool calls)   │                │
│  └──────┬───────────┘  └──────────────────┘                │
│         │                                                   │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Validation & │  │  Template &  │  │  Auto-Draft  │     │
│  │ Rules Engine │  │  Style Store │  │  Engine      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  CSV/JobXML  │  │  DXF/PDF     │  │  Persistence │     │
│  │  Importer    │  │  Exporter    │  │  (DB/Files)  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                          │
                  ┌───────▼────────┐
                  │  PHASE 2 ONLY  │
                  │  Trimble Sync  │
                  │  (Hot folder / │
                  │  Connect API)  │
                  └────────────────┘
```
 
### 3.1 Architectural Principles
 
- **The AI never draws pixels.** It only emits structured tool calls that mutate the scene graph. The renderer is fully deterministic.
- **Single source of truth:** The scene graph is the authoritative drawing state. Frontend, backend, AI agent, and exporters all read from / write to it.
- **Templates are constraints, not suggestions.** The AI cannot deviate from template-defined styles unless the user explicitly overrides.
- **Every operation is undoable** via a command pattern — whether the operation came from the user clicking a button or the AI calling a tool.
---
 
# PHASE 1 — CORE CAD ENGINE + AI DRAFTING AGENT
 
This is the bulk of the project. Until this is solid, Phase 2 is irrelevant.
 
## 4. The Scene Graph (Core Data Model)
 
Every drawing is a structured tree of entities. This is *the* most important architectural decision in the project.
 
### 4.1 Entity Schema (Conceptual)
 
```json
{
  "id": "ent_a1b2c3",
  "type": "polyline",
  "layer": "BOUNDARY",
  "geometry": {
    "vertices": [[x1,y1], [x2,y2], ...],
    "closed": true
  },
  "style": {
    "inherits": "boundary_line",
    "overrides": { "color": "#BD1218" }
  },
  "metadata": {
    "created_by": "ai_agent",
    "source_points": ["pt_001", "pt_002", "pt_003"],
    "feature_code": "BL"
  },
  "locked": false,
  "visible": true
}
```
 
### 4.2 Entity Types (Minimum Set)
 
- **Point** (with symbol reference, label, elevation)
- **Line** (two endpoints)
- **Polyline** (open or closed)
- **Arc / Curve** (3-point, center+radius+sweep, or PI-based)
- **Circle**
- **Text** (with anchor, rotation, style)
- **MText** (multi-line)
- **Block / Symbol** (reusable: monuments, fence symbols, north arrow, title block)
- **Dimension** (linear, angular, radial)
- **Leader / Callout**
- **Hatch** (for water bodies, ROW shading, etc.)
- **Table** (point table, leg table, curve table)
- **Image / Raster** (aerial backgrounds, scanned references)
### 4.3 Layers
 
Layers are central to surveying CAD. Standard Starr Surveying layers (define once, reuse forever):
 
- `BOUNDARY` — property lines
- `EXISTING_BOUNDARY` — adjoining property
- `EASEMENT`
- `ROW` (right of way)
- `MONUMENTS_FOUND` / `MONUMENTS_SET`
- `TOPO_POINTS`
- `CONTOURS_MAJOR` / `CONTOURS_MINOR`
- `STRUCTURES`
- `UTILITIES_OVERHEAD` / `UTILITIES_UNDERGROUND`
- `VEGETATION`
- `WATER_FEATURES`
- `ANNOTATION_BEARINGS` / `ANNOTATION_DISTANCES` / `ANNOTATION_GENERAL`
- `TITLE_BLOCK` / `BORDER`
- `TABLES`
- `NORTH_ARROW`
- `SCALE_BAR`
- `NOTES`
Each layer has default style, default color, default lineweight, plot/no-plot, locked/unlocked.
 
### 4.4 Coordinate System Handling
 
- Drawings store coordinates in their **state plane / project coordinate system** (e.g., NAD83 Texas Central, ftUS).
- All display, snapping, and export happens in that native CS.
- Imports from other systems are reprojected on entry.
- The drawing carries CRS metadata so future imports auto-align.
---
 
## 5. Template System
 
This is the lever that gives Starr Surveying consistency across every plat.
 
### 5.1 Template Hierarchy
 
1. **Firm-wide template** (Starr Surveying baseline — Hank's standards)
2. **Job-type templates** (boundary survey, topographic survey, ALTA, subdivision plat, etc.)
3. **Project-specific overrides** (this client wants something different)
4. **Per-drawing tweaks**
Higher levels cascade; lower levels override. Like CSS.
 
### 5.2 What's in a Template
 
**Sheet Setup**
- Paper size (24×36, 22×34, 11×17, etc.)
- Orientation (landscape/portrait)
- Margins
- Border style
- Title block design (using Starr Surveying brand: Red `#BD1218`, Blue `#1D3095`, Sora/Inter fonts)
**Line Types & Weights**
- Boundary: solid, 0.50mm, red
- Existing boundary: dashed, 0.35mm, gray
- Easement: dash-dot, 0.25mm, blue
- ROW: long-dash, 0.40mm, blue
- Centerline: dash-dot-dot, 0.25mm
- Contours major/minor
- Fence types (woven wire, barbed, chain link — each with custom linetype)
- Each line type has a **linetype definition** (DXF-compatible) and a default lineweight
**Point Symbols**
- Monument found: open circle with cross, 0.10" diameter
- Monument set: filled circle, 0.08" diameter
- Iron rod found / set: distinct symbols
- Control points: triangle
- Topographic shots: small dot or "+"
- Each tied to a feature code
**Text Styles**
- Bearing/distance labels (font, height, decimal places)
- Point labels (point #, elevation, description)
- General notes
- Title block text
- Section headers
- All text scales appropriately to drawing scale
**Table Styles**
- Point table (Point #, Northing, Easting, Elev, Description)
- Leg table (From, To, Bearing, Distance)
- Curve table (Curve #, Length, Radius, Delta, Tangent, Chord, Chord Bearing)
- Header style, row alternation, border weight, font
**North Arrow & Scale Bar**
- Multiple arrow styles (Starr Surveying standard arrow)
- Scale bar style and placement defaults
**Title Block / Info Block**
- Firm name and logo
- RPLS info (Hank Maddux, RPLS #6706)
- Job number, date, scale, sheet number
- Client info field
- Legal description placeholder
- Revision block
**Surveyor Notes Block**
- Boilerplate notes (basis of bearing, datum, equipment used, etc.)
- Standard certification language
**Default Drawing Behaviors**
- Decimal precision for distances (0.01 ft typical)
- Bearing format (N00°00'00"E)
- Label offset distances from lines
- Text orientation rules (always upright readable, never upside down)
- Default scale (1"=20', 1"=50', 1"=100')
### 5.3 Texas-Specific Requirements (Encoded as Template Rules)
 
- Required legend elements
- Required surveyor's certification language
- Required notes (FEMA flood zone, datum statement, basis of bearing)
- Recording requirements per county (Bell County, Coryell, Williamson, etc.)
- TBPELS plat content rules
These should be **validation rules** the system checks before allowing export.
 
### 5.4 Template Storage Format
 
YAML or JSON. Version-controlled. Editable through a template editor UI (eventually) but initially edited by hand.
 
---
 
## 6. CAD Tool Functionality
 
The drawing canvas needs to behave like CAD, not like Illustrator. The user must trust they can fix anything the AI gets wrong.
 
### 6.1 Drawing Primitives (Manual Tools)
 
- Point placement (with snap)
- Line / polyline drawing
- Arc creation (3-point, center-start-end, tangent-tangent-radius)
- Rectangle, circle
- Text placement
- Block insertion
- Dimension placement
- Hatch placement
### 6.2 Editing Operations
 
- Move, rotate, scale, copy, mirror, array
- Trim, extend, offset, fillet, chamfer
- Stretch (grip-based)
- Break
- Join
- Explode (block → primitives)
- Group / ungroup
- Match properties
- Property editor (change layer, color, linetype, lineweight per entity)
### 6.3 Selection & Inspection
 
- Click to select
- Box select (window / crossing)
- Lasso select
- Filter by layer / type / property
- Properties panel shows all attributes of selected entity
- Multi-select editing
### 6.4 Snap System (Critical for Surveying)
 
- Endpoint, midpoint, intersection, perpendicular, tangent, center, quadrant, nearest
- Object snap tracking
- Polar tracking
- Grid snap
- "Apparent intersection"
- All snaps configurable, per-tool overrides
### 6.5 View Controls
 
- Pan, zoom (mouse wheel, keyboard shortcuts matching AutoCAD where possible)
- Zoom extents, zoom window, zoom previous
- Multiple viewports (eventually — for inset maps, vicinity maps)
- Layout / paper space vs model space
### 6.6 Undo / Redo
 
- Unlimited undo within a session
- Every AI tool call = one undoable operation
- Persisted command history per drawing
---
 
## 7. AI Agent Design — The Heart of Consistency
 
This section is the answer to your concern about getting consistent results every time. Consistency does **not** come from a smart prompt. It comes from a tightly bounded tool surface, a strict rules engine, and a validation layer.
 
### 7.1 The Core Insight
 
The AI does not "draw." The AI emits structured tool calls. The drawing is produced by deterministic code. So:
 
- **Templates determine 90% of styling decisions** before the AI even sees the request.
- **Tool signatures constrain what the AI can do** — it can't invent a new line type on the fly.
- **A validation layer reviews every AI action** before it commits to the scene graph.
- **A rules engine enforces drafting standards** the AI cannot override.
The AI's degrees of freedom should be deliberately small. That's where consistency comes from.
 
### 7.2 Tool Surface (What the AI Can Call)
 
Each tool is a function with strict parameter validation. The AI cannot pass arbitrary styling — it references named styles from the active template.
 
**Geometry creation:**
- `add_point(northing, easting, elevation, description, feature_code, point_number)`
- `add_line(start_point_id, end_point_id, layer, style_name)`
- `add_polyline(point_ids[], closed, layer, style_name)`
- `add_arc_3point(p1, p2, p3, layer, style_name)`
- `add_arc_radius_chord(start, end, radius, direction, layer, style_name)`
- `add_curve_from_field_data(start, pc, pt, radius, delta, ...)`
- `add_text(content, anchor_point, style_name, rotation)`
- `add_block(block_name, insertion_point, rotation, scale)`
**Annotation:**
- `label_line_bearing_distance(line_id, position, style_name)`
- `add_dimension(type, points, style_name)`
- `add_callout(target_id, leader_text, position)`
**Tables:**
- `add_point_table(point_ids[], position, style_name)`
- `add_leg_table(line_ids[], position, style_name)`
- `add_curve_table(arc_ids[], position, style_name)`
**Layout:**
- `place_title_block()`
- `place_north_arrow(position)`
- `place_scale_bar(position)`
- `set_drawing_scale(scale)`
- `add_notes_block(notes_template_name, position)`
**Auto-draft:**
- `auto_draft_from_points(point_set, drawing_type)` — the big one. Calls the auto-draft engine.
**Editing:**
- `modify_entity(entity_id, property, new_value)`
- `move_entity(entity_id, dx, dy)`
- `delete_entity(entity_id)`
- `change_layer(entity_id, layer_name)`
**Query (so AI can answer questions about the drawing):**
- `list_entities(filter)`
- `get_entity(entity_id)`
- `measure_distance(p1, p2)`
- `compute_traverse_closure(point_ids[])`
- `list_layers()`
- `summarize_drawing()`
### 7.3 The Rules Engine
 
A separate module the AI consults but cannot override. Rules cover:
 
**Drafting Standards Rules**
- Bearing/distance labels go above the line for E-W lines, to the right for N-S lines.
- Text never upside down — flip if angle is between 90° and 270°.
- Labels offset from line by a fixed multiple of text height.
- Curve labels always go on the concave side.
- Point labels offset NE of point unless conflicting with another label.
- Boundary line takes visual priority — other lines yield label position.
**Layer Assignment Rules**
- Feature code `BL` (boundary line) → `BOUNDARY` layer, boundary line style.
- Feature code `FH` (fire hydrant) → `UTILITIES` layer, hydrant block.
- A feature-code-to-layer-and-symbol map is the heart of auto-drafting.
**Naming & Numbering Rules**
- Curve labels: C1, C2, C3...
- Line labels in legs: L1, L2, L3...
- Point numbering follows source data.
**Template Compliance Rules**
- Every plat must have title block, north arrow, scale bar, notes block, surveyor certification.
- Required notes per drawing type.
- Required tables for ALTA vs boundary vs subdivision.
**Texas / TBPELS Rules**
- Bearings reference basis of bearing on every plat.
- Datum statement required.
- RPLS seal area reserved.
- County recording requirements.
### 7.4 The Validation Layer
 
After every AI tool call, before commit:
 
1. **Schema validation** — does the call match the function signature?
2. **Reference validation** — do referenced entity IDs and style names exist?
3. **Geometric validation** — is the operation geometrically sensible? (e.g., not creating self-intersecting boundaries silently)
4. **Rule validation** — does the result violate any rule in the rules engine?
5. **Template compliance** — does the styling match the active template?
Failures return structured error messages back to the AI ("Style name `boundary_thicc` not found in template; valid options are: `boundary_line`, `boundary_existing`..."). The AI retries with a corrected call. This creates a self-correcting loop.
 
### 7.5 System Prompt Strategy
 
The system prompt should be **short and stable**, not a sprawling rule list. Most rules live in the tools and rules engine, not the prompt. The prompt covers:
 
- Role: "You are a drafting agent for Starr Surveying. You produce plat drawings using the provided tools."
- Workflow: "Always begin a new plat by calling `place_title_block()`, `place_north_arrow()`, `place_scale_bar()`. Use `auto_draft_from_points()` for bulk linework. Add tables last."
- Clarification protocol: "If feature codes are ambiguous or template choice is unclear, ask the user before drafting."
- Conservative behavior: "Prefer asking over guessing for legally significant elements (boundary, easements, basis of bearing)."
Keep this under 1000 tokens. The tools and rules do the heavy lifting.
 
### 7.6 Conversation Memory
 
The AI's context for every turn includes:
 
- Active template
- Current scene graph summary (entity counts by type/layer, not full geometry)
- Recent action history (last N tool calls)
- Outstanding clarifications
- The user's chat message
When the user says "move that label," the AI uses recent context to infer "that." When ambiguous, it asks.
 
### 7.7 Clarification Protocol
 
The AI is expected to ask clarifying questions when:
 
- Feature codes are missing or non-standard.
- Multiple plausible interpretations of point connectivity exist.
- Curve definitions are ambiguous (3 points could be collinear or arc).
- Boundary closure exceeds tolerance — does the user want it adjusted, or is there a data issue?
- Required template fields aren't filled (job number, client name, scale).
### 7.8 What the AI Will *Not* Do (Hard Limits)
 
- Modify locked entities.
- Delete entities tagged as "approved" by the user.
- Change template-defined styles.
- Generate or modify the surveyor's certification language or seal area.
- Change point coordinates without explicit confirmation.
- Auto-adjust a traverse without user approval.
---
 
## 8. Auto-Drafting Engine (Point Set → Plat)
 
This is the second-hardest part of the project (after Trimble streaming). It's where coded survey points become linework.
 
### 8.1 Required Input Quality
 
Auto-drafting only works if field data is **coded consistently**. Starr Surveying needs a defined feature code library. Without it, no AI will reliably guess linework. Recommended: build the feature code library first as a separate deliverable, then auto-drafting follows naturally.
 
### 8.2 The Feature Code Library
 
A controlled vocabulary. Examples (Starr Surveying will define the canonical list):
 
| Code | Meaning | Layer | Symbol/Style |
|------|---------|-------|--------------|
| `IRF` | Iron rod found | MONUMENTS_FOUND | Open circle |
| `IRS` | Iron rod set | MONUMENTS_SET | Filled circle |
| `BL`/`EL` | Begin/end line (boundary) | BOUNDARY | Solid line |
| `BC`/`EC` | Begin/end curve | BOUNDARY | Arc |
| `FH` | Fire hydrant | UTILITIES | Hydrant block |
| `PP` | Power pole | UTILITIES | Pole block |
| `EP` | Edge of pavement | TOPO | Solid line |
| `FC` | Fence | STRUCTURES | Fence linetype |
| `TBM` | Temporary benchmark | CONTROL | Triangle |
| `TR` | Tree | VEGETATION | Tree block |
| ... | ... | ... | ... |
 
Plus modifiers: `BL1`, `BL2` for multiple simultaneous lines; `CURVE` modifier with PI/PC/PT designations.
 
### 8.3 Auto-Draft Algorithm
 
1. **Parse points** — assign each to a feature category based on code.
2. **Group connectible points** — same line code, ordered by point number or time.
3. **Detect curves** — by code (`BC`/`PC`/`PT`/`EC`) or by 3-point collinearity test.
4. **Generate linework** — polylines for connected sequences, arcs for curve segments.
5. **Place point symbols** — via feature-code-to-symbol map.
6. **Label points** — point number, elevation, description per template.
7. **Compute traverse** — if boundary code, calculate closure; flag if outside tolerance.
8. **Generate bearing/distance labels** — for boundary lines per template rules.
9. **Identify candidate tables** — boundary legs → leg table; arcs → curve table.
10. **Place layout elements** — title block, north arrow, scale bar.
11. **Run validation pass** — flag any rule violations for user review.
12. **Return draft + report** — show what was done, what needs review.
### 8.4 Edge Cases to Handle
 
- Crossing lines (which is on top?)
- Overlapping labels (auto-shift or flag?)
- Parcels that don't close (alert user, do not silently fudge)
- Missing curve data (fall back to chord, flag for review)
- Points with multiple codes
- Mistyped codes (fuzzy match? or strict and flag?)
---
 
## 9. CSV / Data Ingestion
 
### 9.1 Supported Formats
 
- **CSV** — point number, northing, easting, elevation, description (PNEZD or variants)
- **TXT** — same with various delimiters
- **JobXML** (Trimble) — for Phase 2 integration
- **LandXML** — industry standard
- **Shapefile** — for parcel/legacy data
- **Coordinate input** — direct entry of single points or batches in chat
### 9.2 Field Mapping Wizard
 
On import, user maps source columns to schema fields. Saved mappings per source / per crew. Auto-detect for common formats.
 
### 9.3 Validation on Import
 
- Coordinate sanity check (within state plane bounds)
- Duplicate point numbers
- Missing elevations on topo points
- Unknown feature codes (flag for user — add to library or correct)
---
 
## 10. Output & Export
 
### 10.1 DXF Export (Primary)
 
- AutoCAD-compatible (DXF version 2018+)
- Layers preserved with correct colors / linetypes / weights
- Blocks preserved
- Text styles and dim styles defined
- Tested compatibility with AutoCAD, Carlson Survey, Civil 3D, Bricscad, Traverse PC
- `ezdxf` Python library handles this well
### 10.2 PDF Export (Plotting)
 
- Vector PDF
- Plotted to template paper size
- Lineweights honored
- Multi-sheet if drawing exceeds one page
- Embedded drawing metadata
### 10.3 SVG / PNG (Sharing)
 
- For email previews, web embeds
- Watermarked "DRAFT — NOT SEALED" until certified
### 10.4 Project Bundle
 
- Zip of: native drawing file, source CSV, template used, generation log, DXF, PDF
- For archival and audit
---
 
## 11. Quality, Testing & Consistency Validation
 
### 11.1 Test Survey Library
 
Build a library of representative coded surveys:
 
- Simple boundary (4 corners, no curves)
- Boundary with curves (cul-de-sac, easements)
- Topographic survey (heavy point density, mixed features)
- ALTA survey (full feature set, easements, exceptions)
- Subdivision plat (multiple lots)
- Edge cases (non-closing traverse, missing codes, etc.)
Each test produces a "golden" output. Regression-test the AI/engine against these. Any change to rules, templates, or AI behavior runs the suite.
 
### 11.2 Visual Regression Testing
 
Render each test plat to PNG. Diff against golden image. Flag any visual change for human review. Catches subtle styling drift.
 
### 11.3 Consistency Metrics
 
Run the same input through the AI 10 times. Measure:
- Are outputs byte-identical (after reseed)? They should be, given deterministic tools.
- Are tool call sequences identical? Mostly yes — variation only in cosmetic ordering.
- Do final scene graphs match? Yes, modulo entity IDs.
If outputs vary on identical input, that's a bug — too much creative latitude in the AI's prompt or tool surface.
 
---
 
## 12. Recommended Tech Stack
 
This is a recommendation, not a mandate. Choose what your team can maintain.
 
**Frontend**
- React or Svelte
- Konva.js or Fabric.js for canvas (or build directly on SVG for simpler editability)
- Tailwind for UI chrome
**Backend**
- Python (you already use it)
- FastAPI for API
- `ezdxf` for DXF
- `shapely` for geometry
- `pyproj` for projections
- `reportlab` for PDF (you've already mastered this)
- PostgreSQL for project/drawing storage; PostGIS if you want spatial queries
**AI Layer**
- Anthropic Claude API (function calling / tool use)
- Use Sonnet for cost / latency on routine drafting; reserve Opus for complex reasoning or troubleshooting flows
- Structured outputs with strict tool schemas
**Infra (Eventually)**
- Docker
- Cloud hosting (AWS/GCP) for shared use across Starr Surveying
- Object storage for drawing bundles
---
 
## 13. Development Roadmap — Phase 1
 
Time estimates assume one focused developer. Adjust for actual capacity.
 
### Milestone 1: Foundations (Weeks 1–4)
- Set up monorepo, basic frontend / backend skeletons.
- Define and implement the scene graph data model.
- Build basic SVG rendering of points and lines.
- Implement undo/redo command pattern.
- Persist drawings (JSON file or DB).
### Milestone 2: Manual CAD Tools (Weeks 5–10)
- Implement drawing primitives (point, line, polyline, arc, text).
- Implement core editing (move, copy, rotate, delete).
- Build snap system.
- Layers panel.
- Properties inspector.
- Pan/zoom/select.
- Save/load drawings.
### Milestone 3: Templates & Styles (Weeks 11–14)
- Template schema and storage.
- Style cascade (firm → job-type → project → drawing).
- Build the Starr Surveying baseline template (boundary, topo, ALTA variants).
- Title block, north arrow, scale bar, notes block as templated blocks.
- Texas/TBPELS rule compliance checker.
### Milestone 4: Import & Export (Weeks 15–17)
- CSV / PNEZD importer with field mapping.
- Validation pass on import.
- DXF export with full styling fidelity.
- PDF export to paper sizes.
- Test against AutoCAD, Carlson, Civil 3D, Traverse PC roundtrip.
### Milestone 5: Feature Code Library (Weeks 18–19)
- Define Starr Surveying canonical feature code list (with Hank's input).
- Build the code-to-style/layer/symbol mapping store.
- Editor UI for the library.
### Milestone 6: Auto-Draft Engine (Weeks 20–24)
- Point grouping and linework generation.
- Curve detection.
- Symbol placement.
- Label placement with collision detection.
- Traverse closure computation.
- Table generation (point, leg, curve).
- Build the test survey library and golden outputs.
### Milestone 7: AI Agent Integration (Weeks 25–30)
- Define and implement the tool surface.
- Build the rules engine.
- Build the validation layer.
- Wire up Claude with tool use.
- Conversation UI alongside drawing canvas.
- Implement clarification protocol.
- Iterate on system prompt and rule coverage.
- Run consistency metrics suite.
### Milestone 8: Polish & Internal Beta (Weeks 31–34)
- Use the system on real Starr Surveying jobs in parallel with existing workflow.
- Capture every divergence between AI output and final drafted plat.
- Convert each into a rule, template fix, or AI prompt refinement.
- Stabilize.
**Total Phase 1: ~8 months for a solid, internally usable system.**
 
---
 
# PHASE 2 — TRIMBLE ACCESS INTEGRATION & REAL-TIME STREAMING
 
Phase 2 starts only after Phase 1 is in routine internal use. Don't try to build it in parallel — you'll spread thin and ship neither.
 
## 14. Phase 2 Goals
 
- Field crew shoots a point on the TSC3 (or successor) → that point appears on the office plat within seconds.
- The AI updates linework, labels, and tables incrementally as data arrives.
- By the time the crew finishes the survey, the plat is essentially drafted.
- Office staff can ask the AI questions about the in-progress survey and request preview edits even while shots are still coming in.
## 15. Integration Approaches (Ranked by Practicality)
 
### 15.1 Hot-Folder Sync via Trimble Connect (Most Practical)
 
- Field crew configures Trimble Access to sync the job to Trimble Connect on a frequent schedule (or on every measurement, where supported).
- Backend service polls Trimble Connect via its API for changes to the synced job file.
- Parse incremental updates, push to scene graph, AI re-evaluates.
- **Latency:** seconds to a couple of minutes depending on sync frequency.
- **Pros:** uses Trimble's supported infrastructure; no custom firmware.
- **Cons:** not truly instant; depends on Trimble Connect's behavior.
### 15.2 Local Network File Share
 
- Field crew operates on a network connection (cellular hotspot to office VPN, or onsite WiFi).
- Trimble Access writes job files to a network share.
- Backend file-watches the share.
- **Latency:** near-instant when the file is written.
- **Pros:** simple, no API dependency.
- **Cons:** requires network connectivity in the field; brittle to dropouts.
### 15.3 Trimble Developer APIs / SDK
 
- Investigate Trimble API Platform and Trimble Connect API for any "data pushed on capture" mechanism.
- May require partnership conversation with Trimble.
- **This needs verification with Trimble directly** — current state of available APIs is the determining factor.
### 15.4 Custom Trimble Access Plugin
 
- Trimble Access supports custom apps / extensions in some versions.
- Could write a plugin that pushes each measurement to a webhook.
- **Latency:** truly real-time.
- **Cons:** plugin development overhead; tied to Trimble Access version compatibility.
**Recommended path:** Build for 15.1 and 15.2 first (works today, no external dependency). Pursue 15.3/15.4 in parallel if Trimble is willing.
 
## 16. Streaming Pipeline Architecture
 
```
   Trimble Access (Field)
          │
          │ (sync / file write / API push)
          ▼
   Ingestion Service
          │
          │ Parses delta: new points, modified points, deleted points
          ▼
   Change Reconciler
          │  - Validates feature codes
          │  - Detects "this point completes a line" / "begins a curve"
          │  - Decides: append-only or rebuild-affected-region?
          ▼
   Scene Graph (incremental update)
          │
          │ Broadcast change events
          ▼
   Frontend (live update)  +  AI Agent (re-evaluate)
```
 
### 16.1 Incremental Drafting Strategy
 
When a new point arrives:
 
- **If the point continues an active line** (same code, sequential): extend the polyline.
- **If the point closes a line** (`EL` code): finalize the polyline, place labels, update leg table.
- **If the point completes a curve definition** (3 points with curve codes): compute the arc and place it.
- **If the point is a standalone feature** (FH, PP, etc.): place symbol immediately.
- **If the point is the final boundary point closing the traverse**: run closure check, alert if out of tolerance.
The AI is NOT called on every individual point — that would be expensive and slow. Instead:
- A deterministic incremental drafter handles routine point-by-point updates.
- The AI is called for milestone events: "boundary closed," "topo block complete," "ready for final review."
- The AI is also called on user request at any time.
## 17. Conflict & Re-Shoot Handling
 
Field crews re-shoot points. Handle gracefully:
 
- Re-measured point with same point number → update geometry, propagate to all dependent linework.
- Deleted point → remove from drawing, redraw affected lines, alert user.
- Code change on existing point → reclassify, redraw.
- Show a "field changes" log so office knows what's happening.
## 18. UI for Live Mode
 
- "Live survey active" indicator.
- Auto-pan/zoom to follow new points (toggleable).
- Recent points highlighted briefly.
- Office user can pause auto-drafting at any time without disconnecting from the stream.
- Office can chat with the AI about the in-progress survey: "Does the boundary look like it's going to close?" "What's the area so far?"
## 19. Phase 2 Roadmap (After Phase 1 Stable)
 
### Milestone 9: Trimble Connect Polling (Weeks 1–4 of Phase 2)
- API integration.
- Job sync detection.
- Delta parser.
### Milestone 10: Incremental Scene Graph Updates (Weeks 5–8)
- Change reconciler.
- Live broadcast (WebSocket) to frontend.
- Live UI mode.
### Milestone 11: Incremental Drafter (Weeks 9–12)
- Deterministic point-by-point updates.
- Milestone-event AI triggers.
### Milestone 12: Field Test (Weeks 13–16)
- Run live with actual field crews.
- Tune sync intervals, latency, edge cases.
- Build out conflict / re-shoot handling.
**Total Phase 2: ~4 months once Phase 1 is stable.**
 
---
 
## 20. Cross-Cutting Concerns
 
### 20.1 Legal & Professional
 
- Every plat must clearly indicate AI-assisted draft status until reviewed and sealed by the RPLS.
- Audit trail: who/what created each entity, when, on what input.
- The RPLS (Hank) signs off on the final, period.
- Consult TBPELS guidance on AI-assisted drafting — emerging area.
### 20.2 Data Security
 
- Survey data is client-confidential.
- If hosted in cloud, encryption at rest and in transit.
- Access control per user.
- Backups.
- Eventually: client portal for delivery, with download logs.
### 20.3 Backup & Versioning
 
- Every drawing change is a version.
- Periodic snapshots stored.
- Easy "revert to before AI edited this" function.
### 20.4 Multi-User (Future)
 
- Eventually multiple Starr Surveying drafters working in parallel.
- Drawing locking or operational transform.
- Worth deferring until single-user is solid.
### 20.5 Commercial Licensing (Future)
 
- If this becomes a product Starr could sell to other firms, plan for:
  - Per-firm template isolation.
  - Per-firm feature code libraries.
  - Branding customization.
  - SaaS pricing model.
- Don't architect for this on day one, but don't paint into a corner that prevents it later.
---
 
## 21. Risks & Open Questions
 
### 21.1 Technical Risks
 
- **AI inconsistency** — mitigated by the rules engine + validation layer + tight tool surface, but needs continuous monitoring via the consistency metrics suite.
- **DXF roundtrip fidelity** — AutoCAD interprets some DXF edge cases differently than the spec. Test early and often.
- **Trimble integration uncertainty** — Phase 2 hinges on what Trimble actually exposes. Verify before committing.
- **Curve handling edge cases** — surveying curves are notoriously tricky. Budget extra time.
- **Performance with large drawings** — topo surveys can have 5,000+ points. Profile early; SVG may not scale, may need WebGL.
### 21.2 Process Risks
 
- **Scope creep** — easy to expand into "full CAD replacement." Don't. Stay plat-focused.
- **Feature code adoption** — auto-drafting only works if field crews code consistently. This is a *people and training* problem as much as a technical one.
- **Hank's drafting standards as tribal knowledge** — encoding them into templates is a significant interview/documentation effort.
### 21.3 Open Questions to Resolve Before Building
 
- Web-based or desktop app? (Recommend web — easier to iterate, update, share.)
- Hosted vs on-premise? (Initially local; later hosted for streaming.)
- Buy-vs-build for the CAD canvas? (Some commercial web CAD libraries exist — evaluate before building from scratch.)
- Single drafting AI or specialized agents (drafter / reviewer / responder)?
- Does Hank want to be involved in template design, or hand it off entirely?
---
 
## 22. Immediate Next Steps
 
Before any code is written:
 
1. **Document Starr Surveying's current drafting standards** — interview Hank, collect example plats, photograph current templates, define what "good" looks like.
2. **Define the canonical feature code library** — this is the single highest-leverage decision in the project. Without it, Phase 1 auto-drafting is dead in the water.
3. **Pick 5 representative past Starr Surveying jobs** — these become your test corpus and golden outputs.
4. **Decide on tech stack** — confirm Python backend, pick frontend framework, decide on database.
5. **Choose an MVP scope** — recommend: boundary surveys only, with manual point entry and CSV import (defer topo, ALTA, subdivisions to later).
6. **Set up the project repo, CI, and basic infra.**
7. **Begin Milestone 1.**
---
 
## 23. Summary of the Two Phases
 
| Aspect | Phase 1 | Phase 2 |
|--------|---------|---------|
| **Focus** | CAD engine + AI drafter + templates | Trimble Access live integration |
| **Input** | CSV, manual point entry, conversation | Live shot stream from field |
| **Duration** | ~8 months | ~4 months (after P1 stable) |
| **Risk Level** | Moderate (mostly known tech) | High (depends on Trimble) |
| **Critical Dependency** | Feature code library; Hank's standards | Phase 1 stability; Trimble API access |
| **Deliverable** | Drafting tool used internally at Starr | Live drafting during fieldwork |
 
---
 
## 24. Final Notes
 
The fastest way to ship a working v1 is to deliberately scope down: **boundary surveys, CSV input, one template (Starr Surveying standard boundary plat), AI drafting, DXF export, manual edit.** Get *that* working end-to-end, dogfood it on real jobs, and build outward from there. Every additional feature added before the core is solid extends the timeline disproportionately.
 
The AI consistency problem is solvable, but only by accepting that **the AI's job is small and bounded**. Templates, rules, and validation do the heavy lifting. The AI is the natural-language interface and the auto-drafter — not the source of styling decisions. Any time the AI feels like it has "too much creative freedom," that's a signal to push more constraint into the template, the rules engine, or the tool signatures.
 
Phase 2 is exciting but should not distract from Phase 1. A drafting tool that works perfectly on CSV input is enormously valuable on its own. A half-working drafting tool with half-working live streaming is valuable to nobody.