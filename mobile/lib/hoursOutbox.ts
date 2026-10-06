/**
 * Mobile clock-outs → the hours the office actually approves.
 *
 * Until 2026-10-05 a mobile clock-out was written to the phone's local SQLite (job_time_entries) and
 * nowhere else: PowerSync — the only path off the phone — has never been configured, so not one
 * mobile hour ever reached `daily_time_logs`, which is what the web approvals page and payroll read.
 *
 * Now each clock-out is also put in this outbox (AsyncStorage, so it survives the app being killed)
 * and posted to the same API the web clock uses — `/api/admin/time-logs`, signed with the phone's
 * Supabase token. That gives mobile hours exactly what web hours get: pay pricing, the approver
 * notification, duplicate protection and the audit trail.
 *
 * It leaves the outbox only when the server has it. Retries happen when the app returns to the
 * foreground, when the connection comes back, and every minute. Each row carries a
 * `client_submission_id` (unique in the database), so a retry after a lost reply can never create a
 * second copy. A submission the server REFUSES is kept and flagged, never dropped.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { logInfo, logWarn } from './log';
import { subscribeToOnline } from './networkState';
import { supabase } from './supabase';
import type { OutboxEntry } from './hoursEntries';

export { buildMobileEntries, localDateOf, splitByLocalDay, type OutboxEntry } from './hoursEntries';

const KEY = 'starr-hours-outbox-v1';
/** The web app that owns the hours API. Set per build — see .env.example. Without it nothing is
 *  sent, and nothing is lost: clock-outs wait in the outbox and the Time tab says why. */
const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
const NOT_CONFIGURED = 'This build of the app has no server address (EXPO_PUBLIC_API_URL), so hours are kept on the phone. Tell the office.';

export interface OutboxItem {
  id: string;
  createdAt: string;
  entries: OutboxEntry[];
  attempts: number;
  lastError: string | null;
  needsAttention: boolean;
}

// ── storage ──────────────────────────────────────────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

export async function readOutbox(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  notify();
}

/** Add a clock-out. Idempotent on the clock-out's own id, so a double tap cannot queue it twice. */
export async function enqueueHours(entries: OutboxEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const id = entries[0].client_submission_id.split(':').slice(0, 2).join(':');
  const items = await readOutbox();
  if (items.some((x) => x.id === id)) return;
  items.push({ id, createdAt: new Date().toISOString(), entries, attempts: 0, lastError: null, needsAttention: false });
  await writeOutbox(items);
}

export async function discardOutboxItem(id: string): Promise<void> {
  await writeOutbox((await readOutbox()).filter((x) => x.id !== id));
}

// ── sending ──────────────────────────────────────────────────────────────────────────────────────

let flushing: Promise<number> | null = null;

/** Send what is waiting. Returns how many were accepted. Never throws. */
export function flushHoursOutbox(opts: { includeNeedsAttention?: boolean } = {}): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let posted = 0;
    const items = await readOutbox();
    if (items.length === 0) return 0;
    if (!API_BASE) {
      await writeOutbox(items.map((x) => ({ ...x, lastError: NOT_CONFIGURED })));
      logWarn('hoursOutbox', 'EXPO_PUBLIC_API_URL is not set — hours kept on device');
      return 0;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return 0; // signed out — keep everything until they sign back in

    for (const item of items) {
      if (item.needsAttention && !opts.includeNeedsAttention) continue;
      let ok = false;
      let retryable = true;
      let reason: string | null = null;
      try {
        const res = await fetch(`${API_BASE}/api/admin/time-logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ entries: item.entries }),
        });
        ok = res.ok;
        if (!ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          retryable = res.status >= 500 || [401, 403, 408, 429].includes(res.status);
          reason = body.error || `HTTP ${res.status}`;
        }
      } catch {
        reason = 'No connection — will send automatically.';
      }

      const current = await readOutbox();
      if (ok) {
        posted += 1;
        await writeOutbox(current.filter((x) => x.id !== item.id));
        logInfo('hoursOutbox', 'posted', { id: item.id, rows: item.entries.length });
      } else {
        await writeOutbox(current.map((x) => x.id === item.id
          ? { ...x, attempts: x.attempts + 1, lastError: reason, needsAttention: !retryable }
          : x));
        logWarn('hoursOutbox', 'not posted', undefined, { id: item.id, reason, retryable });
      }
    }
    return posted;
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Mount once (root layout). Retries on foreground, on reconnect and every minute. */
export function useHoursOutboxSync(): void {
  useEffect(() => {
    void flushHoursOutbox();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void flushHoursOutbox(); });
    const unsubOnline = subscribeToOnline((online) => { if (online) void flushHoursOutbox(); });
    const timer = setInterval(() => { void flushHoursOutbox(); }, 60_000);
    return () => { sub.remove(); unsubOnline(); clearInterval(timer); };
  }, []);
}

/** What is waiting, for the Time tab's banner. */
export function useHoursOutbox(): { items: OutboxItem[]; sendNow: () => Promise<void> } {
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    const refresh = () => { void readOutbox().then(setItems); };
    refresh();
    listeners.add(refresh);
    return () => { listeners.delete(refresh); };
  }, []);
  const sendNow = useCallback(async () => { await flushHoursOutbox({ includeNeedsAttention: true }); }, []);
  return { items, sendNow };
}
