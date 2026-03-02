# STARR CAD — 7-Phase Implementation Roadmap

**Version:** 1.0 | **Date:** March 2026 | **Company:** Starr Surveying Company, Belton, TX

**Purpose:** This document defines the 7 development phases for Starr CAD. Each phase has its own standalone implementation spec. Phases are sequential — each builds on the previous. Work on a phase only after the prior phase's deliverables are complete and tested.

---

## Phase Dependencies

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6 ──→ Phase 7
Engine       Data In     Styling     Geometry    Labels/     AI Engine    Export &
Core         & Codes     & Editors   Tools       Templates                Polish
```

---

## Phase 1: Project Foundation & CAD Engine Core

**Goal:** A functional 2D drawing canvas where you can pan, zoom, place points, draw lines/polylines, select things, undo/redo, and save/load files. No survey-specific features yet — just a solid CAD foundation.

**Key Deliverables:**

- Monorepo scaffolding (Next.js + TypeScript + Turborepo)
- PixiJS rendering engine with pan/zoom viewport
- Coordinate system (survey Y-up internally, screen Y-down for rendering)
- Basic geometry primitives: point, line, polyline, polygon
- Selection system (click, box select, shift-add, crossing vs window)
- Grip editing (drag vertices of selected features)
- Undo/redo (unlimited, with compound operations)
- Snap system (endpoint, midpoint, intersection, nearest, grid)
- Basic layer system (create, rename, toggle visibility, set active, delete)
- Command bar (type commands + coordinates)
- Zustand state management (drawing, selection, tools, UI, undo stores)
- Native .starr file format (gzipped JSON, save/load)
- Keyboard shortcuts (pan, zoom, escape, delete, undo/redo)
- Grid rendering (major/minor, auto-scale with zoom)
- Status bar (cursor coordinates, active layer, scale display)

**NOT in Phase 1:** Point codes, symbols, line types, CSV import, curves, splines, AI, templates, DXF export, printing.

**Estimated Duration:** 6-8 weeks

**Spec File:** `STARR_CAD_PHASE_1_ENGINE_CORE.md`

---

## Phase 2: Data Import & Point Code System

**Goal:** Import field data (CSV, RW5, JobXML) and have every point automatically classified by its code. The dual-code system (alpha + numeric) is fully functional. Point names are parsed for fnd/set/calc suffixes with fuzzy matching and recalculation detection.

**Key Deliverables:**

- Master point code library (all 157+ codes with alpha/numeric mapping)
- Point code suffix parser (B/E/A/BA/EA/CA line-connection suffixes)
- Point name suffix intelligence (fnd/set/calc fuzzy matching, recalc detection like cald/cale/calf)
- Point grouping logic (group by base number, resolve calc vs set vs found, compute deltas)
- CSV/TXT import with configurable column mapper and saved presets
- RW5 (Carlson) format parser
- JobXML (Trimble) format parser
- Code display toggle (alpha <-> numeric)
- Auto-connect engine (B/E suffix -> line strings, auto-detect line vs point codes)
- Auto-spline designation (natural feature codes -> spline fit instead of straight)
- Point table panel (sortable, filterable table showing all imported points)
- Data validation (duplicate point numbers, zero coordinates, unrecognized codes)
- Simplified code collapse map (expanded -> base code for dad-mode export)

**Depends On:** Phase 1 (points rendered on canvas, selection works, undo works)

**Estimated Duration:** 4-6 weeks

**Spec File:** `STARR_CAD_PHASE_2_DATA_CODES.md` (to be built when Phase 1 is complete)

---

## Phase 3: Layer System, Symbols, Line Types & Editors

**Goal:** Full visual styling pipeline. Every point code maps to a specific symbol, line type, color, and layer. Users can create custom symbols and line types. The layer panel is feature-complete with all standard surveying layers pre-configured.

**Key Deliverables:**

- 22 default layers with auto-assignment from point codes
- Full layer panel UI (visibility, lock, freeze, color, weight, line type, drag-reorder, groups, solo, batch ops, filter/search)
- Style cascade system (feature override > code default > layer style > global fallback)
- Symbol library (all built-in survey symbols as SVG path data)
- Symbol renderer (render at any scale, rotation, color)
- Symbol editor UI (draw custom symbols with line/circle/arc/rectangle/text tools, set insertion point, assign to codes)
- Line type library (all built-in line types including 12 fence types with inline symbols)
- Line type renderer (dash patterns + inline symbols at scale-dependent intervals)
- Line type editor UI (visual dash pattern editor, add inline symbols, set intervals, assign to codes)
- Code-to-style mapping panel (master table: every code -> symbol, line type, color, layer, label format — all editable)
- Property panel (right sidebar: edit selected feature's style, layer, code, coordinates, properties)
- Monument action -> symbol resolution (found=solid/black, set=open/red, calc=target/magenta, driven by point name suffix OR expanded code)
- Global style settings (background, grid, fonts, bearing format, distance precision, snap settings)

**Depends On:** Phase 2 (codes assigned to points, line strings built)

**Estimated Duration:** 5-7 weeks

**Spec File:** `STARR_CAD_PHASE_3_STYLING_EDITORS.md`

---

## Phase 4: Geometry Tools — Curves, Splines, Offsets & Survey Math

**Goal:** Full curve and arc handling (the things that make survey drawings actually useful). Spline tools that work like Fusion 360's sketch environment. Offset engine for easements, setbacks, ROW lines. Core survey math (traverses, closure, area, legal descriptions).

**Key Deliverables:**

- Circular arc rendering (true arcs, not polyline approximations)
- Curve parameter calculator (any 2-3 inputs -> all outputs: R, Delta, L, C, CB, T, E, M, D)
- 7 curve input methods (R+Delta, R+L, R+C, 3-point, 2-point+tangent, full data block, 2 tangents+R)
- Curve data cross-validation (over-determined curves: check all params match within tolerance)
- Curb return / fillet tool (select two lines + radius, with presets for residential/commercial/cul-de-sac)
- Compound curves, reverse curves, spiral transitions (clothoid/Euler)
- Fit-point spline tool (Fusion 360 style: click to place, tangent handles, Alt+drag to break symmetry, curvature comb)
- Control-point spline tool (NURBS approximating spline)
- Spline-to-arc conversion (bi-arc fitting within tolerance for legal descriptions)
- Offset engine (parallel geometry at specified distance, for lines, arcs, polylines, splines, mixed geometry)
- Offset presets (utility easement, drainage easement, front/side/rear setback, ROW, curb face/gutter)
- Corner handling for offsets (miter, round, chamfer)
- Parametric offset links (offset updates when source changes, breakable)
- Mixed geometry features (straight + arc segments in one feature, from A/BA/EA suffixes)
- Traverse management (create, edit, reorder points in a traverse)
- Closure calculation (linear error, angular error, precision ratio)
- Bowditch (compass rule) adjustment
- Area computation (coordinate method, display sq ft + acres)
- Inverse calculation tool (bearing + distance between any two points)
- Forward point tool (place point at bearing + distance from existing point)
- Bearing/distance input (type bearings in DMS, distances in feet)

**Depends On:** Phase 3 (arcs rendered with correct styling, layers assigned)

**Estimated Duration:** 7-9 weeks

**Spec File:** `STARR_CAD_PHASE_4_GEOMETRY_TOOLS.md`

---

## Phase 5: Annotations, Dimensions, Templates & Print

**Goal:** Everything needed to produce a finished, printable survey drawing. Bearing/distance labels on every line, curve data on every arc, monument callouts, area labels, title block, north arrow, scale bar, legend, certification block, and a print/plot system.

**Key Deliverables:**

- Bearing/distance dimension tool (auto or manual placement on line segments)
- Curve data annotation (R, L, CB, C, Delta — auto-placed outside arc, follows curvature)
- Monument labels (auto-generated from code + point name: "5/8" IRF", "1/2" IRS w/Cap")
- Area annotations (sq ft + acres, auto-placed at polygon centroid)
- Text annotation tool (place/edit text anywhere on drawing)
- Leader annotation tool (arrow + text with bend points)
- Label optimization engine (collision detection, flip/slide/leader/shrink/stack strategies)
- Template system (paper size, orientation, margins, scale, title block layout)
- Default Starr Surveying template (Tabloid landscape, 1"=50')
- Title block configurator (company name, address, phone, license, logo, project info, date, sheet number)
- North arrow (multiple styles, draggable placement)
- Scale bar (graphical scale bar, auto-updates with drawing scale)
- Legend (auto-populated from features on drawing, or manually configured)
- Certification block (RPLS certification text, signature line, seal placeholder)
- Standard notes library (basis of bearings, datum, flood zone, disclaimer boilerplate)
- Print/plot system (paper size, scale, orientation, print area, plot style, PDF/PNG/printer output)
- Print preview (WYSIWYG, drag to reposition, red boundary showing printable area)

**Depends On:** Phase 4 (curves have data to label, traverses have closures to display)

**Estimated Duration:** 5-7 weeks

**Spec File:** `STARR_CAD_PHASE_5_ANNOTATIONS_TEMPLATES.md`

---

## Phase 6: AI Drawing Engine

**Goal:** Import a field file + provide a deed, and the AI produces a review-ready drawing with confidence scores on every element. Point groups (calc/set/found) are automatically resolved. The review queue lets you accept, modify, or reject each AI decision individually.

**Key Deliverables:**

- 6-stage AI pipeline (classify -> assemble -> reconcile -> place -> label -> score)
- Stage 1: Point classification (resolve codes, parse names, detect monument actions)
- Stage 2: Feature assembly (build line strings, fit arcs from A-suffixed sequences, fit splines from auto-spline codes, detect unclosed boundaries)
- Stage 3: Deed/record reconciliation (parse legal descriptions, trace record boundary, compare field vs record bearing/distance per call, flag discrepancies)
- Stage 4: Intelligent placement (auto-select paper/scale/orientation, auto-label all features)
- Stage 5: Label optimization (collision-free label placement using simulated annealing)
- Stage 6: Confidence scoring (5-tier system, per-element scoring with 6 weighted factors)
- Point group intelligence (group calc/set/found by base number, resolve final point, compute deltas, report to review queue)
- Calc-set-found relationship display (show all positions for a monument, highlight which was used, show delta distances)
- AI review queue UI (tier-grouped list, click to zoom, accept/modify/reject per element, batch accept by tier)
- AI prompt input (free-text instructions to guide the AI's decisions)
- Claude API integration via DigitalOcean worker (unlimited processing time)
- Deed PDF/image import for AI extraction (OCR -> text -> parse -> DeedData structure)

**Depends On:** Phase 5 (labels, templates, and print system exist for the AI to populate)

**Estimated Duration:** 8-10 weeks

**Spec File:** `STARR_CAD_PHASE_6_AI_ENGINE.md`

---

## Phase 7: File Export, Integration, Desktop App & Polish

**Goal:** Get data out of Starr CAD in every format needed. Connect to the broader Starr Software ecosystem. Wrap in Electron for offline desktop use. Test with real survey jobs.

**Key Deliverables:**

- DXF export (AutoCAD-compatible, with blocks for symbols, custom line types, layer mapping)
- DXF import (parse entities, layers, blocks into Starr CAD features)
- PDF export (vector PDF, print-quality, all template elements included)
- Simplified CSV export (dad-mode: collapse monument codes, preserve point names and B/E suffixes)
- CSV/TXT export (full data with both alpha and numeric codes)
- Starr platform integration points (Compass -> CAD project data, CAD -> Compass completed drawings, CAD -> Forge base layers, CAD -> Orbit boundary/utility maps)
- Electron desktop wrapper (offline capability, local file system access, native menus)
- Auto-save and crash recovery (.starr.autosave alongside main file)
- Settings persistence (user preferences, import presets, code-to-style overrides saved between sessions)
- Performance optimization (spatial indexing for snap/selection on large drawings, LOD rendering for dense point files)
- Field reference sleeve cards (print-ready PDF for the wristband cards)
- Real survey job testing (run 5+ actual Starr Surveying jobs through the full pipeline)
- Bug fixing and UX polish based on real-world testing feedback

**Depends On:** Phase 6 (AI engine complete, all features functional)

**Estimated Duration:** 5-7 weeks

**Spec File:** `STARR_CAD_PHASE_7_EXPORT_POLISH.md`

---

## Summary Table

| Phase | Focus | Duration | Running Total |
|-------|-------|----------|---------------|
| 1 | Project Foundation & CAD Engine Core | 6-8 wks | 6-8 wks |
| 2 | Data Import & Point Code System | 4-6 wks | 10-14 wks |
| 3 | Layer System, Symbols, Line Types & Editors | 5-7 wks | 15-21 wks |
| 4 | Geometry Tools — Curves, Splines, Offsets & Survey Math | 7-9 wks | 22-30 wks |
| 5 | Annotations, Dimensions, Templates & Print | 5-7 wks | 27-37 wks |
| 6 | AI Drawing Engine | 8-10 wks | 35-47 wks |
| 7 | File Export, Integration, Desktop App & Polish | 5-7 wks | 40-54 wks |

**Total estimated:** 40-54 weeks (10-13 months)

Part-time with AI assistance. Full-time effort could compress to 7-9 months.

---

## How to Use These Documents

Each phase has its own implementation spec file:

- `STARR_CAD_PHASE_1_ENGINE_CORE.md` — Built out fully (see below)
- `STARR_CAD_PHASE_2_DATA_CODES.md` — To be built when Phase 1 is complete
- `STARR_CAD_PHASE_3_STYLING_EDITORS.md` — To be built when Phase 2 is complete
- `STARR_CAD_PHASE_4_GEOMETRY_TOOLS.md` — To be built when Phase 3 is complete
- `STARR_CAD_PHASE_5_ANNOTATIONS_TEMPLATES.md` — To be built when Phase 4 is complete
- `STARR_CAD_PHASE_6_AI_ENGINE.md` — To be built when Phase 5 is complete
- `STARR_CAD_PHASE_7_EXPORT_POLISH.md` — To be built when Phase 6 is complete

When starting a Copilot or Claude Code session, open the spec file for your current phase. It contains every TypeScript interface, function signature, algorithm, UI layout, and acceptance test needed to implement that phase. The master spec (`STARR_CAD_IMPLEMENTATION.md`) remains the single source of truth for the full picture — the phase specs are focused extractions optimized for implementation.

---

*Starr Surveying Company — Belton, Texas — March 2026*
