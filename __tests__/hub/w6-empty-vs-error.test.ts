// __tests__/hub/w6-empty-vs-error.test.ts
//
// HUB_WIDGETS_AND_NOTIFICATIONS W-6 — robustness pass on the invoice,
// job, employee, hours, and pay widgets. The recurring defect this
// guards against is "an absence rendering as an answer": a failed fetch
// caught into `setStatus('empty')` so a broken service shows "all caught
// up" / "all paid up" — telling the office there is nothing outstanding,
// nothing to approve, no activity, when in truth the data could not be
// read.
//
// Contract: each listed widget MUST carry a distinct 'error' status,
// render <WidgetError> for it (with a retry), and — critically — its
// catch block must NOT fall through to 'empty'. Source-lock so the
// distinction can't silently regress.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

// The five named areas (hours / invoice / employee / pay / jobs) plus
// the two research/job widgets the notification-badge work lit up.
const WIDGETS = [
  'lib/hub/widgets/pending-hours/index.tsx',
  'lib/hub/widgets/hours-this-week/index.tsx',
  'lib/hub/widgets/outstanding-invoices/index.tsx',
  'lib/hub/widgets/my-pay/index.tsx',
  'lib/hub/widgets/my-jobs/index.tsx',
  'lib/hub/widgets/active-research-projects/index.tsx',
  'lib/hub/widgets/job-activity-feed/index.tsx',
];

describe('W-6 — widgets distinguish a failed fetch (error) from no data (empty)', () => {
  for (const rel of WIDGETS) {
    describe(rel, () => {
      const SRC = read(rel);

      it("declares an 'error' status", () => {
        expect(SRC).toMatch(/setStatus\('error'\)/);
      });

      it('renders <WidgetError> for the error status', () => {
        expect(SRC).toMatch(/status === 'error'[\s\S]{0,160}<WidgetError/);
      });

      it('imports WidgetError', () => {
        expect(SRC).toMatch(/import WidgetError from '@\/lib\/hub\/components\/WidgetError'/);
      });

      it('does not swallow a fetch failure into empty (no `catch { setStatus(\'empty\') }`)', () => {
        expect(SRC).not.toMatch(/catch[\s\S]{0,40}setStatus\('empty'\)/);
      });
    });
  }
});
