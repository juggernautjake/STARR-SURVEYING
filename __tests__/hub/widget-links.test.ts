// __tests__/hub/widget-links.test.ts
//
// Slice 2 of hub-widget-excellence-02-shared-infra. Locks the widget→
// route link registry: every mapped href is a real-looking absolute
// admin route, the link/no-link sets PARTITION the full 41-widget
// catalog (no widget is forgotten), and the row-level deep-link
// builders produce the right shapes (incl. URL-encoding).

import { describe, it, expect } from 'vitest';
import {
  WIDGET_LINKS,
  WIDGETS_WITHOUT_LINK,
  widgetGoToTarget,
  jobHref,
  cadJobHref,
  conversationHref,
  lessonHref,
  equipmentHref,
  teamMemberHref,
  researchProjectHref,
} from '@/lib/hub/widgets/_shared/widget-links';

// The full catalog of 45 widget ids (41 from the master doc + three
// cluster widgets shipped in consolidation Slices 3-5: `approvals`,
// `drawings`, `activity` + the Contacts widget shipped in the
// contacts plan Slice 5). Declared
// locally so a drift surfaces here as a coverage failure rather than by
// importing the heavy widget registry.
const ALL_WIDGET_IDS = [
  // work
  // consolidation Slice 5 (2026-05-30) — `activity` is the unified
  // job-events + recent-pages widget. Two legacy ids stay until
  // saved layouts are migrated.
  'activity',
  'my-jobs', 'assignments-due', 'field-data-pending', 'job-activity-feed',
  // time-pay
  'my-pay', 'hours-this-week', 'pto-balance',
  // financial
  'monthly-revenue', 'outstanding-invoices',
  // office
  // contacts plan Slice 5 (2026-05-30) — Contacts hub widget.
  'contacts',
  // consolidation Slice 3 (2026-05-30) — `approvals` is the unified
  // hours/receipts/time-off tile. The three legacy widgets stay
  // catalogued until a follow-up migrates saved layouts.
  'approvals',
  'pending-hours', 'pending-receipts', 'pending-time-off',
  // equipment
  'equipment-out-today', 'low-consumables', 'maintenance-due', 'vehicles-status',
  // cad
  // consolidation Slice 4 (2026-05-30) — `drawings` is the unified
  // mine/all widget. Two legacy ids stay until layouts are migrated.
  'drawings',
  'recent-drawings', 'drawings-in-progress', 'crew-calendar',
  // research
  'active-research-projects', 'pipeline-status',
  // learning
  'class-assignments', 'recommended-lessons', 'roadmap-progress',
  'flashcards-due', 'quiz-history', 'streak-counter',
  // communication
  'messages', 'open-discussions', 'mentions-inbox', 'recent-announcements',
  // operational
  'mileage-tracker', 'team-status',
  // personal
  'today-schedule', 'quick-actions', 'pinned-pages', 'bookmarks',
  'recent-activity', 'weather', 'sun-calculator', 'daily-briefing',
];

describe('widget-links — catalog coverage', () => {
  it('catalog has all 45 widgets', () => {
    expect(ALL_WIDGET_IDS.length).toBe(45);
    expect(new Set(ALL_WIDGET_IDS).size).toBe(45);
  });

  it('every widget is either linked or explicitly link-less (partition)', () => {
    for (const id of ALL_WIDGET_IDS) {
      const linked = id in WIDGET_LINKS;
      const linkless = WIDGETS_WITHOUT_LINK.has(id);
      // Exactly one of the two must be true.
      expect(linked !== linkless).toBe(true);
    }
  });

  it('no link/no-link entry references an unknown widget id', () => {
    const known = new Set(ALL_WIDGET_IDS);
    for (const id of Object.keys(WIDGET_LINKS)) expect(known.has(id)).toBe(true);
    for (const id of WIDGETS_WITHOUT_LINK) expect(known.has(id)).toBe(true);
  });
});

describe('widget-links — every mapped target is a real-looking route', () => {
  it('href is an absolute /admin route and label is non-empty', () => {
    for (const [, target] of Object.entries(WIDGET_LINKS)) {
      // consolidation Slice 2 (2026-05-30) — widget footers can now
      // route into the hub via a `?tab=…` query string after the
      // legacy `/admin/my-*` pages were collapsed into `/admin/me`.
      expect(target.href).toMatch(/^\/admin\/[a-z0-9/-]+(\?tab=[a-z]+)?$/);
      expect(target.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('widgetGoToTarget returns the mapped target, or null when link-less', () => {
    // hub-widget-routing 2026-05-30 — `my-jobs` footer now points at
    // the org-wide /admin/jobs page (per user feedback), not the
    // personal `/admin/my-jobs` filter.
    expect(widgetGoToTarget('my-jobs')).toEqual({ href: '/admin/jobs', label: 'jobs' });
    expect(widgetGoToTarget('quick-actions')).toBeNull();
    expect(widgetGoToTarget('not-a-widget')).toBeNull();
  });
});

describe('widget-links — row-level deep-link builders', () => {
  it('jobHref / cadJobHref', () => {
    expect(jobHref('J-1042')).toBe('/admin/jobs/J-1042');
    expect(cadJobHref('J-1042')).toBe('/admin/cad?job=J-1042');
  });

  it('encodes ids/emails that need it', () => {
    expect(cadJobHref('a b/c')).toBe('/admin/cad?job=a%20b%2Fc');
    expect(teamMemberHref('jane@x.com')).toBe('/admin/team/jane%40x.com');
  });

  it('conversationHref / lessonHref / equipmentHref / researchProjectHref', () => {
    expect(conversationHref('c1')).toBe('/admin/messages/c1');
    expect(lessonHref('m1', 'l9')).toBe('/admin/learn/modules/m1/l9');
    expect(equipmentHref('eq-7')).toBe('/admin/equipment/eq-7');
    expect(researchProjectHref('p3')).toBe('/admin/research/p3');
  });
});
