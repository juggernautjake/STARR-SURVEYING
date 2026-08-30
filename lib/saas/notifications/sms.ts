// lib/saas/notifications/sms.ts
//
// Twilio SMS adapter for the notifications service. Direct REST call
// to https://api.twilio.com/2010-04-01 — no SDK dep, same pattern as
// the Resend adapter in ./email.ts.
//
// Per CUSTOMER_MESSAGING_PLAN.md §3 + master plan §5.4: SMS is opt-
// in per-user and used only for security alerts. Twilio Verify
// (separate from this adapter) handles phone-number enrollment +
// verification; this adapter just posts messages to enrolled
// numbers.
//
// Dev-mode short-circuit (no TWILIO_ACCOUNT_SID set) logs + returns
// true, matching the email adapter's behavior.
//
// Spec: docs/planning/completed/CUSTOMER_MESSAGING_PLAN.md §3 + §6 F-8.

import type { SMSDispatchInput } from './index';

/** The sending number, under either of the two names this system has used.
 *
 *  ── TWO NAMES FOR ONE NUMBER, AND IT COST SEVEN MONTHS ─────────────────────────────────────────
 *
 *  This code has always read `TWILIO_FROM_NUMBER`. The configuration has `TWILIO_PHONE_NUMBER` —
 *  that is the name the owner set, the name the Doppler consolidation migrated on 2026-08-26, and
 *  the name the plan doc discusses. `BLOCKERS.md` spotted the divergence and asked for it to be
 *  "reconciled during the merge"; it was not.
 *
 *  Both are now present in the Vercel project, so the mismatch may currently be masked. Reading both
 *  removes the question permanently, and costs one `??`. `TWILIO_FROM_NUMBER` stays first because it
 *  is what this code has always used and what `worker/.env.example` documents — preferring the newer
 *  name would silently change which value wins on a deployment where the two differ.
 */
function sendingNumber(): string | undefined {
  return process.env.TWILIO_FROM_NUMBER ?? process.env.TWILIO_PHONE_NUMBER;
}

/** Send one SMS via Twilio. Returns true on 2xx, false on any
 *  failure. Errors are logged but never thrown. */
export async function sendSMSViaTwilio(input: SMSDispatchInput): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = sendingNumber();

  if (!accountSid || !authToken || !fromNumber) {
    const missing = [
      !accountSid && 'TWILIO_ACCOUNT_SID',
      !authToken && 'TWILIO_AUTH_TOKEN',
      !fromNumber && 'TWILIO_FROM_NUMBER (or TWILIO_PHONE_NUMBER)',
    ].filter(Boolean).join(', ');

    // ── A MISSING CREDENTIAL IN PRODUCTION IS AN ERROR, NOT A DEV CONVENIENCE ───────────────────
    //
    // This branch used to log at `info` with the words "DEV mode (no Twilio creds)" and return
    // `true` — in every environment, production included. So a security alert that could not
    // possibly be sent produced a cheerful info line claiming it would be, and reported success.
    //
    // Measured 2026-08-27: the Twilio account is active, owns ZERO phone numbers, and its last
    // message attempt — 30 January 2026 — is marked `undelivered`. Seven months of a notification
    // path that is wired, configured, reachable, and structurally incapable of succeeding, saying
    // nothing about it at a level anybody greps for.
    //
    // The dev short-circuit is genuinely useful and is kept, but only where it is true: outside
    // production. In production this is now an error naming the exact variable, which is the
    // difference between "why did nobody get the alert" taking ten minutes and taking seven months.
    if (process.env.NODE_ENV === 'production') {
      if (typeof console !== 'undefined') {
        console.error(`[notifications/sms] NOT SENT — missing ${missing}. `
          + `SMS is wired and reachable but cannot deliver; the message was dropped.`, {
          to: input.to,
          bodyPreview: input.body.slice(0, 50),
        });
      }
      // False, not true. Nothing reads this return today — `events.ts` awaits and discards it — but
      // returning `true` for a message that was never sent is a lie waiting for its first caller.
      return false;
    }

    if (typeof console !== 'undefined') {
      console.info(`[notifications/sms] DEV mode (missing ${missing}) — would send:`, {
        to: input.to,
        bodyPreview: input.body.slice(0, 50),
      });
    }
    return true;
  }

  // Twilio Messages API: POST /2010-04-01/Accounts/{Sid}/Messages.json
  // with form-encoded body. Auth is HTTP Basic with sid:token.
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const formBody = new URLSearchParams({
    To: input.to,
    From: fromNumber,
    Body: input.body.slice(0, 1600),  // Twilio caps at 1600 chars
  });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'unknown' }));
      if (typeof console !== 'undefined') {
        console.error('[notifications/sms] Twilio API error', response.status, error);
      }
      return false;
    }
    return true;
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.error('[notifications/sms] send failed', err);
    }
    return false;
  }
}

/** Returns true if a phone number string is shaped well enough to
 *  pass to Twilio (E.164 format: + then digits, 10-15 total). This
 *  is a cheap sanity check, not full validation — Twilio Verify
 *  handles real validation at enrollment time. */
export function isValidPhoneNumber(phone: string): boolean {
  return /^\+\d{10,15}$/.test(phone.trim());
}
