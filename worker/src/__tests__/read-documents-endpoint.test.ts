import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Plan RESEARCH_SYSTEM_COMPLETION A1/A2/BW/F1 — the worker-side analysis endpoint. The app route
// freezes long analysis on Vercel; this runs the OCR reading pass over a project's FILED documents
// on the long-lived worker so it completes and reaches the 'pending' deeds a stalled gather left.
const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

describe('POST /research/read-documents/:projectId', () => {
  it('exists and runs the reading pass over the project\'s filed documents', () => {
    expect(index).toMatch(/app\.post\('\/research\/read-documents\/:projectId'/);
    expect(index).toMatch(/reanalyseProjectDocuments\(projectId, log, mayContinue\)/);
  });

  it('attributes cost to the project (enterRunContext) and returns 202 fire-and-forget', () => {
    const at = index.indexOf("app.post('/research/read-documents/:projectId'");
    const block = index.slice(at, at + 2600);
    expect(block).toMatch(/enterRunContext\(projectId\)/);
    expect(block).toMatch(/res\.status\(202\)/);
  });

  it('benchmark mode is uncapped and everything-continues', () => {
    const at = index.indexOf("app.post('/research/read-documents/:projectId'");
    const block = index.slice(at, at + 2600);
    expect(block).toMatch(/benchmark \? undefined : body\.maxCostUsd/);
    expect(block).toMatch(/const mayContinue = \(\) => benchmark \|\|/);
  });

  it('benchmark writes benchmark_usd_per_page from the ledger \u00f7 pages', () => {
    const at = index.indexOf("app.post('/research/read-documents/:projectId'");
    const block = index.slice(at, at + 2600);
    expect(block).toMatch(/ledgerSpendForRun\(projectId\)/);
    expect(block).toMatch(/benchmark_usd_per_page/);
  });
});
