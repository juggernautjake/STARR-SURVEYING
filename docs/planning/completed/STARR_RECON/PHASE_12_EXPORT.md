# Phase 12: Drawing Templates & Export

**Starr Software — AI Property Research Pipeline Phase**

**Status:** ✅ COMPLETE v1.0 (March 2026)

**Goal:** Enable surveyors to export plat drawings in all industry-standard formats — SVG, JSON (already done), PNG (print quality), PDF (print-ready), and DXF (AutoCAD/Civil 3D). Provide reusable drawing templates for consistent output.

---

## What Was Built

### v1.0 (March 2026)

| Module | File | Status | Tests |
|--------|------|--------|-------|
| Export Service | `lib/research/export.service.ts` | ✅ Complete | 31 unit tests |
| PNG Export | `renderToPng()` in export.service.ts | ✅ Complete | Tests 1–5 |
| PDF Export | `renderToPdf()` in export.service.ts | ✅ Complete | Tests 6–10 |
| DXF Export | `renderToDxf()` in export.service.ts | ✅ Complete | Tests 11–31 |
| Export API | `app/api/admin/research/[projectId]/drawings/[drawingId]/route.ts` | ✅ Updated | Existing route |
| Export UI | `app/admin/research/components/ExportPanel.tsx` | ✅ Updated | N/A (React component) |
| System Templates | `seeds/090_research_tables.sql` | ✅ Seeded | Standard B&W, Professional Color |

---

## Export Format Details

### PNG Export (`renderToPng`)

- **Library:** `@resvg/resvg-js` (already installed)
- **Resolution:** 300 DPI
- **Process:** SVG → resvg rasterizer → PNG Buffer
- **Scale factor:** `EXPORT_DPI / 72 = 4.167×` applied to canvas width/height
- **Output:** Binary PNG Buffer, base64-encoded in API response

### PDF Export (`renderToPdf`)

- **Library:** `jspdf` (already installed)
- **Process:** SVG → resvg PNG rasterization → embed in jsPDF page
- **Paper size:** Matches canvas dimensions (auto landscape/portrait)
- **Output:** Binary PDF Buffer, base64-encoded in API response

### DXF Export (`renderToDxf`)

- **Library:** `dxf-writer` (already installed)
- **Layers:** Feature classes mapped to AutoCAD layer names:

| Feature Class | AutoCAD Layer | ACI Color |
|---------------|---------------|-----------|
| property_boundary, lot_line | BOUNDARY | 7 (white) |
| easement | EASEMENT | 1 (red) |
| setback | SETBACK | 5 (blue) |
| right_of_way, road, centerline | ROW | 8 (gray) |
| building, concrete | BUILDING | 4 (cyan) |
| fence | FENCE | 3 (green) |
| utility | UTILITY | 6 (magenta) |
| water_feature | WATER | 5 (blue) |
| tree_line | VEGETATION | 3 (green) |
| contour | CONTOUR | 8 (gray) |
| monument, control_point | MONUMENT | 1 (red) |
| annotation, title_block | LABELS | 7 (white) |
| other | MISC | 8 (gray) |

- **Geometry mapping:**
  - `line` → `drawLine(x1,y1,0, x2,y2,0)`
  - `polygon` → series of `drawLine` calls connecting vertices + closing segment
  - `curve` → `drawArc(cx,cy,0, r, startDeg, endDeg)`
  - `point` → `drawPoint(x,y,0)`
  - `label` → `drawText(x,y,0, fontSize, 0, text)` on LABELS layer
- **Origin offset:** Canvas `origin [ox, oy]` subtracted from all coordinates so DXF world origin = bottom-left of drawing
- **Output:** UTF-8 DXF string as Buffer, base64-encoded in API response

---

## API Changes

### `POST /api/admin/research/[projectId]/drawings/[drawingId]`

**Body:** `{ action: 'export', format: 'png' | 'pdf' | 'dxf', viewMode?: ViewMode, showTitleBlock?: boolean }`

**Response:** `{ export: { format, filename, blob_data, size_bytes } }`

`blob_data` is base64-encoded. The client should decode it to a Blob and trigger a browser download.

All five formats (svg, json, png, pdf, dxf) are now fully implemented and return real data.

---

## ExportPanel UI Changes

`app/admin/research/components/ExportPanel.tsx` updated:

- PNG, PDF, and DXF format cards now have `available: true` (were `false`)
- "Coming Soon" badge no longer displays for any format
- Updated tooltip text for PNG and DXF to reflect live functionality

---

## Phase 12 Deliverables Checklist

- [x] Drawing template CRUD (create, list, update, delete) — via `/api/admin/research/templates/drawing`
- [x] System templates provided (Standard B&W, Professional Color) — seeded in `090_research_tables.sql`
- [x] SVG export works with title block — existing implementation
- [x] JSON export works — existing implementation
- [x] PNG export at print quality (300 DPI) — `renderToPng()` via @resvg/resvg-js
- [x] PDF export with proper paper size and margins — `renderToPdf()` via jsPDF
- [x] DXF export with AutoCAD-compatible layers — `renderToDxf()` via dxf-writer
- [x] User can select which view mode to export — ExportPanel view mode selector
- [x] All formats enabled in ExportPanel UI
- [x] 31 unit tests covering all export functions
- [ ] Template preview renders a thumbnail — deferred (requires additional render-to-thumbnail endpoint)
- [ ] Export files stored in Supabase Storage — currently returns base64 blob; S3/Storage persistence deferred

---

## Test Coverage

**File:** `__tests__/recon/phase12-export.test.ts`  
**Tests:** 31  
**Coverage:**
- `renderToDxf` — 21 tests: layer mapping for all feature classes, polygon/curve/point/label geometry, origin offset, invisible element skipping, empty elements, multi-element drawings
- `renderToPng` — 5 tests: buffer type, PNG magic bytes, empty elements, view modes, showTitleBlock
- `renderToPdf` — 5 tests: buffer type, PDF header, empty elements, landscape/portrait orientation
