// __tests__/admin/hub-tabs.test.ts
//
// Phase 2 slice 2a — locks the `?tab=…` parser so deep-links into a
// specific Hub tab always resolve to a known tab (or fall back to
// 'overview' safely). UI behavior tests will land alongside JSDOM
// setup in a later slice.
//
// Spec: docs/planning/completed/ADMIN_NAVIGATION_REDESIGN.md §5.1 + §8 Phase 2.

import { describe, expect, it } from 'vitest';

import { HUB_TABS, parseHubTab } from '@/app/admin/me/components/HubTabs';

describe('hub tabs — parseHubTab', () => {
  it('defaults to overview when no value is present', () => {
    expect(parseHubTab(null)).toBe('overview');
    expect(parseHubTab(undefined)).toBe('overview');
    expect(parseHubTab('')).toBe('overview');
  });

  it('accepts every known tab id', () => {
    for (const tab of HUB_TABS) {
      expect(parseHubTab(tab)).toBe(tab);
    }
  });

  it('falls back to overview on an unknown id', () => {
    expect(parseHubTab('unicorn')).toBe('overview');
    expect(parseHubTab('JOBS')).toBe('overview'); // case-sensitive on purpose
  });

  it('exposes the canonical tab list', () => {
    // Locks the order: surveyors deep-link via ?tab=hours and rely on
    // the tab strip ordering. Re-ordering the list is a deliberate
    // change worth a test-update.
    expect([...HUB_TABS]).toEqual([
      'overview',
      'schedule',
      'jobs',
      'hours',
      'pay',
      'notes',
      'files',
      'profile',
      'fieldbook',
    ]);
  });
});
