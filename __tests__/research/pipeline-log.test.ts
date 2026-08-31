// __tests__/research/pipeline-log.test.ts — D2.
//
// ── "DONE" WAS DEFINED TWICE, DIFFERENTLY ───────────────────────────────────────────────────────
//
// `PipelineProgressPanel` had an allowlist of four statuses. `ResearchRunPanel`, polling the same
// endpoint, had a denylist of two. They agreed only because the worker returns exactly
// `running` | `complete` | `partial` | `failed` (`worker/src/index.ts`), with the app mapping
// `complete` → `success`.
//
// They fail in OPPOSITE directions the moment that set grows:
//
//   · a new non-terminal status (`queued`, `retrying`) is DONE to the denylist — the run panel stops
//     polling and reports the run finished — and still-running to the allowlist, so the panel next
//     to it goes on spinning;
//   · a new terminal status (`cancelled`, `timeout`) is done to the denylist and STILL RUNNING to
//     the allowlist, so the progress panel spins forever on a run that has stopped.
//
// One definition now, listing both sets explicitly, and an unknown status counts as still running —
// the safe direction, because declaring a run finished when it is not is the error that loses work.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  isDoneStatus, statusIcon, formatTimestamp, formatLogAsText, formatDetailedLogAsText,
  isMessageEntry, TERMINAL_STATUSES, ACTIVE_STATUSES, type LogEntryLike,
} from '../../app/admin/research/components/pipeline-log';

const entry = (over: Partial<LogEntryLike> = {}): LogEntryLike => ({
  layer: 'retrieval', source: 'texasfile', method: 'search', status: 'success',
  dataPointsFound: 0, duration_ms: 0, ...over,
});

describe('one definition of done', () => {
  it('covers every terminal status the worker can return', () => {
    for (const s of ['complete', 'partial', 'failed', 'success']) {
      expect(isDoneStatus(s), s).toBe(true);
    }
  });

  it('and cancelled, which neither definition covered', () => {
    // The cancel route writes `status: 'configure'` to the project today, so this value does not
    // reach the panel yet. It is listed because the allowlist would have spun forever if it did.
    expect(isDoneStatus('cancelled')).toBe(true);
  });

  it('treats every active status as not done', () => {
    for (const s of ACTIVE_STATUSES) expect(isDoneStatus(s), s).toBe(false);
  });

  it('treats an UNKNOWN status as still running, not as finished', () => {
    // The safe direction. Declaring a run finished when it is not stops the polling and loses the
    // rest of the log; leaving a spinner up is recoverable.
    expect(isDoneStatus('something-new')).toBe(false);
    expect(isDoneStatus(null)).toBe(false);
    expect(isDoneStatus(undefined)).toBe(false);
  });

  it('the two lists do not overlap', () => {
    // Control: a status in both would make the question meaningless.
    const both = TERMINAL_STATUSES.filter((s) => (ACTIVE_STATUSES as readonly string[]).includes(s));
    expect(both).toEqual([]);
  });

  it('and both panels use it', () => {
    const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
    const prog = read('app/admin/research/components/PipelineProgressPanel.tsx');
    const run = read('app/admin/research/components/ResearchRunPanel.tsx');

    for (const [name, src] of [['PipelineProgressPanel', prog], ['ResearchRunPanel', run]] as const) {
      expect(src, `${name} should import the shared definition`).toContain("from './pipeline-log'");
    }
    expect(run, 'the denylist is back').not.toContain("!== 'running' && normalizedStatus !== 'starting'");
    expect(run).toContain('isDoneStatus(normalizedStatus)');
    expect(prog, 'a local copy would shadow the import').not.toMatch(/function isDoneStatus\s*\(/);
  });
});

describe('timestamps', () => {
  it('formats a real one', () => {
    expect(formatTimestamp('2026-08-31T14:05:09Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('returns empty for an absent one', () => {
    expect(formatTimestamp(undefined)).toBe('');
    expect(formatTimestamp('')).toBe('');
  });

  it('returns empty for an unparseable one, rather than "Invalid Date"', () => {
    // The try/catch this replaced never fired: `toLocaleTimeString` on an Invalid Date RETURNS
    // "Invalid Date" instead of throwing, so the string went straight into the copied log.
    expect(formatTimestamp('not a date')).toBe('');
  });
});

describe('the log as text', () => {
  it('renders a call entry with layer, source and method', () => {
    const out = formatLogAsText([entry({ duration_ms: 1500, dataPointsFound: 4 })]);
    expect(out).toBe('✓ retrieval | texasfile | search [4 pts] (1.50s)');
  });

  it('renders a message entry as a message', () => {
    const out = formatLogAsText([entry({ source: 'warn', status: 'warn', details: 'budget nearly spent' })]);
    expect(out).toBe('⚠ retrieval: budget nearly spent');
  });

  it('omits a zero duration and a zero point count rather than printing them', () => {
    expect(formatLogAsText([entry()])).toBe('✓ retrieval | texasfile | search');
  });

  it('puts details and errors on their own indented lines', () => {
    const out = formatLogAsText([entry({ status: 'fail', details: 'd', error: 'e' })]);
    expect(out.split('\n')).toEqual([
      '✕ retrieval | texasfile | search',
      '    Details: d',
      '    Error: e',
    ]);
  });

  it('separates entries with a newline', () => {
    expect(formatLogAsText([entry(), entry()]).split('\n')).toHaveLength(2);
  });

  it('renders an empty log as an empty string', () => {
    expect(formatLogAsText([])).toBe('');
  });
});

describe('the detailed log', () => {
  it('numbers entries and includes steps', () => {
    const out = formatDetailedLogAsText([entry({ input: 'lot 5', steps: ['a', 'b'] })]);
    expect(out).toContain('--- Entry 1 ---');
    expect(out).toContain('  Input:   lot 5');
    expect(out).toContain('  Steps (2):');
    expect(out).toContain('    ↳ a');
    expect(out).toContain('    ↳ b');
  });

  it('labels a message entry\'s text as a Message, not as Details', () => {
    const out = formatDetailedLogAsText([entry({ source: 'error', error: 'boom' })]);
    expect(out).toContain('  Message: boom');
    expect(out).not.toContain('  Error:   boom');
  });
});

describe('status icons and entry kinds', () => {
  it('gives each status its own glyph', () => {
    const icons = ['success', 'fail', 'warn', 'partial'].map(statusIcon);
    expect(new Set(icons).size, 'two statuses share a glyph').toBe(4);
  });

  it('falls back rather than rendering undefined', () => {
    expect(statusIcon('anything-else')).toBe('−');
    expect(statusIcon(undefined)).toBe('−');
  });

  it('knows which entries are messages', () => {
    for (const s of ['info', 'warn', 'error']) expect(isMessageEntry(entry({ source: s })), s).toBe(true);
    expect(isMessageEntry(entry({ source: 'texasfile' }))).toBe(false);
  });
});

describe('a run that retrieved nothing says so', () => {
  const PANEL = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/research/components/PipelineProgressPanel.tsx'), 'utf8',
  );

  it('does not hide the document count when it is zero', () => {
    // `documentCount != null && documentCount > 0` hid the row entirely, so a run that found NOTHING
    // looked exactly like one where the field was never reported — "we looked and found none" versus
    // "we do not know". The repo's own `SegmentedTab.count` states the rule: 0 renders.
    expect(PANEL, 'the > 0 guard is back').not.toContain('result.documentCount > 0');
    expect(PANEL).toContain("result.documentCount === 0 ? 'none retrieved'");
  });

  it('and the verified marker is not a bare glyph', () => {
    expect(PANEL).toContain('verified');
    expect(PANEL, 'a lone ✓ carries the meaning with nothing to announce')
      .not.toMatch(/className="ppanel__verified">✓<\/span>/);
  });
});
