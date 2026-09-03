import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── THREE WORKER DEFECTS FROM THE 2026-09-03 PLATFORM AUDIT ────────────────────────────────────
//
// Each was found by a different reader and each has the same shape: a value that was computed,
// printed or promised, and never connected to the thing that consumed it.
//
//   RL-4 / PD-4   maxPaidPages was printed on every run card as a ceiling. `notePaidPages` was the
//                 only thing that advanced the count and had no caller, so the ceiling could not
//                 trip and research_runs.paid_pages was always 0.
//   routing C4    The queue path read `result.status` on an envelope whose status lives on
//                 `result.data`. `undefined === 'failed'` is false, so a failed run was reported to
//                 the requester as a completed one — the outcome the adjacent comment says R28
//                 prevents.
//
// Source-text guards with controls, because both defects were a missing CALL, and the honest probe
// for "does this file reach that function" is the file's text with its comments removed.

const SRC = path.resolve(process.cwd(), 'src');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));

describe('the paid-page ceiling has a producer', () => {
  const ledger = read('services/purchase-ledger.ts');

  it('CONTROL: the probe reads the live ledger', () => {
    expect(ledger).toContain('export async function recordPurchase(');
    expect(ledger).toContain("'research_document_purchases'");
  });

  it('recordPurchase tells the run budget how many pages were bought', () => {
    expect(ledger).toMatch(/import \{ notePaidPages \} from '\.\.\/infra\/run-budget\.js'/);
    const fn = ledger.slice(ledger.indexOf('export async function recordPurchase('));
    const body = fn.slice(0, fn.indexOf('export '.repeat(1), 10) > 0 ? fn.indexOf('\nexport ', 10) : fn.length);
    expect(body).toContain('notePaidPages(rec.projectId, rec.pages)');
  });

  it('notePaidPages is what checkBudget reads', () => {
    const budget = read('infra/run-budget.ts');
    expect(budget).toContain('export function notePaidPages(');
    expect(budget).toMatch(/state\.paidPages \+= pages/);
    expect(budget).toMatch(/paidPages\s*>=?\s*limits\.maxPaidPages|maxPaidPages/);
  });
});

describe('a queued request reports a failed run as failed', () => {
  const index = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
  const fn = strip(index.slice(index.indexOf('async function runQueuedRequest(')));
  // Up to the next top-level declaration — the function's own inner `}` lines end sooner.
  const next = fn.search(/\n(?:async function|function|const|app\.|export )/);
  const body = next > 0 ? fn.slice(0, next) : fn;

  it('CONTROL: the probe found the queue runner', () => {
    expect(body).toContain('runCountyResearch(');
    expect(body).toContain("=== 'failed'");
  });

  it('reads the status from the result envelope\'s data, where the router puts it', () => {
    // UnifiedResearchResult is { resultType, county, data }; `status` is on `data`.
    expect(body).toContain('result.data as { status?: string }');
    expect(body).not.toMatch(/\(result as \{ status\?: string \}\)\.status/);
  });

  it('the router really does put status on data, not the envelope', () => {
    const router = read('counties/router.ts');
    const iface = router.slice(router.indexOf('export interface GenericPipelineResult'), router.indexOf('export type UnifiedResearchResult'));
    expect(iface).toContain('data:');
    expect(iface).not.toMatch(/^\s*status\??:/m);
  });
});
