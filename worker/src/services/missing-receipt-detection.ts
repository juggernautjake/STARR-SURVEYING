/**
 * Missing-receipt cross-reference detector — Batch DD, F6 closer.
 *
 * Closes the F6 deferral *"Missing-receipt cross-reference prompts —
 * should compare clocked-in geofences against receipt timestamps and
 * prompt 'you spent 12 min at a gas station yesterday but no receipt
 * was logged.' Worker job + mobile inbox notification."*
 *
 * Periodic scan that finds stops where the surveyor probably bought
 * something but no receipt landed in the system. Pushes a
 * notification through the existing dispatcher-ping flow (Batch B)
 * so the row appears in the mobile inbox + Me-tab notifications
 * with a deep-link straight to the receipt-capture screen.
 *
 * Detection rule (v1):
 *   - location_stops with duration_minutes >= 5
 *   - arrived_at within the last 24h (don't spam old stops)
 *   - user_overridden != true (surveyor has explicit category control;
 *     overridden stops are by definition "the user has decided")
 *   - NOT at a known job site — geofence classifier (Batch Q) writes
 *     category='job_site' (or jobs.name) on matched-fence stops; we
 *     skip those.
 *   - NO receipts row for the same user with transaction_at within
 *     ±30 min of arrived_at..departed_at.
 *   - NOT already notified — we encode the stop_id in the
 *     notification link so a SELECT against `link LIKE '%stop_id%'`
 *     gives us idempotency without a new column.
 *
 * Per-user-per-day cap: 5 notifications. A surveyor with a busy
 * day of unknown stops gets the most recent 5 instead of a flood.
 *
 * Why we DON'T auto-mark non-business: the surveyor knows the
 * context. We surface the prompt and let them act ("Add receipt"
 * or "Not a business stop, dismiss").
 */
import type { SupabaseClient } from '@supabase/supabase-js';

interface StopRow {
  id: string;
  user_id: string;
  arrived_at: string;
  departed_at: string | null;
  duration_minutes: number | null;
  category: string | null;
  lat: number;
  lon: number;
}

interface ReceiptWindowRow {
  user_id: string;
  transaction_at: string;
}

interface NotifyTarget {
  user_email: string;
  user_id: string;
}

export interface MissingReceiptScanOptions {
  /** ISO timestamp; default = 24h ago. Stops whose `arrived_at`
   *  is older than this are ignored. */
  sinceIso?: string;
  /** Per-user-per-scan notification cap. Default 5. */
  perUserCap?: number;
  /** Minimum stop duration to consider "long enough to have made
   *  a purchase." Default 5 min. */
  minDurationMinutes?: number;
  /** Receipt-window padding around the stop. Default 30 min. */
  receiptWindowMinutes?: number;
}

export interface MissingReceiptScanResult {
  /** Total stops the SQL pulled (post-filter). */
  candidateStops: number;
  /** Stops we matched against an existing receipt → skipped. */
  receiptCovered: number;
  /** Stops we'd already notified about → skipped. */
  alreadyNotified: number;
  /** Stops we capped per-user-per-day → skipped. */
  capped: number;
  /** Notifications actually inserted this run. */
  inserted: number;
  /** Errors from individual inserts. Caller logs the array; the
   *  scan as a whole still succeeds with a partial result so a
   *  single user with weird state doesn't fail the cron job. */
  errors: string[];
}

const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_PER_USER_CAP = 5;
const DEFAULT_MIN_DURATION_MIN = 5;
const DEFAULT_RECEIPT_WINDOW_MIN = 30;

/**
 * Run one missing-receipt scan. Idempotent — safe to call on a
 * tight cron loop. Returns counts so the CLI can emit a summary
 * line.
 */
export async function processMissingReceiptScan(
  supabase: SupabaseClient,
  opts: MissingReceiptScanOptions = {}
): Promise<MissingReceiptScanResult> {
  const sinceIso =
    opts.sinceIso ??
    new Date(Date.now() - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const perUserCap = opts.perUserCap ?? DEFAULT_PER_USER_CAP;
  const minDuration = opts.minDurationMinutes ?? DEFAULT_MIN_DURATION_MIN;
  const windowMin = opts.receiptWindowMinutes ?? DEFAULT_RECEIPT_WINDOW_MIN;

  const result: MissingReceiptScanResult = {
    candidateStops: 0,
    receiptCovered: 0,
    alreadyNotified: 0,
    capped: 0,
    inserted: 0,
    errors: [],
  };

  // 1. Pull candidate stops. The geofence classifier (Batch Q)
  //    sets `job_id` on stops that matched a known job site —
  //    we skip those (a known job site is by definition a place
  //    we don't expect a separate receipt for). Also skip
  //    user_overridden=true: surveyor has explicit control of
  //    those.
  const { data: stopsData, error: stopsErr } = await supabase
    .from('location_stops')
    .select(
      'id, user_id, arrived_at, departed_at, duration_minutes, category, lat, lon, user_overridden, job_id'
    )
    .gte('arrived_at', sinceIso)
    .gte('duration_minutes', minDuration)
    .is('job_id', null)
    .or('user_overridden.is.null,user_overridden.eq.false')
    .order('arrived_at', { ascending: false })
    .limit(500);
  if (stopsErr) {
    throw new Error(`stops fetch: ${stopsErr.message}`);
  }
  const stops = (stopsData ?? []) as Array<
    StopRow & { user_overridden: boolean | null; job_id: string | null }
  >;
  result.candidateStops = stops.length;
  if (stops.length === 0) return result;

  // 2. Resolve user_id → user_email (notifications are keyed on
  //    email; the trigger from seeds/222 fills target_user_id
  //    automatically). One bulk query.
  const userIds = [...new Set(stops.map((s) => s.user_id))];
  const { data: usersData, error: usersErr } = await supabase
    .from('registered_users')
    .select('id, email')
    .in('id', userIds);
  if (usersErr) {
    throw new Error(`users fetch: ${usersErr.message}`);
  }
  const userById = new Map<string, NotifyTarget>(
    ((usersData ?? []) as Array<{ id: string; email: string }>).map((u) => [
      u.id,
      { user_id: u.id, user_email: u.email },
    ])
  );

  // 3. Pull every receipts row in the lookback window once, group
  //    by user_id. Per-stop receipt-window check is then in-memory
  //    O(receipts_for_user) — much cheaper than a per-stop SQL hit.
  const { data: receiptsData, error: receiptsErr } = await supabase
    .from('receipts')
    .select('user_id, transaction_at, deleted_at')
    .in('user_id', userIds)
    .not('transaction_at', 'is', null)
    .gte(
      'transaction_at',
      // Pull the receipt window plus the receipt-window padding so
      // the in-memory check has all candidates. Receipts with
      // transaction_at AFTER the stop's departure are valid too
      // (the user paid right when they got back to the truck).
      new Date(
        Date.parse(sinceIso) - windowMin * 60 * 1000
      ).toISOString()
    );
  if (receiptsErr) {
    throw new Error(`receipts fetch: ${receiptsErr.message}`);
  }
  const receiptsByUser = new Map<string, number[]>();
  for (const r of (receiptsData ?? []) as Array<
    ReceiptWindowRow & { deleted_at: string | null }
  >) {
    if (r.deleted_at) continue; // soft-deleted receipts don't count
    const t = Date.parse(r.transaction_at);
    if (!Number.isFinite(t)) continue;
    const arr = receiptsByUser.get(r.user_id) ?? [];
    arr.push(t);
    receiptsByUser.set(r.user_id, arr);
  }

  // 4. Pull every existing missing-receipt notification (last 7
  //    days) so we can dedupe by stop_id. The notification's
  //    `link` carries `?stopId=...` so a LIKE check finds prior
  //    rows.
  const dedupSinceIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: priorNotifs, error: notifErr } = await supabase
    .from('notifications')
    .select('user_email, link, created_at')
    .eq('source_type', 'missing_receipt')
    .gte('created_at', dedupSinceIso);
  if (notifErr) {
    throw new Error(`notifications fetch: ${notifErr.message}`);
  }
  const notifiedKeys = new Set<string>();
  // Per-user counts so the per-user-per-scan cap is enforced.
  const todayCounts = new Map<string, number>();
  for (const n of (priorNotifs ?? []) as Array<{
    user_email: string | null;
    link: string | null;
    created_at: string | null;
  }>) {
    if (n.link) {
      const m = n.link.match(/stopId=([0-9a-f-]+)/i);
      if (m) notifiedKeys.add(`${n.user_email}|${m[1]}`);
    }
    // Per-user cap is over the LAST 24h, not the dedup window.
    if (
      n.user_email &&
      n.created_at &&
      Date.parse(n.created_at) >= Date.parse(sinceIso)
    ) {
      todayCounts.set(
        n.user_email,
        (todayCounts.get(n.user_email) ?? 0) + 1
      );
    }
  }

  // 5. Per-stop decision. Stops are sorted newest-first; we
  //    notify the most recent N per user up to perUserCap.
  for (const stop of stops) {
    const target = userById.get(stop.user_id);
    if (!target) continue;
    const stopArr = Date.parse(stop.arrived_at);
    const stopDep = stop.departed_at ? Date.parse(stop.departed_at) : stopArr;
    if (!Number.isFinite(stopArr)) continue;

    // Receipt-window check.
    const userReceipts = receiptsByUser.get(stop.user_id) ?? [];
    const hasNearbyReceipt = userReceipts.some((t) => {
      return (
        t >= stopArr - windowMin * 60 * 1000 &&
        t <= stopDep + windowMin * 60 * 1000
      );
    });
    if (hasNearbyReceipt) {
      result.receiptCovered += 1;
      continue;
    }

    // Already-notified check.
    if (notifiedKeys.has(`${target.user_email}|${stop.id}`)) {
      result.alreadyNotified += 1;
      continue;
    }

    // Per-user cap.
    const cur = todayCounts.get(target.user_email) ?? 0;
    if (cur >= perUserCap) {
      result.capped += 1;
      continue;
    }

    // 6. Insert the notification. Trigger from seeds/222 fills
    //    target_user_id from user_email automatically.
    const stopMinutes = stop.duration_minutes ?? 0;
    const arrivedLocal = formatLocalShortTimestamp(stop.arrived_at);
    const link = `/(tabs)/money/capture?stopId=${encodeURIComponent(
      stop.id
    )}&stopArrivedAt=${encodeURIComponent(stop.arrived_at)}`;
    const { error: insertErr } = await supabase
      .from('notifications')
      .insert({
        user_email: target.user_email,
        type: 'system',
        source_type: 'missing_receipt',
        title: 'Forget a receipt?',
        body: `You stopped for ${stopMinutes} min at ${arrivedLocal}. If that was a gas / food / supplies run, snap the receipt now — tap to capture.`,
        icon: '🧾',
        link,
        escalation_level: 0,
        // Soft-expire after 48h. After that the notification is
        // stale; the surveyor's memory of the stop is too.
        expires_at: new Date(
          Date.now() + 48 * 60 * 60 * 1000
        ).toISOString(),
      });
    if (insertErr) {
      result.errors.push(
        `stop ${stop.id} → notif insert: ${insertErr.message}`
      );
      continue;
    }

    result.inserted += 1;
    todayCounts.set(target.user_email, cur + 1);
    notifiedKeys.add(`${target.user_email}|${stop.id}`);
  }

  return result;
}

/** Render an ISO timestamp as a brief human label like
 *  "Tue 3:42 PM" — used in the notification body. UTC-only since
 *  the worker may not have user-local TZ. */
function formatLocalShortTimestamp(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let hours = d.getUTCHours();
  const minutes = d.getUTCMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${days[d.getUTCDay()]} ${hours}:${minutes} ${ampm}`;
}
