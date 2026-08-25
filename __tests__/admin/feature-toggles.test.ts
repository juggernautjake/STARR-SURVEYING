// __tests__/admin/feature-toggles.test.ts
//
// T1 of §11 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
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


/**
 * A source file with its comments removed.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────
 *
 * THREE assertions in this session failed against files that were correct, because the thing they
 * asserted was ABSENT from the code and present in a comment explaining why it was absent. A file
 * that documents its own decision is the file most likely to fail a naive .
 *
 * So an absence is asserted against code. A presence can still be asserted against the raw text —
 * finding a string in a comment is a false PASS there, which is a much smaller problem than a false
 * failure that sends somebody to fix working code.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

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
    expect(code(ROUTE)).not.toMatch(/'feature_toggles'/);
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

// ── T3: THE SETTINGS SCREEN ─────────────────────────────────────────────────────────────────────
//
// Owner: *"full control in the settings as to what all pages are visible and what pages are not."*
//
// Browser-verified: 134 destinations in 7 workspace groups on `/admin/settings` → Pages, each row
// saving on its own, the count line, the consequences sentence, and restore.
describe('the screen that puts the switch in somebody\'s hands', () => {
  const ROOT3 = path.join(__dirname, '..', '..');
  const API = fs.readFileSync(path.join(ROOT3, 'app/api/admin/feature-toggles/route.ts'), 'utf8');
  const PANEL = fs.readFileSync(path.join(ROOT3, 'app/admin/settings/PageToggles.tsx'), 'utf8');

  it('lists EVERY route, not only the ones this admin can open', () => {
    // `accessibleRoutes` would be the obvious call and would be wrong: this screen decides what the
    // FIRM uses, not what the person looking at it may open. Filtering by their roles would hide
    // pages they are switching off on behalf of people who DO have those roles, and a switch you
    // cannot find is indistinguishable from one that does not exist.
    expect(API).toMatch(/ADMIN_ROUTES\s*\n?\s*\.filter\(\(r\) => !r\.parked\)/);
    expect(API).not.toMatch(/accessibleRoutes\(/);
  });

  it('counts only links FROM A PAGE, not from shared chrome', () => {
    // ── THE DEFECT THIS PINS ────────────────────────────────────────────────────────────────────
    //
    // `AdminSidebar` and `AdminLayoutClient` link to every route in the registry by construction, so
    // counting them made every destination look like it had two or three more dependants than it
    // has — `/admin/me` reported 19 when most were the navigation itself listing it.
    //
    // Worse than a wrong number: the sentence exists to tell somebody what they are about to break,
    // and an inflated warning is one people learn to skip. After the fix `/admin/me` reads 11, all
    // of them real pages. Found by reading the output, not by anything failing.
    expect(API).toMatch(/if \(!owner\) continue;/);
  });

  it('and matches a QUOTED href, so a parent does not inherit its children\'s links', () => {
    // `"/admin/jobs"` must not be found inside `"/admin/jobs/new"`, or every parent route would
    // absorb its children's inbound links — wrong in the direction that matters, overstating what
    // breaks.
    expect(API).toMatch(/text\.includes\(`"\$\{href\}"`\)/);
    expect(API).toMatch(/text\.includes\(`'\$\{href\}'`\)/);
  });

  it('scans per request rather than reading a generated file', () => {
    // Every other derived inventory here is generated, and every one has at some point been stale
    // and believed. A link count is advisory: a request slower is free, WRONG is the failure that
    // matters — it would tell somebody nothing links to a page that three pages link to.
    expect(API).toMatch(/export const dynamic = 'force-dynamic';/);
  });

  it('a failed save puts the switch back', () => {
    // A control that stays flipped after a failed save is the worst outcome here: the screen would
    // then disagree with the product about which pages exist.
    expect(PANEL).toMatch(/catch \(err\) \{\s*\n\s*setToggles\(toggles\);/);
  });

  it('and flipping one clears the nav\'s cached read', () => {
    // The nav caches its read for the page load. Without this the sidebar keeps the old list until
    // a full reload, and the switch looks like it did nothing.
    expect(PANEL).toMatch(/invalidateFeatureToggles\(\);/);
  });

  it('says on the screen that this is not a permission', () => {
    // §11.5, said where the belief would form rather than only in a code comment nobody using the
    // product will ever read.
    expect(PANEL).toMatch(/This hides pages; it does not lock them/);
  });

  it('and names what a switched-off page breaks, without refusing', () => {
    // §11.6. The owner is allowed to break a link on purpose; they are not well served by doing it
    // invisibly. Shown only once the switch is OFF — a link count on all 134 rows is noise.
    expect(PANEL).toMatch(/\{!on && d\.inbound > 0 && \(/);
    expect(PANEL).toMatch(/Those links still work; they just point somewhere nobody can find/);
  });
});

// ── T4: WHAT A SWITCHED-OFF PAGE ACTUALLY DOES ──────────────────────────────────────────────────
//
// Owner: *"turn it back on and **make sure it is hooked up correctly**."* That clause settles the
// hardest question in the feature — an admin has to be able to REACH a disabled page to check it
// before switching it back on for everybody.
//
// Browser-verified, one route, three states:
//   ON  / admin      the page
//   OFF / admin      the page, working, behind a banner saying it is off for everyone else
//   OFF / employee   "Weather is turned off", no page data, and gone from their workspace list
describe('a switched-off page, from both sides', () => {
  const ROOT4 = path.join(__dirname, '..', '..');
  const GATE = fs.readFileSync(path.join(ROOT4, 'app/admin/components/PageOffGate.tsx'), 'utf8');

  it('an admin gets the working page, not a notice about it', () => {
    // "Make sure it is hooked up correctly" is impossible if the only thing an admin can see of a
    // disabled page is a message saying it is disabled.
    const block = GATE.slice(GATE.indexOf('if (isAdminUser)'));
    expect(block).toMatch(/\{children\}/);
    expect(block).toMatch(/You are seeing it because you are an admin/);
  });

  it('everybody else gets a plain notice, and NOT a 404', () => {
    // A 404 says the thing does not exist. It does — somebody switched it off, and the person who
    // followed a link needs to know which of those two it is: one is a bug worth reporting and the
    // other is a decision the company made.
    expect(GATE).toMatch(/is turned off<\/h1>|\{route\.label\} is turned off/);
    expect(GATE).toMatch(/It has not been deleted/);
  });

  it('resolves the ROUTE, not the raw URL', () => {
    // `findRoute` maps `/admin/jobs/abc123` to the `/admin/jobs` entry, so switching off Jobs covers
    // every job's detail page. Matching the pathname would leave children reachable while the parent
    // was off — the sort of gap somebody finds by accident and then stops trusting the switch.
    expect(GATE).toMatch(/const route = findRoute\(pathname\);/);
    expect(GATE).toMatch(/isEnabled\(toggles, route\.href\)/);
  });

  it('and offers no "request access", because this is not a permission problem', () => {
    // Offering a permission remedy would teach the wrong thing about what happened.
    expect(code(GATE)).not.toMatch(/request access/i);
  });
});

// ── T5: THE TEST §11.5 ASKS FOR BY NAME ─────────────────────────────────────────────────────────
//
// *"A toggle is not a permission. It is a visibility control, and the moment somebody believes
// otherwise it becomes a security hole with a friendly name."*
//
// The plan asks that turning a page off change no API's answer. The way to guarantee that is
// stronger than testing one endpoint: **no API may consult the toggle map at all**, except the one
// whose job is to serve it. An API that never reads it cannot be changed by it, for any role.
describe('turning a page off cannot change what any API answers', () => {
  const ROOT5 = path.join(__dirname, '..', '..');

  function apiFiles(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) apiFiles(p, out);
      else if (e.name === 'route.ts' || e.name === 'route.tsx') out.push(p);
    }
    return out;
  }

  it('no route handler imports the toggles except the one that serves them', () => {
    const routes = apiFiles(path.join(ROOT5, 'app', 'api'));
    // The scan has to actually be finding files, or this passes by looking at nothing — the shape
    // of at least four bugs already recorded in this session.
    expect(routes.length).toBeGreaterThan(100);

    const readers = routes.filter((f) => /from '@\/lib\/admin\/feature-toggles'/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT5, f).split(path.sep).join('/'));

    expect(readers).toEqual([
      // Serves the map. Reads it; never refuses on it.
      'app/api/admin/feature-toggles/route.ts',
      // Owns `app_settings`, and imports only TOGGLES_KEY so the writer and the reader cannot end
      // up pointed at two different rows.
      'app/api/admin/settings/route.ts',
    ]);
  });

  it('and neither of those two refuses a request because of a toggle', () => {
    for (const f of ['app/api/admin/feature-toggles/route.ts', 'app/api/admin/settings/route.ts']) {
      const src = fs.readFileSync(path.join(ROOT5, f), 'utf8');
      // Every 401/403 in these files comes from `auth()` and `isAdmin`, which is what they should
      // come from. A refusal derived from `isEnabled` would be the security hole with a friendly
      // name, arriving in the one place nobody would think to look for it.
      expect(src).not.toMatch(/isEnabled[\s\S]{0,120}status: 40[13]/);
    }
  });

  it('nor does the middleware', () => {
    // The role gate is untouched — §11.5 says so explicitly. A toggle read here would apply to every
    // request in the product at once, which is the largest possible version of this mistake.
    const mw = fs.readFileSync(path.join(ROOT5, 'middleware.ts'), 'utf8');
    expect(mw).not.toMatch(/feature-toggles/);
  });
});
