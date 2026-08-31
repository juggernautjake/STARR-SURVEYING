// The county check is REACHED, not merely written.
//
// `county-input.ts` has eighteen passing tests and would have exactly zero effect on the mistake it
// was written for — "Texas" typed into the County box — if the form never called it. That failure
// mode is this repo's most common one, and a module's own suite cannot detect it: every assertion
// in county-input.test.ts passes whether or not a single component imports the file.
//
// So this asserts the CALLER: the form imports it, computes it from the county field, renders the
// warning, and sends the canonical name.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const FORM = 'app/admin/research/_tabs/ProjectsTab.tsx';
const MODULE = 'lib/research/county-input.ts';
const CSS = 'app/admin/styles/AdminResearch.css';

describe('the county check is wired into the create form', () => {
  it('the form imports the checker', () => {
    expect(read(FORM)).toMatch(/import\s*\{[^}]*checkCounty[^}]*\}\s*from\s*['"]@\/lib\/research\/county-input['"]/);
  });

  it('it is computed from the county field, not from a constant', () => {
    // `checkCounty('Bell')` would satisfy a laxer assertion and check nothing the user typed.
    expect(read(FORM)).toMatch(/checkCounty\(\s*newProject\.county\s*\)/);
  });

  it('the warning is actually RENDERED — the notice existing is not the same as reaching a reader', () => {
    const src = read(FORM);
    // Both branches, because they carry different messages for different mistakes and collapsing
    // them is precisely what this feature exists to avoid.
    expect(src).toMatch(/countyCheck\.kind === 'is-state'/);
    expect(src).toMatch(/countyCheck\.kind === 'unknown'/);
    // The WARN variant specifically. `toContain('research-modal__county-note')` was the first
    // version of this line and it passed a mutation that renamed the warning's class outright —
    // the plain note class survives on the canonical-spelling hint, so the looser assertion matched
    // that instead and reported a warning nobody could see as wired. The probe was the bug.
    expect(src).toContain('research-modal__county-note--warn');
    // Both warning branches carry it, not just one.
    expect(src.match(/research-modal__county-note--warn/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('the suggestions are clickable and set the field', () => {
    expect(read(FORM)).toMatch(/setNewProject\(p => \(\{ \.\.\.p, county: s \}\)\)/);
  });

  it('the canonical spelling is what gets SENT', () => {
    const src = read(FORM);
    // Two halves, and the second is the one that would silently rot: computing `county` and then
    // not overriding it in the body leaves the raw typed value going to the API, with every other
    // assertion here still green.
    expect(src).toMatch(/countyCheck\.kind === 'ok' \? countyCheck\.canonical : newProject\.county/);
    expect(src).toMatch(/JSON\.stringify\(\{[^}]*county,/);
  });

  it('the styles the warning names actually exist', () => {
    // A class the stylesheet has never heard of renders as unstyled text in the middle of a form —
    // visible in a test, invisible as a warning.
    const css = read(CSS);
    expect(css).toContain('.research-modal__county-note');
    expect(css).toContain('.research-modal__county-note--warn');
    expect(css).toContain('.research-modal__county-suggest');
  });

  it('the checker reads the shipped 254-county table rather than a copy', () => {
    // A second hand-maintained list is a second thing to be wrong, and it would drift the moment a
    // county's CAD assignment changed.
    expect(read(MODULE)).toMatch(/from\s*['"]@\/worker\/src\/lib\/county-fips['"]/);
  });
});
