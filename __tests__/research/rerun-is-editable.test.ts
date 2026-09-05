// __tests__/research/rerun-is-editable.test.ts — plan C4.
//
// The owner's first request, in their words: "we need to be able to fully edit the run by adding or
// removing information, or changing the settings of the run, such as whether or not it uses
// texasfile".
//
// A dialog that COLLECTS those values and then drops them on the way to the POST would look
// completely correct in a screenshot. That is the failure mode these tests exist for, so every
// assertion follows a value along the chain rather than checking that a field exists:
//
//     RerunDialog → page.handleRerunResearch → pendingRunInput → ResearchStagePanel
//                 → ResearchRunView → useRunState.start → POST body.settings

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * The file with its comments removed.
 *
 * Needed because these files explain themselves by QUOTING the code they replaced — the re-run
 * dialog's header quotes the old "permanently deleted" warning, and the reset route's comment
 * quotes the `.from('research_documents').delete()` it no longer performs. A probe searching the
 * raw text finds those quotations and reports the old behaviour as still present.
 *
 * That is this repo's most-repeated self-inflicted wound: the probe being the bug. Both assertions
 * below failed on the first run for exactly this reason, and the actual code was verified by hand
 * before the probe was changed — not the other way round.
 */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

const dialog = read('app/admin/research/components/RerunDialog.tsx');
const page = read('app/admin/research/[projectId]/page.tsx');
const stage = read('app/admin/research/[projectId]/_sections/ResearchStagePanel.tsx');
const view = read('app/admin/research/components/ResearchRunView.tsx');
const hook = read('app/admin/research/components/useRunState.ts');
const pipelineRoute = read('app/api/admin/research/[projectId]/pipeline/route.ts');

describe('the dialog offers every input and setting a run can be given', () => {
  it('offers the four property inputs', () => {
    for (const field of ['address', 'county', 'parcelId', 'ownerName']) {
      expect(dialog).toMatch(new RegExp(`value=\\{form\\.${field}\\}`));
    }
  });

  it('offers free-text starting information, which had no field at all', () => {
    expect(dialog).toMatch(/value=\{form\.operatorNotes\}/);
  });

  it('discloses the $10 refundable TexasFile earmark (U2 — show where the money goes)', () => {
    // Owner: turning TexasFile on adds a flat $10, refunded if it finds nothing. The operator must
    // see that cost model at the toggle, not discover it on the invoice.
    expect(dialog).toMatch(/\$10 earmarked for TexasFile/);
    expect(dialog).toMatch(/refunded/);
  });

  it('offers the TexasFile switch by name', () => {
    expect(dialog).toMatch(/checked=\{form\.allowPaidDocuments\}/);
    expect(dialog).toMatch(/TexasFile/);
  });

  it('offers both ceilings and the source plan', () => {
    expect(dialog).toMatch(/value=\{form\.maxResearchTimeMinutes\}/);
    expect(dialog).toMatch(/value=\{form\.maxCostUsd\}/);
    expect(dialog).toMatch(/value=\{form\.mode\}/);
  });

  it('seeds from what the PREVIOUS RUN was told, not from the project', () => {
    // A project can be edited between runs. Presenting its current values as "what run 1 used" is
    // how somebody re-runs with a $2.00 ceiling believing they had raised it.
    expect(dialog).toMatch(/\/runs`\)/);
    expect(dialog).toMatch(/latest\?\.settings/);
  });

  it('no longer promises to delete the previous run\'s documents', () => {
    // The old dialog said "All data from the previous run will be permanently deleted, including
    // pipeline-fetched documents". It was accurately describing code that did the opposite of what
    // was asked for.
    expect(codeOnly(dialog)).not.toMatch(/permanently deleted/i);
    expect(dialog).toMatch(/Keep every document from previous runs/i);
  });

  it('warns that a $0 ceiling is the same instruction as switching paid documents off', () => {
    expect(dialog).toMatch(/form\.maxCostUsd === 0 && form\.allowPaidDocuments/);
  });
});

describe('the chosen settings survive all the way to the worker', () => {
  it('the dialog hands its settings to the caller', () => {
    expect(dialog).toMatch(/onConfirm\(\{/);
    expect(dialog).toMatch(/settings,/);
  });

  it('the page holds them across the reset-and-remount', () => {
    // The reset unmounts the run panel. Without somewhere to keep them, the settings would be
    // confirmed and then lost between the PATCH and the POST.
    expect(page).toMatch(/const \[pendingRunInput, setPendingRunInput\] = useState<StartRunInput \| null>\(null\)/);
    expect(page).toMatch(/setPendingRunInput\(input\)/);
  });

  it('the page PASSES them down — not merely declares them', () => {
    // A useState nothing reads is this repo's signature defect, and this exact variable was
    // declared-but-unpassed in the first draft of this change.
    expect(page).toMatch(/pendingRunInput=\{pendingRunInput\}/);
  });

  it('the stage panel forwards them', () => {
    expect(stage).toMatch(/pendingRunInput=\{pendingRunInput\}/);
  });

  it('the view starts the run WITH them rather than with the four search fields', () => {
    expect(view).toMatch(/run\.start\(pendingRunInput \?\?/);
  });

  it('the hook puts them in the POST body', () => {
    expect(hook).toMatch(/settings: input\.settings/);
    expect(hook).toMatch(/operatorNotes: input\.operatorNotes/);
  });

  it('the API route forwards settings and notes to the worker', () => {
    // The operator's own notes still reach the run. G1 merged the attachment report into the same
    // field — "6 of your 20 documents were attached" belongs with the run, not in a server log — so
    // this asserts the notes are IN the payload rather than pinning the exact expression, which
    // would have to be rewritten every time something else is added to the same line.
    expect(pipelineRoute).toMatch(/operatorNotes:/);
    expect(pipelineRoute, "the operator's own notes were dropped").toMatch(/body\.operatorNotes\?\.trim\(\)/);
    expect(pipelineRoute).toMatch(/\.\.\.\(body\.settings \?\? \{\}\)/);
    expect(pipelineRoute).toMatch(/settings,/);
  });
});

describe('a re-run keeps what earlier runs produced', () => {
  const researchRoute = read('app/api/admin/research/route.ts');

  it('supersedes the previous run\'s documents instead of deleting them', () => {
    expect(researchRoute).toMatch(/superseded_at: new Date\(\)\.toISOString\(\)/);
  });

  it('does not DELETE research_documents on a re-run', () => {
    // The storage objects were never removed either, so every re-run also left orphaned files in
    // the bucket with nothing pointing at them.
    const code = codeOnly(researchRoute);
    const resetBlock = code.slice(code.indexOf('clear_pipeline_documents'));
    expect(resetBlock).not.toMatch(/\.from\('research_documents'\)\s*\n?\s*\.delete\(\)/);
  });

  it('clears the worker\'s in-process memory of the previous run', () => {
    // Clearing rows is not enough: the worker holds the previous run's terminal result in a Map
    // that nothing written to Postgres can reach.
    expect(researchRoute).toMatch(/await resetWorkerState\(id\)/);
    expect(researchRoute).toMatch(/research\/reset\//);
  });

  it('records why the run exists, so a thinner report stays explicable later', () => {
    expect(dialog).toMatch(/'rerun_edited' : 'rerun_same'/);
  });
});

describe('the two dedicated gather budgets (W1)', () => {
  const dialog = read('app/admin/research/components/RerunDialog.tsx');
  it('offers a TexasFile budget input and an other-sources budget input', () => {
    expect(dialog).toMatch(/data-testid="texasfile-budget"/);
    expect(dialog).toMatch(/data-testid="other-budget"/);
    expect(dialog).toMatch(/TexasFile budget \(USD\)/);
    expect(dialog).toMatch(/Other-sources budget \(USD\)/);
  });
  it('sends both budgets to the run', () => {
    expect(dialog).toMatch(/texasfileBudgetUsd: form\.texasfileBudgetUsd/);
    expect(dialog).toMatch(/otherBudgetUsd: form\.otherBudgetUsd/);
  });
  it('defaults to $15 TexasFile and $5 other', () => {
    expect(dialog).toMatch(/texasfileBudget: 15/);
    expect(dialog).toMatch(/otherBudget: 5/);
  });
});

describe('the FIRST run also goes through the settings dialog (W1.3)', () => {
  const page = read('app/admin/research/[projectId]/page.tsx');
  it('Start AI analysis opens the run-settings dialog instead of auto-starting with defaults', () => {
    // handleStartAnalysis now opens the dialog (setShowRerunConfirm(true)) so the operator picks the
    // checklist + budgets before any spend.
    const at = page.indexOf('function handleStartAnalysis()');
    expect(at).toBeGreaterThan(0);
    const body = page.slice(at, at + 300);
    expect(body).toMatch(/setShowRerunConfirm\(true\)/);
    expect(body).not.toMatch(/setShouldAutoStartPipeline\(true\)/);
  });
  it('the dialog carries its settings to the run via pendingRunInput', () => {
    expect(page).toMatch(/onConfirm=\{\(input\) => void handleRerunResearch\(input\)\}/);
    expect(page).toMatch(/setPendingRunInput\(input\)/);
  });
});
