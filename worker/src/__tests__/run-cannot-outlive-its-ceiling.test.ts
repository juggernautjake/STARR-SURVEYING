import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { reanalyseFiledDocuments, type FiledDocument } from '../research/reanalyze-documents.js';

// ── A RUN CANNOT OUTLIVE ITS CEILING ───────────────────────────────────────────────────────────
//
// 2026-09-03, run 3 on 1512 Chisholm Trail: a 30-minute ceiling, "2:46:18 / 30:00" on the screen,
// and the status poll saying "aborted (budget)" the whole time. Two things let it happen and both
// are held here:
//
//   1. The budget was checked only inside the progress callback. A step that emits no progress
//      was unstoppable. There is now a wall-clock WATCHDOG armed at run start that fires the same
//      abort the progress path would.
//   2. The post-run tail (imagery, drawing hunt, document re-read) ran after the pipeline
//      returned with no budget check, no deadline, and outside the run context — its Vision spend
//      was not even counted. The tail is now skipped when the ceiling was hit, bounded by the run's
//      remaining time otherwise, and the re-read asks the budget between documents and pages.
//
// Source-text guards with controls for (1) and the tail wiring, because the defect was a MISSING
// call; a pure unit test for the re-read predicate, because that is behaviour.

const SRC = path.resolve(process.cwd(), 'src');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));
const index = strip(fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8'));

describe('the watchdog', () => {
  it('CONTROL: the probe reads the run entry', () => {
    expect(index).toContain("app.post('/research/property-lookup'");
    expect(index).toContain('activePipelines.set(projectId, {');
  });

  it('is armed from the run\'s wall-clock limit and fires the budget abort itself', () => {
    const start = index.indexOf('activePipelines.set(projectId, {');
    const window = index.slice(start, start + 3000);
    expect(window).toContain('const watchdog = setTimeout(');
    expect(window).toContain('budgetLimits.maxWallClockMs + graceMs');
    expect(window).toContain("active.stopReason = { kind: 'budget', message }");
    expect(window).toContain('active.abortController?.abort(new BudgetAbort(message))');
    expect(window).toContain('active.watchdog = watchdog');
  });

  it('is cleared on BOTH endings, so a finished run cannot be aborted after the fact', () => {
    const clears = (index.match(/clearTimeout\(activePipelines\.get\(projectId\)\?\.watchdog\)/g) ?? []).length;
    const ends = (index.match(/\n\s*endRun\(projectId\);/g) ?? []).length;
    // Every wall-clock watchdog is cleared at a run ending (>= the 2 full-run terminal sites). The
    // on-demand read-documents pass (F3/A1) also calls endRun but arms no wall-clock watchdog, so
    // ends can exceed clears — the invariant is that no watchdog-armed run forgets to clear it.
    expect(clears).toBeGreaterThanOrEqual(2);
    expect(ends).toBeGreaterThanOrEqual(clears);
  });
});

describe('the tail', () => {
  const resolve = index.slice(index.indexOf('const finalBudget = checkBudget(projectId, spendForRun(projectId));'));
  const tail = resolve.slice(0, resolve.indexOf('void recordRunFinish({'));

  it('CONTROL: the probe found the tail', () => {
    expect(tail).toContain('captureImageryForRun(');
    expect(tail).toContain('reanalyseProjectDocuments(');
  });

  it('imagery is skipped when the ceiling was hit; the READING pass is not', () => {
    expect(tail).toContain('const ceilingHit = Boolean(finalBudget.exceeded) || Boolean(tailSignal?.aborted)');
    // Imagery is the only expensive step still gated on the wall-clock ceiling.
    const guarded = (tail.match(/if \(!ceilingHit\) \{/g) ?? []).length;
    expect(guarded).toBe(1);
    expect(tail).toMatch(/withStepDeadline\(projectId, 'imagery capture'/);
    // COST IS THE CEILING (owner, 2026-09-04): the reading reads what the search bought until the
    // run reaches its COST cap or is aborted — no time window. The cost watchdog (asserted below)
    // holds the cap to the dollar; the reading itself just checks cost and the abort.
    expect(tail).toContain("const ex = checkBudget(projectId, spendForRun(projectId)).exceeded;");
    expect(tail).toContain("return ex !== 'cost' && ex !== 'paid_pages';");
    expect(tail).toContain('if (tailSignal?.aborted) return false;');
    expect(tail).not.toContain('HARD_GRACE_MS');
    expect(tail).not.toContain("withStepDeadline(projectId, 'document re-read'");
  });

  it('the deadline ABORTS the step, not just stops waiting for it (run 7, 2026-09-04)', () => {
    // withStepDeadline racing fn() against a timer left the clerk scraper orphaned, driving a
    // browser nine minutes past the ceiling. It now aborts a controller the caller passes.
    const gate = read('research/budget-gate.ts');
    expect(gate).toContain('opts.abortController?.abort();');
    expect(gate).toContain('abortController?: AbortController');
    const orch = read('counties/bell/orchestrator.ts');
    expect(orch).toContain('abortController: clerkAbort');
    const clerk = read('counties/bell/scrapers/clerk-scraper.ts');
    // Path A and Path D both break on the run signal; the subdivision sweep checks opts.signal.
    expect(clerk.split('input.signal?.aborted').length - 1).toBeGreaterThanOrEqual(2);
    expect(clerk).toContain('opts.signal?.aborted');
  });

  it('EVERY browser-driving clerk call is bounded (run 8, 2026-09-04)', () => {
    // Run 8: the MAIN clerk search stopped at the ceiling exactly as designed — then the run drove
    // the browser eight more minutes in the 2B½ deed-chain fetch and the Phase 3B historical fetch,
    // because those two scrapeBellClerk calls had neither a deadline nor a signal. There are three
    // browser-driving clerk calls in the orchestrator and ALL THREE must be bounded, or the next
    // long deed chain runs away again. This counts the calls and asserts the wiring on each.
    const orch = read('counties/bell/orchestrator.ts');
    // The real calls are `() => scrapeBellClerk(` (each wrapped in a deadline thunk); not the
    // import or the two `typeof scrapeBellClerk` annotations.
    const calls = orch.split('() => scrapeBellClerk(').length - 1;
    expect(calls).toBe(3);
    // Each call is wrapped in a deadline step and passes that step's own abort controller...
    for (const step of ['clerk deed search', 'deed chain fetch', 'historical deed fetch']) {
      expect(orch).toContain(`withStepDeadline(input.projectId, '${step}'`);
    }
    for (const [ctrl, sig] of [['clerkAbort', 'clerkAbort.signal'], ['deedAbort', 'deedAbort.signal'], ['histAbort', 'histAbort.signal']]) {
      expect(orch).toContain(`abortController: ${ctrl}`);
      expect(orch).toContain(`signal: ${sig}`);
    }
    // ...and the number of signals handed to clerk inputs equals the number of browser calls.
    expect((orch.match(/signal: \w+Abort\.signal/g) ?? []).length).toBe(calls);
  });
  it('the reading pass is bounded by COST and the abort, not a clock (owner, 2026-09-04)', () => {
    expect(tail).toContain('withRunContext(projectId, () =>');
    // an abort (cost watchdog, or operator) stops it
    expect(tail).toContain('if (tailSignal?.aborted) return false;');
    expect(tail).toContain("return ex !== 'cost' && ex !== 'paid_pages';");
  });

  it('a COST WATCHDOG hard-stops the run at the cost cap (run 9 spent $2.92 on $2)', () => {
    // Cost is the ceiling now. A poll fires the abort the instant spend crosses the cap, so the
    // overshoot is one AI call, not a dollar. The wall clock is only a SAFETY net for a hung step.
    const start = index.indexOf('activePipelines.set(projectId, {');
    const window = index.slice(start, start + 5000);
    expect(window).toContain('const costPoll = setInterval(');
    expect(window).toContain("checkBudget(projectId, spendForRun(projectId))");
    expect(window).toContain("status.exceeded === 'cost'");
    expect(window).toContain('active.abortController?.abort(new BudgetAbort(message))');
    expect(window).toContain('clearInterval(costPoll)');
    // cost is primary, but a hard one-hour wall-clock cap also stops the run
    expect(window).toContain('WALL-CLOCK cap fired');
  });
});

describe('the re-read stops when told to', () => {
  const doc = (id: string): FiledDocument => ({
    id, document_type: 'deed', document_label: `Deed ${id}`, extracted_text: null,
    extracted_text_method: null, page_count: 1, processing_status: 'stored',
    ocr_regions: JSON.stringify({ pageUrls: [`https://x/${id}.png`] }),
  } as unknown as FiledDocument);
  const db = { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) } as never;

  it('reads while it may, counts the rest as left unread, and never calls read for them', async () => {
    let reads = 0;
    let budget = 2;
    const report = await reanalyseFiledDocuments(
      db, [doc('a'), doc('b'), doc('c'), doc('d')],
      async () => { reads++; return { text: 'BEGINNING at an iron rod, 22.495 acres', method: 'test', confidence: 0.8 }; },
      () => {},
      () => budget-- > 0,
    );
    expect(reads).toBe(2);
    expect(report.reanalysed).toBe(2);
    expect(report.leftUnread).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.lines.filter((l) => l.includes('left unread')).length).toBe(2);
  });

  it('CONTROL: without the predicate every document is read', async () => {
    let reads = 0;
    const report = await reanalyseFiledDocuments(
      db, [doc('a'), doc('b')],
      async () => { reads++; return { text: 'BEGINNING at an iron rod, 22.495 acres', method: 'test', confidence: 0.8 }; },
    );
    expect(reads).toBe(2);
    expect(report.leftUnread).toBe(0);
  });
});
