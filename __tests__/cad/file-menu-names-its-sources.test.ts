// __tests__/cad/file-menu-names-its-sources.test.ts
//
// CAD_AUDIT Slice S5a — the File menu says WHERE each open and save goes.
//
// S1a catalogued the menu bar by driving the live app and recorded, for S5: *"the difference between
// 'Open…' and 'Open Saved Drawing…' is not discoverable from the labels."* It is a real distinction —
// one is a file picker on this machine, the other lists drawings saved to the cloud — and picking the
// wrong one hands a surveyor a dialog that looks broken rather than one that looks like the other
// option.
//
// The Save half of the same menu already got this right: "Save to Cloud…" beside "Save a copy (local
// .starr)…". So the fix was not to invent a convention, it was to apply the one already in the file.
//
// ── WHY THIS IS WORTH A TEST ────────────────────────────────────────────────────────────────────
//
// Nothing breaks when a label stops naming its source. It typechecks, it renders, every existing test
// passes, and the only symptom is a surveyor opening the wrong dialog — which they will read as the
// software being confusing rather than as a regression worth reporting. The symmetry is the product
// here, and symmetry is exactly what a later single-line edit erodes without noticing.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MENU = readFileSync(
  join(__dirname, '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
  'utf8',
);

/** The `label:` values of the File menu's own items, before its first submenu. */
function fileMenuLabels(): string[] {
  const start = MENU.indexOf("label: 'File',");
  expect(start, "the File menu moved — this test is looking at nothing").toBeGreaterThan(-1);
  // Stop at Export, the first submenu: everything above it is the flat top level of File.
  const end = MENU.indexOf("label: 'Export',", start);
  const block = MENU.slice(start, end > start ? end : start + 4000);
  return [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
}

describe('S5a — the File menu names its sources', () => {
  const labels = fileMenuLabels();

  it('found the File menu items', () => {
    // Vacuous-pass guard: every assertion below is over this array.
    expect(labels.length).toBeGreaterThan(8);
  });

  it('distinguishes opening from this computer and opening from the cloud', () => {
    const opens = labels.filter((l) => /^Open/.test(l));
    expect(opens.length, 'expected two distinct Open entries').toBeGreaterThanOrEqual(2);

    // The specific regression: a bare "Open…" beside a second Open that goes somewhere else.
    expect(
      opens,
      'a bare "Open…" does not say where it opens FROM, and there is a second Open in this menu ' +
        'that goes somewhere different. Name the source, as the Save entries below it already do.',
    ).not.toContain('Open…');

    expect(opens.some((l) => /this computer|local/i.test(l)), 'no Open names the local machine').toBe(true);
    expect(opens.some((l) => /cloud/i.test(l)), 'no Open names the cloud').toBe(true);
  });

  it('keeps the Save entries naming their destinations too', () => {
    // The half that was already right. Asserted so a future tidy-up cannot "simplify" these back to
    // a bare "Save as…" and quietly recreate the ambiguity on the other side of the menu.
    const saves = labels.filter((l) => /^Save/.test(l));
    expect(saves.some((l) => /cloud/i.test(l)), 'no Save names the cloud').toBe(true);
    expect(saves.some((l) => /local|\.starr/i.test(l)), 'no Save names a local file').toBe(true);
  });

  it('leaves the plain Save alone', () => {
    // "Save" with no source is correct: it writes back to wherever the drawing already lives, which
    // is the one case where naming a destination would be a lie.
    expect(labels).toContain('Save');
  });

  it('still routes Open through the unsaved-changes guard', () => {
    // Renaming a label is exactly the kind of edit that can drop the wrapper around its action.
    // `unsaved-changes-guard.test.ts` asserts this too; repeated here because THIS is the test that
    // will fail first if the rename is redone carelessly.
    expect(MENU).toMatch(/requestDiscard\(openFileDialog\)/);
  });
});
