// lib/research/useResearchProgress.ts
//
// React hook that subscribes to the real-time research progress channel
// for one or more jobIds. Connects to the standalone WS server
// (server/ws.ts) via a short-lived HMAC ticket fetched from
// /api/ws/ticket.
//
// Usage:
//   const { events, status, lastError } = useResearchProgress([jobId]);
//
// Lifecycle:
//   1. Hook mounts → POST /api/ws/ticket with jobIds.
//   2. On success → open ws://<WS_URL>/?ticket=<ticket>.
//   3. Hook receives a "hello" frame, then ResearchEvent JSON frames.
//   4. On unmount or jobIds change → close socket and refetch ticket.
//   5. Auto-reconnect with exponential backoff (250ms → 8s) on transport
//      errors. Refreshes the ticket before reconnecting if the previous
//      ticket has expired.
//
// Server URL: NEXT_PUBLIC_WS_URL env var; defaults to
//   ws://localhost:3001 in dev, wss://<current-host>:3001 otherwise.

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  parseResearchEvent,
  type ResearchEvent,
} from '@/worker/src/shared/research-events';

export type WsConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface UseResearchProgressResult {
  /** Most recent events, oldest-first. Capped at `bufferSize` (default 200). */
  events: ResearchEvent[];
  /** Current socket status. */
  status: WsConnectionStatus;
  /** Last transport error message, if any. */
  lastError: string | null;
  /** Force a reconnect (e.g. user clicks "retry"). */
  reconnect: () => void;
}

export interface UseResearchProgressOptions {
  /** How many events to keep in the in-memory buffer. */
  bufferSize?: number;
  /** Override the WS URL. Defaults to NEXT_PUBLIC_WS_URL or auto-detected. */
  wsUrl?: string;
  /** Skip everything (no fetch, no socket) — useful for SSR or feature flags. */
  enabled?: boolean;
}

const DEFAULT_BUFFER = 200;
const RECONNECT_BACKOFF_MS = [250, 500, 1000, 2000, 4000, 8000];

export function useResearchProgress(
  jobIds: string[],
  options: UseResearchProgressOptions = {},
): UseResearchProgressResult {
  const enabled    = options.enabled ?? true;
  const bufferSize = options.bufferSize ?? DEFAULT_BUFFER;
  const wsUrl      = options.wsUrl ?? resolveWsUrl();

  const [events, setEvents]       = useState<ResearchEvent[]>([]);
  const [status, setStatus]       = useState<WsConnectionStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

  // Use a ref for the join key so the effect re-runs only when jobIds
  // actually change (not on every parent render passing a new array literal).
  const joinKey = jobIds.slice().sort().join(',');

  // Bump this to force a reconnect.
  const [reconnectTick, setReconnectTick] = useState(0);

  // Mount guard so we don't update state after unmount.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || joinKey.length === 0) {
      setStatus('idle');
      return;
    }
    const jobList = joinKey.split(',');

    let socket:    WebSocket | null = null;
    let cancelled  = false;
    let backoffIdx = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer:   ReturnType<typeof setTimeout> | null = null;

    async function connect(): Promise<void> {
      if (cancelled) return;
      setStatus('connecting');
      setLastError(null);
      console.log(`[useResearchProgress] connecting jobs=${jobList.length} url=${wsUrl}`);

      let ticket:     string;
      let expiresAt:  number | undefined;
      let ttlSeconds: number | undefined;
      try {
        const resp = await fetch('/api/ws/ticket', {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify({ jobIds: jobList }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`ticket fetch failed: ${resp.status} ${text || resp.statusText}`);
        }
        const json = (await resp.json()) as { ticket: string; expiresAt?: number; ttlSeconds?: number };
        ticket     = json.ticket;
        expiresAt  = json.expiresAt;
        ttlSeconds = json.ttlSeconds;
      } catch (err) {
        if (cancelled) return;
        const msg = (err as Error).message;
        console.warn(`[useResearchProgress] ticket fetch error: ${msg}`);
        setLastError(msg);
        setStatus('error');
        scheduleReconnect();
        return;
      }

      try {
        socket = new WebSocket(`${wsUrl}/?ticket=${encodeURIComponent(ticket)}`);
      } catch (err) {
        const msg = (err as Error).message;
        console.warn(`[useResearchProgress] socket construction failed: ${msg}`);
        setLastError(msg);
        setStatus('error');
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (!aliveRef.current) return;
        console.log(`[useResearchProgress] connected jobs=${jobList.length}${ttlSeconds ? ` ticketTtl=${ttlSeconds}s` : ''}`);
        setStatus('open');
        backoffIdx = 0; // reset on successful connection

        // Proactively refresh the ticket 30s before expiry by closing the
        // socket; onclose will trigger scheduleReconnect → new ticket.
        // Without this, the server kicks us with code 4001 mid-stream.
        if (expiresAt) {
          const msUntilRefresh = Math.max(5_000, expiresAt * 1000 - Date.now() - 30_000);
          refreshTimer = setTimeout(() => {
            if (cancelled) return;
            console.log('[useResearchProgress] proactive ticket refresh — closing socket');
            try { socket?.close(1000, 'ticket refresh'); } catch { /* ignore */ }
          }, msUntilRefresh);
        }
      };

      socket.onmessage = (msg) => {
        if (!aliveRef.current) return;
        let parsed: unknown;
        try { parsed = JSON.parse(typeof msg.data === 'string' ? msg.data : ''); }
        catch { return; }
        // Drop the "hello" frame — it's not a ResearchEvent.
        if (parsed && typeof parsed === 'object' && (parsed as { type?: string }).type === 'hello') {
          return;
        }
        let event: ResearchEvent;
        try { event = parseResearchEvent(parsed); }
        catch (err) {
          console.warn('[useResearchProgress] dropping malformed event:', (err as Error).message);
          return;
        }
        setEvents((prev) => {
          const next = [...prev, event];
          if (next.length > bufferSize) next.splice(0, next.length - bufferSize);
          return next;
        });
      };

      socket.onerror = () => {
        if (!aliveRef.current) return;
        console.warn('[useResearchProgress] socket error');
        setStatus('error');
      };

      socket.onclose = (ev) => {
        if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
        if (!aliveRef.current || cancelled) return;
        console.log(`[useResearchProgress] socket closed code=${ev.code}${ev.reason ? ` reason=${ev.reason}` : ''} — scheduling reconnect`);
        setStatus('closed');
        scheduleReconnect();
      };
    }

    function scheduleReconnect(): void {
      if (cancelled) return;
      const delay = RECONNECT_BACKOFF_MS[Math.min(backoffIdx, RECONNECT_BACKOFF_MS.length - 1)] ?? 8000;
      backoffIdx++;
      console.log(`[useResearchProgress] reconnect in ${delay}ms (attempt #${backoffIdx})`);
      reconnectTimer = setTimeout(() => { void connect(); }, delay);
    }

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimer)   clearTimeout(refreshTimer);
      if (socket) {
        try { socket.close(); } catch { /* ignore */ }
      }
    };
  // joinKey is a stable serialization of jobIds — using it as the dep
  // avoids re-running on every parent render that passes a new array
  // literal. reconnectTick lets callers force a reconnect on demand.
  }, [enabled, joinKey, wsUrl, bufferSize, reconnectTick]);

  return {
    events,
    status,
    lastError,
    reconnect: () => setReconnectTick((n) => n + 1),
  };
}

function resolveWsUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WS_URL;
  if (fromEnv) return fromEnv;
  if (typeof window === 'undefined') return 'ws://localhost:3001';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.hostname}:3001`;
}
