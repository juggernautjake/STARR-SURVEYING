// worker/src/infra/queue-client.ts — the worker's side of the R28 claim/report contract.
//
// `queue-worker.ts` decides what may run; `queue-poller.ts` decides when to ask. This is the only
// piece that talks to the app, and it is kept separate from both so neither has to be tested
// against a network.
//
// The endpoints (`POST /api/admin/research/requests/claim`, `PATCH` on the same path) authenticate
// with `WORKER_API_KEY` in `x-worker-key`, not a user session — this is polled by a machine, and a
// session would expire under it.

import type { QueuedRequest } from './queue-worker.js';

export interface QueueClientConfig {
  baseUrl: string;
  workerKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export const DEFAULT_TIMEOUT_MS = 20_000;

interface ClaimResponse {
  request?: {
    id: string;
    property_address?: string | null;
    county?: string | null;
    priority?: number | null;
    requested_at?: string | null;
  } | null;
}

/** Claim one request, or null when the queue is dry.
 *
 *  ── A FAILED CLAIM IS NOT AN EMPTY QUEUE ──────────────────────────────────────────────────────
 *
 *  This THROWS on a transport or auth failure rather than returning null, and the distinction is the
 *  whole reason the function is written out rather than inlined. `pollOnce` treats null as "nothing
 *  to do" and backs off quietly; if a 401 or a dead app also returned null, a misconfigured worker
 *  would sit there logging nothing while the queue filled up behind it — a broken deployment that
 *  looks exactly like a quiet week.
 *
 *  The poller catches the throw, counts it, and backs off on the error interval. */
export function makeQueueClient(cfg: QueueClientConfig) {
  const doFetch = cfg.fetchImpl ?? fetch;
  const timeout = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = cfg.log ?? (() => {});
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/api/admin/research/requests/claim`;

  const headers = {
    'content-type': 'application/json',
    'x-worker-key': cfg.workerKey,
  };

  return {
    async claim(): Promise<QueuedRequest | null> {
      const res = await doFetch(url, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(timeout),
      });

      if (res.status === 401) {
        throw new Error('Claim rejected: WORKER_API_KEY does not match the app. This worker will never claim anything until that is fixed.');
      }
      if (!res.ok) {
        throw new Error(`Claim failed with HTTP ${res.status}.`);
      }

      const body = (await res.json()) as ClaimResponse;
      const r = body.request;
      if (!r) return null;

      // The county is what R29 serialises on, so a request without one cannot be admitted safely —
      // it would look like a different county from every other request and bypass the one-run-per-
      // county rule. Reported as a failure rather than run.
      if (!r.county) {
        log(`[Queue] Claimed request ${r.id} has no county — cannot serialise it against other runs.`);
      }

      return {
        id: r.id,
        address: r.property_address ?? '',
        county: r.county ?? '',
        priority: r.priority ?? 0,
        // `queued_at` is what R29 orders equal priorities by, oldest-first, so a busy queue cannot
        // leave one request waiting while newer ones overtake it. Defaulting a MISSING value to
        // "now" would make an old request look brand new and send it to the back — so the row's own
        // timestamp is used, and the fallback is only for a row that somehow carries none.
        queued_at: r.requested_at ?? new Date().toISOString(),
      };
    },

    /** Report an outcome. Never throws.
     *
     *  A report that fails is bad — the requester is not notified and the request looks stuck — but
     *  throwing here would take down the caller that is trying to report a *different* failure, and
     *  nested failure handling is where poller crashes come from. The app's own partial index on
     *  unnotified finished requests (R28) is what finds these. */
    async report(
      req: QueuedRequest,
      outcome: 'complete' | 'failed',
      detail: { projectId?: string; packetId?: string; failureReason?: string },
    ): Promise<void> {
      try {
        const res = await doFetch(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            id: req.id,
            outcome,
            projectId: detail.projectId ?? null,
            packetId: detail.packetId ?? null,
            failureReason: detail.failureReason ?? null,
          }),
          signal: AbortSignal.timeout(timeout),
        });
        if (!res.ok) {
          log(`[Queue] Could not report ${outcome} for ${req.id}: HTTP ${res.status}. It will look stuck until somebody looks at the unnotified list.`);
        }
      } catch (err) {
        log(`[Queue] Could not report ${outcome} for ${req.id}: ${err instanceof Error ? err.message : String(err)}. It will look stuck.`);
      }
    },
  };
}
