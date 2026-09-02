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
    // ── WHAT THIS GUARD IS ACTUALLY FOR ────────────────────────────────────────────────────────
    //
    // The defect is a second opinion about the RUN: a component reading the status or console
    // endpoint on its own interval and rendering its own answer. That is what put "Finished in 2
    // minutes" beside "Research Failed".
    //
    // It was first written as a blanket ban on `fetch(` in this file, and that over-reached — it
    // failed the moment the view gained a button that UN-MARKS A DUPLICATE, which is a mutation
    // and reads no status at all. A guard whose letter is wider than its purpose gets edited by
    // whoever it blocks next, and then it stops guarding anything.
    //
    // So it names the endpoints that carry run state. Reading either of those here is the bug;
    // POSTing a correction is not.
    for (const stateEndpoint of ['/pipeline', '/run-console']) {
      expect(runView, `${stateEndpoint} must be read only by useRunState`)
        .not.toContain(`${stateEndpoint}\``);
    }
    // And the status must come from the hook, not from anything this file computed.
    expect(runView).toContain('const run = useRunState(projectId)');
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

describe('the action bar does not claim a run is running (plan D1)', () => {
  it('no longer renders "AI analysis is running" from a STAGE check', () => {
    // ── THE FIFTH OPINION ──────────────────────────────────────────────────────────────────────
    //
    // The bar's condition was:
    //
    //     const isAnalyzing = project.status === 'analyzing' || currentStage === 'research';
    //
    // — a fact about the WORKFLOW STAGE, rendered with a spinner as a claim about a RUN. Being on
    // the Research & Analysis step is not the same as a run being in progress, and the two come
    // apart constantly: a finished run, a cancelled one, a project never started at all.
    //
    // Caught by driving the browser on 2026-09-01: this bar claimed a live run, spinner and all,
    // directly above a run view correctly reading "No run has started yet." Four panels had already
    // been collapsed into one and this line still disagreed with the result.
    //
    // Asserted on code, not raw text: the sentence survives in a comment explaining the fix.
    const codeOnly = page
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join('\n');
    expect(codeOnly).not.toMatch(/AI analysis is running/);
  });

  it('defers to the run view instead of describing the run itself', () => {
    expect(page).toMatch(/The run&apos;s current status is shown below/);
  });

  it('and the page still does not poll for run status of its own', () => {
    // If the bar ever needs the real status it must come from useRunState, not a second fetch.
    expect(page).not.toMatch(/\/pipeline`\s*,\s*\{\s*method: 'GET'/);
  });
});
