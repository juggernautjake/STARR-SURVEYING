import { describe, it, expect, vi } from 'vitest';
import { runCrossSourceAcquisition } from '../research/cross-source-acquisition.js';
import type { SourceSearchFn, ManifestEntry } from '../research/cross-source-discovery.js';
import type { FreeCaptureFn, PurchaseFn } from '../research/cross-source-acquire.js';
import { selectionsToWants } from '../research/selection-wants.js';

// Plan A7 — the driver runs the whole engine end to end: it must free-capture a deed a free source
// has and BUY only the paid-exclusive one, within budget — never paying for what free returns.

const wants = selectionsToWants({ items: ['recent_deed', 'recent_plat'], adjoiners: { enabled: false, items: [] } });
const target = { county: 'Bell', ownerName: 'FERRELL' };

function entry(sourceId: string, kind: 'free' | 'paid', instrument: string, docType = 'deed', cost = kind === 'paid' ? 3 : 0): ManifestEntry {
  return { sourceId, kind, docType, instrument, unitCostUsd: cost, canFreeCapture: kind === 'free', canPurchase: kind === 'paid' };
}

const okCapture: FreeCaptureFn = async () => ({ ok: true, ref: 'free://x' });
const okPurchase: PurchaseFn = async (a) => ({ ok: true, ref: 'paid://y', costUsd: a.source.unitCostUsd });

describe('runCrossSourceAcquisition', () => {
  it('free-captures a deed both sources have, and BUYS only the paid-exclusive plat', async () => {
    // Deed 111 is on the free clerk AND TexasFile; plat 222 is TexasFile-only.
    const search: SourceSearchFn = async (src) => {
      if (src.source.id === 'kofile') return [entry('kofile', 'free', '111')];
      if (src.source.id === 'texasfile') return [entry('texasfile', 'paid', '111'), entry('texasfile', 'paid', '222', 'plat')];
      return [];
    };
    const purchase = vi.fn<PurchaseFn>(okPurchase);
    const res = await runCrossSourceAcquisition({ county: 'Bell', wants, target, search, capture: okCapture, purchase, paidBudgetUsd: 15 });

    expect(res.clusters).toBe(2);              // deed 111 (2 sources) + plat 222
    expect(res.freeCaptured).toBe(1);          // deed 111 captured free
    expect(res.purchased).toBe(1);             // only the paid-exclusive plat bought
    // The bought document is the plat, NOT the deed the free clerk had.
    expect(purchase).toHaveBeenCalledTimes(1);
    expect(purchase.mock.calls[0][0].cluster.docType).toBe('plat');
    expect(res.spentUsd).toBe(3);
    expect(res.manifest.length).toBe(3);       // full manifest surfaced for the UI
  });

  it('buys nothing when every document is available free', async () => {
    const search: SourceSearchFn = async (src) =>
      src.source.id === 'kofile' ? [entry('kofile', 'free', '111'), entry('kofile', 'free', '222', 'plat')] : [];
    const purchase = vi.fn<PurchaseFn>(okPurchase);
    const res = await runCrossSourceAcquisition({ county: 'Bell', wants, target, search, capture: okCapture, purchase, paidBudgetUsd: 15 });
    expect(res.purchased).toBe(0);
    expect(purchase).not.toHaveBeenCalled();
    expect(res.freeCaptured).toBe(2);
  });

  it('respects the paid budget across paid-exclusive documents', async () => {
    const search: SourceSearchFn = async (src) =>
      src.source.id === 'texasfile'
        ? [entry('texasfile', 'paid', 'a', 'plat', 6), entry('texasfile', 'paid', 'b', 'deed', 6), entry('texasfile', 'paid', 'c', 'deed', 6)]
        : [];
    const res = await runCrossSourceAcquisition({ county: 'Bell', wants, target, search, capture: okCapture, purchase: okPurchase, paidBudgetUsd: 12 });
    expect(res.spentUsd).toBeLessThanOrEqual(12);
    expect(res.purchased).toBe(2);             // room for two of the three at $6
  });
});
