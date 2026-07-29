// __tests__/dnd/sheet-chrome-deadline.test.ts — the STYLE/TEMPLATE/THEME picker must not hang forever.
//
// Every chip is disabled while `busy` is set, and on the success path the only thing that clears `busy` is
// `window.location.reload()`. So a request that never resolves leaves the whole picker permanently dead:
// no spinner that ever stops, no error, nothing to retry, and a full page reload the only way out.
//
// Found the hard way. A wedged dev server produced exactly this state, and it read as "the picker is
// broken" rather than "the save is hanging" — an hour spent looking in the wrong place, and the tooling
// that drives these pickers reported every cell as "picker did not take".
//
// Source assertions because the failure is a missing timeout, not a wrong value: there is nothing to
// compute, only something that must be present.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_ui/SheetChrome.tsx'), 'utf8');
// Comments stripped — this file's own prose describes the bug it fixes, and matching that prose instead
// of the code is the trap this suite has fallen into repeatedly.
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the picker save has a deadline', () => {
  it('aborts the request rather than waiting forever', () => {
    expect(code).toContain('new AbortController()');
    expect(code).toMatch(/setTimeout\(\(\) => abort\.abort\(\)/);
  });

  it('passes the signal to BOTH endpoints', () => {
    // Style is a column PATCH; template and theme are their own POSTs. A deadline on one of them is a
    // deadline on none of the paths a user actually hits — the style picker was the one that hung.
    const signals = code.match(/signal: abort\.signal/g) ?? [];
    expect(signals.length).toBeGreaterThanOrEqual(2);
  });

  it('clears `busy` on the failure path, so the chips come back', () => {
    // The actual defect. Without this the picker stays disabled and the page must be reloaded by hand.
    const cat = code.slice(code.indexOf('} catch'));
    expect(cat).toContain('setBusy(null)');
  });

  it('distinguishes a timeout from a network error', () => {
    // "Network error, try again" invites a retry that will hang identically; "took too long" points at
    // the server. The two failures need different sentences because they need different next actions.
    expect(code).toMatch(/AbortError/);
    expect(code).toMatch(/took too long/i);
  });

  it('clears the timer in a finally', () => {
    expect(code).toMatch(/finally \{[^}]*clearTimeout/s);
  });
});
