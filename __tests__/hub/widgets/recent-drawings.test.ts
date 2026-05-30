// __tests__/hub/widgets/recent-drawings.test.ts
//
// hub-widget-excellence-12 — recent-drawings R1/Build-Wire: the headline
// ask is that each drawing opens in the CAD editor with its job loaded.
// Locks the CAD-open href + the relative-age helper.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { cadOpenHref, formatAge } from '@/lib/hub/widgets/recent-drawings';

describe('recent-drawings — registry', () => {
  it('registers in the cad category', () => {
    expect(getWidget('recent-drawings')?.category).toBe('cad');
  });
});

describe('cadOpenHref (open in CAD with the job loaded)', () => {
  it('opens the drawing\'s job in CAD when job_id is present', () => {
    expect(cadOpenHref({ id: 'd1', job_id: 'J-42' })).toBe('/admin/cad?job=J-42');
  });

  it('falls back to opening the drawing directly when there is no job', () => {
    expect(cadOpenHref({ id: 'd1', job_id: null })).toBe('/admin/cad?drawing=d1');
  });

  it('url-encodes the ids', () => {
    expect(cadOpenHref({ id: 'a b', job_id: null })).toBe('/admin/cad?drawing=a%20b');
    expect(cadOpenHref({ id: 'd', job_id: 'a/b' })).toBe('/admin/cad?job=a%2Fb');
  });
});

describe('recent-drawings — formatAge', () => {
  const NOW = Date.parse('2026-05-30T12:00:00Z');
  it('renders a short relative age', () => {
    expect(formatAge('2026-05-30T11:30:00Z', NOW)).toBe('30m ago');
    expect(formatAge('2026-05-30T09:00:00Z', NOW)).toBe('3h ago');
    expect(formatAge('2026-05-28T12:00:00Z', NOW)).toBe('2d ago');
  });
});
