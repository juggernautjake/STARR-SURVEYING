import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── A CHECK CONSTRAINT THE WRITERS COULD NOT SATISFY ───────────────────────────────────────────
//
// Seed 531 allowed `research_document_purchases.status` three values — completed, failed, refunded.
// On 2026-09-02 the worker began writing `paid_disabled` and `permission_unreadable` rows so the
// report could say "N documents behind a paywall were not retrieved". Every insert violated the
// CHECK; the writer never throws, so it became one warning line per run and a table that stayed at
// zero rows — the exact condition the write was added to end. Two plan items said the notice was
// reachable. Found by the 2026-09-03 platform audit (paid-documents and data-model readers), and
// confirmed against the live constraint before seed 629 widened it.
//
// The schema guards this repo already had compare column NAMES and unique indexes. Neither can see
// a CHECK's value list, which is how the seed and the writer disagreed without a test going red.
// This one reads the values.

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The literals seed 629 admits, parsed from the SQL rather than retyped here. */
function allowedBySeed(): Set<string> {
  // Comments first: the seed's own header QUOTES seed 531's three-value CHECK to explain what it
  // replaces, and a lazy match found that one — the control below is what noticed.
  const sql = read('seeds/629_purchase_skip_statuses.sql').replace(/^\s*--[^\n]*/gm, '');
  const m = sql.match(/CHECK \(status IN \(([\s\S]*?)\)\)/);
  if (!m) throw new Error('seed 629: CHECK (status IN (...)) not found');
  return new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
}

describe('every purchase status the code writes or counts is one the table admits', () => {
  const allowed = allowedBySeed();

  it('CONTROL: the seed parses to the three original statuses plus the skip statuses', () => {
    expect(allowed.has('completed')).toBe(true);
    expect(allowed.has('paid_disabled')).toBe(true);
    expect(allowed.size).toBeGreaterThanOrEqual(7);
  });

  it('the worker purchase gate writes only admitted statuses', () => {
    const src = read('worker/src/research/purchase-gate.ts');
    const m = src.match(/export type PurchaseSkipStatus = ([^;]+);/);
    expect(m, 'PurchaseSkipStatus type not found').toBeTruthy();
    const literals = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const s of literals) expect(allowed.has(s), `purchase-gate writes '${s}'`).toBe(true);
  });

  it('the app-side skipStatusFor returns only admitted statuses', () => {
    const src = read('lib/research/paid-documents.ts');
    const m = src.match(/export function skipStatusFor\([^)]*\): ([^{]+)\{/);
    expect(m, 'skipStatusFor signature not found').toBeTruthy();
    const literals = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const s of literals) expect(allowed.has(s), `paid-documents returns '${s}'`).toBe(true);
  });

  it('the analyze route counts only admitted statuses — a status it counts that nothing can write is a notice that never appears', () => {
    const src = read('app/api/admin/research/[projectId]/analyze/route.ts');
    const m = src.match(/\.in\('status', \[([^\]]+)\]\)/);
    expect(m, 'the .in(status, [...]) filter not found').toBeTruthy();
    const literals = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const s of literals) expect(allowed.has(s), `analyze route counts '${s}'`).toBe(true);
  });

  it('the purchase orchestrator\'s budget_exceeded is admitted', () => {
    const src = read('worker/src/services/document-purchase-orchestrator.ts');
    expect(src).toContain("status: 'budget_exceeded'");
    expect(allowed.has('budget_exceeded')).toBe(true);
  });

  it('seed 531\'s firm-wide uniqueness still applies only to completed purchases', () => {
    // A skipped document may be skipped by any number of runs; only money that moved is unique.
    const s531 = read('seeds/531_research_document_purchases.sql');
    expect(s531).toMatch(/WHERE status = 'completed'/);
    const s629 = read('seeds/629_purchase_skip_statuses.sql');
    expect(s629).not.toMatch(/DROP INDEX/i);
  });
});
