// C9 — in-place editing in the point table, and the boundary around it.
//
// ── THE BOUNDARY IS THE FEATURE ─────────────────────────────────────────────────────────────────
//
// `updatePoint` is a blind shallow merge. It re-derives nothing and does not touch the CAD feature
// the point is linked to via `featureId`. So "editable in place" is only safe for fields that
// derive nothing and drive nothing, and most of `SurveyPoint` fails that test:
//
//   northing / easting — the linked feature carries its own geometry. Editing the number in the
//                        table would move the point in the list and leave it where it was on the
//                        canvas: two truths about one point, and no error anywhere.
//   pointName          — `parsedName` is derived from it, and `point-rename.ts` exists precisely
//                        because a rename must find and update every reference.
//   rawCode            — `parsedCode`, `resolvedAlphaCode`, `resolvedNumericCode` and
//                        `codeDefinition` all derive from it.
//
// Those belong to C11's point OPERATIONS, which can re-derive and sync. This file pins that the
// table edits only the three safe fields, because the tempting next commit is "while we're here,
// make northing editable too" — which would ship a desync with no symptom until somebody prints.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'app/admin/cad/components/PointTablePanel.tsx'), 'utf8');
// Comments stripped: this file's own header names the fields it forbids, and an unstripped scan
// would match its documentation. The trap that cost C3's guard three revisions.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Which fields the table actually writes through `updatePoint`. */
function editedFields(): string[] {
  return [...code.matchAll(/updatePoint\([^,]+,\s*\{\s*([A-Za-z]+)\s*:/g)].map((m) => m[1]);
}

describe('the table edits exactly the fields that are safe to edit', () => {
  const edited = new Set(editedFields());

  for (const field of ['description', 'elevation', 'monumentAction']) {
    it(`edits ${field}`, () => {
      expect(edited.has(field), `${field} should be editable in place`).toBe(true);
    });
  }

  for (const field of ['northing', 'easting', 'pointName', 'pointNumber', 'rawCode', 'layerId']) {
    it(`does NOT edit ${field}`, () => {
      expect(
        edited.has(field),
        `${field} has a derived companion or a linked feature — editing it here desyncs silently. C11.`,
      ).toBe(false);
    });
  }
});

describe('the editing interaction', () => {
  it('stops the click reaching the row, which selects the point', () => {
    // Without this, opening a cell also jumps the canvas to that point.
    expect(code).toMatch(/stopPropagation/);
  });

  it('Escape abandons the edit instead of committing it', () => {
    expect(code).toMatch(/e\.key === 'Escape'/);
  });

  it('Enter commits', () => {
    expect(code).toMatch(/e\.key === 'Enter'/);
  });

  it('a blank elevation clears it to null rather than writing zero', () => {
    // "No elevation" is a real state for a 2D point and is not the same as an elevation of zero.
    expect(code).toMatch(/elevation:\s*null/);
  });

  it('rejects a non-numeric elevation instead of storing NaN', () => {
    expect(code).toMatch(/Number\.isFinite/);
  });
});

describe('description became a real column', () => {
  it('is sortable', () => {
    // It was already searchable by `getSortedPoints`'s filter while having no column and no sort —
    // so a surveyor could search for a note they could neither read nor order by.
    const store = readFileSync(join(process.cwd(), 'lib/cad/store/point-store.ts'), 'utf8');
    expect(store).toMatch(/PointSortField[\s\S]*'description'/);
    expect(code).toMatch(/handleHeaderClick\('description'\)/);
  });
});
