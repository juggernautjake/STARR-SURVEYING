// lib/checks/layout.ts — where everything goes on a letter-size "check on top, two stubs" sheet.
//
// Plan: docs/planning/pending/CHECK_PRINTING_2026-10-11.md §2–§3. Two kinds of stock:
//   * 'preprinted' — the bank details, check number and MICR line are already printed by the check
//     supplier; only the payee, date, amounts, memo and stubs are printed here.
//   * 'blank_micr' — blank security stock; everything is printed, including the MICR line, which
//     needs a MICR (magnetic) toner cartridge AND an E-13B font file (public/fonts/micr-e13b.ttf —
//     licensed fonts vary, so the firm supplies it; without it the renderer refuses blank stock rather
//     than print a check a bank machine cannot read).
//
// Output is a list of positioned text and lines in PDF points (72 per inch, origin top-left), so the
// geometry is testable without drawing anything. Per-printer nudges (`offset_x_mm`, `offset_y_mm`) are
// applied to everything, because every printer feeds paper a little differently.
//
// Pure.

import { amountFigures, amountInWords } from './words';

export const PAGE = { width: 612, height: 792 } as const; // US Letter
export const CHECK_HEIGHT = 252; // 3.5 in — the top third on voucher stock
const MM = 72 / 25.4;

export interface CheckStubLine { label: string; amount_cents: number; kind?: 'earn' | 'deduct' | 'total' }

export interface CheckDoc {
  check_number: number;
  issue_date: string; // YYYY-MM-DD
  payee_name: string;
  payee_email?: string | null;
  amount_cents: number;
  memo: string;
  stub_lines: CheckStubLine[];
  period_label: string;
  void_after_days?: number;
}

export interface CheckBank {
  stock: 'preprinted' | 'blank_micr';
  payer_name: string;
  payer_address?: string;
  bank_name?: string;
  bank_address?: string;
  routing?: string;
  /** Full account number — only needed for blank stock (MICR line). Decrypted by the caller. */
  account?: string;
  signature_lines?: 1 | 2;
  offset_x_mm?: number;
  offset_y_mm?: number;
}

export type DrawOp =
  | { t: 'text'; x: number; y: number; text: string; size: number; font: 'regular' | 'bold' | 'micr'; align?: 'left' | 'right'; width?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; dash?: boolean };

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };

/** The MICR line in GnuMICR-style glyph mapping: C = on-us ⑈, A = transit ⑆. "C001047C A123456789A 12345678C". */
export function micrLine(checkNumber: number, routing: string, account: string): string {
  if (!/^\d{9}$/.test(routing)) throw new Error('Routing number must be 9 digits for the MICR line.');
  const acct = account.replace(/[^\d]/g, '');
  if (acct.length < 4 || acct.length > 17) throw new Error('Account number must be 4–17 digits for the MICR line.');
  return `C${String(checkNumber).padStart(6, '0')}C A${routing}A ${acct}C`;
}

function stub(doc: CheckDoc, bank: CheckBank, top: number, copy: string): DrawOp[] {
  const ops: DrawOp[] = [];
  const L = 40, R = PAGE.width - 40;
  ops.push({ t: 'line', x1: L, y1: top + 8, x2: R, y2: top + 8, dash: true });
  ops.push({ t: 'text', x: L, y: top + 20, text: bank.payer_name, size: 10, font: 'bold' });
  ops.push({ t: 'text', x: R, y: top + 20, text: `Check #${doc.check_number}  ·  ${usDate(doc.issue_date)}  ·  ${copy}`, size: 9, font: 'regular', align: 'right', width: 300 });
  ops.push({ t: 'text', x: L, y: top + 36, text: `Pay to: ${doc.payee_name}${doc.payee_email ? `  (${doc.payee_email})` : ''}`, size: 10, font: 'regular' });
  ops.push({ t: 'text', x: L, y: top + 50, text: doc.period_label, size: 9, font: 'regular' });
  let y = top + 72;
  ops.push({ t: 'text', x: L, y, text: 'Description', size: 9, font: 'bold' });
  ops.push({ t: 'text', x: R, y, text: 'Amount', size: 9, font: 'bold', align: 'right', width: 120 });
  y += 4;
  ops.push({ t: 'line', x1: L, y1: y + 6, x2: R, y2: y + 6 });
  y += 18;
  for (const line of doc.stub_lines.slice(0, 9)) {
    const v = line.kind === 'deduct' ? `-${money(Math.abs(line.amount_cents))}` : money(line.amount_cents);
    ops.push({ t: 'text', x: L, y, text: line.label, size: 9, font: line.kind === 'total' ? 'bold' : 'regular' });
    ops.push({ t: 'text', x: R, y, text: v, size: 9, font: line.kind === 'total' ? 'bold' : 'regular', align: 'right', width: 120 });
    y += 15;
  }
  return ops;
}

/** Every draw operation for one sheet: the check on top, then an employee stub and an office stub. */
export function layoutCheck(doc: CheckDoc, bank: CheckBank): DrawOp[] {
  if (!Number.isInteger(doc.amount_cents) || doc.amount_cents <= 0) throw new Error('A check must be for a positive amount.');
  const ops: DrawOp[] = [];
  const blank = bank.stock === 'blank_micr';
  const L = 36, R = PAGE.width - 36;

  if (blank) {
    ops.push({ t: 'text', x: L, y: 30, text: bank.payer_name, size: 11, font: 'bold' });
    if (bank.payer_address) ops.push({ t: 'text', x: L, y: 44, text: bank.payer_address, size: 8, font: 'regular' });
    if (bank.bank_name) ops.push({ t: 'text', x: 300, y: 30, text: bank.bank_name, size: 9, font: 'bold' });
    if (bank.bank_address) ops.push({ t: 'text', x: 300, y: 42, text: bank.bank_address, size: 7, font: 'regular' });
    ops.push({ t: 'text', x: R, y: 30, text: String(doc.check_number), size: 12, font: 'bold', align: 'right', width: 100 });
    ops.push({ t: 'text', x: 400, y: 80, text: 'DATE', size: 7, font: 'regular' });
    ops.push({ t: 'text', x: L, y: 112, text: 'PAY TO THE ORDER OF', size: 7, font: 'regular' });
    ops.push({ t: 'line', x1: 120, y1: 116, x2: 440, y2: 116 });
    ops.push({ t: 'line', x1: L, y1: 146, x2: 440, y2: 146 });
    ops.push({ t: 'text', x: 444, y: 146, text: 'DOLLARS', size: 7, font: 'regular' });
    ops.push({ t: 'text', x: L, y: 196, text: 'MEMO', size: 7, font: 'regular' });
    const sigs = bank.signature_lines ?? 1;
    for (let i = 0; i < sigs; i++) {
      const y = 196 - i * 22;
      ops.push({ t: 'line', x1: 360, y1: y, x2: R, y2: y });
    }
    ops.push({ t: 'text', x: R, y: 206, text: 'AUTHORIZED SIGNATURE', size: 6, font: 'regular', align: 'right', width: 200 });
    if (!bank.routing || !bank.account) throw new Error('Blank check stock needs the bank routing and account number.');
    // MICR clear band: the bottom 5/8 in of the check; the line sits ~3/16 in above the check's edge.
    ops.push({ t: 'text', x: 90, y: CHECK_HEIGHT - 14, text: micrLine(doc.check_number, bank.routing, bank.account), size: 12, font: 'micr' });
  }

  // The fields — same place on both stocks (standard top-voucher positions).
  ops.push({ t: 'text', x: 440, y: 80, text: usDate(doc.issue_date), size: 11, font: 'regular' });
  ops.push({ t: 'text', x: 128, y: 112, text: doc.payee_name, size: 11, font: 'bold' });
  ops.push({ t: 'text', x: R, y: 112, text: amountFigures(doc.amount_cents), size: 11, font: 'bold', align: 'right', width: 120 });
  const words = amountInWords(doc.amount_cents);
  ops.push({ t: 'text', x: L + 4, y: 142, text: `${words} ${'*'.repeat(Math.max(0, 70 - words.length))}`.slice(0, 92), size: 10, font: 'regular' });
  ops.push({ t: 'text', x: L + 32, y: 196, text: doc.memo.slice(0, 48), size: 9, font: 'regular' });
  if (doc.void_after_days) ops.push({ t: 'text', x: R, y: 62, text: `VOID AFTER ${doc.void_after_days} DAYS`, size: 6, font: 'regular', align: 'right', width: 200 });

  ops.push(...stub(doc, bank, CHECK_HEIGHT + 4, 'Employee copy'));
  ops.push(...stub(doc, bank, CHECK_HEIGHT * 2 + 18, 'Office copy'));

  const dx = (bank.offset_x_mm ?? 0) * MM, dy = (bank.offset_y_mm ?? 0) * MM;
  if (!dx && !dy) return ops;
  return ops.map((o) => (o.t === 'text' ? { ...o, x: o.x + dx, y: o.y + dy } : { ...o, x1: o.x1 + dx, x2: o.x2 + dx, y1: o.y1 + dy, y2: o.y2 + dy }));
}

/** The stub lines for a payout line: earnings, what was withheld, and what the check is for. */
export function stubLinesFor(item: {
  hours_cents?: number | null; bonuses_cents?: number | null; reimbursements_cents?: number | null; adjustments_cents?: number | null;
  total_cents: number; recovered_cents?: number | null; fee_cents?: number | null; fee_note?: string | null;
}, netCents: number): CheckStubLine[] {
  const lines: CheckStubLine[] = [];
  const add = (label: string, v: number | null | undefined, kind: CheckStubLine['kind'] = 'earn') => { if (v) lines.push({ label, amount_cents: v, kind }); };
  add('Approved hours', item.hours_cents);
  add('Bonuses', item.bonuses_cents);
  add('Reimbursements', item.reimbursements_cents);
  add('Adjustments', item.adjustments_cents);
  if (lines.length === 0) add('Pay', item.total_cents);
  add('Pay advance repayment', item.recovered_cents, 'deduct');
  add(item.fee_note ? item.fee_note.replace(/\s—.*$/, '') : 'Payment method fee', item.fee_cents, 'deduct');
  lines.push({ label: 'Amount of this check', amount_cents: netCents, kind: 'total' });
  return lines;
}
