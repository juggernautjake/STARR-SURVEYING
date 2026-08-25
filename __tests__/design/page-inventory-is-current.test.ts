// __tests__/design/page-inventory-is-current.test.ts — the route inventory all three walks read.
//
// ── THE DEFECT THIS WOULD HAVE CAUGHT ───────────────────────────────────────────────────────────
//
// `lib/design/pages.generated.json` is the list of routes the tracer, the dossier deriver and the
// conformance sweep all walk. It went a day stale during PAGE_CONSOLIDATION and the consequence was
// silent: `/admin/hours` and `/admin/pay` existed, worked, and were **invisible to all three tools**.
// Nothing failed. The walks reported success over a smaller world than the one they were measuring.
//
// `npm run verify:page-inventory` has existed the whole time and answers this in a second. Nothing
// ran it. CI runs `type-check`, `lint`, `test` and `build`, and none of the six `verify:*` scripts —
// so a ratchet only fires when somebody remembers it exists, which is the same as not having one on
// the day it matters.
//
// Two of the six are already inside `npm test` and therefore inside CI: the inline-hex ratchet has
// its own test, and the portal-tab file is regenerated and compared in `portal-tab-toggles`. This is
// the third, written the same way for the same reason.
//
// ── WHY IT SHELLS OUT INSTEAD OF IMPORTING ──────────────────────────────────────────────────────
//
// `derive-portal-tabs.mjs` exports its builder, so its test can call it. This generator does not —
// it writes the file at import time, so importing it inside a test would rewrite the artefact the
// test exists to check. Running the shipped `--check` is also the more honest assertion: it tests
// the rule that ships, not a reimplementation of it that can quietly disagree. This plan spent an
// afternoon on two copies of a `clickState` rule that "happened to agree".

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');

describe('the route inventory the design walks read', () => {
  it('is current with the filesystem', () => {
    let out = '';
    let failed = false;
    try {
      out = execFileSync('node', ['scripts/generate-page-inventory.mjs', '--check'], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      failed = true;
      const e = err as { stdout?: string; stderr?: string };
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }

    expect(
      failed,
      `lib/design/pages.generated.json is behind the filesystem. A stale inventory does not fail — it\n`
      + `makes routes INVISIBLE to the tracer, the dossier deriver and the conformance sweep, which\n`
      + `then report success over a smaller world. Run: node scripts/generate-page-inventory.mjs\n\n${out}`,
    ).toBe(false);
    expect(out).toMatch(/is current: \d+ pages/);
  });
});
