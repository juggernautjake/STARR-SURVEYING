// Compliance register — the dates a firm gets caught out by (audit §3, Phase 2 item 12, item 8m).
//
// The interesting assertions are about the two things this surface exists to get right: when to warn,
// and the difference between "nothing on record" and "all clear".

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  assess, bySeverity, daysBetween, describeDeadline, parseDateOnly, summarise,
  type ComplianceRow,
} from '@/lib/compliance/register';

const ROOT = process.cwd();
const TODAY = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01

function row(over: Partial<ComplianceRow> = {}): ComplianceRow {
  return {
    register_key: 'org_compliance:1',
    org_id: 'org-1',
    subject_kind: 'organization',
    subject_label: 'The firm',
    subject_id: '1',
    category: 'insurance',
    title: 'E&O policy',
    identifier: 'POL-1',
    issued_on: '2025-08-01',
    expires_on: '2026-09-01',
    renewal_lead_days: 60,
    document_url: null,
    ...over,
  };
}

describe('date arithmetic', () => {
  it('counts DATES, not 24-hour periods', () => {
    // (b - a) / 86400000 answers "how many days have elapsed", which is off by one for most of the
    // day — an item expiring tomorrow would report 0 days remaining all afternoon.
    const a = new Date(Date.UTC(2026, 7, 1, 23, 59));
    const b = new Date(Date.UTC(2026, 7, 2, 0, 1));
    expect(daysBetween(a, b)).toBe(1);
  });

  it('does not let the local timezone move a date-only value', () => {
    // `new Date('2026-08-01')` is midnight UTC — the previous evening in Texas. An item expiring
    // today would report as expired yesterday for everyone west of Greenwich.
    const d = parseDateOnly('2026-08-01')!;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(7);
    expect(d.getUTCDate()).toBe(1);
    expect(daysBetween(d, parseDateOnly('2026-08-01')!)).toBe(0);
  });

  it('handles a missing or malformed date without throwing', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly('not a date')).toBeNull();
  });
});

describe('urgency is per-item, not global', () => {
  it('warns about a 60-day obligation at 60 days and a 14-day one at 14', () => {
    // One global threshold either buries people in vehicle-registration notices or tells them about
    // their E&O a month too late — and the second is how a firm works uninsured without noticing.
    const eo = assess(row({ renewal_lead_days: 60, expires_on: '2026-09-25' }), TODAY);   // 55 days
    expect(eo.state).toBe('due');

    const registration = assess(row({ renewal_lead_days: 14, expires_on: '2026-09-25' }), TODAY);
    expect(registration.state).toBe('ok'); // 55 days out is nowhere near a 14-day obligation
  });

  it('escalates to critical inside a quarter of the lead time', () => {
    // 60-day lead → critical at 15 days.
    expect(assess(row({ renewal_lead_days: 60, expires_on: '2026-08-10' }), TODAY).state).toBe('critical');
    expect(assess(row({ renewal_lead_days: 60, expires_on: '2026-08-25' }), TODAY).state).toBe('due');
  });

  it('reports expired with a negative day count rather than clamping to zero', () => {
    const lapsed = assess(row({ expires_on: '2026-07-20' }), TODAY);
    expect(lapsed.state).toBe('expired');
    expect(lapsed.daysRemaining).toBe(-12);
    expect(describeDeadline(lapsed)).toBe('Expired 12 days ago');
  });

  it('treats an item with no expiry as its own state, not as current', () => {
    const perpetual = assess(row({ expires_on: null }), TODAY);
    expect(perpetual.state).toBe('no_expiry');
    expect(perpetual.daysRemaining).toBeNull();
    expect(describeDeadline(perpetual)).toBe('No expiry recorded');
  });

  it('phrases today and tomorrow as words, not as "in 0 days"', () => {
    expect(describeDeadline(assess(row({ expires_on: '2026-08-01' }), TODAY))).toBe('Expires today');
    expect(describeDeadline(assess(row({ expires_on: '2026-08-02' }), TODAY))).toBe('Expires tomorrow');
  });

  it('survives a nonsense lead time instead of producing nonsense bands', () => {
    const zero = assess(row({ renewal_lead_days: 0, expires_on: '2026-08-05' }), TODAY);
    expect(zero.state).not.toBe('ok');
    expect(Number.isFinite(zero.daysRemaining!)).toBe(true);
  });
});

describe('alert bands', () => {
  it('gives an expired item band 0 so it fires exactly once', () => {
    expect(assess(row({ expires_on: '2026-07-01' }), TODAY).band).toBe(0);
  });

  it('reports the tightest band already crossed, so an item does not re-alert every day', () => {
    // 60-day lead → bands at 60, 30, 15.
    expect(assess(row({ renewal_lead_days: 60, expires_on: '2026-09-25' }), TODAY).band).toBe(60);
    expect(assess(row({ renewal_lead_days: 60, expires_on: '2026-08-20' }), TODAY).band).toBe(30);
    expect(assess(row({ renewal_lead_days: 60, expires_on: '2026-08-10' }), TODAY).band).toBe(15);
  });

  it('has no band before the first threshold', () => {
    expect(assess(row({ renewal_lead_days: 30, expires_on: '2027-01-01' }), TODAY).band).toBeNull();
  });
});

describe('ordering and summary', () => {
  const items = [
    assess(row({ register_key: 'a', expires_on: '2027-01-01' }), TODAY),  // ok
    assess(row({ register_key: 'b', expires_on: '2026-07-01' }), TODAY),  // expired
    assess(row({ register_key: 'c', expires_on: '2026-08-05' }), TODAY),  // critical
    assess(row({ register_key: 'd', expires_on: null }), TODAY),          // no expiry
  ].sort(bySeverity);

  it('puts what needs doing first', () => {
    expect(items.map((i) => i.register_key)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('summarises for a badge', () => {
    const s = summarise(items);
    expect(s).toMatchObject({ expired: 1, critical: 1, ok: 1, noExpiry: 1 });
    expect(s.needsAttention).toBe(true);
    expect(summarise([assess(row({ expires_on: '2028-01-01' }), TODAY)]).needsAttention).toBe(false);
  });
});

describe('the shape of the build', () => {
  const seed = fs.readFileSync(path.join(ROOT, 'seeds/520_compliance_register.sql'), 'utf8');
  const api = fs.readFileSync(path.join(ROOT, 'app/api/admin/compliance/route.ts'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'app/admin/compliance/page.tsx'), 'utf8');

  it('unions the existing tables rather than copying their dates into a new one', () => {
    // The obvious build — one table backfilled from the others — makes two places that can disagree
    // about when a professional licence expires. §1.3 measured that defect with menu items; this
    // would be the same bug with a licence in place of a link.
    expect(seed).toMatch(/CREATE OR REPLACE VIEW compliance_register/);
    expect(seed).not.toMatch(/INSERT INTO compliance_items/);
    expect(seed).toMatch(/FROM employee_certifications/);
    expect(seed).toMatch(/FROM equipment_inventory/);
    expect(seed).toMatch(/FROM vehicles/);
  });

  it('keys the alert ledger on the expiry date so a renewal can alert again', () => {
    // Keyed on item+threshold alone, a renewed licence goes silent for the rest of its life.
    expect(seed).toMatch(/UNIQUE \(register_key, threshold_days, expires_on\)/);
  });

  it('asks separately about assets with no date at all', () => {
    // The view can only union rows that HAVE a date, so an instrument that was never calibrated does
    // not appear — and a page showing only the view reports "all clear" for a firm that has recorded
    // nothing. That is §1.1b with a signed and sealed plat downstream.
    expect(api).toMatch(/\.is\('next_calibration_due_at', null\)/);
    expect(api).toMatch(/unrecorded/);
    expect(page).toContain('Nothing on record');
  });

  it('does not accept writes for dates another table owns', () => {
    // Employee certifications, calibration and vehicle dates are edited where they live. Accepting
    // them here would be the second source seed 520 exists to avoid.
    expect(api).toMatch(/from\('org_compliance_items'\)\.insert/);
    expect(api).not.toMatch(/from\('employee_certifications'\)\.(insert|update)/);
    expect(api).not.toMatch(/from\('vehicles'\)\.(insert|update)/);
  });

  it('says the page failed to load rather than rendering an empty all-clear', () => {
    expect(page).toMatch(/not because everything is current/);
  });

  it('moves the instrument due date when a certificate is filed', () => {
    // Otherwise a firm calibrates an instrument, files the paperwork, and the page still says
    // overdue — so people learn to ignore the page, which is worse than not having one.
    const cal = fs.readFileSync(path.join(ROOT, 'app/api/admin/equipment/calibration/route.ts'), 'utf8');
    expect(cal).toMatch(/next_calibration_due_at: nextDue\.toISOString\(\)/);
    // …from the certificate's own expiry when the lab gave one, not from an assumed interval.
    expect(cal).toMatch(/body\.expires_on\s*\n?\s*\?/);
  });

  it('is reachable from the rail, not only by typing the URL', () => {
    // A licence nobody thinks to look for is the failure mode this page exists to prevent — §1.4's
    // "authored but not wired" with a professional registration attached.
    const registry = fs.readFileSync(path.join(ROOT, 'lib/admin/route-registry.ts'), 'utf8');
    expect(registry).toContain("href: '/admin/compliance'");
    expect(registry).not.toMatch(/href: '\/admin\/compliance'[^}]*showInRail: false/);
  });
});
