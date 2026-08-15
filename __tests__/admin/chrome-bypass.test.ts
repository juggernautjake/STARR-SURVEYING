// __tests__/admin/chrome-bypass.test.ts
//
// Slice 190 — chrome-bypass predicate used by AdminLayoutClient to
// short-circuit its sidebar/topbar/IconRail/FAB on routes that own
// their own full-bleed chrome.

import { describe, it, expect } from 'vitest';
import { CHROME_BYPASS_PREFIXES, shouldBypassAdminChrome } from '@/lib/admin/chrome-bypass';

describe('shouldBypassAdminChrome', () => {
  it('CAD editor exact match', () => {
    expect(shouldBypassAdminChrome('/admin/cad')).toBe(true);
  });

  it('CAD editor subpath', () => {
    expect(shouldBypassAdminChrome('/admin/cad/job-123/drawing-1')).toBe(true);
  });

  // C0g (2026-08-15) — the three Work Mode bypass cases went with the shell. `/admin/cad` is now
  // the only surface that renders its own chrome, which is why the catalog assertion below is a
  // one-element array rather than two.

  it('regular admin pages do NOT bypass', () => {
    expect(shouldBypassAdminChrome('/admin/me')).toBe(false);
    expect(shouldBypassAdminChrome('/admin/jobs')).toBe(false);
    expect(shouldBypassAdminChrome('/admin/equipment/maintenance')).toBe(false);
    expect(shouldBypassAdminChrome('/admin')).toBe(false);
  });

  it('paths that merely contain the bypass string but are not prefixed do NOT bypass', () => {
    expect(shouldBypassAdminChrome('/admin/some-cad-helper')).toBe(false);
    expect(shouldBypassAdminChrome('/admin/cadence')).toBe(false);
  });

  it('null/empty pathname is safe', () => {
    expect(shouldBypassAdminChrome(null)).toBe(false);
    expect(shouldBypassAdminChrome(undefined)).toBe(false);
    expect(shouldBypassAdminChrome('')).toBe(false);
  });

  it('CHROME_BYPASS_PREFIXES exposes the catalog', () => {
    expect(CHROME_BYPASS_PREFIXES).toEqual(['/admin/cad']);
  });
});
