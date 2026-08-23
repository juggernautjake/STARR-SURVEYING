// __tests__/design/export.test.ts — the handoff has to say what the picture cannot.
//
// The export is the whole point of the studio: the owner designs a page, then hands me the PNG, the
// HTML and this spec. So the spec's job is not only to describe what IS there — it has to name the
// things a person looking at the picture would be misled about. That is what `warnings` is for, and
// this file is the list of what has to end up in it.

import { describe, it, expect } from 'vitest';
import { exportSpec, exportPrompt, type ExportContext } from '@/lib/design/export';
import { createDocument, addElement, type DesignDocument, type DesignElement } from '@/lib/design/document';

const NOW = '2026-08-23T00:00:00.000Z';

const ctx: ExportContext = {
  // A stub catalogue: the exporter takes its lookups as arguments precisely so this stays honest
  // without dragging 40 real entries into the test.
  getEntry: (id) => (id === 'known.box'
    ? {
      id: 'known.box', label: 'Box', category: 'structure', classes: ['admin-card'], keywords: [],
      slots: [], size: { default: { w: 200, h: 100 }, min: { w: 40, h: 24 } }, source: 'test',
      html: () => '<div class="admin-card"></div>',
    } as never
    : undefined),
  isAnnotation: (id) => id === 'shape.sticky',
  now: NOW,
};

function docWith(elements: Array<Partial<DesignElement>>): DesignDocument {
  let doc = createDocument({ id: 'd-test', name: 'Test page', route: '/admin/jobs', now: NOW });
  let view = doc.views.desktop;
  elements.forEach((patch, i) => {
    view = addElement(view, {
      id: `el-${i + 1}`,
      kind: 'catalogue',
      catalogId: 'known.box',
      slots: {},
      style: {},
      x: 100, y: 100, w: 200, h: 100,
      ...patch,
    } as Omit<DesignElement, 'z'>);
  });
  doc = { ...doc, views: { ...doc.views, desktop: view } };
  return doc;
}

describe('warnings — what the picture does not admit', () => {
  it('says nothing when everything fits', () => {
    const spec = exportSpec(docWith([{ x: 40, y: 40, w: 200, h: 100 }]), ctx);
    expect(spec.warnings).toEqual([]);
  });

  it('names an element hanging off the left edge, and by how much', () => {
    // Dragging something half off-canvas is allowed; being cropped in the PNG without a word is not.
    const spec = exportSpec(docWith([{ x: -96, w: 944 }]), ctx);
    expect(spec.warnings).toHaveLength(1);
    expect(spec.warnings[0]).toContain('96px off the left');
    expect(spec.warnings[0]).toContain('el-1');
  });

  it('names an element hanging off the right edge', () => {
    const spec = exportSpec(docWith([{ x: 1300, w: 300 }]), ctx);   // 1440 wide artboard
    expect(spec.warnings[0]).toContain('160px off the right');
  });

  it('warns about a note that is cut off too — a lost instruction is worse than a lost box', () => {
    const spec = exportSpec(docWith([{ catalogId: 'shape.sticky', x: -50, w: 200, slots: { text: 'Fix this' } }]), ctx);
    expect(spec.warnings.some((w) => w.includes('off the left'))).toBe(true);
    // …and it is still filed as a note rather than as something to build.
    expect(spec.views.desktop.annotations).toHaveLength(1);
    expect(spec.views.desktop.elements).toHaveLength(0);
  });

  it('carries every warning into the brief, where a person will actually read it', () => {
    const doc = docWith([{ x: -96, w: 944 }]);
    const spec = exportSpec(doc, ctx);
    expect(exportPrompt(doc, spec)).toContain('off the left');
  });

  it('still flags colours that left the token set', () => {
    const spec = exportSpec(docWith([{ style: { background: '#ff0000' } }]), ctx);
    expect(spec.warnings.some((w) => w.includes('outside the token set'))).toBe(true);
  });
});

describe('the spec itself', () => {
  it('keeps the two views separate, because they are separate designs', () => {
    const spec = exportSpec(docWith([{ x: 40 }]), ctx);
    expect(spec.views.desktop.elements).toHaveLength(1);
    expect(spec.views.mobile.elements).toHaveLength(0);
    expect(spec.views.mobile.size.width).toBe(390);
  });

  it('exports identically twice — a diff between two saves should be real changes only', () => {
    const doc = docWith([{ x: 40 }, { x: 400, catalogId: 'shape.sticky', slots: { text: 'note' } }]);
    expect(JSON.stringify(exportSpec(doc, ctx))).toBe(JSON.stringify(exportSpec(doc, ctx)));
  });

  it('hands over the real class names, which is the point of catalogued elements', () => {
    const spec = exportSpec(docWith([{ x: 40 }]), ctx);
    expect(spec.views.desktop.elements[0].classes).toContain('admin-card');
  });
});
