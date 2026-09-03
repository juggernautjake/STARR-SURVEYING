import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── analysis_metadata IS A SHARED BAG, AND THREE WRITES EMPTIED IT ─────────────────────────────
//
// The create route stores `owner_name` in research_projects.analysis_metadata. The PATCH route
// stores `job_notes` there "so it survives analysis reruns". Since B*8 the worker files its run
// outcome under `result`. And the in-app analysis engine's start, completion and failure writes
// each assigned a FRESH object to the column — no spread — so the first thing an analysis did was
// erase all of it. The lite fallback reaches that engine automatically whenever the worker is
// unavailable, so this was not an edge case; it was the path a worker outage takes.
//
// Only `persistLogs` merged. Now it is the only writer. Found by the 2026-09-03 platform audit.
//
// Two guards: (1) the source has exactly one `analysis_metadata:` write and it spreads the existing
// value; (2) the same defect cannot come back in the lite-pipeline route's own CAD document insert,
// which the audit also found writing a document_type the CHECK rejects and discarding the error.

const ROOT = process.cwd();
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

describe('analysis.service writes analysis_metadata through one merging function', () => {
  const svc = read('lib/research/analysis.service.ts');

  it('CONTROL: the probe reads the live service', () => {
    expect(svc).toContain('async function persistLogs(');
    expect(svc).toContain("from('research_projects')");
  });

  it('there is exactly one analysis_metadata write, and it spreads the existing bag', () => {
    const writes = [...svc.matchAll(/analysis_metadata:\s*\{/g)];
    expect(writes.length, 'analysis_metadata: { … } appears more than once — a write that replaces the bag has come back').toBe(1);
    const at = writes[0].index!;
    const window = svc.slice(at, at + 80);
    expect(window).toMatch(/analysis_metadata:\s*\{\s*\.\.\.existing/);
  });

  it('start, completion and failure all go through persistLogs with a row patch', () => {
    expect(svc).toMatch(/persistLogs\(\{[\s\S]*?started_at: analysisStartedAt[\s\S]*?\}, \{ status: 'analyzing' \}\)/);
    expect(svc).toMatch(/persistLogs\(\{[\s\S]*?completed_at: completedAt[\s\S]*?\}, \{ status: 'review' \}\)/);
    expect(svc).toMatch(/persistLogs\(\{[\s\S]*?failed_at:[\s\S]*?\}, \{ status: 'configure' \}\)/);
  });

  it('a new run clears the previous ending rather than inheriting a stale error', () => {
    const start = svc.slice(svc.indexOf("{ status: 'analyzing' }") - 400, svc.indexOf("{ status: 'analyzing' }"));
    for (const k of ['completed_at', 'error', 'error_category', 'technical_error', 'failed_at']) {
      expect(start, `start write does not null out ${k}`).toContain(`${k}: null`);
    }
  });
});

describe('the lite pipeline files the CAD record under a document_type the table admits', () => {
  const route = read('app/api/admin/research/[projectId]/lite-pipeline/route.ts');
  const seed = fs.readFileSync(path.join(ROOT, 'seeds/626_research_documents_capture_columns.sql'), 'utf8')
    .replace(/^\s*--[^\n]*/gm, '');
  const m = seed.match(/research_documents_document_type_check\s*CHECK \(document_type = ANY \(ARRAY\[([\s\S]*?)\]\)\)/);
  const admitted = new Set([...(m?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));

  it('CONTROL: the seed parses and the route inserts a document', () => {
    expect(admitted.has('deed')).toBe(true);
    expect(admitted.size).toBeGreaterThan(30);
    expect(route).toContain("source_type: 'property_search'");
  });

  it('every document_type the route writes is admitted (parcel_data was not)', () => {
    const types = [...route.matchAll(/document_type:\s*'([a-z_]+)'/g)].map((x) => x[1]);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) expect(admitted.has(t), `lite-pipeline writes document_type '${t}'`).toBe(true);
    expect(admitted.has('parcel_data')).toBe(false);
  });

  it('the insert reads its error instead of discarding it', () => {
    expect(route).toMatch(/const \{ data: doc, error: docErr \} = await supabaseAdmin\s*\.from\('research_documents'\)/);
    expect(route).toContain('docErr');
  });
});
