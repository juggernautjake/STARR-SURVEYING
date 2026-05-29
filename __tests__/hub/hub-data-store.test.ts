// __tests__/hub/hub-data-store.test.ts
//
// Slice 198 of hub-editor-performance-and-ux-2026-05-29.md. Locks
// the aggregator-fed cache store + the hook helper that widgets
// consult before falling back to their own /api/* fetches.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useHubDataStore,
  selectHubDataEntry,
  type AggregatorPayload,
} from '@/lib/hub/hub-data-store';
import { hydrateHubDataFromAggregator } from '@/lib/hub/use-hub-data';

beforeEach(() => {
  useHubDataStore.getState()._reset();
});

describe('selectHubDataEntry — idle sentinel', () => {
  it('returns an idle entry when no payload has been received', () => {
    const entry = selectHubDataEntry('my-jobs')(useHubDataStore.getState());
    expect(entry.status).toBe('idle');
    expect(entry.data).toBeNull();
    expect(entry.error).toBeNull();
    expect(entry.fetchedAt).toBeNull();
  });

  it('the idle entry is stable across calls (same reference)', () => {
    const a = selectHubDataEntry('my-jobs')(useHubDataStore.getState());
    const b = selectHubDataEntry('my-jobs')(useHubDataStore.getState());
    expect(a).toBe(b);
  });
});

describe('startAggregatorFetch', () => {
  it('marks every requested widget as loading', () => {
    useHubDataStore.getState().startAggregatorFetch(['my-jobs', 'pto-balance']);
    expect(useHubDataStore.getState().entries['my-jobs'].status).toBe('loading');
    expect(useHubDataStore.getState().entries['pto-balance'].status).toBe('loading');
    expect(useHubDataStore.getState().aggregatorStatus).toBe('loading');
  });

  it('does not clobber an entry that already has data', () => {
    useHubDataStore.getState().receiveAggregatorPayload({
      'my-jobs': { data: { jobs: [{ id: '1' }] } },
    });
    useHubDataStore.getState().startAggregatorFetch(['my-jobs']);
    const e = useHubDataStore.getState().entries['my-jobs'];
    expect(e.status).toBe('ok');
    expect(e.data).toEqual({ jobs: [{ id: '1' }] });
  });
});

describe('receiveAggregatorPayload', () => {
  it('stores ok payloads with the data', () => {
    const payload: AggregatorPayload = {
      'my-jobs': { data: { jobs: [{ id: '1' }] } },
    };
    useHubDataStore.getState().receiveAggregatorPayload(payload);
    const entry = useHubDataStore.getState().entries['my-jobs'];
    expect(entry.status).toBe('ok');
    expect(entry.data).toEqual({ jobs: [{ id: '1' }] });
    expect(entry.error).toBeNull();
    expect(entry.fetchedAt).not.toBeNull();
  });

  it('marks error payloads + carries the error message', () => {
    useHubDataStore.getState().receiveAggregatorPayload({
      'pto-balance': { error: 'HTTP 500' },
    });
    const entry = useHubDataStore.getState().entries['pto-balance'];
    expect(entry.status).toBe('error');
    expect(entry.error).toBe('HTTP 500');
    expect(entry.data).toBeNull();
  });

  it('keeps skipped widgets in idle so their own fetch path runs', () => {
    useHubDataStore.getState().receiveAggregatorPayload({
      'pinned-pages': { skipped: true },
    });
    const entry = useHubDataStore.getState().entries['pinned-pages'];
    expect(entry.status).toBe('idle');
    expect(entry.data).toBeNull();
  });

  it('flips the global aggregator status to ok', () => {
    useHubDataStore.getState().receiveAggregatorPayload({});
    expect(useHubDataStore.getState().aggregatorStatus).toBe('ok');
  });
});

describe('failAggregatorFetch', () => {
  it('records the global error', () => {
    useHubDataStore.getState().failAggregatorFetch('network down');
    expect(useHubDataStore.getState().aggregatorStatus).toBe('error');
    expect(useHubDataStore.getState().aggregatorError).toBe('network down');
  });

  it('flips loading entries back to idle so the widget runs its own fetch', () => {
    useHubDataStore.getState().startAggregatorFetch(['my-jobs']);
    expect(useHubDataStore.getState().entries['my-jobs'].status).toBe('loading');
    useHubDataStore.getState().failAggregatorFetch('boom');
    expect(useHubDataStore.getState().entries['my-jobs'].status).toBe('idle');
  });
});

describe('hydrateHubDataFromAggregator — happy path', () => {
  it('fetches /api/admin/me/hub-data with the requested widget ids', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await hydrateHubDataFromAggregator(['my-jobs', 'pto-balance'], fetchSpy as unknown as typeof fetch);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/me/hub-data?widgets=my-jobs,pto-balance',
      { cache: 'no-store' },
    );
  });

  it('writes the aggregator payload into the store on success', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        'my-jobs': { data: { jobs: [{ id: '1' }] } },
      }),
    });
    await hydrateHubDataFromAggregator(['my-jobs'], fetchSpy as unknown as typeof fetch);
    expect(useHubDataStore.getState().entries['my-jobs'].status).toBe('ok');
    expect(useHubDataStore.getState().entries['my-jobs'].data).toEqual({ jobs: [{ id: '1' }] });
  });

  it('records an HTTP error when the aggregator returns non-2xx', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await hydrateHubDataFromAggregator(['my-jobs'], fetchSpy as unknown as typeof fetch);
    expect(useHubDataStore.getState().aggregatorStatus).toBe('error');
    expect(useHubDataStore.getState().aggregatorError).toBe('HTTP 500');
  });

  it('records the network error message when the fetch throws', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('offline'));
    await hydrateHubDataFromAggregator(['my-jobs'], fetchSpy as unknown as typeof fetch);
    expect(useHubDataStore.getState().aggregatorStatus).toBe('error');
    expect(useHubDataStore.getState().aggregatorError).toBe('offline');
  });

  it('no-ops on an empty widget list (no fetch call)', async () => {
    const fetchSpy = vi.fn();
    await hydrateHubDataFromAggregator([], fetchSpy as unknown as typeof fetch);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('url-encodes widget ids so a hostile id never lands as raw text in the query', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await hydrateHubDataFromAggregator(['my widget'], fetchSpy as unknown as typeof fetch);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/me/hub-data?widgets=my%20widget',
      { cache: 'no-store' },
    );
  });
});
