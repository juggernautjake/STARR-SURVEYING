// lib/saas/notifications/index.ts
//
// Notifications service abstraction. Single typed dispatch() for every
// customer-facing event (welcome, invite, trial-ending, payment-failed,
// release announcements, broadcasts, security alerts). Concrete
// channels (Resend / Twilio / in-app WebSocket) implement
// NotificationChannel; events declare which channels apply via their
// definition.
//
// SKELETON ONLY — channels return a no-op stub. Phase F-1/F-2/F-3 wire
// the real Resend + Twilio + WebSocket adapters. Phase F-5 wires the
// lifecycle event triggers from the Stripe webhook + scheduled crons.
//
// Spec: docs/planning/completed/CUSTOMER_MESSAGING_PLAN.md §3.

import type { BundleId } from '../bundles';

// ── Event taxonomy ──────────────────────────────────────────────────────

/** Every notification event the platform can dispatch. Source of truth
 *  for type-safe routing — adding a new event requires both adding to
 *  this union AND registering an EventDefinition. */
export type NotificationEvent =
  | 'signup_welcome'
  | 'invite_sent'
  | 'invite_accepted'
  | 'user_role_changed'
  | 'user_removed'
  | 'password_reset'
  | 'mfa_enabled'
  | 'trial_ending_d7'
  | 'trial_ending_d3'
  | 'trial_ending_d1'
  | 'trial_converted'
  | 'trial_expired'
  | 'payment_failed'
  | 'payment_recovered'
  | 'subscription_canceled'
  | 'plan_changed'
  | 'quota_warning_80'
  | 'quota_exhausted_100'
  | 'release_published'
  | 'maintenance_scheduled'
  | 'ticket_replied_to_customer'
  | 'ticket_assigned_to_operator'
  | 'security_alert_login_new_device'
  | 'security_alert_role_escalated'
  | 'security_alert_impersonation'
  | 'broadcast';

export type ChannelKey = 'email' | 'in_app' | 'sms';

export interface NotificationRecipient {
  email: string;
  name?: string;
  phone?: string;        // for SMS
  orgId?: string;
}

export interface NotificationContext {
  /** The org this notification concerns. Often the recipient's org. */
  orgId?: string;
  /** Free-form event payload. Each event has its own typed shape; this
   *  is the untyped escape hatch for v0. */
  payload: Record<string, unknown>;
}

/** What an event needs to dispatch correctly. Each event in
 *  `events/<name>.ts` exports an EventDefinition. */
export interface EventDefinition<TPayload = Record<string, unknown>> {
  event: NotificationEvent;
  /** Allowed channels for this event. Per-user preference can DISABLE
   *  a channel that's allowed, but cannot ENABLE one that isn't. */
  channels: Partial<Record<ChannelKey, true>>;
  /** Default channel state when no user preference is set. */
  defaults: Partial<Record<ChannelKey, boolean>>;
  /** Resolve who receives this event given the context. */
  resolveRecipients: (ctx: NotificationContext) => Promise<NotificationRecipient[]>;
  /** Template names (Handlebars files under templates/). */
  emailTemplate?: string;
  /** For in-app — short title + body that renders in the bell panel. */
  title?: (payload: TPayload) => string;
  body?: (payload: TPayload) => string;
  /** SMS body (160 chars max). */
  smsTemplate?: (payload: TPayload) => string;
  /** Optional bundle filter — only fires when the recipient's org has
   *  this bundle (e.g. release_published only goes to orgs with the
   *  affected bundle). */
  bundleFilter?: BundleId[];
}

// ── Channel adapters (interfaces; concrete impls land in Phase F) ────────

export interface EmailDispatchInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Record<string, string>;        // Resend tags for delivery analytics
}

export interface InAppDispatchInput {
  userEmail: string;
  orgId?: string;
  type: string;                          // matches NotificationEvent
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body?: string;
  actionUrl?: string;
  actionLabel?: string;
  payload: Record<string, unknown>;
}

export interface SMSDispatchInput {
  to: string;
  body: string;
}

export interface NotificationChannel {
  email: (input: EmailDispatchInput) => Promise<void>;
  inApp: (input: InAppDispatchInput) => Promise<void>;
  sms: (input: SMSDispatchInput) => Promise<void>;
}

// ── Dispatcher ──────────────────────────────────────────────────────────

let _channels: NotificationChannel = {
  // Phase F replaces these stubs with real adapters.
  email: async () => { /* TODO Phase F-2 — Resend adapter */ },
  inApp: async () => { /* TODO Phase F-3 — org_notifications insert + WS fanout */ },
  sms: async () => { /* TODO Phase F-8 — Twilio adapter */ },
};

/** Override the channels (test seam + later for real adapter binding). */
export function configureNotificationChannels(channels: Partial<NotificationChannel>): void {
  _channels = { ..._channels, ...channels };
}

const REGISTRY: Partial<Record<NotificationEvent, EventDefinition>> = {};

export function registerEvent<T extends Record<string, unknown>>(def: EventDefinition<T>): void {
  REGISTRY[def.event] = def as EventDefinition<Record<string, unknown>>;
}

/** Get a user's channel preferences for this event. Phase F-4
 *  reads from public.user_notification_prefs via prefs.ts. */
async function getUserPrefs(userEmail: string, event: NotificationEvent): Promise<Partial<Record<ChannelKey, boolean>>> {
  // Lazy import to avoid a circular dep (prefs.ts imports
  // ChannelKey + NotificationEvent from this module).
  const { getEventPrefs } = await import('./prefs');
  return getEventPrefs(userEmail, event);
}

/** The central dispatch function. */
export async function dispatch(event: NotificationEvent, ctx: NotificationContext): Promise<void> {
  const def = REGISTRY[event];
  if (!def) {
    // Unknown event — log and bail. Phase F-1 logs via the operator-side
    // audit + error_log.
    if (typeof console !== 'undefined') {
      console.warn(`[notifications] unknown event: ${event}`);
    }
    return;
  }

  const recipients = await def.resolveRecipients(ctx);
  for (const r of recipients) {
    const prefs = await getUserPrefs(r.email, event);

    const channelsToFire: ChannelKey[] = (['email', 'in_app', 'sms'] as const).filter((ch) => {
      if (!def.channels[ch]) return false;             // not allowed for this event
      if (prefs[ch] === false) return false;           // user opted out
      if (prefs[ch] === true) return true;             // user opted in
      return !!def.defaults[ch];                       // fall back to event default
    });

    for (const ch of channelsToFire) {
      try {
        if (ch === 'email' && def.emailTemplate) {
          await _channels.email({
            to: r.email,
            subject: def.title?.(ctx.payload) ?? event,
            html: '', // Phase F-2 renders template; v0 sends empty
            text: def.body?.(ctx.payload),
            tags: { event, orgId: ctx.orgId ?? '' },
          });
        } else if (ch === 'in_app') {
          await _channels.inApp({
            userEmail: r.email,
            orgId: ctx.orgId,
            type: event,
            severity: 'info',
            title: def.title?.(ctx.payload) ?? event,
            body: def.body?.(ctx.payload),
            payload: ctx.payload,
          });
        } else if (ch === 'sms' && r.phone && def.smsTemplate) {
          await _channels.sms({
            to: r.phone,
            body: def.smsTemplate(ctx.payload),
          });
        }
      } catch (err) {
        // Per-recipient failure shouldn't abort the rest of the
        // dispatch. Log + continue.
        if (typeof console !== 'undefined') {
          console.error(`[notifications] ${event} → ${r.email} on ${ch} failed:`, err);
        }
      }
    }
  }
}
