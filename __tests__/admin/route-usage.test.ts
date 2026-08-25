// __tests__/admin/route-usage.test.ts
//
// C0 of docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The emitter writes `props.route` and the report groups by it. Two ends, one rule — and the reason
// it is ONE rule, exported, rather than a regex at each end is that the design conformance check
// shipped with two and they disagreed: the page named an element by its BEM class and the design
// named it by whichever class came first, so 220 of 266 defaults were reported stale and the score
// was really measuring class-attribute order. The same shape here would be a report counting a
// route the emitter never wrote, and it would look exactly like a page nobody opens.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normaliseRoutePath, isCountableRoute } from '@/lib/admin/route-usage';

describe('normaliseRoutePath — one visit to one page, however the URL was spelled', () => {
  it('folds two different job ids into one route', () => {
    // Straight from `nav_events`: these are two real rows that must not be two rows in the report.
    expect(normaliseRoutePath('/admin/jobs/58a62727-ac8d-46ff-96c9-d6ec71732c6a')).toBe('/admin/jobs/[id]');
    expect(normaliseRoutePath('/admin/jobs/8d787d88-a483-454f-b275-59171b2a7fb9')).toBe('/admin/jobs/[id]');
  });

  it('folds an email segment, because /admin/team/[email] is one page', () => {
    expect(normaliseRoutePath('/admin/team/jacobmaddux@starr-surveying.com')).toBe('/admin/team/[id]');
    expect(normaliseRoutePath('/admin/payroll/michaelgibbs@starr-surveying.com')).toBe('/admin/payroll/[id]');
  });

  it('folds a URL-encoded email, which is how a browser actually sends one', () => {
    expect(normaliseRoutePath('/admin/team/jacob%40starr-surveying.com')).toBe('/admin/team/[id]');
  });

  it('folds numeric ids', () => {
    expect(normaliseRoutePath('/admin/learn/modules/42')).toBe('/admin/learn/modules/[id]');
  });

  it('leaves a static route completely alone', () => {
    for (const route of ['/admin/hours-approval', '/admin/me', '/admin/equipment/checked-out', '/admin/learn/exam-prep/sit/mock-exam']) {
      expect(normaliseRoutePath(route)).toBe(route);
    }
  });

  it('does not mistake a real path segment for an id', () => {
    // The negative case that matters most: over-folding would merge distinct pages into one row and
    // make a page look busier than it is, which is the direction that gets a page KEPT for no reason.
    expect(normaliseRoutePath('/admin/equipment/fleet-valuation')).toBe('/admin/equipment/fleet-valuation');
    expect(normaliseRoutePath('/admin/payouts/withdrawals')).toBe('/admin/payouts/withdrawals');
    expect(normaliseRoutePath('/admin/learn/knowledge-base')).toBe('/admin/learn/knowledge-base');
  });

  it('strips the query and the hash — a tab is not a different page for counting', () => {
    // Note this is a deliberate loss. `?tab=` is how the consolidation plan makes tabs linkable, and
    // once portals exist the question "which TAB gets used" will need its own answer. Counting them
    // as one page is right for the question C0 asks: is this ROUTE worth keeping.
    expect(normaliseRoutePath('/admin/marketing?tab=spend')).toBe('/admin/marketing');
    expect(normaliseRoutePath('/admin/me#today')).toBe('/admin/me');
  });

  it('treats a trailing slash as the same route', () => {
    expect(normaliseRoutePath('/admin/jobs/')).toBe('/admin/jobs');
    expect(normaliseRoutePath('/admin/jobs')).toBe('/admin/jobs');
  });

  it('survives the inputs that would throw', () => {
    expect(normaliseRoutePath('')).toBe('/');
    expect(normaliseRoutePath('/')).toBe('/');
    // A malformed escape makes decodeURIComponent throw; telemetry must never break navigation.
    expect(() => normaliseRoutePath('/admin/team/%E0%A4%A')).not.toThrow();
  });
});

describe('isCountableRoute', () => {
  it('counts the admin app', () => {
    expect(isCountableRoute('/admin/jobs')).toBe(true);
  });

  it('ignores the public site', () => {
    expect(isCountableRoute('/')).toBe(false);
    expect(isCountableRoute('/services')).toBe(false);
    expect(isCountableRoute('/dnd')).toBe(false);
  });

  it('ignores the auth routes', () => {
    // `/admin/login` is where you are when you are not yet anybody. Counting it would make it the
    // most-visited page in the product while saying nothing about which tools people use.
    expect(isCountableRoute('/admin/login')).toBe(false);
    expect(isCountableRoute('/admin/logout')).toBe(false);
  });
});

describe('the two ends agree', () => {
  const root = path.join(__dirname, '..', '..');

  it('the emitter sends the shared rule, not one of its own', () => {
    const src = fs.readFileSync(path.join(root, 'app', 'admin', 'components', 'RouteViewTelemetry.tsx'), 'utf8');
    expect(src).toMatch(/from '@\/lib\/admin\/route-usage'/);
    expect(src).toMatch(/normaliseRoutePath\(pathname\)/);
    // No second opinion about what an id looks like.
    expect(src).not.toMatch(/\[0-9a-f\]\{8\}/);
  });

  it('the report groups by what the emitter wrote', () => {
    const src = fs.readFileSync(path.join(root, 'scripts', 'nav-usage-report.mjs'), 'utf8');
    expect(src).toMatch(/props\.route/);
  });

  it('the event name is accepted by the route that stores it', () => {
    // The emitter can post whatever it likes; `KNOWN_EVENTS` decides what is written. A new event
    // name added at one end only is silently dropped with a 400 nobody reads.
    const api = fs.readFileSync(path.join(root, 'app', 'api', 'admin', 'nav-events', 'route.ts'), 'utf8');
    const types = fs.readFileSync(path.join(root, 'lib', 'admin', 'nav-telemetry.ts'), 'utf8');
    expect(api).toMatch(/'nav\.route\.view'/);
    expect(types).toMatch(/'nav\.route\.view'/);
  });

  it('is mounted, or it records nothing at all', () => {
    const layout = fs.readFileSync(path.join(root, 'app', 'admin', 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/import RouteViewTelemetry/);
    expect(layout).toMatch(/<RouteViewTelemetry \/>/);
  });

  it('does not fire the same route twice for one navigation', () => {
    // React runs an effect twice under Strict Mode, and any re-render would post again. Counting one
    // visit twice is worse than missing it: it looks like usage.
    const src = fs.readFileSync(path.join(root, 'app', 'admin', 'components', 'RouteViewTelemetry.tsx'), 'utf8');
    expect(src).toMatch(/lastSent/);
    expect(src).toMatch(/if \(lastSent\.current === route\) return;/);
  });
});
