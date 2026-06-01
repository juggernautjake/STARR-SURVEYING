# TRV drawing-element rendering — recover the full plotted drawing — 2026-06-01

*User:*

> *"Please review these two files. One is a trv and the other is a
> pdf of the drawing of the trv. Please see if there is anything new
> or any new useful data to glean to help us build a perfect trv
> parser. Again, there are no curves in the data, everything is
> basically polylines."* … *"Build the plan to implement everything
> you think would improve the parser and starr cad software. Then
> once the plan is fully built, move it into the in progress folder
> so that the stop hook can then build it all out."*

Source files (Hillsboro First Church of the Nazarene, FM 286):
- TRV: `/root/.claude/uploads/444ef4fb-9540-443a-9263-b07e150d8beb/33616618-HILLSBORO_FIRST_CHURCH_OF_THE_NAZARENE_FM_286__26078__MAY_31_2026.trv`
- PDF plat: `/root/.claude/uploads/444ef4fb-9540-443a-9263-b07e150d8beb/a60f6b5a-HILLSBORO_FIRST_CHURCH_OF_THE_NAZARENE_FM_286__26078__MAY_31_2026_PLAT.pdf`

> NOTE for the builder: the upload paths above are ephemeral. Copy the
> TRV into `__tests__/fixtures/trv/hillsboro-nazarene.trv` (latin1) as
> the FIRST action so the integration specs have a stable fixture; gate
> those specs with `it.skipIf(!fs.existsSync(...))` exactly like
> `trv-two-layer-restructure.test.ts` already does for its sample.

## The core finding (verified against the raw file)

Traverse PC stores the **plotted drawing** as `28` drawing-element
records. We currently render only **traverses** (`30/31` + `10/11`)
and **three label subtypes** (`28,12` point labels, `28,14` area
labels, `28,15` segment labels) via `lib/cad/io/trv-drawing-elements.ts`.
**Every other `28` subtype is parsed but dropped on import** — it is
preserved for round-trip export only, never turned into a visible
feature. In this file that drops most of the linework and ALL the
text:

| `28,<sub>` | n | Meaning | Today |
|---|---|---|---|
| **16** | 12 | Connector line by **point-id pair** `28,16,302,303` (chains form polylines: 263→264→…→268) | dropped |
| **30** | 11 | **Coordinate polyline** `28,30,<nPts>,E1,N1,E2,N2,…` (footprints / structures) | dropped |
| **4** | 7 | **Line segment** `28,4,E1,N1,E2,N2,Z` | dropped |
| **5** | 65 | **All plat text** — world annotations ("conc.", "asphalt parking", deed calls "(call N 0°48'09" E 356.76')"), survey notes, **full title block** | dropped |
| **6** | 15 | Dimension / leader lines (mostly paper-space) | dropped |
| 12/14/15 | 41 | point / area / segment labels | ✓ rendered |

### Verified facts the builder MUST honor

1. **Axis order is FLIPPED vs points.** Point records `2,N,E,Z` are
   (North, East). Drawing-element coords (`28,4`, `28,30`, `28,5`
   world text) are **(East, North)**. Proof: point 302 =
   `2,10711989.132,3304115.476,729.316` → N=10.71M, E=3.30M; the first
   `28,4` = `3304448(E),10711693(N)`. Starr world space is `{x: E, y:
   N}` (see `lib/cad/import/linework-features.ts`), so element coords
   map **first field → x, second field → y directly** (no swap),
   whereas points map easting→x / northing→y. Do NOT swap element
   coords.
2. **`28,16` connectors overlap traverses.** Points 263–268 are all
   `10,id` traverse members, so the connector chain duplicates traverse
   edges. Render `28,16` but **dedup against already-rendered traverse
   polyline edges** (key each undirected edge `min(a,b)|max(a,b)`), or
   the plat will show doubled lines. Pairs NOT covered by a traverse
   edge (e.g. `28,16,364,517`, `28,16,318,522`) are genuine new lines.
3. **`28,5` has two coordinate spaces.** Large coords (|x|>100000) =
   world placement ("grass" at `3304420.64,10711661.37`); small coords
   = paper-space title-block text (`-1.90,1.60 … STARR SURVEYING`).
   Route by magnitude.
4. **Text needs cleaning.** `¶` = newline; latin1 `0xB0` shows as `°`;
   strings can be long multi-line legal notes. Reuse + extend
   `cleanLabelText` in `trv-drawing-elements.ts`.
5. **The parser already captures everything.** `parseTrv` stores each
   `28` element's full `header: string[]` + `properties: string[][]`
   (`lib/cad/io/trv-parser.ts`), so this work is **purely additive
   mapping** — no parser changes needed for geometry/text.

## Round-trip contract (applies to every slice below)

`drawing-to-trv.ts` re-emits the original `28` block **verbatim** from
`opts.drawingElements`. Therefore every feature we synthesize from a
`28` element is a **render echo** and must be EXCLUDED from the
feature-driven export, exactly like the `trvPointMirror` points:

- Tag each synthesized feature `properties.trvDerived = true` plus
  `properties.trvElementKind` (`'CONNECTOR' | 'ELEMENT_POLYLINE' |
  'ELEMENT_LINE' | 'ELEMENT_TEXT' | 'ELEMENT_LEADER'`) and
  `properties.trvElementSourceLine` (the source line index, for a
  future edit-through round-trip).
- In `drawingToTrv` (fresh path) **and** `mergeSourceTrvWithDoc`
  (smart-merge): skip `f.properties.trvDerived` when building the point
  list, the traverse list, AND `featuresByTrvId`. Net effect: a fresh
  import → immediate export stays byte-stable; the verbatim `28` block
  is the single source of truth.
- Document the known limitation: editing a derived feature's geometry
  does NOT yet patch its `28` source record (see Slice 7 — future).

All synthesized features land on the **file-named Drawing layer**
(`trvDrawingLayerKey(prefix)` from `trv-to-drawing.ts`), consistent
with the dual-layer import. They get `defaultStyle()` and must be
fully selectable/editable like any other feature.

## Slices

### Slice 1 — `28,16` connector lines → linework (deduped)

> **DONE (2026-06-01).** `extractConnectors` added; `trvToDrawing`
> renders `28,16` as `trvDerived` LINE features on the file-named
> Drawing layer, deduped against rendered-traverse edges (undirected
> keys + POLYGON closing edge). The `trvDerived` round-trip guard is
> in place across `drawingToTrv` (point + traverse filters) and
> `mergeSourceTrvWithDoc` (featuresByTrvId + add passes), so derived
> echoes never double-emit. Fixture `__tests__/fixtures/trv/
> hillsboro-nazarene.trv` added; specs in `trv-connectors.test.ts`.
> Note from the real sample: all 12 of its `28,16` connectors
> coincide with rendered traverse edges, so they correctly dedup to
> 0 new lines — the value shows on files where connectors are
> standalone linework. Chain-merging into POLYLINEs was deferred (no
> standalone-connector chains in the sample to validate against;
> individual LINEs are correct and editable). Suite 2483 green.

- `trv-drawing-elements.ts`: add `extractConnectors(elements)` →
  `{ fromId: string; toId: string; sourceLine: number }[]` (header[0]
  === '16', header[1]=fromId, header[2]=toId).
- `trv-to-drawing.ts`: after traverses are built, for each connector
  resolve both points via the existing `pointById` / point-feature
  lookup. Build a **traverse-edge set** from every rendered POLYLINE/
  POLYGON's `trvPointRefs` (consecutive pairs, undirected). Skip
  connectors whose pair is in that set. For the rest, emit a `LINE`
  feature between the two points' coordinates.
  - Stretch (same slice if cheap): **merge chains** — connectors that
    share endpoints (a→b, b→c …) collapse into one `POLYLINE` feature
    so the surveyor edits the run as a unit. Otherwise individual
    `LINE`s are acceptable.
- Tag `trvDerived` + `trvElementKind:'CONNECTOR'` + source line.
- Notes: push `Rendered N connector line(s) from drawing-element subtype 16 (M deduped against traverses)`.
- Tests (`__tests__/cad/io/trv-connectors.test.ts`): connector →
  LINE with endpoints equal to the referenced points' coords; a
  pair that matches a traverse edge is skipped; missing point ref is
  skipped + noted.

### Slice 2 — `28,30` polylines + `28,4` lines → geometry

> **DONE (2026-06-01).** `extractElementShapes` added (handles both
> `28,30` and `28,4`): reads inline (E,N) coords → `{x:E,y:N}`,
> collapses consecutive duplicate vertices, detects closure
> (first≈last, drops the closing dup). `trvToDrawing` maps them to
> `trvDerived` LINE / POLYLINE / POLYGON features on the Drawing
> layer. Round-trip safe via the existing `trvDerived` traverse-filter
> guard (verified: derived polylines emit no `30/31`). Specs in
> `trv-element-shapes.test.ts`; Hillsboro integration asserts all 11
> polylines + 7 lines render. Open `28,30` are kept OPEN (not
> force-closed) to avoid fabricating a closing edge. Suite 2490 green.

- `trv-drawing-elements.ts`: add `extractElementShapes(elements)` →
  `{ kind:'POLYLINE'|'LINE'; vertices: Point2D[]; closed: boolean; sourceLine: number }[]`.
  - `28,30`: header = `['30', nPts, x1,y1, …]`; read `nPts` pairs as
    `{ x: E(field), y: N(field) }` (first→x, second→y). `closed` =
    first vertex ≈ last vertex within 1e-4, or trailing duplicate pair
    (the file shows a repeated final pair). Drop the duplicate closing
    vertex when closed.
  - `28,4`: header = `['4', E1,N1,E2,N2, Z]` → 2-vertex LINE.
- `trv-to-drawing.ts`: map each to a `POLYLINE` (or `POLYGON` when
  `closed`) / `LINE` feature on the Drawing layer; `defaultStyle()`
  outline-only (no fill); tag `trvDerived` +
  `trvElementKind:'ELEMENT_POLYLINE'|'ELEMENT_LINE'` + source line.
- Notes: `Rendered N polyline(s) + M line(s) from drawing elements (subtypes 30 / 4)`.
- Tests: 28,30 with 6 pairs → 6-vertex POLYLINE in (E,N)→(x,y) order;
  closure detection → POLYGON with the dup vertex removed; 28,4 →
  2-vertex LINE.

### Slice 3 — `28,5` world-placed text annotations → TEXT features

> **DONE (2026-06-01).** `extractTextElements` added: parses
> `28,5,x,y,a,b,fontSize,c,d,<text>`, rejoins comma-bearing text from
> field 9+, cleans `¶`/DC4 via `cleanLabelText`, and splits WORLD vs
> PAPER by |coord|>100000. `trvToDrawing` renders WORLD text as
> `trvDerived` TEXT features at (E,N)→(x,y) on the Drawing layer, with
> the TPC size on `properties.fontSize` (what `CanvasViewport` reads).
> TEXT isn't part of the TRV feature-export, so round-trip stays
> byte-stable (verified). Paper-space `28,5` deferred to Slice 4.
> Specs in `trv-text-elements.test.ts`; Hillsboro renders ~56
> annotations incl. "grass". Suite 2496 green.

- `trv-drawing-elements.ts`: add `extractTextElements(elements)` →
  `{ x:number; y:number; fontSize:number; text:string; space:'WORLD'|'PAPER'; sourceLine:number }[]`.
  Format `28,5,x,y,a,b,fontSize,c,d,text` — `text` = LAST field
  (it may itself contain commas? no — TPC quotes none, but the legal
  notes contain commas → JOIN fields from index 9 to end with ','.).
  `space = (Math.abs(x) > 100000 || Math.abs(y) > 100000) ? 'WORLD' : 'PAPER'`.
  Clean via an extended `cleanLabelText` (handle `¶`→`\n`, `°`,
  collapse repeated spaces but PRESERVE intended newlines).
- `trv-to-drawing.ts`: for `space==='WORLD'`, emit a `TEXT` feature at
  `{ x, y }` with `geometry.textContent = text` and a font size derived
  from `fontSize` (store on style or `properties.fontSizePt`). Land on
  the Drawing layer. Tag `trvDerived` + `trvElementKind:'ELEMENT_TEXT'`.
  (Verify the existing TEXT feature render path in `CanvasViewport.tsx`
  draws `geometry.textContent`; mapper `recon-to-cad.ts` already sets
  `geometry.textContent` for TEXT, so the renderer supports it.)
- Notes: `Rendered N map text annotation(s) from drawing-element subtype 5`.
- Tests: world `28,5` → TEXT at (x=E,y=N) with cleaned text; degree
  symbol + `¶` newline handled; paper-space `28,5` is NOT emitted here
  (Slice 4 owns it).

### Slice 4 — `28,5` paper-space title block + `28,6` leaders

> **DONE (2026-06-01) — structured fields shipped; geometric
> placement deferred.** `extractTitleBlockHints` pattern-detects the
> firm name, surveyor name + RPLS license (cert line), job number +
> customer ("JOB NO… CUSTOMER:"), and flood note from the paper-space
> `28,5` text. `applyTrvMetadataToTitleBlock` now takes these hints
> (3rd arg) and fills the matching title-block fields non-
> destructively; `TrvImportReport.titleBlockHints` carries them and
> both MenuBar apply sites pass them. The report's point/traverse
> counts were also corrected to exclude `trvDerived` features. Specs
> in `trv-titleblock.test.ts` (incl. a Hillsboro end-to-end hint
> check). Suite 2503 green.
>
> **Deferred — geometric paper-space placement** of `28,5` positioned
> text and `28,6` leader/dimension lines. Rationale: Starr features
> live in WORLD space and TPC's paper-coordinate transform (origin /
> scale relative to the sheet) is not reverse-engineered; placing the
> raw small coords (e.g. `-1.90, 1.60`) as world features would land
> them at the world origin, far from the survey — wrong, and worse
> than recovering the content into the structured title block, which
> renders in Starr's own block. Revisit if the paper transform is
> mapped (the `28,5`/`28,6` records still round-trip verbatim, so
> nothing is lost).

- Paper-space `28,5` (`space==='PAPER'`): emit `TEXT` features in
  **paper space** on the protected `SURVEY-INFO` layer, positioned by
  the small coords, preserving font size. This recovers firm name, job
  no., surveyor, firm #, and the multi-line survey notes as editable
  drawing furniture.
  - Stretch: pattern-detect known lines (`STARR SURVEYING`, `JOB NO.
    \d+`, `CUSTOMER:`, surveyor name, `TEXAS LICENSED SURV. FIRM NO.`)
    and ALSO populate the structured title block via
    `applyTrvMetadataToTitleBlock`-style fill (non-destructive). Keep
    the positioned-text fallback so nothing is lost when a pattern
    doesn't match.
- `28,6` leader/dimension lines → `LINE` features on `SURVEY-INFO`
  (paper-space), tag `trvElementKind:'ELEMENT_LEADER'`. Lower priority;
  fine to ship behind the text work.
- Tests: paper-space `28,5` → SURVEY-INFO TEXT at the paper coords;
  title-block firm/job pattern fills the structured fields when present.

### Slice 5 — Round-trip safety for derived features

> **DONE (2026-06-01).** The `trvDerived` guard mechanism shipped
> incrementally across Slices 1-4 (point + traverse filters in
> `drawingToTrv`, plus `featuresByTrvId` + add passes in
> `mergeSourceTrvWithDoc`). This slice adds the consolidating proof:
> `trv-derived-roundtrip.test.ts` builds the full Hillsboro doc (with
> connectors + element polylines/lines + text echoes present) and
> asserts the smart-merge export is byte-equal to the source, the
> fresh export's `95,N` counts only real points, and the emitted
> `30,` traverse-opener count equals the real traverses only. The
> `Feature.properties` flags (`trvDerived`, `trvElementKind`,
> `trvElementSourceLine`, `trvPointMirror`) are now documented in
> `types.ts`; they already fit the `string|number|boolean` value
> type. Suite 2507 green.

- `lib/cad/types.ts`: document the new `properties` flags
  (`trvDerived`, `trvElementKind`, `trvElementSourceLine`). They are
  free-form `Feature.properties` keys (no type change needed beyond a
  doc comment) — confirm `properties` is `Record<string, unknown>`.
- `drawing-to-trv.ts`:
  - Fresh `drawingToTrv`: the points filter already excludes
    `trvPointMirror`; ALSO exclude `trvDerived`. The traverse list
    (`POLYLINE`/`POLYGON`) MUST exclude `trvDerived` (else derived
    polylines double-emit as `30/31`).
  - `mergeSourceTrvWithDoc`: exclude `trvDerived` from `featuresByTrvId`
    and from the add/delete passes.
- Tests (`__tests__/cad/io/trv-derived-roundtrip.test.ts`): import the
  Hillsboro fixture → `drawingToTrv` → the output `28` block equals the
  source `28` block (verbatim) and contains NO extra `30/31`/point
  records from derived features; the `95,N` count is unchanged.

### Slice 6 — Line-type / fill decode hardening

- The `51` records in this file are 35-field **font/label** styling
  blocks (contain `Arial,Arial`), a different shape from the line-style
  `51`s cracked earlier. **Verify `decodeTrvLineStyle`
  (`lib/cad/io/trv-line-style.ts`) is not invoked on / does not
  misread these** (it should only run on the per-traverse line-style
  `51`, identified by context/section). Add a shape guard + a unit test
  feeding a font-shaped `51` and asserting it yields no spurious line
  type.
- Fill: `71,60,…` is beyond TPC's 47-entry catalog → ensure
  `trv-fill-styling.ts` clamps unknown indices to `NONE` (it likely
  already does; add a test for index 60).
- Line-type field values seen: `0, 6, 10, 39, 40` (in line-context
  `51`s elsewhere) fall back to SOLID. Best-effort: extend the map IF a
  reliable code→dash reference is available; otherwise keep SOLID +
  leave a `// TODO unverified TPC line-type codes` note. No fabrication.
- Tests as above.

### Slice 7 — Metadata polish + import-dialog counts (low priority / optional)

- `100` Drawing Groups (`100,Plats,4,0`) → optionally surface as Starr
  layer groups (or just keep preserved). `136–162` (bearing/distance
  format templates) and `349–369` (print/report config) stay preserved;
  document them in `trv-parser.ts` comments so they're not re-flagged.
- `MenuBar.tsx` import-confirm + `trv-io.ts` `TrvImportReport`: add
  counts for connector lines / element polylines / text annotations so
  the confirm dialog reports what was rendered (e.g. "12 connector
  lines, 11 polylines, 65 text labels").

### FUTURE (not in this build) — edit-through round-trip of `28` elements

Editing a derived feature should patch its `28` source record on
export (smart-merge for drawing elements, keyed off
`trvElementSourceLine`) instead of the verbatim re-emit winning. Out of
scope here; the `trvElementSourceLine` stamp is laid down now so this is
a clean follow-up.

## Cross-cutting acceptance

- Run the Hillsboro fixture through `trvToDrawing` and assert: ≥ the
  expected counts of connector lines, element polylines/lines, and text
  features appear on the Drawing layer; points still mirror to both
  layers (independent, per the prior slice); round-trip stays
  byte-stable.
- Per slice: `npx tsc --noEmit`, `npx vitest run __tests__/cad/`,
  `npm run lint`, then commit with the session footer
  `https://claude.ai/code/session_017DegH8Gdk2dSMUDdu9LUEx`.
- Keep every change additive + behind the existing import path; do not
  regress the 2478 passing cad specs.

## TL;DR

Traverse PC keeps the real plotted drawing in its `28` records; we only
render 3 label subtypes today. Render the rest — `28,16` connector
linework (deduped against traverses), `28,30` polylines, `28,4` lines,
and `28,5` text (world annotations + title block) — as derived,
editable features on the file-named Drawing layer, using the verified
(E,N) element axis order, while keeping the verbatim `28` block as the
round-trip source of truth so exports stay byte-stable.
