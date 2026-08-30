// Every environment variable the worker READS must appear in `worker/.env.example`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// `.env.example` is not documentation, it is the CONTRACT. `docs/platform/RESEARCH_WORKER_DEPLOYMENT.md`
// builds the real `.env` by filtering this file and prompting for the values it names — so a key the
// code reads and the example omits **cannot be set by anyone following the runbook.** Not "is easy to
// miss": cannot.
//
// Found the hard way on 2026-08-29. The rebuilt worker came up healthy on the first try and reported
//
//     "TAVILY_API_KEY missing — open-web research is inert; runs see county sources only"
//
// which read as an owner forgetting a key. It was not. `TAVILY_API_KEY` appeared nowhere in
// `.env.example` and nowhere in the runbook, so the setup procedure never offered it. The owner had
// set that key in Doppler weeks earlier — for the website, which is a different process with a
// different environment. The worker's own copy had never existed.
//
// This is the quietest failure shape in the whole deployment: the worker is healthy, the pipeline
// runs, and the answer is simply thinner than it should be. `configWarnings` is what surfaced it,
// and this test is what stops the next one needing to be surfaced at all.
//
// ── WHAT COUNTS AS "READ" ───────────────────────────────────────────────────────────────────────
//
// Any `env.FOO` or `process.env.FOO` in `worker/src`, excluding tests — a test that fabricates an
// env object is describing a fixture, not a deployment requirement.
//
// A key may be documented COMMENTED OUT (`# FOO=`). That is the correct way to carry an optional
// key: it names the knob without switching it on. The test asserts the NAME is present, never that
// a value is.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

/** Every `.ts` file under `src`, tests excluded. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') sourceFiles(p, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
      out.push(p);
    }
  }
  return out;
}

/** Names the worker reads. `NODE_ENV` and `TZ` are the runtime's, not ours. */
const RUNTIME_OWNED = new Set(['NODE_ENV', 'TZ', 'HOME', 'PATH', 'PWD', 'CI']);

function keysReadByCode(): Set<string> {
  const found = new Set<string>();
  for (const f of sourceFiles(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:process\.)?env\.([A-Z][A-Z0-9_]{2,})\b/g)) {
      if (!RUNTIME_OWNED.has(m[1])) found.add(m[1]);
    }
  }
  return found;
}

function keysDocumented(): Set<string> {
  const text = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  const found = new Set<string>();
  // `FOO=` or `# FOO=` — commented-out is the correct shape for an optional key.
  for (const m of text.matchAll(/^[ \t]*#?[ \t]*([A-Z][A-Z0-9_]{2,})=/gm)) found.add(m[1]);
  return found;
}

describe('worker/.env.example documents every key the code reads', () => {
  it('finds a plausible number of keys — a broken scanner is worse than none', () => {
    // If either side collapses to nothing the comparison below passes vacuously, which is the
    // failure mode of every "compare two lists" test ever written.
    expect(keysReadByCode().size).toBeGreaterThan(30);
    expect(keysDocumented().size).toBeGreaterThan(30);
  });

  it('does NOT read TAVILY_API_KEY — that key belongs to the app process', () => {
    // Inverted the same day it was written, which is worth recording rather than quietly editing.
    //
    // The original assertion pinned a real regression: the runbook could not set TAVILY_API_KEY
    // because worker/.env.example never named it. Correct as far as it went — and the premise
    // underneath it was wrong. The worker never READ the key either. Its health check warned about
    // a variable used only by app modules, so the honest fix was not "document it here", it was
    // "stop pretending this process uses it".
    //
    // A test that pins a fix built on a false premise is a test that defends the false premise.
    expect(keysReadByCode()).not.toContain('TAVILY_API_KEY');
    expect(keysDocumented()).not.toContain('TAVILY_API_KEY');
  });

  it('has no key that code reads and the example omits', () => {
    const undocumented = [...keysReadByCode()].filter((k) => !keysDocumented().has(k)).sort();
    expect(undocumented, `read by worker/src but absent from worker/.env.example, so the runbook `
      + `cannot offer them:\n  ${undocumented.join('\n  ')}`).toEqual([]);
  });

  it('parses commented-out keys as documented', () => {
    // A control on the parser itself: `# FOO=` must count. If this ever fails, the test above is
    // passing for the wrong reason and every optional key looks undocumented.
    //
    // The specimen was TAVILY_API_KEY until that entry was removed on 2026-08-29 — the worker does
    // not read it, so documenting it here was what made somebody set it on a machine that ignores
    // it. BROWSERBASE_API_KEY is the replacement: genuinely optional, genuinely read by this
    // process, and genuinely commented out.
    const text = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    expect(text).toMatch(/^[ \t]*#[ \t]*BROWSERBASE_API_KEY=/m);
    expect(keysDocumented()).toContain('BROWSERBASE_API_KEY');
    // And the specimen must be a key the code actually reads, or this control drifts into testing
    // a comment nobody depends on.
    expect(keysReadByCode()).toContain('BROWSERBASE_API_KEY');
  });
});
