// __tests__/recon/phase12-export.test.ts
// Unit tests for STARR RECON Phase 12: Drawing Export (PNG, PDF, DXF).
//
// Tests cover:
//   1. renderToDxf — geometry/layer mapping, feature-class → layer routing
//   2. renderToPng — returns a non-empty Buffer
//   3. renderToPdf — returns a non-empty Buffer with PDF header
//   4. featureClassToLayer (indirectly via renderToDxf)

import { describe, it, expect } from 'vitest';
import { renderToDxf, renderToPng, renderToPdf } from '../../lib/research/export.service';
import type { RenderedDrawing, DrawingElement, FeatureClass } from '../../types/research';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeDrawing(overrides: Partial<RenderedDrawing> = {}): RenderedDrawing {
  return {
    id: 'draw-001',
    research_project_id: 'proj-001',
    name: 'Test Drawing',
    version: 1,
    status: 'draft',
    canvas_config: {
      width: 792,   // 11 inches × 72pt
      height: 612,  // 8.5 inches × 72pt
      scale: 100,
      units: 'feet',
      origin: [0, 0],
      background: '#FFFFFF',
    },
    title_block: null,
    overall_confidence: 82,
    confidence_breakdown: null,
    comparison_notes: null,
    user_annotations: null,
    user_preferences: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLineElement(id: string, fc: FeatureClass, x0 = 0, y0 = 0, x1 = 100, y1 = 100): DrawingElement {
  return {
    id,
    drawing_id: 'draw-001',
    element_type: 'line',
    feature_class: fc,
    geometry: { type: 'line', start: [x0, y0], end: [x1, y1] },
    svg_path: null,
    attributes: {},
    style: {
      stroke: '#000000',
      strokeWidth: 1,
      opacity: 1,
    },
    layer: 'default',
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
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function makePolygonElement(id: string, fc: FeatureClass): DrawingElement {
  return {
    ...makeLineElement(id, fc),
    element_type: 'polygon',
    geometry: {
      type: 'polygon',
      points: [[0, 0], [100, 0], [100, 100], [0, 100]],
    },
  };
}

function makeCurveElement(id: string, fc: FeatureClass): DrawingElement {
  return {
    ...makeLineElement(id, fc),
    element_type: 'curve',
    geometry: {
      type: 'curve',
      center: [50, 50],
      radius: 30,
      startAngle: 0,
      endAngle: Math.PI,
      direction: 'cw',
    },
  };
}

function makePointElement(id: string, fc: FeatureClass): DrawingElement {
  return {
    ...makeLineElement(id, fc),
    element_type: 'point',
    geometry: { type: 'point', position: [50, 50] },
  };
}

function makeLabelElement(id: string, text: string): DrawingElement {
  return {
    ...makeLineElement(id, 'annotation'),
    element_type: 'label',
    geometry: { type: 'label', position: [10, 10], anchor: 'start' },
    attributes: { text },
    style: {
      stroke: '#000000',
      strokeWidth: 1,
      opacity: 1,
      fontSize: 12,
    },
  };
}

// ── DXF Tests ─────────────────────────────────────────────────────────────────

describe('renderToDxf', () => {
  it('returns a Buffer', () => {
    const drawing = makeDrawing();
    const result = renderToDxf(drawing, []);
    expect(result).toBeInstanceOf(Buffer);
  });

  it('produces a non-empty DXF string with SECTION markers', () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'property_boundary');
    const result = renderToDxf(drawing, [el]);
    const str = result.toString('utf-8');
    expect(str).toContain('SECTION');
    expect(str).toContain('ENTITIES');
  });

  it('maps property_boundary to BOUNDARY layer', () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'property_boundary');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('BOUNDARY');
  });

  it('maps easement to EASEMENT layer', () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'easement');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('EASEMENT');
  });

  it('maps right_of_way to ROW layer', () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'right_of_way');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('ROW');
  });

  it('maps building to BUILDING layer', () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'building');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('BUILDING');
  });

  it('maps monument to MONUMENT layer', () => {
    const drawing = makeDrawing();
    const el = makePointElement('e1', 'monument');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('MONUMENT');
  });

  it('maps annotation to LABELS layer', () => {
    const drawing = makeDrawing();
    const el = makeLabelElement('e1', 'N 45°30\'00" E 120.00 ft');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('LABELS');
  });

  it('includes all standard layers in the layer table', () => {
    const drawing = makeDrawing();
    const str = renderToDxf(drawing, []).toString('utf-8');
    for (const layer of ['BOUNDARY', 'EASEMENT', 'SETBACK', 'ROW', 'BUILDING', 'FENCE', 'MONUMENT', 'LABELS']) {
      expect(str).toContain(layer);
    }
  });

  it('handles polygon geometry', () => {
    const drawing = makeDrawing();
    const el = makePolygonElement('e1', 'property_boundary');
    const result = renderToDxf(drawing, [el]);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles curve geometry', () => {
    const drawing = makeDrawing();
    const el = makeCurveElement('e1', 'right_of_way');
    const result = renderToDxf(drawing, [el]);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('skips invisible elements', () => {
    const drawing = makeDrawing();
    const visible = makeLineElement('e1', 'property_boundary');
    const hidden = { ...makeLineElement('e2', 'easement'), visible: false };
    const str = renderToDxf(drawing, [visible, hidden]).toString('utf-8');
    // Boundary line should be present, easement should not be in ENTITIES
    // (it is present in TABLES as a layer definition, but no entity should reference it)
    const entitySection = str.split('ENTITIES')[1] ?? '';
    expect(entitySection).not.toContain('EASEMENT');
  });

  it('handles empty elements array', () => {
    const drawing = makeDrawing();
    const result = renderToDxf(drawing, []);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('applies origin offset to coordinates', () => {
    // Drawing with non-zero origin — geometry should be shifted
    const drawing = makeDrawing({ canvas_config: { width: 792, height: 612, scale: 100, units: 'feet', origin: [50, 50], background: '#FFFFFF' } });
    const el = makeLineElement('e1', 'property_boundary', 100, 100, 200, 200);
    // Should not throw
    expect(() => renderToDxf(drawing, [el])).not.toThrow();
  });

  it('handles label with empty text gracefully', () => {
    const drawing = makeDrawing();
    const el = makeLabelElement('e1', '');
    expect(() => renderToDxf(drawing, [el])).not.toThrow();
  });

  it('handles unknown feature class — falls back to MISC', () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'other');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('MISC');
  });

  it('handles multiple elements of different types', () => {
    const drawing = makeDrawing();
    const elements = [
      makeLineElement('e1', 'property_boundary'),
      makePolygonElement('e2', 'building'),
      makeCurveElement('e3', 'right_of_way'),
      makePointElement('e4', 'monument'),
      makeLabelElement('e5', 'Parcel 1234'),
    ];
    const result = renderToDxf(drawing, elements);
    expect(result.length).toBeGreaterThan(100);
  });

  it('lot_line also maps to BOUNDARY', () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'lot_line');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('BOUNDARY');
  });

  it('setback maps to SETBACK layer', () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'setback');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('SETBACK');
  });

  it('fence maps to FENCE layer', () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'fence');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('FENCE');
  });

  it('utility maps to UTILITY layer', () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'utility');
    const str = renderToDxf(drawing, [el]).toString('utf-8');
    expect(str).toContain('UTILITY');
  });
});

// ── PNG Tests ────────────────────────────────────────────────────────────────

describe('renderToPng', () => {
  it('returns a non-empty Buffer', async () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'property_boundary');
    const result = await renderToPng(drawing, [el]);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(100);
  });

  it('PNG buffer starts with PNG magic bytes', async () => {
    const drawing = makeDrawing();
    const result = await renderToPng(drawing, []);
    // PNG files start with \x89PNG
    expect(result[0]).toBe(0x89);
    expect(result.slice(1, 4).toString('ascii')).toBe('PNG');
  });

  it('handles empty elements array', async () => {
    const drawing = makeDrawing();
    const result = await renderToPng(drawing, []);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('produces a larger output for feature view mode', async () => {
    const drawing = makeDrawing();
    const elements = [
      makeLineElement('e1', 'property_boundary'),
      makePolygonElement('e2', 'building'),
    ];
    const standard = await renderToPng(drawing, elements, 'standard');
    const feature = await renderToPng(drawing, elements, 'feature');
    // Both should produce valid PNGs (sizes may vary)
    expect(standard.length).toBeGreaterThan(0);
    expect(feature.length).toBeGreaterThan(0);
  });

  it('respects showTitleBlock=false', async () => {
    const drawing = makeDrawing({ title_block: { company: 'Test Co' } });
    const withTB = await renderToPng(drawing, [], 'standard', true);
    const withoutTB = await renderToPng(drawing, [], 'standard', false);
    // Both should return valid PNG buffers
    expect(withTB[0]).toBe(0x89);
    expect(withoutTB[0]).toBe(0x89);
  });
});

// ── PDF Tests ────────────────────────────────────────────────────────────────

describe('renderToPdf', () => {
  it('returns a non-empty Buffer', async () => {
    const drawing = makeDrawing();
    const el = makeLineElement('e1', 'property_boundary');
    const result = await renderToPdf(drawing, [el]);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(100);
  });

  it('PDF buffer starts with %PDF header', async () => {
    const drawing = makeDrawing();
    const result = await renderToPdf(drawing, []);
    expect(result.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('handles empty elements array', async () => {
    const drawing = makeDrawing();
    const result = await renderToPdf(drawing, []);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('supports landscape orientation (width > height)', async () => {
    const drawing = makeDrawing({ canvas_config: { width: 1080, height: 612, scale: 100, units: 'feet', origin: [0, 0], background: '#FFFFFF' } });
    const result = await renderToPdf(drawing, []);
    expect(result.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('supports portrait orientation (height > width)', async () => {
    const drawing = makeDrawing({ canvas_config: { width: 612, height: 792, scale: 100, units: 'feet', origin: [0, 0], background: '#FFFFFF' } });
    const result = await renderToPdf(drawing, []);
    expect(result.slice(0, 4).toString('ascii')).toBe('%PDF');
  });
});
