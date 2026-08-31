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
const NOTE = 'app/admin/research/components/CountyNote.tsx';
const NOTE_CSS = 'app/admin/research/components/CountyNote.css';
const BATCH = 'app/admin/research/_tabs/PipelineTab.tsx';

describe('the county check is wired into the create form', () => {
  it('the form imports the checker', () => {
    expect(read(FORM)).toMatch(/import\s*\{[^}]*checkCounty[^}]*\}\s*from\s*['"]@\/lib\/research\/county-input['"]/);
  });

  it('it is computed from the county field, not from a constant', () => {
    // `checkCounty('Bell')` would satisfy a laxer assertion and check nothing the user typed.
    expect(read(FORM)).toMatch(/checkCounty\(\s*newProject\.county\s*\)/);
  });

  it('the warning is actually RENDERED — the notice existing is not the same as reaching a reader', () => {
    // C3 moved the rendering into a shared <CountyNote>, so this now has TWO halves and both
    // matter. Asserting only that CountyNote.tsx renders the branches would pass while nothing
    // mounted it — the exact defect this file exists for, one level up. Asserting only that the
    // form mounts it would pass if the component rendered nothing.
    const form = read(FORM);
    const note = read(NOTE);

    expect(form, 'the form must MOUNT the note').toMatch(/<CountyNote/);
    expect(form).toContain("from '../components/CountyNote'");
    expect(form, 'the mounted note must be fed the computed check').toContain('check={countyCheck}');

    // Both branches, because they carry different messages for different mistakes and collapsing
    // them is precisely what this feature exists to avoid.
    expect(note).toContain("check.kind === 'is-state'");
    expect(note).toContain("check.kind === 'unknown'");
    // The WARN variant specifically. `toContain('research-county-note')` was the first version of
    // this line and it passed a mutation that renamed the warning's class outright — the plain
    // note class survives on the canonical-spelling hint, so the looser assertion matched that
    // instead and reported a warning nobody could see as wired. The probe was the bug.
    expect(note).toContain('research-county-note--warn');
    expect(note.match(/research-county-note--warn/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
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

  it('the styles the warning names actually exist, and travel with the component', () => {
    // A class the stylesheet has never heard of renders as unstyled text in the middle of a form —
    // visible in a test, invisible as a warning.
    const css = read(NOTE_CSS);
    expect(css).toContain('.research-county-note');
    expect(css).toContain('.research-county-note--warn');
    expect(css).toContain('.research-county-note__suggest');
    // And the component imports its own sheet rather than depending on a route-scoped one. The
    // last shared component here to rely on AdminResearch.css rendered unstyled on a route that
    // did not import it, with nothing erroring. Third instance in this repo.
    expect(read(NOTE)).toContain("import './CountyNote.css'");
  });
  it('the BATCH form asks the same question — C3 parity', () => {
    // The batch form is the only UI that reaches the worker, so it is the form where a wrong
    // county costs money rather than just time. It had no check at all until C3.
    const batch = read(BATCH);
    expect(batch).toMatch(/checkCounty/);
    expect(batch).toMatch(/<CountyNote/);
  });

  it('each batch row gets its OWN note id', () => {
    // Duplicate ids would make every row's input point aria-describedby at the FIRST row's note,
    // so a screen-reader user filling in row four hears a warning about row one — confidently,
    // and wrongly. Worse than no note.
    expect(read(BATCH)).toContain('id={`batch-county-${idx}`}');
  });

  it('the checker reads the shipped 254-county table rather than a copy', () => {
    // A second hand-maintained list is a second thing to be wrong, and it would drift the moment a
    // county's CAD assignment changed.
    expect(read(MODULE)).toMatch(/from\s*['"]@\/worker\/src\/lib\/county-fips['"]/);
  });
});
