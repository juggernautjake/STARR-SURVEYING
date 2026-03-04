# STARR CAD — 8-Phase Implementation Roadmap

**Version:** 2.0 | **Date:** March 2026 | **Company:** Starr Surveying Company, Belton, TX

**Purpose:** This document defines the 8 development phases for Starr CAD. Each phase has its own standalone implementation spec. Phases are sequential — each builds on the previous. Work on a phase only after the prior phase's deliverables are complete and tested.

---

## Phase Dependencies

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6 ──→ Phase 7 ──→ Phase 8
Engine       Data In     Styling     Geometry    Labels/     AI Engine    Final        UX
Core         & Codes     & Editors   Tools       Templates   & Preview    Delivery     Polish
```

---

## Phase 1: Project Foundation & CAD Engine Core ✅ COMPLETE

**Status:** ✅ **COMPLETE** — All Phase 1 acceptance tests pass. The full CAD engine is implemented in `app/admin/cad/` (UI components) and `lib/cad/` (types, geometry, stores). Accessible at `/admin/cad`.

**Goal:** A functional 2D drawing canvas where you can pan, zoom, place points, draw lines/polylines, select things, undo/redo, and save/load files. No survey-specific features yet — just a solid CAD foundation.

**Key Deliverables:**

- ✅ Next.js + TypeScript project (integrated into existing Starr Surveying Next.js app, no separate monorepo needed)
- ✅ PixiJS rendering engine with pan/zoom viewport
- ✅ Coordinate system (survey Y-up internally, screen Y-down for rendering)
- ✅ Basic geometry primitives: point, line, polyline, polygon (+ rectangle, circle, regular polygon bonus)
- ✅ Selection system (click, box select, shift-add, crossing vs window)
- ✅ Grip editing (drag vertices of selected features)
- ✅ Undo/redo (500-entry stack, compound batch operations)
- ✅ Snap system (endpoint, midpoint, intersection, nearest, grid)
- ✅ Basic layer system (create, rename, toggle visibility, lock, set active, delete, drag-reorder)
- ✅ Command bar (type commands + coordinates, @dx,dy relative, @dist<angle polar)
- ✅ Zustand state management (drawing, selection, tool, viewport, UI, undo stores)
- ✅ Native .starr file format (JSON, save/load via browser file dialog)
- ✅ Keyboard shortcuts (all Phase 1 bindings + multi-key chords)
- ✅ Grid rendering (major/minor, auto-scale with zoom, DOTS/LINES/CROSSHAIRS styles)
- ✅ Status bar (cursor coordinates, active layer, snap/grid toggles, zoom level, selection count)
- ✅ Auto-save to IndexedDB (every 60 s) + crash-recovery dialog on load
- ✅ Property panel, settings dialog, tool options bar, feature context menu

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

## Phase 3: Layer System, Symbols, Line Types & Editors ✅ COMPLETE

**Status:** ✅ **COMPLETE** — All Phase 3 acceptance tests pass. Full visual styling pipeline implemented in `lib/cad/styles/` and integrated with the CAD canvas and property panels. Verified by 215 unit tests.

**Goal:** Full visual styling pipeline. Every point code maps to a specific symbol, line type, color, and layer. Users can create custom symbols and line types. The layer panel is feature-complete with all standard surveying layers pre-configured.

**Key Deliverables:**

- ✅ 22 default layers with auto-assignment from point codes (6 groups: Boundary & Control, Improvements, Utilities, Natural Features, Transportation, Annotation & Misc)
- ✅ Full layer panel UI (visibility, lock, freeze, color, weight, line type, drag-reorder, groups, solo, batch ops, filter/search)
- ✅ Style cascade system (feature override > code default > layer style > global fallback) with `canFeatureBeRendered` / `canFeatureBeEdited` frozen-layer checks
- ✅ Symbol library (all built-in survey symbols as SVG path data: monuments found/set/calc in 4 sizes, iron rod/pipe/concrete/cap/PK nail/mag nail, control, utilities, vegetation, fence inline symbols, generic fallbacks)
- ✅ Symbol renderer (render at any scale, rotation, color; edge-case guards for null/NaN/zero inputs)
- ✅ SVG path parser supporting M, L, C, Z, H, V commands with silent handling of unknown commands
- ✅ Helper functions: `findSymbol`, `resolveSymbolWithFallback`, `getSymbolsByAssignedCode`
- ✅ Line type library (all built-in line types: 8 basic + 12 fence + 5 specialty = 25 total)
- ✅ Line type renderer (zoom-aware dash patterns + inline symbols at scale-dependent intervals; WAVY special renderer)
- ✅ Helper functions: `getLineTypesByCategory`, `findLineType`, `resolveLineTypeWithFallback`; exported `MM_TO_PX` constant
- ✅ Code-to-style mapping system (`buildDefaultCodeStyleMap`)
- ✅ Property panel (right sidebar: edit selected feature's style, layer, code, coordinates, properties)
- ✅ Monument action → symbol resolution (found=solid/black, set=open/red, calc=target/magenta, driven by point name suffix OR expanded code) with 4-level fallback chain
- ✅ Global style settings (background, grid, fonts, bearing format, distance precision, snap settings) via `GlobalStyleConfig`
- ✅ `.starr` file validator migrates pre-Phase-3 documents (back-fills frozen, lineTypeId, Phase 3 style fields, default layers)
- ✅ Unit test suite: 215 tests across 9 test files covering all style modules, edge cases, and migration logic

**NOT in Phase 3:** Symbol editor UI dialog, line type editor UI dialog, code-style mapping panel UI (reserved for future Phase 3 UI completion), SymbolPicker/LineTypePicker/ColorPicker dialogs.

**Depends On:** Phase 2 (codes assigned to points, line strings built)

**Spec File:** `STARR_CAD_PHASE_3_STYLES_SYMBOLS.md`

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

**Goal:** Import a field file + provide a deed, and the AI produces an accepted drawing ready for the full editor. The engine resolves field-shot dynamic offsets to true positions, enriches data from online sources (GIS parcels, FEMA flood zones, PLSS, elevation), runs a 5–10 minute deliberation period, generates confidence-gated clarifying questions, renders an interactive drawing preview with visual element confidence cards sorted by confidence (least to most), and provides per-element AI explanation popups with element-level chat. The user accepts the drawing to send it to Phase 7.

**Key Deliverables:**

- 6-stage AI pipeline (classify → assemble → reconcile → place → label → score)
- Stage 1: Point classification (resolve codes, parse names, detect monument actions)
- Stage 2: Feature assembly (line strings, arc fitting, splines, detect unclosed boundaries)
- Stage 3: Deed/record reconciliation (parse legal descriptions, compare field vs record per call)
- Stage 4: Intelligent placement (auto-select paper/scale/orientation)
- Stage 5: Label optimization (collision-free label placement using simulated annealing)
- Stage 6: Confidence scoring (5-tier system, per-element scoring with 6 weighted factors)
- **Dynamic offset resolution** (detect field-shot offsets from code suffixes, descriptions, field notes, companion pairs; compute true monument positions)
- **Online data enrichment** (county CAD parcel data, USGS PLSS, FEMA NFIP flood zones, TxDOT ROW, USGS elevation)
- **AI deliberation period** (5–10 minutes of deep cross-referencing before drawing)
- **Confidence-gated clarifying questions** (only generated when confidence < 70%; blocking + optional question categories; skipped when overall confidence ≥ 90%)
- **Interactive drawing preview** (two-panel: drawing canvas left + element confidence cards right)
- **Visual element confidence cards** (sorted least-confident-first by default; color-coded borders and bars; red/orange/yellow/yellow-green/green tiers)
- **Per-element AI explanation popups** (why drawn this way, data used, assumptions, alternatives, confidence breakdown)
- **Element-level chat** (ask questions about a specific element; AI can update element, group, or full drawing)
- Point group intelligence (calc/set/found resolution with delta reporting)
- AI review queue UI (tier-grouped list, accept/modify/reject per item, batch actions)
- Claude API integration via DigitalOcean worker (unlimited processing time)
- Deed PDF/image import for AI extraction (OCR → text → parse → DeedData)

**Depends On:** Phase 5 (labels, templates, print system for AI to populate)

**Estimated Duration:** 10–13 weeks

**Spec File:** `STARR_CAD_PHASE_6_AI_ENGINE.md`

---

## Phase 7: Final Delivery — Editor Integration, RPLS Workflow & Export

**Goal:** Transform an AI-reviewed drawing into a sealed, legally valid survey deliverable. Load the accepted AI drawing into the full interactive editor. The AI generates the complete survey description. A built-in RPLS review workflow manages seal application and approval. The finished product is exported and delivered to the client. A desktop Electron wrapper and Starr platform integrations complete the phase.

**Key Deliverables:**

- **Full editor integration** (load accepted AI drawing into the Phase 1–5 full interactive editor with AI sidebar)
- **AI drawing assistant** (persistent chat in editor: layer changes, style changes, geometry instructions, questions)
- **AI survey description generator** (legal description, survey notes, certification text, title block auto-fill from enrichment/drawing data)
- **Drawing completeness checker** (16 automated checks: boundary closed, labels present, title block filled, tier-1 items resolved, etc.)
- **RPLS review workflow** (submit → in-review → approve → seal state machine with review history)
- **Digital seal system** (upload RPLS seal image; embed in PDF at seal placeholder; hash drawing at time of sealing)
- **Client deliverable pipeline** (mark delivered, export ZIP, email client, upload to Starr portal)
- DXF export (AutoCAD-compatible, all entity types, symbol blocks, custom line types)
- DXF import (parse entities, layers, blocks into Starr CAD features)
- Final PDF export (sealed, vector, PDF/A-3 archival option)
- GeoJSON export (WGS84 via proj4 coordinate conversion)
- Simplified CSV export (dad-mode: collapsed codes, B/E suffixes) + full CSV
- Electron desktop wrapper (offline capability, native file dialogs, auto-update)
- Auto-save & crash recovery (.starr.autosave alongside main file, crash recovery dialog)
- Starr platform integrations (Compass ↔ CAD data flow, CAD → Forge base layers, CAD → Orbit maps)
- Settings persistence (company settings, user preferences, import presets saved between sessions)
- Performance optimization (R-tree spatial indexing, LOD rendering, annotation culling)
- Field reference sleeve cards (print-ready PDF for wristband cards)
- Real survey job testing (5+ actual Starr Surveying jobs through the full pipeline)

**Depends On:** Phase 6 (AI engine complete, user has accepted a drawing from the preview)

**Estimated Duration:** 7–9 weeks

**Spec File:** `STARR_CAD_PHASE_7_FINAL.md`

---

## Phase 8: UX Completeness — Controls, Hotkeys, Tooltips & Settings

**Goal:** Every button, form, field, and function works exactly as expected. Controls are stylish and intuitive. Hotkeys are comprehensive and user-configurable with a dedicated binding page. The cursor changes dynamically per tool and snap state. Tooltips appear on 2–3 second hover and track the mouse. Every drawing element shows hover-details (bearing, length, point names). A robust settings section manages all preferences, templates, and tool defaults. Everything persists flawlessly.

**Key Deliverables:**

- **User-configurable hotkey registry** (40+ bindable actions, user can rebind any action)
- **Hotkey binding settings page** (table with edit-binding modal, conflict detection + resolution, presets: Default / AutoCAD-like, reset all to defaults)
- **Dynamic cursor system** (20+ cursor states per tool/snap/drag context: crosshair, draw, snap-type cursors, grab, rotate, scale, erase, AI chat, etc.)
- **Tooltip system** (2–3 second hover delay, mouse-tracking, configurable delay/width, per-type toggles)
- **Element hover-detail tooltips** (LINE: bearing + length + from/to names; ARC: R, Δ, L, CB; POINT: name, code, N/E)
- **Bidirectional attribute ↔ canvas sync** (manual canvas edits → property panel updates in real-time; property panel edits → canvas re-renders immediately; all changes in undo stack with descriptive labels)
- **Undo/Redo UI buttons** with descriptive action labels in tooltips (disabled state when stack empty)
- **Comprehensive settings section** (General, Canvas, Display, Hotkeys, AI, Export, Company, Templates, Import Presets — all persisted to server + localStorage)
- **Controls & navigation polish** (toolbar/panel style guide, form field conventions, confirmation dialogs on destructive actions, full keyboard navigation, command palette Ctrl+K)
- **Phase 1–7 gap audit** (applies tooltips to all dialogs, fixes any missing bidirectional sync, adds missing confirmation dialogs, etc.)

**Depends On:** Phase 7 (all features functional — Phase 8 polishes the full application)

**Estimated Duration:** 4–6 weeks

**Spec File:** `STARR_CAD_PHASE_8_UX_CONTROLS.md`

---

## Summary Table

| Phase | Focus | Duration | Running Total | Status |
|-------|-------|----------|---------------|--------|
| 1 | Project Foundation & CAD Engine Core | 6-8 wks | 6-8 wks | ✅ Complete |
| 2 | Data Import & Point Code System | 4-6 wks | 10-14 wks | ⏳ Pending |
| 3 | Layer System, Symbols, Line Types & Editors | 5-7 wks | 15-21 wks | ✅ Complete |
| 4 | Geometry Tools — Curves, Splines, Offsets & Survey Math | 7-9 wks | 22-30 wks | ⏳ Pending |
| 5 | Annotations, Dimensions, Templates & Print | 5-7 wks | 27-37 wks | ⏳ Pending |
| 6 | AI Drawing Engine | 10-13 wks | 37-50 wks | ⏳ Pending |
| 7 | Final Delivery — Editor Integration, RPLS Workflow & Export | 7-9 wks | 44-59 wks | ⏳ Pending |
| 8 | UX Completeness — Controls, Hotkeys, Tooltips & Settings | 4-6 wks | 48-65 wks | ⏳ Pending |

**Total estimated:** 48–65 weeks (12–16 months)

Part-time with AI assistance. Full-time effort could compress to 9–12 months.

---

## How to Use These Documents

Each phase has its own implementation spec file:

- `STARR_CAD_PHASE_1_ENGINE_CORE.md` — Built out fully
- `STARR_CAD_PHASE_2_DATA_IMPORT.md` — Built out fully
- `STARR_CAD_PHASE_3_STYLES_SYMBOLS.md` — Built out fully
- `STARR_CAD_PHASE_4_GEOMETRY_TOOLS.md` — Built out fully
- `STARR_CAD_PHASE_5_ANNOTATIONS_PRINT.md` — Built out fully
- `STARR_CAD_PHASE_6_AI_ENGINE.md` — Built out fully (v2.0: includes dynamic offsets, enrichment, deliberation, confidence cards, element chat)
- `STARR_CAD_PHASE_7_FINAL.md` — Built out fully (editor integration, RPLS workflow, exports, Electron)
- `STARR_CAD_PHASE_8_UX_CONTROLS.md` — Built out fully (hotkeys, cursors, tooltips, settings)

When starting a Copilot or Claude Code session, open the spec file for your current phase. It contains every TypeScript interface, function signature, algorithm, UI layout, and acceptance test needed to implement that phase. The master spec (`STARR_CAD_IMPLEMENTATION.md`) remains the single source of truth for the full picture — the phase specs are focused extractions optimized for implementation.

---

*Starr Surveying Company — Belton, Texas — March 2026*
