// worker/src/__tests__/captcha-claim-is-honest.test.ts
//
// ── THE CLAIM THIS CORRECTS ─────────────────────────────────────────────────────────────────────
//
// `/health` reported `captcha_solver: { status: 'ok' }` whenever CAPSOLVER_API_KEY was present.
// Measured 2026-08-30, with a control:
//
//     getCaptchaSolver() callers outside its own module and tests   0
//     browser-factory importers, for comparison                     37
//
// Only `setSolveAttemptSink` — telemetry plumbing — is wired into index.ts. No adapter ever asks the
// solver to solve anything. So a green light meant "a key is present" while reading as "challenges
// get solved", and an operator acting on it would buy a CapSolver subscription to fix a portal
// challenge that fails either way.
//
// Same shape as the `websocket_auth` check removed from that handler earlier the same day, and as
// the TAVILY_API_KEY warning before it: configuration reported as capability.
//
// ── THIS GUARD IS BIDIRECTIONAL, ON PURPOSE ─────────────────────────────────────────────────────
//
// It fails if the honest wording is removed, AND it fails if somebody WIRES the solver up without
// updating the claim. Either way the docs and the code disagree, and either way a person should
// read this file before deciding which is now true.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');

const strip = (s: string) => s
  .split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '');

const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));

/** Every worker source except tests and the solver module itself. */
function sourcesExceptSolver(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') sourcesExceptSolver(p, out);
    } else if (e.name.endsWith('.ts') && !e.name.includes('captcha-solver')) {
      out.push(p);
    }
  }
  return out;
}

const solverCallers = sourcesExceptSolver(SRC)
  .filter((f) => /\bgetCaptchaSolver\s*\(/.test(strip(fs.readFileSync(f, 'utf8'))))
  .map((f) => path.relative(SRC, f).replace(/\\/g, '/'));

describe('the solver really is unwired', () => {
  it('has no caller outside its own module', () => {
    expect(
      solverCallers,
      'getCaptchaSolver now HAS callers. That is good news — but the /health claim and the warning '
        + 'text both say captcha solving is not wired, and they are now wrong. Update them, and '
        + `this test, together:\n  ${solverCallers.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the scan would have found a caller if there were one', () => {
    // Control. Without this the assertion above passes on a broken walk or a typo'd symbol name.
    const withSink = sourcesExceptSolver(SRC)
      .filter((f) => /\bsetSolveAttemptSink\s*\(/.test(strip(fs.readFileSync(f, 'utf8'))));
    expect(withSink.length, 'setSolveAttemptSink IS called from index.ts — the scan works').toBeGreaterThan(0);
  });
});

describe('and the health surfaces say so', () => {
  it('/health does not report captcha_solver as ok', () => {
    const idx = read('index.ts');
    const claim = idx.slice(idx.indexOf('checks.captcha_solver'), idx.indexOf('checks.captcha_solver') + 400);
    expect(claim).toContain('NOT WIRED');
    expect(claim, 'a green light for a feature that cannot run is the bug this fixes')
      .not.toMatch(/status:\s*'ok'/);
  });

  it('the missing-key warning does not promise that setting it would help', () => {
    const h = read('infra/health.ts');
    expect(h).toContain('NOT wired into any adapter');
  });
});
