// __tests__/research/final-document-tab-is-mounted.test.tsx — Phase B1a.
//
// Sixth extraction from `[projectId]/page.tsx`: the Final Job Package tab — the deliverable a
// surveyor hands over. 271 lines out.
//
// ── WHY A TAB AND NOT THE WHOLE STAGE, MEASURED ─────────────────────────────────────────────────
//
// The four stage-level extractions worked because each stage referenced a handful of things. The
// `jobprep` stage references **79 identifiers** from the page — the CAD canvas, annotation history,
// undo stack, tool settings, layer state. A component with a 79-prop interface moves the complexity
// without reducing any of it and adds a prop-drilling layer on top.
//
// So the stage comes apart from the inside. This tab is display plus three actions and holds no
// state of its own; the Drawing tab is where the other seventy-odd live, and its state wants
// extracting into a hook before its markup moves.
//
// ── A PLACEHOLDER TYPE IS THE SAME MISTAKE AS A CAST ────────────────────────────────────────────
//
// The first draft of the props guessed shapes — `{ id?: string; name?: string }` for the drawing,
// `{ overall_confidence?: number }` for the comparison, `() => void` for the export. `tsc` rejected
// four of them across three rounds, and the fix each time was to use the type the CHILD already
// declares. Guessing a type to make an extraction compile is how `owner_name` came to be read off a
// column that does not exist (G10): both tell the compiler to stop asking a question that had a
// real answer.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PAGE = read('app/admin/research/[projectId]/page.tsx');
const SECT = read('app/admin/research/[projectId]/_sections/FinalDocumentTab.tsx');

describe('the page still mounts it', () => {
  it('imports the section', () => {
    expect(PAGE).toContain("import FinalDocumentTab from './_sections/FinalDocumentTab'");
  });

  it('renders it on the finaldoc tab, and keeps that condition on the page', () => {
    // The tab condition stays where the other two tabs' conditions are — moving one inside the
    // component and leaving two outside would make the stage harder to read, not easier.
    expect(PAGE).toContain("{jobPrepTab === 'finaldoc' && (");
    expect(PAGE).toMatch(/<FinalDocumentTab\s/);
  });

  it('with no second guard on the element line', () => {
    const line = PAGE.split('\n').find((l) => l.includes('<FinalDocumentTab'))!;
    expect(line.trim(), `unexpected wrapper: ${line.trim()}`).toBe('<FinalDocumentTab');
  });

  it('passes every value the tab renders', () => {
    const at = PAGE.indexOf('<FinalDocumentTab');
    const el = PAGE.slice(at, PAGE.indexOf('/>', at));
    for (const p of ['project={project}', 'documents={documents}', 'stats={stats}',
      'activeDrawing={activeDrawing}', 'comparisonResult={comparisonResult}',
      'sanitizedDrawingSvg={sanitizedDrawingSvg}', 'jobNotes={jobNotes}']) {
      expect(el, `${p} is missing`).toContain(p);
    }
  });

  it('and every action it offers', () => {
    const at = PAGE.indexOf('<FinalDocumentTab');
    const el = PAGE.slice(at, PAGE.indexOf('/>', at));
    for (const p of ['onExport={handleExportDrawing}', 'onOpenInCAD={handleOpenInCAD}',
      // N2 — the debounced save moved INTO <ProjectNotes>, which the tab now renders. The page
      // keeps the value and hands down a plain setter; the handler that used to wrap it (and
      // swallowed its own failures) is gone.
      'onMarkComplete={handleMarkComplete}', 'onJobNotesChange={setJobNotes}']) {
      expect(el, `${p} is missing`).toContain(p);
    }
  });

  it('the old inline markup is gone', () => {
    expect(PAGE).not.toContain('research-final-doc__header');
  });
});

describe('the types are the real ones', () => {
  it('borrows the drawing and comparison types rather than approximating them', () => {
    // The guard against the draft's own mistake coming back. `{ id?: string; name?: string }` and
    // `{ overall_confidence?: number }` both compiled at the section and failed at the call site —
    // a placeholder type is a cast wearing an interface.
    expect(SECT).toContain('activeDrawing: RenderedDrawing | null');
    expect(SECT).toContain('comparisonResult: ComparisonResult | null');
  });

  it('takes the export signature from ExportPanel, not a simplification of it', () => {
    // `() => void` compiled here and was rejected at the call site: the real handler returns a
    // Promise and takes a format and a view mode.
    expect(SECT).toContain('onExport: (format: ExportFormat, viewMode: ViewMode) => Promise<void>');
    expect(SECT).toContain('onOpenInCAD: () => Promise<void>');
  });

  it('narrows the tab id to the three that exist', () => {
    // `(tab: string) => void` accepts 'finaldocument', 'Drawing', or anything else, and the page's
    // setter would reject it at runtime with no type error anywhere.
    expect(SECT).toContain("export type JobPrepTab = 'drawing' | 'fieldplan' | 'finaldoc'");
    expect(SECT).toContain('onChangeTab: (tab: JobPrepTab) => void');
  });
});

describe('the section is presentational', () => {
  it('holds no state and fetches nothing', async () => {
    const { stripComments } = await import('../../scripts/audit-starr-assumptions.mjs');
    const code = stripComments(SECT);
    expect(code).toContain('export default function FinalDocumentTab');
    expect(code).not.toContain('useState');
    expect(code).not.toContain('useEffect');
    expect(code).not.toContain('fetch(');
  });

  it('still mounts the two panels the package is built from', () => {
    // SurveyPlanPanel is the field plan; ExportPanel is how the drawing leaves the building.
    // Losing either is invisible — the tab still renders.
    //
    // ── `toContain('<Name')` IS NOT AN ELEMENT CHECK ─────────────────────────────────────────────
    //
    // `<SurveyPlanPanelX` contains `<SurveyPlanPanel`, so a rename passed this. **Third time today**
    // the same substring flaw appeared: `research-modal__county-note` matched while its `--warn`
    // variant was renamed away (C2), and `research-pipeline-note` matched the button's
    // `research-pipeline-note__link` while the note's own class was deleted (B1a, an hour ago).
    //
    // The element has to END somewhere — whitespace, `>` or `/`. Matching the name alone matches
    // every name that starts with it.
    expect(SECT).toMatch(/<SurveyPlanPanel[\s/>]/);
    expect(SECT).toMatch(/<ExportPanel[\s/>]/);
  });
});
