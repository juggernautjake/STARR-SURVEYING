// __tests__/dnd/route-gate-sweep.test.ts — every /dnd API route is gated (P2-6, audit F-5).
//
// WHY THIS TEST CARRIES MORE WEIGHT HERE THAN IT WOULD ELSEWHERE. RLS is enabled on the D&D tables with
// **zero policies**, and every route uses `supabaseAdmin` — the service-role client, which bypasses RLS by
// design. So there is no database backstop whatsoever: authorization is app code, all of it, across 126
// routes. A route that forgets its gate is not "less safe", it is fully open, and nothing else in the stack
// will catch it.
//
// Writing real RLS policies is the fuller answer and is not this slice. This is the cheap 90%: a sweep that
// turns red the moment a new route.ts appears without a recognised gate. It cannot verify that a gate is
// CORRECT — `character-mutation-authorization`, `delete-route-authorization` and the other targeted tests
// do that — only that one is present. Presence is the failure mode that scales with route count.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * The recognised gate helpers.
 *
 * `isDndOpenAccess` earned its place by being missing from the first draft of this list, which reported
 * `dev/enter` as ungated. Reading it showed the opposite — it requires open-access mode, restricts to the
 * demo roster or a real campaign member, AND refuses any password-protected account. The lesson is that an
 * incomplete list here produces false alarms, and a test that cries wolf gets exemptions added to silence
 * it rather than bugs fixed.
 */
const GATES = [
  'getDndSession',
  'getCampaignRole',
  'getCharacterAccess',
  'requireCharacterWrite',
  'isDndOwner',
  'canWriteHomebrew',
  'isDndOpenAccess',
];

/**
 * Routes that legitimately have no session gate, each with the reason.
 *
 * Every entry here is a route that MUST be reachable without a session, not one that happens not to have a
 * gate. That distinction is the whole value of the list: adding to it should feel like a claim.
 */
const UNGATED: Record<string, string> = {
  'app/api/dnd/auth/login/route.ts':
    'IS the authentication endpoint. Requiring a session to sign in is a contradiction. Gated instead by '
    + 'the login rate limiter + bcrypt verification (P2-3).',
  'app/api/dnd/auth/quick/route.ts':
    'The hub sign-in / claim-name endpoint — same reason as login. Throttled and password-verified (P2-3).',
  'app/api/dnd/auth/signup/route.ts':
    'Account creation. Throttled, and holds new passwords to the 8-character floor (P2-3).',
  'app/api/dnd/auth/register/route.ts':
    'Invite-gated account creation: the INVITE CODE is the credential, validated against dnd_invites. '
    + 'Throttled (P2-3).',
  'app/api/dnd/auth/recover/route.ts':
    'Account recovery (P2-4). Everyone who needs it is locked out by definition, so a session gate would '
    + 'make it reachable only by people who do not need it. The recovery CODE is the credential; throttled, '
    + 'single-use, and uniform in its refusals so it cannot enumerate accounts.',
  'app/api/dnd/auth/logout/route.ts':
    'Clears the session cookie. Requiring a valid session to log out would strand anyone holding a stale or '
    + 'malformed one — the exact people who need it.',
  'app/api/dnd/auth/session/route.ts':
    'READS the current session and returns null when there is none. That is its entire purpose; gating it '
    + 'on having a session makes it unable to answer "am I signed in?".',
  'app/api/dnd/library/search/route.ts':
    'The rules library is deliberately PUBLIC — middleware exempts /dnd/library even when DND_REQUIRE_LOGIN '
    + 'is on, because the owner shares library URLs with people who have no account. Read-only, and every '
    + 'result comes from the authored static catalog rather than any user\'s data.',
  'app/api/dnd/systems/route.ts':
    'Returns the static GAME_SYSTEMS registry — the same list rendered on the public library index. No '
    + 'user data, no writes.',
};

/** Every route.ts under app/api/dnd. */
function routeFiles(dir = 'app/api/dnd'): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(ROOT, rel))) {
      const child = `${rel}/${entry}`;
      if (statSync(join(ROOT, child)).isDirectory()) walk(child);
      else if (entry === 'route.ts') out.push(child);
    }
  };
  walk(dir);
  return out.sort();
}

const ROUTES = routeFiles();
const isGated = (src: string) => GATES.some((g) => src.includes(`${g}(`));

describe('the sweep covers what it claims', () => {
  it('finds every route', () => {
    // A lower bound, so adding routes never breaks this — but deleting the scan does.
    expect(ROUTES.length).toBeGreaterThan(100);
    expect(ROUTES).toContain('app/api/dnd/characters/[id]/route.ts');
  });
});

describe('every route is gated, or exempted with a reason', () => {
  it('no route is silently ungated', () => {
    const ungated = ROUTES.filter((f) => !isGated(read(f)) && !UNGATED[f]);
    expect(
      ungated,
      'These routes reference no known authorization helper. RLS is enabled with ZERO policies and every '
      + 'route uses the service-role client, so an ungated route is fully open with no database backstop. '
      + 'Add a gate, or add it to UNGATED with a reason.',
    ).toEqual([]);
  });

  it('and every exemption is still ungated — otherwise it should come off the list', () => {
    const stale = Object.keys(UNGATED).filter((f) => isGated(read(f)));
    expect(stale, 'These now have a gate and no longer need exempting.').toEqual([]);
  });

  it('every exemption names a real reason', () => {
    for (const [file, reason] of Object.entries(UNGATED)) {
      expect(reason.length, `${file} needs a real reason, not a placeholder`).toBeGreaterThan(60);
    }
  });

  it('and every exempted file actually exists', () => {
    // A stale exemption is how a list like this rots into permission to skip the check.
    for (const f of Object.keys(UNGATED)) {
      expect(() => read(f), `${f} is exempted but does not exist`).not.toThrow();
    }
  });
});

describe('the exemptions are all narrow', () => {
  it('only auth endpoints and public read-only data', () => {
    // If this list ever grows a `characters/` or `campaigns/` entry, something is wrong: those carry user
    // data and cannot be public.
    for (const f of Object.keys(UNGATED)) {
      const allowed = f.startsWith('app/api/dnd/auth/')
        || f === 'app/api/dnd/library/search/route.ts'
        || f === 'app/api/dnd/systems/route.ts';
      expect(allowed, `${f} is exempted but is not an auth or public-catalog route`).toBe(true);
    }
  });

  it('and the public ones never write', () => {
    // A read-only exemption that grew a POST would be an unauthenticated write.
    for (const f of ['app/api/dnd/library/search/route.ts', 'app/api/dnd/systems/route.ts']) {
      const src = read(f);
      for (const verb of ['PUT', 'PATCH', 'DELETE']) {
        expect(src, `${f} is exempted as read-only but exports ${verb}`).not.toContain(`export async function ${verb}`);
      }
      // POST is permitted for search (it takes a query body) but must not touch the database for writes.
      expect(src, `${f} must not write`).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    }
  });

  it('and every auth exemption is throttled instead', () => {
    // The auth routes trade a session gate for a rate limit. One or the other must hold, or an
    // unauthenticated endpoint is both open and unbounded.
    for (const f of Object.keys(UNGATED)) {
      if (!f.startsWith('app/api/dnd/auth/')) continue;
      const src = read(f);
      // logout and session neither verify nor create credentials, so they have nothing to throttle.
      if (f.endsWith('logout/route.ts') || f.endsWith('session/route.ts')) continue;
      expect(src, `${f} has no session gate and must be rate limited`).toContain("checkRateLimit('login'");
    }
  });
});

describe('the premise this test rests on', () => {
  it('routes really do use the service-role client, which bypasses RLS', () => {
    // If this ever stops being true — a real RLS policy set, an anon client — the sweep is still useful but
    // its stakes change, and whoever makes that change should see this assertion.
    const sample = ROUTES.filter((f) => read(f).includes('supabaseAdmin'));
    expect(sample.length).toBeGreaterThan(80);
  });
});
