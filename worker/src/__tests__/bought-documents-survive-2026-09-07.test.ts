// Plan BOUGHT_DOCUMENTS_SURVIVE (2026-09-07): the plat bought at identification and the deeds the
// final pass buys were destroyed at the end of every dedicated-county run by a blanket delete of the
// project's `property_search` rows; an "All plats" want ran a deed name search and bought a deed as a
// plat; the final pass could not see what the early pass bought; a failed worker-driven Analyze left
// the project parked at `analyzing`; and a document the relevance check removed was deleted rather
// than marked. Each is pinned at its CALLER.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wantsToPurchaseRecommendations } from '../research/selection-purchases.js';
import { selectionsToWants } from '../research/selection-wants.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('A — the county-specific persist no longer deletes what the run filed', () => {
  const src = read('index.ts');
  it('has no project-wide delete of research_documents', () => {
    // The one delete that remains in index.ts must not be scoped to a whole project's rows.
    const deletes = [...src.matchAll(/\.from\('research_documents'\)\s*\.delete\(\)\s*\.eq\('research_project_id'/g)];
    expect(deletes.length).toBe(0);
    expect(src).toContain("// ── 2. (REMOVED 2026-09-07) This deleted every `property_search` row for the project");
  });
  it('marks what the relevance check removed instead — relevance = unrelated, with the reason', () => {
    expect(src).toContain('for (const gone of r.deedsAndRecords.unrelated ?? []) {');
    expect(src).toContain("relevance: 'unrelated',");
    expect(src).toContain("relevance_classification: { by: 'bell-relevance-validator', at: now, reason: gone.reason },");
    expect(src).toContain(".is('relevance', null)");
  });
});

describe('B — a plat want searches PLAT records, never by owner name', () => {
  it('carries vendorProduct plat and no searchName; deed wants keep the name', () => {
    const wants = selectionsToWants({ items: ['all_plats', 'recent_deed'], adjoiners: { enabled: false, items: [] } });
    const recs = wantsToPurchaseRecommendations(wants, { county: 'Bell', ownerName: 'CAFFREY BARBARA', subdivision: 'WINNIE MAE ADDITION', lot: '4', block: '001' });
    const plat = recs.find((r) => r.documentType === 'plat')!;
    const deed = recs.find((r) => r.documentType === 'deed')!;
    expect(plat.vendorProduct).toBe('plat');
    expect(plat.searchName).toBeUndefined();
    expect(plat.subdivision).toBe('WINNIE MAE ADDITION');
    expect(deed.vendorProduct).toBeUndefined();
    expect(deed.searchName).toBe('CAFFREY BARBARA');
    expect(deed.lot).toBe('4');
    expect(deed.block).toBe('001');
  });
});

describe('C — the final pass knows what the early pass bought', () => {
  it('the ledger lists the run\'s purchases; index.ts seeds exclusions + known documents from it', () => {
    const ledger = read('services/purchase-ledger.ts');
    expect(ledger).toContain('export async function listRunPurchases(');
    expect(ledger).toContain(".eq('run_id', runId)");
    expect(ledger).toContain(".eq('status', 'completed')");
    const src = read('index.ts');
    expect(src).toContain("import { listRunPurchases } from './services/purchase-ledger.js';");
    expect(src).toContain('const boughtEarlier = runId ? await listRunPurchases(projectId, runId).catch(() => []) : [];');
    // both branches hand the seed to the orchestrator and the wants
    expect(src.split('alreadyBought,').length - 1).toBe(2);
    expect(src.split('boughtEarlierKnown').length - 1).toBeGreaterThanOrEqual(3);
    const orch = read('services/document-purchase-orchestrator.ts');
    expect(orch).toContain('instruments: [...(config.alreadyBought?.instruments ?? [])],');
    expect(orch).toContain('guids: [...(config.alreadyBought?.guids ?? [])],');
    const cfg = read('types/purchase.ts');
    expect(cfg).toContain('alreadyBought?: { instruments: string[]; guids: string[] };');
  });
});

describe('D — a failed worker-driven Analyze does not strand the project', () => {
  const src = read('index.ts');
  it('read-documents restores review when the drive did not finalize, and on a throw', () => {
    expect(src).toContain('async function unparkAnalyzing(projectId: string, log: (m: string) => void, why: string): Promise<void> {');
    expect(src).toContain('if (!r.finalized) await unparkAnalyzing(projectId, log, r.statement);');
    expect(src).toContain('await unparkAnalyzing(projectId, log, e instanceof Error ? e.message : String(e));');
    expect(src).toContain("if (data?.status !== 'analyzing') return;");
    expect(src).toContain(".update({ status: 'review', updated_at: new Date().toISOString() })");
  });
  it('the read pass and the quote leave unrelated documents out', () => {
    expect(src).toContain(".or('relevance.is.null,relevance.neq.unrelated')");
  });
});

describe('E — the validator says WHAT it removed, and Bell carries it', () => {
  it('every removal site records instrument + reason', () => {
    const v = read('counties/bell/analyzers/document-relevance-validator.ts');
    expect(v).toContain('unrelated: UnrelatedDocument[];');
    expect(v.split('drop(deed, deedLabel,').length - 1).toBe(4);
    expect(v).toContain('      unrelated,\n');
    const bell = read('counties/bell/orchestrator.ts');
    expect(bell).toContain('deeds.unrelated = deedValidation.summary.unrelated;');
    const deedType = read('counties/bell/types/research-result.ts');
    expect(deedType).toContain('unrelated?: Array<{ instrumentNumber: string | null; label: string; reason: string }>;');
  });
});
