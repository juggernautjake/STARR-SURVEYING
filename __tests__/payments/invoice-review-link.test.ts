/**
 * Owner, 2026-11-10: "In the invoice, can you include a link to the review page so they can review us
 * on google?" The firm's Google review link (organizations.google_review_url, seeds/682) appears on
 * the invoice and the payment receipt — and not at all for a firm that has not set one.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildInvoiceEmailHtml, buildInvoiceEmailText, buildReceiptResendHtml, buildReceiptResendText,
} from '@/lib/payments/invoice-email';
import { profileFromRow } from '@/lib/saas/tenant-profile-shape';

const REVIEW = 'https://search.google.com/local/writereview?placeid=ChIJV77ibdAVRYYRYCVt8suXPQE';
const firm = { name: 'Starr Surveying', phone: '(833) 842-6971', phoneE164: '+18338426971', reviewUrl: REVIEW };
const noReview = { ...firm, reviewUrl: null };

const invoice = (f: typeof firm | typeof noReview) => ({
  firm: f, invoice_number: 'SS-1', customer_name: 'Pat', pay_link: 'https://x/pay/s',
  line_items: [{ description: 'Boundary survey', total_cents: 100000 }], subtotal_cents: 100000, tax_cents: 0,
  total_cents: 100000, due_at: null, notes: null,
});
const receipt = (f: typeof firm | typeof noReview) => ({
  firm: f, invoice_number: 'SS-1', customer_name: 'Pat', total_cents: 100000, paid_cents: 100000, payments: [], pay_link: 'https://x/pay/s',
});

describe('the Google review link', () => {
  it('is on the invoice email, HTML and text', () => {
    expect(buildInvoiceEmailHtml(invoice(firm))).toContain(`href="${REVIEW.replace(/&/g, '&amp;')}"`);
    expect(buildInvoiceEmailHtml(invoice(firm))).toContain('Leave us a review on Google');
    expect(buildInvoiceEmailText(invoice(firm))).toContain(`Leave us a Google review: ${REVIEW}`);
  });

  it('is on the payment receipt, HTML and text', () => {
    expect(buildReceiptResendHtml(receipt(firm))).toContain('data-testid="review-link"');
    expect(buildReceiptResendText(receipt(firm))).toContain(REVIEW);
  });

  it('is left out for a firm with no review link — no empty box, no dead link', () => {
    expect(buildInvoiceEmailHtml(invoice(noReview))).not.toContain('review-link');
    expect(buildInvoiceEmailText(invoice(noReview))).not.toContain('Google review');
    expect(buildReceiptResendHtml(receipt(noReview))).not.toContain('review-link');
  });

  it('comes from the firm row, https only', () => {
    const base = { id: 'o', name: 'F', state: null, phone: null, logo_url: null, brand_color: null, domain_restriction: null, primary_admin_email: null, billing_contact_email: null, address_line1: null, address_line2: null, website: null };
    expect(profileFromRow({ ...base, google_review_url: REVIEW } as never).reviewUrl).toBe(REVIEW);
    expect(profileFromRow({ ...base, google_review_url: 'javascript:alert(1)' } as never).reviewUrl).toBeNull();
    expect(profileFromRow(base as never).reviewUrl).toBeNull();
  });

  it('is loaded with the firm and set for Starr Surveying by the seed', () => {
    expect(fs.readFileSync(path.join(process.cwd(), 'lib/payments/firm.ts'), 'utf8')).toContain('reviewUrl: profile.reviewUrl');
    expect(fs.readFileSync(path.join(process.cwd(), 'seeds/682_org_google_review_url.sql'), 'utf8')).toContain(REVIEW);
  });
});
