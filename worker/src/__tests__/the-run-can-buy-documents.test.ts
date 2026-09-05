import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// D1 — "make sure we are actually searching it and paying the cost to find documents."
//
// ── WHY NO RUN HAS EVER BOUGHT A DOCUMENT ───────────────────────────────────────────────────────
//
// `research_document_purchases` has 0 rows, and the reason was never that Phase 9 is unfinished. It
// is complete, and it had exactly one caller: the Testing Lab.
//
//   Phase 9 needs recommendations
//     → which come from Phase 8
//       → which takes the reconciled boundary as its INPUT
//         → which only the Testing Lab wrote
//
// Three phases were not "unwired". They were waiting on a file. C2b wrote it, C2c ran Phase 8, and
// this is the last link.
//
// ── THE SAFEGUARDS ALL EXISTED AND HAD NEVER RUN ────────────────────────────────────────────────
//
// `decidePurchase` — which refuses when permission cannot be READ, not only when it is denied — the
// per-run spend ceiling, the cross-run library that will not buy the same page twice, and the skip
// ledger. Every one was built for this step and had no step to guard.

const SRC = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');
const code = SRC
  .split(/\r?\n/)
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

const at = code.indexOf('recs = report.documentPurchaseRecommendations ?? [];');
const block = at === -1 ? '' : code.slice(at, at + 5200);

describe('the run reaches the purchase step', () => {
  it('CONTROL: the purchase block is where this test thinks it is', () => {
    // Every assertion below reads `block`. If the anchor moved they would all pass on an empty
    // string, which is the shape of a guard that guards nothing.
    expect(at, 'the purchase block is gone from the run path').toBeGreaterThan(-1);
    expect(block).toContain('DocumentPurchaseOrchestrator');
  });

  it('takes its recommendations from the Phase 8 report', () => {
    expect(block).toContain('report.documentPurchaseRecommendations');
  });

  it('does nothing when there is nothing recommended', () => {
    expect(block).toContain('if (recs.length > 0)');
  });
});

describe('it cannot spend without permission', () => {
  it('asks the gate first', () => {
    expect(block).toContain('await resolvePurchasePermission(projectId)');
  });

  it('the refusal path comes BEFORE the orchestrator is constructed', () => {
    const permAt = block.indexOf('resolvePurchasePermission');
    const buyAt = block.indexOf('new DocumentPurchaseOrchestrator');
    expect(permAt).toBeGreaterThan(-1);
    expect(buyAt).toBeGreaterThan(-1);
    expect(permAt, 'the run builds a purchaser before it checks whether it may buy').toBeLessThan(buyAt);
  });

  it('records the skipped documents rather than only logging them', () => {
    // The notice on the screen COUNTS these rows. For months there were none to count, so the
    // sentence "N documents behind a paywall were not retrieved" was unreachable.
    expect(block).toContain('recordSkippedPurchases(');
    expect(block).toContain('permission.skipStatus');
  });

  it('explains a refusal in words', () => {
    expect(block).toContain('describeSkippedPurchase(permission, recs.length)');
  });
});

describe('it says what it is about to spend, before it spends it', () => {
  it('announces the ceiling and the count first', () => {
    // A run that reports a purchase after making it has told the operator nothing they could have
    // acted on. This is the plan's own "must not" made checkable.
    const announceAt = block.indexOf('Buying documents');
    const buyAt = block.indexOf('new DocumentPurchaseOrchestrator');
    expect(announceAt, 'nothing is announced before the spend').toBeGreaterThan(-1);
    expect(announceAt).toBeLessThan(buyAt);
  });

  it('the announcement names the ceiling, WITH a currency symbol', () => {
    // Twice in one day a shell layer has eaten one of the two dollars in `${...}`, and the
    // first time it shipped a counter reading "0.00". A figure without its symbol is a quantity of
    // nothing in particular.
    expect(block).toContain('ceiling $${ceiling.toFixed(2)}');
  });

  it('passes the RUN\'s ceiling to the orchestrator, not a constant', () => {
    // `runSettings.maxCostUsd` is what the operator chose in the re-run dialog. The Lab route
    // defaulted to 25 with no caller ever passing one, which is how a per-run limit came to govern
    // nothing.
    // W3: the orchestrator budget is the dedicated TexasFile budget (falling back to the cost cap),
    // still from runSettings, not a constant.
    expect(block).toContain('const ceiling = runSettings.texasfileBudgetUsd ?? runSettings.maxCostUsd ?? 25;');
    expect(block).toContain('budget: ceiling,');
  });

  it('reports what was actually bought and what it cost', () => {
    expect(block).toContain('Purchase finished');
    expect(block).toContain('purchaseResult.billing?.totalCharged');
  });

  it('says how many were NOT obtained', () => {
    // "3 bought" alone invites the reader to assume the other seven did not exist.
    expect(block).toContain('were not obtained');
  });
});

describe('the credentials are the ones that are actually configured', () => {
  it('reads TexasFile from the environment', () => {
    expect(block).toContain('process.env.TEXASFILE_USERNAME');
  });

  it('passes undefined rather than empty strings when a vendor is not configured', () => {
    // An adapter constructed with empty credentials logs in as nobody and reports a failed purchase,
    // which reads as "the document could not be bought" rather than "we have no account".
    expect(block).toContain("process.env.KOFILE_USERNAME ? {");
    expect(block).toContain('} : undefined,');
  });
});
