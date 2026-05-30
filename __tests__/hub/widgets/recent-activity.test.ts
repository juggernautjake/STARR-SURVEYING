// __tests__/hub/widgets/recent-activity.test.ts
//
// Slice 114 — Recent Activity widget helpers + registry round-trip.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, iconForRoute, trimHref } from '@/lib/hub/widgets/recent-activity';

describe('recent-activity widget — registry', () => {
  it('registers in personal category as a universal widget', () => {
    const def = getWidget('recent-activity');
    expect(def).toBeDefined();
    expect(def?.category).toBe('personal');
    expect(def?.allowedRoles).toEqual([]);
    expect(def?.iconName).toBe('History');
  });

  it('default size 3×3, min 1×1, max 6×6', () => {
    const def = getWidget('recent-activity');
    expect(def?.defaultSize).toEqual({ w: 3, h: 3 });
    // Slice 213 — minSize lowered to 1×1 with the tiny counter mode.
    expect(def?.minSize).toEqual({ w: 1, h: 1 });
    expect(def?.maxSize).toEqual({ w: 6, h: 6 });
  });
});

describe('recent-activity — capForBucket', () => {
  it('tiny → 2', () => { expect(capForBucket('tiny')).toBe(2); });
  it('small → 4', () => { expect(capForBucket('small')).toBe(4); });
  it('medium → 6', () => { expect(capForBucket('medium')).toBe(6); });
  it('large → 12', () => { expect(capForBucket('large')).toBe(12); });
  it('xlarge → 20', () => { expect(capForBucket('xlarge')).toBe(20); });
});

describe('recent-activity — trimHref', () => {
  it('strips the /admin/ prefix', () => {
    expect(trimHref('/admin/contacts')).toBe('contacts');
    expect(trimHref('/admin/dashboard')).toBe('dashboard');
  });
  it('passes through non-admin hrefs unchanged', () => {
    expect(trimHref('/help')).toBe('/help');
  });
});

describe('recent-activity — iconForRoute', () => {
  it('maps known lucide names to emoji', () => {
    expect(iconForRoute('Home')).toBe('🏠');
    expect(iconForRoute('Wallet')).toBe('💰');
    expect(iconForRoute('FolderOpen')).toBe('📁');
  });
  it('falls back to a link glyph for unknown names', () => {
    expect(iconForRoute('SomethingNew')).toBe('🔗');
    expect(iconForRoute(undefined)).toBe('🔗');
  });
});
