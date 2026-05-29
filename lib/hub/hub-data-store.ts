// lib/hub/hub-data-store.ts
//
// In-memory cache for the hub-data aggregator (Slice 152's
// /api/admin/me/hub-data endpoint). HubMeClient fires the
// aggregator once on mount + drops every widget's payload into
// this store; individual widgets read via `useHubData(widgetId)`
// instead of running their own /api/* fetch on first paint.
//
// Slice 198 of hub-editor-performance-and-ux-2026-05-29.md.

import { create } from 'zustand';

export type HubDataStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface HubDataEntry {
  /** 'idle' before the aggregator request fires, 'loading' while it
   *  is in flight, 'ok' on success, 'error' if either the aggregator
   *  call failed or this specific widget returned an error envelope. */
  status: HubDataStatus;
  /** Raw payload returned by the widget's source endpoint — exactly
   *  the JSON the widget would have received from its own fetch. */
  data: unknown;
  /** Populated when the widget's payload returned an error envelope
   *  or the aggregator itself failed. */
  error: string | null;
  /** Set when the entry was populated. Widgets can use this to
   *  decide whether to re-fetch if their settings imply parameters
   *  the aggregator didn't pass. */
  fetchedAt: number | null;
}

interface HubDataStore {
  entries: Record<string, HubDataEntry>;
  /** Global aggregator status. Independent of any one widget so
   *  components can show a "still loading" hint even when their
   *  specific entry hasn't been written yet. */
  aggregatorStatus: HubDataStatus;
  /** Optional error from the aggregator-level call (e.g. 500 from
   *  the API route or a network failure). Widget-specific errors
   *  go in `entries[id].error`. */
  aggregatorError: string | null;

  /** Mark the aggregator request as in flight + clear any prior
   *  error. Called by HubMeClient just before the fetch. */
  startAggregatorFetch: (widgetIds: string[]) => void;
  /** Merge in the aggregator's payload. Each widget id is mapped to
   *  either `{ data }` or `{ error }` or `{ skipped }`. Skipped
   *  widgets get an idle entry so the widget falls through to its
   *  own fetch path. */
  receiveAggregatorPayload: (payload: AggregatorPayload) => void;
  /** Record an aggregator-level failure. Widgets all fall through
   *  to their own fetches. */
  failAggregatorFetch: (error: string) => void;
  /** Test-only reset. */
  _reset: () => void;
}

/** Shape returned by /api/admin/me/hub-data — see
 *  `app/api/admin/me/hub-data/route.ts`. */
export type AggregatorPayload = Record<
  string,
  { data: unknown } | { error: string } | { skipped: true }
>;

const INITIAL_ENTRIES: Record<string, HubDataEntry> = {};

export const useHubDataStore = create<HubDataStore>((set) => ({
  entries: INITIAL_ENTRIES,
  aggregatorStatus: 'idle',
  aggregatorError: null,

  startAggregatorFetch: (widgetIds) =>
    set((state) => {
      const nextEntries = { ...state.entries };
      for (const id of widgetIds) {
        // Don't clobber an entry that already has data — the
        // aggregator can run more than once over the page's
        // lifetime (e.g. on settings change) + we want widgets to
        // keep showing the last known good value while the refresh
        // is in flight.
        if (!nextEntries[id] || nextEntries[id].status === 'idle') {
          nextEntries[id] = { status: 'loading', data: null, error: null, fetchedAt: null };
        }
      }
      return {
        entries: nextEntries,
        aggregatorStatus: 'loading',
        aggregatorError: null,
      };
    }),

  receiveAggregatorPayload: (payload) =>
    set((state) => {
      const now = Date.now();
      const nextEntries = { ...state.entries };
      for (const [id, value] of Object.entries(payload)) {
        if ('data' in value) {
          nextEntries[id] = { status: 'ok', data: value.data, error: null, fetchedAt: now };
        } else if ('error' in value) {
          nextEntries[id] = { status: 'error', data: null, error: value.error, fetchedAt: now };
        } else {
          // skipped — leave the widget in idle so its own fetch
          // path runs.
          nextEntries[id] = { status: 'idle', data: null, error: null, fetchedAt: null };
        }
      }
      return {
        entries: nextEntries,
        aggregatorStatus: 'ok',
        aggregatorError: null,
      };
    }),

  failAggregatorFetch: (error) =>
    set((state) => {
      // Widget-level entries stay loading → idle so the widgets
      // know to fetch on their own. We do NOT mark every entry as
      // 'error' because the failure is global, not per-widget.
      const nextEntries = { ...state.entries };
      for (const id of Object.keys(nextEntries)) {
        if (nextEntries[id].status === 'loading') {
          nextEntries[id] = { status: 'idle', data: null, error: null, fetchedAt: null };
        }
      }
      return {
        entries: nextEntries,
        aggregatorStatus: 'error',
        aggregatorError: error,
      };
    }),

  _reset: () =>
    set({
      entries: INITIAL_ENTRIES,
      aggregatorStatus: 'idle',
      aggregatorError: null,
    }),
}));

/** Read a single widget's entry from the store. Falls through to a
 *  stable idle sentinel when the widget hasn't been seeded — that
 *  matches the "aggregator hasn't run yet" case so widgets can
 *  branch on `status === 'idle'`. */
export function selectHubDataEntry(widgetId: string): (state: { entries: Record<string, HubDataEntry> }) => HubDataEntry {
  return (state) => state.entries[widgetId] ?? IDLE_ENTRY;
}

const IDLE_ENTRY: HubDataEntry = Object.freeze({
  status: 'idle' as HubDataStatus,
  data: null,
  error: null,
  fetchedAt: null,
}) as HubDataEntry;
