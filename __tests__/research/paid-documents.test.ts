// The paid-documents switch — and the distinction that makes it safe rather than just cheaper.
//
// The switch itself is three lines of logic. What is worth testing is that a run which BOUGHT
// NOTHING can still say WHY, because "the property has no recorded deed" and "you told me not to
// look behind the paywall" are opposite facts that otherwise render identically.

import { describe, it, expect } from 'vitest';
import {
  mayBuyDocuments,
  skipStatusFor,
  paidDocumentsNotice,
} from '@/lib/research/paid-documents';

const ON = { allowPaidDocuments: true, hasVendorCredentials: true };

describe('mayBuyDocuments', () => {
  it('allows buying when the run permits it and credentials exist', () => {
    expect(mayBuyDocuments(ON)).toEqual({ allowed: true });
  });

  it('refuses when the operator switched it off', () => {
    const d = mayBuyDocuments({ ...ON, allowPaidDocuments: false });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toBe('disabled-for-run');
  });

  it('refuses when there is no vendor login', () => {
    const d = mayBuyDocuments({ ...ON, hasVendorCredentials: false });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toBe('no-credentials');
  });

  it('reports the OPERATOR\'S choice first when both apply', () => {
    // Both are true reasons, but only one is actionable by the person reading it. Telling somebody
    // "no credentials" when they deliberately switched purchasing off sends them to fix a setting
    // that is not the reason they got fewer documents.
    const d = mayBuyDocuments({ allowPaidDocuments: false, hasVendorCredentials: false });
    expect(d.allowed === false && d.reason).toBe('disabled-for-run');
  });
});

describe('the two refusals are never interchangeable', () => {
  it('gives them different statuses, and neither is budget_exceeded', () => {
    // `budget_exceeded` is a THIRD thing: permission was granted and the money ran out. Three
    // outcomes, three names — collapsing any two of them loses the only information that tells
    // somebody what to do next.
    const off = mayBuyDocuments({ ...ON, allowPaidDocuments: false });
    const noCreds = mayBuyDocuments({ ...ON, hasVendorCredentials: false });
    expect(skipStatusFor(off)).toBe('paid_disabled');
    expect(skipStatusFor(noCreds)).toBe('no_vendor_credentials');
    expect(skipStatusFor(off)).not.toBe(skipStatusFor(noCreds));
    expect(skipStatusFor(mayBuyDocuments(ON))).toBeNull();
  });

  it('says re-running WILL help for a choice, and will NOT for missing credentials', () => {
    // The practical difference. One is "flip the switch and go again"; the other is "going again
    // changes nothing until somebody sets a credential".
    const off = mayBuyDocuments({ ...ON, allowPaidDocuments: false });
    const noCreds = mayBuyDocuments({ ...ON, hasVendorCredentials: false });
    expect(off.allowed === false && off.reasonForReader).toMatch(/re-run with paid documents enabled/i);
    expect(noCreds.allowed === false && noCreds.reasonForReader).toMatch(/re-running will not/i);
  });

  it('never describes a deliberate choice as a gap in the record', () => {
    // The whole point. A reader must not close the report believing the county has no deed.
    const off = mayBuyDocuments({ ...ON, allowPaidDocuments: false });
    expect(off.allowed === false && off.reasonForReader).toMatch(/setting, not a gap in the record/i);
  });
});

describe('paidDocumentsNotice', () => {
  it('says nothing when buying was allowed', () => {
    expect(paidDocumentsNotice(mayBuyDocuments(ON), 5)).toBeNull();
  });

  it('says nothing when nothing was actually skipped', () => {
    // Disabled but no paywall reached — a Bell County run, where everything is free. Announcing a
    // restriction that changed no outcome is noise, and noise is what makes real notices unread.
    const off = mayBuyDocuments({ ...ON, allowPaidDocuments: false });
    expect(paidDocumentsNotice(off, 0)).toBeNull();
  });

  it('states HOW MANY were skipped, because that decides whether to re-run', () => {
    const off = mayBuyDocuments({ ...ON, allowPaidDocuments: false });
    expect(paidDocumentsNotice(off, 1)).toMatch(/^1 document behind a paywall was not retrieved\./);
    expect(paidDocumentsNotice(off, 3)).toMatch(/^3 documents behind a paywall were not retrieved\./);
  });

  it('carries the reason into the notice, not just the count', () => {
    const noCreds = mayBuyDocuments({ ...ON, hasVendorCredentials: false });
    const notice = paidDocumentsNotice(noCreds, 2)!;
    expect(notice).toContain('2 documents');
    expect(notice).toMatch(/configuration problem/i);
  });
});
