// __tests__/dnd/auth.test.ts — dnd auth helpers (Phase B, B1).
import { describe, it, expect } from 'vitest';
import { signToken, verifyToken, hashPassword, verifyPassword } from '@/lib/dnd/auth';

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
