// __tests__/dnd/account-recovery.test.ts — a way back into an account (P2-4, audit F-3).
//
// F-3 is the audit's quietest serious finding. Identity is `name:<normalized>` with NO email — a deliberate
// design choice — and nobody had followed through on the consequence: a forgotten password made every
// character, variant, campaign membership and piece of homebrew on that account **permanently
// unreachable**, with no admin path. There was not even a change-password control.
//
// The tests that matter here are the ones about what recovery must NOT become: a permanent second
// credential, an account-enumeration oracle, or a route only reachable by people who do not need it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateRecoveryCode, normalizeRecoveryCode, looksLikeRecoveryCode, formatRecoveryCode,
  RECOVERY_GROUPS, RECOVERY_GROUP_SIZE,
} from '@/lib/dnd/recovery';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** A deterministic byte source, so the generator is testable without randomness. */
const bytes = (seq: number[]) => (n: number) => Uint8Array.from({ length: n }, (_, i) => seq[i % seq.length]);

describe('the code itself', () => {
  it('is five groups of four, hyphenated', () => {
    const code = generateRecoveryCode(bytes([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code.split('-')).toHaveLength(RECOVERY_GROUPS);
    for (const g of code.split('-')) expect(g).toHaveLength(RECOVERY_GROUP_SIZE);
  });

  it('never contains a confusable glyph', () => {
    // The code's entire job is to be transcribed correctly from a screen months later. I/1, O/0, S/5 and
    // B/8 are why that fails, so the alphabet excludes all of them.
    const code = generateRecoveryCode(bytes(Array.from({ length: 256 }, (_, i) => i)));
    for (const bad of ['I', 'O', '0', '1', 'S', '5', 'B', '8']) {
      expect(code, `"${bad}" is confusable and must not appear`).not.toContain(bad);
    }
  });

  it('discards the biased tail rather than folding it in', () => {
    // With a 27-symbol alphabet, a naive `byte % 27` over 0..255 makes the first few letters measurably
    // more likely. Feeding ONLY bytes from the biased tail must produce nothing rather than a skewed code —
    // if rejection sampling were removed, this loop would happily emit characters.
    const highOnly = Array.from({ length: 16 }, (_, i) => 250 + (i % 6)); // 250..255, all ≥ max
    let timedOut = false;
    try {
      // The generator loops until it has enough; with every byte rejected it would spin forever, so a
      // bounded source proves rejection is happening by never satisfying it.
      const src = (n: number) => { if (timedOut) throw new Error('stop'); timedOut = true; return Uint8Array.from({ length: n }, (_, i) => highOnly[i % highOnly.length]); };
      generateRecoveryCode(src);
      expect.unreachable('every byte was in the biased tail, so no code should have been produced');
    } catch (e) {
      expect((e as Error).message).toBe('stop');
    }
  });

  it('is unguessable in practice', () => {
    // 27^20 ≈ 95 bits. Sanity-check the shape rather than the arithmetic.
    expect(RECOVERY_GROUPS * RECOVERY_GROUP_SIZE).toBe(20);
  });
});

describe('reading a code back off a piece of paper', () => {
  it('forgives case, hyphens and spaces', () => {
    expect(normalizeRecoveryCode('acde-fghj klmn PQRT-uvwx')).toBe('ACDEFGHJKLMNPQRTUVWX');
  });

  it('and round-trips to the canonical hyphenated form', () => {
    expect(formatRecoveryCode('acdefghjklmnpqrtuvwx')).toBe('ACDE-FGHJ-KLMN-PQRT-UVWX');
  });

  it('but is STRICT about content, never guessing at glyphs', () => {
    // Being forgiving about layout and strict about content is the right split. A typed `0` cannot be
    // silently read as `O`, because `O` is not in the alphabet either — guessing would be worse than
    // failing, since it would let a wrong code match a different account's.
    expect(looksLikeRecoveryCode('ACDE-FGHJ-KLMN-PQRT-UVWX')).toBe(true);
    expect(looksLikeRecoveryCode('0CDE-FGHJ-KLMN-PQRT-UVWX')).toBe(false);
    expect(looksLikeRecoveryCode('ACDE-FGHJ-KLMN-PQRT')).toBe(false);
    expect(looksLikeRecoveryCode('')).toBe(false);
  });
});

describe('the recovery code is not a second password', () => {
  const route = read('app/api/dnd/auth/recover/route.ts');

  it('redeeming CLEARS it, in the same update that sets the new password', () => {
    // A code that survived redemption would be a permanent secondary credential on every account forever —
    // strictly worse than no recovery, because it looks responsible. Same update, so there is no window in
    // which the password has changed and the code still works.
    expect(route).toMatch(/update\(\{ password_hash, recovery_hash: null, recovery_set_at: null \}\)/);
  });

  it('and is stored only as a hash', () => {
    expect(read('app/api/dnd/auth/recovery-code/route.ts')).toContain('await hashPassword(code)');
    // The plaintext must never be written to the row.
    expect(read('app/api/dnd/auth/recovery-code/route.ts')).not.toMatch(/update\(\{[^}]*recovery_hash: code/);
    expect(read('seeds/458_dnd_account_recovery.sql')).toMatch(/bcrypt hash/i);
  });
});

describe('recovery is not an enumeration oracle', () => {
  const route = read('app/api/dnd/auth/recover/route.ts');

  it('every failure returns the SAME message', () => {
    // Unknown name, no code issued, wrong code — all identical. A distinct "no code has been issued for
    // that account" would confirm which names exist and which are recoverable, on an unauthenticated
    // endpoint.
    expect(route).toContain('const REFUSAL =');
    const refusals = route.match(/error: REFUSAL/g) ?? [];
    expect(refusals.length).toBeGreaterThanOrEqual(2);
  });

  it('including a malformed code, which does not get its own message', () => {
    // "That is not a valid code" would let an attacker map the alphabet and length for free.
    expect(route).toMatch(/looksLikeRecoveryCode\(code\)\) return NextResponse\.json\(\{ error: REFUSAL \}/);
  });

  it('and is throttled before it does any work', () => {
    const gateAt = route.indexOf("checkRateLimit('login'");
    const verifyAt = route.indexOf('verifyPassword(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(verifyAt);
  });
});

describe('changing a password requires proving you know it', () => {
  const route = read('app/api/dnd/auth/password/route.ts');

  it('even though the caller is already signed in', () => {
    // A session on a shared or borrowed machine must not be enough to lock the real owner out.
    expect(route).toContain('currentPassword');
    expect(route).toContain('verifyPassword(current');
  });

  it('and the new password meets the create-time floor', () => {
    expect(route).toContain('checkNewPassword(next)');
  });

  it('as does issuing a recovery code', () => {
    // Minting a fresh credential is exactly as sensitive as changing the password.
    expect(read('app/api/dnd/auth/recovery-code/route.ts')).toContain('verifyPassword(password');
  });
});

describe('the route back is REACHABLE by the people who need it', () => {
  it('the sign-in form links to it', () => {
    // Without this link the whole slice is unreachable by anyone locked out — the audit's signature defect,
    // in the one place where it costs someone their characters.
    expect(read('app/dnd/_ui/HubSignIn.tsx')).toContain('href="/dnd/recover"');
  });

  it('and middleware treats it as public', () => {
    // Everyone who needs this page is locked out by definition. Gating it behind a session would redirect
    // them to the sign-in page they cannot get past.
    expect(read('middleware.ts')).toContain("pathname === '/dnd/recover'");
  });

  it('the page exists and is noindexed like the rest of /dnd', () => {
    const page = read('app/dnd/recover/page.tsx');
    expect(page).toContain('RecoverForm');
    expect(page).toContain('robots: { index: false, follow: false }');
  });

  it('and the profile page carries the controls that create a code', () => {
    expect(read('app/dnd/profile/ProfileForm.tsx')).toContain('<AccountSecurity />');
  });
});

describe('the migration is honest about what it does', () => {
  it('adds nullable columns with no backfill', () => {
    const sql = read('seeds/458_dnd_account_recovery.sql');
    expect(sql).toContain('add column if not exists recovery_hash text');
    // Generating codes for existing accounts would create a credential nobody knows exists.
    expect(sql).not.toMatch(/^update public\.dnd_users/im);
  });

  it('and the issue route fails loudly if it has not been applied', () => {
    // Silently "succeeding" would hand someone a code the server never stored — the one failure mode here
    // that is actively harmful, because they would rely on it.
    expect(read('app/api/dnd/auth/recovery-code/route.ts')).toMatch(/migration may not be applied/);
  });
});
