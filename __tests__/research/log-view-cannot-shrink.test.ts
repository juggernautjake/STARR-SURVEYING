import { describe, it, expect } from 'vitest';
import { readCode, readSource } from '../helpers/read-source';

// ── "THE LOGS DISAPPEARED WHEN I CLICKED COPY" ──────────────────────────────────────────────────
//
// Reported 2026-09-03. The copy button deleted nothing. `PipelineProgressPanel` chose ONE log
// source, whole:
//
//     const log = (logProp && logProp.length > 0) ? logProp : (loadedLog ?? undefined);
//
// While a run streams, `logProp` carries every entry the worker emitted. The moment it empties —
// the run ends, the parent re-renders, or any state change in this component causes a render where
// the parent has since cleared it — the view silently falls back to `loadedLog`: whatever was
// persisted, which for that run was a single crash line out of 163 minutes.
//
// `handleCopyAllLogs` calls `setAllCopied(true)`. That renders. The render picked the thin source.
// The copy button was simply the most likely thing to click while a live log was on screen.

const PANEL = 'app/admin/research/components/PipelineProgressPanel.tsx';

describe('the log view merges its two sources', () => {
  const code = readCode(PANEL);

  it('CONTROL: stripping kept the code and dropped the prose', () => {
    expect(code).toContain('mergeLogEntries');
    expect(code).not.toContain('most likely thing to click');
  });

  it('the pick-one-source ternary is gone', () => {
    expect(code, 'the swap is back — a render can shrink the log again')
      .not.toMatch(/logProp && logProp\.length > 0\s*\)\s*\?\s*logProp/);
  });

  it('uses a merge instead', () => {
    expect(code).toMatch(/const log = mergeLogEntries\(logProp, loadedLog\)/);
  });

  it('de-duplicates, so a merge does not show every entry twice', () => {
    expect(code).toMatch(/new Map<string, PipelineLogEntry>\(\)/);
  });

  it('sorts by time, so a merged log still reads as a sequence', () => {
    expect(code).toMatch(/\.sort\(/);
  });
});

describe('one Copy All Logs button, not three', () => {
  const src = readSource(PANEL);

  it('renders the copy control exactly once', () => {
    // Three identical buttons called the same handler with the same result — panel header,
    // log-stream header, log-stream footer. "we have a bunch of the copy all logs buttons".
    const rendered = (readCode(PANEL).match(/onClick=\{handleCopyAllLogs\}/g) ?? []).length;
    expect(rendered, `found ${rendered} copy buttons`).toBe(1);
  });

  it('the survivor is the one attached to the log stream', () => {
    // It sits on the thing it acts on. A control repeated three times does not make an action
    // easier to find; it makes a reader wonder whether the three do different things.
    expect(readCode(PANEL)).toMatch(/ppanel__logstream-copy-btn[^]*?onClick=\{handleCopyAllLogs\}/);
  });

  it('and the footer keeps its entry count, which was the useful part', () => {
    expect(src).toMatch(/logstream-footer/);
  });
});
