// Every setting the worker reads is documented (research plan R7).
//
// Measured before this test: the code read **70** environment variables and `.env.example`
// documented **23** of them. The 47 missing included every paid-document credential — TYLER_PAY_*,
// KOFILE_*, TEXASFILE_*, LANDEX_*, GOVOS_* — the Google Maps key, the notification providers, and
// the branding used on generated PDFs.
//
// The failure mode is not a crash. It is a deploy that comes up healthy and behaves differently
// from the last one, because nobody knew there was a knob. On this worker, the specific version of
// that is a run that silently cannot buy a document and reports the county as having no records.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', 'dist'].includes(e.name)) tsFiles(p, out);
    } else if (e.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

/** Every `process.env.X` the shipped code reads. Tests are excluded — a variable a test invents is
 *  not configuration. */
function envVarsUsed(): Set<string> {
  const used = new Set<string>();
  for (const file of tsFiles(path.join(ROOT, 'src'))) {
    if (file.includes('__tests__')) continue;
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]!);
  }
  return used;
}

/** Every variable `.env.example` mentions, commented-out lines included — a documented default that
 *  ships commented is still documentation. */
function envVarsDocumented(): Set<string> {
  const text = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  return new Set([...text.matchAll(/^#?\s*([A-Z0-9_]+)=/gm)].map((m) => m[1]!));
}

describe('.env.example is the worker’s configuration surface', () => {
  it('documents every variable the code reads', () => {
    const documented = envVarsDocumented();
    const undocumented = [...envVarsUsed()].filter((v) => !documented.has(v)).sort();
    expect(
      undocumented,
      `These are read by the worker and documented nowhere:\n  ${undocumented.join('\n  ')}\n
Add them to worker/.env.example — grouped by what breaks when they are missing.`,
    ).toEqual([]);
  });

  it('documents the paid-platform credentials specifically', () => {
    // Named rather than derived: these are the ones whose absence is silent AND expensive — the run
    // completes, buys nothing, and reports the county as having no records.
    const documented = envVarsDocumented();
    for (const v of [
      'TYLER_PAY_USERNAME', 'KOFILE_USERNAME', 'TEXASFILE_USERNAME', 'LANDEX_API_KEY',
      'GOVOS_ACCOUNT_USERNAME', 'FIDLAR_PAY_USERNAME', 'HENSCHEN_PAY_USERNAME', 'IDOCKET_PAY_USERNAME',
    ]) {
      expect(documented.has(v), `${v} is undocumented`).toBe(true);
    }
  });

  it('names the four that must be set for the worker to do anything', () => {
    const text = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    for (const v of ['WORKER_API_KEY', 'ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
      // Uncommented, i.e. presented as a blank to fill rather than an option to consider.
      expect(text, `${v} should be an uncommented required field`).toMatch(new RegExp(`^${v}=`, 'm'));
    }
  });

  it('warns against pinning capacity by hand', () => {
    const text = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    expect(text).toContain('WORKER_MAX_CONCURRENT_PIPELINES');
    expect(text).toMatch(/LEAVE UNSET/i);
  });
});
