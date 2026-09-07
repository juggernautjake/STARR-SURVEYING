// Plan PLATS_FIRST_AND_VIEWER phases 4–5 (owner, 2026-09-07): the dedicated viewer shows the title
// with a document arrow on each side and walks EVERY stage's ordered list; every document has a
// View in the Analysis stage, on aligned columns; the Activity tab copies the whole log.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { viewerIntent, VIEWER_SHORTCUTS } from '../../lib/viewers/viewer-fit';
import { activityLogLine, activityLogText } from '../../app/admin/research/components/ResearchRunView';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('the viewer: ‹ title › between documents', () => {
  const viewer = read('app/admin/research/components/SourceDocumentViewer.tsx');
  it('takes the ordered list, the index and the navigate callback', () => {
    expect(viewer).toContain('documents?: ResearchDocument[];');
    expect(viewer).toContain('index?: number;');
    expect(viewer).toContain('onNavigate?: (index: number) => void;');
  });
  it('renders an arrow on each side of the title and the position, disabled at the ends', () => {
    expect(viewer).toContain('data-testid="viewer-prev-doc"');
    expect(viewer).toContain('data-testid="viewer-next-doc"');
    expect(viewer).toContain('data-testid="viewer-doc-position"');
    expect(viewer).toContain('disabled={!canPrev}');
    expect(viewer).toContain('disabled={!canNext}');
    // The title sits BETWEEN the two arrows.
    const prev = viewer.indexOf('data-testid="viewer-prev-doc"');
    const title = viewer.indexOf('className="research-viewer__header-name"');
    const next = viewer.indexOf('data-testid="viewer-next-doc"');
    expect(prev).toBeGreaterThan(-1); expect(title).toBeGreaterThan(-1); expect(next).toBeGreaterThan(-1);
    expect(prev).toBeLessThan(title);
    expect(title).toBeLessThan(next);
  });
  it('a new document opens on page one and keeps the zoom', () => {
    expect(viewer).toContain('useEffect(() => { setCurrentPage(0); }, [doc.id]);');
  });
  it('the keyboard moves between documents with [ and ], not the page arrows', () => {
    expect(viewerIntent({ key: '[' })).toBe('prev-doc');
    expect(viewerIntent({ key: ']' })).toBe('next-doc');
    expect(viewerIntent({ key: 'ArrowLeft' })).toBe('prev-page');
    expect(VIEWER_SHORTCUTS.some((s) => s.intent === 'next-doc' && s.label === 'Next document')).toBe(true);
    expect(viewer).toContain("if (intent === 'prev-doc' || intent === 'next-doc') {");
  });
  it('is styled on the route sheet', () => {
    const css = read('app/admin/styles/AdminResearch.css');
    expect(css).toContain('.research-viewer__header-name-row {');
    expect(css).toContain('.research-viewer__doc-nav {');
  });
});

describe('every stage passes its ordered list (check the CALLER)', () => {
  it('Review / Analysis (page.tsx)', () => {
    const page = read('app/admin/research/[projectId]/page.tsx');
    expect(page).toContain('documents={documents}');
    expect(page).toContain('index={documents.findIndex((d) => d.id === viewerDoc.id)}');
    expect(page).toMatch(/onNavigate=\{\(i\) => \{\s*const next = documents\[i\];/);
  });
  it('Research (ResearchRunView)', () => {
    const view = read('app/admin/research/components/ResearchRunView.tsx');
    expect(view).toContain('documents={docs as unknown as ResearchDocument[]}');
    expect(view).toContain('index={docs.findIndex((d) => d.id === viewerDoc.id)}');
  });
  it('Uploads (DocumentUploadPanel)', () => {
    const panel = read('app/admin/research/components/DocumentUploadPanel.tsx');
    expect(panel).toContain('index={documents.findIndex((d) => d.id === viewingDoc.id)}');
  });
});

describe('the Analysis stage: every document has a row, and the buttons line up', () => {
  const panel = read('app/admin/research/components/AnalysisEstimatePanel.tsx');
  it('lists the unpriced documents too, with View + Source', () => {
    expect(panel).toContain('for (const d of docs ?? []) {');
    expect(panel).toContain("if (!quoted.has(d.id)) rows.push({ id: d.id, label: d.document_label || d.original_filename || 'Untitled', doc: d });");
    expect(panel).toContain('data-testid="analysis-doc-row"');
  });
  it('uses fixed grid columns so a row without a Source link keeps its buttons aligned', () => {
    expect(panel).toContain("const GRID_COLUMNS = 'minmax(0, 1fr) 3.25rem 3.75rem 7.5rem 4.25rem 4.75rem';");
    expect(panel).toContain("gridTemplateColumns: GRID_COLUMNS");
    // Six cells per row: label, pages, price, Analyze, View, Source — the last three always present.
    const row = panel.slice(panel.indexOf('data-testid="analysis-doc-row"'), panel.indexOf('</li>', panel.indexOf('data-testid="analysis-doc-row"')));
    expect((row.match(/<span style=\{\{ textAlign: 'center' \}\}>/g) ?? []).length).toBe(2);
    expect(row).toContain("<span style={{ whiteSpace: 'nowrap' }}>");
  });
  it('keeps the readability badges and the per-file Analyze', () => {
    expect(panel).toContain("processing_status === 'unreadable'");
    expect(panel).toContain('review-doc-card__badge--warn');
    expect(panel).toContain('analyzeOne(quote)');
    expect(panel).toContain('title="View — page through every page and zoom"');
  });
});

describe('the Activity tab copies the whole log', () => {
  it('renders a Copy all button that writes the merged log to the clipboard', () => {
    const view = read('app/admin/research/components/ResearchRunView.tsx');
    expect(view).toContain('data-testid="rrv-copy-log"');
    expect(view).toContain('await navigator.clipboard.writeText(activityLogText(merged));');
    expect(view).toContain('.rrv__copy-btn {');
  });
  it('formats each line like the list shows it, with a header', () => {
    const e = { layer: 'TexasFile', source: 'texasfile', method: 'plat-search', status: 'success' as const, details: 'Plat search "WINNIE MAE ADDITION" → 2 plat(s)', dataPointsFound: 2, duration_ms: 0, timestamp: '2026-09-07T04:58:24.012Z' };
    const line = activityLogLine(e);
    expect(line).toMatch(/^✓ \[.+\] TexasFile: Plat search "WINNIE MAE ADDITION" → 2 plat\(s\) \[2\]$/);
    const text = activityLogText([e, { ...e, status: 'fail', error: 'Purchase returned no images', details: undefined, dataPointsFound: 0 }], new Date('2026-09-07T05:08:30Z'));
    expect(text).toContain('STARR RECON — Activity Log');
    expect(text).toContain('Entries: 2   Errors: 1   Warnings: 0');
    expect(text).toContain('✕ ');
    expect(text).toContain('TexasFile: Purchase returned no images');
  });
});
