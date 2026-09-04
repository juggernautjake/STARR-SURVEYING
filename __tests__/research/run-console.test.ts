// What the run is doing, and what it has spent (research plan R22).
//
// The pieces all existed and none reached the operator. R4 writes every model call and paid page to
// `research_usage_events`; R5 gives each run a wall-clock ceiling and records what the ceiling made
// it skip; R3 keeps the phase, heartbeat and spend on `research_runs`. The run panel showed a
// progress list and a cancel button — no cost, no elapsed-versus-budget, and no sight of the work a
// budget quietly dropped.
//
// So an operator watching a 25-minute run could not answer either question that matters: how much
// has this cost, and is it going to finish.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  STALE_HEARTBEAT_MS,
  buildConsole,
  summariseSpend,
  timeStatus,
  type RunRow,
  type UsageRow,
} from '@/lib/research/run-console';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const NOW = Date.parse('2026-08-02T12:00:00.000Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const run = (over: Partial<RunRow> = {}): RunRow => ({
  id: 'run-1',
  status: 'running',
  phase: 'Deed chain',
  message: 'Reading instrument 2019-12345',
  started_at: minsAgo(12),
  heartbeat_at: minsAgo(1),
  finished_at: null,
  cost_usd: 1.25,
  paid_pages: 2,
  limits: { maxMinutes: 30 },
  skipped_work: [],
  budget_summary: null,
  failure_reason: null,
  ...over,
});

const usage = (type: string, usd: number): UsageRow => ({
  event_type: type, cost_usd: usd, model: null, created_at: minsAgo(2),
});

describe('$0.00 is the dangerous number', () => {
  it('distinguishes "nothing recorded" from "nothing spent"', () => {
    // R4 was built because research_usage_events had zero rows while everybody assumed spend was
    // being tracked. A console showing "$0.00" cannot tell a free run from a broken writer.
    const s = summariseSpend([]);
    expect(s.noEventsRecorded).toBe(true);
    expect(s.headline).toContain('not the same as it having cost nothing');
  });

  it('totals and breaks down by what the money went on', () => {
    const s = summariseSpend([usage('ai_call', 0.03), usage('ai_call', 0.05), usage('document_purchase', 1)]);
    expect(s.totalUsd).toBeCloseTo(1.08);
    expect(s.byType.ai_call).toEqual({ count: 2, usd: 0.08 });
    expect(s.byType.document_purchase!.usd).toBe(1);
    expect(s.noEventsRecorded).toBe(false);
  });
});

describe('elapsed against the ceiling', () => {
  it('reports the fraction used when a ceiling exists', () => {
    const t = timeStatus(run(), NOW);
    expect(t.budgetMs).toBe(30 * 60_000);
    expect(t.fractionUsed).toBeCloseTo(12 / 30, 2);
    expect(t.headline).toBe('12 of 30 minutes used.');
  });

  it('says "no limit set" rather than drawing an empty bar', () => {
    // A bar at 0% reads as "plenty of time left", which is a claim nobody made.
    const t = timeStatus(run({ limits: {} }), NOW);
    expect(t.fractionUsed).toBeNull();
    expect(t.headline).toContain('no time limit is configured');
  });

  it('measures a finished run to when it finished, not to now', () => {
    const t = timeStatus(
      run({ status: 'complete', started_at: minsAgo(60), finished_at: minsAgo(40) }),
      NOW,
    );
    expect(Math.round(t.elapsedMs / 60_000)).toBe(20);
  });

  it('spots a run whose process has gone quiet', () => {
    const t = timeStatus(run({ heartbeat_at: minsAgo(15) }), NOW);
    expect(t.looksStalled).toBe(true);
    expect(t.headline).toContain('will be marked interrupted');
  });

  it('uses the same staleness definition as the worker', () => {
    // Two definitions of "stalled" is how a run shows alive on one screen and dead on another.
    expect(STALE_HEARTBEAT_MS).toBe(10 * 60_000);
    expect(timeStatus(run({ heartbeat_at: minsAgo(5) }), NOW).looksStalled).toBe(false);
  });

  it('does not call a finished run stalled', () => {
    expect(timeStatus(run({ status: 'complete', heartbeat_at: minsAgo(90) }), NOW).looksStalled).toBe(false);
  });
});

describe('the one line an operator actually reads', () => {
  it('leads with a stall over everything else', () => {
    const c = buildConsole(run({ heartbeat_at: minsAgo(20) }), [usage('ai_call', 0.5)], NOW);
    expect(c.headline).toContain('Nothing has been heard');
  });

  it('says an interrupted run did not fail', () => {
    const c = buildConsole(run({ status: 'interrupted', cost_usd: 12 }), [], NOW);
    expect(c.headline).toContain('did not fail');
    expect(c.headline).toContain('$12.00');
  });

  it('refuses to call a budget-truncated run simply finished', () => {
    // A run that finished "successfully" having skipped the deed chain is not a run that finished.
    const c = buildConsole(
      run({
        status: 'complete', finished_at: minsAgo(0),
        skipped_work: [{ what: 'Deed chain beyond 1974', reason: 'time ceiling reached' }],
      }),
      [usage('ai_call', 0.4)], NOW,
    );
    expect(c.headline).toContain('before treating this as complete');
    expect(c.skipped).toEqual([{ what: 'Deed chain beyond 1974', reason: 'time ceiling reached', partial: null }]);
  });

  it('a step that stopped at the limit with its work kept is said so, not called skipped (run 5)', () => {
    const c = buildConsole(
      run({
        status: 'complete', finished_at: minsAgo(0),
        skipped_work: [{ step: 'clerk deed search', reason: 'it did not finish', partial: '10 document(s) kept' }],
      }),
      [usage('ai_call', 0.4)], NOW,
    );
    expect(c.headline).toContain('stopped mid-way and their work was kept');
    expect(c.headline).toContain('clerk deed search (10 document(s) kept)');
    expect(c.headline).not.toContain('were skipped');
    expect(c.skipped[0].partial).toBe('10 document(s) kept');
  });

  it('names the failure reason instead of just "failed"', () => {
    const c = buildConsole(run({ status: 'failed', failure_reason: 'Kofile login rejected' }), [], NOW);
    expect(c.headline).toContain('Kofile login rejected');
  });

  it('fills in a missing reason rather than showing "undefined"', () => {
    expect(buildConsole(run({ status: 'failed' }), [], NOW).headline).toContain('no reason recorded');
  });

  it('only offers cancel on a run that is running', () => {
    // The worker answers a cancel for anything else with a 404, and a button that cannot work is how
    // an operator learns to distrust the console.
    expect(buildConsole(run(), [], NOW).canCancel).toBe(true);
    expect(buildConsole(run({ status: 'complete' }), [], NOW).canCancel).toBe(false);
    expect(buildConsole(run({ status: 'interrupted' }), [], NOW).canCancel).toBe(false);
  });
});

describe('the surface', () => {
  it('does not report a failed read as "no run"', () => {
    // An operator told "nothing is running" while a 25-minute run burns money is worse than one told
    // nothing at all.
    const route = read('app/api/admin/research/[projectId]/run-console/route.ts');
    expect(route).toContain('runRes.error');
    expect(route).toContain('not the same as no run being active');
  });

  it('keeps a broken spend read visible instead of showing a confident zero', () => {
    // RunConsoleBar carried this until 2026-09-02. The rebuild absorbed the console into the one
    // run view and DROPPED this caveat on the way: the route went on sending `usageFailed` and
    // nothing read it, so a run whose usage query errored displayed a confident total. Restored
    // 2026-09-02 — which is what this guard was for. It asserts all three hops, because the
    // feature disappeared in the middle one.
    const route = read('app/api/admin/research/[projectId]/run-console/route.ts');
    expect(route).toContain('usageFailed');

    const hook = read('app/admin/research/components/useRunState.ts');
    expect(hook, 'the hook drops usageFailed on the floor again').toContain('data.usageFailed');

    const state = read('lib/research/run-state.ts');
    expect(state).toContain('spendIncomplete');

    const view = read('app/admin/research/components/ResearchRunView.tsx');
    expect(view).toContain('state.spendIncomplete');
    expect(view).toContain('the cost shown above is incomplete');
  });

  it('does not render "no spend recorded" as a zero', () => {
    // The console showed this as a colour; the one view shows it as a value and a hint. Same
    // guarantee, which is that $0.00 and "nothing was written" are different facts — conflating
    // them is how a broken spend writer looked like a free run for months.
    const view = read('app/admin/research/components/ResearchRunView.tsx');
    expect(view).toContain('state.spendUnrecorded');
    // The dash, not a formatted zero.
    // B1 widened this the same day: an UNREAD cost (`spendUsd === null`, before the console has been
    // fetched) now renders as "—" too, because `(null ?? 0).toFixed(2)` was a confident $0.00. The
    // guarantee here is unchanged — "nothing was recorded" must not read as a zero — so the
    // assertion follows the condition rather than pinning the narrower one it used to be.
    expect(view).toContain("state.spendUsd === null || state.spendUnrecorded");
    expect(view, 'the dash is gone').toContain("? '—'");
    expect(view).toContain('NOT the same as it having cost nothing');
  });

  it('stops polling once the run is not running', () => {
    // A finished run does not change, and polling it every ten seconds is load nobody asked for.
    //
    // This read RunConsoleBar, which polled itself. In the one-hook design the timers are started
    // and stopped from the DERIVED lifecycle, so the guarantee is now held in one place instead of
    // in each component that remembered to check — the reason the four panels could disagree about
    // whether a run was still going.
    const hook = read('app/admin/research/components/useRunState.ts');
    expect(hook).toContain('if (isActive(lifecycle))');
    expect(hook).toContain('stopTimers();');
  });

  it('is actually mounted on the project page', () => {
    // "Authored but not wired" is this repo's most common defect.
    const page = read('app/admin/research/[projectId]/page.tsx');
    // ── THE GUARD FOLLOWED THE CODE ──────────────────────────────────────────────────────────
    //
    // This asserted on `[projectId]/page.tsx`, and the stage-2 block moved into
    // `_sections/ResearchStagePanel.tsx` (B1a). The check went red, correctly.
    //
    // A guard that names a FILE has to be pointed at the file after a move — but pointing it at
    // the section alone would be weaker than what it replaced, because a section nothing mounts
    // satisfies it just as well. So it asserts BOTH: the section renders it, AND the page mounts
    // the section. That is the same two-part shape the county-check guard took when C3 extracted
    // `CountyNote`.
    // RunConsoleBar the COMPONENT is retired (plan E1). Its independence is exactly what let it
    // render "Finished in 2 minutes for $0.02" beside a panel reading "Research Failed" about
    // the same run, so the fix was to absorb it rather than to keep two opinions in sync.
    //
    // The guard therefore asserts what it always actually meant: the run-console DATA reaches
    // the screen. A retired component must not become a quietly dropped feature.
    const HOOK = read('app/admin/research/components/useRunState.ts');
    expect(HOOK).toContain('/run-console');

    const VIEW = read('app/admin/research/components/ResearchRunView.tsx');
    // Cost and elapsed-vs-budget, the two questions the console existed to answer.
    expect(VIEW).toContain('state.spendUsd');
    expect(VIEW).toContain('state.budgetMs');
    // And the work a ceiling silently dropped, which was the third.
    expect(VIEW).toContain('state.skipped');

    expect(read('app/admin/research/[projectId]/_sections/ResearchStagePanel.tsx'))
      .toContain('<ResearchRunView');
    expect(page).toMatch(/<ResearchStagePanel\s/);
  });
});
