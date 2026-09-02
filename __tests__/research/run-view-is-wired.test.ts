// __tests__/research/run-view-is-wired.test.ts — does anything MOUNT the rebuilt view?
//
// This repo's most common defect is a component that is authored, looks right, and is rendered by
// nothing. It has shipped that way at least nine times in the research portal alone, and a test
// that only proves `ResearchRunView` imports its own helpers would pass just as happily against a
// file nothing renders.
//
// So every assertion here reads the CALLER.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const stagePanel = readFileSync(
  join(ROOT, 'app/admin/research/[projectId]/_sections/ResearchStagePanel.tsx'),
  'utf8',
);
const page = readFileSync(join(ROOT, 'app/admin/research/[projectId]/page.tsx'), 'utf8');
const runView = readFileSync(
  join(ROOT, 'app/admin/research/components/ResearchRunView.tsx'),
  'utf8',
);

describe('the rebuilt run view is actually mounted', () => {
  it('ResearchStagePanel imports and renders ResearchRunView', () => {
    expect(stagePanel).toMatch(/import ResearchRunView from ['"]\.\.\/\.\.\/components\/ResearchRunView['"]/);
    expect(stagePanel).toMatch(/<ResearchRunView/);
  });

  it('the page still renders ResearchStagePanel, so the chain reaches a screen', () => {
    expect(page).toMatch(/<ResearchStagePanel/);
  });

  it('the stage panel no longer stacks the four components that disagreed', () => {
    // The specific failure: RunConsoleBar's "Finished in 2 minutes" rendered directly above
    // ResearchRunPanel's "Research Failed", describing one run. They may not sit side by side
    // again — the diff and report card now live inside the view, as tabs.
    //
    // Asserted on the IMPORT, not on the JSX. The first draft of this test searched for `<Name`
    // and matched the doc comment above, which quotes the very stack it is describing — the probe
    // failing on its own prose rather than on the code. An import cannot be a quotation.
    for (const gone of ['RunConsoleBar', 'ResearchRunPanel']) {
      expect(stagePanel).not.toMatch(new RegExp(`^import .*${gone}`, 'm'));
    }
  });

  it('the run view takes its numbers from the single run-state source', () => {
    expect(runView).toMatch(/from ['"]\.\/useRunState['"]/);
    expect(runView).toMatch(/from ['"]@\/lib\/research\/run-state['"]/);
  });

  it('the run view does NOT re-derive status with its own fetch', () => {
    // Every fetch on this screen belongs to the hook. A fetch here would be a second opinion, and
    // second opinions are the whole defect.
    expect(runView).not.toMatch(/\bfetch\(/);
  });

  it('only a genuine problem may render the status card red', () => {
    // `isProblem` is false for cancelled, interrupted and budget-stopped runs. Keying the red tone
    // off anything else — "is it done", "is it not success" — is how a $2.00 ceiling rendered as a
    // crash.
    expect(runView).toMatch(/outcome\.isProblem \? 'bad'/);
  });
});

describe('the hook keeps the stale-run guard the panel never had', () => {
  const hook = readFileSync(join(ROOT, 'app/admin/research/components/useRunState.ts'), 'utf8');

  it('uses the run id the POST returns instead of discarding the body', () => {
    // ResearchRunPanel read the response only to consume it:
    //   await res.json().catch(() => ({})); // consume response body
    // …while the API route's comment claimed the panel kept the runId. It never did.
    expect(hook).toMatch(/if \(data\.runId\) expectedRunIdRef\.current = data\.runId/);
  });

  it('drops a payload naming a different run', () => {
    expect(hook).toMatch(/isPayloadForRun\(data\.runId, expectedRunIdRef\.current\)/);
  });

  it('treats a cancel as cancelled, not as failed', () => {
    // The old panel set 'failed' + "Pipeline cancelled by user" on a successful cancel.
    expect(hook).toMatch(/status: 'cancelled'/);
    expect(hook).not.toMatch(/setPipelineStatus\('failed'\)/);
  });
});
