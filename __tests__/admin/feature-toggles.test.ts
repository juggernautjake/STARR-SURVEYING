// __tests__/admin/feature-toggles.test.ts
//
// T1 of §11 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Owner: *"Maybe we don't want to use a page or feature right now, so we would toggle it off so that
// navigating the webpage is easier, but if we decide to use that page/feature in the future, then we
// can turn it back on and make sure it is hooked up correctly."*
//
// ── THE TWO WAYS THIS GOES WRONG ────────────────────────────────────────────────────────────────
//
// 1. **It switches something off nobody asked it to.** A default of "off", a failed read that
//    returns everything disabled, a `"false"` string read as truthy — any of these takes a working
//    page away from somebody, and the person who finds out is a user, not a developer.
//
// 2. **Somebody starts believing it is a permission.** *"We turned payroll off, so the crew cannot
//    see wages"* is false the second anyone types the URL. §11.5 names this as the thing this must
//    never become, and the assertions at the bottom are what keep the belief from forming.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  isEnabled, isDestinationEnabled, togglesFrom, toggleKey, parseToggleKey,
  disabledKeys, withToggle, TOGGLES_KEY,
  type FeatureToggles,
} from '@/lib/admin/feature-toggles';

describe('absent means ON', () => {
  it('a product with no settings at all is fully working', () => {
    // The load-bearing decision. A toggle system that ships with anything off is one that broke
    // something on day one.
    expect(isEnabled(null, '/admin/jobs')).toBe(true);
    expect(isEnabled({}, '/admin/jobs')).toBe(true);
    expect(isEnabled(undefined, '/admin/jobs')).toBe(true);
  });

  it('and a page added next year appears without anybody enabling it', () => {
    // The stored map is a list of EXCEPTIONS, not an inventory. An exhaustive list would be a second
    // copy of the product's structure, and the second copy is always the stale one.
    const toggles: FeatureToggles = { '/admin/vehicles': false };
    expect(isEnabled(toggles, '/admin/something-new-in-2027')).toBe(true);
  });

  it('only an explicit false turns anything off', () => {
    expect(isEnabled({ '/admin/vehicles': false }, '/admin/vehicles')).toBe(false);
    expect(isEnabled({ '/admin/vehicles': true }, '/admin/vehicles')).toBe(true);
  });
});

describe('a broken row is the harmless state, not the destructive one', () => {
  it('nothing, a string, an array and a number all read as "everything on"', () => {
    // A parse that threw here would take out the sidebar of every page that reads it. The whole
    // point of "absent means on" is that the broken state does no damage.
    for (const bad of [null, undefined, 'nope', 42, [], [1, 2]]) {
      expect(togglesFrom({ [TOGGLES_KEY]: bad })).toEqual({});
    }
    expect(togglesFrom(null)).toEqual({});
    expect(togglesFrom({})).toEqual({});
  });

  it('a non-boolean value is dropped, never coerced', () => {
    // `"false"` the string is TRUTHY in JavaScript and would silently mean ON — the reverse of what
    // whoever wrote it intended. A toggle doing the opposite of the stored data is worse than one
    // ignoring it.
    const got = togglesFrom({ [TOGGLES_KEY]: { '/admin/a': 'false', '/admin/b': 0, '/admin/c': false } });
    expect(got).toEqual({ '/admin/c': false });
  });

  it('and a key that is not a route is dropped', () => {
    // Keys are destinations and destinations start with `/`. Anything else got in by hand or by a
    // bug, and storing it would make the settings screen list a page nobody can find.
    const got = togglesFrom({ [TOGGLES_KEY]: { 'admin/a': false, '/admin/b': false } });
    expect(got).toEqual({ '/admin/b': false });
  });

  it('reads the one key it owns and ignores the rest of the settings', () => {
    const got = togglesFrom({ general: { x: 1 }, company: { y: 2 }, [TOGGLES_KEY]: { '/admin/a': false } });
    expect(got).toEqual({ '/admin/a': false });
  });
});

describe('a destination is a route, or a route and a tab', () => {
  it('round-trips', () => {
    expect(toggleKey('/admin/pay')).toBe('/admin/pay');
    expect(toggleKey('/admin/pay', 'rewards')).toBe('/admin/pay#rewards');
    expect(parseToggleKey('/admin/pay#rewards')).toEqual({ route: '/admin/pay', stateKey: 'rewards' });
    expect(parseToggleKey('/admin/pay')).toEqual({ route: '/admin/pay', stateKey: '' });
  });

  it('a tab of a switched-off portal is switched off', () => {
    // Asking only about the tab's own key would leave every tab of a disabled portal reading as
    // enabled — true in the stored data and useless as an answer, because nobody can reach any of
    // them.
    const toggles: FeatureToggles = { '/admin/pay': false };
    expect(isDestinationEnabled(toggles, '/admin/pay', 'rewards')).toBe(false);
    expect(isDestinationEnabled(toggles, '/admin/pay')).toBe(false);
  });

  it('and one tab can be off while its portal is on', () => {
    // The case §11.3 is about: "we do not do pass-through billing" turns off ONE tab of the receipts
    // portal, not a URL that has stopped existing.
    const toggles: FeatureToggles = { '/admin/receipts#rebilled': false };
    expect(isDestinationEnabled(toggles, '/admin/receipts')).toBe(true);
    expect(isDestinationEnabled(toggles, '/admin/receipts', 'rebilled')).toBe(false);
    expect(isDestinationEnabled(toggles, '/admin/receipts', 'queue')).toBe(true);
  });
});

describe('flipping a switch', () => {
  it('turning something OFF records the exception', () => {
    expect(withToggle({}, '/admin/vehicles', false)).toEqual({ '/admin/vehicles': false });
  });

  it('turning it back ON deletes the key rather than storing true', () => {
    // A map accumulating `true` for everything ever toggled would slowly become the exhaustive
    // inventory this design exists to avoid — including entries for routes that no longer exist,
    // which nothing would ever clean up.
    const off = withToggle({}, '/admin/vehicles', false);
    expect(withToggle(off, '/admin/vehicles', true)).toEqual({});
  });

  it('does not mutate what it was given', () => {
    // The map comes from a React state or a fetch cache in every real caller. Mutating it would
    // change a page's toggles without a re-render, and the switch would appear not to work.
    const before: FeatureToggles = { '/admin/a': false };
    withToggle(before, '/admin/b', false);
    expect(before).toEqual({ '/admin/a': false });
  });

  it('and what is off is derived, not counted separately', () => {
    const toggles: FeatureToggles = { '/admin/z': false, '/admin/a': false, '/admin/m': true };
    expect(disabledKeys(toggles)).toEqual(['/admin/a', '/admin/z']);
    expect(disabledKeys({})).toEqual([]);
    expect(disabledKeys(null)).toEqual([]);
  });
});

// ── §11.5: A TOGGLE IS NOT A PERMISSION ─────────────────────────────────────────────────────────
//
// *"We turned payroll off, so the crew cannot see wages"* is false the second somebody types the
// URL. The plan names this as the thing this must never become, and asks for a test by name.
//
// The real assertion — that turning a page off changes no API's answer — belongs to T5, once
// something consumes this. What can be pinned NOW is the shape that would make that impossible to
// get wrong: this module answers one question, imports nothing, and is not reachable from any
// authorisation decision.
describe('this is a visibility control and nothing else', () => {
  const ROOT = path.join(__dirname, '..', '..');
  const SRC = fs.readFileSync(path.join(ROOT, 'lib/admin/feature-toggles.ts'), 'utf8');

  it('says so in the file, where the next person will read it', () => {
    expect(SRC).toMatch(/A toggle is not a permission/);
  });

  it('imports nothing, so it cannot become part of an auth decision by accident', () => {
    // Also why it is safe in a client bundle: it is read by the sidebar, the rail, the palette and
    // the search, all client components. Anything server-only in here would drag `node:async_hooks`
    // into the browser through thirty components — the exact failure `lib/auth-roles.ts` was split
    // out to prevent, which broke the production build for two commits.
    expect(SRC).not.toMatch(/^import /m);
  });

  it('and knows nothing about roles, sessions or bundles', () => {
    // Three gates already answer "may you", "did the firm pay" and "is this for staff". If any of
    // those words appeared in the logic here, this would be a fourth spelling of one of them rather
    // than the fourth question it is meant to be.
    const body = SRC.split('export const TOGGLES_KEY')[1];
    for (const word of ['session', 'roles', 'isAdmin', 'requiredBundle', 'auth']) {
      expect(body.toLowerCase()).not.toContain(`${word.toLowerCase()}(`);
    }
  });
});

// ── AND THE STORE WILL ACTUALLY TAKE IT ─────────────────────────────────────────────────────────
//
// `/api/admin/settings` writes through a WHITELIST, and its own header says why that matters:
//
//     "a new section that is written to the table by a seed but not named here reads back fine and
//      silently 400s on save. That is the 'authored but not wired' failure this codebase hits most
//      often."
//
// A reader with no writer is precisely that failure, and this list is where it would have happened
// for the second time.
describe('the settings endpoint accepts the key this module owns', () => {
  const ROUTE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app/api/admin/settings/route.ts'), 'utf8',
  );

  it('is on the whitelist', () => {
    expect(ROUTE).toMatch(/ALLOWED_KEYS = new Set\(\['general', 'company', 'mileage', TOGGLES_KEY\]\)/);
  });

  it('by importing the constant rather than retyping the string', () => {
    // Two spellings of one key is how the writer and the reader end up pointed at different rows —
    // and the symptom would be a switch that saves successfully and changes nothing.
    expect(ROUTE).toMatch(/import \{ TOGGLES_KEY \} from '@\/lib\/admin\/feature-toggles';/);
    // Scoped to the Set literal, not the whole file. The comment above that line NAMES the key —
    // as it should, it is explaining what was added — so a bare /'feature_toggles'/ matches the
    // prose and fails a file that is correct. Second time in one session an assertion caught my own
    // comment instead of the code; the fix both times was to assert on the statement, not the text.
    const allowed = ROUTE.slice(ROUTE.indexOf('const ALLOWED_KEYS'), ROUTE.indexOf('export const GET'));
    expect(allowed).not.toMatch(/'feature_toggles'/);
  });
});

// ── T2: THE NAV RESPECTS IT, IN ONE PLACE ───────────────────────────────────────────────────────
//
// `AdminSidebar`'s own header states the rule this system runs on: *"gating happens once, in
// `accessibleRoutes`, off the registry"*. Four surfaces read that function — the sidebar (which is
// also the mobile drawer), the icon rail, the command palette and the workspace flyout — and
// filtering in each of them separately is four places for a switched-off page to stay visible in
// one of them.
describe('a switched-off page leaves the navigation', () => {
  const ROOT2 = path.join(__dirname, '..', '..');
  const REGISTRY = fs.readFileSync(path.join(ROOT2, 'lib/admin/route-registry.ts'), 'utf8');

  it('accessibleRoutes takes the toggles and drops what is off', () => {
    expect(REGISTRY).toMatch(/toggles\?: FeatureToggles \| null;/);
    expect(REGISTRY).toMatch(/if \(!isEnabled\(toggles, r\.href\)\) return false;/);
  });

  it('from ADMINS too, because an easier sidebar is the entire request', () => {
    // The check sits above the role logic, beside `parked`, so `isAdmin` cannot short-circuit past
    // it. An admin reaches a disabled page by URL (§11.4) and gets the working page behind a
    // banner — the nav does not keep offering it to them.
    const fn = REGISTRY.slice(REGISTRY.indexOf('export function accessibleRoutes'));
    const gate = fn.indexOf('isEnabled(toggles, r.href)');
    const admin = fn.indexOf('if (isAdmin) return true;');
    expect(gate).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(admin);
  });

  it('and it is optional, so a failed read cannot empty a sidebar', () => {
    // Absent means everything is on. Every existing caller keeps working unchanged, and the worst
    // a broken settings endpoint can do is leave the nav exactly as it is today.
    expect(REGISTRY).toMatch(/toggles\?:/);
  });

  it('all four nav surfaces read the same shared map', () => {
    // One fetch per page load, not four: React renders these concurrently, so a naive effect in
    // each would fire four identical requests on every navigation.
    for (const f of [
      'app/admin/components/AdminSidebar.tsx',
      'app/admin/components/nav/CommandPalette.tsx',
      'app/admin/components/nav/WorkspaceFlyout.tsx',
      'app/admin/components/nav/WorkspaceLanding.tsx',
    ]) {
      const src = fs.readFileSync(path.join(ROOT2, f), 'utf8');
      expect(src).toMatch(/const toggles = useFeatureToggles\(\);/);
      expect(src).toMatch(/accessibleRoutes\(\{ roles, isCompanyUser, toggles \}\)/);
    }
  });

  it('and the shared read starts everything ON while it is in flight', () => {
    // A nav that waited would flicker its whole list into existence on every page load. The honest
    // starting state is the unfiltered one: a toggle REMOVES entries, so showing everything is a
    // superset and never a lie about what exists.
    const hook = fs.readFileSync(path.join(ROOT2, 'lib/admin/use-feature-toggles.ts'), 'utf8');
    expect(hook).toMatch(/useState<FeatureToggles>\(cache \?\? \{\}\)/);
    expect(hook).toMatch(/\.catch\(\(\) => \(\{\} as FeatureToggles\)\)/);
    // Cleared either way, or one bad response at page load pins an empty map for the session.
    expect(hook).toMatch(/\.finally\(\(\) => \{ inflight = null; \}\)/);
  });
});
