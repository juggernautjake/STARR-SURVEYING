// lib/saas/notifications/events.ts
//
// Event registrations for the notifications service. Each event maps
// from a NotificationEvent union member to its template, channels,
// defaults, and recipient resolution.
//
// Phase F-2 ships five lifecycle events using the Resend email
// adapter + file-local templates. Phase F-3 adds in-app dispatch;
// Phase F-5 wires Stripe webhook triggers.
//
// Call `registerAllEvents()` once at app boot (Phase F-1's
// initialization point — typically inside instrumentation.ts or
// the first /api route hit).
//
// Spec: docs/planning/in-progress/CUSTOMER_MESSAGING_PLAN.md §2 + §3.

import {
  configureNotificationChannels,
  registerEvent,
  type EventDefinition,
  type NotificationContext,
  type NotificationRecipient,
} from './index';
import { renderTemplateDef, sendEmailViaResend, type TemplateDef } from './email';
import { writeInAppNotification } from './in-app';
import { sendSMSViaTwilio } from './sms';
import {
  INVITE_SENT,
  PASSWORD_RESET,
  PAYMENT_FAILED,
  SIGNUP_WELCOME,
  TRIAL_ENDING_D7,
} from './templates';

// ── Channel adapters ──────────────────────────────────────────────────

/** Wire the Resend (email) + Supabase (in-app) adapters as the
 *  notifications service's channels. SMS stays as a no-op stub
 *  until Phase F-8 wires Twilio. */
function wireChannels(): void {
  configureNotificationChannels({
    email: async (input) => {
      await sendEmailViaResend(input);
    },
    inApp: async (input) => {
      await writeInAppNotification(input);
    },
    sms: async (input) => {
      await sendSMSViaTwilio(input);
    },
  });
}

// ── Event helpers ─────────────────────────────────────────────────────

/** Make a NotificationRecipient from a (email, name?) pair. */
function recipient(email: string, name?: string): NotificationRecipient {
  return { email, name };
}

/** Render a template at dispatch time and produce the EmailDispatchInput
 *  payload used by the configured email channel. We render here so the
 *  dispatch loop can stay generic. The bridge happens through the
 *  event's `title` + `body` callbacks below. */
function eventEmail(
  template: TemplateDef,
  payload: Record<string, unknown>,
): { subject: string; html: string; text?: string } {
  return renderTemplateDef(template, payload);
}

// ── Events ────────────────────────────────────────────────────────────

const SIGNUP_WELCOME_EVENT: EventDefinition = {
  event: 'signup_welcome',
  channels: { email: true, in_app: true },
  defaults: { email: true, in_app: true },
  emailTemplate: 'signup_welcome',
  resolveRecipients: async (ctx: NotificationContext) => {
    const email = ctx.payload.userEmail as string | undefined;
    const name = ctx.payload.userName as string | undefined;
    if (!email) return [];
    return [recipient(email, name)];
  },
  title: (payload) => eventEmail(SIGNUP_WELCOME, payload).subject,
  body: (payload) => eventEmail(SIGNUP_WELCOME, payload).html,
};

const INVITE_SENT_EVENT: EventDefinition = {
  event: 'invite_sent',
  channels: { email: true },
  defaults: { email: true },
  emailTemplate: 'invite_sent',
  resolveRecipients: async (ctx: NotificationContext) => {
    const email = ctx.payload.inviteeEmail as string | undefined;
    if (!email) return [];
    return [recipient(email)];
  },
  title: (payload) => eventEmail(INVITE_SENT, payload).subject,
  body: (payload) => eventEmail(INVITE_SENT, payload).html,
};

const PASSWORD_RESET_EVENT: EventDefinition = {
  event: 'password_reset',
  channels: { email: true },
  defaults: { email: true },
  emailTemplate: 'password_reset',
  resolveRecipients: async (ctx: NotificationContext) => {
    const email = ctx.payload.userEmail as string | undefined;
    const name = ctx.payload.userName as string | undefined;
    if (!email) return [];
    return [recipient(email, name)];
  },
  title: (payload) => eventEmail(PASSWORD_RESET, payload).subject,
  body: (payload) => eventEmail(PASSWORD_RESET, payload).html,
};

const TRIAL_ENDING_D7_EVENT: EventDefinition = {
  event: 'trial_ending_d7',
  channels: { email: true, in_app: true },
  defaults: { email: true, in_app: true },
  emailTemplate: 'trial_ending_d7',
  resolveRecipients: async (ctx: NotificationContext) => {
    const email = ctx.payload.billingContactEmail as string | undefined;
    const name = ctx.payload.billingContactName as string | undefined;
    if (!email) return [];
    return [recipient(email, name)];
  },
  title: (payload) => eventEmail(TRIAL_ENDING_D7, payload).subject,
  body: (payload) => eventEmail(TRIAL_ENDING_D7, payload).html,
};

const PAYMENT_FAILED_EVENT: EventDefinition = {
  event: 'payment_failed',
  channels: { email: true, in_app: true },
  defaults: { email: true, in_app: true },
  emailTemplate: 'payment_failed',
  resolveRecipients: async (ctx: NotificationContext) => {
    const email = ctx.payload.billingContactEmail as string | undefined;
    const name = ctx.payload.billingContactName as string | undefined;
    if (!email) return [];
    return [recipient(email, name)];
  },
  title: (payload) => eventEmail(PAYMENT_FAILED, payload).subject,
  body: (payload) => eventEmail(PAYMENT_FAILED, payload).html,
};

// ── Bootstrap ─────────────────────────────────────────────────────────

let _registered = false;

/** Idempotent — safe to call multiple times during dev hot-reload. */
export function registerAllEvents(): void {
  if (_registered) return;
  _registered = true;
  wireChannels();
  registerEvent(SIGNUP_WELCOME_EVENT);
  registerEvent(INVITE_SENT_EVENT);
  registerEvent(PASSWORD_RESET_EVENT);
  registerEvent(TRIAL_ENDING_D7_EVENT);
  registerEvent(PAYMENT_FAILED_EVENT);
}

/** Test seam — resets so a vitest suite can re-register cleanly. */
export function _resetForTests(): void {
  _registered = false;
}
