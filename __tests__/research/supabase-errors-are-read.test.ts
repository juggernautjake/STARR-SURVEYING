// __tests__/research/supabase-errors-are-read.test.ts
//
// ── A `try/catch` AROUND A SUPABASE CALL IS NOT ERROR HANDLING ──────────────────────────────────
//
// The Supabase client does not throw when a write is rejected. It returns `{ data, error }`. So:
//
//     try {
//       await supabaseAdmin.from('research_documents').update({ … }).eq('id', id);
//     } catch {
//       // Non-fatal
//     }
//
// …cannot fire. Not "rarely fires" — cannot. The error is in a value nobody read, and the shape
// gives every appearance of having been considered.
//
// That appearance is what hid two real bugs found on 2026-08-31:
//
//   · `documents/[docId]/full-extract` wrote to `research_documents.analysis_metadata`, a column
//     that does not exist on that table, for its entire life (seed 621).
//   · `[projectId]/full-extract` REPLACED the whole `analysis_metadata` JSONB on the project rather
//     than merging into it — destroying the run logs, the recorded error, and the per-project API
//     spend tracking that `analysis.service.ts` keeps there.
//
// Neither produced a symptom. Both routes returned 200 with the right body.
//
// ── WHY THE RULE IS "ONLY SUPABASE CALLS" ───────────────────────────────────────────────────────
//
// A catch that does nothing is not automatically wrong. Two in this codebase are correct:
//
//   · `requests/claim` wraps `notify()` — which genuinely throws — and its comment explains that
//     leaving `notified_at` null is how a partial index finds the run nobody was told about.
//   · `analysis.service` wraps `fetchSourceContent()`, a network call, for best-effort enrichment.
//
// In both, something in the `try` really can throw, so the `catch` is doing a job. The defect is
// specifically a `try` whose ONLY awaited calls are Supabase: there, the catch is unreachable and
// the error is discarded, which is the worst of both — no handling, and the look of handling.
//
// Having a comment is not the discriminator either. Both bugs above said `// Non-fatal`.
//
// ── VERIFIED AGAINST THE REAL THING, NOT A RECONSTRUCTION ───────────────────────────────────────
//
// A mutation that hand-rewrote the fixed route back into its old shape did NOT fail this check —
// and the guard was fine; the reconstruction was wrong. Running the rule over the ORIGINAL file
// content from git reported exactly what it should: handler empty, awaits `["supabaseAdmin"]`, all
// Supabase. So the check does catch the bug it was written for.
//
// Worth recording because the obvious conclusion from that first result was "the guard is broken",
// and acting on it would have meant loosening a rule that was already correct.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')) out.push(rel);
  }
  return out;
}

interface Hit { file: string; line: number }

/** `try { …only supabase… } catch { …nothing… }` */
function inertCatches(files: string[], sources?: Map<string, string>): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    // Self-checks supply their probe in memory. Writing it into a scanned source tree raced
    // another suite walking the same directory in a parallel worker thread.
    const src = sources?.get(file) ?? fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/\btry\s*\{([\s\S]*?)\}\s*catch\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\}/g)) {
      const body = m[1];
      const handler = m[2]
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
        .trim();
      if (handler.length > 0) continue;              // the catch does something
      if (!/\.from\(\s*['"`]/.test(body)) continue;  // not a supabase statement at all
      if (!/\.(insert|update|upsert|delete)\(/.test(body)) continue;  // reads degrade visibly

      // Every `await` in the body must be a supabase chain. One that is not — `notify()`,
      // `fetchSourceContent()` — means something here really can throw and the catch has a job.
      const awaits = [...body.matchAll(/await\s+([A-Za-z_$][\w$]*)/g)].map((a) => a[1]);
      const allSupabase = awaits.length > 0 && awaits.every((n) => /^supabase/i.test(n) || n === 'db');
      if (!allSupabase) continue;

      hits.push({ file, line: src.slice(0, m.index!).split('\n').length });
    }
  }
  return hits;
}

const FILES = [
  ...walk('app/api/admin/research'),
  ...walk('lib/research'),
  ...walk('app/admin/research'),
];

describe('the check can fail', () => {
  it('found research files to scan', () => {
    expect(FILES.length).toBeGreaterThan(40);
  });

  it('SEES an inert catch around a supabase write', () => {
    const probe = [
      'export async function probe(id: string) {',
      '  try {',
      "    await supabaseAdmin.from('research_runs').update({ status: 'x' }).eq('id', id);",
      '  } catch {',
      '    // Non-fatal',
      '  }',
      '}',
    ].join('\n');
    const REL = 'lib/research/__inert_catch_probe__.ts';
    const SRC = new Map([[REL, probe]]);
    expect(inertCatches([REL], SRC)).toHaveLength(1);
  });

  it('does NOT flag a catch guarding something that really throws', () => {
    // The false positive that matters: `notify()` and `fetchSourceContent()` do throw, so those
    // catches are load-bearing. Reporting them would send somebody to "fix" correct code.
    const probe = [
      'export async function probe(id: string) {',
      '  try {',
      '    await notify({ to: id });',
      "    await supabaseAdmin.from('research_requests').update({ notified_at: 'n' }).eq('id', id);",
      '  } catch {',
      '    // deliberate: leaving notified_at null is how the partial index finds it',
      '  }',
      '}',
    ].join('\n');
    const REL = 'lib/research/__inert_catch_ok__.ts';
    const SRC = new Map([[REL, probe]]);
    expect(inertCatches([REL], SRC)).toEqual([]);
  });

  it('does NOT flag a catch that actually handles something', () => {
    const probe = [
      'export async function probe(id: string) {',
      '  try {',
      "    await supabaseAdmin.from('research_runs').update({ status: 'x' }).eq('id', id);",
      '  } catch (err) {',
      '    console.error(err);',
      '  }',
      '}',
    ].join('\n');
    const REL = 'lib/research/__inert_catch_handled__.ts';
    const SRC = new Map([[REL, probe]]);
    expect(inertCatches([REL], SRC)).toEqual([]);
  });
});

describe('no research write hides behind a catch that cannot fire', () => {
  it('has none', () => {
    const hits = inertCatches(FILES);
    const lines = hits.map((h) => `${h.file}:${h.line}`);
    expect(
      lines,
      lines.length
        ? 'The Supabase client returns `{ error }` rather than throwing, so these catches cannot '
          + 'fire and the error is discarded. Read the error instead — even logging it is enough, '
          + `and "non-fatal" is a reason to log rather than a reason to say nothing:\n  ${lines.join('\n  ')}`
        : '',
    ).toEqual([]);
  });
});
