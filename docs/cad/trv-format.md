# Traverse PC `.TRV` file format — what we know

Reverse-engineered notes on Traverse PC (TPC) job files, so nobody has to
re-derive them. Written 2026-10-01 from 24 of the firm's own job files
(TPC versions 24.0, 25.0 and 26.0; 22 `.TRV` + 2 `.TRB`), cross-checked
against the geometry. Nothing here comes from TPC documentation — TPC
does not publish the format. **Confidence** is marked on every claim:

- **confirmed** — checked against coordinates / labels across several files
- **inferred** — consistent with every sample but not proven
- **unknown** — preserved verbatim, meaning not decoded

Code: `lib/cad/io/trv-parser.ts` (records → typed document),
`lib/cad/io/trv-model.ts` (document → resolved drawing: layers, points,
lines, true arcs, shapes, labels, symbols), `lib/cad/io/trv-geometry.ts`
(arc maths), `lib/cad/io/trv-encoding.ts` (bytes → text),
`lib/cad/io/trv-to-drawing.ts` (→ Starr CAD features),
`lib/files/trv-preview.ts` + `app/admin/components/files/TrvPreview.tsx`
(file-viewer preview). Tests use the hand-written fixture
`__tests__/cad/io/fixtures/trv-synthetic.ts` (made-up data); real job files
must never be committed.

## Container

- Plain text, one record per line, **CRLF** line endings.
- **Encoding: Windows-1252 (ANSI), not UTF-8.** The degree sign in bearings
  is byte `0xB0`, the label line separator `¶` is `0xB6`. `File.text()` /
  `Response.text()` decode as UTF-8 and turn both into U+FFFD — always read
  TRV bytes through `decodeTextBytes` (BOM → strict UTF-8 → Windows-1252).
- Each line is `code,field,field,…`. No quoting; text fields can contain
  commas, so text is always the *last* field(s) and is re-joined.
- Lines starting `#` are comments / section markers: `#,SECTION NAME`.
- `.TRB` is TPC's backup copy — identical format.

### Sections (in file order)

| Marker | Contents |
|---|---|
| `#,TRAVERSE PC` + `# Full Version number,24.0.4.9 (09122024)` | banner |
| `999,begin` / `999,end` | wrap the whole body |
| `#,SURVEY` | job header, survey layers, projection |
| `#,GNSS` | receiver / accuracy settings (198, 199) |
| `#,Calibrations`, `#,Calibration Associations` | usually empty |
| `#,POINTS` | point records |
| `#,LINES` | curves between two points (20-23) |
| `#,TRAVERSES` then one `#,TRAVERSE` per traverse | traverses / polylines |
| `#,DRAWING GROUPS` | TPC layer-panel groupings (100) |
| `#,SURFACES` | (empty in all samples) |
| `#,Drawing` (sometimes `#,Sharing Drawing`) | drawing sheets and elements (28/29) |

## Header records (`#,SURVEY`)

| Code | Fields | Meaning | Confidence |
|---|---|---|---|
| 80 | `24.000` | TPC major version | confirmed |
| 81 | text | job description line | confirmed |
| 82 | `67108864` | flags (constant) | unknown |
| 83 | `0` | flags (constant) | unknown |
| 86 | `name,id,0` | **survey layer** table (Un-Assigned, Alignments, As-Builts, Boundaries, …, Topo — 19 in every sample). Third field always 0 (not a parent). | confirmed |
| 87 | address parts | job address | confirmed |
| 88 | name,… | surveyor / crew | inferred |
| 89 | text | job number | confirmed |
| 90 | path | source document path | confirmed |
| 91 | 11 fields | projection: field 8 = CRS file (`Local.crs`, a state-plane `.crs`), field 9 = `.pgm` | confirmed |
| 92 | 6 fields | ellipsoid: a, e², 1/f, name (`GRS 80`), b, e′² | confirmed |
| 93 | 5 fields | scale factor, rotation … | inferred |
| 94 | 3 fields | accuracy thresholds (ft) | inferred |
| 95 | n | next free point number (in `#,POINTS`) | inferred |
| 101 | text | project name | confirmed |
| 102 | `DD-MM-YYYY` | survey date | confirmed |
| 103 | `1` | always 1 — **not** the plot scale (that is in `28,0`) | inferred |
| 104 | `0` | units; 0 = feet in every sample | inferred |
| 105 | `0` | unknown flag | unknown |
| 106 | n | point count at save | confirmed |
| 107 | name, address | client | confirmed |
| 198, 199 | floats / flags | GNSS settings | unknown |

## Points (`#,POINTS`)

```
0,<id>              opens a point. Ids are strings: 1, 20fnd, 117R49, 22fnd:2, PRS92798179346
1,<description>     optional; free text, may contain commas
2,<N>,<E>,<Z>       NORTHING first, then EASTING, then elevation
3,<flags>           0 / 2 / 4 / 6 / 64 / 68 / 258 — a bit field, NOT a layer index
4,<method>,0,0      how the point was made: 5 (GNSS, most), 3, 1, 6 (traverse/COGO)
```

- `2,0,0,0` is a **placeholder** (TPC reserves an id); skip it when drawing. **confirmed**
- The same id can appear twice; the importer keeps the first and renames
  later ones `id:1`, `id:2` (`trv-to-drawing.ts`). **confirmed**
- Record `3` was historically read as the point's layer id; the values
  (only even numbers, plus 64/68/258) say it is flags. It is exposed as
  `TrvPoint.attrFlags` (and still as the legacy `layerId`). Points have no
  survey-layer assignment we can see. **inferred**

## Curves (`#,LINES`) — the file's own arcs

```
20,<fromId>
21,<toId>
22,<flags>,0,0        8 / 40 / 104 seen
23,<signedRadius>
```

Each entry is a **circular arc between two points with a signed radius**.
In every sample |radius| ≥ chord / 2.

- **Sign — confirmed.** Negative radius: the centre is on the **left** of
  from→to, the arc runs **counter-clockwise**. Positive: centre on the
  right, clockwise. Verified with concentric offset curves (`105→106 R-16`,
  `105R1→106R1 R-16.6`, `105R2→106R2 R-17.6` share one centre only with
  this rule) and with chains of drawing-element arcs (below) that meet
  tangentially.
- **Minor arc** (|Δ| ≤ 180°) is assumed — no sample needs a major arc.
  Flag bit 64 (only in `104`, one sample) might mean "major"; **unknown**.
- A traverse edge from→to is drawn as this arc when a LINES entry exists for
  the pair (either direction; reversed pairs flip the sign). 104 of 108
  sample entries are used by a traverse; the rest are standalone curves and
  are drawn on their own. Duplicate entries (same pair twice) are common.

Arc maths (`arcFromChordAndRadius`): with chord c, R = |r|,
h = √(R² − c²/4), centre = midpoint ± h · left-normal; Δ = 2·asin(c / 2R);
length = RΔ; segment area = R²/2 · (Δ − sin Δ).

## Traverses (`#,TRAVERSE`)

One block per traverse: a header, ~35 styling / label-format records, then
the point list.

### Header

| Code | Meaning | Confidence |
|---|---|---|
| 30 | name (`BOUNDARY`, `ROAD`, `24104.csv`, `Copy-ADJ2`) | confirmed |
| 1 | description (often the source CSV path) | confirmed |
| 31 | `flags,traverseId,order,0`. **Field 1 is TPC's traverse id** — `28,14,<id>` area labels reference it. Flags seen: 0, 0x1000, 0x4000, 0x5000, 0x20000002, 0x20001002, 0x20004002, 0x20005002, 0x80000 (not decoded). | id confirmed; flags unknown |
| 33 | **area** in square feet, as TPC computed it (matches the `28,14` label text) | confirmed |
| 32 | `0|1, angle, distance, angle` — rotation / translation settings | inferred |
| 51 | line style: field 0 = weight (≥ 4 bold), field 1 = line type (1 solid, −43 fence wire; 0, 2, 6, 10, 39, 40, 75, −19 are other dashed / patterned types, patterns unconfirmed), field 4 = flags/colour (sign bit set — not RGB) | weight/type confirmed for 1, −43 |
| 70, 71 | fill: 71 field 0 ≥ 5 → fill pattern index (field 0 − 5) | confirmed for two patterns (`trv-fill-patterns.ts`) |
| 47, 48 | label content codes (`BH` = bearing+horizontal distance, `YXZD` = coordinates…) | inferred |
| 159-162 | bearing / distance / curve label templates (`'R`, `'A`, `'T`, `'D`, `'LC` = radius, arc, tangent, delta, long chord) | inferred |
| 34-38, 40-46, 49, 50, 60, 76, 129-141, 163, 164, 349-369 | per-traverse report / label / print settings | unknown — preserved verbatim |

### Point list

```
10,<pointId>
11,<flags>,<seq>,0,<drawingLayerId>,0
[12,<132|134>]
[13,<flags>,<dist>,<dz>,<azimuthDeg>,0,<radius>,<n>f]
[190,…]
```

- `11` flags — **inferred**:
  - bit 8: normal vertex (set on almost every ref)
  - **bit 16: pen up** — no line is drawn *into* this ref. Every ref of a CSV
    point list carries it; inside ordinary traverses, segments into such refs
    never carry a `28,15` label (0 of 12, base rate 12%). Drawn as a gap.
  - bit 4: the point was computed by COGO (a `13` follows)
  - 0: terminal ref of an open traverse
- `11` field 3 = the **drawing layer** of the segment (always 3 = `TPCLines`). **confirmed**
- `12,132` marks a ref where a curve leaves; `12,134` the last ref of a curve
  run. The radius itself comes from `#,LINES`. **inferred**
- `13` is the COGO observation that produced the point: distance, Δz,
  azimuth (decimal degrees, from the previous point), and field 5 = curve
  radius magnitude when the edge is a curve. **confirmed** (distances /
  azimuths match the coordinates)
- **Closed** when the last ref repeats the first id (or, with ≥ 4 refs, the
  first and last coordinates coincide). **confirmed**
- Names: `*.csv` = an imported point list (TPC shows symbols only — do not
  connect); `Copy-…`, `DUP-…`, `Right|Left N Feet-…`, `… offsets` =
  construction copies TPC does not plot. **confirmed**

## Drawing sheets and elements (`#,Drawing`)

Every element is a `28,<subtype>,…` record followed by zero or more
`29,<subtype>,…` property records.

### Sheet header `28,0`

```
28,0,0,<sheetName>,0,<flags>,<scale ft/in>,1.0,<paperW in>,<paperH in>,<margins ×4>,<?>,<?>,<?>,<rotation°>,1
```

`29,0,<n>` properties of the sheet:

| `29,0,n` | Meaning | Confidence |
|---|---|---|
| 1, 2 | defaults: label templates, page number format | inferred |
| 3, 4 | printer / page setup | confirmed |
| 6 | (on `28,10`) block definition marker | inferred |
| **7** | **drawing layer**: `name,id,flags,0,visible,weight,scale,colour` — `0`, `TPCSymbols`(1), `TPCPointLabels`(2), `TPCLines`(3), `TPCLineLabels`(4), `TPCLotLabels`(5), `TPCLotAreas`(6), `Leaders`(16), `TPCFills`(18), `Background`(21), `TPCLotSetbackLines`(22), `CrowsFeet`(24), `TPCContourMinor`(10), plus user layers. flags 0x10000000 = TPC system layer, 0x40000000 = user layer. colour −1 = default (black); otherwise a Windows COLORREF `0x00BBGGRR` (no sample uses one). | names/ids confirmed; colour inferred |
| 8 | survey extents `x1,y1,x2,y2` | confirmed |
| 9 | font table `index,face` | confirmed |
| 10 | sheet centre in world `E,N` | confirmed |
| 11 | layer draw order | inferred |
| 17-19 | misc | unknown |

A file can hold **more than one sheet** (`28,0` appears twice in 2 of 24
samples). The elements after a `28,0` belong to it, and sheets repeat the
same labels — draw one sheet. The parser tags each element with
`sheetIndex`; the primary sheet is the one with the most elements.

### Element style `29,2` (on nearly every element)

```
29,2,<attr>,<layerId>,<?>,<weight>,<lineType>,<flags>,<space?>,<?>,<seq>,0,0,<scale>
```

- field 1 = **drawing layer id** (confirmed: point labels → 2, line labels → 4,
  area labels → 6, symbols → 1, connectors → 3, user drawing → 0 or a user layer)
- field 4 = line weight, field 5 = line type (same codes as `51`)
- field 7 is 0 for most model-space elements and 1-4 for most sheet
  (paper) elements — a hint only, not reliable on its own
- field 9 = the element's sequence number; labels can reference it as `@<seq>`

### Text run `29,5`

```
29,5,<dx in>,<dy in>,<?>,<?>,<size pt>,<rotation ×10>,<align>,<text…>
```

- dx/dy: offset from the anchor in **paper inches** (× sheet scale = feet). **confirmed**
- rotation in **tenths of a degree, counter-clockwise** (3485 → 348.5°, the
  reading direction of a N 78° W line). **confirmed**
- align: bit 2 = centred horizontally, bit 4 = centred vertically (0, 6, 8,
  14 seen). **inferred**
- text: `¶` separates lines; `\x14` (DC4) separates a point id from its
  description inside a label.

### Element subtypes

| `28,n` | Layout | Meaning | Space | Status |
|---|---|---|---|---|
| 0 | see above | sheet | — | parsed |
| 1 | `0,0,0` + `29,1,*` | label / style defaults for the sheet | — | preserved |
| **4** | `E1,N1,E2,N2,Z` | **line** | world or paper | drawn |
| **5** | `x,y,?,?,size,rot×10,align,text…` | **text note** | world or paper | drawn (world) |
| 6 | `x1,y1,x2,y2,0,w,h,0,0` | box / table cell | paper | counted |
| 7 | `x,y,r,0` | small circle | paper | counted |
| **8** | `E1,N1,E2,N2,signedRadius` | **arc** — same sign rule as `#,LINES` (chains of these meet; centres consistent). Round radii (350, 85, 70) confirm field 5 is a radius, not a bulge. | world or paper | drawn as true arc |
| 10 | `blockId,name,dxfPath,…` | DXF block definition (north arrow, scale bar) | paper | counted |
| **11** | `symbolNo,pointId` + `29,32,?,size,rot,symbolNo` + `29,3,E,N,Z` | **point symbol** placed on a point | world | drawn as marker |
| **12** | `pointId` + `29,5` | **point label** | world | drawn |
| **14** | `traverseId` + `29,5` | **area label** of the traverse whose `31` id matches (placed at its centroid) | world | drawn |
| **15** | `fromId,toId` + `29,5` | **segment label** (bearing / distance) at the segment midpoint (arc midpoint for curves) | world | drawn |
| **15** | `@seq,…` + `29,5` | label on drawing element `seq` (e.g. a distance on a `28,4` line) | world | drawn |
| **16** | `fromId,toId` | **connector** line between two points | world | drawn |
| 20 | `2,1,0,…` + `29,5 …Border` | sheet border | paper | counted |
| 24 | many | line / curve table | paper | counted |
| **27** | `n,E1,N1,…,arrowSize,…` | **leader** (arrow at the first vertex — inferred) | world | drawn |
| **30** | `n,E1,N1,…` + `29,-30` | **polyline**; closed when first = last | world or paper | drawn |
| 31 | — + `29,3,x,y,z` | anchor / insertion point | paper | counted |
| 32 | `blockNo,scale,rot,blockId` + `29,3,x,y` | block insert (north arrow …) | paper | counted |
| 33 | `x,y,…,text` | title-block text with variables (`$CLIENT`) | paper | counted |
| 34 | `0,LINE,BEARING,DISTANCE` | table header | paper | counted |
| 45 | `\|\|image.png\|\|` + `29,6` | embedded image | world | counted |
| 46 | `E1,N1,E2,N2,…` | dimension (inferred) | world | counted |
| 66 | `…,\|\|{{[0]}}\|\|` | field / variable text | paper | counted |

**World vs paper.** Paper coordinates are sheet inches (|x|, |y| < ~60);
world coordinates are survey feet. `trv-model.ts` treats an element as
world when it lies within the (padded, outlier-trimmed) extents of the
survey points, and as paper when it is sheet-sized — except in a survey that
itself sits near 0,0, where only an explicit model-space style (`29,2`
field 7 = 0) makes a small coordinate world. The old magnitude rule
(|coord| > 100 000) dropped every world note in local-coordinate (5000/5000)
jobs.

## Drawing groups (`#,DRAWING GROUPS`)

`100,<name>,<id>,0` — TPC's layer-panel groups (Un-Assigned, As-Builts,
Control Diagrams, Lots, Plats, Proposed, Recorded, Research, Topos). Parsed
into `drawingGroups`; not used for drawing.

## Record census (24 samples)

Every code below appears in the samples and is either interpreted or
deliberately preserved (`KNOWN_TRV_CODES`). Anything else is counted in
`TrvDocument.unknownRecords` and kept verbatim in `lines` for round-trip —
**no sample has an unknown code**.

| Code | Lines | Files | | Code | Lines | Files |
|---|---|---|---|---|---|---|
| 0 / 2 / 3 | 5 364 each | 21 | | 28 | 2 018 | 21 |
| 1 | 4 100 | 21 | | 29 | 3 881 | 21 |
| 4 | 5 242 | 21 | | 30-51, 60, 70, 71, 76 | 428 each | 20 |
| 10 / 11 | 6 104 each | 20 | | 129-141 | 46-428 | 11-20 |
| 12 | 198 | 7 | | 159-162 | 252 each | 19 |
| 13 | 95 | 10 | | 163 / 164 | 57 each | 4 |
| 20-23 | 202 each | 7 | | 190 | 8 | 2 |
| 80, 83, 86, 93-95, 101-106 | 1 per file (86: 19) | 24 | | 349-369 | ~428 each | 20 |
| 81, 87-92, 107 | 1 per file | 1-19 | | 198 / 199 | 22 each | 22 |
| 100 | 189 | 21 | | 999 | 48 | 24 |

`28` subtypes seen: 0, 1, 4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16, 20, 24, 27,
30, 31, 32, 33, 34, 45, 46, 66.

## Not decoded / limits

- Traverse `31` flag bits, point `3` flag bits, `51` field 4, `29,2` field 0
  (attribute word) and field 3.
- Exact dash patterns for line-type codes other than 1 (solid) and −43
  (fence): drawn as a generic dash.
- Layer colours: every sample uses −1 (plotted black); a non-default value is
  decoded as a COLORREF but no file proves it.
- Major arcs (> 180°) — none in the samples.
- Paper-space content (title block, border, north arrow, line tables,
  images, dimensions) is counted but not drawn. The sheet centre, scale and
  rotation needed to place it are parsed (`TrvSheet`).
- Point symbols are drawn as a generic marker with TPC's symbol number; the
  TPC symbol library is not mapped to Starr symbols (Starr still assigns its
  own symbol from the point code).
