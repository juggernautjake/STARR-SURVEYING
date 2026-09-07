// worker/src/research/plats-first.ts — the order the early TexasFile buy works in (owner, 2026-09-07)
//
// "The first thing we do every single run is go to TexasFile and try and find the plats/drawings for
//  the parcel/subdivision/lot. Always buy the most recent one, and if there is more funds, buy the
//  others as well." — so: plats/drawings before everything else, newest first, then the rest of the
// recommendations in their relevance order. Pure; the orchestrator then buys down the list until the
// TexasFile budget is spent.

import type { PurchaseRecommendation } from '../types/confidence.js';

/** A comparable date from the shapes TexasFile and the CAD print ("09/21/1954", "2004-08-12"). */
export function recordingDateKey(date: string | null | undefined): number {
  if (!date) return 0;
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Number(`${iso[1]}${iso[2]}${iso[3]}`);
  const us = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return Number(`${us[3]}${us[1]!.padStart(2, '0')}${us[2]!.padStart(2, '0')}`);
  const year = date.match(/(\d{4})/);
  return year ? Number(`${year[1]}0000`) : 0;
}

export function isDrawing(rec: Pick<PurchaseRecommendation, 'documentType' | 'vendorProduct'>): boolean {
  return rec.documentType === 'plat' || rec.vendorProduct === 'plat';
}

/** Plats/drawings first, each group newest first; ties keep the incoming (relevance) order. */
export function orderPlatsFirstNewestFirst<T extends Pick<PurchaseRecommendation, 'documentType' | 'vendorProduct' | 'recordingDate'>>(recs: readonly T[]): T[] {
  return recs
    .map((rec, i) => ({ rec, i }))
    .sort((a, b) => {
      const da = isDrawing(a.rec) ? 0 : 1;
      const db = isDrawing(b.rec) ? 0 : 1;
      if (da !== db) return da - db;
      if (da === 0) {
        const byDate = recordingDateKey(b.rec.recordingDate) - recordingDateKey(a.rec.recordingDate);
        if (byDate !== 0) return byDate;
      }
      return a.i - b.i;
    })
    .map(({ rec }) => rec);
}

/** One line for the run log, so the operator sees the order before any money moves. */
export function describeBuyOrder(recs: readonly Pick<PurchaseRecommendation, 'documentType' | 'vendorProduct' | 'recordingDate' | 'subdivision' | 'book' | 'page'>[]): string {
  const plats = recs.filter(isDrawing);
  const rest = recs.length - plats.length;
  const platList = plats.slice(0, 4).map((p) => `${p.subdivision ?? 'plat'}${p.book && p.page ? ` ${p.book}/${p.page}` : ''}${p.recordingDate ? ` (${p.recordingDate})` : ''}`).join(', ');
  return `Buy order: ${plats.length} plat/drawing(s) first, newest first${platList ? ` — ${platList}` : ''}; then ${rest} other document(s) by relevance.`;
}
