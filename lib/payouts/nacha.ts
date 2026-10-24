// lib/payouts/nacha.ts — the bank file that pays every direct-deposit employee in one upload.
//
// A NACHA file is how a business tells its bank "credit these accounts". The firm's bank (PNC, as the
// ODFI) receives it, and the ACH network pays each employee's bank. Replaces the CSV in dispatch.ts as
// the real artefact once the originator fields are filled in (Payout settings → ACH).
//
// Format: NACHA Operating Rules, PPD credits only (service class 220), one batch. Every record is 94
// characters; the file is padded with all-9 records to a multiple of 10 (the blocking factor).
// Field positions are in the comments of each builder so a reviewer can check them against PNC's spec
// sheet without decoding the code.
//
// Pure. No I/O. Account numbers arrive decrypted from the caller and are never logged here.

export interface NachaOriginator {
  /** Immediate destination: the bank's routing number (PNC gives this; often their ACH processing routing). */
  immediate_destination: string;
  immediate_destination_name: string;
  /** Immediate origin: usually the company's 10-digit ID / EIN as PNC assigns it. */
  immediate_origin: string;
  immediate_origin_name: string;
  /** Company name as it shows on employees' statements (16 chars). */
  company_name: string;
  /** Company identification (10) — PNC assigns; typically "1" + EIN. */
  company_id: string;
  /** The firm's bank routing number; its first 8 digits are the ODFI ID. */
  odfi_routing: string;
  /** Shown on statements (10 chars). */
  entry_description?: string;
}

export interface NachaEntry {
  /** Receiving bank routing number (9 digits). */
  routing: string;
  /** Receiving account number. */
  account: string;
  account_type: 'checking' | 'savings';
  amount_cents: number;
  /** Shown to the employee's bank: their name. */
  name: string;
  /** Our reference: the payout line id or employee id (15 chars). */
  individual_id: string;
}

export interface NachaOptions {
  /** Settlement date (YYYY-MM-DD). */
  effective_date: string;
  /** When the file is created; defaults to now. */
  created_at?: Date;
  /** A–Z, 0–9: distinguishes files created the same day. */
  file_id_modifier?: string;
  batch_number?: number;
}

/** ABA routing-number checksum: 3-7-1 weights, sum divisible by 10. */
export function isValidRouting(r: string): boolean {
  if (!/^\d{9}$/.test(r)) return false;
  const d = r.split('').map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

const alpha = (s: string, n: number) => String(s ?? '').toUpperCase().replace(/[^\x20-\x7E]/g, '').slice(0, n).padEnd(n, ' ');
const num = (v: number | string, n: number) => {
  const s = String(v).replace(/\D/g, '');
  if (s.length > n) throw new Error(`NACHA numeric field overflow: ${s.length} digits into ${n}`);
  return s.padStart(n, '0');
};
const yymmdd = (d: Date) => `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;

/** Problems with the originator settings, in words — empty when it can build a file. */
export function originatorProblems(o: Partial<NachaOriginator> | null | undefined): string[] {
  const out: string[] = [];
  if (!o) return ['ACH settings are empty.'];
  if (!o.odfi_routing || !isValidRouting(o.odfi_routing)) out.push('The firm\'s bank routing number is missing or not a valid routing number.');
  if (!o.immediate_destination || !/^\d{9}$/.test(o.immediate_destination)) out.push('Immediate destination (the bank\'s ACH routing, from PNC) is missing.');
  if (!o.immediate_origin || !/^\d{9,10}$/.test(o.immediate_origin)) out.push('Immediate origin (company ID from PNC, 9–10 digits) is missing.');
  if (!o.company_id || !/^[A-Za-z0-9]{1,10}$/.test(o.company_id)) out.push('Company ID (from PNC, up to 10 characters) is missing.');
  if (!o.company_name?.trim()) out.push('Company name is missing.');
  return out;
}

/** Problems with one entry, in words. */
export function entryProblems(e: NachaEntry): string[] {
  const out: string[] = [];
  if (!isValidRouting(e.routing)) out.push('bank routing number is not valid');
  if (!/^[A-Za-z0-9-]{3,17}$/.test(e.account)) out.push('account number must be 3–17 digits');
  if (!Number.isInteger(e.amount_cents) || e.amount_cents <= 0) out.push('amount must be positive');
  if (e.amount_cents > 9_999_999_999) out.push('amount is too large');
  return out;
}

export interface NachaFile {
  text: string;
  entryCount: number;
  totalCreditCents: number;
  entryHash: number;
}

export function buildNachaFile(o: NachaOriginator, entries: readonly NachaEntry[], opts: NachaOptions): NachaFile {
  const problems = originatorProblems(o);
  if (problems.length) throw new Error(`ACH settings incomplete: ${problems.join(' ')}`);
  if (entries.length === 0) throw new Error('No bank payments to put in the file.');
  for (const e of entries) {
    const p = entryProblems(e);
    if (p.length) throw new Error(`${e.name}: ${p.join(', ')}`);
  }
  const now = opts.created_at ?? new Date();
  const eff = new Date(`${opts.effective_date}T12:00:00Z`);
  if (Number.isNaN(eff.getTime())) throw new Error('Effective date is not a date.');
  const odfi = o.odfi_routing.slice(0, 8);
  const batchNo = opts.batch_number ?? 1;
  const lines: string[] = [];

  // File header — 1|priority 01|destination ␠+9|origin 10|date|time|modifier|094|10|1|dest name 23|origin name 23|ref 8
  lines.push('1' + '01' + (' ' + num(o.immediate_destination, 9)) + num(o.immediate_origin, 10).padStart(10, ' ')
    + yymmdd(now) + hhmm(now) + alpha(opts.file_id_modifier ?? 'A', 1) + '094' + '10' + '1'
    + alpha(o.immediate_destination_name, 23) + alpha(o.immediate_origin_name, 23) + alpha('', 8));

  // Batch header — 5|220|company name 16|discretionary 20|company id 10|PPD|description 10|desc date 6|effective 6|settle 3|1|ODFI 8|batch 7
  lines.push('5' + '220' + alpha(o.company_name, 16) + alpha('', 20) + alpha(o.company_id, 10) + 'PPD'
    + alpha(o.entry_description || 'PAYROLL', 10) + alpha('', 6) + yymmdd(eff) + '   ' + '1' + num(odfi, 8) + num(batchNo, 7));

  let hash = 0;
  let total = 0;
  entries.forEach((e, i) => {
    hash += Number(e.routing.slice(0, 8));
    total += e.amount_cents;
    // Entry — 6|22/32|RDFI 8|check 1|account 17|amount 10|individual id 15|name 22|discretionary 2|addenda 0|trace 15
    lines.push('6' + (e.account_type === 'savings' ? '32' : '22') + e.routing.slice(0, 8) + e.routing[8]
      + alpha(e.account, 17) + num(e.amount_cents, 10) + alpha(e.individual_id, 15) + alpha(e.name, 22)
      + '  ' + '0' + num(odfi, 8) + num(i + 1, 7));
  });
  const entryHash = hash % 10_000_000_000;

  // Batch control — 8|220|count 6|hash 10|debits 12|credits 12|company id 10|MAC 19|reserved 6|ODFI 8|batch 7
  lines.push('8' + '220' + num(entries.length, 6) + num(entryHash, 10) + num(0, 12) + num(total, 12)
    + alpha(o.company_id, 10) + alpha('', 19) + alpha('', 6) + num(odfi, 8) + num(batchNo, 7));

  // File control — 9|batches 6|blocks 6|entries 8|hash 10|debits 12|credits 12|reserved 39
  const recordsBeforePad = lines.length + 1;
  const blocks = Math.ceil(recordsBeforePad / 10);
  lines.push('9' + num(1, 6) + num(blocks, 6) + num(entries.length, 8) + num(entryHash, 10) + num(0, 12) + num(total, 12) + alpha('', 39));
  while (lines.length % 10 !== 0) lines.push('9'.repeat(94));

  for (const l of lines) if (l.length !== 94) throw new Error(`NACHA record length ${l.length}, expected 94`);
  return { text: lines.join('\r\n') + '\r\n', entryCount: entries.length, totalCreditCents: total, entryHash };
}
