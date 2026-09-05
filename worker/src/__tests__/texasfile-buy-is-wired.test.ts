import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Slice G1 (plan GATHER_AND_REVIEW_SPLIT_2026-09-05): the working purchase module `texasfile-buy.ts`
// must be the one the run actually uses. The repo's dominant defect is "authored but not wired," so
// this asserts the CALLERS — the purchase adapter delegates to `buyDocument` and files the pages for
// Review, and the orchestrator passes the book/page search hints TexasFile needs — rather than that
// `texasfile-buy.ts` merely imports its own helpers.

const WORKER_SRC = path.join(process.cwd(), 'src');
const read = (rel: string) => fs.readFileSync(path.join(WORKER_SRC, rel), 'utf8');

const ADAPTER = read('services/purchase-adapters/texasfile-purchase-adapter.ts');
const ORCH = read('services/document-purchase-orchestrator.ts');

/** Strip comment lines so a historical note in a WHY-block doesn't read as live code. */
const codeOnly = (src: string) =>
  src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

const ADAPTER_CODE = codeOnly(ADAPTER);

describe('the TexasFile purchase adapter delegates to the working buy module', () => {
  it('imports and calls buyDocument from texasfile-buy', () => {
    expect(ADAPTER).toMatch(/from ['"]\.\.\/texasfile-buy\.js['"]/);
    expect(ADAPTER).toMatch(/\bbuyDocument\s*\(/);
  });

  it('files the purchased pages into research_documents for Review', () => {
    // uploadDocumentIncremental is what creates the research_documents row + storage objects the
    // Review stage renders. The old adapter saved only to /tmp, so nothing ever reached Review.
    expect(ADAPTER).toMatch(/uploadDocumentIncremental\s*\(/);
    expect(ADAPTER).toMatch(/from ['"]\.\.\/artifact-uploader\.js['"]/);
  });

  it('no longer drives the dead Django site (old login / search selectors gone)', () => {
    expect(ADAPTER_CODE).not.toMatch(/texasfile\.com\/login/);
    expect(ADAPTER_CODE).not.toMatch(/input\[name="username"\]/);
  });
});

describe('the orchestrator passes the search hints TexasFile actually needs', () => {
  it('threads book + page into the single gated TexasFile purchase call', () => {
    // TexasFile's instrument-number search returns empty for many counties; book/vol/page is the
    // reliable key, and the recommendation carries it. All TexasFile buys route through one gated
    // closure, whose purchaseDocument call forwards book + page (alongside the maxUsd earmark cap).
    const call = ORCH.match(/texasFileAdapter!?\.purchaseDocument\(([\s\S]*?)\);/);
    expect(call).not.toBeNull();
    expect(call![1]).toMatch(/book: rec\.book/);
    expect(call![1]).toMatch(/page: rec\.page/);
  });

  it('routes every TexasFile buy through the budget-gated closure', () => {
    // The $10 earmark is enforced in ONE place; no call site may bypass it by hitting the adapter
    // directly. So there is exactly one raw adapter call (inside buyFromTexasFile), and the dispatch
    // sites call the closure.
    const rawCalls = ORCH.match(/texasFileAdapter!?\.purchaseDocument\(/g) ?? [];
    expect(rawCalls.length).toBe(1);
    const gatedCalls = ORCH.match(/buyFromTexasFile\(\)/g) ?? [];
    expect(gatedCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('gates TexasFile spend on the metered TexasFile budget', () => {
    expect(ORCH).toMatch(/mayBuyFromTexasFile\(/);
    expect(ORCH).toMatch(/texasfileWalletSpend/);
    expect(ORCH).toMatch(/from ['"]\.\.\/research\/gather-budget\.js['"]/);
  });
});
