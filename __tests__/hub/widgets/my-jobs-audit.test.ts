// __tests__/hub/widgets/my-jobs-audit.test.ts
//
// hub-widget-excellence-10 my-jobs Rounds 2–4 audit lock. The row +
// editor behaviors verified here were built in the Build/Wire slice;
// these source-regex assertions keep them from silently regressing
// (the widget body fetches + reads hub-data, so an interactive render
// assertion isn't viable — see the repo's SSR-snapshot limitation).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_JOB_COLUMNS } from '@/lib/hub/widgets/my-jobs';
import { WIDGET_LINKS, jobHref } from '@/lib/hub/widgets/_shared/widget-links';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'lib', 'hub', 'widgets', 'my-jobs', 'index.tsx'),
  'utf8',
);

describe('my-jobs Round 2 — links', () => {
  it('rows deep-link to the job detail via jobHref', () => {
    expect(SRC).toMatch(/<Link href=\{jobHref\(job\.id\)\}/);
    expect(jobHref('J-1')).toBe('/admin/jobs/J-1');
  });

  it('the tiny count + the registry footer point at /admin/jobs', () => {
    expect(SRC).toMatch(/<Link href="\/admin\/jobs"/);
    expect(WIDGET_LINKS['my-jobs'].href).toBe('/admin/my-jobs');
  });
});

describe('my-jobs Round 3 — size/format (field-priority)', () => {
  it('drives visible columns through the shared pickFields helper', () => {
    expect(SRC).toMatch(/import \{ pickFields \} from '@\/lib\/hub\/widgets\/_shared\/field-priority'/);
    expect(SRC).toMatch(/return pickFields\(ordered, bucket, COLUMN_CAPS\)/);
  });

  it('the overdue due-chip + whole-dollar quote formatters are wired into the row', () => {
    expect(SRC).toMatch(/formatDue\(job\.deadline\)/);
    expect(SRC).toMatch(/formatQuote\(job\.quote_amount\)/);
  });
});

describe('my-jobs Round 4 — specialized editor', () => {
  it('the editor exposes a checkbox for every column incl. due/address/quote', () => {
    expect(SRC).toMatch(/ALL_JOB_COLUMNS\.map\(\(c\) =>/);
    for (const col of ['due', 'address', 'quote']) {
      expect(ALL_JOB_COLUMNS).toContain(col);
    }
  });

  it('keeps the filter / stage / sort / rowLimit / stage-color controls', () => {
    expect(SRC).toMatch(/filter: e\.target\.value as JobsFilter/);
    expect(SRC).toMatch(/sortBy: e\.target\.value as JobsSortBy/);
    expect(SRC).toMatch(/showStageColors: e\.target\.checked/);
  });
});
