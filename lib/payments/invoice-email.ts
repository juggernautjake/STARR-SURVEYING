// lib/payments/invoice-email.ts
//
// P3b of payment-infrastructure-2026-06-18.md — pure builder for the
// customer-facing "your invoice is ready" email. Dark navy header, red
// CTA, line-item table, payment link.
//
// HTML is built by hand (no JSX) so the helper stays a pure string
// function — easy to source-lock in vitest.
//
// ── THE FIRM IS AN INPUT, NOT A CONSTANT (audit §3c.3, item 8h) ──────────────
//
// These builders named one firm fourteen times: in the subject line, in the
// sign-off, on the "make checks payable to" line, and inside a tel: link. That
// is the most expensive place for a hard-code to survive — an email is the
// artefact that leaves the building, and a second firm's customer receiving an
// invoice signed by a competitor is not a bug anyone gets to fix quietly.
//
// So `firm` is REQUIRED on every input. Not optional-with-a-default: an
// optional field would compile at every existing call site and keep sending the
// old name, which is exactly the failure this is meant to make impossible.
// Required means the compiler names every place that has to decide.

import { formatDollars } from './live';

/** The sending firm's identity, as these templates need it. A narrow subset of
 *  `TenantProfile` (lib/saas/tenant-profile-shape.ts) rather than the whole
 *  thing, so the builders stay pure and a test can construct one in a line. */
export interface FirmIdentity {
  /** Display name — the sign-off, the subject line, the cheque payee. */
  name: string;
  /** As a human reads it. Null when the firm has not set one, in which case the
   *  "call us" line is omitted rather than rendered with an empty number. */
  phone: string | null;
  /** As a `tel:` link wants it. Null for the same reason — a tel: href with no
   *  digits is a button that does nothing when a customer taps it. */
  phoneE164: string | null;
}

export interface InvoiceEmailInput {
  firm: FirmIdentity;
  invoice_number: string;
  customer_name: string | null;
  pay_link: string;
  line_items: ReadonlyArray<{ description: string; total_cents: number }>;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  due_at: string | null;
  notes: string | null;
}

const SAFE_TAG_RE = /[&<>"]/g;
const SAFE_TAG_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
function escape(s: string): string {
  return String(s).replace(SAFE_TAG_RE, (c) => SAFE_TAG_MAP[c] ?? c);
}

/** The "Questions? Call us at …" line, HTML. Omitted entirely when the firm has
 *  no phone number: half a tel: link looks like a broken email. */
function callUsHtml(firm: FirmIdentity, suffix = '.'): string {
  if (!firm.phone || !firm.phoneE164) return '';
  return `Questions? Call us at <a href="tel:${escape(firm.phoneE164)}" style="color:#BD1218;font-weight:700;">${escape(firm.phone)}</a>${suffix}`;
}

/** Same, plain text. Returns null so callers drop the line rather than push a blank. */
function callUsText(firm: FirmIdentity): string | null {
  return firm.phone ? `Questions? Call ${firm.phone}.` : null;
}


/** Pure helper — subject line. The invoice number is the customer's
 *  canonical reference. */
export function buildInvoiceEmailSubject(input: { invoice_number: string; firm: FirmIdentity }): string {
  return `Invoice ${input.invoice_number} from ${input.firm.name}`;
}

/** Pure helper — HTML body. */
export function buildInvoiceEmailHtml(input: InvoiceEmailInput): string {
  const greeting = input.customer_name
    ? `Hello ${escape(input.customer_name)},`
    : 'Hello,';
  const dueLine = input.due_at
    ? `<p style="margin:0 0 16px;color:#4a5470;">Due by <strong>${escape(new Date(input.due_at).toLocaleDateString())}</strong>.</p>`
    : '';
  const itemRows = input.line_items
    .map((item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e7ee;">${escape(item.description)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e7ee;text-align:right;white-space:nowrap;">${escape(formatDollars(item.total_cents))}</td>
      </tr>`)
    .join('');
  const taxRow = input.tax_cents > 0
    ? `<tr>
         <td style="padding:6px 12px;color:#4a5470;">Tax</td>
         <td style="padding:6px 12px;text-align:right;">${escape(formatDollars(input.tax_cents))}</td>
       </tr>`
    : '';
  const notesBlock = input.notes
    ? `<p style="margin:24px 0 0;padding:14px 18px;background:#f8f9fa;border-left:4px solid #1D3095;border-radius:6px;color:#152050;">${escape(input.notes)}</p>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Invoice ${escape(input.invoice_number)}</title></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:Inter,Arial,sans-serif;color:#152050;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #e4e7ee;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1D3095 0%,#152050 60%,#BD1218 100%);padding:32px 28px;color:#ffffff;">
              <div style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.85;">Invoice</div>
              <div style="font-family:'Sora','Inter',sans-serif;font-size:24px;font-weight:700;margin-top:6px;">${escape(input.invoice_number)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:16px;">${greeting}</p>
              <p style="margin:0 0 16px;color:#4a5470;line-height:1.55;">Thank you for choosing ${escape(input.firm.name)}. Your invoice is ready below. You can pay online by clicking the button at the bottom of this email.</p>
              ${dueLine}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
                <thead>
                  <tr>
                    <th style="text-align:left;padding:8px 12px;background:#f8f9fa;color:#152050;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">Item</th>
                    <th style="text-align:right;padding:8px 12px;background:#f8f9fa;color:#152050;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
                <tfoot>
                  <tr>
                    <td style="padding:8px 12px;color:#4a5470;">Subtotal</td>
                    <td style="padding:8px 12px;text-align:right;">${escape(formatDollars(input.subtotal_cents))}</td>
                  </tr>
                  ${taxRow}
                  <tr>
                    <td style="padding:12px;font-family:'Sora','Inter',sans-serif;font-weight:700;color:#152050;border-top:2px solid #152050;">Total due</td>
                    <td style="padding:12px;text-align:right;font-family:'Sora','Inter',sans-serif;font-weight:700;color:#BD1218;border-top:2px solid #152050;">${escape(formatDollars(input.total_cents))}</td>
                  </tr>
                </tfoot>
              </table>

              <div style="text-align:center;margin:32px 0 8px;">
                <a href="${escape(input.pay_link)}" data-testid="pay-link" style="display:inline-block;background:#BD1218;color:#ffffff;text-decoration:none;font-weight:700;font-family:'Sora','Inter',sans-serif;padding:14px 28px;border-radius:10px;font-size:16px;">Pay this invoice online</a>
              </div>
              <p style="margin:0;text-align:center;color:#6b7280;font-size:13px;">Or paste this link into your browser:<br /><a href="${escape(input.pay_link)}" style="color:#1D3095;word-break:break-all;">${escape(input.pay_link)}</a></p>

              ${notesBlock}

              <p style="margin:32px 0 0;color:#4a5470;font-size:14px;line-height:1.55;">
                ${callUsHtml(input.firm, ' or reply to this email.')}
              </p>
              <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">— ${escape(input.firm.name)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;
}

/** P7 of payment-infrastructure-2026-06-18.md — cash / check pledge
 *  confirmation. After a customer pledges to pay offline, we send
 *  them this so they have the company mailing address + a reminder
 *  that the receipt arrives once the office logs the payment. */
export interface PledgeConfirmationInput {
  firm: FirmIdentity;
  method: 'cash' | 'check';
  invoice_number: string;
  customer_name: string | null;
  amount_cents: number;
  office_address_line1: string;
  office_address_line2: string;
  pay_link: string;
  is_mailing: boolean;
}

export function buildPledgeConfirmationSubject(input: { method: 'cash' | 'check'; invoice_number: string }): string {
  const label = input.method === 'check' ? 'Check' : 'Cash';
  return `${label} payment confirmed — Invoice ${input.invoice_number}`;
}

export function buildPledgeConfirmationHtml(input: PledgeConfirmationInput): string {
  const greeting = input.customer_name ? `Hello ${escape(input.customer_name)},` : 'Hello,';
  const methodLabel = input.method === 'check' ? 'check' : 'cash';
  const deliveryLabel = input.is_mailing ? 'by mail' : 'in person';
  const checkPayee = input.method === 'check'
    ? `<p style="margin:0 0 12px;"><strong>Make checks payable to:</strong> ${escape(input.firm.name)}</p>`
    : '';
  const mailingBlock = input.is_mailing
    ? `<p style="margin:0 0 16px;color:#4a5470;line-height:1.55;">Mail your ${methodLabel} to the address above. We'll send your receipt the moment it arrives.</p>`
    // "ask for Hank" named one individual at one firm — the same class of
    // hard-code as the firm name, and it does not even survive that person
    // changing desks.
    : `<p style="margin:0 0 16px;color:#4a5470;line-height:1.55;">When you stop by, ask for anyone at the front desk. We'll send your receipt the moment we log the payment.</p>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Payment confirmed</title></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:Inter,Arial,sans-serif;color:#152050;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #e4e7ee;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1D3095 0%,#152050 60%,#BD1218 100%);padding:32px 28px;color:#ffffff;">
              <div style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.85;">Payment confirmed</div>
              <div style="font-family:'Sora','Inter',sans-serif;font-size:22px;font-weight:700;margin-top:6px;">Invoice ${escape(input.invoice_number)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:16px;">${greeting}</p>
              <p style="margin:0 0 16px;color:#4a5470;line-height:1.55;">
                Thanks for letting us know you're paying <strong>${escape(formatDollars(input.amount_cents))}</strong> in ${escape(methodLabel)} ${escape(deliveryLabel)}.
              </p>
              ${checkPayee}
              <div style="background:#f4f5f9;border:1px solid #e4e7ee;border-radius:10px;padding:16px 18px;margin:0 0 16px;">
                <div style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;">${escape(input.firm.name)}</div>
                <div style="font-family:'Sora','Inter',sans-serif;font-size:15px;font-weight:700;">${escape(input.office_address_line1)}</div>
                <div style="font-size:15px;color:#4a5470;">${escape(input.office_address_line2)}</div>
              </div>
              ${mailingBlock}
              <p style="margin:0 0 16px;color:#4a5470;line-height:1.55;">
                Want to check your balance any time? Use this link to come back to your invoice:
              </p>
              <div style="text-align:center;margin:8px 0 24px;">
                <a href="${escape(input.pay_link)}" data-testid="pledge-link" style="display:inline-block;background:#1D3095;color:#ffffff;text-decoration:none;font-weight:700;font-family:'Sora','Inter',sans-serif;padding:12px 22px;border-radius:10px;font-size:15px;">View your invoice</a>
              </div>
              <p style="margin:0;color:#4a5470;font-size:14px;line-height:1.55;">
                ${callUsHtml(input.firm)}
              </p>
              <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">— ${escape(input.firm.name)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;
}

export function buildPledgeConfirmationText(input: PledgeConfirmationInput): string {
  const lines: string[] = [
    `Payment confirmed — Invoice ${input.invoice_number}`,
    '',
    input.customer_name ? `Hello ${input.customer_name},` : 'Hello,',
    '',
    `Thanks for letting us know you're paying ${formatDollars(input.amount_cents)} in ${input.method} ${input.is_mailing ? 'by mail' : 'in person'}.`,
  ];
  if (input.method === 'check') lines.push('', `Make checks payable to: ${input.firm.name}`);
  lines.push(
    '',
    input.firm.name,
    input.office_address_line1,
    input.office_address_line2,
    '',
    input.is_mailing
      ? `Mail your ${input.method} to the address above. We'll send your receipt the moment it arrives.`
      : `When you stop by, ask for anyone at the front desk. We'll send your receipt the moment we log the payment.`,
    '',
    `View your invoice any time: ${input.pay_link}`,
    '',
    ...(callUsText(input.firm) ? [callUsText(input.firm) as string] : []),
    `— ${input.firm.name}`,
  );
  return lines.join('\n');
}

/** P8 of payment-infrastructure-2026-06-18.md — re-send the
 *  customer's receipt by email. Used by the "Email me a receipt"
 *  button on the return-to-portal paid-card. PDF attachment ships
 *  in P9; this slice keeps the email body itself self-contained. */
export interface ReceiptResendInput {
  firm: FirmIdentity;
  invoice_number: string;
  customer_name: string | null;
  total_cents: number;
  paid_cents: number;
  payments: ReadonlyArray<{
    amount_cents: number;
    method_label: string;
    cleared_at: string | null;
    external_id_tail: string | null;
  }>;
  pay_link: string;
}

export function buildReceiptResendSubject(input: { invoice_number: string }): string {
  return `Receipt — Invoice ${input.invoice_number}`;
}

function fmtClearedDate(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
}

export function buildReceiptResendHtml(input: ReceiptResendInput): string {
  const greeting = input.customer_name ? `Hello ${escape(input.customer_name)},` : 'Hello,';
  const rows = input.payments
    .map((p) => {
      const date = fmtClearedDate(p.cleared_at);
      const ref = p.external_id_tail ? ` <span style="color:#6b7280;">(ending ${escape(p.external_id_tail)})</span>` : '';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e7ee;">${escape(p.method_label)}${ref}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e7ee;color:#6b7280;white-space:nowrap;">${escape(date)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e7ee;text-align:right;white-space:nowrap;">${escape(formatDollars(p.amount_cents))}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Receipt — Invoice ${escape(input.invoice_number)}</title></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:Inter,Arial,sans-serif;color:#152050;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #e4e7ee;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#1f6d3c 0%,#152050 70%,#BD1218 100%);padding:32px 28px;color:#ffffff;">
            <div style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.85;">Receipt</div>
            <div style="font-family:'Sora','Inter',sans-serif;font-size:22px;font-weight:700;margin-top:6px;">Invoice ${escape(input.invoice_number)}</div>
            <div style="margin-top:8px;font-size:14px;opacity:0.9;">Paid ${escape(formatDollars(input.paid_cents))} of ${escape(formatDollars(input.total_cents))}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <p style="margin:0 0 16px;font-size:16px;">${greeting}</p>
            <p style="margin:0 0 16px;color:#4a5470;line-height:1.55;">Here's your receipt for invoice ${escape(input.invoice_number)}.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:8px 12px;background:#f8f9fa;color:#152050;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">Method</th>
                  <th style="text-align:left;padding:8px 12px;background:#f8f9fa;color:#152050;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">Date</th>
                  <th style="text-align:right;padding:8px 12px;background:#f8f9fa;color:#152050;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">Amount</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>

            <div style="text-align:center;margin:28px 0 8px;">
              <a href="${escape(input.pay_link)}" data-testid="receipt-link" style="display:inline-block;background:#1D3095;color:#ffffff;text-decoration:none;font-weight:700;font-family:'Sora','Inter',sans-serif;padding:12px 22px;border-radius:10px;font-size:15px;">View your invoice</a>
            </div>

            <p style="margin:24px 0 0;color:#4a5470;font-size:14px;line-height:1.55;">
              ${callUsHtml(input.firm)}
            </p>
            <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">— ${escape(input.firm.name)}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function buildReceiptResendText(input: ReceiptResendInput): string {
  const lines: string[] = [
    `Receipt — Invoice ${input.invoice_number}`,
    '',
    input.customer_name ? `Hello ${input.customer_name},` : 'Hello,',
    '',
    `Paid ${formatDollars(input.paid_cents)} of ${formatDollars(input.total_cents)}.`,
    '',
    'Payments:',
    ...input.payments.map((p) => {
      const date = fmtClearedDate(p.cleared_at);
      const ref = p.external_id_tail ? ` (ending ${p.external_id_tail})` : '';
      return `  - ${p.method_label}${ref}  ${date}  ${formatDollars(p.amount_cents)}`;
    }),
    '',
    `View your invoice: ${input.pay_link}`,
    '',
    ...(callUsText(input.firm) ? [callUsText(input.firm) as string] : []),
    `— ${input.firm.name}`,
  ];
  return lines.join('\n');
}

/** Pure helper — plain-text fallback for the email client that
 *  doesn't render HTML. */
export function buildInvoiceEmailText(input: InvoiceEmailInput): string {
  const lines: string[] = [
    `Invoice ${input.invoice_number} — ${input.firm.name}`,
    '',
    input.customer_name ? `Hello ${input.customer_name},` : 'Hello,',
    '',
    'Your invoice is ready. You can pay online at:',
    input.pay_link,
    '',
    'Line items:',
    ...input.line_items.map((i) => `  - ${i.description}  ${formatDollars(i.total_cents)}`),
    '',
    `Subtotal: ${formatDollars(input.subtotal_cents)}`,
  ];
  if (input.tax_cents > 0) lines.push(`Tax:      ${formatDollars(input.tax_cents)}`);
  lines.push(`Total:    ${formatDollars(input.total_cents)}`);
  if (input.due_at) lines.push('', `Due by ${new Date(input.due_at).toLocaleDateString()}`);
  if (input.notes) lines.push('', input.notes);
  const call = callUsText(input.firm);
  lines.push('', ...(call ? [call] : []), `— ${input.firm.name}`);
  return lines.join('\n');
}
