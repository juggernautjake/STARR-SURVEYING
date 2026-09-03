import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mergeRunLogs, capRunLogs, persistRunLogs, MAX_PERSISTED_ENTRIES } from '../research/persist-run-logs.js';

// ── 163 MINUTES OF WORK, ONE SAVED LOG ENTRY ────────────────────────────────────────────────────
//
// Measured on the live database 2026-09-03. A Bell County run on 11780 FM 2484 ran 163 minutes,
// produced 19 documents, spent $29.19 — and `research_projects.research_logs` held ONE entry
// afterwards. The owner exported it and got "Entries: 1".
//
// The entries existed. `PipelineLogger.info/warn/error` all push to the live registry and the Bell
// scrapers are constructed with the real project id. What happened is that `index.ts` captured the
// full live log into an in-memory Map that dies with the process, and wrote `r.log` — the county
// result's own log, which for a crashed run is the crash and nothing else — to the DATABASE.
//
// A second site did the mirror image. Both fire-and-forget with no ordering, so last writer won.

const at = (t: string, details: string) => ({ timestamp: t, layer: 'Stage1', method: 'x', details });

describe('a merged log never gets smaller', () => {
  it('keeps every entry from both sources', () => {
    const live = [at('2026-09-03T04:00:00Z', 'a'), at('2026-09-03T04:01:00Z', 'b')];
    const result = [at('2026-09-03T04:02:00Z', 'crash')];
    expect(mergeRunLogs(live, result)).toHaveLength(3);
  });

  it('THE DEFECT: a one-entry log cannot replace a hundred-entry one', () => {
    // The exact shape of what happened. This is the assertion the old code would fail.
    const rich = Array.from({ length: 100 }, (_, i) => at(`2026-09-03T04:${String(i).padStart(2, '0')}:00Z`, `entry ${i}`));
    const thin = [at('2026-09-03T06:41:23Z', 'Pipeline cancelled by user')];
    const merged = mergeRunLogs(rich, thin);
    expect(merged.length).toBeGreaterThanOrEqual(rich.length);
    expect(merged).toHaveLength(101);
  });

  it('de-duplicates the same event reaching both sources', () => {
    const e = at('2026-09-03T04:00:00Z', 'same event');
    expect(mergeRunLogs([e], [{ ...e }])).toHaveLength(1);
  });

  it('orders by time so a run reads as a sequence', () => {
    const merged = mergeRunLogs(
      [at('2026-09-03T05:00:00Z', 'later')],
      [at('2026-09-03T04:00:00Z', 'earlier')],
    );
    expect(merged.map((e) => e.details)).toEqual(['earlier', 'later']);
  });

  it('keeps an entry with no timestamp rather than dropping it', () => {
    // An entry with no time is still evidence. Dropping it would be another silent narrowing.
    const merged = mergeRunLogs([at('2026-09-03T04:00:00Z', 'timed')], [{ layer: 'X', details: 'untimed' }]);
    expect(merged).toHaveLength(2);
    expect(merged[merged.length - 1].details).toBe('untimed');
  });

  it('CONTROL: merging two empty logs yields an empty log, not an invented one', () => {
    expect(mergeRunLogs([], [])).toEqual([]);
  });
});

describe('the cap drops the oldest and SAYS so', () => {
  it('is a no-op below the ceiling', () => {
    const few = [at('2026-09-03T04:00:00Z', 'a')];
    expect(capRunLogs(few)).toHaveLength(1);
  });

  it('keeps the newest and leaves a marker naming what went', () => {
    const many = Array.from({ length: 20 }, (_, i) => at(`2026-09-03T04:00:${String(i).padStart(2, '0')}Z`, `e${i}`));
    const capped = capRunLogs(many, 10);
    expect(capped).toHaveLength(10);
    expect(String(capped[0].details)).toMatch(/11 earlier log entries were dropped/);
    // Losing the start of a run SILENTLY would recreate this module's own defect.
    expect(capped[capped.length - 1].details).toBe('e19');
  });

  it('the real ceiling is high enough for a long run', () => {
    // A 163-minute run emits a few hundred entries. The cap must not bite on ordinary work.
    expect(MAX_PERSISTED_ENTRIES).toBeGreaterThan(1000);
  });
});

describe('persistRunLogs will not let a thin write shrink a stored log', () => {
  /** A minimal Supabase stand-in that records what it was asked to store. */
  function fakeDb(stored: unknown) {
    let written: unknown = null;
    return {
      written: () => written,
      client: {
        from: () => ({
          select: () => ({ eq: () => ({ single: async () => ({ data: { research_logs: stored } }) }) }),
          update: (v: Record<string, unknown>) => ({ eq: async () => { written = v.research_logs; return { error: null }; } }),
        }),
      },
    };
  }

  it('reads what is already there and merges into it', async () => {
    // Without the read-before-write, the second of two unordered fire-and-forget writes wins —
    // which is exactly how a full log became a one-line one.
    const existing = Array.from({ length: 50 }, (_, i) => at(`2026-09-03T04:${String(i).padStart(2, '0')}:00Z`, `old ${i}`));
    const db = fakeDb(existing);
    const out = await persistRunLogs(db.client as never, 'p1', [[at('2026-09-03T06:41:23Z', 'crash')]]);
    expect(out.saved).toBe(true);
    expect(out.entries).toBe(51);
    expect((db.written() as unknown[]).length).toBe(51);
  });

  it('handles a stored log that is double-encoded JSON', async () => {
    // `research_logs` holds a JSON string in some rows — the same double-encoding found in
    // `ocr_regions`. Treating that as "no existing log" would silently discard it.
    const db = fakeDb(JSON.stringify([at('2026-09-03T04:00:00Z', 'stored')]));
    const out = await persistRunLogs(db.client as never, 'p1', [[at('2026-09-03T05:00:00Z', 'new')]]);
    expect(out.entries).toBe(2);
  });

  it('a failed READ still writes, rather than losing the new entries too', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => { throw new Error('read blew up'); } }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    const out = await persistRunLogs(client as never, 'p1', [[at('2026-09-03T04:00:00Z', 'a')]]);
    expect(out.saved).toBe(true);
  });

  it('never throws when there is no database', async () => {
    const out = await persistRunLogs(null, 'p1', [[at('2026-09-03T04:00:00Z', 'a')]]);
    expect(out.saved).toBe(false);
    expect(out.error).toMatch(/no database/);
  });

  it('reports a write failure instead of claiming success', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
        update: () => ({ eq: async () => ({ error: { message: 'permission denied' } }) }),
      }),
    };
    const out = await persistRunLogs(client as never, 'p1', [[at('2026-09-03T04:00:00Z', 'a')]]);
    expect(out.saved).toBe(false);
    expect(out.error).toBe('permission denied');
  });
});

// ── THE CALLERS ─────────────────────────────────────────────────────────────────────────────────

describe('both writers go through the merge', () => {
  const SRC = (() => {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
    const stripped = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
    if (!stripped.includes('import')) throw new Error('comment stripping destroyed index.ts');
    return stripped;
  })();

  it('CONTROL: stripping kept the code and dropped the prose', () => {
    expect(SRC).toContain('persistRunLogs');
    expect(SRC).not.toContain('163-minute');
  });

  it('neither site writes research_logs directly any more', () => {
    // The two raw `.update({ research_logs: ... })` calls are what raced. If either returns, a
    // thin write can clobber a full one again.
    expect(SRC, 'a direct research_logs write is back').not.toMatch(/update\(\{\s*research_logs:/);
  });

  it('both call sites use the merging helper', () => {
    expect(SRC.match(/persistRunLogs\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('and they report a failure rather than assuming the save landed', () => {
    expect(SRC).toContain('could not save');
  });
});
