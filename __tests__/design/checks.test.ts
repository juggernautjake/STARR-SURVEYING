// __tests__/design/checks.test.ts — the rules the studio holds a mockup to.
//
// The value of these checks is entirely in their precision. A checker that cries wolf gets turned
// off, and a checker that is turned off is worse than none because everyone believes it is on. So
// as many of these tests are about what must NOT be reported as about what must.

import { describe, it, expect } from 'vitest';
import {
  runChecks, applyDismissals, contrastRatio, parseColour, requiredContrast, findingId, CONTRACT,
  type CheckContext,
} from '@/lib/design/checks';
import { createDocument, addElement, type DesignView, type DesignElement } from '@/lib/design/document';
import contractJson from '@/lib/design/contract.json';

const ctx: CheckContext = {
  isControl: (el) => el.catalogId === 'button.admin',
  hasText: (el) => el.kind === 'text' || el.catalogId === 'button.admin' || el.catalogId === 'text.body',
  nameOf: (el) => el.name ?? el.kind,
  pageBackground: '#FFFFFF',
};

function viewWith(patches: Array<Partial<DesignElement>>): DesignView {
  let view = createDocument({ id: 'd', name: 'n', now: '2026-08-23T00:00:00.000Z' }).views.desktop;
  patches.forEach((patch, i) => {
    view = addElement(view, {
      id: `el-${i + 1}`, kind: 'catalogue', catalogId: 'button.admin', slots: {}, style: {},
      x: 40, y: 40, w: 160, h: 40, name: 'Save button', ...patch,
    } as Omit<DesignElement, 'z'>);
  });
  return view;
}

describe('the thresholds are shared, not copied', () => {
  it('reads the same file scripts/ui-fit-sweep.mjs reads', () => {
    // The whole point of contract.json. If these ever drift apart again, the studio starts blessing
    // layouts the sweep fails, and both sides are confident.
    expect(CONTRACT.minTapTarget).toBe(contractJson.minTapTarget);
    expect(CONTRACT.minFontPx).toBe(contractJson.minFontPx);
    expect(CONTRACT.minTapTarget).toBe(40);
    expect(CONTRACT.minFontPx).toBe(12);
  });
});

describe('controls too small to hit', () => {
  it('flags a control under the tap floor on its short side', () => {
    const found = runChecks(viewWith([{ h: 28 }]), ctx);
    expect(found).toHaveLength(1);
    expect(found[0].check).toBe('tap-target');
    expect(found[0].message).toContain('160×28');
    expect(found[0].severity).toBe('must');
  });

  it('says nothing about a control exactly at the floor', () => {
    expect(runChecks(viewWith([{ h: CONTRACT.minTapTarget }]), ctx)).toEqual([]);
  });

  it('does not flag a small thing that is not a control', () => {
    // A 12px tag is a tag. Flagging every small element is how a checker becomes noise.
    expect(runChecks(viewWith([{ catalogId: 'tag.chip', h: 20, w: 60 }]), ctx)).toEqual([]);
  });
});

describe('text too small to read', () => {
  it('flags type under the floor, in px and in rem', () => {
    expect(runChecks(viewWith([{ catalogId: 'text.body', style: { fontSize: '10px' } }]), ctx)[0].check)
      .toBe('text-size');
    expect(runChecks(viewWith([{ catalogId: 'text.body', style: { fontSize: '0.625rem' } }]), ctx)[0].message)
      .toContain('10px');
  });

  it('says nothing when no size was set at all', () => {
    // No override means the app's own stylesheet decides, and that is already audited elsewhere.
    // Guessing a size here would report on every element in every design.
    expect(runChecks(viewWith([{ catalogId: 'text.body' }]), ctx)).toEqual([]);
  });
});

describe('off the edge', () => {
  it('flags an element hanging off the left, and calls it a should rather than a must', () => {
    const found = runChecks(viewWith([{ x: -96 }]), ctx);
    expect(found[0].check).toBe('off-canvas');
    expect(found[0].message).toContain('96px off the left');
    expect(found[0].severity).toBe('should');
  });

  it('flags one hanging off the right', () => {
    expect(runChecks(viewWith([{ x: 1400, w: 160 }]), ctx)[0].message).toContain('120px off the right');
  });
});

describe('contrast', () => {
  it('computes the WCAG ratio', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('reads #rgb, #rrggbb and rgb()', () => {
    expect(parseColour('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColour('#1D3095')).toEqual({ r: 29, g: 48, b: 149 });
    expect(parseColour('rgb(29, 48, 149)')).toEqual({ r: 29, g: 48, b: 149 });
  });

  it('gives up honestly on a token rather than guessing', () => {
    // Guessing would put a contrast warning on every correctly-tokenised element in the app, which
    // is precisely the way to teach somebody to ignore the panel.
    expect(parseColour('var(--color-text-primary)')).toBeNull();
    expect(contrastRatio('var(--color-text-primary)', '#fff')).toBeNull();
  });

  it('allows large text the lower ratio, exactly as WCAG does', () => {
    expect(requiredContrast(14, false)).toBe(CONTRACT.minContrastBody);
    expect(requiredContrast(24, false)).toBe(CONTRACT.minContrastLarge);
    expect(requiredContrast(19, true)).toBe(CONTRACT.minContrastLarge);
    expect(requiredContrast(19, false)).toBe(CONTRACT.minContrastBody);
  });

  it('flags pale text on white and leaves readable text alone', () => {
    const pale = runChecks(viewWith([{ catalogId: 'text.body', style: { color: '#CCCCCC', fontSize: '14px' } }]), ctx);
    expect(pale.some((f) => f.check === 'contrast')).toBe(true);
    const fine = runChecks(viewWith([{ catalogId: 'text.body', style: { color: '#0F1419', fontSize: '14px' } }]), ctx);
    expect(fine.some((f) => f.check === 'contrast')).toBe(false);
  });

  it('measures against the element\'s own background, not the page, when it has one', () => {
    const onNavy = viewWith([{ catalogId: 'text.body', style: { color: '#FFFFFF', background: '#1D3095', fontSize: '14px' } }]);
    expect(runChecks(onNavy, ctx).some((f) => f.check === 'contrast')).toBe(false);
  });
});

describe('dismissal', () => {
  it('takes a finding out of the open list and keeps it, with its reason', () => {
    const view = viewWith([{ h: 28 }]);
    const found = runChecks(view, ctx);
    const { open, answered } = applyDismissals(found, [
      { findingId: found[0].id, reason: 'the icon sits in a 48px hit area', at: '2026-08-23T00:00:00.000Z' },
    ]);
    expect(open).toEqual([]);
    expect(answered).toHaveLength(1);
    expect(answered[0].reason).toBe('the icon sits in a 48px hit area');
  });

  it('survives the element being moved — a dismissal is about the CHECK, not the position', () => {
    // If ids were positional, nudging something 8px would resurrect every dismissal on it, and
    // nobody would use the feature twice.
    const before = runChecks(viewWith([{ h: 28, x: 40 }]), ctx)[0].id;
    const after = runChecks(viewWith([{ h: 28, x: 400, y: 700 }]), ctx)[0].id;
    expect(after).toBe(before);
    expect(before).toBe(findingId('el-1', 'tap-target'));
  });

  it('does not silence a DIFFERENT problem on the same element', () => {
    const view = viewWith([{ h: 28, x: -96 }]);
    const found = runChecks(view, ctx);
    expect(found).toHaveLength(2);
    const { open } = applyDismissals(found, [
      { findingId: findingId('el-1', 'tap-target'), reason: 'fine', at: '2026-08-23T00:00:00.000Z' },
    ]);
    expect(open).toHaveLength(1);
    expect(open[0].check).toBe('off-canvas');
  });
});

describe('ordering', () => {
  it('puts must-fix above should-fix, so a long list still reads', () => {
    const view = viewWith([{ x: -20 }, { h: 20 }]);
    const found = runChecks(view, ctx);
    expect(found[0].severity).toBe('must');
    expect(found[found.length - 1].severity).toBe('should');
  });
});
