// __tests__/voice/widgets.test.ts
//
// The widget layer is what makes every page Andrew's to edit. Two properties are worth locking:
// normalization must never throw on stored data (a bad block would take down the whole public page),
// and the mobile resolution must stay a three-layer merge rather than a replacement.

import { describe, expect, it } from 'vitest';

import {
  WIDGET_CATALOG,
  autoMobileStyle,
  clearMobileOverride,
  mobileOverrideKeys,
  normalizeWidgets,
  resolveMobileStyle,
  type Widget,
} from '@/lib/voice/widgets';

describe('normalizeWidgets', () => {
  it('returns an empty list for anything that is not an array', () => {
    // The public page renders whatever comes out of a JSONB column. If that column is null, or a
    // string, or an object from a half-finished migration, the portfolio still has to render.
    expect(normalizeWidgets(null)).toEqual([]);
    expect(normalizeWidgets(undefined)).toEqual([]);
    expect(normalizeWidgets('[]')).toEqual([]);
    expect(normalizeWidgets({ blocks: [] })).toEqual([]);
  });

  it('drops blocks whose type is not in the catalog instead of rendering nothing', () => {
    // One unknown block — from a downgrade, or a hand-edited row — must cost that block, not the page.
    const out = normalizeWidgets([
      { id: 'a', type: 'heading', text: 'Hello' },
      { id: 'b', type: 'a-type-that-never-existed' },
      { id: 'c', type: 'text', text: 'World' },
    ]);
    expect(out.map((w) => w.type)).toEqual(['heading', 'text']);
  });

  it('gives every block an id, because the editor keys and reorders by it', () => {
    const out = normalizeWidgets([{ type: 'heading', text: 'No id here' }]);
    expect(out[0].id).toBeTruthy();
  });

  it('survives null entries inside the array', () => {
    expect(() => normalizeWidgets([null, undefined, { id: 'x', type: 'text', text: 'ok' }])).not.toThrow();
    expect(normalizeWidgets([null, { id: 'x', type: 'text', text: 'ok' }])).toHaveLength(1);
  });
});

describe('WIDGET_CATALOG', () => {
  it('has no duplicate types — a duplicate would shadow a widget in the picker', () => {
    const types = WIDGET_CATALOG.map((w) => w.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('gives every entry a label, so nothing is unnamed in the add-block menu', () => {
    for (const entry of WIDGET_CATALOG) {
      expect(entry.label?.trim()).toBeTruthy();
    }
  });
});

describe('resolveMobileStyle — the three layers', () => {
  const base = { align: 'left', paddingY: 4, maxWidth: 900 } as const;
  const widget = (over: Partial<Widget> = {}): Widget =>
    ({ id: 'w1', type: 'heading', text: 'Press play.', style: { ...base }, ...over }) as unknown as Widget;

  it('lets Andrew\'s explicit mobile override beat both the automation and the desktop value', () => {
    // The user's requirement was "programmatic formatting that will try to automatically format them
    // nicely on mobile, but WE need it so that he can manually edit and save it how he likes it."
    // That sentence is this precedence order, and this is the test that keeps it.
    const resolved = resolveMobileStyle(widget({ mobileStyle: { align: 'center' } }));
    expect(resolved.align).toBe('center');
  });

  it('keeps desktop values the mobile patch does not mention', () => {
    // Sparse overrides: touch alignment and every other key keeps following desktop forever,
    // including later edits to it.
    const resolved = resolveMobileStyle(widget({ mobileStyle: { align: 'center' } }));
    expect(resolved.maxWidth).toBe(900);
  });

  it('turns the automation off entirely when autoMobile is false', () => {
    // Right-alignment is something the automation demonstrably rewrites (it reads as a bug in a
    // narrow column), so this comparison is real rather than vacuous.
    const styled = { align: 'right', width: 'narrow' } as const;
    const auto = resolveMobileStyle(widget({ style: { ...styled } }));
    const off = resolveMobileStyle(widget({ style: { ...styled }, autoMobile: false }));

    expect(auto.align).toBe('left');
    expect(off).toEqual(styled);
    expect(auto).not.toEqual(off);
  });

  it('does not mutate the widget or its desktop style', () => {
    // The automatic pass is a suggestion layer. If it wrote through to the stored style, previewing
    // a page on a phone would silently rewrite the desktop page.
    const w = widget({ mobileStyle: { align: 'center' } });
    const snapshot = JSON.stringify(w);
    resolveMobileStyle(w);
    expect(JSON.stringify(w)).toBe(snapshot);
  });
});

describe('autoMobileStyle', () => {
  it('proposes nothing for a style that already reads well on a phone', () => {
    // An empty patch is the right answer here. Emitting every key with its current value would make
    // "Andrew changed this on mobile" indistinguishable from "the automation touched it".
    expect(autoMobileStyle({ align: 'left' }, 'text')).toEqual({});
  });

  it('rewrites right-alignment, which reads as a bug in a narrow column', () => {
    expect(autoMobileStyle({ align: 'right' }, 'heading').align).toBe('left');
  });

  it('keeps a centred heading centred — that is a deliberate look on a phone too', () => {
    expect(autoMobileStyle({ align: 'center' }, 'heading').align).toBeUndefined();
  });

  it('preserves full-bleed width while collapsing every other measure', () => {
    // `full` also means "escape the page gutters" for an image, so it is not a width to normalise.
    expect(autoMobileStyle({ width: 'narrow' }, 'text').width).toBe('normal');
    expect(autoMobileStyle({ width: 'full' }, 'image').width).toBeUndefined();
  });

  it('grows undersized media to full width, because small media is unreadable on a phone', () => {
    expect(autoMobileStyle({ mediaScale: 60 }, 'image').mediaScale).toBe(100);
    expect(autoMobileStyle({ mediaScale: 100 }, 'image').mediaScale).toBeUndefined();
  });

  it('gives compressed uppercase display type its air back', () => {
    expect(autoMobileStyle({ uppercase: true, tracking: 14 }, 'heading').tracking).toBe(6);
    expect(autoMobileStyle({ uppercase: false, tracking: 14 }, 'heading').tracking).toBeUndefined();
  });

  it('does not mutate the style it is given', () => {
    const style = { align: 'right', width: 'narrow', mediaScale: 50 } as const;
    const snapshot = JSON.stringify(style);
    autoMobileStyle({ ...style }, 'heading');
    expect(JSON.stringify(style)).toBe(snapshot);
  });
});

describe('mobile overrides in the inspector', () => {
  it('reports exactly the keys Andrew has diverged, for the "modified" dots', () => {
    const w = { id: 'w', type: 'heading', style: {}, mobileStyle: { align: 'center', paddingY: 2 } } as unknown as Widget;
    expect(mobileOverrideKeys(w).sort()).toEqual(['align', 'paddingY']);
  });

  it('collapses an emptied patch to undefined so a reset widget shows no mobile badge', () => {
    // "Never touched" and "touched then reset" must be the same state.
    let w = { id: 'w', type: 'heading', style: {}, mobileStyle: { align: 'center' } } as unknown as Widget;
    w = clearMobileOverride(w, 'align');
    expect(w.mobileStyle).toBeUndefined();
    expect(mobileOverrideKeys(w)).toEqual([]);
  });

  it('leaves the other overrides alone when clearing one', () => {
    const w = {
      id: 'w',
      type: 'heading',
      style: {},
      mobileStyle: { align: 'center', paddingY: 2 },
    } as unknown as Widget;
    expect(mobileOverrideKeys(clearMobileOverride(w, 'align'))).toEqual(['paddingY']);
  });
});
