// __tests__/hub/widget-settings-reachable.test.ts
//
// C0m of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Every setting a widget reads must be one the user can change.
//
// ── WHY THIS IS A RATCHET AND NOT A ONE-OFF AUDIT ───────────────────────────────────────────────
//
// C0l scanned all 54 widgets and found exactly one unreachable key. Closing it (C0m) makes the
// number zero — and a number that is zero today is worth pinning, because the failure is silent by
// construction: a widget reads `settings.foo`, nothing offers `foo`, and the only symptom is a
// behaviour nobody can change. Nothing errors. Nothing looks broken. It is the "authored but not
// wired" shape this repo already ratchets for elsewhere.
//
// ── THE INSTRUMENT IS THE INTERESTING PART ──────────────────────────────────────────────────────
//
// `scripts/widget-settings-audit.mjs` was wrong three times before it was right, and each wrong
// version produced a confident gap list: a brace-walk that read a function's PARAMETERS as its
// body (all 54 widgets "incomplete"), a registry lookup keyed on directory instead of widget id,
// and a non-greedy regex that stopped at the first nested `},` in a schema. Comparing against a
// recorded baseline rather than re-deriving expectations is what keeps a future correction to the
// script honest: if the script starts seeing more, that shows up as a diff rather than as silence.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

interface Row {
  widget: string;
  state: 'complete' | 'gap' | 'declared-none' | 'unregistered' | 'no-form' | 'no-settings' | 'no-defaults';
  missing?: string[];
}

const rows: Row[] = JSON.parse(
  execFileSync('node', ['scripts/widget-settings-audit.mjs', '--json'], { encoding: 'utf8' }),
);

/** Deliberate `{ source: 'none' }` declarations, each carrying a reason in `widget-options.ts`.
 *  Listed rather than filtered by state so ADDING one is a visible decision — a widget quietly
 *  downgraded to `none` to silence this test would otherwise look identical to a clean pass. */
const DECLARED_NONE = [
  'comms-inbox',
  'drawings-hub',
  'field-pulse',
  'learning-stack',
  'money',
  'pending-bin',
];

describe('every widget setting is reachable', () => {
  it('the audit ran and saw the whole catalogue', () => {
    // A script that silently returns [] would otherwise pass every assertion below.
    expect(rows.length).toBeGreaterThan(40);
  });

  it('no widget reads a setting its options panel does not offer', () => {
    const gaps = rows.filter((r) => r.state === 'gap');
    expect(
      gaps.map((r) => `${r.widget}: ${r.missing?.join(', ')}`),
      'a key the widget reads but no form or schema exposes is a setting nobody can change',
    ).toEqual([]);
  });

  it('no widget is missing from the options registry', () => {
    // An unregistered widget falls back to `{ source: 'none' }`, so ALL of its settings become
    // unreachable at once, and nothing announces it.
    expect(rows.filter((r) => r.state === 'unregistered').map((r) => r.widget)).toEqual([]);
  });

  it('no widget promises a form it does not ship', () => {
    expect(rows.filter((r) => r.state === 'no-form').map((r) => r.widget)).toEqual([]);
  });

  it("the widgets declared 'none' are exactly the ones we decided on", () => {
    const declared = rows.filter((r) => r.state === 'declared-none').map((r) => r.widget).sort();
    expect(
      declared,
      'a widget switched to `none` hides its settings — that is a decision, so it belongs in this list',
    ).toEqual([...DECLARED_NONE].sort());
  });
});
