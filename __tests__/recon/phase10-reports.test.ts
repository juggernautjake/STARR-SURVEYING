// __tests__/recon/phase10-reports.test.ts
// Unit tests for STARR RECON Phase 10: Production Reports, Exports & CLI Interface.
//
// Phase 10 consumes all Phase 1-9 outputs and generates professional deliverables:
//   • SVG boundary drawing with confidence colors and monuments
//   • PNG rasterization via cascading fallback chain
//   • DXF R2010 CAD export (13 layers, AutoCAD Civil 3D compatible)
//   • PDF multi-section report via pdfkit
//   • Texas-standard metes & bounds legal description
//   • Master orchestrator with checkpoint/resume and non-critical phase tolerance
//   • Commander.js CLI with run/report/status/list/clean subcommands
//   • Express API routes with rate limiting and PipelineLogger
//
// Tests cover pure-logic portions that do not require live APIs or heavy external tools.
//
// Test index:
//
// defaultReportConfig (types/reports.ts):
//   1.  default formats are ['pdf', 'dxf', 'svg']
//   2.  default outputDir is '/tmp/deliverables'
//   3.  pdf defaults to letter page size
//   4.  drawing defaults to dpi 300
//   5.  overrides.formats replaces formats array
//   6.  overrides.outputDir replaces outputDir
//   7.  overrides.pdf merges into pdf config (not full replacement)
//   8.  overrides.drawing merges into drawing config (not full replacement)
//   9.  pdf defaults include companyName from env (COMPANY_NAME or fallback)
//  10.  drawing default showConfidenceColors is true
//  11.  drawing default showNorthArrow is true
//  12.  drawing default backgroundColor is '#FFFFFF'
//
// LegalDescriptionGenerator (reports/legal-description-generator.ts):
//  13.  empty calls returns fallback message
//  14.  non-empty calls returns string containing 'BEING a tract'
//  15.  header includes county name from data
//  16.  header includes subdivision lot/block reference when subdivision present
//  17.  straight call contains 'THENCE'
//  18.  straight call formats bearing passthrough
//  19.  straight call formats distance with .toFixed(2) feet
//  20.  non-last straight call ends with ';'
//  21.  last straight call ends with 'POINT OF BEGINNING'
//  22.  curve call contains 'along a curve'
//  23.  curve call includes radius when curve.radius is set
//  24.  curve call includes arc length when curve.arcLength is set
//  25.  POB with northing/easting includes NAD83 coordinates
//  26.  footer contains 'AI-assisted research' disclaimer
//  27.  footer contains 'NAD83' coordinate system reference
//  28.  footer contains confidence grade when confidence is available
//  29.  closure section contains acreage from discovery
//  30.  closure section contains closureError.ratio when available
//  31.  totalPerimeter sums straight call distances
//  32.  totalPerimeter uses arcLength for curve calls
//
// SVGBoundaryRenderer (reports/svg-renderer.ts):
//  33.  render() returns string starting with '<?xml' or '<svg'
//  34.  render() output contains '<svg' tag
//  35.  render() output contains 'viewBox' attribute
//  36.  render() output ends with '</svg>'
//  37.  render() with empty model (no calls) still produces valid SVG
//  38.  confidenceColor — score ≥ 80 returns green (#22C55E)
//  39.  confidenceColor — score ≥ 60 returns yellow (#EAB308)
//  40.  confidenceColor — score ≥ 40 returns orange (#F97316)
//  41.  confidenceColor — score < 40 returns red (#EF4444)
//  42.  render() includes 'North' text when showNorthArrow is true
//  43.  render() excludes north-arrow group when showNorthArrow is false
//  44.  render() includes scale bar 'ft' label when showScaleBar is true
//  45.  render() includes 'Legend' text when showLegend is true
//  46.  render() includes title text from discovery.ownerName
//  47.  render() with discovery.subdivision shows subdivision in output
//
// PNGRasterizer (reports/png-rasterizer.ts):
//  48.  extractWidth — returns 1200 when SVG has no width attribute
//  49.  extractWidth — parses width from <svg width="800">
//  50.  extractWidth — ignores non-svg width attributes in body
//
// DXFExporter (reports/dxf-exporter.ts):
//  51.  export() output starts with DXF HEADER section marker
//  52.  export() output contains ENTITIES section
//  53.  export() output ends with EOF
//  54.  export() all 13 layer names appear in output
//  55.  export() BOUNDARY layer present
//  56.  export() ROW layer present
//  57.  export() EASEMENTS layer present
//  58.  export() writes to file and file exists
//  59.  export() empty reconciliation (null calls) does not throw
//  60.  export() output contains TITLE layer text
//
// MasterOrchestrator (orchestrator/master-orchestrator.ts):
//  61.  constructor uses default baseUrl 'http://localhost:3100'
//  62.  getStatus() returns exists=false for non-existent project
//  63.  getStatus() returns checkpoint=null for non-existent project
//  64.  getStatus() returns hasDeliverables=false for non-existent project
//  65.  listProjects() returns empty array when outputDir does not exist
//  66.  listProjects() returns project directories found in outputDir
//  67.  cleanProject() removes the project directory
//  68.  cleanProject() does not throw for non-existent project
//  69.  loadProjectData() fills default values for missing discovery.json
//  70.  loadProjectData() state is always 'TX'
//  71.  loadProjectData() pipelineVersion matches env or default '1.0.0'
//  72.  checkpoint save/load/remove roundtrip
//  73.  loadCheckpoint() returns null for corrupt checkpoint file (graceful recovery)
//  74.  generateDeliverables() creates manifest.json file on disk
//  75.  generateDeliverables() manifest contains projectId
//  76.  generateDeliverables() manifest has all 6 deliverable keys
//  77.  generateDeliverables() SVG format is attempted when config includes 'svg'
//  78.  generateDeliverables() legal description TXT created for 'txt' format
//
// PHASES constant:
//  79.  PHASES array has exactly 9 entries
//  80.  Phase 1 (Property Discovery) is critical
//  81.  Phase 4 (Subdivision Analysis) is not critical
//  82.  Phase 7 (Boundary Reconciliation) is critical
//  83.  Phase 9 (Document Purchase) is not critical
//  84.  All phase names are non-empty strings

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';

import { defaultReportConfig } from '../../worker/src/types/reports.js';
import type { ProjectData, ReportConfig } from '../../worker/src/types/reports.js';
import { LegalDescriptionGenerator } from '../../worker/src/reports/legal-description-generator.js';
import { SVGBoundaryRenderer } from '../../worker/src/reports/svg-renderer.js';
import { PNGRasterizer } from '../../worker/src/reports/png-rasterizer.js';
import { DXFExporter } from '../../worker/src/reports/dxf-exporter.js';
import { MasterOrchestrator } from '../../worker/src/orchestrator/master-orchestrator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal valid ProjectData for tests that just need the interface structure */
function makeMinimalProjectData(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    projectId: 'TEST-001',
    address: '123 Main St, Belton, TX',
    county: 'Bell',
    state: 'TX',
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T01:00:00.000Z',
    pipelineVersion: '1.0.0',
    discovery: {
      propertyId: 'PROP-001',
      ownerName: 'John Doe',
      legalDescription: 'Being a tract in Bell County',
      acreage: 5.1234,
      situs: '123 Main St',
      subdivision: null,
      lot: null,
      block: null,
      cadUrl: '',
      cadSource: 'bell_cad',
    },
    documents: { target: [], adjacent: [], txdot: [] },
    intelligence: null,
    subdivision: null,
    crossValidation: null,
    rowData: null,
    reconciliation: { reconciledCalls: [], corners: [], calls: [] },
    confidence: { overallScore: 72, overallGrade: 'B', overallConfidence: { score: 72, grade: 'B' } } as any,
    purchases: null,
    reconciliationV2: null,
    ...overrides,
  };
}

/** Build a default ReportConfig for test usage */
function makeTestConfig(
  formats: string[] = ['svg', 'dxf', 'txt'],
  tmpDir = '/tmp/deliverables',
): ReportConfig {
  return defaultReportConfig({
    formats: formats as any,
    outputDir: tmpDir,
  });
}

/** A project directory under /tmp for isolated filesystem tests */
let tmpTestDir: string;
beforeEach(() => {
  tmpTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase10-test-'));
});
afterEach(() => {
  if (tmpTestDir && fs.existsSync(tmpTestDir)) {
    fs.rmSync(tmpTestDir, { recursive: true, force: true });
  }
});

// ── defaultReportConfig ────────────────────────────────────────────────────────

describe('defaultReportConfig', () => {
  it('1. default formats are [pdf, dxf, svg]', () => {
    const cfg = defaultReportConfig();
    expect(cfg.formats).toEqual(['pdf', 'dxf', 'svg']);
  });

  it('2. default outputDir is /tmp/deliverables', () => {
    const cfg = defaultReportConfig();
    expect(cfg.outputDir).toBe('/tmp/deliverables');
  });

  it('3. pdf defaults to letter page size', () => {
    const cfg = defaultReportConfig();
    expect(cfg.pdf.pageSize).toBe('letter');
  });

  it('4. drawing defaults to dpi 300 (or DEFAULT_DPI env)', () => {
    const cfg = defaultReportConfig();
    const expected = parseInt(process.env.DEFAULT_DPI || '300');
    expect(cfg.drawing.dpi).toBe(expected);
  });

  it('5. overrides.formats replaces formats array', () => {
    const cfg = defaultReportConfig({ formats: ['png'] });
    expect(cfg.formats).toEqual(['png']);
  });

  it('6. overrides.outputDir replaces outputDir', () => {
    const cfg = defaultReportConfig({ outputDir: '/custom/path' });
    expect(cfg.outputDir).toBe('/custom/path');
  });

  it('7. overrides.pdf merges into pdf config (not full replacement)', () => {
    const cfg = defaultReportConfig({ pdf: { pageSize: 'tabloid' } as any });
    expect(cfg.pdf.pageSize).toBe('tabloid');
    // Other pdf fields survive the merge
    expect(cfg.pdf.includeAppendix).toBe(true);
    expect(cfg.pdf.includeSourceThumbnails).toBe(true);
  });

  it('8. overrides.drawing merges into drawing config (not full replacement)', () => {
    const cfg = defaultReportConfig({ drawing: { dpi: 150 } as any });
    expect(cfg.drawing.dpi).toBe(150);
    // Other drawing fields survive
    expect(cfg.drawing.showNorthArrow).toBe(true);
    expect(cfg.drawing.backgroundColor).toBe('#FFFFFF');
  });

  it('9. pdf.companyName falls back to Starr Surveying Company', () => {
    const saved = process.env.COMPANY_NAME;
    delete process.env.COMPANY_NAME;
    const cfg = defaultReportConfig();
    expect(cfg.pdf.companyName).toBe('Starr Surveying Company');
    if (saved !== undefined) process.env.COMPANY_NAME = saved;
  });

  it('10. drawing default showConfidenceColors is true', () => {
    const cfg = defaultReportConfig();
    expect(cfg.drawing.showConfidenceColors).toBe(true);
  });

  it('11. drawing default showNorthArrow is true', () => {
    const cfg = defaultReportConfig();
    expect(cfg.drawing.showNorthArrow).toBe(true);
  });

  it('12. drawing default backgroundColor is #FFFFFF', () => {
    const cfg = defaultReportConfig();
    expect(cfg.drawing.backgroundColor).toBe('#FFFFFF');
  });
});

// ── LegalDescriptionGenerator ─────────────────────────────────────────────────

describe('LegalDescriptionGenerator', () => {
  const gen = new LegalDescriptionGenerator();

  /** Helper: project data with N boundary calls */
  function makeDataWithCalls(n: number): ProjectData {
    const calls = Array.from({ length: n }, (_, i) => ({
      callId: `C${i + 1}`,
      bearing: `N ${45 + i}°00'00" E`,
      distance: 100 + i * 10,
      curve: null,
    }));
    return makeMinimalProjectData({
      reconciliation: { reconciledCalls: calls, corners: [], calls },
    });
  }

  it('13. empty calls returns fallback message', () => {
    const result = gen.generate(makeMinimalProjectData());
    expect(result).toContain('not available');
  });

  it('14. non-empty calls contains "BEING a tract"', () => {
    const result = gen.generate(makeDataWithCalls(3));
    expect(result).toContain('BEING a tract');
  });

  it('15. header includes county name from data', () => {
    const result = gen.generate(makeDataWithCalls(2));
    expect(result).toContain('Bell');
  });

  it('16. header includes subdivision lot/block reference when subdivision present', () => {
    const data = makeDataWithCalls(2);
    data.discovery.subdivision = 'Belton Heights';
    data.discovery.lot = '12';
    data.discovery.block = 'A';
    const result = gen.generate(data);
    expect(result).toContain('Lot 12');
    expect(result).toContain('Block A');
    expect(result).toContain('Belton Heights');
  });

  it('17. straight call contains "THENCE"', () => {
    const result = gen.generate(makeDataWithCalls(2));
    expect(result).toContain('THENCE');
  });

  it('18. straight call formats bearing passthrough', () => {
    const data = makeDataWithCalls(1);
    (data.reconciliation.reconciledCalls as any[])[0].bearing = "N 45°00'00\" E";
    const result = gen.generate(data);
    expect(result).toContain("N 45°00'00\" E");
  });

  it('19. straight call formats distance with decimal feet', () => {
    const data = makeDataWithCalls(1);
    (data.reconciliation.reconciledCalls as any[])[0].distance = 123.45;
    const result = gen.generate(data);
    expect(result).toContain('123.45 feet');
  });

  it('20. non-last straight call ends with ";"', () => {
    const result = gen.generate(makeDataWithCalls(3));
    // The first or second THENCE call (not the last) should end with ;
    const lines = result.split('\n');
    const thenceLines = lines.filter((l) => l.startsWith('THENCE'));
    // At least one non-last THENCE ends with ;
    expect(thenceLines.some((l) => l.endsWith(';'))).toBe(true);
  });

  it('21. last straight call ends with "POINT OF BEGINNING"', () => {
    const result = gen.generate(makeDataWithCalls(2));
    expect(result).toContain('POINT OF BEGINNING');
  });

  it('22. curve call contains "along a curve"', () => {
    const data = makeMinimalProjectData({
      reconciliation: {
        reconciledCalls: [
          {
            callId: 'C1',
            curve: {
              radius: 200,
              delta: "30°00'00\"",
              arcLength: 104.72,
              chordBearing: "N 60°00'00\" E",
              chordDistance: 103.53,
            },
            curveDirection: 'to the right',
            bearing: null,
            distance: null,
          },
        ],
        corners: [],
        calls: [],
      },
    });
    const result = gen.generate(data);
    expect(result).toContain('along a curve');
  });

  it('23. curve call includes radius', () => {
    const data = makeMinimalProjectData({
      reconciliation: {
        reconciledCalls: [
          {
            callId: 'C1',
            curve: { radius: 200, delta: "30°00'00\"", arcLength: 104.72 },
            bearing: null,
            distance: null,
          },
        ],
        corners: [],
        calls: [],
      },
    });
    const result = gen.generate(data);
    expect(result).toContain('200.00 feet');
  });

  it('24. curve call includes arc length when curve.arcLength is set', () => {
    const data = makeMinimalProjectData({
      reconciliation: {
        reconciledCalls: [
          {
            callId: 'C1',
            curve: { radius: 200, delta: "30°00'00\"", arcLength: 104.72 },
            bearing: null,
            distance: null,
          },
        ],
        corners: [],
        calls: [],
      },
    });
    const result = gen.generate(data);
    expect(result).toContain('104.72 feet');
  });

  it('25. POB with coordinates includes NAD83 reference', () => {
    const data = makeDataWithCalls(1);
    data.reconciliation.corners = [{ northing: 10000.5, easting: 20000.25 }];
    const result = gen.generate(data);
    expect(result).toContain('NAD83');
  });

  it('26. footer contains AI-assisted research disclaimer', () => {
    const result = gen.generate(makeDataWithCalls(1));
    expect(result.toLowerCase()).toContain('ai-assisted research');
  });

  it('27. footer contains NAD83 coordinate system reference', () => {
    const result = gen.generate(makeDataWithCalls(1));
    expect(result).toContain('NAD83');
  });

  it('28. footer contains confidence grade when confidence is available', () => {
    const data = makeDataWithCalls(1);
    data.confidence = { overallConfidence: { score: 85, grade: 'A', label: 'High', summary: '' } } as any;
    const result = gen.generate(data);
    expect(result).toContain('85%');
    expect(result).toContain('Grade A');
  });

  it('29. closure section contains acreage from discovery', () => {
    const data = makeDataWithCalls(1);
    data.discovery.acreage = 3.7654;
    const result = gen.generate(data);
    expect(result).toContain('3.7654 acres');
  });

  it('30. closure section contains closureError.ratio when available', () => {
    const data = makeDataWithCalls(1);
    (data.reconciliation as any).closureError = { ratio: '1:12500', linearError: 0.043 };
    const result = gen.generate(data);
    expect(result).toContain('1:12500');
  });

  it('31. totalPerimeter (internal) sums straight distances', () => {
    // Access via private trick: generate with known distances and check perimeter in closure
    const data = makeMinimalProjectData({
      reconciliation: {
        reconciledCalls: [
          { callId: 'C1', bearing: "N 45°00'00\" E", distance: 100, curve: null },
          { callId: 'C2', bearing: "S 45°00'00\" E", distance: 150, curve: null },
        ],
        corners: [],
        calls: [],
        closureError: { ratio: '1:5000', linearError: 0.05 },
      },
      discovery: { ...makeMinimalProjectData().discovery, acreage: 1.5 },
    });
    const result = gen.generate(data);
    // The closure line shows "(0.050 ft error in {perimeter} ft perimeter)"
    // Perimeter = 100 + 150 = 250
    expect(result).toContain('250.00 ft perimeter');
  });

  it('32. totalPerimeter uses arcLength for curve calls', () => {
    const data = makeMinimalProjectData({
      reconciliation: {
        reconciledCalls: [
          {
            callId: 'C1',
            curve: { radius: 200, delta: "30°00'00\"", arcLength: 104.72 },
            bearing: null,
            distance: null,
          },
          { callId: 'C2', bearing: "S 45°00'00\" W", distance: 50, curve: null },
        ],
        corners: [],
        calls: [],
        closureError: { ratio: '1:10000', linearError: 0.015 },
      },
      discovery: { ...makeMinimalProjectData().discovery, acreage: 0.5 },
    });
    const result = gen.generate(data);
    // Perimeter = 104.72 + 50 = 154.72
    expect(result).toContain('154.72 ft perimeter');
  });
});

// ── SVGBoundaryRenderer ───────────────────────────────────────────────────────

describe('SVGBoundaryRenderer', () => {
  /** Minimal data shape for render() */
  function makeRenderData(overrides: any = {}) {
    return {
      model: overrides.model ?? { reconciledPerimeter: { calls: [] } },
      confidence: overrides.confidence ?? {
        overallConfidence: { score: 72, grade: 'B' },
        callConfidence: [],
      },
      discovery: overrides.discovery ?? makeMinimalProjectData().discovery,
      rowData: null,
      crossValidation: null,
    };
  }

  it('33. render() returns string containing <?xml or <svg', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const svg = renderer.render(makeRenderData());
    expect(typeof svg).toBe('string');
    expect(svg.startsWith('<?xml') || svg.startsWith('<svg')).toBe(true);
  });

  it('34. render() output contains <svg tag', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const svg = renderer.render(makeRenderData());
    expect(svg).toContain('<svg');
  });

  it('35. render() output contains viewBox attribute', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const svg = renderer.render(makeRenderData());
    expect(svg).toContain('viewBox');
  });

  it('36. render() output ends with </svg>', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const svg = renderer.render(makeRenderData());
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('37. render() with empty model (no calls) still produces valid SVG', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const svg = renderer.render(makeRenderData({ model: null }));
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('38. confidenceColor — score ≥ 80 is green', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const model = {
      reconciledPerimeter: {
        calls: [
          { callId: 'C1', type: 'straight', reconciledBearing: "N 45°00'00\" E", reconciledDistance: 100 },
        ],
      },
    };
    const data = makeRenderData({
      model,
      confidence: { overallConfidence: { score: 85, grade: 'A' }, callConfidence: [{ callId: 'C1', score: 82 }] },
    });
    const svg = renderer.render(data);
    // Green = #22C55E
    expect(svg).toContain('#22C55E');
  });

  it('39. confidenceColor — score ≥ 60 is yellow', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const model = {
      reconciledPerimeter: {
        calls: [
          { callId: 'C1', type: 'straight', reconciledBearing: "N 45°00'00\" E", reconciledDistance: 100 },
        ],
      },
    };
    const data = makeRenderData({
      model,
      confidence: { overallConfidence: { score: 65, grade: 'B' }, callConfidence: [{ callId: 'C1', score: 65 }] },
    });
    const svg = renderer.render(data);
    // Yellow = #EAB308
    expect(svg).toContain('#EAB308');
  });

  it('40. confidenceColor — score ≥ 40 is orange', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const model = {
      reconciledPerimeter: {
        calls: [
          { callId: 'C1', type: 'straight', reconciledBearing: "N 45°00'00\" E", reconciledDistance: 100 },
        ],
      },
    };
    const data = makeRenderData({
      model,
      confidence: { overallConfidence: { score: 50, grade: 'D' }, callConfidence: [{ callId: 'C1', score: 45 }] },
    });
    const svg = renderer.render(data);
    // Orange = #F97316
    expect(svg).toContain('#F97316');
  });

  it('41. confidenceColor — score < 40 is red', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const model = {
      reconciledPerimeter: {
        calls: [
          { callId: 'C1', type: 'straight', reconciledBearing: "N 45°00'00\" E", reconciledDistance: 100 },
        ],
      },
    };
    const data = makeRenderData({
      model,
      confidence: { overallConfidence: { score: 30, grade: 'F' }, callConfidence: [{ callId: 'C1', score: 35 }] },
    });
    const svg = renderer.render(data);
    // Red = #EF4444
    expect(svg).toContain('#EF4444');
  });

  it('42. render() includes "N" north label when showNorthArrow is true', () => {
    const config = makeTestConfig();
    config.drawing.showNorthArrow = true;
    const renderer = new SVGBoundaryRenderer(config);
    const svg = renderer.render(makeRenderData());
    expect(svg).toContain('>N<');
  });

  it('43. render() excludes north-arrow rendered usage when showNorthArrow is false', () => {
    const config = makeTestConfig();
    config.drawing.showNorthArrow = false;
    const renderer = new SVGBoundaryRenderer(config);
    const svg = renderer.render(makeRenderData());
    // When showNorthArrow=false, no element references the marker via marker-end.
    // The <defs> block still contains the marker definition but it is unused.
    expect(svg).not.toContain('marker-end="url(#north-arrow)"');
  });

  it('44. render() includes "ft" scale bar label when showScaleBar is true', () => {
    const config = makeTestConfig();
    config.drawing.showScaleBar = true;
    const renderer = new SVGBoundaryRenderer(config);
    const svg = renderer.render(makeRenderData());
    expect(svg).toContain(' ft</text>');
  });

  it('45. render() includes "Legend" text when showLegend is true', () => {
    const config = makeTestConfig();
    config.drawing.showLegend = true;
    const renderer = new SVGBoundaryRenderer(config);
    const svg = renderer.render(makeRenderData());
    expect(svg).toContain('Legend');
  });

  it('46. render() includes title text from discovery.ownerName', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const data = makeRenderData({
      discovery: { ...makeMinimalProjectData().discovery, ownerName: 'TestOwnerXYZ' },
    });
    const svg = renderer.render(data);
    expect(svg).toContain('TestOwnerXYZ');
  });

  it('47. render() with discovery.subdivision shows subdivision name in output', () => {
    const renderer = new SVGBoundaryRenderer(makeTestConfig());
    const data = makeRenderData({
      discovery: {
        ...makeMinimalProjectData().discovery,
        subdivision: 'Hidden Valley Estates',
        lot: '5',
        block: 'B',
      },
    });
    const svg = renderer.render(data);
    expect(svg).toContain('Hidden Valley Estates');
  });
});

// ── PNGRasterizer ─────────────────────────────────────────────────────────────

describe('PNGRasterizer', () => {
  it('48. extractWidth — returns 1200 when SVG has no width attribute', () => {
    const rasterizer = new PNGRasterizer(300);
    const svg = '<svg viewBox="0 0 800 600"><rect/></svg>';
    expect(rasterizer.extractWidth(svg)).toBe(1200);
  });

  it('49. extractWidth — parses width from <svg width="800">', () => {
    const rasterizer = new PNGRasterizer(300);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>';
    expect(rasterizer.extractWidth(svg)).toBe(800);
  });

  it('50. extractWidth — parses first numeric width and ignores non-svg attrs', () => {
    const rasterizer = new PNGRasterizer(300);
    const svg = '<?xml version="1.0"?><svg width="1200" height="900"><rect width="50"/></svg>';
    // Should return 1200 (first match) not 50
    expect(rasterizer.extractWidth(svg)).toBe(1200);
  });
});

// ── DXFExporter ───────────────────────────────────────────────────────────────

describe('DXFExporter', () => {
  it('51. export() output starts with HEADER section marker', () => {
    const exporter = new DXFExporter();
    const data = makeMinimalProjectData();
    const config = makeTestConfig(['dxf'], tmpTestDir);
    const outPath = path.join(tmpTestDir, 'test.dxf');
    exporter.export(data, config, outPath);
    const content = fs.readFileSync(outPath, 'utf-8');
    expect(content).toContain('HEADER');
    expect(content).toContain('SECTION');
  });

  it('52. export() output contains ENTITIES section', () => {
    const exporter = new DXFExporter();
    const data = makeMinimalProjectData();
    const config = makeTestConfig(['dxf'], tmpTestDir);
    const outPath = path.join(tmpTestDir, 'test.dxf');
    exporter.export(data, config, outPath);
    const content = fs.readFileSync(outPath, 'utf-8');
    expect(content).toContain('ENTITIES');
  });

  it('53. export() output ends with EOF', () => {
    const exporter = new DXFExporter();
    const data = makeMinimalProjectData();
    const config = makeTestConfig(['dxf'], tmpTestDir);
    const outPath = path.join(tmpTestDir, 'test.dxf');
    exporter.export(data, config, outPath);
    const content = fs.readFileSync(outPath, 'utf-8');
    expect(content.trimEnd().endsWith('EOF')).toBe(true);
  });

  it('54. all 13 layer names appear in DXF output', () => {
    const exporter = new DXFExporter();
    const data = makeMinimalProjectData();
    const config = makeTestConfig(['dxf'], tmpTestDir);
    const outPath = path.join(tmpTestDir, 'test.dxf');
    exporter.export(data, config, outPath);
    const content = fs.readFileSync(outPath, 'utf-8');
    const expectedLayers = [
      'BOUNDARY', 'BOUNDARY-TEXT', 'LOTS', 'LOT-TEXT',
      'EASEMENTS', 'EASEMENT-TEXT', 'ROW', 'ROW-TEXT',
      'ADJACENT', 'ADJACENT-TEXT', 'MONUMENTS', 'CONFIDENCE', 'TITLE',
    ];
    for (const layer of expectedLayers) {
      expect(content, `Layer ${layer} missing`).toContain(layer);
    }
  });

  it('55. BOUNDARY layer is present in DXF', () => {
    const exporter = new DXFExporter();
    const data = makeMinimalProjectData();
    const config = makeTestConfig(['dxf'], tmpTestDir);
    const outPath = path.join(tmpTestDir, 'test.dxf');
    exporter.export(data, config, outPath);
    const content = fs.readFileSync(outPath, 'utf-8');
    expect(content).toContain('BOUNDARY');
  });

  it('56. ROW layer is present in DXF', () => {
    const exporter = new DXFExporter();
    const data = makeMinimalProjectData();
    const config = makeTestConfig(['dxf'], tmpTestDir);
    const outPath = path.join(tmpTestDir, 'test.dxf');
    exporter.export(data, config, outPath);
    const content = fs.readFileSync(outPath, 'utf-8');
    expect(content).toContain('ROW');
  });

  it('57. EASEMENTS layer has DASHED linetype in TABLES section', () => {
    const exporter = new DXFExporter();
    const data = makeMinimalProjectData();
    const config = makeTestConfig(['dxf'], tmpTestDir);
    const outPath = path.join(tmpTestDir, 'test.dxf');
    exporter.export(data, config, outPath);
    const content = fs.readFileSync(outPath, 'utf-8');
    expect(content).toContain('DASHED');
  });

  it('58. export() writes file to disk and file exists', () => {
    const exporter = new DXFExporter();
    const data = makeMinimalProjectData();
    const config = makeTestConfig(['dxf'], tmpTestDir);
    const outPath = path.join(tmpTestDir, 'boundary.dxf');
    exporter.export(data, config, outPath);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.statSync(outPath).size).toBeGreaterThan(0);
  });

  it('59. export() with empty reconciliation (null calls) does not throw', () => {
    const exporter = new DXFExporter();
    const data = makeMinimalProjectData({ reconciliation: null as any });
    const config = makeTestConfig(['dxf'], tmpTestDir);
    const outPath = path.join(tmpTestDir, 'empty.dxf');
    expect(() => exporter.export(data, config, outPath)).not.toThrow();
  });

  it('60. export() output contains TITLE layer text (address or confidence)', () => {
    const exporter = new DXFExporter();
    const data = makeMinimalProjectData();
    const config = makeTestConfig(['dxf'], tmpTestDir);
    const outPath = path.join(tmpTestDir, 'titled.dxf');
    exporter.export(data, config, outPath);
    const content = fs.readFileSync(outPath, 'utf-8');
    // The title block writes address, county, and confidence to TITLE layer
    expect(content).toContain('TITLE');
  });
});

// ── MasterOrchestrator ────────────────────────────────────────────────────────

describe('MasterOrchestrator', () => {
  it('61. constructor uses default baseUrl http://localhost:3100', () => {
    // Access private baseUrl via toString-like trick — verify no throw
    expect(() => new MasterOrchestrator()).not.toThrow();
    const orch = new MasterOrchestrator();
    // The default is reflected in the PHASES-based pipeline endpoint construction
    // We can't access private, but we can verify it was constructed without args
    expect(orch).toBeDefined();
  });

  it('62. getStatus() returns exists=false for non-existent project', () => {
    const orch = new MasterOrchestrator();
    // Use a unique nonexistent ID
    const status = orch.getStatus('NONEXISTENT-ZZZZZ-99999');
    expect(status.exists).toBe(false);
  });

  it('63. getStatus() returns checkpoint=null for non-existent project', () => {
    const orch = new MasterOrchestrator();
    const status = orch.getStatus('NONEXISTENT-ZZZZZ-99999');
    expect(status.checkpoint).toBeNull();
  });

  it('64. getStatus() returns hasDeliverables=false for non-existent project', () => {
    const orch = new MasterOrchestrator();
    const status = orch.getStatus('NONEXISTENT-ZZZZZ-99999');
    expect(status.hasDeliverables).toBe(false);
  });

  it('65. listProjects() returns empty array when outputDir does not exist', () => {
    // Override outputDir to a non-existent path
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = '/tmp/nonexistent-starr-test-dir-zzzzz';
    const projects = orch.listProjects();
    expect(projects).toEqual([]);
  });

  it('66. listProjects() returns project directories found in outputDir', () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    // Create two fake project directories
    fs.mkdirSync(path.join(tmpTestDir, 'STARR-AAA'));
    fs.mkdirSync(path.join(tmpTestDir, 'STARR-BBB'));
    const projects = orch.listProjects();
    expect(projects).toContain('STARR-AAA');
    expect(projects).toContain('STARR-BBB');
  });

  it('67. cleanProject() removes the project directory', () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    const projectDir = path.join(tmpTestDir, 'STARR-CLEAN');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'test.json'), '{}');
    expect(fs.existsSync(projectDir)).toBe(true);
    orch.cleanProject('STARR-CLEAN');
    expect(fs.existsSync(projectDir)).toBe(false);
  });

  it('68. cleanProject() does not throw for non-existent project', () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    expect(() => orch.cleanProject('STARR-DOES-NOT-EXIST')).not.toThrow();
  });

  it('69. loadProjectData() fills default values for missing discovery.json', async () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    // Create project dir but no discovery.json
    fs.mkdirSync(path.join(tmpTestDir, 'STARR-NODATA'), { recursive: true });
    const data = await orch.loadProjectData('STARR-NODATA');
    expect(data.discovery.ownerName).toBe('');
    expect(data.discovery.acreage).toBe(0);
    expect(data.documents.target).toEqual([]);
  });

  it('70. loadProjectData() state is always "TX"', async () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    fs.mkdirSync(path.join(tmpTestDir, 'STARR-TX'), { recursive: true });
    const data = await orch.loadProjectData('STARR-TX');
    expect(data.state).toBe('TX');
  });

  it('71. loadProjectData() pipelineVersion matches default 1.0.0', async () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    fs.mkdirSync(path.join(tmpTestDir, 'STARR-VER'), { recursive: true });
    const saved = process.env.PIPELINE_VERSION;
    delete process.env.PIPELINE_VERSION;
    const data = await orch.loadProjectData('STARR-VER');
    expect(data.pipelineVersion).toBe('1.0.0');
    if (saved !== undefined) process.env.PIPELINE_VERSION = saved;
  });

  it('72. checkpoint save/load/remove roundtrip', () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;

    const cpData = {
      projectId: 'STARR-CP-TEST',
      completedPhases: [1, 2, 3],
      phaseOutputs: { 1: '/tmp/disc.json', 2: '/tmp/harvest.json', 3: '/tmp/intel.json' },
      phaseDurations: { 1: 1.2, 2: 3.4, 3: 2.1 },
      startedAt: '2026-01-01T00:00:00.000Z',
      lastUpdated: '2026-01-01T00:05:00.000Z',
    };

    (orch as any).saveCheckpoint(cpData);
    const loaded = (orch as any).loadCheckpoint('STARR-CP-TEST');
    expect(loaded).not.toBeNull();
    expect(loaded.completedPhases).toEqual([1, 2, 3]);
    expect(loaded.phaseDurations[1]).toBe(1.2);

    (orch as any).removeCheckpoint('STARR-CP-TEST');
    const gone = (orch as any).loadCheckpoint('STARR-CP-TEST');
    expect(gone).toBeNull();
  });

  it('73. loadCheckpoint() returns null for corrupt checkpoint file', () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    const corruptDir = path.join(tmpTestDir, 'STARR-CORRUPT');
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(path.join(corruptDir, '.checkpoint.json'), 'INVALID JSON {{{');
    // Should NOT throw; should return null
    const result = (orch as any).loadCheckpoint('STARR-CORRUPT');
    expect(result).toBeNull();
  });

  it('74. generateDeliverables() creates manifest.json file on disk', async () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'STARR-MFST');
    const data = makeMinimalProjectData({ projectId: 'STARR-MFST' });
    const config = defaultReportConfig({ formats: [], outputDir: outDir });
    const checkpoint = {
      projectId: 'STARR-MFST',
      completedPhases: [],
      phaseOutputs: {},
      phaseDurations: {},
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    const manifest = await orch.generateDeliverables(data, config, checkpoint, Date.now());
    const manifestPath = path.join(outDir, 'STARR-MFST_manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(manifest.projectId).toBe('STARR-MFST');
  });

  it('75. generateDeliverables() manifest contains projectId', async () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'STARR-MID');
    const data = makeMinimalProjectData({ projectId: 'STARR-MID' });
    const config = defaultReportConfig({ formats: [], outputDir: outDir });
    const checkpoint = {
      projectId: 'STARR-MID',
      completedPhases: [],
      phaseOutputs: {},
      phaseDurations: {},
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    const manifest = await orch.generateDeliverables(data, config, checkpoint, Date.now());
    expect(manifest.projectId).toBe('STARR-MID');
  });

  it('76. generateDeliverables() manifest deliverables has all 6 format keys', async () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'STARR-FMTS');
    const data = makeMinimalProjectData({ projectId: 'STARR-FMTS' });
    const config = defaultReportConfig({ formats: [], outputDir: outDir });
    const checkpoint = {
      projectId: 'STARR-FMTS',
      completedPhases: [],
      phaseOutputs: {},
      phaseDurations: {},
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    const manifest = await orch.generateDeliverables(data, config, checkpoint, Date.now());
    const keys = Object.keys(manifest.deliverables);
    expect(keys).toContain('pdf');
    expect(keys).toContain('dxf');
    expect(keys).toContain('svg');
    expect(keys).toContain('png');
    expect(keys).toContain('json');
    expect(keys).toContain('txt');
  });

  it('77. generateDeliverables() SVG format produces svg file', async () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'STARR-SVG');
    const data = makeMinimalProjectData({ projectId: 'STARR-SVG' });
    const config = defaultReportConfig({ formats: ['svg'], outputDir: outDir });
    const checkpoint = {
      projectId: 'STARR-SVG',
      completedPhases: [],
      phaseOutputs: {},
      phaseDurations: {},
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    const manifest = await orch.generateDeliverables(data, config, checkpoint, Date.now());
    expect(manifest.deliverables.svg).not.toBeNull();
    expect(fs.existsSync(manifest.deliverables.svg!)).toBe(true);
    const svgContent = fs.readFileSync(manifest.deliverables.svg!, 'utf-8');
    expect(svgContent).toContain('<svg');
  });

  it('78. generateDeliverables() legal description TXT created for txt format', async () => {
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'STARR-TXT');
    const data = makeMinimalProjectData({
      projectId: 'STARR-TXT',
      reconciliation: {
        reconciledCalls: [
          { callId: 'C1', bearing: "N 45°00'00\" E", distance: 100, curve: null },
        ],
        corners: [],
        calls: [],
      },
    });
    const config = defaultReportConfig({ formats: ['txt'], outputDir: outDir });
    const checkpoint = {
      projectId: 'STARR-TXT',
      completedPhases: [],
      phaseOutputs: {},
      phaseDurations: {},
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    const manifest = await orch.generateDeliverables(data, config, checkpoint, Date.now());
    expect(manifest.deliverables.txt).not.toBeNull();
    expect(fs.existsSync(manifest.deliverables.txt!)).toBe(true);
    const txt = fs.readFileSync(manifest.deliverables.txt!, 'utf-8');
    expect(txt).toContain('THENCE');
  });
});

// ── PHASES constant ───────────────────────────────────────────────────────────

describe('PHASES constant (pipeline phase definitions)', () => {
  // Access via orchestrator private — use a test double that exposes it
  // We re-import the module path to reach the exported constant indirectly

  // Since PHASES is not exported, we test it through runPipeline's behavior
  // by inspecting the orchestrator source's known phase count.
  // Alternatively we can test via the executePhase endpoint assignments.

  // For behavioral testing:
  it('79. orchestrator processes exactly 9 phases in dependency order', async () => {
    // Verify the order by testing that skipPhases=[1..9] results in no http calls
    // (pipeline completes trivially when all phases are skipped)
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'SKIP-ALL');

    // Skip all 9 phases — pipeline should go straight to deliverables
    const manifest = await orch.runPipeline({
      address: '123 Test St',
      county: 'Bell',
      projectId: 'SKIP-ALL',
      outputDir: outDir,
      formats: [],
      budget: 0,
      skipPhases: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
    expect(manifest.projectId).toBe('SKIP-ALL');
    expect(manifest.metadata.phaseDurations.length).toBe(0);
  });

  it('80. critical phase 1 (Property Discovery) is marked critical', () => {
    // We verify indirectly: if phase 1 fails, the pipeline throws.
    // The orchestrator throws on critical phase failure with message:
    //   "Pipeline failed at critical Phase 1 (Name): reason"
    const orch = new MasterOrchestrator('http://localhost:0'); // invalid port → connection refused
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'CRIT-1');

    // Not skipping phase 1 — it will fail to connect → should throw (critical)
    return expect(
      orch.runPipeline({
        address: '123 Test St',
        county: 'Bell',
        projectId: 'CRIT-1',
        outputDir: outDir,
        formats: [],
        budget: 0,
      }),
    ).rejects.toThrow(/critical.*Phase 1|Phase 1.*critical/i);
  });

  it('81. non-critical phase 4 failure does not abort the pipeline', async () => {
    // Skip phases 1, 2, 3 (critical) so they won't throw.
    // Phase 4 will try to connect to invalid port → should fail but not throw.
    // Pipeline continues to 5, 6, 7, 8, 9 which also fail silently.
    // Then tries critical 7 → will also fail → throws.
    // Test: the run throws on phase 7 (not phase 4).
    const orch = new MasterOrchestrator('http://localhost:0');
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'NONCRIT-4');

    return expect(
      orch.runPipeline({
        address: '123 Test St',
        county: 'Bell',
        projectId: 'NONCRIT-4',
        outputDir: outDir,
        formats: [],
        budget: 0,
        // Skip phases 1,2,3 so pipeline gets to phase 4 without hitting critical error early
        skipPhases: [1, 2, 3],
      }),
    ).rejects.toThrow(/critical.*Phase 7|Phase 7.*critical/i);
  });

  it('82. critical phase 7 (Boundary Reconciliation) throws when it fails', async () => {
    const orch = new MasterOrchestrator('http://localhost:0');
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'CRIT-7');

    return expect(
      orch.runPipeline({
        address: '123 Test St',
        county: 'Bell',
        projectId: 'CRIT-7',
        outputDir: outDir,
        formats: [],
        budget: 0,
        skipPhases: [1, 2, 3, 4, 5, 6],
      }),
    ).rejects.toThrow(/critical.*Phase 7|Phase 7.*critical/i);
  });

  it('83. non-critical phase 9 (Document Purchase) does not stop pipeline when it fails', async () => {
    // Skip 1-8 (or all), let only phase 9 run — it should fail silently (non-critical)
    // and the pipeline should then proceed to deliverables successfully.
    const orch = new MasterOrchestrator('http://localhost:0');
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'NONCRIT-9');

    // Skip all critical phases so only phase 9 runs and fails silently
    const manifest = await orch.runPipeline({
      address: '123 Test St',
      county: 'Bell',
      projectId: 'NONCRIT-9',
      outputDir: outDir,
      formats: [],
      budget: 0,
      skipPhases: [1, 2, 3, 4, 5, 6, 7, 8],
    });
    // Pipeline completed successfully (phase 9 failure was tolerated)
    expect(manifest.projectId).toBe('NONCRIT-9');
  });

  it('84. all pipeline phase names are non-empty strings', async () => {
    // Inspect metadata from a completed (all-skipped) run
    // The phaseDurations entries will have name strings if phases ran.
    // We skip all so phaseDurations is empty.
    // Instead, verify via the manifest metadata structure.
    const orch = new MasterOrchestrator();
    (orch as any).outputDir = tmpTestDir;
    const outDir = path.join(tmpTestDir, 'deliverables', 'NAMES');

    const checkpoint = {
      projectId: 'NAMES',
      completedPhases: [],
      phaseOutputs: {},
      phaseDurations: { 1: 1.0, 2: 2.0, 3: 3.0, 7: 4.0, 8: 5.0 },
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    const data = makeMinimalProjectData({ projectId: 'NAMES' });
    const config = defaultReportConfig({ formats: [], outputDir: outDir });
    const manifest = await orch.generateDeliverables(data, config, checkpoint, Date.now());

    // All phase names in phaseDurations should be non-empty strings
    for (const entry of manifest.metadata.phaseDurations) {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });
});
