// lib/hub/use-hub-data.ts
//
// Hook + helpers that let a widget consult the aggregator-fed
// `hub-data-store` before falling back to its own /api/* fetch.
//
// Widgets call `useHubData(widgetId)` to read their pre-fetched
// payload. When `status === 'ok'` the widget renders immediately
// (no network call). When `status === 'idle'` (aggregator skipped
// the widget or hasn't run yet) or `status === 'error'` the
// widget runs its own fetch — preserving the existing standalone
// behavior.
//
// The companion `hydrateHubDataFromAggregator` helper is what
// HubMeClient calls on mount to populate the store; isolated from
// React so it can be unit-tested without rendering.
//
// Slice 198 of hub-editor-performance-and-ux-2026-05-29.md.

import { useHubDataStore, selectHubDataEntry, type HubDataEntry, type AggregatorPayload } from './hub-data-store';

/** Read a single widget's entry from the hub-data cache. Returns a
 *  stable idle sentinel when the aggregator hasn't run yet so
 *  widgets can branch on `entry.status === 'idle' || 'error'` to
 *  decide whether to run their own fetch. */
export function useHubData(widgetId: string): HubDataEntry {
  return useHubDataStore(selectHubDataEntry(widgetId));
}

/** Fetch the aggregator + push the result into the store.
 *  Pure-with-respect-to-React so HubMeClient can call it from a
 *  `useEffect`. The optional `fetchImpl` lets tests inject a mock
 *  without monkey-patching `globalThis.fetch`. */
export async function hydrateHubDataFromAggregator(
  widgetIds: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (widgetIds.length === 0) return;
  const store = useHubDataStore.getState();
  store.startAggregatorFetch(widgetIds);
  try {
    const url = `/api/admin/me/hub-data?widgets=${widgetIds.map(encodeURIComponent).join(',')}`;
    const res = await fetchImpl(url, { cache: 'no-store' });
    if (!res.ok) {
      useHubDataStore.getState().failAggregatorFetch(`HTTP ${res.status}`);
      return;
    }
    const payload = (await res.json()) as AggregatorPayload;
    useHubDataStore.getState().receiveAggregatorPayload(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useHubDataStore.getState().failAggregatorFetch(message);
  }
}
