// __tests__/saas/bundle-gate.test.ts
//
// Locks the bundle-resolution logic that the Phase D-5 middleware
// consults. Per CUSTOMER_PORTAL.md §3.6.

import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_DEFAULT_BUNDLE,
  bundleForRoute,
  canAccessRoute,
  upgradePromptUrl,
} from '@/lib/saas/bundle-gate';

describe('bundleForRoute — workspace defaults', () => {
  it('Hub routes return null (always available)', () => {
    expect(bundleForRoute('/admin/me')).toBeNull();
  });

  it('Work routes default to "office" bundle', () => {
    expect(bundleForRoute('/admin/jobs')).toBe('office');
    expect(bundleForRoute('/admin/leads')).toBe('office');
    expect(bundleForRoute('/admin/timeline')).toBe('office');
  });

  it('Equipment routes default to "office" bundle', () => {
    expect(bundleForRoute('/admin/equipment')).toBe('office');
    expect(bundleForRoute('/admin/equipment/maintenance')).toBe('office');
    expect(bundleForRoute('/admin/personnel/crew-calendar')).toBe('office');
  });

  it('Knowledge routes default to "academy" bundle', () => {
    expect(bundleForRoute('/admin/learn')).toBe('academy');
    expect(bundleForRoute('/admin/learn/modules')).toBe('academy');
    expect(bundleForRoute('/admin/learn/exam-prep')).toBe('academy');
  });

  it('Office workspace business routes default to "office" bundle', () => {
    expect(bundleForRoute('/admin/payroll')).toBe('office');
    expect(bundleForRoute('/admin/receipts')).toBe('office');
    expect(bundleForRoute('/admin/messages')).toBe('office');
    expect(bundleForRoute('/admin/discussions')).toBe('office');
    expect(bundleForRoute('/admin/notes')).toBe('office');
  });
});

describe('bundleForRoute — per-route overrides', () => {
  it('Research routes require "recon" bundle', () => {
    expect(bundleForRoute('/admin/research')).toBe('recon');
    expect(bundleForRoute('/admin/research/coverage')).toBe('recon');
    expect(bundleForRoute('/admin/research/library')).toBe('recon');
  });

  it('CAD route requires "draft" bundle', () => {
    expect(bundleForRoute('/admin/cad')).toBe('draft');
  });

  it('Operator-only research routes return null (gated by isOperator)', () => {
    expect(bundleForRoute('/admin/research/testing')).toBeNull();
    expect(bundleForRoute('/admin/research/pipeline')).toBeNull();
    expect(bundleForRoute('/admin/research/billing')).toBeNull();
  });

  it('Workspace landings are always available (so unentitled users can browse)', () => {
    expect(bundleForRoute('/admin/work')).toBeNull();
    expect(bundleForRoute('/admin/office')).toBeNull();
    expect(bundleForRoute('/admin/research-cad')).toBeNull();
  });

  it('Customer-portal management surfaces are always available', () => {
    expect(bundleForRoute('/admin/billing')).toBeNull();
    expect(bundleForRoute('/admin/support')).toBeNull();
    expect(bundleForRoute('/admin/users')).toBeNull();
    expect(bundleForRoute('/admin/settings')).toBeNull();
    expect(bundleForRoute('/admin/profile')).toBeNull();
  });
});

describe('bundleForRoute — unknown / nested paths', () => {
  it('returns null for non-admin paths', () => {
    expect(bundleForRoute('/marketing/about')).toBeNull();
    expect(bundleForRoute('/pricing')).toBeNull();
  });

  it('inherits workspace from deepest-prefix match for unknown nested routes', () => {
    // /admin/jobs/abc-123/edit isn't in the registry, but
    // /admin/jobs is — workspace lookup should resolve to 'work'
    // and the office bundle gate applies.
    expect(bundleForRoute('/admin/jobs/abc-123/edit')).toBe('office');
  });
});

describe('canAccessRoute', () => {
  it('grants access when the user has the required bundle', () => {
    expect(canAccessRoute({ pathname: '/admin/jobs', bundles: ['office'] })).toBe(true);
  });

  it('denies access when the user lacks the required bundle', () => {
    expect(canAccessRoute({ pathname: '/admin/jobs', bundles: ['recon'] })).toBe(false);
  });

  it('grants access via Firm Suite implication', () => {
    expect(canAccessRoute({ pathname: '/admin/jobs', bundles: ['firm_suite'] })).toBe(true);
    expect(canAccessRoute({ pathname: '/admin/cad', bundles: ['firm_suite'] })).toBe(true);
  });

  it('grants access to always-available routes regardless of bundles', () => {
    expect(canAccessRoute({ pathname: '/admin/me', bundles: [] })).toBe(true);
    expect(canAccessRoute({ pathname: '/admin/billing', bundles: [] })).toBe(true);
    expect(canAccessRoute({ pathname: '/admin/support', bundles: [] })).toBe(true);
  });
});

describe('upgradePromptUrl', () => {
  it('builds a query string with required bundle + return-to path', () => {
    const url = upgradePromptUrl('/admin/cad', 'draft');
    expect(url).toBe('/admin/billing/upgrade?requiredBundle=draft&returnTo=%2Fadmin%2Fcad');
  });

  it('handles nested paths', () => {
    const url = upgradePromptUrl('/admin/research/coverage', 'recon');
    expect(url).toContain('requiredBundle=recon');
    expect(url).toContain('returnTo=%2Fadmin%2Fresearch%2Fcoverage');
  });
});

describe('WORKSPACE_DEFAULT_BUNDLE — shape', () => {
  it('has an entry for every workspace', () => {
    expect(WORKSPACE_DEFAULT_BUNDLE.hub).toBe(null);
    expect(WORKSPACE_DEFAULT_BUNDLE.work).toBe('office');
    expect(WORKSPACE_DEFAULT_BUNDLE.equipment).toBe('office');
    expect(WORKSPACE_DEFAULT_BUNDLE['research-cad']).toBe(null);
    expect(WORKSPACE_DEFAULT_BUNDLE.knowledge).toBe('academy');
    expect(WORKSPACE_DEFAULT_BUNDLE.office).toBe('office');
  });
});
