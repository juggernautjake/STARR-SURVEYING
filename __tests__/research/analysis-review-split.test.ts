// __tests__/research/analysis-review-split.test.ts — plan 2.1–2.6 (G3/G4 + G6).
//
// ── ANALYSIS AND REVIEW WERE ONE SCREEN WEARING TWO STEPPER DOTS ────────────────────────────────
//
// The five-stage stepper shipped, but the CONTENT for Analysis and Review shared a single
// `currentStage === 'analysis' || currentStage === 'review'` branch — so clicking either dot showed
// the same screen. The owner asked for two distinct screens: Analysis is where you spend to analyze
// (the AI review + the per-file Analyze·View·Source list); Review is the finished results (data
// points, discrepancies, artifacts, export). This guards that the split is real and that a reader
// can move between the two, since both live in the one `review` DB state.
//
// It also guards G6: every data point carries a link to the ORIGINAL source page it was extracted
// from — the "authored but not wired" shape this repo keeps hitting, so it checks the CALLER passes
// the resolver, not merely that the component accepts it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const PAGE = 'app/admin/research/[projectId]/page.tsx';
const DPP = 'app/admin/research/components/DataPointsPanel.tsx';

describe('the Analysis and Review screens are split (G3/G4)', () => {
  const page = read(PAGE);

  it('CONTROL: the shared stage branch this test reasons about is here', () => {
    // If the branch guard moved or changed shape, the gating assertions below would pass vacuously.
    expect(page).toContain("(currentStage === 'analysis' || currentStage === 'review')");
  });

  it('the header names the stage the reader is on', () => {
    expect(page).toContain("currentStage === 'analysis' ? 'Analysis' : 'Review Results'");
  });

  it('the analyze controls render ONLY on the Analysis screen', () => {
    // The AI review control + the merged Analyze·View·Source list are the Analysis stage's whole
    // job. Gating them behind currentStage === 'analysis' is what makes the two dots differ.
    const analysisGate = page.indexOf("{currentStage === 'analysis' && (");
    const runAi = page.indexOf('<RunAiReviewControl');
    const estimate = page.indexOf('<AnalysisEstimatePanel');
    const analysisClose = page.indexOf("{/* ══ REVIEW stage only");
    expect(analysisGate).toBeGreaterThan(-1);
    expect(runAi).toBeGreaterThan(analysisGate);
    expect(estimate).toBeGreaterThan(analysisGate);
    // Both live before the REVIEW-only block opens.
    expect(runAi).toBeLessThan(analysisClose);
    expect(estimate).toBeLessThan(analysisClose);
  });

  it('the results + export render ONLY on the Review screen', () => {
    const reviewGate = page.indexOf("{currentStage === 'review' && (<>");
    const exportBar = page.indexOf('data-testid="research-export-bar"');
    const summaryPanel = page.indexOf('className="review-summary-panel"');
    expect(reviewGate).toBeGreaterThan(-1);
    expect(exportBar).toBeGreaterThan(reviewGate);
    expect(summaryPanel).toBeGreaterThan(reviewGate);
  });

  it('the raw log viewer stays visible on BOTH screens (outside either gate)', () => {
    // It sits after the review-only block CLOSES, so it is not gated by either stage.
    const reviewClose = page.indexOf('</>)}');
    const log = page.indexOf('className="review-log-section"');
    expect(reviewClose).toBeGreaterThan(-1);
    expect(log).toBeGreaterThan(reviewClose);
  });

  it('navigation moves Research → Analysis → Review → Job Prep', () => {
    // Gather-complete lands on Analysis, not Review (nothing is analyzed yet).
    expect(page).toContain("setViewStage('analysis')");
    // Analysis → Review and Review → Analysis are VIEW changes (write nothing).
    expect(page).toContain("onClick={() => setViewStage('review')}");
    expect(page).toContain("onClick={() => setViewStage('analysis')}");
    // Forward out of Review is a real status change.
    expect(page).toContain("Continue to Job Prep →");
  });
});

describe('G6 — every data point links to its original source page', () => {
  const page = read(PAGE);
  const dpp = read(DPP);

  it('the page RESOLVES the source URL and passes it in (the caller check)', () => {
    expect(page).toContain('sourceUrlFor={(docId) => documents.find(d => d.id === docId)?.source_url ?? undefined}');
  });

  it('the panel accepts the resolver and opens it in a new tab', () => {
    expect(dpp).toContain('sourceUrlFor?: (documentId: string) => string | undefined');
    expect(dpp).toContain('const url = sourceUrlFor?.(dp.document_id)');
    expect(dpp).toContain('target="_blank"');
    expect(dpp).toContain('rel="noopener noreferrer"');
    // Distinct from the in-app viewer button, which stays.
    expect(dpp).toContain('research-review__dp-view-source');
    expect(dpp).toContain('research-review__dp-source-link');
  });

  it('the link is absent when the source document records no URL', () => {
    // `sourceUrlFor` returns undefined for an uploaded file; the block renders null rather than a
    // dead link — the same "do not offer an affordance that lands nowhere" rule as the view button.
    expect(dpp).toContain('? (') // the ternary that guards on `url`
    expect(dpp).toMatch(/const url = sourceUrlFor\?\.\(dp\.document_id\);\s*return url \?/);
  });
});
