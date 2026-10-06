// lib/time-tracking/pending-hours.ts — a clock-out is never thrown away.
//
// Owner, 2026-10-05: "find ways to make it so that if they do not post because of data shortages or
// no internet or something like that, that we can save the hours for later and still post them."
//
// Until now every clock-out surface POSTed once, swallowed any failure, and cleared the clock
// session regardless — so a clock-out in a field with no signal was simply gone, and the person was
// told (at best) to type it in again later. Now a clock-out is written to this device FIRST, then
// sent. It leaves the device only when the server has acknowledged it, and is retried whenever the
// browser comes back online, the tab becomes visible, or a minute passes.
//
// Retries are safe because each entry carries a `client_submission_id`, and the database has a
// unique index on it (seeds/664): the second arrival of one clock-out returns the first row rather
// than creating another — even if the first attempt landed and only the reply was lost.
//
// A submission the server REFUSES (bad data, a closed pay week, more than 24 hours) is never retried
// blindly and never dropped: it is marked `needsAttention`, shown on My time with the server's
// reason, and can be fixed and re-sent from there.

import { elapsedHours, type ClockSession } from './clock-session';

export const PENDING_HOURS_KEY = 'starr-pending-hours';
/** Fired on `window` whenever the queue changes, so every surface showing it can re-read. */
export const PENDING_HOURS_EVENT = 'starr-pending-hours-changed';

export interface PendingEntry {
  log_date: string;
  work_type: string;
  hours: number;
  job_id: string | null;
  description: string;
  notes: string;
  activity_tag_ids: string[];
  lunch_minutes?: number | null;
  client_submission_id: string;
}

export interface PendingSubmission {
  id: string;
  createdAt: string;
  entries: PendingEntry[];
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  /** The server refused it. Not retried automatically — a person has to look at it. */
  needsAttention: boolean;
}

export type SubmitOutcome =
  | { status: 'posted'; hours: number }
  | { status: 'queued'; hours: number; reason: string }
  | { status: 'needs_attention'; hours: number; reason: string }
  /** Could not even be saved on this device, and the server did not take it either. */
  | { status: 'failed'; hours: number; reason: string };

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** `YYYY-MM-DD` of an instant, on THIS device's calendar. Not `toISOString()`, which is UTC and
 *  put every Texas clock-out after 7pm on the following day. */
export function localDateOf(iso: string | number | Date): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Hours of an un-split shift past which the approver is told it may be a missed clock-out. */
export const LONG_SHIFT_HOURS = 14;

/**
 * Split [start, end) at each local midnight, so a shift that runs past midnight is booked to the
 * days it was actually worked — and a forgotten clock-out that ran 30 hours becomes rows the server
 * accepts (no day over 24h) instead of one row it refuses.
 */
export function splitByLocalDay(startMs: number, endMs: number): Array<{ date: string; hours: number }> {
  const out: Array<{ date: string; hours: number }> = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const d = new Date(cursor);
    const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const segEnd = Math.min(nextMidnight, endMs);
    const hours = round2((segEnd - cursor) / 3_600_000);
    if (hours > 0) out.push({ date: localDateOf(cursor), hours });
    cursor = segEnd;
  }
  return out;
}

/**
 * The rows a clock-out produces: one per job the time was split across, or — when the person did
 * not split it — the elapsed time, one row per calendar day it touched.
 *
 * A split-by-job clock-out is booked to the day the shift STARTED; the person chose those numbers,
 * and spreading them across midnight would be guessing which job came when.
 */
export function buildClockOutEntries(input: {
  session: ClockSession;
  perJobAllocations: Record<string, number>;
  tagIds: string[];
  notes: string;
  lunchMinutes: number | null;
  description: string;
  now?: number;
}): PendingEntry[] {
  const { session, perJobAllocations, tagIds, notes, lunchMinutes, description } = input;
  const now = input.now ?? Date.now();
  const submissionId = newId();
  const tags = [...new Set([...session.tagIds, ...tagIds])];
  const allocated = Object.entries(perJobAllocations).filter(([, h]) => h > 0);
  const startMs = Date.parse(session.startedAt);

  let rows: Array<{ date: string; job_id: string | null; hours: number }>;
  if (allocated.length > 0) {
    const day = localDateOf(session.startedAt);
    rows = allocated.map(([job_id, hours]) => ({ date: day, job_id, hours: round2(hours) }));
  } else if (Number.isFinite(startMs) && startMs < now) {
    rows = splitByLocalDay(startMs, now).map((seg) => ({ date: seg.date, job_id: session.jobId, hours: seg.hours }));
  } else {
    rows = [];
  }
  // Nothing measurable (a clock-in a few seconds ago, or a clock that says it started in the
  // future): still recorded, at the elapsed figure, so the server's answer is shown rather than
  // the attempt silently vanishing.
  if (rows.length === 0) {
    rows = [{ date: localDateOf(now), job_id: session.jobId, hours: round2(elapsedHours(session.startedAt, now)) }];
  }

  const total = rows.reduce((s, r) => s + r.hours, 0);
  // Said to the approver, not decided for them: the hours are recorded as clocked.
  const longShift = allocated.length === 0 && total > LONG_SHIFT_HOURS
    ? `⚠ ${round2(total)}h on the clock (clocked in ${new Date(startMs).toLocaleString()}). Possibly a missed clock-out — please check before approving.`
    : '';
  const fullNotes = [notes, longShift].filter(Boolean).join(' — ');

  return rows.map((r, i) => ({
    log_date: r.date,
    work_type: 'general',
    hours: r.hours,
    job_id: r.job_id,
    description,
    notes: fullNotes,
    activity_tag_ids: tags,
    // ── THE LUNCH IS ONE LUNCH ── on the first row only; a day split across three jobs had one lunch.
    ...(i === 0 ? { lunch_minutes: lunchMinutes } : {}),
    client_submission_id: `${submissionId}:${i}`,
  }));
}

// ── Storage ────────────────────────────────────────────────────────────────────────────────────

export function readPendingHours(): PendingSubmission[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PENDING_HOURS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PendingSubmission[]).filter((p) => p && Array.isArray(p.entries)) : [];
  } catch {
    return [];
  }
}

/** Returns false when the device would not store it (private mode, full storage). */
function writePendingHours(list: PendingSubmission[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(PENDING_HOURS_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(PENDING_HOURS_EVENT));
    return true;
  } catch {
    return false;
  }
}

function updatePending(id: string, change: (p: PendingSubmission) => PendingSubmission | null): void {
  const next: PendingSubmission[] = [];
  for (const p of readPendingHours()) {
    if (p.id !== id) { next.push(p); continue; }
    const changed = change(p);
    if (changed) next.push(changed);
  }
  writePendingHours(next);
}

export const totalHoursOf = (entries: ReadonlyArray<{ hours: number }>) =>
  round2(entries.reduce((s, e) => s + (Number(e.hours) || 0), 0));

// ── Sending ────────────────────────────────────────────────────────────────────────────────────

type PostResult = { ok: true } | { ok: false; retryable: boolean; reason: string };

async function postEntries(entries: PendingEntry[], fetchImpl: typeof fetch): Promise<PostResult> {
  try {
    const res = await fetchImpl('/api/admin/time-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    // Signed out, timed out, rate-limited or a server fault: try again later, unchanged.
    // Anything else in the 4xx range is the server saying the entry itself is wrong.
    const retryable = res.status >= 500 || res.status === 401 || res.status === 403 || res.status === 408 || res.status === 429;
    // Retryable failures get a sentence that says what will happen; only a REFUSAL quotes the
    // server, because then the person has something to fix. ("offline" alone told nobody anything.)
    const reason = res.status === 401 || res.status === 403
      ? 'You were signed out — it will send once you sign in again.'
      : retryable
        ? `The server could not take it just now (${body.error || `HTTP ${res.status}`}). It will retry automatically.`
        : body.error || `The server refused it (HTTP ${res.status}).`;
    return { ok: false, retryable, reason };
  } catch {
    return { ok: false, retryable: true, reason: 'No connection — saved on this device and will send automatically.' };
  }
}

let flushing: Promise<number> | null = null;

/**
 * Send everything waiting. Returns how many submissions were accepted. Never throws.
 *
 * Only one flush runs at a time in a tab; a second tab flushing simultaneously is harmless because
 * of the idempotency key.
 */
export function flushPendingHours(opts: { includeNeedsAttention?: boolean; fetchImpl?: typeof fetch } = {}): Promise<number> {
  if (flushing) return flushing;
  const fetchImpl = opts.fetchImpl ?? fetch;
  flushing = (async () => {
    let posted = 0;
    for (const item of readPendingHours()) {
      if (item.needsAttention && !opts.includeNeedsAttention) continue;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      const result = await postEntries(item.entries, fetchImpl);
      if (result.ok) {
        posted += 1;
        updatePending(item.id, () => null);
      } else {
        updatePending(item.id, (p) => ({
          ...p,
          attempts: p.attempts + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: result.reason,
          needsAttention: !result.retryable,
        }));
      }
    }
    return posted;
  })().finally(() => { flushing = null; });
  return flushing;
}

/**
 * Save a clock-out on this device, then try to send it. The caller may clear the clock session for
 * every outcome except `failed` — in that one case nothing holds the hours but the session itself.
 */
export async function submitClockOut(entries: PendingEntry[], fetchImpl: typeof fetch = fetch): Promise<SubmitOutcome> {
  const hours = totalHoursOf(entries);
  const item: PendingSubmission = {
    id: entries[0]?.client_submission_id.split(':')[0] ?? newId(),
    createdAt: new Date().toISOString(),
    entries,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    needsAttention: false,
  };
  const stored = writePendingHours([...readPendingHours(), item]);

  const result = await postEntries(entries, fetchImpl);
  if (result.ok) {
    if (stored) updatePending(item.id, () => null);
    return { status: 'posted', hours };
  }
  if (!stored) return { status: 'failed', hours, reason: result.reason };

  updatePending(item.id, (p) => ({
    ...p,
    attempts: 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: result.reason,
    needsAttention: !result.retryable,
  }));
  return result.retryable
    ? { status: 'queued', hours, reason: result.reason }
    : { status: 'needs_attention', hours, reason: result.reason };
}

/** Change the hours on a waiting submission (e.g. a forgotten clock-out that ran 30 hours) and
 *  send it again. Only single-row submissions are editable here; anything else is re-sent as is. */
export function editPendingHours(id: string, hours: number): void {
  updatePending(id, (p) => p.entries.length !== 1 ? p : ({
    ...p,
    entries: [{ ...p.entries[0], hours: round2(hours) }],
    needsAttention: false,
    lastError: null,
  }));
}

/** Throw a waiting submission away — only ever on an explicit request from the person. */
export function discardPendingHours(id: string): void {
  updatePending(id, () => null);
}

/** Keep retrying in the background. Returns a stop function. Mount once per page. */
export function startPendingHoursSync(intervalMs = 60_000): () => void {
  if (typeof window === 'undefined') return () => {};
  const kick = () => { if (readPendingHours().some((p) => !p.needsAttention)) void flushPendingHours(); };
  const onVisible = () => { if (document.visibilityState === 'visible') kick(); };
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(kick, intervalMs);
  kick();
  return () => {
    window.removeEventListener('online', kick);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
  };
}

/** The sentence a clock-out confirmation shows for each outcome. */
export function describeOutcome(o: SubmitOutcome, label: string): string {
  switch (o.status) {
    case 'posted': return `Clocked out — ${label} logged. Pending approval.`;
    case 'queued': return `Clocked out — ${label} saved on this device. It will post automatically when you're back online.`;
    case 'needs_attention': return `Clocked out — ${label} saved, but the server refused it: ${o.reason} Fix it on My time.`;
    case 'failed': return `Couldn't save your hours: ${o.reason} You're still clocked in — try again.`;
  }
}
