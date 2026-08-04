// FINANCE_TAX_AND_INTAKE Slice F6 — every job query is recorded, notified, and kept.
//
// The owner's ask: "all job requests/queries come through both email and also come to the website
// and show up as a notification to me and my dad… All of the information about the job should be
// recorded."
//
// Verified rather than built: all four legs already work. The public route emails the office, INSERTs
// a `leads` row, fires the `lead.new` bell notification to role-matched recipients, and uploads any
// customer attachments to storage. `lib/leads/intake.ts` even carried a stale comment claiming
// attachment persistence was "a follow-up slice" — it had already shipped, at two call sites.
//
// ── WHAT THIS TEST DEFENDS, AND WHY IT IS WORTH A FILE ──────────────────────────────────────────
// Not the behaviour of any one helper — 154 tests across ten files already cover those. It defends
// the CHAIN, because the failure mode here is silent and asymmetric: if a refactor drops the
// notification call, the customer still gets their confirmation email and the office still gets
// theirs, so nothing looks broken. The only symptom is that the bell stops ringing — and nobody
// notices a notification that never arrives. Same for the upload: the email still carries the bytes,
// so a dropped upload looks like nothing at all until someone needs the file a year later and the
// mailbox has rotated.
//
// This is the same guard `research-modules-are-reachable` exists to provide, scoped to the one chain
// where every leg degrades quietly.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const route = fs.readFileSync(path.join(process.cwd(), 'app/api/contact/route.ts'), 'utf8');
const code = route
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('the public intake route still does all four things', () => {
  it('records the query as a lead row', () => {
    expect(code).toContain('insertLeadFromForm(');
  });

  it('fires the in-app notification', () => {
    // The leg that fails most quietly: both emails still send without it.
    expect(code).toContain('notifyIntakeRecipients(');
  });

  it('persists customer attachments to storage, not only into the email', () => {
    // A plat or deed attached to a request is part of "all of the information about the job". If
    // this call goes away the bytes exist only inside a sent email.
    expect(code).toContain('uploadLeadAttachments(');
  });

  it('still emails the office', () => {
    expect(code).toMatch(/resend|sendEmail|BUSINESS_RECIPIENTS|EMAIL_RECIPIENTS/i);
  });
});

describe('notification targeting is role-based, in one place', () => {
  const intake = fs.readFileSync(path.join(process.cwd(), 'lib/leads/intake.ts'), 'utf8');

  it('routes by a named role list rather than hard-coded addresses', () => {
    // "There should be certain roles that can see new job queries" — the mechanism exists, and it is
    // centralised so changing WHO is notified is a one-line decision instead of a hunt.
    expect(intake).toContain('INTAKE_ROUTING_ROLES');
    expect(intake).toMatch(/notifyMany\(/);
  });

  it('keeps the role list as the single source it claims to be', () => {
    // Its own comment says "Centralized so future role additions stay in lockstep". If a second
    // literal role list appears in this file, that claim has quietly stopped being true.
    const literalRoleArrays = intake.match(/\[\s*'admin',\s*'employee'/g) ?? [];
    expect(literalRoleArrays.length).toBeLessThanOrEqual(1);
  });
});
