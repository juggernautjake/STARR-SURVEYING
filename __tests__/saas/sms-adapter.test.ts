// The Twilio adapter's behaviour when it CANNOT send.
//
// ── WHAT THIS IS ABOUT ──────────────────────────────────────────────────────────────────────────
//
// Measured 2026-08-27: the Twilio account is active, owns ZERO phone numbers, and its last message
// attempt — 30 January 2026 — is marked `undelivered`. The SMS path is wired, configured and
// reachable from the Stripe webhook, signup, the trial-ending cron and invites. It has been
// structurally incapable of succeeding for seven months.
//
// The adapter's response to that was to log at `info` with the words "DEV mode (no Twilio creds)"
// and return `true` — in every environment, production included. A security alert that could not be
// sent produced a cheerful line saying it would be, and reported success.
//
// Whether the firm rents a number or removes the path is the owner's call. What is not a judgement
// call is that the code must say which of those two worlds it is in.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendSMSViaTwilio } from '@/lib/saas/notifications/sms';

const KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_PHONE_NUMBER'] as const;
const saved: Record<string, string | undefined> = {};

const input = { to: '+15125550123', body: 'A security alert you would want to receive.' };

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('SMS adapter — production must not claim success it did not have', () => {
  it('returns FALSE and logs an ERROR when credentials are missing in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    return sendSMSViaTwilio(input).then((ok) => {
      expect(ok).toBe(false);
      expect(err).toHaveBeenCalled();
      const msg = String(err.mock.calls[0][0]);
      // It must name the exact variable. "SMS failed" sends somebody reading logs on a hunt.
      expect(msg).toContain('TWILIO_ACCOUNT_SID');
      expect(msg).toContain('NOT SENT');
    });
  });

  it('names the MISSING variable specifically, not all of them', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    return sendSMSViaTwilio(input).then(() => {
      const msg = String(err.mock.calls[0][0]);
      expect(msg).toContain('TWILIO_FROM_NUMBER');
      // Control: the two that ARE set must not be reported missing, or the message is noise.
      expect(msg).not.toContain('TWILIO_ACCOUNT_SID');
      expect(msg).not.toContain('TWILIO_AUTH_TOKEN');
    });
  });

  it('does NOT log the words "DEV mode" in production', () => {
    // The specific line that hid this for seven months. It was at info level and said DEV, which is
    // the last thing anyone greps when a production alert did not arrive.
    vi.stubEnv('NODE_ENV', 'production');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    return sendSMSViaTwilio(input).then(() => {
      expect(info).not.toHaveBeenCalled();
    });
  });
});

describe('SMS adapter — the dev short-circuit is kept, where it is true', () => {
  it('still logs at info and returns true outside production', () => {
    // Genuinely useful: a local clone with no Twilio account should not fail a signup flow.
    vi.stubEnv('NODE_ENV', 'development');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    return sendSMSViaTwilio(input).then((ok) => {
      expect(ok).toBe(true);
      expect(info).toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
    });
  });
});

describe('SMS adapter — one number, two names', () => {
  it('accepts TWILIO_PHONE_NUMBER, the name the configuration actually uses', () => {
    // The code has always read TWILIO_FROM_NUMBER; the owner set TWILIO_PHONE_NUMBER, and that is
    // the name the Doppler migration moved. BLOCKERS.md asked for this reconciliation months ago.
    vi.stubEnv('NODE_ENV', 'production');
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.TWILIO_PHONE_NUMBER = '+15125550000';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Not actually reaching Twilio: the point is that it got PAST the missing-credential branch.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 201 }));

    return sendSMSViaTwilio(input).then((ok) => {
      expect(ok).toBe(true);
      expect(err).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  it('prefers TWILIO_FROM_NUMBER when both are set', () => {
    // Deliberate. It is what this code has always used and what worker/.env.example documents;
    // preferring the newer name would silently change which value wins where the two differ.
    vi.stubEnv('NODE_ENV', 'production');
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.TWILIO_FROM_NUMBER = '+15125551111';
    process.env.TWILIO_PHONE_NUMBER = '+15125552222';
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 201 }));

    return sendSMSViaTwilio(input).then(() => {
      const body = String((fetchSpy.mock.calls[0][1] as RequestInit).body);
      expect(body).toContain('5125551111');
      expect(body).not.toContain('5125552222');
    });
  });
});
