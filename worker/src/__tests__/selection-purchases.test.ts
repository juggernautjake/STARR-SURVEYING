import { describe, it, expect } from 'vitest';
import { wantsToPurchaseRecommendations } from '../research/selection-purchases.js';
import { selectionsToWants } from '../research/selection-wants.js';

// Plan RESEARCH_SYSTEM_COMPLETION W2 — the checklist drives TexasFile purchasing. This maps the paid
// selection wants onto the purchase-recommendation shape the orchestrator buys, plats first.

const wants = selectionsToWants({ items: ['recent_plat', 'recent_deed', 'google_map'], adjoiners: { enabled: false, items: [] } });

describe('wantsToPurchaseRecommendations', () => {
  it('only turns PAID wants into purchases (free map/GIS captures excluded)', () => {
    const recs = wantsToPurchaseRecommendations(wants, {});
    expect(recs.every((r) => r.source === 'texasfile')).toBe(true);
    expect(recs.map((r) => r.documentType).sort()).toEqual(['deed', 'plat']); // no 'map'
  });

  it('prioritises the plat before the deed', () => {
    const recs = wantsToPurchaseRecommendations(wants, {});
    const platI = recs.findIndex((r) => r.documentType === 'plat');
    const deedI = recs.findIndex((r) => r.documentType === 'deed');
    expect(platI).toBeLessThan(deedI);
    expect(recs.map((r) => r.priority)).toEqual([1, 2]); // dense, sorted
  });

  it('a "most recent" want with a known instrument buys that document', () => {
    const recs = wantsToPurchaseRecommendations(
      selectionsToWants({ items: ['recent_deed'], adjoiners: { enabled: false, items: [] } }),
      { county: 'Bell', knownDocuments: [
        { type: 'deed', instrument: 'OLD', recordingDate: '2001-01-01' },
        { type: 'deed', instrument: 'NEW', recordingDate: '2021-05-05', book: '44', page: '212' },
      ] },
    );
    expect(recs[0].instrument).toBe('NEW');
    expect(recs[0].book).toBe('44');
    expect(recs[0].county).toBe('Bell');
  });

  it('a want with no located document carries search_required', () => {
    const recs = wantsToPurchaseRecommendations(
      selectionsToWants({ items: ['recent_plat'], adjoiners: { enabled: false, items: [] } }), {});
    expect(recs[0].instrument).toBe('search_required');
    expect(recs[0].estimatedCost).toMatch(/^\$\d/);
  });
});
