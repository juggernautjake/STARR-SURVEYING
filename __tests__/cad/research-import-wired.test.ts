// CAD_AUDIT Slice S8b — the research adapter is reachable from the CAD menu.
//
// S8a built `featuresFromSurveyReading` and nothing called it. Shipping only the pure half is this
// codebase's most frequent defect — a correct module with no caller — and the research→CAD bridge
// would have been a conspicuous place to repeat it, since the whole point is that a surveyor stops
// re-typing calls the research side already read.
//
// These are source-level assertions. The visual pass — opening the menu, picking a file, reading the
// confirm dialog — needs a browser, and this session could not keep one connected to the dev server;
// that is recorded in the doc rather than glossed. What IS pinned here are the three decisions that
// would be silently wrong rather than loudly broken.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/cad/components/MenuBar.tsx'), 'utf8');

/** Comments stripped — every source check written this session failed first against its own
 *  explanatory prose, and a checker that cannot tell code from commentary would equally pass a file
 *  that only DESCRIBES the fix. */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('it is reachable at all', () => {
  it('appears in the Import submenu', () => {
    expect(code).toContain('Import Research Reading');
  });

  it('calls the S8a adapter rather than reimplementing it', () => {
    expect(code).toContain("from '@/lib/cad/import/from-survey-reading'");
    expect(code).toContain('featuresFromSurveyReading(');
  });
});

describe('it ADDS to the drawing instead of replacing it', () => {
  it('uses addFeatures, never loadDocument, on this path', () => {
    // The other importers call loadDocument, which throws the current drawing away. Right for "open
    // a DXF", catastrophic here: a deed boundary is brought INTO a drawing already in progress, and
    // replacing would silently destroy the surveyor's work.
    const fn = code.slice(code.indexOf('async function openResearchReading'));
    const body = fn.slice(0, fn.indexOf('async function openDxf'));
    expect(body).toContain('addFeatures(');
    expect(body).not.toContain('loadDocument(');
  });
});

describe('omissions are confirmed before anything lands', () => {
  const fn = code.slice(code.indexOf('async function openResearchReading'));
  const body = fn.slice(0, fn.indexOf('async function openDxf'));

  it('shows notDrawn in a dialog, not only in the console', () => {
    // The other importers log warnings to the console. Here the omissions ARE the safety property —
    // putting them where only a developer looks would defeat S8a's entire design.
    expect(body).toContain('notDrawn');
    expect(body).toContain('confirmAction(');
  });

  it('asks BEFORE calling addFeatures, not after', () => {
    expect(body.indexOf('confirmAction(')).toBeLessThan(body.indexOf('addFeatures('));
  });

  it('says the boundary is open when it is', () => {
    expect(body).toContain('left OPEN');
  });

  it('states that coordinates are not tied to the state plane', () => {
    // The one sentence that stops a record sketch being mistaken for a located survey.
    expect(body).toContain('not tied to the state plane');
  });
});

describe('a wrong file is refused by name', () => {
  it('checks for a traverse field before trusting the JSON', () => {
    // Parsing arbitrary JSON and producing an empty drawing would read as "this deed had no
    // boundary" rather than "you picked the wrong file".
    const fn = code.slice(code.indexOf('async function openResearchReading'));
    const body = fn.slice(0, fn.indexOf('async function openDxf'));
    expect(body).toContain("'traverse' in parsed");
    expect(body).toContain('Not a research reading');
  });

  it('tests for PRESENCE of traverse, not truthiness', () => {
    // `traverse` is legitimately null for a lot-and-block description, which the adapter handles and
    // explains. A truthiness check would reject exactly the documents that need the explanation.
    const fn = code.slice(code.indexOf('async function openResearchReading'));
    const body = fn.slice(0, fn.indexOf('async function openDxf'));
    expect(body).not.toMatch(/if\s*\(\s*!\s*parsed\.traverse\s*\)/);
  });
});
