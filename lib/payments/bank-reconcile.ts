// lib/payments/bank-reconcile.ts
//
// G3 / Phase 2.3 of BUSINESS_GO_LIVE_FINANCE_PAYMENTS_2026-06-25 — pure helpers
// for bank reconciliation: parse a PNC CSV export into normalized rows, and
// score/rank candidate matches (payouts, expenses, payments) for each bank
// transaction so the office can confirm "this withdrawal paid Mary" etc.
//
// Pure → unit-tested with frozen inputs; the route does the DB I/O.

export interface BankTxnInput {
  /** YYYY-MM-DD. */
  posted_at: string;
  /** Signed: negative = debit (money out), positive = credit (money in). */
  amount_cents: number;
  description: string;
}

export type ReconKind = 'payout' | 'expense' | 'payment';

export interface ReconCandidate {
  kind: ReconKind;
  id: string;
  /** Positive magnitude in cents. */
  amount_cents: number;
  /** ISO date the money moved. */
  at: string;
  label?: string;
}

export interface MatchScore {
  candidate: ReconCandidate;
  score: number;
  day_diff: number;
}

/** Pure — "$1,234.56" / "(50.00)" / "-12.5" / "+3" → signed cents. null if unparseable. */
export function dollarsToCents(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return neg ? -cents : cents;
}

/** Pure — parse a PNC CSV export. Tolerant of a single signed `Amount` column
 *  OR separate Debit/Withdrawal + Credit/Deposit columns. Skips rows without a
 *  parseable date + amount. */
export function parsePncCsv(text: string): BankTxnInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const find = (names: string[]): number =>
    header.findIndex((h) => names.some((n) => h === n || h.includes(n)));

  const dateI = find(['date', 'posting date', 'transaction date']);
  const descI = find(['description', 'memo', 'details', 'transaction']);
  const amountI = find(['amount']);
  const debitI = find(['withdrawal', 'debit']);
  const creditI = find(['deposit', 'credit']);

  const out: BankTxnInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const posted_at = normalizeDate(dateI >= 0 ? cols[dateI] : '');
    if (!posted_at) continue;

    let amount_cents: number | null = null;
    if (amountI >= 0 && (cols[amountI] ?? '').trim()) {
      amount_cents = dollarsToCents(cols[amountI]);
    } else {
      const d = debitI >= 0 ? dollarsToCents(cols[debitI]) : null;
      const c = creditI >= 0 ? dollarsToCents(cols[creditI]) : null;
      if (d != null && d !== 0) amount_cents = -Math.abs(d);
      else if (c != null && c !== 0) amount_cents = Math.abs(c);
    }
    if (amount_cents == null) continue;

    out.push({
      posted_at,
      amount_cents,
      description: descI >= 0 ? (cols[descI] ?? '').trim() : '',
    });
  }
  return out;
}

/** Pure — score one candidate against a bank txn. 0 = not a match. Requires the
 *  right direction (debit → payout/expense, credit → payment) + an exact amount;
 *  ranks by date proximity within `maxDays`. */
export function scoreMatch(txn: BankTxnInput, cand: ReconCandidate, maxDays = 5): number {
  const debit = txn.amount_cents < 0;
  const wantKinds: ReconKind[] = debit ? ['payout', 'expense'] : ['payment'];
  if (!wantKinds.includes(cand.kind)) return 0;
  if (Math.abs(txn.amount_cents) !== Math.abs(cand.amount_cents)) return 0;
  const diff = Math.abs(daysBetween(txn.posted_at, cand.at));
  if (!Number.isFinite(diff) || diff > maxDays) return 0;
  // 1.0 same day, decaying to 0.5 at the edge of the window.
  return 1 - (diff / (maxDays + 1)) * 0.5;
}

/** Pure — ranked viable matches (score > 0), best first (then closest date). */
export function bestMatches(
  txn: BankTxnInput,
  candidates: ReadonlyArray<ReconCandidate>,
  maxDays = 5,
): MatchScore[] {
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreMatch(txn, candidate, maxDays),
      day_diff: Math.abs(daysBetween(txn.posted_at, candidate.at)),
    }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.day_diff - b.day_diff);
}

/** Pure — stable dedupe key for an imported row. */
export function importFingerprint(txn: BankTxnInput): string {
  return [txn.posted_at, txn.amount_cents, txn.description.replace(/\s+/g, ' ').trim().toLowerCase()].join('|');
}

// ── internals ────────────────────────────────────────────────────────
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      q = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeDate(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const mo = m[1].padStart(2, '0');
    const da = m[2].padStart(2, '0');
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yr}-${mo}-${da}`;
  }
  return null;
}

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Infinity;
  return Math.round((ta - tb) / 86400000);
}
