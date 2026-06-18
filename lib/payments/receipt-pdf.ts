// lib/payments/receipt-pdf.ts
//
// P9 of payment-infrastructure-2026-06-18.md — server-side receipt
// PDF generator. Split into two pieces so vitest can test the data
// model without spinning up pdfkit:
//
//   buildReceiptModel({ invoice, payments }) — pure. Returns the
//     printable rows + totals + header strings the PDF renderer
//     consumes. Pure helper makes the layout testable in isolation.
//
//   renderReceiptPdf(model) — calls into pdfkit and returns a
//     `Promise<Buffer>` containing the PDF bytes. Wrapped here so
//     the route file stays tiny.
//
// The renderer uses the brand palette: navy → red gradient header
// strip, Sora-ish display, Inter-ish body. PDF uses pdfkit's built-
// in Helvetica family so we don't ship custom font bytes.

import PDFDocument from 'pdfkit';
import { formatDollars } from './live';

export interface ReceiptModelInput {
  invoice_number: string;
  customer_name: string | null;
  customer_email: string | null;
  total_cents: number;
  paid_cents: number;
  payments: ReadonlyArray<{
    amount_cents: number;
    method_label: string;
    cleared_at: string | null;
    external_id_tail: string | null;
  }>;
  generated_at?: Date;
  office_address_line1: string;
  office_address_line2: string;
  office_phone: string;
  pay_link: string;
}

export interface ReceiptModel {
  invoice_number: string;
  greeting: string;
  paid_summary: string;
  payment_rows: ReadonlyArray<{ method: string; date: string; ref: string; amount: string }>;
  total_label: string;
  paid_label: string;
  office_lines: ReadonlyArray<string>;
  generated_at_label: string;
  return_to_portal_text: string;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
}

/** Pure helper — turn the receipt data into the rows + labels the
 *  PDF renderer prints. No pdfkit dependency here. */
export function buildReceiptModel(input: ReceiptModelInput): ReceiptModel {
  const generated = input.generated_at ?? new Date();
  const greeting = input.customer_name ? `Receipt for ${input.customer_name}` : 'Receipt';
  return {
    invoice_number: input.invoice_number,
    greeting,
    paid_summary: `Paid ${formatDollars(input.paid_cents)} of ${formatDollars(input.total_cents)}`,
    payment_rows: input.payments.map((p) => ({
      method: p.external_id_tail ? `${p.method_label} (ending ${p.external_id_tail})` : p.method_label,
      date: fmtDate(p.cleared_at),
      ref: p.external_id_tail ?? '',
      amount: formatDollars(p.amount_cents),
    })),
    total_label: `Total: ${formatDollars(input.total_cents)}`,
    paid_label: `Paid: ${formatDollars(input.paid_cents)}`,
    office_lines: [
      'Starr Surveying',
      input.office_address_line1,
      input.office_address_line2,
      input.office_phone,
    ],
    generated_at_label: `Generated ${generated.toLocaleDateString()}`,
    return_to_portal_text: `View your invoice anytime: ${input.pay_link}`,
  };
}

/** PDF renderer — drives pdfkit. Returns the bytes ready for the
 *  HTTP response. Not pure (talks to pdfkit) but every piece of
 *  layout data lands here from `buildReceiptModel` so the inputs
 *  are exercisable in vitest. */
export async function renderReceiptPdf(model: ReceiptModel): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 50,
    info: {
      Title: `Receipt — Invoice ${model.invoice_number}`,
      Author: 'Starr Surveying',
      Subject: `Receipt for invoice ${model.invoice_number}`,
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Header strip
  doc.rect(0, 0, doc.page.width, 90).fill('#152050');
  doc.fillColor('#ffffff').fontSize(11).font('Helvetica');
  doc.text('STARR SURVEYING', 50, 28);
  doc.fontSize(20).font('Helvetica-Bold');
  doc.text('Payment receipt', 50, 44);
  doc.fontSize(11).font('Helvetica');
  doc.text(model.invoice_number, 50, 70);

  // Body
  doc.fillColor('#152050');
  let y = 120;
  doc.fontSize(14).font('Helvetica-Bold').text(model.greeting, 50, y);
  y += 22;
  doc.fontSize(11).font('Helvetica').fillColor('#4a5470').text(model.paid_summary, 50, y);
  y += 32;

  // Payment table
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#152050');
  doc.text('Method', 50, y);
  doc.text('Date', 280, y);
  doc.text('Amount', 460, y, { width: 100, align: 'right' });
  y += 6;
  doc.moveTo(50, y + 8).lineTo(560, y + 8).strokeColor('#152050').lineWidth(1).stroke();
  y += 14;
  doc.font('Helvetica').fillColor('#152050');
  for (const row of model.payment_rows) {
    doc.text(row.method, 50, y, { width: 220 });
    doc.fillColor('#6b7280').text(row.date, 280, y);
    doc.fillColor('#152050').text(row.amount, 460, y, { width: 100, align: 'right' });
    y += 22;
  }

  y += 6;
  doc.moveTo(50, y).lineTo(560, y).strokeColor('#e4e7ee').lineWidth(1).stroke();
  y += 14;
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#152050');
  doc.text(model.total_label, 50, y);
  y += 18;
  doc.fillColor('#1f6d3c').text(model.paid_label, 50, y);
  y += 36;

  // Office footer
  doc.fontSize(10).font('Helvetica').fillColor('#4a5470');
  for (const line of model.office_lines) {
    doc.text(line, 50, y);
    y += 14;
  }
  y += 8;
  doc.fillColor('#6b7280').fontSize(9);
  doc.text(model.generated_at_label, 50, y);
  y += 12;
  doc.text(model.return_to_portal_text, 50, y, { width: 510 });

  doc.end();
  return done;
}
