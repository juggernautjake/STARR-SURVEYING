// __tests__/cad/templates/templates.test.ts — Unit tests for template system
import { describe, it, expect } from 'vitest';
import {
  STANDARD_NOTES,
  getDefaultNotes,
  formatNoteText,
} from '@/lib/cad/templates/standard-notes';
import {
  DEFAULT_CERTIFICATION_TEXT,
  formatCertificationText,
  DEFAULT_CERTIFICATION_CONFIG,
} from '@/lib/cad/templates/certification';
import {
  computeDrawableArea,
  computeTitleBlockBounds,
  DEFAULT_BORDER_CONFIG,
} from '@/lib/cad/templates/sheet-border';
import {
  STARR_SURVEYING_TEMPLATE,
  LETTER_TEMPLATE,
  ARCH_D_TEMPLATE,
  STARR_COMPANY_INFO,
} from '@/lib/cad/templates/default-templates';
import {
  computePrintTransform,
  DEFAULT_PRINT_CONFIG,
  buildPrintTitle,
} from '@/lib/cad/templates/print-engine';
import { PAPER_DIMENSIONS } from '@/lib/cad/templates/types';

// ── STANDARD_NOTES ────────────────────────────────────────────────────────────

describe('STANDARD_NOTES', () => {
  it('has at least 10 notes', () => {
    expect(STANDARD_NOTES.length).toBeGreaterThanOrEqual(10);
  });

  it('every note has id, category, text, isDefault', () => {
    for (const note of STANDARD_NOTES) {
      expect(typeof note.id).toBe('string');
      expect(note.id.length).toBeGreaterThan(0);
      expect(typeof note.category).toBe('string');
      expect(typeof note.text).toBe('string');
      expect(note.text.length).toBeGreaterThan(0);
      expect(typeof note.isDefault).toBe('boolean');
    }
  });

  it('note IDs are unique', () => {
    const ids = STANDARD_NOTES.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('at least one note has isDefault=true', () => {
    expect(STANDARD_NOTES.some(n => n.isDefault)).toBe(true);
  });
});

describe('getDefaultNotes', () => {
  it('returns only notes with isDefault=true', () => {
    const defaults = getDefaultNotes();
    expect(defaults.every(n => n.isDefault)).toBe(true);
  });

  it('returns a non-empty array', () => {
    expect(getDefaultNotes().length).toBeGreaterThan(0);
  });
});

describe('formatNoteText', () => {
  it('substitutes {{vol}} and {{pg}}', () => {
    const result = formatNoteText('Volume {{vol}}, Page {{pg}}', { vol: '42', pg: '123' });
    expect(result).toBe('Volume 42, Page 123');
  });

  it('leaves unreferenced variables untouched', () => {
    const result = formatNoteText('Value: {{x}}', { y: 'test' });
    expect(result).toContain('{{x}}');
  });

  it('handles empty vars record', () => {
    const result = formatNoteText('No vars here.', {});
    expect(result).toBe('No vars here.');
  });
});

// ── CERTIFICATION ─────────────────────────────────────────────────────────────

describe('DEFAULT_CERTIFICATION_TEXT', () => {
  it('is a non-empty string', () => {
    expect(typeof DEFAULT_CERTIFICATION_TEXT).toBe('string');
    expect(DEFAULT_CERTIFICATION_TEXT.length).toBeGreaterThan(50);
  });
});

describe('formatCertificationText', () => {
  it('substitutes all 5 variables', () => {
    const result = formatCertificationText(
      DEFAULT_CERTIFICATION_TEXT,
      'Jane Smith',
      'Texas',
      '2',
      'II',
      '10000',
    );
    // The default template uses {{state}}, {{category}}, {{condition}}, {{precisionRatio}}
    expect(result).toContain('Texas');
    expect(result).toContain('2');
    expect(result).toContain('10000');
  });
});

describe('DEFAULT_CERTIFICATION_CONFIG', () => {
  it('has visible=true', () => {
    expect(DEFAULT_CERTIFICATION_CONFIG.visible).toBe(true);
  });

  it('showSealPlaceholder is true', () => {
    expect(DEFAULT_CERTIFICATION_CONFIG.showSealPlaceholder).toBe(true);
  });

  it('sealDiameter > 0', () => {
    expect(DEFAULT_CERTIFICATION_CONFIG.sealDiameter).toBeGreaterThan(0);
  });
});

// ── SHEET BORDER & DRAWABLE AREA ─────────────────────────────────────────────

describe('computeTitleBlockBounds', () => {
  const cfgBR = {
    position: 'BOTTOM_RIGHT' as const,
    customBounds: null,
    fields: {} as never,
    showCompanyLogo: false, showCompanyInfo: true, showLicenseNumber: true, showSealPlaceholder: false,
    font: 'Arial', borderWeight: 0.5, dividerWeight: 0.25,
  };

  it('TABLOID LANDSCAPE BOTTOM_RIGHT has positive width and height', () => {
    const bounds = computeTitleBlockBounds(cfgBR, 'TABLOID', 'LANDSCAPE');
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it('BOTTOM_RIGHT x + width equals paper width for TABLOID LANDSCAPE (17")', () => {
    const bounds = computeTitleBlockBounds(cfgBR, 'TABLOID', 'LANDSCAPE');
    expect(bounds.x + bounds.width).toBeCloseTo(17, 3); // TABLOID landscape width = 17"
  });

  it('CUSTOM position returns customBounds directly', () => {
    const cfg = { ...cfgBR, position: 'CUSTOM' as const, customBounds: { x: 1, y: 2, width: 3, height: 4 } };
    const bounds = computeTitleBlockBounds(cfg, 'TABLOID', 'LANDSCAPE');
    expect(bounds).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});

describe('computeDrawableArea', () => {
  const margins = { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 };

  it('drawable area is smaller than paper when margins > 0', () => {
    const area = computeDrawableArea('TABLOID', 'LANDSCAPE', margins, null);
    const paper = PAPER_DIMENSIONS['TABLOID'];
    const pw = paper.height; // landscape
    const ph = paper.width;
    expect(area.width).toBeLessThan(pw);
    expect(area.height).toBeLessThan(ph);
  });

  it('no titleBlock: width = paperWidth - left - right', () => {
    const area = computeDrawableArea('LETTER', 'PORTRAIT', margins, null);
    const paper = PAPER_DIMENSIONS['LETTER'];
    expect(area.width).toBeCloseTo(paper.width - margins.left - margins.right, 3);
  });

  it('with right-strip titleBlock: drawable width reduced', () => {
    const tbBounds = { x: 8.0, y: 0, width: 0.5, height: 11 };
    const areaWithTB = computeDrawableArea('LETTER', 'PORTRAIT', margins, tbBounds);
    const areaNoTB  = computeDrawableArea('LETTER', 'PORTRAIT', margins, null);
    expect(areaWithTB.width).toBeLessThan(areaNoTB.width);
  });
});

describe('DEFAULT_BORDER_CONFIG', () => {
  it('visible is true', () => expect(DEFAULT_BORDER_CONFIG.visible).toBe(true));
  it('outerWeight > 0', () => expect(DEFAULT_BORDER_CONFIG.outerWeight).toBeGreaterThan(0));
});

// ── DEFAULT TEMPLATES ─────────────────────────────────────────────────────────

describe('STARR_SURVEYING_TEMPLATE', () => {
  it('id is "starr-surveying-default"', () => {
    expect(STARR_SURVEYING_TEMPLATE.id).toBe('starr-surveying-default');
  });

  it('isBuiltIn is true', () => {
    expect(STARR_SURVEYING_TEMPLATE.isBuiltIn).toBe(true);
  });

  it('paperSize is TABLOID', () => {
    expect(STARR_SURVEYING_TEMPLATE.paperSize).toBe('TABLOID');
  });

  it('orientation is LANDSCAPE', () => {
    expect(STARR_SURVEYING_TEMPLATE.orientation).toBe('LANDSCAPE');
  });

  it('scale is 50', () => {
    expect(STARR_SURVEYING_TEMPLATE.scale).toBe(50);
  });
});

describe('LETTER_TEMPLATE', () => {
  it('paperSize is LETTER', () => expect(LETTER_TEMPLATE.paperSize).toBe('LETTER'));
  it('isBuiltIn is true', () => expect(LETTER_TEMPLATE.isBuiltIn).toBe(true));
});

describe('ARCH_D_TEMPLATE', () => {
  it('paperSize is ARCH_D', () => expect(ARCH_D_TEMPLATE.paperSize).toBe('ARCH_D'));
  it('scale >= 50', () => expect(ARCH_D_TEMPLATE.scale).toBeGreaterThanOrEqual(50));
});

describe('STARR_COMPANY_INFO', () => {
  it('has company name', () => expect(STARR_COMPANY_INFO.name.length).toBeGreaterThan(0));
  it('has phone number', () => expect(STARR_COMPANY_INFO.phone.length).toBeGreaterThan(0));
  it('licenseNumber contains RPLS', () => expect(STARR_COMPANY_INFO.licenseNumber).toContain('RPLS'));
});

// ── PRINT ENGINE ──────────────────────────────────────────────────────────────

describe('computePrintTransform', () => {
  const area = { x: 0.5, y: 0.5, width: 16, height: 10 };

  it('returns finite offset and scale', () => {
    const extents = { minX: 0, minY: 0, maxX: 800, maxY: 500 };
    const tx = computePrintTransform(area, extents, 50, false);
    expect(isFinite(tx.offsetX)).toBe(true);
    expect(isFinite(tx.offsetY)).toBe(true);
    expect(isFinite(tx.scale)).toBe(true);
  });

  it('scale is positive', () => {
    const extents = { minX: 0, minY: 0, maxX: 800, maxY: 500 };
    const tx = computePrintTransform(area, extents, 50, false);
    expect(tx.scale).toBeGreaterThan(0);
  });

  it('zero-size extents does not throw', () => {
    const extents = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    expect(() => computePrintTransform(area, extents, 50, false)).not.toThrow();
  });
});

describe('buildPrintTitle', () => {
  it('returns a non-empty string', () => {
    const tbConfig = STARR_SURVEYING_TEMPLATE.titleBlock;
    const title = buildPrintTitle(tbConfig, STARR_COMPANY_INFO);
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
  });
});

describe('DEFAULT_PRINT_CONFIG', () => {
  it('output defaults to PDF', () => expect(DEFAULT_PRINT_CONFIG.output).toBe('PDF'));
  it('dpi is 300', () => expect(DEFAULT_PRINT_CONFIG.dpi).toBe(300));
  it('paperSize matches STARR_SURVEYING_TEMPLATE', () => {
    expect(DEFAULT_PRINT_CONFIG.paperSize).toBe(STARR_SURVEYING_TEMPLATE.paperSize);
  });
});

describe('PAPER_DIMENSIONS', () => {
  it('has 5 paper sizes', () => {
    expect(Object.keys(PAPER_DIMENSIONS)).toHaveLength(5);
  });

  it('LETTER is 8.5 × 11', () => {
    expect(PAPER_DIMENSIONS.LETTER).toEqual({ width: 8.5, height: 11 });
  });

  it('TABLOID is 11 × 17', () => {
    expect(PAPER_DIMENSIONS.TABLOID).toEqual({ width: 11, height: 17 });
  });

  it('all dimensions are positive', () => {
    for (const [, dims] of Object.entries(PAPER_DIMENSIONS)) {
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    }
  });
});
