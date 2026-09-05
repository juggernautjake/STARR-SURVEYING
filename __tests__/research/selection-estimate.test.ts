import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { estimateSelectionCost, DEFAULT_GATHER_SELECTIONS_VALUE } from '@/app/admin/research/components/GatherSelectionsField';

// Plan RESEARCH_SYSTEM_COMPLETION U1/B2.2 — the run-start dialog estimates the selection's TexasFile
// cost and warns if it exceeds the budget.
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('estimateSelectionCost', () => {
  it('prices paid items and treats maps/GIS as free', () => {
    expect(estimateSelectionCost({ items: ['recent_plat'], adjoiners: { enabled: false, items: [] } })).toBe(2);
    expect(estimateSelectionCost({ items: ['recent_deed', 'gis_satellite'], adjoiners: { enabled: false, items: [] } })).toBe(4);
  });
  it('adds adjoiner cost only when enabled', () => {
    const base = { items: ['recent_plat'] as const };
    expect(estimateSelectionCost({ ...base, adjoiners: { enabled: false, items: ['recent_deed'] } })).toBe(2);
    expect(estimateSelectionCost({ ...base, adjoiners: { enabled: true, items: ['recent_deed'] } })).toBe(6);
  });
  it('expands all_files to the paid set', () => {
    expect(estimateSelectionCost(DEFAULT_GATHER_SELECTIONS_VALUE)).toBeGreaterThan(0); // all_files
  });
});

describe('the dialog surfaces the estimate + over-budget warning', () => {
  const dialog = read('app/admin/research/components/RerunDialog.tsx');
  it('renders the estimate and warns when over budget', () => {
    expect(dialog).toMatch(/data-testid="selection-estimate"/);
    expect(dialog).toMatch(/estimateSelectionCost\(form\.gatherSelections\)/);
    expect(dialog).toMatch(/est > form\.texasfileBudgetUsd/);
    expect(dialog).toMatch(/Over budget/);
  });
});
