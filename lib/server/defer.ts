// lib/server/defer.ts — keep working after the response has gone out.
//
// A Twilio webhook must answer within 15 seconds or the caller hears an error and is dropped.
// The receptionist's closing turn was measured at 16.7 s on 2026-09-11: the reply from Claude
// (~4 s) plus the lead insert, two SMS attempts, the call analysis (a second, slower model) and
// the owner notifications — all before the TwiML was returned. None of that has to finish before
// the caller hears "goodbye".
//
// On Vercel, `waitUntil` keeps the function alive until the promise settles, after the response is
// sent. Anywhere else (tests, `next dev`) the promise simply runs on its own — so `defer` is for
// work whose outcome the response does not depend on, never for work the caller is waiting on.
import { waitUntil } from '@vercel/functions';

export function defer(work: Promise<unknown>, label: string): void {
  const guarded = work.catch((err) => console.error(`[defer] ${label} failed:`, err));
  try {
    waitUntil(guarded);
  } catch {
    // Not on Vercel: nothing to hand the promise to; it runs on its own.
  }
}
