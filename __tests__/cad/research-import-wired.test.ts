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
import { expectOrder } from '../helpers/expect-order';

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
    expectOrder(body, 'confirmAction(', 'addFeatures(', 'omissions are confirmed before anything lands');
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

describe('S9b — comparing with a prior survey is reachable', () => {
  it('appears in the Survey menu, where a surveyor looks for it', () => {
    const surveyBlock = code.slice(code.indexOf("label: 'Survey'"), code.indexOf("label: 'Draw'"));
    expect(surveyBlock).toContain('Compare with a prior survey');
  });

  it('uses the S9a core rather than reimplementing the comparison', () => {
    expect(code).toContain("from '@/lib/cad/compare/survey-compare'");
    expect(code).toContain('compareSurveys(');
    expect(code).toContain('callsFromPoints(');
  });

  it('leads the report with the basis statement', () => {
    // The finding that stops a surveyor chasing ghosts. Burying it under a list of differences would
    // present a change of frame as eighteen errors — the exact failure S9a exists to prevent.
    const fn = code.slice(code.indexOf('async function openCompareSurveys'));
    const body = fn.slice(0, fn.indexOf('async function openDxf'));
    expect(body).toContain('result.basisStatement');
    expectOrder(body, 'result.basisStatement', 'flaggedCount === 0', 'the basis leads the report');
  });

  it('refuses a non-traversable reading by name', () => {
    const fn = code.slice(code.indexOf('async function openCompareSurveys'));
    const body = fn.slice(0, fn.indexOf('async function openDxf'));
    expect(body).toContain('Nothing to compare');
    expect(body).toContain('lot-and-block');
  });

  it('surfaces the uncomparable courses too', () => {
    // A comparison that quietly drops the hard half reads as agreement.
    const fn = code.slice(code.indexOf('async function openCompareSurveys'));
    const body = fn.slice(0, fn.indexOf('async function openDxf'));
    expect(body).toContain('uncomparable');
    expect(body).toContain('Could not be compared');
  });
});

// ── CAD_AUDIT Slice S8c ─────────────────────────────────────────────────────────────────────────
//
// The visual pass S8b deferred finally ran, and the feature it was meant to confirm did not work:
// three features were added to a drawing with no layer to hold them, so `getVisibleFeatures`
// filtered every one of them out and the canvas stayed empty.
//
// Both halves were individually correct — that is why nothing caught it. These assertions are about
// the COMPOSITION, which is the only place the defect existed.

describe('the imported features can actually be rendered', () => {
  const fn = code.slice(code.indexOf('async function openResearchReading'));
  const body = fn.slice(0, fn.indexOf('async function openDxf') > 0
    ? fn.indexOf('async function openDxf') : fn.length);

  it('creates the layers the adapter says it needs', () => {
    expect(body).toContain('researchLayersToCreate(');
    expect(body).toContain('addLayer(');
  });

  it('creates them BEFORE adding the features', () => {
    // Not cosmetic ordering. A feature whose layer is absent is dropped by `getVisibleFeatures`,
    // so features added first are invisible until something unrelated triggers a re-render — which
    // is a worse bug than never drawing them, because it is intermittent.
    expectOrder(body, 'addLayer(', 'addFeatures(', 'layers exist before features reference them');
  });

  it('brings the new geometry into view', () => {
    // The reading's coordinates are relative to a point of beginning at (0,0). An import that lands
    // off-screen is indistinguishable from one that failed.
    expect(body).toContain('cad:zoomExtents');
  });

  // ── S8d ──
  it('puts the geometry on the SHEET when the drawing was empty', () => {
    // A traverse running south of the point of beginning has negative northings while the paper
    // occupies y >= 0, so a correctly imported tract sat entirely off the white sheet, on the grey.
    // It looked drawn and would have plotted blank.
    expect(body).toContain('cad:fitDrawingToPage');
    expect(body).toContain('wasEmpty');
  });

  it('does NOT move the sheet under a drawing already in progress', () => {
    // Re-fitting the page silently changes the surveyor's plot scale and page position. That is
    // their decision, not an import's — View > Fit Drawing to Page is there when they want it.
    expect(body).toMatch(/wasEmpty\s*\?\s*'cad:fitDrawingToPage'\s*:\s*'cad:zoomExtents'/);
  });

  it('decides emptiness BEFORE adding the features', () => {
    // Reading it afterwards would always say non-empty, so the sheet would never be fitted — a
    // silent no-op that looks exactly like working code.
    expectOrder(body, 'wasEmpty =', 'addFeatures(', 'emptiness is read before features are added');
  });
});
