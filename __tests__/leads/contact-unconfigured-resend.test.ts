// What `/api/contact` does when Resend is unconfigured — the lead intake path.
//
// ── THE SWEEP THAT FOUND THIS ───────────────────────────────────────────────────────────────────
//
// `lib/saas/notifications/sms.ts` had a missing-credential branch that logged `info`, said "DEV
// mode" and returned `true` in every environment including production. `email.ts` had the same one,
// because sms.ts says in its header that it copied it. Seven more routes call Resend DIRECTLY,
// bypassing both adapters, so the class was swept rather than the instances fixed.
//
// ── WHAT WAS ALREADY RIGHT HERE, AND IS NOT BEING CHANGED ───────────────────────────────────────
//
// The lead is NOT lost. This branch still inserts into `leads` and still notifies intake staff
// (Slice Q1/Q2), so an enquiry reaches /admin/leads and lights the bell even with Resend down. That
// was a good decision and the fix leaves it alone. Only two things changed: production now logs the
// fault, and the customer stops being shown a developer's note.
//
// These are source-level assertions rather than a live request. The route is 1,400 lines with
// Supabase, storage and notification dependencies; standing all that up to prove two strings would
// test the harness. What is worth pinning is the pair of decisions, and they are visible here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(process.cwd(), 'app/api/contact/route.ts'), 'utf8');

describe('/api/contact — Resend unconfigured', () => {
  it('logs an ERROR in production, where the old code logged nothing at all', () => {
    // The only log on this path used to be gated on NODE_ENV === 'development' — silent in the one
    // environment where it means the firm's notification AND the customer's confirmation both
    // vanished.
    expect(src).toMatch(/console\.error\(\s*\n?\s*`\[contact\] EMAILS NOT SENT/);
  });

  it('says the lead was still saved, so the log does not read as lost business', () => {
    // An error line saying only "emails not sent" would send somebody hunting for a lost enquiry
    // that is sitting in /admin/leads.
    expect(src).toMatch(/lead WAS saved and intake staff WERE notified/i);
  });

  it('distinguishes a missing key from the placeholder value', () => {
    // `your_resend_api_key` in production is a deployment nobody finished. Reporting that as
    // "missing" sends the reader to add a variable that is already there.
    expect(src).toMatch(/placeholder value/);
  });

  it('never shows a customer "dev mode - check server logs" in production', () => {
    // A real person submitting an enquiry on the live site was being handed a developer's note
    // containing an instruction they cannot follow for a system they do not have.
    const devNote = "'Form received (dev mode - check server logs)'";
    expect(src).toContain(devNote);                       // still there for local work
    expect(src).toMatch(/NODE_ENV === 'production'\s*\n?\s*\?\s*'Request received/);
  });

  it('still inserts the lead and notifies — the part that was already right', () => {
    // A control on the change itself. If a "fix" here ever removed the insert, the emails would be
    // the least of it: the enquiry would be gone.
    expect(src).toContain('insertLeadFromForm');
    expect(src).toContain('notifyIntakeRecipients');
  });
});
