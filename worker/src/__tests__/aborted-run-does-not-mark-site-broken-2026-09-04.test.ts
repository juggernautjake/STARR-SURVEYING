import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { toRunHealthCheck, type RunSourceOutcome } from '../infra/health-persistence.js';

// ── A run WE stopped must not mark a live site broken ────────────────────────────────────────────
//
// 2026-09-04: Bell's clerk_deeds adapter read `broken` while the clerk demonstrably worked (run 8
// found documents through it). A source scrape stopped by our own ceiling was recorded as `error`,
// and `error` counts toward the broken threshold. The new `aborted` outcome maps to `no_record` —
// the same never-quarantines bucket as an empty answer — so our budget can never darken a live site.

const SRC = path.resolve(process.cwd(), 'src');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));

const outcome = (kind: RunSourceOutcome['outcome']): RunSourceOutcome => ({
  siteId: 'cad-48027-bis', vendor: 'bis', name: 'Bell CAD eSearch', url: 'https://x',
  outcome: kind, detail: 'x', durationMs: 0, projectId: 'p',
});

describe('toRunHealthCheck maps each outcome to the right health status', () => {
  it('found → healthy, empty → no_record, aborted → no_record', () => {
    expect(toRunHealthCheck('a', outcome('found')).status).toBe('healthy');
    expect(toRunHealthCheck('a', outcome('empty')).status).toBe('no_record');
    expect(toRunHealthCheck('a', outcome('aborted')).status).toBe('no_record');
  });

  it('a real site failure still counts: unreachable and error → error', () => {
    expect(toRunHealthCheck('a', outcome('unreachable')).status).toBe('error');
    expect(toRunHealthCheck('a', outcome('error')).status).toBe('error');
  });

  it('an aborted outcome carries no error_message (it is not a fault)', () => {
    expect(toRunHealthCheck('a', outcome('aborted')).error_message).toBeNull();
    expect(toRunHealthCheck('a', outcome('error')).error_message).not.toBeNull();
  });
});

describe('the Bell CAD outcome distinguishes our stop from the site failing', () => {
  const orch = read('counties/bell/orchestrator.ts');
  it('records `aborted` when the scrape threw because the run signal was aborted', () => {
    expect(orch).toContain('const cadStoppedByUs = cadThrew && Boolean(signal?.aborted);');
    expect(orch).toContain("cadStoppedByUs ? 'aborted' : cadThrew ? 'error'");
  });
});
