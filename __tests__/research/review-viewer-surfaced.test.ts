import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Plan RESEARCH_SYSTEM_COMPLETION U2 — every gathered document is viewable in Review through the
// persistent-zoom SourceDocumentViewer. Assert the review stage renders it and opens it from the
// document rows (setViewerDoc), so a captured deed/plat/aerial is one click from full-size viewing.
const page = fs.readFileSync(path.join(process.cwd(), 'app/admin/research/[projectId]/page.tsx'), 'utf8');

describe('the persistent-zoom viewer is surfaced in Review', () => {
  it('renders SourceDocumentViewer for the selected document', () => {
    expect(page).toMatch(/import SourceDocumentViewer from '\.\.\/components\/SourceDocumentViewer'/);
    expect(page).toMatch(/<SourceDocumentViewer/);
    expect(page).toMatch(/document=\{viewerDoc\}/);
  });
  it('opens it from gathered-document rows (more than one entry point)', () => {
    const opens = (page.match(/setViewerDoc\(doc\)/g) ?? []).length;
    expect(opens).toBeGreaterThanOrEqual(2);
  });
});
