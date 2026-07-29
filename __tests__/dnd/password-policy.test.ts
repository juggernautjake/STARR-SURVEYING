// __tests__/dnd/password-policy.test.ts — the password floor and the login throttle (P2-3, audit F-2).
//
// TWO FINDINGS, both worse than F-2 described:
//
// 1. **P2-1's login throttle was on the route nobody uses.** It limited `auth/login`, the LEGACY email
//    route. Every real sign-in goes through `auth/quick` ("SIGN IN / CLAIM NAME"), which verifies a bcrypt
//    hash and had no throttle at all — as did `auth/signup` and `auth/register`. Three of the four password
//    doors were open while the finding was marked addressed.
// 2. **Raising the minimum in the obvious place would have locked people out.** `auth/quick` both claims a
//    name and signs in to an existing one, and its length check ran BEFORE that branch. Changing 4 to 8
//    there rejects every existing player with a four-character password, at sign-in, on their own account.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIN_NAME_LENGTH, MIN_NEW_PASSWORD_LENGTH, MIN_SIGNIN_PASSWORD_LENGTH,
  checkName, checkNewPassword, loginSubjects, callerIp,
} from '@/lib/dnd/password-policy';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * Every route that hashes or verifies a password.
 *
 * The last three were added by P2-4 (change password, issue a recovery code, redeem one) and this list
 * caught them — which is the test working exactly as intended. A new password door that nobody remembered
 * to throttle is precisely the state P2-3 found the API in.
 */
const PASSWORD_ROUTES = [
  'app/api/dnd/auth/login/route.ts',
  'app/api/dnd/auth/quick/route.ts',
  'app/api/dnd/auth/register/route.ts',
  'app/api/dnd/auth/signup/route.ts',
  'app/api/dnd/auth/password/route.ts',
  'app/api/dnd/auth/recover/route.ts',
  'app/api/dnd/auth/recovery-code/route.ts',
];

describe('the floor', () => {
  it('is 8 for new passwords and 4 for names', () => {
    expect(MIN_NEW_PASSWORD_LENGTH).toBe(8);
    expect(MIN_NAME_LENGTH).toBe(4);
  });

  it('and is deliberately ZERO at sign-in', () => {
    // Not an oversight. Checking length at sign-in would lock out every account created under the old rule,
    // and leaks nothing in exchange — an attacker learns a password is short only by guessing it.
    expect(MIN_SIGNIN_PASSWORD_LENGTH).toBe(0);
  });

  it('rejects short new passwords with a message that names the requirement', () => {
    expect(checkNewPassword('short').ok).toBe(false);
    expect(checkNewPassword('short').error).toMatch(/8 characters/);
    expect(checkNewPassword('longenough').ok).toBe(true);
    expect(checkNewPassword('12345678').ok).toBe(true);
  });

  it('and short names', () => {
    expect(checkName('abc').ok).toBe(false);
    expect(checkName('  ab  ').ok).toBe(false);
    expect(checkName('Andrew').ok).toBe(true);
  });
});

describe('an existing player is never locked out of their own account', () => {
  const quick = read('app/api/dnd/auth/quick/route.ts');

  it('quick does NOT apply the new-password floor before the sign-in branch', () => {
    // THE regression. The floor must appear only after the `if (existing)` branch has returned.
    const existingBranch = quick.indexOf('if (existing) {');
    const floorAt = quick.indexOf('checkNewPassword(');
    expect(existingBranch).toBeGreaterThan(-1);
    expect(floorAt, 'the floor must come AFTER the existing-account branch').toBeGreaterThan(existingBranch);
  });

  it('and says why, so nobody moves it back up', () => {
    expect(quick).toMatch(/deliberately NOT checked here/);
  });

  it('while still requiring a password to be present', () => {
    // Skipping the LENGTH check must not skip the presence check — an empty password would otherwise reach
    // bcrypt verification.
    expect(quick).toContain("if (!password) return NextResponse.json({ error: 'Password is required.' }");
  });
});

describe('the create-only routes DO apply the floor unconditionally', () => {
  it.each(['app/api/dnd/auth/register/route.ts', 'app/api/dnd/auth/signup/route.ts'])('%s', (path) => {
    const src = read(path);
    expect(src).toContain('checkNewPassword(');
    // These never sign anyone in to an existing account, so there is no branch to sit behind.
    expect(src).not.toContain('verifyPassword');
  });
});

describe('EVERY password door is throttled', () => {
  it.each(PASSWORD_ROUTES)('%s counts attempts', (path) => {
    const src = read(path);
    expect(src).toContain("checkRateLimit('login'");
    expect(src).toContain('status: 429');
  });

  it('all four use the SHARED subjects rather than hand-rolling them', () => {
    // Four copies of "which subjects does a sign-in count against" is how they drift into limiting
    // different things — which is exactly the state this slice found.
    for (const p of PASSWORD_ROUTES) {
      expect(read(p), `${p} should use loginSubjects`).toContain('loginSubjects(');
    }
  });

  it('and no auth route that touches a password is missed', () => {
    // Derived, not listed: a new route under auth/ that hashes or verifies a password fails here rather
    // than quietly becoming the next unthrottled door.
    const dirs = readdirSync(join(ROOT, 'app/api/dnd/auth'));
    const touching = dirs
      .map((d) => `app/api/dnd/auth/${d}/route.ts`)
      .filter((p) => {
        try { return /verifyPassword|hashPassword/.test(read(p)); } catch { return false; }
      });
    expect(touching.sort()).toEqual([...PASSWORD_ROUTES].sort());
    for (const p of touching) {
      expect(read(p), `${p} handles passwords and must be throttled`).toContain("checkRateLimit('login'");
    }
  });

  it('counted BEFORE the password is verified', () => {
    // Counting only failures would let an attacker with one correct credential reset their own budget, and
    // the cost being controlled is the guess itself.
    for (const p of PASSWORD_ROUTES) {
      const src = read(p);
      const gateAt = src.indexOf("checkRateLimit('login'");
      const verifyAt = src.indexOf('verifyPassword(');
      if (verifyAt === -1) continue; // create-only routes never verify
      expect(gateAt, `${p}: the counter must precede verification`).toBeLessThan(verifyAt);
    }
  });
});

describe('enumeration is still not possible', () => {
  it('the sign-in failure message does not distinguish a bad name from a bad password', () => {
    // F-2 credited the existing response for this, so the slice must not regress it while changing the
    // surrounding code.
    expect(read('app/api/dnd/auth/login/route.ts')).toContain("error: 'Invalid name or password.'");
  });
});

describe('the shared subjects', () => {
  it('count both the address and the name', () => {
    // Address alone misses a distributed attack on one account; name alone misses one host spraying a
    // password across many names.
    expect(loginSubjects('Andrew', '203.0.113.9')).toEqual(['ip:203.0.113.9', 'name:andrew']);
  });

  it('group every address-less caller together, which is the strictest reading', () => {
    expect(loginSubjects('X', null)[0]).toBe('ip:unknown');
    expect(loginSubjects('X', '   ')[0]).toBe('ip:unknown');
  });

  it('and normalise the name so casing cannot buy a fresh budget', () => {
    expect(loginSubjects('ANDREW', null)[1]).toBe(loginSubjects('andrew', null)[1]);
  });

  it('callerIp takes the first forwarded address', () => {
    const headers = { get: (n: string) => (n === 'x-forwarded-for' ? '203.0.113.9, 10.0.0.1' : null) };
    expect(callerIp(headers)).toBe('203.0.113.9');
    expect(callerIp({ get: () => null })).toBeNull();
  });
});

describe('the sign-in form does not lock existing players out client-side', () => {
  const form = readFileSync(join(process.cwd(), 'app/dnd/_ui/HubSignIn.tsx'), 'utf8');

  it('keeps its password minimum at 4', () => {
    // This one form both signs in and claims a name, and cannot know which until the server answers.
    // Raising it to 8 here would block an existing player with a four-character password from reaching
    // their own account IN THE BROWSER, before any request was made — a lockout no server fix could undo.
    expect(form).toContain('autoComplete="current-password"');
    // Line-scoped rather than a `[^>]*` span: the input's own `onChange={(e) => …}` contains a `>`, so the
    // negated-class regex stopped at the arrow and never reached minLength.
    const pwLine = form.split(/\r?\n/).find((l) => l.includes('type="password"')) ?? '';
    expect(pwLine, 'the password input should still accept 4 characters').toContain('minLength={4}');
  });

  it('but tells you the floor for a NEW name, so the refusal is not a surprise', () => {
    expect(form).toMatch(/at least 8 characters/);
  });
});
