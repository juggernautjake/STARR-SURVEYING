// Starr assumptions — the ratchet (audit §3c.3, item 8h).
//
// §3c.3: *"Each is correct today and each is a per-tenant setting tomorrow. They should be found and
// catalogued now, while they are a list, rather than discovered one support ticket at a time."*
//
// `scripts/audit-starr-assumptions.mjs` generates the list. This holds it. The number only goes down.
//
// ── WHY A CEILING AND NOT ZERO ──────────────────────────────────────────────────────────────────
//
// Zero is not reachable in one slice and pretending otherwise produces a skipped test, which is a
// ratchet nobody runs. The ceiling below is the measured count after this slice; a new hard-code on a
// customer-facing surface pushes past it and fails with the file named. Lower it whenever a batch is
// paid down — that is the whole mechanism.
//
// The per-surface tests underneath matter more than the count. A total can be gamed by moving a string
// into a constant; "the invoice email renders the SENDING firm's name" cannot.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scan } from '../../scripts/audit-starr-assumptions.mjs';
import { buildInvoiceEmailHtml, buildInvoiceEmailText, buildInvoiceEmailSubject } from '@/lib/payments/invoice-email';
import { outboundIdentity } from '@/lib/email/sender';
import { EMPTY_PROFILE, profileFromRow } from '@/lib/saas/tenant-profile-shape';
import { resolveIsCompanyUser } from '@/lib/saas/internal-user';
import { isCountySupported, unsupportedCountyMessage, SUPPORTED_COUNTIES } from '@/lib/research/county-support';
import { TEST_FIRM_OTHER, TEST_FIRM_BLANK } from '../fixtures/firm';

const ROOT = process.cwd();

/** Measured 2026-08-01 after item 8h: **293 → 160** across 101 → 84 files, with a further 73 moved out
 *  of the backlog entirely once county-ADAPTER code was distinguished from tenant debt (see
 *  COUNTY_ADAPTERS in the audit script — those are correct and must not be "fixed").
 *
 *  LOWER THIS when a batch is paid down; never raise it. */
const TENANT_REFERENCE_CEILING = 160;

describe('hard-coded firm identity', () => {
  const tenantHits = scan(ROOT).filter((h: { bucket: string }) => h.bucket === 'tenant');
  const total = tenantHits.reduce((a: number, h: { count: number }) => a + h.count, 0);

  it(`stays at or below ${TENANT_REFERENCE_CEILING} references on tenant-facing surfaces`, () => {
    const byFile = new Map<string, number>();
    for (const h of tenantHits as Array<{ file: string; count: number }>) {
      byFile.set(h.file, (byFile.get(h.file) ?? 0) + h.count);
    }
    const worst = [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([f, n]) => `${n}× ${f}`).join('\n  ');
    expect(total, `worst offenders:\n  ${worst}`).toBeLessThanOrEqual(TENANT_REFERENCE_CEILING);
  });

  it('classifies the public marketing site as correct-forever, not as debt', () => {
    // The trap this audit script exists to avoid: a raw grep finds ~153 files and most of them MUST
    // keep saying Starr — /platform is the vendor, app/page.tsx is the firm's own website. Only the
    // tenant bucket is a backlog, and conflating the three makes the problem look impossible.
    const buckets = new Set((scan(ROOT) as Array<{ bucket: string }>).map((h) => h.bucket));
    expect(buckets).toContain('own-site');
    expect(buckets).toContain('vendor');
  });
});

describe('the money documents carry the SENDING firm', () => {
  const base = {
    invoice_number: 'SS-1',
    customer_name: 'Mary Smith',
    pay_link: 'https://example.test/pay/X',
    line_items: [{ description: 'Boundary survey', total_cents: 1000 }],
    subtotal_cents: 1000,
    tax_cents: 0,
    total_cents: 1000,
    due_at: null,
    notes: null,
  };

  it('renders another firm’s name and phone, with no trace of Starr', () => {
    // The failure this prevents is specific and expensive: a second firm's customer receiving an
    // invoice signed by a competitor.
    const html = buildInvoiceEmailHtml({ ...base, firm: TEST_FIRM_OTHER });
    const text = buildInvoiceEmailText({ ...base, firm: TEST_FIRM_OTHER });
    for (const rendered of [html, text]) {
      expect(rendered).toContain('Brazos Land Surveying');
      expect(rendered).not.toContain('Starr');
      expect(rendered).not.toContain('662-0077');
    }
    expect(html).toContain('tel:+15125550143');
    expect(buildInvoiceEmailSubject({ invoice_number: 'SS-1', firm: TEST_FIRM_OTHER }))
      .toBe('Invoice SS-1 from Brazos Land Surveying');
  });

  it('stays sendable for a firm that has filled in nothing', () => {
    // A firm mid-onboarding has a blank profile. The email must still render — a template that throws
    // or emits "undefined" turns an unfinished settings page into a failed invoice.
    const html = buildInvoiceEmailHtml({ ...base, firm: TEST_FIRM_BLANK });
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
    // No phone → no half-built tel: link, which is a button that does nothing when tapped.
    expect(html).not.toContain('tel:');
    expect(html).not.toContain('Questions? Call');
  });
});

describe('outbound sender identity', () => {
  it('takes the display name from the tenant and the address from a verified sender', () => {
    // Substituting the tenant's own address into `from:` is the tempting version and it breaks
    // sending: providers only accept a domain the account verified with DNS. Name from the firm,
    // envelope from the platform, reply-to at the firm.
    const profile = profileFromRow({
      id: 'org-2', name: 'Brazos Land Surveying', state: 'TX', phone: null, logo_url: null,
      brand_color: null, domain_restriction: null, address_line1: null, address_line2: null,
      website: null, primary_admin_email: 'office@brazos.test', billing_contact_email: null,
    });
    const { from, replyTo } = outboundIdentity(profile);
    expect(from).toContain('Brazos Land Surveying <');
    expect(replyTo).toBe('office@brazos.test');
  });

  it('cannot be used to forge headers through the firm name', () => {
    // The display name is tenant-controlled input landing in an email header. `<`, `>`, quotes and
    // newlines are meaningless in a display name and are exactly the characters that inject headers.
    const evil = { ...EMPTY_PROFILE, name: 'Evil" <a@b.c>\r\nBcc: victim@x.y', contactEmail: 'a@b.c' };
    const { from } = outboundIdentity(evil);
    expect(from).not.toContain('\r');
    expect(from).not.toContain('\n');
    expect(from.match(/</g)?.length).toBe(1);
  });

  it('degrades to a bare address rather than "undefined <…>" when the firm has no name', () => {
    expect(outboundIdentity(EMPTY_PROFILE).from).not.toContain('undefined');
    expect(outboundIdentity(EMPTY_PROFILE).from).not.toContain('<');
  });
});

describe('who counts as staff', () => {
  it('is membership, not an email suffix', () => {
    // Measured against production before this changed: 2 of the 6 accounts in organization_members
    // have no company address, one of them an org `admin`. Under the old suffix test both lost every
    // internalOnly route — question-bank Q39, already happening.
    expect(resolveIsCompanyUser({ email: 'johntoddharding@gmail.com', memberOfAnyOrg: true, emailDomain: 'starr-surveying.com' })).toBe(true);
  });

  it('never depends on one firm’s domain being configured', () => {
    // Starr's `domain_restriction` was NULL in production. "No domain means no staff" would have
    // locked the whole company out.
    expect(resolveIsCompanyUser({ email: 'anyone@gmail.com', memberOfAnyOrg: true, emailDomain: null })).toBe(true);
  });

  it('no nav surface derives staff status from a hard-coded domain any more', () => {
    // Five components each recomputed `email.endsWith('@starr-surveying.com')`. Two places expressing
    // "who may see this" is how the rail and the drawer drifted 32 routes apart in §1.3.
    const surfaces = [
      'app/admin/components/nav/CommandPalette.tsx',
      'app/admin/components/nav/WorkspaceLanding.tsx',
      'app/admin/components/nav/WorkspaceFlyout.tsx',
      'app/admin/components/AdminSidebar.tsx',
      // `app/admin/dashboard/page.tsx` was the fifth surface. Platform audit Phase 1 item 6
      // (2026-08-01) deleted the page, which is a stronger fix than de-hard-coding it.
    ];
    for (const f of surfaces) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src, `${f} still tests the email suffix`).not.toMatch(/endsWith\('@starr-surveying\.com'\)/);
    }
  });
});

describe('county support', () => {
  it('agrees with the worker about which counties have an adapter', () => {
    // A county this file claims is supported and the worker cannot handle is worse than a missing
    // one: the request gets past the guard and fails somewhere less legible.
    const router = fs.readFileSync(path.join(ROOT, 'worker/src/counties/router.ts'), 'utf8');
    const declared = /COUNTY_SPECIFIC_MODULES\s*=\s*\[([^\]]*)\]/.exec(router)?.[1] ?? '';
    const workerCounties = [...declared.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(workerCounties).toEqual([...SUPPORTED_COUNTIES].sort());
  });

  it('normalises the county name the way the pipeline does', () => {
    expect(isCountySupported('Bell County')).toBe(true);
    expect(isCountySupported('  BELL  ')).toBe(true);
    expect(isCountySupported('Travis')).toBe(false);
  });

  it('explains an unsupported county as a missing adapter, not as a regional product', () => {
    const msg = unsupportedCountyMessage('Travis County', ['bell', 'travis', 'williamson']);
    expect(msg).toContain('Travis County');
    expect(msg).toContain('Bell');
    // The old message read "Lot verification is currently only supported for Bell County", which
    // tells any other firm the product is not for them — and is not even what the code does.
    expect(msg).not.toMatch(/only supported for/i);
    expect(msg).toContain('records adapter');
  });

  it('keeps the Bell CAD GIS guard, which is a vendor limit and must NOT become configurable', () => {
    // Pointing Bell CAD's ArcGIS at another county returns a confident answer about the wrong piece
    // of land. This guard being "fixed" later is the regression this test exists to prevent.
    const src = fs.readFileSync(path.join(ROOT, 'app/api/admin/research/[projectId]/bell-cad-gis/route.ts'), 'utf8');
    expect(src).toMatch(/!== 'bell'/);
  });
});
