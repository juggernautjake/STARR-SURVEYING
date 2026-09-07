// The Activity tab dropped from 302 entries to 4 the instant the 1401 North East St run finished
// (2026-09-07): the worker clears its live log at completion and caches the run's entries a beat
// later, so one status poll in between answered `log: []` — and the hook took an empty answer as
// the new truth. Nothing on the screen is improved by forgetting what the run said.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('useRunState: an empty log never replaces a full one', () => {
  const hook = read('app/admin/research/components/useRunState.ts');
  it('only a non-empty log from the poll is adopted', () => {
    expect(hook).toContain('if (Array.isArray(data.log) && data.log.length > 0) setLogs(data.log);');
    expect(hook).not.toContain('if (data.log) setLogs(data.log);');
  });
  it('a NEW run still starts from an empty log (the reset is explicit, not a poll)', () => {
    expect(hook).toContain('setLogs([]);');
  });
});
