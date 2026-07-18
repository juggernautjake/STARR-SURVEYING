// __tests__/dnd/auth.test.ts — dnd auth helpers (Phase B, B1).
import { describe, it, expect, afterEach } from 'vitest';
import { signToken, verifyToken, hashPassword, verifyPassword, isDndLoginRequired, isDndOpenAccess } from '@/lib/dnd/auth';

describe('the /dnd access-model gate (login-required vs open, DND_REQUIRE_LOGIN)', () => {
  const ORIGINAL = process.env.DND_REQUIRE_LOGIN;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.DND_REQUIRE_LOGIN;
    else process.env.DND_REQUIRE_LOGIN = ORIGINAL;
  });

  it('defaults to OPEN access (no env set) — /dnd is public by design', () => {
    delete process.env.DND_REQUIRE_LOGIN;
    expect(isDndLoginRequired()).toBe(false);
    expect(isDndOpenAccess()).toBe(true);
  });

  it('requires login for every obvious truthy spelling (fails toward the MORE-secure state)', () => {
    // Hardened 2026-07-18: not just '1' — a deployer who INTENDS login-required gets it however they spell it,
    // rather than silently staying open on a non-'1' value.
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE', 'On', ' 1 ']) {
      process.env.DND_REQUIRE_LOGIN = v;
      expect(isDndLoginRequired(), `"${v}" should require login`).toBe(true);
      expect(isDndOpenAccess()).toBe(false);
    }
  });

  it('stays OPEN for falsy / off values (0, false, no, off, empty) — never accidentally locks a public deploy', () => {
    for (const v of ['0', 'false', 'no', 'off', '', '  ']) {
      process.env.DND_REQUIRE_LOGIN = v;
      expect(isDndLoginRequired(), `"${v}" must NOT require login`).toBe(false);
      expect(isDndOpenAccess()).toBe(true);
    }
  });
});

describe('dnd auth: signed tokens', () => {
  it('round-trips a payload', () => {
    const token = signToken({ userId: 'u1', email: 'a@b.c' });
    const p = verifyToken(token);
    expect(p?.userId).toBe('u1');
    expect(p?.email).toBe('a@b.c');
  });

  it('rejects a tampered token', () => {
    const token = signToken({ userId: 'u1' });
    const [body] = token.split('.');
    expect(verifyToken(`${body}.deadbeef`)).toBeNull();
  });

  it('rejects a FORGED payload — a swapped body with a stolen signature can’t escalate identity', () => {
    // The real attack: take a validly-signed token and staple its signature onto a DIFFERENT payload
    // ("userId: u1" → "userId: admin"). The signature is over the ORIGINAL body, so the recomputed HMAC
    // for the forged body won't match — verifyToken must return null (no privilege escalation).
    const legit = signToken({ userId: 'u1' });
    const stolenSig = legit.split('.')[1];
    const forgedBody = Buffer.from(JSON.stringify({ userId: 'admin' })).toString('base64url');
    expect(verifyToken(`${forgedBody}.${stolenSig}`)).toBeNull();
    // and the length-guard path: a signature of a different length is rejected before the timing-safe compare
    expect(verifyToken(`${forgedBody}.short`)).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyToken('not-a-token')).toBeNull();
    expect(verifyToken('')).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signToken({ userId: 'u1', exp: Date.now() - 1000 });
    expect(verifyToken(token)).toBeNull();
  });

  it('accepts a non-expired token', () => {
    const token = signToken({ userId: 'u1', exp: Date.now() + 60_000 });
    expect(verifyToken(token)?.userId).toBe('u1');
  });

  it('persists across repeated verifications (a session that keeps working)', () => {
    // A 30-day token (what setDndSession issues) verifies now and on later reads — the stable secret
    // means the same token keeps validating, so a signed-in user stays signed in.
    const token = signToken({ userId: 'u1', email: 'a@b.c', exp: Date.now() + 60 * 60 * 24 * 30 * 1000 });
    for (let i = 0; i < 3; i++) {
      const p = verifyToken(token);
      expect(p?.userId).toBe('u1');
      expect(p?.email).toBe('a@b.c');
    }
  });
});

describe('dnd auth: password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });
});
