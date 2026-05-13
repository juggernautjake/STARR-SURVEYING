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

/** Send one SMS via Twilio. Returns true on 2xx, false on any
 *  failure. Errors are logged but never thrown. */
export async function sendSMSViaTwilio(input: SMSDispatchInput): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  // Dev-mode short-circuit
  if (!accountSid || !authToken || !fromNumber) {
    if (typeof console !== 'undefined') {
      console.info('[notifications/sms] DEV mode (no Twilio creds) — would send:', {
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
