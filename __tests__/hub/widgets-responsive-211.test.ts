// __tests__/hub/widgets-responsive-211.test.ts
//
// Slice 211 of hub-grid-8x8-square-cells-2026-05-29.md. Locks the
// bucket-aware stat helpers + the 3 widgets (hours-this-week,
// pto-balance, today-schedule) that got tiny-bucket modes via the
// new shared stat-bucket helpers.

import { describe, it, expect } from 'vitest';
import {
  statNumberStyle,
  tinyStatWrapStyle,
  tinyStatLabelStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';
import { getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/register-all';

describe('statNumberStyle — bucket-scaled font', () => {
  it('returns distinct font sizes per bucket', () => {
    const fonts = (['tiny', 'small', 'medium', 'large', 'xlarge'] as const)
      .map((b) => statNumberStyle(b).fontSize);
    expect(new Set(fonts).size).toBe(5);
  });

  it('always returns a weight of 700 + a numeric line-height', () => {
    for (const b of ['tiny', 'small', 'medium', 'large', 'xlarge'] as const) {
      const s = statNumberStyle(b);
      expect(s.fontWeight).toBe(700);
      expect(s.lineHeight).toBe(1.1);
    }
  });

  it('applies single-line truncation so a long number cannot wrap', () => {
    const s = statNumberStyle('medium');
    expect(s.overflow).toBe('hidden');
    expect(s.whiteSpace).toBe('nowrap');
    expect(s.textOverflow).toBe('ellipsis');
  });

  it('defaults the color to --theme-fg-primary; honors overrides', () => {
    expect(statNumberStyle('medium').color).toBe('var(--theme-fg-primary)');
    expect(statNumberStyle('medium', 'var(--theme-success)').color).toBe('var(--theme-success)');
  });
});

describe('tinyStatWrapStyle + tinyStatLabelStyle', () => {
  it('wraps the tiny stat in a centered flex column at full cell height', () => {
    const s = tinyStatWrapStyle();
    expect(s.display).toBe('flex');
    expect(s.flexDirection).toBe('column');
    expect(s.alignItems).toBe('center');
    expect(s.justifyContent).toBe('center');
    expect(s.height).toBe('100%');
  });

  it('label is small + muted + uppercase for badge feel', () => {
    const s = tinyStatLabelStyle();
    expect(s.textTransform).toBe('uppercase');
    expect(s.letterSpacing).toBe(0.5);
    expect(s.color).toBe('var(--theme-fg-secondary)');
  });

  it('returns a fresh object each call so callers can spread', () => {
    expect(tinyStatWrapStyle()).not.toBe(tinyStatWrapStyle());
    expect(tinyStatLabelStyle()).not.toBe(tinyStatLabelStyle());
  });
});

describe('Slice 211 widgets reach the tiny bucket', () => {
  it('hours-this-week minSize lowered to 1×1', () => {
    expect(getWidget('hours-this-week')?.minSize).toEqual({ w: 1, h: 1 });
  });
  it('pto-balance minSize lowered to 1×1', () => {
    expect(getWidget('pto-balance')?.minSize).toEqual({ w: 1, h: 1 });
  });
  it('today-schedule minSize lowered to 1×1', () => {
    expect(getWidget('today-schedule')?.minSize).toEqual({ w: 1, h: 1 });
  });
});
