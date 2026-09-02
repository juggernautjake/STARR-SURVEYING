import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { enableTracing, disableTracing, isTracingEnabled, tracedProjectCount } from '../lib/trace.js';

// Phase C — concurrency guaranteed rather than observed.
//
// The owner asked for it plainly: "run at least two different property researches at the same time
// without conflict… when one completes it doesn't kill the other." Overlapping real runs showed it
// working, which is evidence about one afternoon and not a guarantee about the code.
//
// ── WHAT THE AUDIT ACTUALLY FOUND ───────────────────────────────────────────────────────────────
//
// Two pieces of genuinely shared state, both of which reset on entry — which makes SEQUENTIAL runs
// correct and does nothing at all for concurrent ones:
//
//   1. `trace.ts` held `let tracingEnabled` for the whole process, and `disableTracing()` runs on the
//      completion AND failure path of every run. Any run finishing turned tracing off for all of
//      them. The Testing Lab watching a live run went silent mid-run, which reads as a stall.
//
//   2. `gis-viewer-capture.ts` held the parcel centroid at module scope as a LAZY CACHE. Run B
//      overwrites it; run A's next zoom finds a centre already set and navigates to B's parcel. Run
//      A then photographs the wrong property and files the images under its own project, with no
//      error anywhere. For a surveying deliverable that is close to the worst kind of silent bug.
//
// The scan below is the part that keeps this true. It is deliberately about SHAPE — a new module
// global appearing in a file a run touches fails the test and has to be explained.

const WORKER_SRC = path.join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(WORKER_SRC, f).split(path.sep).join('/');

/**
 * Module-level mutable state, allowed with a stated reason.
 *
 * The reason matters more than the entry. Everything here is either a genuine process singleton (a
 * client, a pool, a counter) or state that is global BY THE NATURE OF THE THING IT DESCRIBES — an
 * Anthropic account is depleted for the process, not for a project.
 */
const ALLOWED: Record<string, string> = {
  'billing/stripe-billing.ts': 'Stripe client singleton. One connection per process is the point.',
  'lib/ai-usage-tracker.ts': 'Tracker singleton; per-run totals live inside it, keyed by project.',
  'lib/browser-factory.ts':
    'The browser POOL is shared on purpose and reference-counted. Its own header documents the ' +
    'race that made it a shared promise. A per-run browser would defeat the pooling entirely.',
  'lib/captcha-solver.ts': 'Solver sink/cache wiring, installed once at startup.',
  'lib/credit-guard.ts':
    'GLOBAL BY NATURE. The Anthropic account is depleted for the whole worker, not for one project; ' +
    'making this per-run would let run B keep spending after run A proved the account is empty.',
  'lib/research-events-emit.ts':
    'Redis publisher singleton. One connection serves every run; a per-run client would open a ' +
    'socket per pipeline and exhaust the connection limit at the capacity ceiling of six.',
  'lib/timeline-tracker.ts': 'Monotonic id counter. Sharing it is what makes ids unique.',
  'services/ai-extraction.ts':
    'Anthropic client singleton. Stateless with respect to a run — the per-run spend it drives ' +
    'is accounted separately in ai-usage-tracker, keyed by project.',
  'services/harvest-supabase-sync.ts':
    'Supabase client singleton, lazily created. Holds a connection, never a run: every query it ' +
    'issues carries its own project id.',
  'services/pipeline.ts':
    'Supabase client singleton, lazily created and shared. The run-scoped state in this file is ' +
    'the documents array, which is a local inside runPipelineInner, not module scope.',
  'counties/bell/utils/session-manager.ts':
    'A cached clerk SESSION, shared deliberately: logging in once and reusing the cookie is politer ' +
    'to the county server than one login per run, which is the same rule the concurrency ceiling exists for.',
};

describe('no run-scoped state hides at module scope', () => {
  const files = walk(WORKER_SRC);

  it('CONTROL: the scan reaches a file known to hold module state', () => {
    // Without this, a broken walk() would report a clean tree and the whole guard would be vacuous.
    const found = files.map(rel);
    expect(found).toContain('lib/browser-factory.ts');
    expect(found.length).toBeGreaterThan(100);
  });

  it('every file with module-level mutable state is accounted for', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const code = src
        .split(/\r?\n/)
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
        });

      // Top-level `let`/`var` only: column zero means module scope.
      const hasMutable = code.some((l) => /^(let|var) /.test(l));
      if (hasMutable && !(rel(file) in ALLOWED)) offenders.push(rel(file));
    }

    expect(
      offenders,
      `Module-level mutable state appeared in:\n  ${offenders.join('\n  ')}\n\n` +
        `If it is run-scoped, scope it to the run — AsyncLocalStorage, or a Map keyed by projectId. ` +
        `Two runs execute in one process, and state that resets on entry is correct for sequential ` +
        `runs and silently wrong for concurrent ones. If it is a genuine process singleton, add it ` +
        `to ALLOWED with the reason.`,
    ).toEqual([]);
  });

  it('gives every allowance an actual reason', () => {
    for (const [file, why] of Object.entries(ALLOWED)) {
      expect(why.length, `${file} is allowed with no explanation`).toBeGreaterThan(30);
    }
  });

  it('does not allow a file that no longer exists', () => {
    const stale = Object.keys(ALLOWED).filter((f) => !fs.existsSync(path.join(WORKER_SRC, f)));
    expect(stale, `stale allowances: ${stale.join(', ')}`).toEqual([]);
  });
});

describe('the GIS capture no longer shares a parcel centroid between runs', () => {
  const SRC = fs.readFileSync(
    path.join(WORKER_SRC, 'counties/bell/scrapers/gis-viewer-capture.ts'),
    'utf8',
  );
  const code = SRC
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

  it('the module-scope centroid is gone', () => {
    // The specific defect: a lazy cache at module scope, which run B fills and run A then reads.
    expect(code).not.toMatch(/^let _parcelCenterLon/m);
    expect(code).not.toMatch(/^let _parcelCenterLat/m);
    expect(code).not.toMatch(/^let _zoomCached/m);
  });

  it('state is created per capture and entered through a store', () => {
    expect(code).toContain('captureStore.run(newCaptureState()');
  });

  it('helpers read the store rather than a module variable', () => {
    expect(code).toContain('captureStore.getStore()');
    expect(code).toContain('captureState().parcelCenterLon');
  });
});

describe('one run completing does not turn off another run tracing', () => {
  beforeEach(() => {
    disableTracing('A');
    disableTracing('B');
  });

  it('CONTROL: tracing is off for a project nobody enabled', () => {
    expect(isTracingEnabled('A')).toBe(false);
  });

  it('tracks each run separately', () => {
    enableTracing('A');
    expect(isTracingEnabled('A')).toBe(true);
    expect(isTracingEnabled('B'), 'enabling A enabled B too').toBe(false);
  });

  it("B finishing leaves A's tracing alone — the whole point of C2", () => {
    enableTracing('A');
    enableTracing('B');
    disableTracing('B');
    expect(isTracingEnabled('A'), "B's completion turned A's tracing off").toBe(true);
    expect(isTracingEnabled('B')).toBe(false);
    expect(tracedProjectCount()).toBe(1);
  });

  it('the call sites name a project, so the process-wide form cannot come back', () => {
    const index = fs.readFileSync(path.join(WORKER_SRC, 'index.ts'), 'utf8');
    const code = index
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code, 'a bare disableTracing() is back').not.toMatch(/disableTracing\(\s*\)/);
    expect(code, 'a bare enableTracing() is back').not.toMatch(/enableTracing\(\s*\)/);
  });
});

describe('the run registries are keyed by project — C3 at the shape level', () => {
  const index = fs.readFileSync(path.join(WORKER_SRC, 'index.ts'), 'utf8');

  // Every one of these holds state for a run in flight. A non-Map here means one run's completion
  // reaches into another's.
  const REGISTRIES = [
    'activePipelines',
    'runProgress',
    'completedResults',
    'completedLogs',
  ];

  for (const name of REGISTRIES) {
    it(`${name} is a Map, not a single value`, () => {
      const decl = new RegExp(`(const|let)\\s+${name}\\s*(:[^=]+)?=\\s*new Map`);
      expect(decl.test(index), `${name} is no longer a Map keyed per run`).toBe(true);
    });

    it(`${name} is only ever cleared for one project`, () => {
      // `.clear()` on a run registry wipes every OTHER live run's state — the exact shape of "one
      // completing run tears down a live one".
      expect(
        index.includes(`${name}.clear()`),
        `${name}.clear() removes every run's state, not just the one that finished`,
      ).toBe(false);
    });
  }

  it('capacity is measured from the live set, not a counter that can drift', () => {
    // A hand-maintained counter is how a crashed run permanently consumes a slot.
    expect(index).toContain('activePipelines.size >= CAPACITY.maxConcurrentPipelines');
  });
});
