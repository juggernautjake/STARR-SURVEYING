// __tests__/admin-styling/p5-search-row-alignment.test.ts
//
// Slice P5 — user feedback: "any search bars that exist should not
// be so wide. Please just make them a normal width. Also fix the
// vertical positioning issues where not all of the buttons and stuff
// are in vertical alignment."
//
// Source-lock for the three pages we touched in this sweep:
//   /admin/jobs       — search form capped at 380px, Deleted button 36px
//   /admin/contacts   — search form capped at 380px, all row controls 36px
//   /admin/employees  — list-view role/status selects pinned to 36px
//
// These are CSS / inline-style assertions only; UI is not rendered.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/jobs — search row width + Deleted button height', () => {
  it("caps the search form at ~380px (no longer flex:1)", () => {
    const CSS = read('app/admin/styles/AdminJobs.css');
    expect(CSS).toMatch(/\.jobs-page__search-form\s*\{[\s\S]*?flex:\s*0 1 380px/);
  });

  it("the .jobs-page__search-form block itself does not contain `flex: 1` (stretching)", () => {
    const CSS = read('app/admin/styles/AdminJobs.css');
    const blockMatch = CSS.match(/\.jobs-page__search-form\s*\{([^}]*)\}/);
    expect(blockMatch).not.toBeNull();
    expect(blockMatch![1]).not.toMatch(/flex:\s*1\s*;/);
  });

  it("the Deleted toggle button is height: 36 so it sits on the row baseline", () => {
    const SRC = read('app/admin/jobs/page.tsx');
    expect(SRC).toMatch(/height:\s*36,[\s\S]*?Deleted/);
  });
});

describe('/admin/contacts — search row controls share a 36px baseline', () => {
  const SRC = read('app/admin/contacts/page.tsx');

  it('caps the search form at ~380px (no longer `1 1 280px` growing)', () => {
    expect(SRC).toMatch(/flex:\s*'0 1 380px'/);
  });

  it('inputStyle pins to 36px box-sizing:border-box', () => {
    expect(SRC).toMatch(/const inputStyle:[\s\S]*?height:\s*36,[\s\S]*?boxSizing:\s*'border-box'/);
  });

  it('secondaryButtonStyle pins to 36px box-sizing:border-box', () => {
    expect(SRC).toMatch(/const secondaryButtonStyle:[\s\S]*?height:\s*36,[\s\S]*?boxSizing:\s*'border-box'/);
  });

  it('chipStyle pins to 36px box-sizing:border-box (search row label filters)', () => {
    expect(SRC).toMatch(/const chipStyle:[\s\S]*?height:\s*36,[\s\S]*?boxSizing:\s*'border-box'/);
  });
});

describe('/admin/employees — list-view selects share the 36px baseline', () => {
  const SRC = read('app/admin/employees/page.tsx');

  it('roleFilter <select> is height: 36 box-sizing border-box', () => {
    expect(SRC).toMatch(/value=\{roleFilter\}[\s\S]{0,200}/); // sanity: tag exists
    expect(SRC).toMatch(/minWidth:\s*'140px',\s*height:\s*36,\s*boxSizing:\s*'border-box'/);
  });

  it('statusFilter <select> is height: 36 box-sizing border-box', () => {
    expect(SRC).toMatch(/minWidth:\s*'120px',\s*height:\s*36,\s*boxSizing:\s*'border-box'/);
  });
});
