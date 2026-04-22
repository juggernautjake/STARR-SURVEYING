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

    let socket:    WebSocket | null = null;
    let cancelled  = false;
    let backoffIdx = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect(): Promise<void> {
      if (cancelled) return;
      setStatus('connecting');
      setLastError(null);

      let ticket: string;
      try {
        const resp = await fetch('/api/ws/ticket', {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify({ jobIds }),
        });
        if (!resp.ok) throw new Error(`ticket fetch failed: ${resp.status}`);
        const json = (await resp.json()) as { ticket: string };
        ticket = json.ticket;
      } catch (err) {
        if (cancelled) return;
        setLastError((err as Error).message);
        setStatus('error');
        scheduleReconnect();
        return;
      }

      try {
        socket = new WebSocket(`${wsUrl}/?ticket=${encodeURIComponent(ticket)}`);
      } catch (err) {
        setLastError((err as Error).message);
        setStatus('error');
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (!aliveRef.current) return;
        setStatus('open');
        backoffIdx = 0; // reset on successful connection
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
        try { event = parseResearchEvent(parsed); } catch { return; }
        setEvents((prev) => {
          const next = [...prev, event];
          if (next.length > bufferSize) next.splice(0, next.length - bufferSize);
          return next;
        });
      };

      socket.onerror = () => {
        if (!aliveRef.current) return;
        setStatus('error');
      };

      socket.onclose = () => {
        if (!aliveRef.current || cancelled) return;
        setStatus('closed');
        scheduleReconnect();
      };
    }

    function scheduleReconnect(): void {
      if (cancelled) return;
      const delay = RECONNECT_BACKOFF_MS[Math.min(backoffIdx, RECONNECT_BACKOFF_MS.length - 1)] ?? 8000;
      backoffIdx++;
      reconnectTimer = setTimeout(() => { void connect(); }, delay);
    }

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        try { socket.close(); } catch { /* ignore */ }
      }
    };
  // joinKey changes when the set of jobIds changes; reconnectTick lets
  // callers force a reconnect on demand.
  }, [enabled, joinKey, wsUrl, bufferSize, reconnectTick, jobIds]);

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
