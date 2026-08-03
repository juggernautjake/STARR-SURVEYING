// lib/voice/notifications.ts — telling Andrew something happened.
//
// The durable record is the notification row; push is a delivery attempt on top of it. That ordering
// is the whole design, and it is worth stating plainly because the reverse is the common mistake:
// if push were the notification, then a denied permission prompt, a phone in a drawer, or a push
// service outage would mean a paid invoice or a new inquiry vanished. Here, a failed push costs
// nothing but a `pushed_at` that stays null.
//
// Sending is best-effort and never throws into a caller. An inquiry that saves successfully must not
// 500 because a push endpoint returned 410 — the client already filled the form in, and their
// experience cannot depend on Andrew's phone.

import { supabaseAdmin } from '@/lib/supabase';
// PWA plan W4 — the shared Web Push transport. This file used to BE the push backend; now it is one
// of its callers, and /admin/ and /dnd/ can be others.
import {
  sendPush,
  pushConfigured as sharedPushConfigured,
  vapidPublicKey as sharedVapidPublicKey,
} from '@/lib/push/web-push';

export const NOTIFICATION_KINDS = [
  'inquiry_received',
  'invoice_paid',
  'invoice_overdue',
  'contract_signed',
  'session_upcoming',
  'subscription_due',
  'system',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationKindMeta {
  kind: NotificationKind;
  label: string;
  /** Whether this kind is worth waking a phone for by default. */
  pushByDefault: boolean;
  icon: string;
}

export const NOTIFICATION_KIND_META: readonly NotificationKindMeta[] = [
  { kind: 'inquiry_received', label: 'Someone requested a quote', pushByDefault: true, icon: 'MailPlus' },
  { kind: 'invoice_paid', label: 'An invoice was paid', pushByDefault: true, icon: 'CircleDollarSign' },
  { kind: 'contract_signed', label: 'A contract was signed', pushByDefault: true, icon: 'FileSignature' },
  { kind: 'invoice_overdue', label: 'An invoice went overdue', pushByDefault: true, icon: 'AlarmClock' },
  { kind: 'session_upcoming', label: 'A coaching session is coming up', pushByDefault: true, icon: 'CalendarClock' },
  // Not by default: this is a recurring administrative nudge, and a monthly push about a $12
  // subscription is how someone learns to swipe every notification away without reading it.
  { kind: 'subscription_due', label: 'A subscription is about to renew', pushByDefault: false, icon: 'RefreshCw' },
  { kind: 'system', label: 'Platform messages', pushByDefault: false, icon: 'Info' },
];

export function kindMeta(kind: string): NotificationKindMeta {
  return NOTIFICATION_KIND_META.find((k) => k.kind === kind) ?? NOTIFICATION_KIND_META[NOTIFICATION_KIND_META.length - 1];
}

export interface CreateNotificationInput {
  userId?: string | null;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  subjectType?: string;
  subjectId?: string;
}

/**
 * Records a notification for every studio user, and attempts a push to each.
 *
 * Fans out to all users rather than taking a recipient, because "who should know about a new
 * inquiry" is "whoever runs the business", and with one or two accounts a targeting system is
 * ceremony. When an assistant role is genuinely in use, this is the one function that changes.
 *
 * Returns the number of rows written, so callers can log it. Never throws.
 */
export async function notifyStudio(input: CreateNotificationInput): Promise<number> {
  try {
    const { data: users } = await supabaseAdmin.from('va_users').select('id');
    const targets: { id: string }[] = input.userId
      ? [{ id: input.userId }]
      : ((users ?? []) as { id: string }[]);
    if (!targets.length) return 0;

    const rows = targets.map((u: { id: string }) => ({
      user_id: u.id,
      kind: input.kind,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 1000) ?? null,
      href: input.href ?? null,
      subject_type: input.subjectType ?? null,
      subject_id: input.subjectId ?? null,
    }));

    const { data, error } = await supabaseAdmin.from('va_notifications').insert(rows).select('id, user_id');
    if (error) {
      console.warn('[voice/notifications] insert failed:', error.message);
      return 0;
    }

    // Push after the row is safely written, never before. Deliberately not awaited into the caller's
    // critical path beyond this function.
    void deliverPush(input, targets.map((t) => t.id)).catch(() => {});

    return data?.length ?? 0;
  } catch (err) {
    console.warn('[voice/notifications] threw:', err);
    return 0;
  }
}

// ── Web Push ─────────────────────────────────────────────────────────────────────────────────────

/**
 * True when VAPID keys are configured.
 *
 * Push is OPTIONAL infrastructure. Without keys the notification centre in the studio still works
 * completely — it just does not ring a phone. Gating on configuration rather than shipping a broken
 * subscribe button is the difference between "not set up yet" and "broken".
 */
// W4 — re-exported from the shared transport rather than reimplemented, so there is exactly one
// answer to "is push set up". The existing callers and env vars keep working: the shared version
// still reads VOICE_VAPID_* and simply prefers PUSH_VAPID_* when present.
export function pushConfigured(): boolean {
  return sharedPushConfigured();
}

export function vapidPublicKey(): string | null {
  return sharedVapidPublicKey();
}

/**
 * Sends a Web Push to every live subscription.
 *
 * `web-push` is not a dependency of this repo, and adding one for a feature that cannot be tested
 * without real VAPID keys and a real device would be adding an untested dependency to a production
 * surveying app. Instead this resolves the module at runtime and no-ops when it is absent — so
 * `npm install web-push` plus two env vars is the entire activation, and until then nothing breaks.
 */
async function deliverPush(input: CreateNotificationInput, userIds: string[]): Promise<void> {
  if (!pushConfigured() || !userIds.length) return;

  const { data: subs } = await supabaseAdmin
    .from('va_push_subscriptions')
    .select('*')
    .in('user_id', userIds)
    .is('disabled_at', null);

  if (!subs?.length) return;

  const payload = JSON.stringify({
    title: input.title,
    body: input.body ?? '',
    href: input.href ?? '/AndrewAsh/studio',
    kind: input.kind,
  });

  // PWA plan W4 — the SENDING half now lives in `lib/push/web-push.ts` so /admin/ and /dnd/ can use
  // it too. What stays here is everything specific to this scope: which table holds the
  // subscriptions, and what a failure means for them. The three-strike disable rule below is the
  // studio's policy, not a property of Web Push, which is precisely why the transport does not own
  // it — a transport that wrote to a table would have to know which table, and that is what made the
  // original impossible to reuse.
  const results = await sendPush(
    (subs as Array<{ id: string; endpoint: string; p256dh: string; auth: string; failure_count?: number }>),
    payload,
  );

  await Promise.all(
    results.map(async ({ sub, result }) => {
      if (result.ok) {
        await supabaseAdmin
          .from('va_push_subscriptions')
          .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
          .eq('id', sub.id);
        return;
      }
      // `gone` (404/410) means the browser threw the subscription away and it will never work again.
      // Anything else is probably transient, so it only increments a counter — and it takes three
      // consecutive failures to disable, so one outage does not unsubscribe every device.
      const failures = (sub.failure_count ?? 0) + 1;
      await supabaseAdmin
        .from('va_push_subscriptions')
        .update({
          failure_count: failures,
          last_failure_at: new Date().toISOString(),
          disabled_at: result.gone || failures >= 3 ? new Date().toISOString() : null,
        })
        .eq('id', sub.id);
    }),
  );
}

/** Unread count for the studio header badge. */
export async function unreadCount(userId: string): Promise<number> {
  try {
    const { count } = await supabaseAdmin
      .from('va_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Relative time for the notification feed — "2h ago", "yesterday". */
export function relativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  const days = Math.round(seconds / 86400);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
