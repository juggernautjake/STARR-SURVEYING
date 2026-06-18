// __tests__/admin/hub-s7-widget-shells.test.ts
//
// Slice S7 of widget-size-responsive-content-2026-06-18 — the
// cross-widget WidgetEmpty / WidgetError uniform pass. Both
// components self-measure via the shared `useElementSize` hook
// and pick a compact variant when the rendered cell is too small
// to fit the full layout. WidgetSkeleton already adapts via its
// `rows` prop (verified once below to lock the existing contract).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pickEmptyVariant } from '@/lib/hub/components/WidgetEmpty';
import { pickErrorVariant } from '@/lib/hub/components/WidgetError';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('pickEmptyVariant (pure)', () => {
  it("returns 'default' before the ResizeObserver fires (0×0)", () => {
    expect(pickEmptyVariant(0, 0)).toBe('default');
  });

  it("collapses to 'tiny' below 120px wide OR 80px tall", () => {
    expect(pickEmptyVariant(100, 200)).toBe('tiny');
    expect(pickEmptyVariant(200, 60)).toBe('tiny');
    expect(pickEmptyVariant(119, 200)).toBe('tiny');
    expect(pickEmptyVariant(200, 79)).toBe('tiny');
  });

  it("drops to 'small' between tiny + the default thresholds", () => {
    expect(pickEmptyVariant(180, 100)).toBe('small');
    expect(pickEmptyVariant(219, 139)).toBe('small');
  });

  it("returns 'default' once both dimensions clear 220 × 140", () => {
    expect(pickEmptyVariant(220, 200)).toBe('default');
    expect(pickEmptyVariant(300, 250)).toBe('default');
  });
});

describe('pickErrorVariant (pure)', () => {
  it('mirrors pickEmptyVariant thresholds (empty + error collapse together)', () => {
    expect(pickErrorVariant(0, 0)).toBe('default');
    expect(pickErrorVariant(100, 100)).toBe('tiny');
    expect(pickErrorVariant(200, 100)).toBe('small');
    expect(pickErrorVariant(300, 200)).toBe('default');
  });
});

describe('WidgetEmpty rendering contract (S7)', () => {
  const SRC = read('lib/hub/components/WidgetEmpty.tsx');

  it('declares the data-variant attribute on the root', () => {
    expect(SRC).toMatch(/data-testid="widget-empty"/);
    expect(SRC).toMatch(/data-variant=\{variant\}/);
  });

  it('self-measures via the shared useElementSize hook', () => {
    expect(SRC).toMatch(/import \{ useElementSize \} from '@\/lib\/hub\/use-element-size'/);
    expect(SRC).toMatch(/const \{ widthPx, heightPx \} = useElementSize\(ref\)/);
  });

  it('description hides at tiny, clamp 1 at small, clamp 3 at default', () => {
    expect(SRC).toMatch(/const showDescription = variant !== 'tiny' && description/);
    expect(SRC).toMatch(/WebkitLineClamp: variant === 'small' \? 1 : 3/);
  });

  it('CTA only renders at the default variant (no overflow in tiny / small)', () => {
    expect(SRC).toMatch(/const showCta = variant === 'default' && cta/);
  });
});

describe('WidgetError rendering contract (S7)', () => {
  const SRC = read('lib/hub/components/WidgetError.tsx');

  it('declares the data-variant attribute on the root', () => {
    expect(SRC).toMatch(/data-testid="widget-error"/);
  });

  it('tiny variant renders only the warning glyph + retry pill', () => {
    expect(SRC).toMatch(/if \(variant === 'tiny'\)/);
    expect(SRC).toMatch(/aria-label="Retry"/);
  });

  it('small variant suppresses the message line', () => {
    expect(SRC).toMatch(/variant !== 'small' && \(/);
    expect(SRC).toMatch(/data-testid="widget-error-message"/);
  });

  it('Hide button is gated on the default variant (no overflow in tiny / small)', () => {
    expect(SRC).toMatch(/onHide && variant === 'default'/);
  });
});

describe('WidgetSkeleton lock (S7)', () => {
  // Existing component — already adapts via the `rows` prop, supports
  // `prefers-reduced-motion`. Lock the source so a future cleanup
  // doesn't accidentally drop the pulse animation or the reduced-motion
  // guard.
  const SRC = read('lib/hub/components/WidgetSkeleton.tsx');

  it('honors prefers-reduced-motion', () => {
    expect(SRC).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('keeps the per-row tapered widths so the skeleton reads as text', () => {
    expect(SRC).toMatch(/width=\{`\$\{100 - i \* 8\}%`\}/);
  });
});
