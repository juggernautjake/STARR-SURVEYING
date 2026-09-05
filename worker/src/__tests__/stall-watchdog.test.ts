import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Plan RESEARCH_SYSTEM_COMPLETION F3 — the stall watchdog. A run that emits no progress for too long
// is hung (the 2026-09-05 Phase-3 hang held a slot 10+ min while neither cost nor the hour clock
// could fire). This asserts the watchdog exists, reads a stamped lastProgressAt, aborts, and is
// cleared on finish — structural, because it fires on a timer no unit test can wait out.

const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

describe('the stall watchdog', () => {
  it('stamps lastProgressAt whenever the pipeline reports progress', () => {
    expect(index).toMatch(/a\.lastProgressAt = Date\.now\(\)/);
    expect(index).toMatch(/lastProgressAt: Date\.now\(\)/); // seeded at run start
  });

  it('arms an interval that fires on no progress for STALL_MS', () => {
    expect(index).toMatch(/const stallWatchdog = setInterval\(/);
    expect(index).toMatch(/Date\.now\(\) - \(active\.lastProgressAt/);
    expect(index).toMatch(/since >= STALL_MS/);
    expect(index).toMatch(/STALL watchdog fired/);
  });

  it('aborts the pipeline and records a stop reason', () => {
    const at = index.indexOf('const stallWatchdog = setInterval(');
    const block = index.slice(at, at + 900);
    expect(block).toMatch(/active\.abortController\?\.abort\(/);
    expect(block).toMatch(/active\.stopReason = \{ kind: 'error'/);
  });

  it('is tunable and defaults to 12 minutes', () => {
    expect(index).toMatch(/RUN_STALL_MINUTES/);
    expect(index).toMatch(/:\s*12\)\s*\*\s*60_000/);
  });

  it('is cleared on finish alongside the wall-clock watchdog', () => {
    const clears = (index.match(/clearInterval\(activePipelines\.get\(projectId\)\?\.stallWatchdog\)/g) ?? []).length;
    expect(clears).toBeGreaterThanOrEqual(2);
  });
});
