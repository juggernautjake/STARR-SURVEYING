import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { compileDiscoveredLeads, leadsToSupplemental, type DiscoveredLead } from '../research/discovered-leads.js';
import type { ChainGap } from '../chain-of-title/chain-gaps.js';

// Plan 1.1 — analysis compiles the NEW leads a follow-up research round should chase: chain-of-title
// citations, prior owners, adjoiners, referenced data points — de-duped against what was already searched.

const gap = (missing: string, citedIn = '2019-100'): ChainGap => ({
  kind: 'unfollowed_citation', citedIn, missing, statement: '', nextStep: '',
});

describe('compileDiscoveredLeads', () => {
  it('turns an unfollowed volume/page citation into a lead', () => {
    const leads = compileDiscoveredLeads({ gaps: [gap('Volume 412, Page 88')], round: 1 });
    const vp = leads.find((l) => l.kind === 'volume_page');
    expect(vp, 'a cited vol/page should become a lead').toBeTruthy();
    expect(vp!.volume).toBe('412');
    expect(vp!.page).toBe('88');
    expect(vp!.searched).toBe(false);
    expect(vp!.round).toBe(1);
  });

  it('turns a cited instrument number into a lead', () => {
    const leads = compileDiscoveredLeads({ gaps: [gap('Instrument No. 2015-014567')], round: 2 });
    const instr = leads.find((l) => l.kind === 'instrument');
    expect(instr, 'a cited instrument should become a lead').toBeTruthy();
    expect(instr!.round).toBe(2);
  });

  it('turns prior owners and adjoiners into name leads', () => {
    const leads = compileDiscoveredLeads({
      priorOwners: ['SMITH, JOHN'],
      adjoiners: [{ owner: 'JONES, MARY', propertyId: '73236' }],
      round: 1,
    });
    expect(leads.find((l) => l.kind === 'grantor_name')?.value).toBe('SMITH, JOHN');
    const adj = leads.find((l) => l.kind === 'adjoiner');
    expect(adj?.value).toBe('JONES, MARY');
    expect(adj?.label).toContain('73236');
  });

  it('reads subdivision + recording-reference data points', () => {
    const leads = compileDiscoveredLeads({
      dataPoints: [
        { data_category: 'subdivision_name', display_value: 'WINNIE MAE ADDITION' },
        { data_category: 'recording_reference', raw_value: 'Vol 5456 Pg 704' },
      ],
      round: 1,
    });
    expect(leads.some((l) => l.kind === 'subdivision' && l.value === 'WINNIE MAE ADDITION')).toBe(true);
    const vp = leads.find((l) => l.kind === 'volume_page' && l.volume === '5456');
    expect(vp?.page).toBe('704');
  });

  it('drops a lead the run already searched', () => {
    const leads = compileDiscoveredLeads({
      gaps: [gap('Volume 412, Page 88')],
      priorOwners: ['SMITH, JOHN'],
      alreadySearched: { volumePages: ['VOL412PG88'], names: ['SMITH, JOHN'] },
      round: 1,
    });
    expect(leads).toHaveLength(0);
  });

  it('is de-duped — the same citation from two deeds yields one lead', () => {
    const leads = compileDiscoveredLeads({
      gaps: [gap('Volume 412, Page 88', 'A'), gap('Vol. 412 Pg 88', 'B')],
      round: 1,
    });
    expect(leads.filter((l) => l.kind === 'volume_page')).toHaveLength(1);
  });
});

describe('leadsToSupplemental — seeding a follow-up run (plan 2.1)', () => {
  it('maps each lead kind to the right search input', () => {
    const leads: DiscoveredLead[] = [
      { id: 'a', kind: 'instrument', value: '2015-1', label: '', source: '', round: 1, searched: false },
      { id: 'b', kind: 'volume_page', value: 'VOL412PG88', volume: '412', page: '88', label: '', source: '', round: 1, searched: false },
      { id: 'c', kind: 'grantor_name', value: 'SMITH, JOHN', label: '', source: '', round: 1, searched: false },
      { id: 'd', kind: 'adjoiner', value: 'JONES, MARY', label: '', source: '', round: 1, searched: false },
      { id: 'e', kind: 'subdivision', value: 'WINNIE MAE ADDITION', label: '', source: '', round: 1, searched: false },
    ];
    const s = leadsToSupplemental(leads);
    expect(s.instrumentNumbers).toEqual(['2015-1']);
    expect(s.volumePages).toEqual([{ volume: '412', page: '88' }]);
    expect(s.ownerNames).toEqual(['SMITH, JOHN', 'JONES, MARY']);
    expect(s.subdivisions).toEqual(['WINNIE MAE ADDITION']);
  });
});

describe('the compile-leads endpoint is wired (plan 1.3, the CALLER)', () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');
  it('exposes POST /research/:projectId/compile-leads', () => {
    expect(SRC).toContain("app.post('/research/:projectId/compile-leads'");
  });
  it('reads data points + adjoiners + chain gaps, compiles, and persists discoveredLeads', () => {
    const at = SRC.indexOf("app.post('/research/:projectId/compile-leads'");
    const fn = SRC.slice(at, at + 4000);
    expect(fn).toContain("from('extracted_data_points')");
    expect(fn).toContain("from('research_adjoiners')");
    expect(fn).toContain('findGaps(');
    expect(fn).toContain('compileDiscoveredLeads(');
    expect(fn).toContain('discoveredLeads');
  });
});
