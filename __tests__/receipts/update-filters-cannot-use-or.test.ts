// __tests__/receipts/update-filters-cannot-use-or.test.ts
//
// Owner, 2026-08-13: *"It stored it, but it did not actually analyze it."*
//
// ── THE BUG ──────────────────────────────────────────────────────────────────────────────────────
//
// `claimRow` in `lib/receipts/extract.ts` took the row with one atomic compare-and-set:
//
//     .update({ extraction_status: 'running', … })
//     .eq('id', receiptId)
//     .or('extraction_status.eq.queued,extraction_status.is.null,…')
//
// **PostgREST rejects an `.or()` filter on an UPDATE.** Verified against production on 2026-08-13,
// for four different table/column combinations including columns that have existed since the table
// was created:
//
//     receipts UPDATE .or(status)             → column receipts.status does not exist
//     receipts UPDATE .or(extraction_status)  → column receipts.extraction_status does not exist
//     jobs     UPDATE .or(is_archived)        → column jobs.is_archived does not exist
//
// The identical `.or()` on a SELECT matches the row perfectly, which is what made it so convincing:
// the filter is not wrong, the verb is.
//
// ── WHY IT WAS SILENT FOR TWO DAYS ───────────────────────────────────────────────────────────────
//
// `claimRow` ended `if (error) return false`, and a `false` from a claim means "somebody else has
// this row" — an ordinary, expected race. So a query that could not run was reported as healthy
// contention: `extractReceipt` returned `{status: 'skipped'}`, the cron counted it under "already
// running", and the receipt sat at `queued` with no error, no failed row and no log line.
//
// Every automatic path went through it — the capture page's kick after upload, and the hourly cron
// sweep. The only path that worked was `force: true`, which skips the `.or()` entirely and is sent
// by "Run AI again" on a receipt that is ALREADY done. So the button appeared to work, and nothing
// that mattered did.
//
// The guard is a source scan because the failure is invisible at every other level: it typechecks,
// the SDK accepts it, the request returns 200-shaped `{data: null, error}`, and only production data
// shows nothing was ever claimed.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'lib', 'worker/src', 'scripts'];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Comments removed, so the prose in THIS repo's headers — which quotes the broken call — is not
 *  itself reported as a call. Fifth-time-today problem; see the expense-totals scan. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * Every `.update(` chain, as text from `.update(` to the end of its statement.
 *
 * A chain ends at the first `;` — long enough to hold every filter in the builder chain, short
 * enough not to swallow the next statement's.
 */
function updateChains(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const out: string[] = [];
  const re = /\.update\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const end = src.indexOf(';', m.index);
    out.push(src.slice(m.index, end === -1 ? src.length : end));
  }
  return out;
}

describe('no UPDATE carries an .or() filter', () => {
  const offenders: string[] = [];
  let chainsSeen = 0;

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = file.split(path.sep).join('/');
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes('.update(')) continue;
      for (const chain of updateChains(src)) {
        chainsSeen += 1;
        if (/\.or\(/.test(chain)) {
          offenders.push(`${rel}: ${chain.slice(0, 120).replace(/\s+/g, ' ')}`);
        }
      }
    }
  }

  it('because PostgREST rejects it, and the rejection reads as a lost race', () => {
    // If this fails on a chain you have just written: the fix is to decide eligibility in code and
    // put a single equality on the UPDATE — a compare-and-set, which is still atomic. See
    // `claimRow` in lib/receipts/extract.ts for the shape.
    expect(offenders).toEqual([]);
  });

  it('actually inspected the update chains, rather than passing because it found none', () => {
    // The failure mode this file exists to prevent, applied to itself: a scan whose regex stops
    // matching reports a clean codebase. There are hundreds of `.update(` calls in this repo.
    expect(chainsSeen).toBeGreaterThan(100);
  });
});

describe('the claim is still a compare-and-set', () => {
  const src = fs.readFileSync('lib/receipts/extract.ts', 'utf8');

  it('writes only when the status it read is still there', () => {
    // Dropping the filter entirely would "fix" the claim by removing the concurrency guard — two
    // extractions billed for one photo, writing over each other's line items.
    expect(src).toMatch(/\.eq\('extraction_status', status\)/);
  });

  it('uses .is for a NULL status, because `= NULL` is never true', () => {
    // The rows that most need claiming are the ones no extractor has ever touched. An `.eq` here
    // silently refuses exactly those.
    expect(src).toMatch(/\.is\('extraction_status', null\)/);
  });

  it('logs a failed claim instead of reporting it as a lost race', () => {
    // The whole reason this was invisible for two days.
    expect(src).toMatch(/claim failed/);
  });
});
