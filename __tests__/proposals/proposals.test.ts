// Proposals, deliverables, change orders, receivables (audit §3, Phase 2 items 9 and 11).
//
// The front door and the back end. Assertions concentrate on the things that are expensive to get
// wrong: what a customer can see, when Accept exists, and what evidence survives.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  customerFacingProposal, hashIp, jobFromAcceptedProposal, mintProposalToken,
  normaliseLineItem, proposalViewState, sumLineItems, type Proposal,
} from '@/lib/proposals/proposals';

const ROOT = process.cwd();
const TODAY = new Date('2026-08-01T12:00:00Z');

function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: 'q1', lead_id: 'l1', version: 2, amount_cents: 240000, status: 'sent',
    scope_of_work: 'Boundary survey of the subject tract, monuments set at all corners.',
    scope_notes: 'We can go to 2,200 if they push.',
    terms: 'Payment due on delivery.',
    line_items: [{ description: 'Boundary survey', quantity: 1, unit: 'ea', unit_price_cents: 240000, total_cents: 240000 }],
    valid_until: '2026-08-31', public_token: 'tok', sent_at: '2026-07-25T00:00:00Z',
    decided_at: null, quoted_at: '2026-07-25T00:00:00Z',
    ...over,
  };
}

describe('what the customer may see', () => {
  it('never exposes the internal scope notes', () => {
    // seed 505 describes `scope_notes` as the "why is v2 lower" record. It is exactly the field that
    // says "we can go to 2,200 if they push", and it is one careless spread away from the customer.
    const view = customerFacingProposal(proposal());
    expect(JSON.stringify(view)).not.toContain('2,200');
    expect(view).not.toHaveProperty('scope_notes');
  });

  it('is an allow-list, so a column added later is private by default', () => {
    // The difference between building this as "everything minus scope_notes" and "exactly these
    // fields" is what happens to the NEXT internal column somebody adds.
    const view = customerFacingProposal({ ...proposal(), internal_margin_cents: 90000 } as unknown as Proposal);
    expect(view).not.toHaveProperty('internal_margin_cents');
    expect(Object.keys(view).sort()).toEqual(['amount_cents', 'line_items', 'scope_of_work', 'sent_at', 'terms', 'valid_until', 'version']);
  });
});

describe('when Accept exists', () => {
  it('accepts a sent, unexpired proposal', () => {
    expect(proposalViewState(proposal(), false, TODAY)).toBe('acceptable');
  });

  it('refuses a draft whose token leaked', () => {
    // Guarded on `sent_at` rather than on status: the moment of sending is the fact that matters, and
    // a draft reachable by URL must not be acceptable at a price nobody meant to offer.
    expect(proposalViewState(proposal({ sent_at: null, status: 'draft' }), false, TODAY)).toBe('not_sent');
  });

  it('treats "valid until the 31st" as valid ON the 31st', () => {
    // Comparing against midnight loses the customer a day without telling them.
    const lastDay = new Date('2026-08-31T18:00:00Z');
    expect(proposalViewState(proposal({ valid_until: '2026-08-31' }), false, lastDay)).toBe('acceptable');
    const dayAfter = new Date('2026-09-01T00:30:00Z');
    expect(proposalViewState(proposal({ valid_until: '2026-08-31' }), false, dayAfter)).toBe('expired');
  });

  it('distinguishes every refusal, because each needs a different sentence', () => {
    // A customer who accepted last week, one whose quote was revised and one whose quote expired need
    // three different next steps, and only one of them is "call us".
    expect(proposalViewState(proposal(), true, TODAY)).toBe('already_accepted');
    expect(proposalViewState(proposal({ status: 'declined' }), false, TODAY)).toBe('declined');
    expect(proposalViewState(proposal({ status: 'superseded' }), false, TODAY)).toBe('superseded');
    expect(proposalViewState(proposal({ status: 'expired' }), false, TODAY)).toBe('expired');
  });

  it('refuses a superseded version even while its own dates still look fine', () => {
    // The revision is the whole point: a customer holding an old email must not be able to accept a
    // price that was withdrawn.
    expect(proposalViewState(proposal({ status: 'superseded', valid_until: '2027-01-01' }), false, TODAY)).toBe('superseded');
  });
});

describe('line items', () => {
  it('treats a missing quantity as one, not zero', () => {
    // "Boundary survey, $2,400" is one line. Zero would silently zero it.
    expect(normaliseLineItem({ description: 'Boundary survey', unit_price_cents: 240000 })).toMatchObject({ quantity: 1, total_cents: 240000 });
  });

  it('computes a missing total from quantity × price', () => {
    expect(normaliseLineItem({ description: 'Monuments', quantity: 4, unit_price_cents: 7500 }).total_cents).toBe(30000);
  });

  it('keeps a supplied total even when it disagrees with the arithmetic', () => {
    // A discounted line is a real thing. `amount_cents` is the authority on the total (seed 523), and
    // silently recomputing a line would change an agreed figure.
    expect(normaliseLineItem({ description: 'Discounted', quantity: 2, unit_price_cents: 10000, total_cents: 15000 }).total_cents).toBe(15000);
  });

  it('sums to whole cents', () => {
    expect(sumLineItems([
      normaliseLineItem({ description: 'a', total_cents: 12345 }),
      normaliseLineItem({ description: 'b', total_cents: 6789 }),
    ])).toBe(19134);
  });
});

describe('tokens and the acceptance trail', () => {
  it('mints tokens that are long and not repeated', () => {
    // The thing behind this link is a priced contract with a customer's name and address on it.
    const a = mintProposalToken();
    expect(a.length).toBeGreaterThanOrEqual(43); // 256 bits, base64url
    expect(new Set(Array.from({ length: 200 }, mintProposalToken)).size).toBe(200);
  });

  it('salts the IP hash, so it cannot be reversed by trying every address', () => {
    // An unsalted IP hash is reversible in minutes — there are only 4 billion IPv4 addresses. That is
    // the flaw in every unsalted-IP-hash scheme.
    expect(hashIp('203.0.113.7', 'salt-a')).not.toBe(hashIp('203.0.113.7', 'salt-b'));
    expect(hashIp('203.0.113.7', 'salt-a')).toBe(hashIp('203.0.113.7', 'salt-a'));
    expect(hashIp(null)).toBeNull();
  });
});

describe('acceptance creates the job', () => {
  const lead = {
    id: 'l1', name: 'Mary Smith', email: 'mary@example.test', phone: '555-0100', company: null,
    property_address: '123 County Road 4', city: 'Belton', state: 'TX', survey_type: 'boundary',
    estimated_acreage: 3.4, customer_id: 'c1',
  };

  it('carries the lead, the quote and the acceptance date onto the job', () => {
    // §3 calls the proposal "the front door of every job", and D3's spine is lead → job → invoice →
    // paid. An acceptance that only flips a status leaves somebody to notice and retype the job.
    const job = jobFromAcceptedProposal({ lead, proposal: proposal(), acceptedAt: '2026-08-01T23:30:00Z' });
    expect(job).toMatchObject({
      origin_lead_id: 'l1',
      accepted_quote_id: 'q1',
      customer_id: 'c1',
      client_email: 'mary@example.test',
      address: '123 County Road 4',
      stage: 'accepted',
    });
  });

  it('dates the job when they accepted, not when it was processed', () => {
    // A proposal accepted at 11pm and processed by a cron at 6am should not be dated the next
    // morning — the acceptance IS the acceptance date.
    const job = jobFromAcceptedProposal({ lead, proposal: proposal(), acceptedAt: '2026-08-01T23:30:00Z' });
    expect(job.date_accepted).toBe('2026-08-01T23:30:00Z');
    expect(job.stage_changed_at).toBe('2026-08-01T23:30:00Z');
  });

  it('converts cents to dollars once, here, because that is what the column is', () => {
    expect(jobFromAcceptedProposal({ lead, proposal: proposal({ amount_cents: 240000 }), acceptedAt: 'x' }).quote_amount).toBe(2400);
  });
});

describe('the shape of the build', () => {
  /** Line endings normalised. Several assertions below search for multi-line snippets, and this
   *  repo's working tree is CRLF on Windows — so a `\n` in a search string matched on the machine
   *  the test was written on and stopped matching the moment the file was checked out anywhere
   *  else. The test was asserting the checkout, not the code. */
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
  const seed = read('seeds/523_proposals_deliverables_ar.sql');
  const publicApi = read('app/api/public/proposal/[token]/route.ts');
  const adminApi = read('app/api/admin/proposals/route.ts');
  const deliverables = read('app/api/admin/deliverables/route.ts');

  it('extends lead_quotes instead of adding a second answer to "what did we offer"', () => {
    // A parallel `proposals` table would disagree with lead_quotes the first time somebody revised
    // one and not the other — §1.3's defect with a contract in place of a menu item.
    expect(seed).toMatch(/ALTER TABLE lead_quotes ADD COLUMN IF NOT EXISTS line_items/);
    expect(seed).not.toMatch(/CREATE TABLE IF NOT EXISTS proposals\b/);
  });

  it('writes the evidence BEFORE the job and the statuses', () => {
    // There is no transaction across these writes, so the order decides what a partial failure
    // costs. Status-first would produce an "accepted" proposal with no record of who accepted it —
    // the one state that cannot be reconstructed.
    const evidenceAt = publicApi.indexOf("from('quote_acceptances')\n    .insert");
    const jobAt = publicApi.indexOf("from('jobs')\n      .insert");
    const statusAt = publicApi.indexOf("from('lead_quotes').update({ status: 'accepted'");
    expect(evidenceAt).toBeGreaterThan(0);
    expect(evidenceAt).toBeLessThan(jobAt);
    expect(jobAt).toBeLessThan(statusAt);
  });

  it('copies the version and amount into the acceptance rather than referencing them', () => {
    // The evidence must say what was on screen when they clicked, not what the row says a year later.
    expect(seed).toMatch(/quote_version\s+integer NOT NULL/);
    expect(seed).toMatch(/scope_snapshot/);
    expect(publicApi).toMatch(/quote_version: proposal\.version/);
  });

  it('treats a duplicate acceptance as a success', () => {
    // They double-clicked, or the first response was lost. Telling them it failed makes them try
    // again — and the unique index means the second attempt is already recorded.
    expect(publicApi).toMatch(/alreadyAccepted: true/);
    expect(seed).toMatch(/idx_quote_acceptance_once/);
  });

  it('revokes the old link when a revision supersedes it', () => {
    expect(adminApi).toMatch(/update\(\{ public_token: null \}\)\.eq\('id', previous\.id\)/);
  });

  it('reuses the token on a re-send instead of rotating it', () => {
    // Rotating breaks the link in the email the customer already has, which is the most common reason
    // to press Send again.
    expect(adminApi).toMatch(/row\.public_token \?\? mintProposalToken\(\)/);
  });

  it('refuses to seal a deliverable without a surveyor and a registration number', () => {
    // A deliverable marked final with nobody named asserts a professional responsibility no one has
    // taken — worse than one still marked draft.
    expect(deliverables).toMatch(/if \(!sealedBy \|\| !sealNumber\)/);
  });

  it('does not let an issue action downgrade a sealed deliverable', () => {
    expect(deliverables).toMatch(/state === 'final' \? 'final' : 'issued'/);
  });

  it('refuses to "issue" to nobody', () => {
    expect(deliverables).toMatch(/A delivery with no recipient is just a file/);
  });

  it('ages receivables from the DUE date, not the issue date', () => {
    // An invoice with 30-day terms issued 40 days ago is 10 days late. Reporting it as 40 makes every
    // report look like a collections crisis.
    expect(seed).toMatch(/CURRENT_DATE - i\.due_at::date/);
    expect(seed).toMatch(/WHERE i\.status NOT IN \('voided', 'draft'\)/);
  });

  it('estimates from the ACCEPTED quote plus APPROVED change orders', () => {
    // Using the original quote makes every scope change look like a pricing failure, which is the
    // opposite of what the number is for.
    expect(seed).toMatch(/LEFT JOIN lead_quotes q ON q\.id = j\.accepted_quote_id/);
    expect(seed).toMatch(/WHERE c\.job_id = j\.id AND c\.status = 'approved'/);
  });

  it('is reachable from the rail', () => {
    const registry = fs.readFileSync(path.join(ROOT, 'lib/admin/route-registry.ts'), 'utf8');
    // C8 (2026-08-25): receivables is the Customer Money portal's `collections` tab. What this
    // guards is that the aging report is REACHABLE and findable by the jargon somebody types — and
    // it caught a real loss: the portal's first keyword list did not carry 'ar' or 'aging', so
    // somebody typing either would have got nothing, which reads as the feature being gone.
    expect(registry).toContain("href: '/admin/invoicing'");
    expect(registry).toMatch(/'ar', 'aging', 'ageing'/);
  });
});
