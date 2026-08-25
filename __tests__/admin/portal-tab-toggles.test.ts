// __tests__/admin/portal-tab-toggles.test.ts — T6: a switch per tab, not only per page.
//
// §11.3 parked tab-level toggles until the portals existed: *"Building it against 138 routes and
// then rebuilding it against 29 portals is the work done twice."* They exist now — seventeen
// portals, a hundred and ten tabs — so the premise expired and the item was built.
//
// ── WHAT WAS ACTUALLY MISSING, WHICH IS NOT WHAT THE DEFERRAL IMPLIED ───────────────────────────
//
// The READ half was already there and already tested: `canSeeTab` calls
// `isDestinationEnabled(toggles, spec.route, tab.id)` and `toggleKey` builds `route#tab`. What was
// missing is that **nothing ever produced such a key.** `/api/admin/feature-toggles` listed routes
// only, so the control could not be reached from anywhere, and the mechanism sat there answering a
// question nobody could put to it. That is this repository's most common defect — authored and not
// wired — sitting in its own settings page.
//
// ── WHY THE TAB LIST IS GENERATED ───────────────────────────────────────────────────────────────
//
// Portal specs live in `'use client'` pages. A Route Handler that imports one gets a
// client-reference proxy: the object is not there and nothing throws, which is how C9 lost an
// afternoon with 26,194 tests green. So the endpoint reads `tabs.generated.json`, and this file
// regenerates it and compares — a second copy of a list is what broke the API bundle mirror nine
// times in nine slices, and the only difference that has ever helped is a test that notices.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { derivePortalTabs, OUT } from '../../scripts/derive-portal-tabs.mjs';
import { toggleKey, parseToggleKey, isDestinationEnabled, withToggle } from '@/lib/admin/feature-toggles';

const repoRoot = path.join(__dirname, '..', '..');
const generated = JSON.parse(fs.readFileSync(path.join(repoRoot, OUT), 'utf8')) as {
  portals: { route: string; file: string; tabs: { id: string; label: string }[] }[];
};

describe('the generated tab list matches the portal pages', () => {
  it('is not behind the pages it was derived from', () => {
    const { portals, problems } = derivePortalTabs(repoRoot);
    expect(problems, 'the parser produced duplicate ids — the parser is wrong, not the pages').toEqual([]);
    expect(portals).toEqual(generated.portals);
  });

  it('found the portals this plan built, rather than quietly matching nothing', () => {
    // A parse that matched nothing would pass every assertion below it forever. Four separate bugs
    // in this plan had that shape, so the floor is asserted before anything is checked against it.
    expect(generated.portals.length).toBeGreaterThanOrEqual(15);
    const routes = generated.portals.map((p) => p.route);
    for (const r of ['/admin/jobs', '/admin/people', '/admin/learn', '/admin/research', '/admin/hours']) {
      expect(routes, `${r} should be a portal`).toContain(r);
    }
  });

  it('reads the tabs a comment mentions rather than the tabs a page declares — no', () => {
    // Both of these are real parser bugs from the afternoon this was written, kept as cases:
    //
    //   · `/admin/messages` came out with `contacts` TWICE, because a comment in that page discusses
    //     `id: 'contacts'` in prose. The parser was reading a sentence about the code as the code.
    //   · `/admin/marketing` lost `uploads`, because that entry carries a comment between its `id`
    //     and its `label` and the first attempt required them to be adjacent.
    const messages = generated.portals.find((p) => p.route === '/admin/messages');
    expect(messages, '/admin/messages is missing').toBeTruthy();
    const ids = messages!.tabs.map((t) => t.id);
    expect(new Set(ids).size, 'a portal cannot have two tabs with one id').toBe(ids.length);
    expect(ids).toContain('directory');
    expect(ids).toContain('contacts');

    const marketing = generated.portals.find((p) => p.route === '/admin/marketing');
    expect(marketing!.tabs.map((t) => t.id), 'the tab whose label is a comment away').toContain('uploads');
  });
});

describe('a tab can actually be switched off', () => {
  it('the endpoint offers a key per tab, built by toggleKey', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'app/api/admin/feature-toggles/route.ts'), 'utf8')
      .split('\r\n').join('\n')
      .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).toMatch(/key: toggleKey\(portal\.route, tab\.id\)/);
    expect(src).toMatch(/destinations: \[\.\.\.routeDestinations, \.\.\.tabDestinations\]/);
  });

  it('the key it offers round-trips to the route and tab it came from', () => {
    const key = toggleKey('/admin/jobs', 'weather');
    expect(key).toBe('/admin/jobs#weather');
    expect(parseToggleKey(key)).toEqual({ route: '/admin/jobs', stateKey: 'weather' });
  });

  it('switching one tab off leaves the portal and its other tabs alone', () => {
    const toggles = withToggle({}, toggleKey('/admin/jobs', 'weather'), false);
    expect(isDestinationEnabled(toggles, '/admin/jobs', 'weather')).toBe(false);
    expect(isDestinationEnabled(toggles, '/admin/jobs', 'compliance')).toBe(true);
    expect(isDestinationEnabled(toggles, '/admin/jobs')).toBe(true);
  });

  it('switching the PORTAL off takes its tabs with it', () => {
    // The case §11 called the one that matters: asking only about the tab's own key would report
    // every tab of a disabled portal as enabled — true in the stored data and useless as an answer,
    // because nobody can reach any of them.
    const toggles = withToggle({}, '/admin/jobs', false);
    expect(isDestinationEnabled(toggles, '/admin/jobs', 'weather')).toBe(false);
    expect(isDestinationEnabled(toggles, '/admin/jobs')).toBe(false);
  });
});
