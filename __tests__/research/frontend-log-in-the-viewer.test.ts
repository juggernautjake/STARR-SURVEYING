import { describe, it, expect, beforeEach } from 'vitest';
import { frontendLogEntries, describeFrontendLog, BROWSER_LAYER } from '@/lib/research/frontend-log';
import { addBreadcrumb, addConsoleLog, resetSession } from '@/lib/errorHandler';
import { readCode, readSource } from '../helpers/read-source';

// ── F4 — THE OWNER ASKED FOR BOTH LOGS AND THE VIEWER SHOWED ONE ────────────────────────────────
//
// > "We need to be able to immediately retreive the worker and frontend logs. Really, both logs
// >  should be displayed in the pipeline log viewer."
//
// Everything the browser knew about a run — the POST that started it and what it answered, every
// poll and its status, a failed fetch, a console error thrown while rendering the result — lived in
// a buffer that surfaced only if somebody filed an error report.
//
// Not cosmetic. Several contradictions reported on 2026-09-03 were disagreements BETWEEN the two
// halves: a panel latching "Research Failed" while the worker went on retrieving documents; a poll
// landing on a previous run's cached result. Neither is visible in a worker log, because neither
// happened in the worker.

describe('browser events become log entries the viewer already understands', () => {
  beforeEach(() => resetSession());

  it('an API call and its response both appear', () => {
    addBreadcrumb({ type: 'api_call', description: 'POST /api/admin/research/x/pipeline', data: { url: '/api/admin/research/x/pipeline', method: 'POST' } });
    addBreadcrumb({ type: 'api_response', description: 'POST … → 202', data: { url: '/api/admin/research/x/pipeline', method: 'POST', status: 202 } });
    const entries = frontendLogEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.input).toBe('/api/admin/research/x/pipeline');
    expect(entries[0]!.method).toBe('POST');
  });

  it('every entry says it happened in the browser', () => {
    // The one thing this must never do is let a browser entry pass for a worker one.
    addBreadcrumb({ type: 'click', description: 'Re-run analysis' });
    addConsoleLog({ level: 'error', message: 'Cannot read properties of null' });
    for (const e of frontendLogEntries()) expect(e.layer).toBe(BROWSER_LAYER);
  });

  it('a failed request is a failure, and a redirect is not a success', () => {
    addBreadcrumb({ type: 'api_response', description: 'GET → 500', data: { status: 500 } });
    addBreadcrumb({ type: 'api_response', description: 'GET → 401', data: { status: 401 } });
    // A 3xx on an API call is usually an auth bounce. Reading it as success is how a signed-out
    // session looks like a working one.
    addBreadcrumb({ type: 'api_response', description: 'GET → 302', data: { status: 302 } });
    addBreadcrumb({ type: 'api_response', description: 'GET → 200', data: { status: 200 } });
    const s = frontendLogEntries().map((e) => e.status);
    expect(s).toEqual(['fail', 'fail', 'partial', 'success']);
  });

  it('a console warning is a warning, not a failure', () => {
    // The Warnings filter is where an operator looks for "something was odd". Burying warnings
    // under Errors makes both lists lie.
    addConsoleLog({ level: 'warn', message: 'React key collision' });
    addConsoleLog({ level: 'error', message: 'boom' });
    const byStatus = Object.fromEntries(frontendLogEntries().map((e) => [e.details, e.status]));
    expect(byStatus['React key collision']).toBe('warn');
    expect(byStatus['boom']).toBe('fail');
  });

  it('an error carries its message in `error`, so the Errors filter and the export both find it', () => {
    addConsoleLog({ level: 'error', message: 'TypeError: x is not a function' });
    expect(frontendLogEntries()[0]!.error).toContain('TypeError');
  });
});

describe('bounded to the run, not to the session', () => {
  beforeEach(() => resetSession());

  it('entries from before the run are excluded', () => {
    // The buffers are session-wide and hold the last 30 actions. Without the bound, a five-minute
    // run is shown alongside whatever the operator did before starting it.
    addBreadcrumb({ type: 'click', description: 'opened the projects list' });
    const runStart = new Date(Date.now() + 1000).toISOString();
    const kept = frontendLogEntries(runStart);
    expect(kept).toHaveLength(0);
  });

  it('CONTROL: without a bound the same entry IS returned', () => {
    // Otherwise the test above would pass just as well against a function that returns nothing.
    addBreadcrumb({ type: 'click', description: 'opened the projects list' });
    expect(frontendLogEntries()).toHaveLength(1);
    expect(frontendLogEntries(null)).toHaveLength(1);
  });
});

describe('an empty browser half explains itself', () => {
  beforeEach(() => resetSession());

  it('says why rather than looking broken', () => {
    const line = describeFrontendLog([]);
    expect(line).toContain('session-wide');
    expect(line).toContain('a reload clears them');
  });

  it('and counts the failures when there are some', () => {
    addConsoleLog({ level: 'error', message: 'boom' });
    addBreadcrumb({ type: 'click', description: 'clicked' });
    expect(describeFrontendLog(frontendLogEntries())).toContain('1 of them failures');
  });
});

describe('the viewer shows it — assert the CALLER', () => {
  const PANEL = 'app/admin/research/components/PipelineProgressPanel.tsx';

  it('CONTROL: the probe is reading the panel', () => {
    expect(readCode(PANEL)).toContain('mergeLogEntries');
  });

  it('the browser half is merged in, not shown separately', () => {
    // `PipelineLogEntry` is the shape the viewer already filters, orders, de-duplicates and copies.
    // A parallel panel would need its own filter, ordering and export, and the two would drift.
    const s = readCode(PANEL);
    // Since 2026-09-03 the bound falls back to the first worker entry when the caller passes no
    // run start — the review page's case — so the browser half can never again be unbounded.
    expect(s).toContain('frontendLogEntries(browserBound)');
    // Line endings vary (the file is CRLF on Windows checkouts), so match across whitespace.
    expect(s).toMatch(/runStartedAt\s*\?\?\s*firstTimestamp\(logProp\)\s*\?\?\s*firstTimestamp\(loadedLog\)/);
    expect(s).toContain('mergeLogEntries(mergeLogEntries(logProp, loadedLog), browserLog)');
  });

  it('a browser console error reaches the Errors filter', () => {
    // The filter was written against worker sources only, so `console.error` fell through it.
    expect(readCode(PANEL)).toContain("e.source === 'console.error'");
  });

  it('it is not computed on the server, where the buffers do not exist', () => {
    expect(readCode(PANEL)).toContain("typeof window === 'undefined' ? []");
  });

  it('the run start reaches the panel from the status payload', () => {
    // The worker has always sent `startedAt`; nothing read it.
    const s = readCode('app/admin/research/components/PropertySearchPanel.tsx');
    expect(s.split('runStartedAt={pipelineResult?.startedAt ?? null}').length - 1).toBe(2);
    expect(s).toContain('startedAt?: string;');
  });

  // ── THE SCREEN THE OPERATOR WATCHES (2026-09-03) ──────────────────────────────────────────
  //
  // Every assertion above is about PipelineProgressPanel, and the 2026-09-03 platform audit found
  // that the panel's only mounts that pass `runStartedAt` sit in PropertySearchPanel branches the
  // product never renders. The live run screen is ResearchRunView's Activity tab, mounted by
  // ResearchStagePanel from the project page. This is the caller-side check the guard lacked.
  it('the LIVE run view merges the browser half too, bounded by the run start', () => {
    const view = readCode('app/admin/research/components/ResearchRunView.tsx');
    expect(view).toContain("import { frontendLogEntries } from '@/lib/research/frontend-log'");
    expect(view).toContain('frontendLogEntries(startedAt)');
    expect(view).toContain('mergeLogEntries(logs, browserLog)');
    expect(view).toContain('startedAt={state.startedAt ?? null}');
    expect(view).toContain("typeof window === 'undefined' ? []");
  });

  it('and that view is what the product mounts during a run', () => {
    const stage = readCode('app/admin/research/[projectId]/_sections/ResearchStagePanel.tsx');
    expect(stage).toMatch(/<ResearchRunView\s/);
    const page = readCode('app/admin/research/[projectId]/page.tsx');
    expect(page).toMatch(/<ResearchStagePanel\s/);
  });

  it('and the reason it is recomputed each render is written down', () => {
    // Module-level mutable buffers: a memo keyed on anything stable shows a stale browser half
    // beside a live worker one.
    expect(readSource(PANEL)).toContain('Recomputed on every render on purpose');
  });
});
