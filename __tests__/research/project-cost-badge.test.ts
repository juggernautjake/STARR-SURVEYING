import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// F2/U — the true per-project spend is surfaced in Review, reading the /cost ledger endpoint.
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const badge = read('app/admin/research/components/ProjectCostBadge.tsx');
const page = read('app/admin/research/[projectId]/page.tsx');

describe('ProjectCostBadge', () => {
  it('reads the per-project cost ledger endpoint', () => {
    expect(badge).toMatch(/\/api\/admin\/research\/\$\{projectId\}\/cost/);
    expect(badge).toMatch(/totalUsd/);
    expect(badge).toMatch(/document_purchase/); // splits purchases from AI
  });
  it('is mounted in the review stage', () => {
    expect(page).toMatch(/import ProjectCostBadge from '\.\.\/components\/ProjectCostBadge'/);
    expect(page).toMatch(/<ProjectCostBadge projectId=\{projectId\}/);
  });
});
