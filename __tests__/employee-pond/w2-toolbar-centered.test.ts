// __tests__/employee-pond/w2-toolbar-centered.test.ts
//
// Slice W2 — user feedback: "Please make it so that the search bar
// is centered over the circle viewer, and please align the role
// filter button and the search input bar. The button is still
// sitting lower than the search bar. and also move the 'Showing 3
// of 3' right above the circle but beneath the search text input
// bar."
//
// Three contracts to lock down:
//   1) The toolbar is centered + capped to the pond diameter so
//      the search input + filter button sit directly above the
//      circle.
//   2) The filter-button wrap is a flex container the same 40px
//      height as the search input, so the button truly shares the
//      toolbar baseline (the previous fix relied on the toolbar's
//      align-items:center which left a few px of drift).
//   3) The count chip is rendered in its own .employee-pond__count-row
//      directly above the pond circle.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('EmployeePond JSX — count moves to its own row above the pond (W2)', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('renders the count chip inside .employee-pond__count-row', () => {
    expect(SRC).toMatch(/<div\s+className="employee-pond__count-row"[\s\S]*?<span\s+className="employee-pond__count"/);
  });

  it('places the count row BEFORE the .employee-pond__surface (above the circle)', () => {
    const countRowIdx = SRC.indexOf('employee-pond__count-row');
    const surfaceIdx = SRC.indexOf('employee-pond__surface');
    expect(countRowIdx).toBeGreaterThan(-1);
    expect(surfaceIdx).toBeGreaterThan(-1);
    expect(countRowIdx).toBeLessThan(surfaceIdx);
  });

  it('places the count row AFTER the .employee-pond__toolbar (below the search bar)', () => {
    const toolbarIdx = SRC.indexOf('employee-pond__toolbar');
    const countRowIdx = SRC.indexOf('employee-pond__count-row');
    expect(toolbarIdx).toBeGreaterThan(-1);
    expect(countRowIdx).toBeGreaterThan(toolbarIdx);
  });
});

describe('EmployeePond CSS — centered toolbar + aligned filter button + count row (W2)', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('the toolbar is centered + capped to the pond diameter', () => {
    expect(CSS).toMatch(
      /\.employee-pond__toolbar\s*\{[\s\S]*?justify-content:\s*center;[\s\S]*?margin:\s*0 auto;[\s\S]*?max-width:\s*calc\(var\(--pond-radius, 360px\) \* 2\)/,
    );
  });

  it('the filter wrap is a 40px flex container so the button shares the search input baseline', () => {
    expect(CSS).toMatch(
      /\.employee-pond__filter-wrap\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*stretch;[\s\S]*?height:\s*40px/,
    );
  });

  it('the count row is centered + capped to the pond diameter', () => {
    expect(CSS).toMatch(
      /\.employee-pond__count-row\s*\{[\s\S]*?justify-content:\s*center;[\s\S]*?max-width:\s*calc\(var\(--pond-radius, 360px\) \* 2\)/,
    );
  });

  it("the count chip no longer uses `margin-left: auto` (it's now centered by its row instead)", () => {
    const countMatch = CSS.match(/\.employee-pond__count\s*\{([^}]*)\}/);
    expect(countMatch).not.toBeNull();
    expect(countMatch![1]).not.toMatch(/margin-left:\s*auto/);
  });
});
