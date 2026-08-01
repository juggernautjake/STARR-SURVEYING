// Customer portal (audit §3, Phase 2 item 10) — the widest disclosure surface in the application.
//
// §3: *"Customers get a marketing site, an email thread, and `/pay/[invoice]` (which requires them to
// already know the invoice number). They cannot log in to see job status, approve a change order, or
// download their plat."*
//
// Almost every test here is about what does NOT get sent. An unauthenticated request that returns job
// data is exactly where a leak lands, and §3b's rule applies with more force than it does to search:
// every projection must be filtered by the rules its own surface would apply.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const portalApi = read('app/api/public/portal/[token]/route.ts');
const portalPage = read('app/portal/[token]/page.tsx');
const adminApi = read('app/api/admin/portal-access/route.ts');
const coApi = read('app/api/public/change-order/[token]/route.ts');
const seed = read('seeds/524_customer_portal.sql');

describe('what the portal must not disclose', () => {
  it('names every column it selects from jobs, so a new one is private by default', () => {
    // `select('*')` with fields deleted afterwards is the version that leaks: the NEXT column
    // somebody adds — a margin, an internal note, a crew's phone number — arrives already exposed.
    expect(portalApi).not.toMatch(/from\('jobs'\)[\s\S]{0,80}select\('\*'\)/);
    expect(portalApi).toMatch(/select\('id, job_number, name, address/);
  });

  it('sends no money the customer has not been quoted', () => {
    // `quote_amount` and `final_amount` are internal figures on the job row and are not what the
    // customer agreed — the accepted proposal is. `notes` and `instructions` are crew direction and
    // would be read as promises.
    const jobsSelect = /from\('jobs'\)[\s\S]*?\.select\('([^']+)'\)/.exec(portalApi)?.[1] ?? '';
    for (const forbidden of ['quote_amount', 'final_amount', 'amount_paid', 'notes', 'instructions', 'lead_rpls_email', 'created_by']) {
      expect(jobsSelect, `jobs projection exposes ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('shows only deliverables that were actually issued', () => {
    // A draft plat is not a document the customer has, and showing it invites a call asking for it.
    expect(portalApi).toMatch(/\.in\('state', \['issued', 'final'\]\)/);
  });

  it('hides draft and voided invoices', () => {
    expect(portalApi).toMatch(/\.not\('status', 'in', '\("draft","voided"\)'\)/);
  });

  it('hides draft change orders', () => {
    // A draft change order is an internal thought. A customer seeing a price nobody has quoted them
    // is a phone call at best.
    expect(portalApi).toMatch(/\.in\('status', \['sent', 'approved', 'declined'\]\)/);
  });
});

describe('stage labels — Q29, "or is that too much transparency"', () => {
  it('maps internal stages to customer words in a TABLE, not a CASE in code', () => {
    // The phrasing is a business decision. A firm should be able to change what its customers are
    // told without a deploy.
    expect(seed).toMatch(/CREATE TABLE IF NOT EXISTS portal_stage_labels/);
    expect(portalApi).toMatch(/from\('portal_stage_labels'\)/);
  });

  it('fails CLOSED for an unmapped stage', () => {
    // "legal_complete" is not a phrase anybody wants to receive by email about their land. An
    // unmapped stage shows a neutral message, not the internal name.
    expect(portalApi).toMatch(/match && match\.is_visible/);
    expect(portalApi).toMatch(/Unmapped stages fail CLOSED/);
  });

  it('marks on_hold and cancelled invisible rather than omitting them', () => {
    // Present-but-hidden keeps the difference between "we chose not to say" and "we forgot to map
    // it" visible to the firm.
    expect(seed).toMatch(/'on_hold',\s+'On hold',\s+NULL, 0, false/);
    expect(seed).toMatch(/'cancelled',\s+'Cancelled',\s+NULL, 0, false/);
  });

  it('renders a neutral sentence when there is no visible phase', () => {
    expect(portalPage).toMatch(/Your job is in progress/);
  });
});

describe('access grants', () => {
  it('is scoped to a JOB, not to a customer', () => {
    // Links get forwarded to lenders, neighbours and title companies. A customer-wide token turns
    // that normal act into a disclosure of every job they have ever had.
    expect(seed).toMatch(/job_id\s+uuid NOT NULL REFERENCES jobs\(id\)/);
    expect(portalApi).toMatch(/\.eq\('id', grant\.job_id\)/);
  });

  it('treats revoked and expired exactly like missing', () => {
    expect(portalApi).toMatch(/if \(grant\.revoked_at\) return null/);
    expect(portalApi).toMatch(/Date\.parse\(grant\.expires_at\) < Date\.now\(\)/);
    // One 404 for all three: distinguishing them tells someone probing which guesses were close.
    const notFound = portalApi.match(/status: 404/g) ?? [];
    expect(notFound.length).toBeGreaterThanOrEqual(2);
  });

  it('returns the full token only once, at creation', () => {
    // Afterwards a prefix — enough to match a link read out over the phone, not enough to reconstruct
    // one from a screenshot or a support ticket.
    expect(adminApi).toMatch(/token: undefined/);
    expect(adminApi).toMatch(/tokenPrefix: g\.token\.slice\(0, 6\)/);
  });

  it('revokes rather than deletes', () => {
    // "Who could see what, and until when" is asked after something goes wrong, and a deleted row
    // cannot answer it.
    expect(adminApi).toMatch(/revoked_at: new Date\(\)\.toISOString\(\)/);
    expect(adminApi).not.toMatch(/from\('customer_portal_access'\)\s*\n?\s*\.delete\(\)/);
  });

  it('surfaces a link that was never opened', () => {
    // Almost always a wrong email address, and the one thing the firm can act on from that list.
    expect(adminApi).toMatch(/neverOpened/);
  });

  it('does not let a view counter failure block a customer reading their job', () => {
    expect(portalApi).toMatch(/void db\.from\('customer_portal_access'\)\.update/);
  });
});

describe('change-order approval', () => {
  it('only lets a SENT order be decided', () => {
    expect(coApi).toMatch(/decidable: co\.status === 'sent'/);
    expect(coApi).toMatch(/\.eq\('status', 'sent'\)/);
  });

  it('treats an already-decided order as success, not an error', () => {
    // They double-clicked or came back to the link later. An error sends them round again or to the
    // phone.
    expect(coApi).toMatch(/alreadyDecided: true/);
    expect(coApi).toMatch(/status: already \? 200 : 409/);
  });

  it('records WHO decided, with a hashed IP', () => {
    expect(coApi).toMatch(/approved_by_name: name/);
    expect(coApi).toMatch(/approval_ip_hash: hashIp\(/);
  });

  it('kills the link once decided, so a forwarded email cannot reverse it', () => {
    expect(coApi).toMatch(/public_token: null/);
  });

  it('asks why on a decline, at the only moment anyone knows', () => {
    // Declining is the answer the firm most needs to understand, and nobody reconstructs the reason
    // a month later — the same argument seed 505 makes about quotes.
    expect(portalPage).toBeTruthy();
    const coPage = read('app/change-order/[token]/page.tsx');
    expect(coPage).toMatch(/declining \? decide\('decline'\) : setDeclining\(true\)/);
  });
});

describe('reachability', () => {
  it.each([
    'app/portal/[token]/page.tsx',
    'app/change-order/[token]/page.tsx',
    'app/proposal/[token]/page.tsx',
    'app/api/public/portal/[token]/route.ts',
    'app/api/public/change-order/[token]/route.ts',
    'app/api/public/proposal/[token]/route.ts',
    'app/api/admin/portal-access/route.ts',
  ])('%s exists', (p) => {
    expect(fs.existsSync(path.join(ROOT, p)), `${p} is missing`).toBe(true);
  });

  it('links an unpaid invoice straight into the pay portal', () => {
    // §3's complaint was that reaching /pay/[invoice] required already knowing the invoice number.
    // From here the customer does not.
    expect(portalPage).toMatch(/\/pay\/\$\{encodeURIComponent\(i\.public_slug\)\}/);
  });
});
