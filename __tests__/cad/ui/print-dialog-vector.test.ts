// __tests__/cad/ui/print-dialog-vector.test.ts
//
// cad-survey-print-pdf Slice 9 — the Print dialog drives the VECTOR PDF
// writer as the primary deliverable: a live preview, a real Print action,
// and an Export PDF that flows the sheet/scale/plot-style + element
// toggles + certification/notes through `exportToPdf`/`downloadPdf`/
// `printPdf`, with the raster canvas-capture kept as PNG export + a
// fallback. Source-locked (the dialog is a React/DOM component).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'PrintDialog.tsx'),
  'utf8',
);

describe('PrintDialog — vector writer wiring', () => {
  it('imports the vector writer entrypoints', () => {
    expect(SRC).toMatch(/import \{[\s\S]*exportToPdf,[\s\S]*downloadPdf,[\s\S]*printPdf,[\s\S]*\} from '@\/lib\/cad\/delivery\/pdf-writer'/);
  });

  it('overrides only the paper framing on the doc, never the survey data', () => {
    expect(SRC).toMatch(/settings: \{ \.\.\.baseDoc\.settings, paperSize: cfg\.paperSize, paperOrientation: cfg\.orientation \}/);
  });

  it('maps the element toggles + plot style + scale into PdfExportOptions', () => {
    expect(SRC).toMatch(/showBorder: cfg\.printBorder/);
    expect(SRC).toMatch(/showTitleBlock: cfg\.printTitleBlock/);
    expect(SRC).toMatch(/showNorthArrow: cfg\.printNorthArrow/);
    expect(SRC).toMatch(/showScaleBar: cfg\.printScaleBar/);
    expect(SRC).toMatch(/showLegend: cfg\.printLegend/);
    expect(SRC).toMatch(/scaleMode: cfg\.scaleMode/);
    expect(SRC).toMatch(/plotStyle: cfg\.plotStyle/);
  });

  it('projects the active template certification + standard notes into the writer shape', () => {
    expect(SRC).toMatch(/function buildCertification/);
    expect(SRC).toMatch(/function buildNotes/);
    expect(SRC).toMatch(/STANDARD_NOTES\.find\(\(n\) => n\.id === id\)/);
    expect(SRC).toMatch(/certification: cfg\.printCertification \? buildCertification\(tpl\) : null/);
    expect(SRC).toMatch(/notes: cfg\.printNotes \? buildNotes\(tpl\) : null/);
  });

  it('renders a live preview iframe from a debounced exportToPdf blob', () => {
    expect(SRC).toMatch(/exportToPdf\(doc, options\)/);
    expect(SRC).toMatch(/URL\.createObjectURL\(blob\)/);
    expect(SRC).toMatch(/title="PDF preview"/);
    // old preview URL is revoked so blobs don't leak.
    expect(SRC).toMatch(/URL\.revokeObjectURL\(previewUrlRef\.current\)/);
  });

  it('has a Print button (printPdf) and a vector Export PDF (downloadPdf)', () => {
    expect(SRC).toMatch(/printPdf\(doc, opts\)/);
    expect(SRC).toMatch(/downloadPdf\(doc, opts\)/);
    expect(SRC).toMatch(/Print…/);
  });

  it('falls back to the raster canvas-capture when the vector action throws', () => {
    expect(SRC).toMatch(/catch \{\s*\n\s*rasterExport\('pdf'\)/);
    // PNG export stays on the raster path.
    expect(SRC).toMatch(/rasterExport\('png'\)/);
    expect(SRC).toMatch(/cad:exportImage/);
  });
});
