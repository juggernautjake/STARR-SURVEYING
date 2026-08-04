// worker/src/__tests__/run-context.test.ts
//
// R4b — the ambient run, and the property that made a module-level global unusable.
//
// Twelve AI call sites cannot report their spend because none has `projectId` in scope. The obvious
// fix is a module-level "current run" set at the top of the pipeline. **It is wrong here**, and the
// reason is the third test below: `currentRunningRuns()` returns a list and the job queue runs
// `concurrency: 3`, so a single mutable global files one run's spend against another the moment two
// overlap. That is not an edge case, it is the normal operating mode.
//
// A ceiling that charges the wrong run is worse than one that under-counts: it looks correct, it
// stops the wrong job, and its numbers reconcile to nothing.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRunContext, currentProjectId } from '../infra/run-context.js';
import { recordAmbientAiCall, __resetUnattributedWarnings } from '../infra/usage.js';

describe('run context', () => {
  it('reports no run outside one, rather than guessing', () => {
    expect(currentProjectId()).toBeNull();
  });

  it('carries the run through awaits', async () => {
    // The property a parameter would give for free and a global would give incorrectly.
    await withRunContext('proj-1', async () => {
      expect(currentProjectId()).toBe('proj-1');
      await new Promise((r) => setTimeout(r, 5));
      expect(currentProjectId(), 'the run was lost across an await').toBe('proj-1');
      await Promise.resolve();
      expect(currentProjectId()).toBe('proj-1');
    });
  });

  it('keeps concurrent runs apart — the whole reason for AsyncLocalStorage', async () => {
    // Interleaved on purpose: `b` starts while `a` is suspended and finishes first. A module-level
    // "current run" passes the sequential case and fails exactly here, which is how it would have
    // shipped.
    const seen: string[] = [];
    const a = withRunContext('proj-a', async () => {
      await new Promise((r) => setTimeout(r, 20));
      seen.push(`a saw ${currentProjectId()}`);
    });
    const b = withRunContext('proj-b', async () => {
      await new Promise((r) => setTimeout(r, 5));
      seen.push(`b saw ${currentProjectId()}`);
    });
    await Promise.all([a, b]);

    expect(seen).toContain('a saw proj-a');
    expect(seen).toContain('b saw proj-b');
    expect(seen, 'one run observed the other\'s id — a global would do exactly this')
      .not.toContain('a saw proj-b');
  });

  it('restores the outer run after an inner one finishes', async () => {
    await withRunContext('outer', async () => {
      await withRunContext('inner', async () => {
        expect(currentProjectId()).toBe('inner');
      });
      expect(currentProjectId(), 'the inner run leaked out').toBe('outer');
    });
  });

  it('leaves no run behind when one throws', async () => {
    await expect(
      withRunContext('doomed', async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    expect(currentProjectId(), 'a failed run left its id ambient').toBeNull();
  });
});

describe('recordAmbientAiCall', () => {
  beforeEach(() => { __resetUnattributedWarnings(); });

  it('records nothing and warns when there is no run', async () => {
    // The honest failure. Attributing to "the current run" here is the silent misattribution this
    // whole design avoids — and code legitimately runs outside a pipeline (receipt-extraction.ts is
    // a CLI batch over queued receipts, with no run at all).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cost = await recordAmbientAiCall('some-site', 'claude-sonnet-5', { input: 100, output: 50 });

    expect(cost, 'an unattributable call must not be priced against anything').toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('some-site');
    expect(warn.mock.calls[0][0], 'the warning must say it is a tracking gap, not a work failure')
      .toMatch(/not counted|gap/i);
    warn.mockRestore();
  });

  it('warns once per site, not once per call', async () => {
    // A deed with forty pages would otherwise bury every other line in the log.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await recordAmbientAiCall('noisy', 'claude-sonnet-5', { input: 1, output: 1 });
    await recordAmbientAiCall('noisy', 'claude-sonnet-5', { input: 1, output: 1 });
    await recordAmbientAiCall('noisy', 'claude-sonnet-5', { input: 1, output: 1 });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('does not report an attributable call as unattributed', async () => {
    // Asserted on the MESSAGE, not on "console.warn was never called". The first version of this
    // test demanded silence and failed against `[Pipeline] SUPABASE_URL … not set` — an environment
    // warning from the persistence layer, which has nothing to do with attribution. The code was
    // right and the test was wrong; a check that fails on unrelated noise gets muted, and then it
    // is not checking anything.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await withRunContext('proj-x', async () => {
      await recordAmbientAiCall('attributed', 'claude-sonnet-5', { input: 10, output: 5 });
    });
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(
      messages.filter((m) => m.includes('attributed') && /no ambient run/.test(m)),
      'a call made inside a run was reported as unattributable',
    ).toEqual([]);
    warn.mockRestore();
  });
});
