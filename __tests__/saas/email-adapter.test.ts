// The Resend adapter's behaviour when it CANNOT send.
//
// ── WHY THIS MATTERS MORE THAN THE SMS ONE ──────────────────────────────────────────────────────
//
// Found 2026-08-29 while fixing the identical branch in `./sms.ts`, whose header says it copies this
// file's pattern. It does, including the bug.
//
// This one is LATENT, not active: `RESEND_API_KEY` is set in production, so mail is genuinely
// sending. What was armed is the day that key is rotated wrong, expires, or is missing from a new
// environment — from that moment every email would log `info`, say "DEV mode", return `true`, and
// vanish. Email is the PRIMARY channel here: password resets, invites, invoices, receipts.
//
// And the return value is consumed. `app/api/cron/weekly-reports/route.ts` branches on it and, when
// true, inserts an audit-log row saying `WEEKLY_REPORT_SENT`. So the old behaviour would have
// written a permanent, FALSE record into the audit log for a report nobody received — and an audit
// log is the one place in a system meant to be believable without checking.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendEmailViaResend } from '@/lib/saas/notifications/email';

const saved: Record<string, string | undefined> = {};
const input = { to: 'someone@example.com', subject: 'Your password reset', html: '<p>hi</p>', text: 'hi' };

beforeEach(() => {
  saved.RESEND_API_KEY = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  if (saved.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = saved.RESEND_API_KEY;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('email adapter — production must not report a delivery it did not make', () => {
  it('returns FALSE and logs an ERROR when the key is missing in production', () => {
    // `true` here becomes a WEEKLY_REPORT_SENT row in the audit log.
    vi.stubEnv('NODE_ENV', 'production');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    return sendEmailViaResend(input).then((ok) => {
      expect(ok).toBe(false);
      expect(err).toHaveBeenCalled();
      expect(String(err.mock.calls[0][0])).toContain('NOT SENT');
      expect(String(err.mock.calls[0][0])).toContain('RESEND_API_KEY');
    });
  });

  it('treats the PLACEHOLDER key as a failure and says so in those words', () => {
    // `your_resend_api_key` in production is a deployment somebody never finished, and it deserves a
    // different sentence from "missing" — otherwise the fix looks like "add the variable", which is
    // already done.
    vi.stubEnv('NODE_ENV', 'production');
    process.env.RESEND_API_KEY = 'your_resend_api_key';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    return sendEmailViaResend(input).then((ok) => {
      expect(ok).toBe(false);
      expect(String(err.mock.calls[0][0])).toMatch(/placeholder/i);
    });
  });

  it('does NOT log the words "DEV mode" in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    return sendEmailViaResend(input).then(() => {
      expect(info).not.toHaveBeenCalled();
    });
  });
});

describe('email adapter — the dev short-circuit is kept, where it is true', () => {
  it('still logs at info and returns true outside production', () => {
    // A local clone with no Resend account must not fail a signup, and must not spam Resend.
    vi.stubEnv('NODE_ENV', 'development');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    return sendEmailViaResend(input).then((ok) => {
      expect(ok).toBe(true);
      expect(info).toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
    });
  });

  it('a real key in production reaches the network — the control', () => {
    // Without this the assertions above would pass just as well if the adapter refused everything.
    vi.stubEnv('NODE_ENV', 'production');
    process.env.RESEND_API_KEY = 're_a_real_looking_key';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));

    return sendEmailViaResend(input).then((ok) => {
      expect(ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
    });
  });
});
