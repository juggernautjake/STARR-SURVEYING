// __tests__/cad/recon-to-cad.test.ts — Unit tests for the RECON → CAD converter
import { describe, it, expect } from 'vitest';
import { convertReconToCAD, hasConvertibleElements } from '@/lib/cad/recon-to-cad';
import type { DrawingElement, RenderedDrawing } from '@/types/research';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeDrawing(overrides: Partial<RenderedDrawing> = {}): RenderedDrawing {
  return {
    id: 'drawing-1',
    research_project_id: 'project-1',
    name: 'Test Drawing v1',
    version: 1,
    status: 'rendered',
    canvas_config: {
      width: 3600,
      height: 2400,
      scale: 50,      // 1" = 50 ft at 96 DPI → feetPerPixel = 50/96 ≈ 0.521
      units: 'feet',
      origin: [200, 200],
      background: '#FFFFFF',
    },
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function makeElement(
  overrides: Partial<DrawingElement> = {},
  geomOverride?: DrawingElement['geometry'],
): DrawingElement {
  return {
    id: `el-${Math.random().toString(36).slice(2, 8)}`,
    drawing_id: 'drawing-1',
    element_type: 'line',
    feature_class: 'property_boundary',
    geometry: geomOverride ?? { type: 'line', start: [200, 200], end: [400, 200] },
    svg_path: null,
    attributes: {},
    style: {
      stroke: '#000000',
      strokeWidth: 2,
      opacity: 1,
    },
    layer: 'boundary',
    z_index: 0,
    visible: true,
    locked: false,
    confidence_score: 90,
    confidence_factors: {
      source_quality: 90,
      extraction_certainty: 90,
      cross_reference_match: 90,
      geometric_consistency: 90,
      closure_contribution: 90,
    },
    ai_report: null,
    source_references: [],
    data_point_ids: [],
    discrepancy_ids: [],
    user_modified: false,
    user_notes: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

// ── convertReconToCAD ─────────────────────────────────────────────────────────

describe('convertReconToCAD — basic structure', () => {
  it('returns a DrawingDocument with required fields', () => {
    const doc = convertReconToCAD(makeDrawing(), [], 'Test Project');
    expect(doc.id).toBeTruthy();
    expect(doc.name).toBe('Test Drawing v1');
    expect(typeof doc.features).toBe('object');
    expect(typeof doc.layers).toBe('object');
    expect(Array.isArray(doc.layerOrder)).toBe(true);
    expect(doc.settings).toBeDefined();
  });

  it('uses drawing name for the doc name', () => {
    const doc = convertReconToCAD(makeDrawing({ name: 'My Survey' }), []);
    expect(doc.name).toBe('My Survey');
  });

  it('populates title block with project name', () => {
    const doc = convertReconToCAD(makeDrawing(), [], '123 Main St, Houston TX');
    expect(doc.settings.titleBlock.projectName).toBe('123 Main St');
    expect(doc.settings.titleBlock.clientName).toBe('Houston TX');
  });

  it('sets author to STARR RECON', () => {
    const doc = convertReconToCAD(makeDrawing(), []);
    expect(doc.author).toBe('STARR RECON');
  });

  it('includes all standard survey layers', () => {
    const doc = convertReconToCAD(makeDrawing(), []);
    expect(doc.layers['BOUNDARY']).toBeDefined();
    expect(doc.layers['BOUNDARY-MON']).toBeDefined();
    expect(doc.layers['EASEMENT']).toBeDefined();
    expect(doc.layers['ROW']).toBeDefined();
    expect(doc.layers['ANNOTATION']).toBeDefined();
  });

  it('returns empty features when given no elements', () => {
    const doc = convertReconToCAD(makeDrawing(), []);
    expect(Object.keys(doc.features)).toHaveLength(0);
  });

  it('skips hidden elements', () => {
    const hidden = makeElement({ visible: false });
    const doc = convertReconToCAD(makeDrawing(), [hidden]);
    expect(Object.keys(doc.features)).toHaveLength(0);
  });
});

// ── Feature layer mapping ─────────────────────────────────────────────────────

describe('convertReconToCAD — feature class → layer mapping', () => {
  const cases: Array<[DrawingElement['feature_class'], string]> = [
    ['property_boundary', 'BOUNDARY'],
    ['lot_line',          'BOUNDARY'],
    ['easement',          'EASEMENT'],
    ['setback',           'BUILDING-LINE'],
    ['right_of_way',      'ROW'],
    ['monument',          'BOUNDARY-MON'],
    ['control_point',     'CONTROL'],
    ['road',              'TRANSPORTATION'],
    ['building',          'STRUCTURES'],
    ['fence',             'FENCE'],
    ['tree_line',         'VEGETATION'],
    ['contour',           'TOPO'],
    ['annotation',        'ANNOTATION'],
    ['other',             'MISC'],
  ];

  for (const [featureClass, expectedLayer] of cases) {
    it(`maps ${featureClass} → ${expectedLayer}`, () => {
      const el = makeElement({ feature_class: featureClass });
      const doc = convertReconToCAD(makeDrawing(), [el]);
      const feature = Object.values(doc.features)[0];
      expect(feature).toBeDefined();
      expect(feature.layerId).toBe(expectedLayer);
    });
  }
});

// ── Line geometry ─────────────────────────────────────────────────────────────

describe('convertReconToCAD — line geometry', () => {
  it('converts a line element to a LINE feature', () => {
    const el = makeElement({}, { type: 'line', start: [200, 200], end: [400, 200] });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.type).toBe('LINE');
    expect(feature.geometry.type).toBe('LINE');
    expect(feature.geometry.start).toBeDefined();
    expect(feature.geometry.end).toBeDefined();
  });

  it('applies coordinate conversion (origin at [200,200], scale=50)', () => {
    // origin = [200, 200], scale=50, feetPerPixel = 50/96 ≈ 0.5208
    // start canvas [200,200] → survey (0, 0)
    // end canvas [392,200] → survey x = (392-200)*0.5208 ≈ 100, y = 0
    const fpp = 50 / 96;
    const el = makeElement({}, {
      type: 'line',
      start: [200, 200],
      end: [200 + Math.round(100 / fpp), 200],
    });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    const start = feature.geometry.start!;
    const end = feature.geometry.end!;
    expect(start.x).toBeCloseTo(0, 1);
    expect(start.y).toBeCloseTo(0, 1);
    expect(end.x).toBeCloseTo(100, 0);
    expect(end.y).toBeCloseTo(0, 1);
  });

  it('flips the Y axis (SVG Y-down → survey Y-up)', () => {
    // canvas point below origin [200, 300] → survey y should be negative
    const el = makeElement({}, { type: 'line', start: [200, 300], end: [200, 200] });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    // start: canvas [200,300] → y = -(300-200)*fpp < 0
    expect(feature.geometry.start!.y).toBeLessThan(0);
    // end: canvas [200,200] → y = 0
    expect(feature.geometry.end!.y).toBeCloseTo(0, 1);
  });
});

// ── Polygon geometry ──────────────────────────────────────────────────────────

describe('convertReconToCAD — polygon geometry', () => {
  it('converts a polygon element to a POLYGON feature', () => {
    const el = makeElement({ element_type: 'polygon' }, {
      type: 'polygon',
      points: [[200, 200], [400, 200], [400, 400], [200, 400]],
    });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.type).toBe('POLYGON');
    expect(feature.geometry.type).toBe('POLYGON');
    expect(feature.geometry.vertices).toHaveLength(4);
  });

  it('skips a polygon with fewer than 2 points', () => {
    const el = makeElement({ element_type: 'polygon' }, {
      type: 'polygon',
      points: [[200, 200]],
    });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    expect(Object.keys(doc.features)).toHaveLength(0);
  });
});

// ── Point geometry ────────────────────────────────────────────────────────────

describe('convertReconToCAD — point geometry', () => {
  it('converts a point element to a POINT feature', () => {
    const el = makeElement(
      { element_type: 'point', feature_class: 'monument' },
      { type: 'point', position: [300, 300] },
    );
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.type).toBe('POINT');
    expect(feature.geometry.point).toBeDefined();
    expect(feature.layerId).toBe('BOUNDARY-MON');
  });
});

// ── Curve (arc) geometry ──────────────────────────────────────────────────────

describe('convertReconToCAD — curve geometry', () => {
  it('converts a curve element to an ARC feature', () => {
    const el = makeElement({ element_type: 'curve' }, {
      type: 'curve',
      center: [300, 300],
      radius: 50,
      startAngle: 0,
      endAngle: Math.PI / 2,
      direction: 'cw',
    });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.type).toBe('ARC');
    expect(feature.geometry.arc).toBeDefined();
    expect(feature.geometry.arc!.radius).toBeGreaterThan(0);
    // CW in SVG → anticlockwise in survey
    expect(feature.geometry.arc!.anticlockwise).toBe(true);
  });

  it('converts a CCW curve direction correctly', () => {
    const el = makeElement({ element_type: 'curve' }, {
      type: 'curve',
      center: [300, 300],
      radius: 50,
      startAngle: 0,
      endAngle: Math.PI / 2,
      direction: 'ccw',
    });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.geometry.arc!.anticlockwise).toBe(false);
  });
});

// ── Label / text geometry ─────────────────────────────────────────────────────

describe('convertReconToCAD — label/text geometry', () => {
  it('converts a label element to a TEXT feature', () => {
    const el = makeElement(
      {
        element_type: 'label',
        feature_class: 'annotation',
        attributes: { text: 'N 45°00\'00" E' },
      },
      { type: 'label', position: [250, 250], anchor: 'middle' },
    );
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.type).toBe('TEXT');
    expect(feature.geometry.textContent).toBe("N 45°00'00\" E");
    expect(feature.geometry.point).toBeDefined();
  });
});

// ── Style conversion ──────────────────────────────────────────────────────────

describe('convertReconToCAD — style conversion', () => {
  it('maps stroke color to feature color', () => {
    const el = makeElement({ style: { stroke: '#FF0000', strokeWidth: 2, opacity: 1 } });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.style.color).toBe('#FF0000');
  });

  it('maps opacity', () => {
    const el = makeElement({ style: { stroke: '#000', strokeWidth: 1, opacity: 0.5 } });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.style.opacity).toBe(0.5);
  });

  it('maps solid stroke (no dasharray) to SOLID lineType', () => {
    const el = makeElement({ style: { stroke: '#000', strokeWidth: 1, opacity: 1 } });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.style.lineTypeId).toBe('SOLID');
  });

  it('maps 2-segment dasharray to DASHED lineType', () => {
    const el = makeElement({ style: { stroke: '#CC0000', strokeWidth: 1, opacity: 1, strokeDasharray: '10,5' } });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.style.lineTypeId).toBe('DASHED');
  });

  it('maps 4-segment dasharray to DASH_DOT lineType', () => {
    const el = makeElement({ style: { stroke: '#000', strokeWidth: 1, opacity: 1, strokeDasharray: '15,5,5,5' } });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.style.lineTypeId).toBe('DASH_DOT');
  });
});

// ── Properties propagation ────────────────────────────────────────────────────

describe('convertReconToCAD — properties propagation', () => {
  it('stores RECON metadata in feature properties', () => {
    const el = makeElement({ confidence_score: 85, user_modified: true, user_notes: 'Adjusted' });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = Object.values(doc.features)[0];
    expect(feature.properties.confidence_score).toBe(85);
    expect(feature.properties.user_modified).toBe(1);
    expect(feature.properties.user_notes).toBe('Adjusted');
  });

  it('preserves the original RECON element ID as recon_element_id', () => {
    const el = makeElement({ id: 'elem-abc123' });
    const doc = convertReconToCAD(makeDrawing(), [el]);
    const feature = doc.features['elem-abc123'];
    expect(feature).toBeDefined();
    expect(feature.properties.recon_element_id).toBe('elem-abc123');
  });
});

// ── Multiple elements ─────────────────────────────────────────────────────────

describe('convertReconToCAD — multiple elements', () => {
  it('converts all visible elements and skips hidden ones', () => {
    const el1 = makeElement({ id: 'el-1', visible: true });
    const el2 = makeElement({ id: 'el-2', visible: false });
    const el3 = makeElement({ id: 'el-3', visible: true });
    const doc = convertReconToCAD(makeDrawing(), [el1, el2, el3]);
    expect(Object.keys(doc.features)).toHaveLength(2);
    expect(doc.features['el-1']).toBeDefined();
    expect(doc.features['el-2']).toBeUndefined();
    expect(doc.features['el-3']).toBeDefined();
  });
});

// ── hasConvertibleElements ────────────────────────────────────────────────────

describe('hasConvertibleElements', () => {
  it('returns false for empty list', () => {
    expect(hasConvertibleElements([])).toBe(false);
  });

  it('returns false when all elements are hidden', () => {
    const el = makeElement({ visible: false });
    expect(hasConvertibleElements([el])).toBe(false);
  });

  it('returns true when at least one visible element has geometry', () => {
    const el = makeElement({ visible: true });
    expect(hasConvertibleElements([el])).toBe(true);
  });
});
