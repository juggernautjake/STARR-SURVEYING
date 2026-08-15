// __tests__/cad/every-dialog-can-be-opened.test.ts
//
// CAD_AUDIT S1b — every `cad:open*` panel the layout listens for can actually be opened.
//
// ── WHY THIS SHAPE ──────────────────────────────────────────────────────────────────────────────
//
// S1a catalogued the menu bar and found COGO — a complete, working solver — filed under **AI**,
// where no surveyor would look. Nothing was missing and nothing was broken, and the capability was
// still effectively absent. That is the defect this file generalises: `CADLayout` listens for ~24
// `cad:open…` events, and a listener nobody dispatches is a panel that exists and cannot be reached.
//
// ── THE PROBE IS THE HARD PART, AND IT WAS WRONG TWICE ──────────────────────────────────────────
//
// Building this check produced two false findings before it produced a true one, both from the probe
// rather than the code:
//
//  1. **"Twelve dialogs have no menu entry."** They do. `MenuBar` dispatches EVENTS; it never imports
//     the dialog components, so searching MenuBar for a component name finds nothing by construction.
//
//  2. **"`FeatureLabelPreferencesPanel` is unreachable."** It is not. The context menu carries
//     `'Edit Label Preferences…'` and dispatches the event — across TWO LINES:
//
//         window.dispatchEvent(
//           new CustomEvent('cad:openFeatureLabelPrefs', { detail: { featureId } }),
//
//     A line-based `grep` for `dispatchEvent(new CustomEvent('…'` cannot see that, so a real
//     dispatcher looked like none. **Every dispatch in this codebase that is formatted across lines
//     was invisible to the first version of this test.**
//
// So the scan below reads whole files and looks for the event NAME, not for a call shape. It cannot
// tell a dispatch from a mention in a comment — which is the honest trade: this check errs toward
// saying "reachable", and a false "unreachable" is the expensive direction (it sends someone to build
// an affordance that already exists, as it nearly did here).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CAD = join(__dirname, '..', '..', 'app', 'admin', 'cad');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const files = walk(CAD);
const layout = readFileSync(join(CAD, 'CADLayout.tsx'), 'utf8');

/** Events CADLayout registers a listener for. */
const listened = [
  ...new Set(
    [...layout.matchAll(/addEventListener\(\s*'(cad:open[A-Za-z]*)'/g)].map((m) => m[1]),
  ),
];

/**
 * Files other than the layout itself, read whole.
 *
 * C28 — the calculator registry is included, and finding out why was this probe's THIRD false
 * finding. `CalculatorPicker` dispatches `new CustomEvent(entry.openEvent)` — the name is a
 * variable, and the literal lives in `lib/cad/calculators/registry.ts`, outside `app/admin/cad`. So
 * a real, working dispatcher was invisible for the same reason the two-line dispatch was: the scan
 * was looking in the wrong shape and the wrong place. Registering a calculator is the one step that
 * makes it reachable, which puts that file squarely in scope for "can this panel be opened".
 */
const EXTRA_DISPATCH_SOURCES = [
  join(__dirname, '..', '..', 'lib', 'cad', 'calculators', 'registry.ts'),
];

const others = [
  ...files.filter((f) => !f.endsWith('CADLayout.tsx')),
  ...EXTRA_DISPATCH_SOURCES,
].map((f) => [f, readFileSync(f, 'utf8')] as const);

describe('S1b — every listened-for panel has a way in', () => {
  it('found the listeners', () => {
    // Vacuous-pass guard: if the listener scan breaks, every assertion below passes trivially.
    expect(listened.length).toBeGreaterThan(15);
  });

  it('found the files that could dispatch', () => {
    expect(others.length).toBeGreaterThan(20);
  });

  /**
   * Listeners whose panel is reachable by a route other than the event.
   *
   * Each entry means "the panel opens, but this particular listener is redundant" — which is a much
   * smaller problem than an unreachable panel, and a different one. Recorded rather than deleted
   * because removing a listener is a behaviour change, and because the redundancy is evidence of two
   * mechanisms doing one job.
   */
  const OPENED_ANOTHER_WAY: Record<string, string> = {
    'cad:openCompletenessPanel':
      'The panel opens via props — `onOpenCompletenessPanel` and `onToggleCompletenessPanel` are ' +
      'passed to children at CADLayout:1288 and :1737, both calling setShowCompletenessPanel ' +
      'directly. Nothing dispatches the event, so THIS LISTENER is dead code; the panel is not.',
  };

  it('every cad:open* listener is dispatched from somewhere in the CAD UI', () => {
    const unreachable = listened
      .filter((evt) => !others.some(([, src]) => src.includes(evt)))
      .filter((evt) => !(evt in OPENED_ANOTHER_WAY));
    expect(
      unreachable,
      unreachable.length
        ? `CADLayout listens for these and nothing in app/admin/cad mentions them, so the panel ` +
          `cannot be opened from the UI. That is the COGO defect: built, working, unreachable.\n  ` +
          unreachable.join('\n  ') +
          `\n\nAdd a menu item, a context-menu entry or a palette command that dispatches it — or ` +
          `delete the listener and the panel together.`
        : undefined,
    ).toEqual([]);
  });

  it('the two panels this check was built to investigate are reachable', () => {
    // Named because both were WRONGLY reported unreachable while the probe was being written, and a
    // future reader deserves to know they were checked rather than assumed.
    const reach = (evt: string) => others.some(([, src]) => src.includes(evt));

    // Reachable by its event: the context menu's "Edit Label Preferences…" dispatches it.
    expect(reach('cad:openFeatureLabelPrefs'), 'context menu → "Edit Label Preferences…"').toBe(true);

    // Reachable, but NOT by its event — the panel opens through props, so the listener is redundant.
    // Asserted in both directions so the distinction cannot rot: if someone adds a dispatcher, this
    // fails and the exemption above should go.
    expect(
      reach('cad:openCompletenessPanel'),
      'a dispatcher for cad:openCompletenessPanel now exists — remove it from OPENED_ANOTHER_WAY',
    ).toBe(false);
    expect(layout).toContain('onOpenCompletenessPanel');
  });
});
