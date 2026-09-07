// __tests__/research/discovered-leads-panel.test.ts — iterative loop (plan 3.5).
//
// The Analysis screen compiles the leads analysis surfaced and lets the user run a follow-up research
// round seeded with the ones they choose. Guards the "authored but not wired" shape: the page mounts the
// panel, the API route bridges to the worker, and the lead→supplemental mapping is correct.

import { describe, it, expect } from 'vitest';
import { expectOrder } from '../helpers/expect-order';
import fs from 'node:fs';
import path from 'node:path';
import { leadsToSupplemental, type DiscoveredLead } from '@/app/admin/research/[projectId]/_sections/DiscoveredLeadsPanel';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const PAGE = 'app/admin/research/[projectId]/page.tsx';
const ROUTE = 'app/api/admin/research/[projectId]/compile-leads/route.ts';

describe('the page mounts the leads panel on Analysis and wires the follow-up run', () => {
  const page = read(PAGE);
  it('renders DiscoveredLeadsPanel inside the Analysis-only block', () => {
    const analysisGate = page.indexOf("{currentStage === 'analysis' && (");
    const panel = page.indexOf('<DiscoveredLeadsPanel');
    const reviewGate = page.indexOf("{currentStage === 'review' && (<>");
    expect(panel).toBeGreaterThan(analysisGate);
    expect(panel).toBeLessThan(reviewGate); // Analysis stage only
  });
  it('seeds the re-run dialog with the chosen leads', () => {
    expect(page).toContain('seedSupplementalLines={followUpSeed}');
    expect(page).toContain('onRunFollowUp={(supp) =>');
  });
});

describe('the compile-leads API route bridges to the worker', () => {
  const route = read(ROUTE);
  it('POSTs to the worker compile-leads endpoint and GETs the persisted leads', () => {
    expect(route).toContain('/research/${projectId}/compile-leads');
    expect(route).toContain('discoveredLeads');
    expect(route).toContain('WORKER_URL');
  });
});

describe('leadsToSupplemental (client) maps each lead kind correctly', () => {
  it('matches the worker mapping', () => {
    const leads: DiscoveredLead[] = [
      { id: 'a', kind: 'instrument', value: '2015-1', label: '', source: '', round: 1, searched: false },
      { id: 'b', kind: 'volume_page', value: 'VOL412PG88', volume: '412', page: '88', label: '', source: '', round: 1, searched: false },
      { id: 'c', kind: 'adjoiner', value: 'JONES, MARY', label: '', source: '', round: 1, searched: false },
      { id: 'd', kind: 'subdivision', value: 'HERITAGE', label: '', source: '', round: 1, searched: false },
    ];
    const s = leadsToSupplemental(leads);
    expect(s.instrumentNumbers).toEqual(['2015-1']);
    expect(s.volumePages).toEqual([{ volume: '412', page: '88' }]);
    expect(s.ownerNames).toEqual(['JONES, MARY']);
    expect(s.subdivisions).toEqual(['HERITAGE']);
  });
});

// ── Plan 4 — the user-initiated AI deep-read ───────────────────────────────────────────────────────
// Owner, 2026-09-06: "We will not automatically do the AI/OCR identifier fallback or iterative discovery
// loop. The user will be able to choose to do that if they want after the initial research run is
// completed." These guards keep both the compile and the deep-read reachable ONLY from the panel's buttons.

const PANEL = 'app/admin/research/[projectId]/_sections/DiscoveredLeadsPanel.tsx';
const DEEP_ROUTE = 'app/api/admin/research/[projectId]/deep-read/route.ts';
const WORKER_INDEX = 'worker/src/index.ts';

describe('the deep-read is a button, bridged to the worker, and never automatic', () => {
  it('the panel offers the deep-read as a user action', () => {
    const panel = read(PANEL);
    expect(panel).toContain('/deep-read');
    expect(panel).toContain('Deep-read for more clues (AI)');
    expect(panel).toContain('onClick={deepRead}');
  });
  it('the deep-read API route bridges to the worker deep-read endpoint', () => {
    const route = read(DEEP_ROUTE);
    expect(route).toContain('/research/${projectId}/deep-read');
    expect(route).toContain('WORKER_URL');
    expect(route).toContain("method: 'POST'");
  });
  it('nothing on the page fires the compile or the deep-read itself (only the panel does)', () => {
    const page = read(PAGE);
    expect(page).not.toContain('/compile-leads');
    expect(page).not.toContain('/deep-read');
  });
  it('the worker reaches deepReadForLeads only from its POST endpoint, not from the run pipeline', () => {
    const index = read(WORKER_INDEX);
    const uses = index.split('deepReadForLeads').length - 1;
    // one dynamic import + one call, both inside the `/research/:projectId/deep-read` handler
    expect(uses).toBe(2);
    const handlerStart = index.indexOf("app.post('/research/:projectId/deep-read'");
    const handlerEnd = index.indexOf('app.post(', handlerStart + 10);
    const firstUse = index.indexOf('deepReadForLeads');
    const lastUse = index.lastIndexOf('deepReadForLeads');
    expect(firstUse).toBeGreaterThan(handlerStart);
    expect(lastUse).toBeLessThan(handlerEnd);
    // the pipeline's automatic path does not compile leads either — only the compile-leads endpoint does
    const compileUses = index.split('compileDiscoveredLeads(').length - 1;
    expect(compileUses).toBe(1);
    // Presence before order (the ordering ratchet): the compile call sits INSIDE the endpoint.
    expectOrder(index, "app.post('/research/:projectId/compile-leads'", 'compileDiscoveredLeads(', 'compile-leads endpoint');
  });
  it('every deep-read AI call is recorded on the run spend', () => {
    const index = read(WORKER_INDEX);
    const handlerStart = index.indexOf("app.post('/research/:projectId/deep-read'");
    const handler = index.slice(handlerStart, index.indexOf('app.post(', handlerStart + 10));
    expect(handler).toContain("recordAmbientAiCall('deep-read-leads'");
    expect(handler).toContain('withRunContext(projectId');
  });
});
