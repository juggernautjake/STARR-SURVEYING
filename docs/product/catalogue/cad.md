# CAD area catalogue

Scope: `app/admin/cad/**`, `lib/cad/**`, the Tauri desktop app (`src-tauri/`), `app/cad-harness`, `app/api/admin/cad/**`, `docs/cad*`, and the CAD plans in `docs/planning/**`. The machine-readable catalogue is `cad.json` (54 entries, `area: "cad"`, every claim carries a `file:line` that was resolved by script against this worktree). This file is the overview plus the owner-requested rebuild material: capability list, how AutoCAD / Civil 3D / Carlson do each thing, what Starr CAD lacks, and a proposal for modes and layout templates.

Read this first about the competitor columns: no web access or vendor documentation was used. Command names, aliases and ribbon locations for AutoCAD, Civil 3D, Carlson, MicroStation and TBC are from product knowledge. Treat them as a planning draft and verify each against the current vendor docs before building a mode. Confidence is marked H, M or L in the tables. Everything said about Starr CAD is from the code.

---

## 1. What the CAD area is for

A browser-based 2D survey drafting editor, plus a Tauri desktop wrapper, so that a drafter can take field data (collector files, a Traverse PC job, a deed, a research reading) to a sealed plat with a legal description, and so that an RPLS can review and seal it. It is also the Starr-specific hub for the firm own tools: Traverse PC round-trip, the research platform (RECON), and the Compass, Forge and Orbit products.

Size: about 400 files and 66,000 lines of non-test TypeScript in `lib/cad` and `app/admin/cad` (the largest: `CanvasViewport.tsx` 15,441 lines, `operations.ts` 4,223, `PropertyPanel.tsx` 2,700, `ToolOptionsBar.tsx` 2,159, `MenuBar.tsx` 2,128, `CADLayout.tsx` 1,946), 121 unit-test entries, 8 Playwright specs, about 55 completed planning documents, and about 25,000 tests in the repo gate.

## 2. How the parts fit

```
 Menu bar  Toolbar  Command bar  Hotkeys  Palette  Right-click menus  AI chat
     \        |         |           |        |           |               |
      +-------+---------+-----------+--------+-----------+---------------+
                          (each reaches tools differently)
                                    |
              CanvasViewport.tsx (15k lines: Pixi renderer + every tool state machine)
                                    |
        lib/cad/operations.ts (60+ edit functions)   lib/cad/geometry (39 modules, pure)
                                    |
   zustand stores (drawing, selection, undo, tool, viewport, ui, ai, traverse, ...)
                                    |
           DrawingDocument (one JSON object: features, layers, styles, settings, seal)
                |                         |                          |
   Local .starr / IndexedDB     /api/admin/cad/* -> cad_drawings    Tauri native file
   autosave + emergency save    (JSONB row per drawing)             + fs autosave
```

- Import side: `lib/cad/import` (CSV, RW5, JobXML, GSI, LandXML points), `lib/cad/io` (Traverse PC), `lib/cad/delivery` (DXF reader, GeoJSON reader), `lib/cad/recon-to-cad.ts` and `import/from-survey-reading.ts` (research).
- Domain side: `lib/cad/geometry` (bearing, curve, closure, intersection, offset, partition, stakeout, grade), `codes` (152-code library, field-to-finish suffixes), `points`, `styles` (76 line types, 84 symbols, fills, text styles), `labels`.
- Output side: `lib/cad/delivery` (DXF R12, PDF via jsPDF, LandXML, GeoJSON, field cards, deliverable zip, seal, RPLS workflow, completeness checker) and `lib/cad/integrations` (Compass, Forge, Orbit webhooks).
- AI side: `lib/cad/ai` (tool registry of 25 tools, proposer, provenance, scope) and `lib/cad/ai-engine` (six-stage point-to-drawing pipeline, deed parser, chat), served by 5 API routes (four restricted to admin or equipment_manager, sketch-reconcile to admin only).
- Desktop: `scripts/prepare-desktop-build.mjs` stashes everything except `app/admin/cad`, builds a static export, and Tauri wraps it. All `/api` routes are stashed, so cloud open/save, AI, images, branches and syncs do not exist in the desktop build.

## 3. Main user journeys

1. Drafter, field file to plat. Import dialog (CSV/RW5/JobXML/GSI, 5 steps) or Import TRV, then codes and field-to-finish build linework, Calc Point and Intersect fill missing corners, orientation to the basis of bearings, labels (auto-annotate), title block and notes, Print to PDF, save to cloud. Pain: seven doors to calculators, no sheet layouts, labels and tables are by hand, DXF is R12 only, no DWG.
2. Drafter, from research. Research page exports a RECON drawing (JSON via localStorage) or File > Import Research Reading; compare or reconcile records; edit; the drawing cannot be refreshed from research afterward.
3. RPLS review and seal. Completeness check (16 rules), submit for review, notes thread, approve, seal (image plus SHA-256), deliver (fires Forge and Orbit webhooks, bundle zip). Pain: seal and approval are client-side, no role check, anyone can overwrite the saved document.
4. AI-assisted drafting. Run AI Drawing Engine (point classification, assembly, deed reconcile, placement, confidence) then accept proposals in the review queue; or chat with the drawing in COPILOT/COMMAND mode. Pain: drafter roles are blocked at the API; AI reaches 39 percent of editor commands.
5. Field or office check on a phone or small screen. A14 and C45 fixed 390 px layout breakage; the editor is still a desktop tool.
6. Desktop, offline. Open `.starr`/`.trv` natively, autosave to disk. Pain: no cloud, AI or sync, and the UI does not say so.

## 4. Biggest problems (ranked)

1. One fixed UI and no modes. The only "mode" is a hotkey preset (`AUTOCAD_PRESET`, 20 aliases). It does not change menus, panels, selection, snaps, mouse, colours or units, so it does not make an AutoCAD, Civil 3D or Carlson user feel at home. It also collides with itself: `tool.select` is bound to `escape`, which `edit.deselect` already owns. (`cad.modes-workspaces`, `cad.command-palette-hotkeys`)
2. No single command system. Toolbar, menu bar (hand-written labels and shortcut strings), command bar (about 30 typed commands for 51 tool types), hotkey registry (89 actions, 42 tools), command palette, right-click menus and the AI registry each reach tools their own way. Two keyboard layers run at once. `CanvasViewport.tsx` holds every tool state machine at 15k lines. (`cad.canvas-viewport`, `cad.command-bar`, `cad.menu-bar`)
3. Texas and Starr are hard-coded, and it is single tenant. Only the five Texas State Plane zones exist; `units` is the literal `FEET`; the default template, certification, notes, system prompt, completeness rules, code library, layer ids and Compass/Forge/Orbit integrations are Starr or Texas. Drawings are one shared workspace with no firm id. (`cad.geo-units`, `cad.templates-company`, `cad.api-drawings`)
4. The document model is 2D with no paper space, blocks, xrefs, dimension/table styles, alignments, surfaces or parcels, and points carry no observations. This limits what Civil 3D, Carlson and TBC users expect. (`cad.sheet-title-block-print`, `cad.points-system`, `cad.calculators`)
5. Storage is whole-document JSON with last-write-wins. Any authenticated user may overwrite any drawing; no version history; the seal lives in the same JSON. (`cad.api-drawings`, `cad.native-file-persistence`, `cad.rpls-review-seal-delivery`)
6. Interchange is thin where clients are: DXF writer is R12 (AC1009), no DWG, no PDF or raster-calibrated underlay, no shapefile or KML, no Carlson, Trimble or Topcon job-file import, PDF is one page. (`cad.dxf-io`, `cad.import-survey-data`, `cad.pdf-export`)
7. Desktop is an offline subset without updater, and builds by renaming source directories. (`cad.desktop-tauri`)
8. AI is gated to admin/equipment_manager and covers 39 percent of commands; the chat surfaces overlap. (`cad.ai-copilot-chat`, `cad.ai-drawing-engine`)
9. Dead and duplicated code that has passing tests and so survives: `AnnotationPanel`, `PointTablePanel`, `useEscapeToClose`, `mock-proposer`, dead `tool.leader`, `CRANDALL` adjustment, two curve calculators, two label systems. (`cad.dead-code-and-dups`)

What is strong and should be kept: the survey domain engines (bearing, curve, closure, intersection, partition, stakeout, grade, COGO), the Traverse PC round trip, the code library, the honesty rules (unknown is never drawn as an answer; reconcile flags disputes; open figure when a call is unusable), provenance stamps and one-undo AI turns, the completeness checklist, the performance measurement harness, and the contracts in `docs/cad-click-order-contract.md` and `docs/cad-integration-points.md`.

## 5. Rebuild recommendation

Rebuild the product shell, command system, document model, renderer interface, storage and workspace layer. Port, do not rewrite, the pure engines: `lib/cad/geometry`, `io`, `import`, `delivery` writers, `codes`, `compare`, `calculators` engines. Their tests are the specification. A full rewrite of the domain logic is what the 2026-06 desktop plan rejected, and that reasoning still holds.

Architecture in one page:

1. Document engine (no UI). A typed document: model space plus layouts (paper space) with viewports; objects (point, line, polyline with arcs, arc, circle, ellipse, spline, text, mtext, leader, dimension, hatch, table, image, block reference, xref); layers with by-layer/by-block semantics; styles (text, dimension, leader, table, linetype, symbol, plot); a survey database beside the drawing (points, observations, setups, control, alignments, parcels) so geometry can be re-derived. Versioned schema, chunked storage, migration tests.
2. Command system. One registry; every command is a state machine with a name, aliases, option keywords, prompts, preview, undo transaction and a JSON schema. Toolbar, ribbon, menus, command line, hotkeys, context menu, palette, macros and AI are all generated from it. Transparent commands (zoom/pan inside a command). The click-order contract becomes the executable test for every command.
3. Renderer interface. Pixi or Canvas now; GPU or workers later. Screen and print share one vector draw path.
4. Workspaces and modes (section 7): data, not code.
5. Customisation in three scopes (user, firm, drawing) with a settings package, macros, aliases, palettes, scripting, batch.
6. Storage and tenancy: firm, project/job, drawing revisions, roles (drafter, party chief, RPLS, viewer, client), If-Match concurrency, presence or locking, audit log, server-enforced review and seal workflow, signed asset URLs, local-first desktop with sync. Cloud open/save stays the same experience on web and desktop.
7. Firm standards package: layers, linetypes, symbols, fills, text/dim/table styles, plot styles, code table and dialect, title blocks, notes and certification boilerplate per state, units and CRS defaults. Starr becomes one firm preset.
8. Survey features first-class: all US SPCS zones, UTM, local with calibration, combined factor and ground/grid, traverse with Bowditch, transit, Crandall and least squares, point groups, field-to-finish dialects, parcel layout tools, description templates, stationing.
9. Interchange: DWG (decision needed), current DXF, LandXML objects, shapefile/KML, PDF/raster underlays with calibration, Carlson, Trimble, Topcon, Sokkia, Leica job files, stakeout export, multi-sheet PDF with optional signature.
10. AI over the same registry; firm-level policy; role gate by capability.

Suggested planning phases (the owner asked for a big planning phase):
- P0 decisions (section 9), customer interviews (3 to 5 firms using each of AutoCAD, Civil 3D, Carlson, TBC), and a one-day task test: take the same field file to a plat in each competitor and time it.
- P1 document model and command registry spec (including the tool-by-tool port list from this catalogue).
- P2 workspace/mode spec and prototype of the AutoCAD and Civil 3D modes only (highest-volume refugees).
- P3 storage, tenancy and workflow spec.
- P4 interchange and CRS spec.
- P5 build order. Port engines first behind the new command layer, then migrate screens.

## 6. Capability list, competitor mapping and gaps

Key to the Starr column: OK works and is reachable, PART partial, NO missing. Competitor cells give command, alias, then ribbon (or menu) location. Where a vendor menu is not a ribbon (Carlson, MicroStation) the menu path is given. Confidence H/M/L is for the competitor details only.

### 6.1 Draw

| Capability | Starr CAD now | AutoCAD (cmd, alias, ribbon) | Civil 3D | Carlson | Weak or missing in Starr |
|---|---|---|---|---|---|
| Line | OK `DRAW_LINE`, key `l`, toolbar | LINE, L, Home > Draw (H) | Same, plus transparent bearing/distance, angle/distance, northing/easting entry (`'BD`, `'AD`, `'NE`; M) | LINE, plus Draw menu line-by-bearing/distance routines (M) | No transparent survey entry modes inside LINE; line variants are tools not style |
| Polyline | OK `pl`, double-click/Enter ends | PLINE, PL, Home > Draw (H); options Arc, Close, Halfwidth, Undo | Same | Same; also polyline from point numbers (M) | No arc segments, width, close/undo keywords in-command |
| Arc | PART 3-point only; others via calculator | ARC, A, Home > Draw (11 options: SCE, SER, CSE, tangent, continue) (H) | Same; plus curve by radius/delta/chord from Lines/Curves routines (L) | Arc/curve routines by radius, delta, chord, tangent (M) | Missing SCE/SER/CSE/CER/tangent/continue and curve-by-element (R, L, D, T, C) |
| Circle / ellipse | OK centre/edge | CIRCLE, C, ELLIPSE, EL; Home > Draw (H) | Same | Same | No 2P/3P/TTR/TTT circle; no ellipse arc |
| Rectangle / polygon | OK rectangle, regular polygon 3 to 20 | RECTANG, REC; POLYGON, POL; Home > Draw (H) | Same | Same | No chamfer/fillet/rotate/area options on rectangle |
| Spline | OK fit and NURBS, to-arcs converter | SPLINE, SPL; Home > Draw (H) | Same; feature lines for grading (M) | Same | No tangent/fit tolerance options; spline edit limited |
| Point | OK `p`; survey points are features | POINT, PO; point style DDPTYPE (H) | Create Points toolbar; Home > Create Ground Data > Points (M) | Points menu: locate, set, draw points from coordinate file (M) | Draw-point tool makes a plain point, not a numbered, coded, elevated survey point |
| Hatch / boundary / region | PART fills as properties of closed shapes | HATCH, H; BOUNDARY, BO; REGION, REG; Home > Draw (H) | Same | Same | No hatch tool or boundary-from-loop command |
| Construction lines | NO (a line variant is labelled "Construction") | XLINE, XL; RAY; Home > Draw (H) | Same | Same | Missing xline and ray |
| Text / MText | PART single-line TEXT | TEXT, DT; MTEXT, T or MT; Annotate > Text (H) | Same plus labels | Same plus annotation scale routines | No MTEXT, fields, columns, annotative scale |
| Freehand | OK pen, optional smoothing | SKETCH (rare) (M) | - | - | Fine as is |
| Block / symbol insert | PART symbols attach by code or style | BLOCK, B; INSERT, I; WBLOCK, W; Home > Block (H) | Same | Symbol and block insert dialogs (M) | No block definitions, attributes, references or libraries a user can author |
| Multiline, donut, revision cloud, wipeout, table | NO | MLINE ML; DONUT DO; REVCLOUD; WIPEOUT; TABLE TB (H) | Same | Same | Missing; revcloud and table matter for review and plats |

### 6.2 Modify

| Capability | Starr CAD now | AutoCAD | Civil 3D | Carlson | Weak or missing |
|---|---|---|---|---|---|
| Move, copy, rotate, mirror, scale | OK interactive; copy mode; scale XY | MOVE M, COPY CO or CP, ROTATE RO, MIRROR MI, SCALE SC; Home > Modify (H) | Same | Same | No rotate/scale by reference; no multiple copy with displacement option set |
| Stretch | NO | STRETCH, S; Home > Modify (H) | Same | Same | Missing |
| Trim / extend | PART click-the-portion and click-end | TRIM TR, EXTEND EX with edge selection, fence, crossing, Shift to swap (H) | Same | Same | No cutting-edge set, fence, project or edge options |
| Fillet / chamfer | OK two lines and polyline vertex; curb return | FILLET F, CHAMFER CHA (radius, polyline, multiple) (H) | Same | Same; curb return routines (M) | No fillet-all-vertices, no multiple |
| Offset | OK parallel/scale/translate, side, corner, linked | OFFSET O; through, erase source, layer (H) | Same; parcel/alignment offsets | Offset routines with distance list (M) | No through-point, erase-source, layer option |
| Array | OK rectangular and polar | ARRAY AR (ARRAYRECT, ARRAYPOLAR, ARRAYPATH), associative (H) | Same | Same | No path array, not associative |
| Erase, explode, join | OK | ERASE E, EXPLODE X, JOIN J (H) | Same | Same | Join tolerance fixed 0.01 ft |
| Break, lengthen, align, overkill, draw order, reverse | PART align (6 modes), reverse; others NO | BREAK BR, LENGTHEN LEN, ALIGN AL, OVERKILL, DRAWORDER DR, REVERSE (H) | Same | Same | Missing break, lengthen, 2/3-point align, overkill, draw order |
| Edit polyline / spline nodes | OK insert/remove node, smooth, simplify | PEDIT PE, SPLINEDIT SPE; grips (H) | Same | Same | No vertex table, no width, no curve-fit options |
| Match properties | OK `MATCH_PROPERTIES` | MATCHPROP MA; Home > Properties (H) | Same | Same | No selectable property subset |
| Properties palette | PART right panel + modal | PROPERTIES PR or Ctrl+1; Home > Properties / View > Palettes (H) | Same plus object-specific tabs | Same | No quick properties, mixed-value edit |
| Selection filters | PART window/crossing, select similar by type | QSELECT, SELECTSIMILAR, FILTER FI, GROUP G (H) | Same plus select by style | Same | No property-based quick select or filter, no named sets |
| Grips | OK | Grips, hot grips (H) | Same | Same | No arc/curve grips; no dynamic input at the grip |

### 6.3 Annotate

| Capability | Starr CAD now | AutoCAD | Civil 3D | Carlson | Weak or missing |
|---|---|---|---|---|---|
| Bearing/distance label | OK on lines by layer or feature prefs; DIM places a note | Dimension styles and fields; label by `QDIM`, `DIM` (M) | Add Labels > Line and Curve (label styles, Annotate > Labels & Tables) (M) | Annotate menu line label routines (M) | Not a style-driven dynamic label; no tag mode |
| Curve data labels | OK `CURVE_DATA` annotation | Not native; fields/blocks | Curve labels and tags (M) | Curve table routines (M) | No tags, no curve table |
| Line and curve tables | NO | Table (TABLE, TB) with data link (H) | Line/curve tables from tags (Annotate > Labels & Tables) (M) | Table of lines/curves routines (L) | Missing; standard plat deliverable |
| Parcel / area labels | OK area label, measure area | AREA AA, field in text (H) | Parcel area labels and tables (M) | Area labels and tables (M) | No parcel objects or parcel table |
| Dimensions | PART bearing/distance only | DIM, DLI DAL DAN DRA DDI DOR, DIMSTYLE D; Annotate > Dimensions (H) | Same | Same | Missing linear, aligned, angular, radius, diameter, ordinate, continue, baseline; no dimension styles |
| Leaders | NO (type exists; dead hotkey) | MLEADER MLD, MLEADERSTYLE (H) | Same | Same | No leader or multileader tool |
| Text styles | OK STANDARD plus library and editor | STYLE ST (H) | Same | Same | No annotative scale or SHX |
| Label optimiser | OK collision-resolving | none native; manual | Label dragging with reactor (M) | none native (L) | Not available as a command on demand |
| Monument labels / symbols | OK 152 codes, FOUND/SET/CALC | Blocks by hand | Description keys and point label styles (M) | Symbol libraries via coordinate file codes (M) | Texas/Traverse PC set only |
| North arrow, scale bar, legend, notes, certification | OK | Blocks, fields; Express Tools (L) | Sheet templates; Create Graphic Scale (L) | Insert scale bar, north arrow routines (L) | Not firm-designable; one sheet only |

### 6.4 Survey-specific (COGO, traverse, closure, curves, legal descriptions)

| Capability | Starr CAD now | AutoCAD | Civil 3D | Carlson | Weak or missing |
|---|---|---|---|---|---|
| Inverse (bearing, distance) | OK `INVERSE` tool, Properties readout | DIST DI, ID (distance, angle); no bearing by default (H) | Inquiry tool; Analyze > Inquiry > List Slope; Reports; transparent `'` commands (M) | Inquiry > Inverse (M) | Not saved, not a table/report; no point-number pick |
| Forward point (bearing + distance) | OK | none native; LINE with polar `@d<a` | Create Points by Direction/Distance via Create Points toolbar (M) | Points > Locate / Traverse routines (M) | Fine; add azimuth and deflection input |
| Distance-distance, bearing-bearing, bearing-distance intersections | PART in Calc Point dialog only | none native | Create Points > Intersections toolbar (M) | Point intersect routines (M) | Not canvas commands; dialog under both Survey and AI menus |
| Line/arc intersect | OK Intersect dialog | INTERSECT or object snap INT (H) | Same | Same | Dialog not a command with preview |
| Point at station-offset, radial stakeout | PART calculators only | none native | Station/offset transparent `'SO`; alignments; stakeout reports (M) | Stakeout routines (M) | No alignments, no stationing on canvas |
| Traverse entry and balance | PART points to traverse | none | Survey > Traverse Editor / Traverse Analysis (M) | Survey > Traverse/Adjust (M) | No angle balance, no setups |
| Closure and adjustment | PART Bowditch, transit; Crandall unimplemented | none | Traverse Analysis; Least Squares Analysis in Survey (M) | Compass rule, Crandall, least-squares options (M) | No Crandall, no least squares, no report export |
| Curve solving | OK any two of R, L, D, T, C; compound, reverse, spiral | none | Curve routines in Lines/Curves menu (L) | Curve calculator, Curve table (M) | Not on canvas as pick-and-place; place is in one dialog only |
| Curb return | OK | none native | Corridor intersections and fillets (L) | Cul-de-sac and curb return routines (M) | Fine |
| Area, partition to area | PART calculator (hinge, direction) | AREA AA (H) | Parcel Layout Tools: Slide Line, Swing Line, Free Form Create (M) | Subdivide/area-by-line routines (M) | No parcel objects, no frontage, no slide/swing interactively |
| Legal description | PART metes and bounds text | none native (Express/LISP) | Reports Manager: Parcel Legal / Metes and Bounds reports (M) | Inquiry > Legal Description / Area report (M) | One format, one wording, Texas state text; no lot/block, easement, strip |
| Grade / vertical curve | OK calculator | none | Profiles, vertical curves in profile layout (M) | Profile routines (M) | Calculator only, no profile views |
| Orient to basis of bearings | OK orientation dialog | ROTATE by reference, ALIGN, UCS (H) | Rotate by reference; Transform in Map (L) | Rotate/Translate coordinate routines (M) | Rotates whole drawing; no rotate points only, no keep-shape mode |
| Coordinate transform / projection | NO | MAPCSASSIGN in Map 3D, Geolocation (M) | Drawing Settings > Units and Zone (H) | Coordinate transformation routines (M) | Texas zones only, no transform |

### 6.5 Layers and styles

| Capability | Starr CAD now | AutoCAD | Civil 3D | Carlson | Weak or missing |
|---|---|---|---|---|---|
| Layer manager | PART panel plus properties dialog | LAYER LA; Home > Layers (H) | Same | Same | No table view with filters and states in one place; no plot flag |
| Layer states | OK named snapshots (on, frozen, locked) | LAYERSTATE; Layer Manager states (H) | Same | Same | No property-level state (colour, linetype) |
| Layer commands | PART isolate, show all, merge, split by code | LAYISO, LAYUNISO, LAYOFF, LAYON, LAYFRZ, LAYTHW, LAYLCK, LAYULK, LAYMRG, LAYDEL, LAYMCUR, LAYWALK (H) | Same | Same | No LAYMCUR, LAYWALK, LAYDEL as commands |
| Layer translation | NO | LAYTRANS, CAD Standards (H) | Same | Same | Needed for client DXF/DWG |
| Linetype, scale | OK 76 types, editor | LINETYPE LT, LTSCALE LTS, Linetype Manager (H) | Same | Same | No .lin import, no per-object scale |
| Lineweight, plot style | PART weight; no plot style | LWEIGHT LW, STYLESMANAGER, CTB/STB (H) | Same | Same | No plot style tables |
| Symbols/blocks library | PART 84 symbols | Design Center, Tool Palettes (H) | Same plus Style Manager | Symbol libraries (M) | No import or authoring |
| Description keys / code styles | PART CodeStylePanel (152 codes) | none | Description Key Sets (Settings tree), Point Groups (M) | Coordinate file code table (.FCL) (M) | Code table is code, not data |
| Styles as a manager | PART scattered editors | Style Manager, STYLE, DIMSTYLE, MLEADERSTYLE (H) | Toolspace Settings tree (H) | Carlson settings (M) | No single manager |

### 6.6 I/O and files

| Capability | Starr CAD now | AutoCAD | Civil 3D | Carlson | Weak or missing |
|---|---|---|---|---|---|
| Open/save native | OK `.starr` JSON, cloud row | OPEN, QSAVE, SAVEAS, DWG/DXF/DWT (H) | Same | Same | Not versioned in the file; no drawing properties |
| Autosave and recovery | OK IndexedDB 1.5 s debounce, emergency save | AUTOSAVE, RECOVER, DRAWINGRECOVERY (H) | Same | Same | Local only; no cloud autosave |
| DWG | NO | native | native | native | Missing (largest interchange gap) |
| DXF | PART R12 writer; broad reader | DXFOUT, DXFIN, SAVEAS DXF (H) | Same | Same | R12 loses lineweight, LWPOLYLINE, text style, units; no layouts |
| PDF out | PART single page | PLOT Ctrl+P, EXPORTPDF, PUBLISH; Output > Plot (H) | Same | Same | One page, no viewports, no plot style |
| PDF/raster in | NO PDF; PART image insert | PDFATTACH, ATTACH, IMAGEATTACH, PDFIMPORT; Insert > Reference (H) | Same | Same | No PDF underlay, no calibration, no georeference |
| LandXML | PART points in; points and curves out | EXPORTLANDXML in Civil 3D (M) | Insert > Import LandXML, Output > Export LandXML (M) | LandXML in/out (M) | Alignments, surfaces, parcels parsed but not drawn |
| Point file import | OK CSV, RW5, JobXML, GSI | n/a | Insert > Points from File (`IMPORTPOINTS`, M) | Points > Import ASCII; Process Raw Data (M) | No observation-level processing; missing Carlson, Trimble, Topcon, Sokkia, Nikon |
| Point file export | OK CSV, PNEZD | none | Output > Export Points (M) | Points > Export ASCII (M) | Same coverage gap |
| GIS | PART GeoJSON | MAPEXPORT, shapefile via Map 3D (M) | Same | Same | No shapefile or KML |
| Traverse PC | OK round trip | none | none | none | Starr advantage; keep |
| Batch / publish | NO | PUBLISH, ETRANSMIT, scripts SCR (H) | Same | Same | No batch conversion |

### 6.7 View and navigation

| Capability | Starr CAD now | AutoCAD | Civil 3D | Carlson | Weak or missing |
|---|---|---|---|---|---|
| Pan/zoom | OK wheel, speed, toward cursor, invert | ZOOM Z (E, W, P, S, O, A, scale), PAN P, wheel and middle (H) | Same | Same | No zoom previous/window/scale/object, no named views |
| Zoom extents / selection | OK `ze`, `zs` chords | ZOOM E, ZOOM O (H) | Same | Same | OK |
| Regen | OK F5 refresh | REGEN RE, REGENALL (H) | Same | Same | OK |
| Named views, view manager | NO | VIEW V (H) | Same | Same | Missing |
| Viewports / paper space | NO | MVIEW, VPORTS, layout tabs (H) | Same | Same | Missing; the largest structural gap |
| UCS / view alignment | NO (view rotation only) | UCS, PLAN (H) | Same | Same plus rotate view by bearing | Add UCS by line and view-by-bearing |
| Grid / ortho / polar | OK F7, F8; polar toggle in bar | GRIDDISPLAY F7, ORTHO F8, SNAP F9, POLAR F10, OTRACK F11, DYN F12 (H) | Same | Same | Polar no key; no snap-tracking; no dynamic input |
| Object snaps | PART 7 types | OSNAP OS; END MID CEN NOD QUA INT INS PER TAN NEA APP EXT PAR FROM M2P (H) | Same | Same | Missing tangent, quadrant, node, insertion, extension, parallel, from, M2P, tracking |
| Isolate / hide | OK isolate as a mode, hidden items panel | ISOLATEOBJECTS, HIDEOBJECTS, UNISOLATEOBJECTS (H) | Same | Same | OK |

### 6.8 Data and points

| Capability | Starr CAD now | AutoCAD | Civil 3D | Carlson | Weak or missing |
|---|---|---|---|---|---|
| Point table | OK Point Data Viewer (sort, filter, edit, bulk) | none native (DATAEXTRACTION) | Prospector > Points, Panorama table; Edit Points (M) | Edit Coordinate File, Point list (M) | No groups, no ranges |
| Point groups | NO | none | Point Groups in Prospector (H) | Point sort and groups (M) | Missing |
| Description keys, field-to-finish | PART codes, suffix linework, command f2f | none | Description Key Sets plus Survey Linework Code Sets (M) | Field to Finish with FCL (H) | One dialect; no string numbers; code table not data |
| Renumber, rename | OK bulk renumber, rename with references | none | Points > Renumber (M) | Number/renumber routines (M) | Fine; add ranges |
| Duplicate and unknown refs | OK dedupe and report | n/a | Duplicate point resolution (M) | Duplicate point resolution (L) | OK |
| Raw observations, setups, reduction | NO | none | Survey database (M) | Raw data editor (M) | Missing; core for Carlson, TBC, Civil 3D survey users |
| Elevations, surfaces, contours | NO (elevation is an attribute) | none (Map/3D) | Surfaces (TIN), contours, profiles (H) | Surface and contour routines (H) | Out of 2D scope today; decide in P0 |
| Point cloud, LAS | NO | ReCap attach (M) | Same | Same | Out of scope unless chosen |
| Shared point library | OK cad_point_files | none | Project data shortcuts (L) | Coordinate file sharing (L) | OK |

### 6.9 AI

| Capability | Starr CAD now | AutoCAD | Civil 3D | Carlson | Weak or missing |
|---|---|---|---|---|---|
| Point-to-drawing assistant | OK six-stage pipeline with review queue and confidence | none | none native | none native | Starr advantage; tuned to Starr dialect |
| Chat that edits the drawing | OK 25 tools, 4 modes, scope chips, one-undo | Autodesk Assistant (ask-only for help, M) | same (L) | none (L) | Reach 39 percent; role gate blocks drafters |
| Deed to geometry | OK regex plus Claude parser | none | none | none | Texas phrasing |
| Reconcile records / sketch | OK | none | none | none | Needs research readings as input |
| Explain "why did AI draw this" | OK provenance popup | none | none | none | Keep |

## 7. Modes and layout templates

A mode is a data bundle, not a code branch. Every mode runs on the same command registry, so a drafter can switch live from the avatar menu and nothing is lost. A first-run screen asks one question: "What software do you know best?" and sets the default mode. Role (drafter, party chief, RPLS, office) sets which panels are shown inside the mode.

What a mode defines:

| Field | Examples |
|---|---|
| Command aliases | AutoCAD L, PL, CO, TR, EX; Carlson menu names; MicroStation key-ins (editable table; import `acad.pgp`) |
| Key map | F-keys, Ctrl combos, chords; conflict-checked |
| Mouse map | pick, Enter, wheel, middle, right-click behaviour (AutoCAD right-click is Enter or shortcut menu; MicroStation uses data point, reset, tentative) |
| Menu/ribbon | ribbon with tabs and panels, pull-down menus, or task toolboxes |
| Panels | which docks open, order, default sizes (Properties, Layers, Prospector-like survey tree, Toolspace-like settings tree) |
| Command line | position, dynamic input on/off, prompt wording, option keywords, history |
| Snap and tracking defaults | running snaps, polar angles, tracking |
| Selection model | pick-first, implied window/crossing colours and direction, window vs crossing rule, Shift behaviour |
| Colours, cursor | background (black or white), crosshair size/full-screen, selection and hover colours, grid style |
| Units and angle display | decimal degrees, DMS, bearings vs azimuth; precision |
| Terminology map | layers vs levels, blocks vs cells, xrefs vs references, points vs coordinates |
| Status-bar items | which toggles show |
| Template defaults | template, text height by scale, layer standard, label styles |
| Starter workflow cards | "Import points and field-to-finish", "Close a traverse", "Plat sheet" worded the way that product words them |

Proposed built-in modes:

| Mode | Layout | Entry style | Look and behaviour | Survey workflow |
|---|---|---|---|---|
| STARR CAD (default) | Survey-first: top quick-access plus a slim ribbon with Draw, Modify, Survey, Annotate, Sheet, Review; left layers/properties; command search (Ctrl+K) always visible; bottom command line and status strip | Command search, click, command line | White background; modern selection (window blue, crossing green); fewer controls and one door per task; job-aware (opens inside a job) | Import, codes, closure, plat checklist as a guided strip |
| AutoCAD | Ribbon (Home, Insert, Annotate, View, Manage, Output) with Home panels Draw, Modify, Annotation, Layers, Block, Properties, Groups, Utilities, Clipboard; Properties palette (Ctrl+1) docked; command line (Ctrl+9) with dynamic input (F12); Model/Layout tabs | Command line aliases and Enter/Space repeat, Esc cancel | Black model background option; window left-to-right solid blue, crossing right-to-left dashed green; F3 osnap, F7 grid, F8 ortho, F9 snap, F10 polar, F11 tracking, F12 dynamic input; wheel zoom, middle pan, right-click Enter | Express and survey add-in commands on a Survey tab |
| Civil 3D | AutoCAD mode plus Toolspace (Prospector, Settings, Survey, Toolbox tabs), contextual ribbon tabs for the selected object type, Panorama-style tables, Home > Create Ground Data and Create Design panels | AutoCAD aliases plus transparent commands (`'BD`, `'AD`, `'NE`, `'PN`) | Styles and label styles from Settings tree; description keys; point groups; parcels, alignments as objects | Survey tab flow: import survey data, figures, linework code sets, traverse analysis, parcel layout |
| Carlson | Pull-down menus (Carlson menus: Survey, Points, Inquiry, Draw, Annotate, Modify, Area, Lines/Curves) over a command line; modal dialogs with "pick" buttons that hide the dialog, pick on screen, and return | Menu and dialogs first, command line second | Coordinate-file-centric (point numbers everywhere); text size set from plot scale at setup; field-to-finish and raw data processing front and centre | Field-to-finish, process raw data, traverse and adjust, area and legal description, stakeout |
| MicroStation | Task navigation and tool boxes, key-in window, AccuDraw compass for typed precision, Reference and Level dialogs; workspace and workset chooser | Key-ins (PLACE LINE, MOVE, COPY) and tool settings window | Mouse: left data point, right reset, middle tentative snap; AccuSnap on hover; element selection tool by default, fence tool; terminology levels, cells, references | Survey tools exposed as a task set |
| TBC (Trimble Business Center) | Ribbon by workflow (Home, Survey, COGO, Linework, Surface, Review, Report, Publish), Project Explorer and Properties panes, Plan View with section and profile views | Ribbon commands and the command pane, mouse selection | Observation-based project database; compute inverse, compute traverse, create boundary; reports from a report manager | Import raw data, adjust, compute, review report, publish |

How layout templates differ from modes: a layout template is only the panel arrangement (which panels, where). Users can save any arrangement as a named template (for example "Plat drafting two monitors", "Field cleanup on laptop") and a firm can publish templates to its users. A mode picks one or more default templates.

Build order for modes: STARR default and AutoCAD first (they share most conventions), then Civil 3D (adds the survey tree and styles), then Carlson, MicroStation and TBC. Each mode ships a one-page cheat sheet generated from its alias table.

## 8. Deep customisation (what the owner asked for)

Everything customisable, at three scopes: user, firm, drawing. Today almost nothing is user or firm scope (see `cad.customization`).

- Command aliases and key map (import from `acad.pgp`, Carlson or Civil 3D files); conflict checker blocks collisions at edit time.
- Macros: record a sequence of commands with their inputs, bind to a key, button or alias; share per firm.
- Ribbons, menus, toolbars and palettes: drag to reorder, hide, add your own; per-mode and per-role defaults.
- Workspaces and layout templates (section 7); named and shareable.
- Standards: layers, linetypes, symbols, fills, text/dimension/leader/table styles, plot styles, code table and dialect, label styles, description boilerplate, title block designer, standard notes, certification wording per state, units and CRS defaults.
- Scripting API (TypeScript) over the command registry with a sandbox; firm script library; batch jobs over folders (convert, re-style, re-label, export).
- Integrations screen: outbound webhooks and data targets per firm.
- Settings search; profile export/import; reset to mode defaults.

## 9. Decisions the owner needs to make in the planning phase

1. DWG: licence a library (ODA), call a conversion service (Autodesk APS), or stay DXF-only for v1. This decides how credible the product is to clients and other firms.
2. Scope boundary: stay 2D plus survey database (points, observations, parcels, alignments) or add surfaces and contours, point clouds, 3D. Civil 3D and Carlson users expect surfaces; most boundary shops do not.
3. Primary platform: web-first with a desktop shell, or desktop-first with web viewer. The current desktop build cannot do cloud or AI.
4. Offline and real-time: how much offline editing, and whether two people may edit one drawing at once (lock, presence, merge).
5. Seal and signature: what each target state accepts (image plus hash vs certificate-based digital signature), and who may seal (server-verified licence).
6. Target customer: size and software mix of the first outside firms, which sets which modes ship first.
7. Starr-specific products (Compass, Forge, Orbit, Traverse PC bundle, RECON): ship as presets or keep private.
8. AI: model choice, per-firm API keys or a proxy, usage caps, and whether drafters may run it (today they cannot).

## 10. Facts to carry into the plan (from the code and the audits)

- Performance is measured and fine to 50,000 features at p95 11 ms; 200,000 was fixed to fit the 16.7 ms budget (C2 to C4). Keep the fixtures and add fills, labels and images.
- 20 of 51 commands (39 percent) are reachable by AI.
- 13 calculation surfaces behind seven doors; the hub (C28) now lists them; only Calc Point and Intersect write geometry with undo.
- Planning docs record these still-open items: combined scale factor and convergence (S16), golden Traverse PC and plat fixtures (owner), splitting `CanvasViewport.tsx` (ongoing), incremental spatial index (deferred), native Rust or wgpu renderer (profiling-gated), PKI signing (if a state accepts it), Claude narrative pass for descriptions, Orbit WGS84 output now that proj4 is installed, layer plot/no-plot flag.
- The click-order contract (`docs/cad-click-order-contract.md`) and reachability audit (`docs/cad-integration-points.md`) should become executable specs in the new build.
- Starr strings to parameterise: `STARR_SURVEYING_TEMPLATE`, `STARR_COMPANY_INFO`, `licenseState: 'Texas'`, `TEXAS_STATE_PLANE_ZONES`, `DEFAULT_TEXAS_ZONE_KEY`, Texas notes and certification text, the AI system prompt ("licensed Texas land surveyors"), completeness rules, `BOUNDARY-MON` style layer ids, code numbers 308/315/327, desktop identifier `com.starrsurveying.starr-cad`.
