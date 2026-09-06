// __tests__/research/discovered-leads-panel.test.ts — iterative loop (plan 3.5).
//
// The Analysis screen compiles the leads analysis surfaced and lets the user run a follow-up research
// round seeded with the ones they choose. Guards the "authored but not wired" shape: the page mounts the
// panel, the API route bridges to the worker, and the lead→supplemental mapping is correct.

import { describe, it, expect } from 'vitest';
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
