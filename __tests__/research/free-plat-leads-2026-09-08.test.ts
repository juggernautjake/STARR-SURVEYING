// A free plat the county portal names but no server of ours can fetch (2026-09-08): the worker records
// it on the project, and the Analysis stage hands the person in the office the one-click fetch.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normaliseFreePlatLeads, platDocumentLabel } from '../../app/admin/research/components/FreePlatLeadsNotice';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('normaliseFreePlatLeads', () => {
  it('keeps well-formed leads with an http(s) URL and drops the rest', () => {
    const leads = normaliseFreePlatLeads([
      { name: 'WINNIE MAE ADN', url: 'https://www.bellcountytx.com/county_government/county_clerk/docs/plats/W/WINNIE%20MAE%20ADN.PDF', source: 'Bell County Clerk plat repository (bellcountytx.com)', subdivision: 'WINNIE MAE ADDITION', locatedAt: '2026-09-08T14:00:00Z' },
      { name: 'no url' },
      { name: 'bad scheme', url: 'javascript:alert(1)' },
      null,
      'x',
    ]);
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe('WINNIE MAE ADN');
    expect(leads[0].subdivision).toBe('WINNIE MAE ADDITION');
    expect(normaliseFreePlatLeads(undefined)).toEqual([]);
  });
});

describe('the Analysis stage mounts the notice from the project\'s metadata (check the CALLER)', () => {
  it('page.tsx renders FreePlatLeadsNotice above the review control with analysis_metadata.freePlatLeads', () => {
    const page = read('app/admin/research/[projectId]/page.tsx');
    expect(page).toContain("import FreePlatLeadsNotice from '../components/FreePlatLeadsNotice';");
    expect(page).toContain('<FreePlatLeadsNotice projectId={projectId} leads={(project.analysis_metadata as { freePlatLeads?: unknown } | null)?.freePlatLeads} onFiled={() => { loadProject(); loadDocuments(); }} />');
  });
  it('the notice opens the PDF, files the saved file as the subdivision plat under the run\'s own label, and marks the lead filed', () => {
    const src = read('app/admin/research/components/FreePlatLeadsNotice.tsx');
    expect(src).toContain('<a href={lead.url} target="_blank" rel="noopener noreferrer"');
    expect(src).toContain("form.append('document_type', 'plat');");
    expect(src).toContain("form.append('document_label', platDocumentLabel(lead));");
    expect(src).toContain('const up = await fetch(`/api/admin/research/${projectId}/documents`, { method: \'POST\', body: form });');
    expect(src).toContain('await fetch(`/api/admin/research/${projectId}/free-plat-leads`, {');
    expect(platDocumentLabel({ name: 'WINNIE MAE ADN', url: 'https://x', source: 's' })).toBe('Subdivision Plat: WINNIE MAE ADN');
  });
  it('the mark route merges filedAt into the one shared bag by URL', () => {
    const route = read('app/api/admin/research/[projectId]/free-plat-leads/route.ts');
    expect(route).toContain('export const PATCH = withErrorHandler(');
    expect(route).toContain("return { ...l, filedAt, filedBy: session.user?.email ?? null, documentId: body.documentId ?? null };");
    expect(route).toContain('analysis_metadata: { ...meta, freePlatLeads: leads }');
  });
});
