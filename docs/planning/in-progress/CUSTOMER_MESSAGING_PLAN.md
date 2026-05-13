# Customer Messaging Plan — Planning Document

**Status:** RFC / sub-plan of `STARR_SAAS_MASTER_PLAN.md` §5.3 + §5.4
**Owner:** Jacob (Starr Software)
**Created:** 2026-05-13
**Target repo path:** `docs/planning/in-progress/CUSTOMER_MESSAGING_PLAN.md`

> **One-sentence pitch:** Unified notification + transactional-messaging layer covering operator broadcasts to tenants, lifecycle email triggers (welcome, invite, trial-ending, payment-failed, release announcements), in-app notifications, and optional SMS for security alerts — all routed through a single `notifications` service abstraction.

---

## 0. Decisions locked

| Q | Decision | Rationale |
|---|---|---|
| **Email provider** | Resend (already wired at `app/api/contact/route.ts`) | Existing integration; reliable for transactional; ~$0.001 per email |
| **SMS provider** | Twilio (gated to security alerts only in v1) | Industry default; ~$0.01 per SMS; bundled phone numbers |
| **Architecture** | Single `notifications` service module; typed triggers per event | Avoids scattered email-sending code; testable |

---

## 1. Goals

1. **One trigger function per event type.** `notifyTrialEnding(orgId)` knows recipients + template + channel.
2. **Channel preference per user.** Email + in-app + SMS toggles in `/admin/me?tab=profile` → `org_settings.notifications_pref`.
3. **In-app notification center** (already shipped schema in `seeds/267` — `org_notifications` table).
4. **Templated emails** with variable substitution. Operator-editable defaults at `/platform/settings`.
5. **Broadcast composer** at `/platform/broadcasts` with audience filtering + scheduling + delivery analytics.

### Non-goals

- Marketing email campaigns (use a dedicated tool — Customer.io, Mailchimp — later).
- Push notifications to mobile (Phase G / Phase H follow-up; Expo Push already supported in `mobile/`).
- WhatsApp / Discord / Slack as channels in v1.

---

## 2. Event taxonomy

Every triggerable customer-facing event:

| Event | Recipients | Email | In-app | SMS |
|---|---|---|---|---|
| `signup_welcome` | new admin | ✓ | ✓ | — |
| `invite_sent` | invited user | ✓ | — | — |
| `invite_accepted` | inviter + org admins | — | ✓ | — |
| `user_role_changed` | the user | ✓ | ✓ | — |
| `user_removed` | the user | ✓ | — | — |
| `password_reset` | user | ✓ | — | — |
| `mfa_enabled` | user | ✓ | ✓ | — |
| `trial_ending_d7` | billing contact | ✓ | ✓ | — |
| `trial_ending_d3` | billing contact | ✓ | ✓ | — |
| `trial_ending_d1` | billing contact | ✓ | ✓ | — |
| `trial_converted` | billing contact + org admins | ✓ | ✓ | — |
| `trial_expired` | billing contact | ✓ | ✓ | — |
| `payment_failed` | billing contact | ✓ | ✓ | — |
| `payment_recovered` | billing contact | ✓ | ✓ | — |
| `subscription_canceled` | billing contact + org admins | ✓ | ✓ | — |
| `plan_changed` | billing contact | ✓ | ✓ | — |
| `quota_warning_80` | org admins | — | ✓ | — |
| `quota_exhausted_100` | org admins | ✓ | ✓ | — |
| `release_published` | all org users with the bundle | per-pref | ✓ | — |
| `maintenance_scheduled` | all org users | ✓ | ✓ | — |
| `ticket_replied_to_customer` | requester + subscribers | ✓ | ✓ | — |
| `ticket_assigned_to_operator` | operator | — | ✓ | — |
| `security_alert_login_new_device` | user | ✓ | ✓ | opt-in |
| `security_alert_role_escalated` | all org admins | ✓ | ✓ | opt-in |
| `security_alert_impersonation` | org admins (per-org opt-out) | ✓ | ✓ | — |
| `broadcast` | per-audience filter | ✓ | ✓ | — |

Channel column shows defaults; user prefs override per-user.

---

## 3. Service architecture

```ts
// lib/saas/notifications/index.ts

export interface NotificationContext {
  orgId?: string;
  userEmail?: string;
  payload: Record<string, unknown>;
}

export async function dispatch(
  event: NotificationEvent,
  ctx: NotificationContext,
): Promise<void> {
  const def = EVENT_DEFINITIONS[event];
  const recipients = await def.resolveRecipients(ctx);
  for (const r of recipients) {
    const prefs = await getUserPrefs(r.email);
    if (def.channels.email && (prefs.email[event] ?? def.defaults.email)) {
      await dispatchEmail(r, def.template, ctx.payload);
    }
    if (def.channels.inApp && (prefs.inApp[event] ?? def.defaults.inApp)) {
      await dispatchInApp(r, def.title(ctx.payload), def.body(ctx.payload), ctx);
    }
    if (def.channels.sms && (prefs.sms[event] ?? def.defaults.sms)) {
      await dispatchSMS(r, def.smsTemplate(ctx.payload));
    }
  }
}
```

Each event is a typed module under `lib/saas/notifications/events/`:

```
lib/saas/notifications/
  index.ts                   ← dispatch()
  email.ts                   ← Resend adapter
  in-app.ts                  ← writes to org_notifications + fires WebSocket
  sms.ts                     ← Twilio adapter
  preferences.ts             ← getUserPrefs / setUserPrefs
  templates/
    welcome.html
    invite.html
    trial-ending.html
    payment-failed.html
    …
  events/
    signup_welcome.ts
    invite_sent.ts
    trial_ending_d7.ts
    …
```

Each event file exports a typed object with `resolveRecipients`, `channels` (allowed), `defaults` (per-channel), `template`, `title()`, `body()`, `smsTemplate()`.

---

## 4. Template system

HTML email templates use Handlebars (lightweight, no React-server-rendering overhead for emails). Stored as `.html` files. Operator-editable copies in `email_templates(event_type, subject_tpl, body_tpl)` table take precedence.

```sql
CREATE TABLE IF NOT EXISTS public.email_templates (
  event_type   TEXT PRIMARY KEY,
  subject_tpl  TEXT NOT NULL,
  body_tpl     TEXT NOT NULL,                 -- Handlebars HTML
  updated_by   TEXT REFERENCES public.operator_users(email),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

Variables exposed in every template: `{{org.name}}`, `{{user.name}}`, `{{user.email}}`, `{{cta.url}}`, `{{cta.label}}`, plus event-specific (e.g. `{{trial.days_remaining}}`, `{{invoice.amount}}`).

---

## 5. Broadcast composer

Operator at `/platform/broadcasts/new`:

```
┌──────────────────────────────────────────────────────────────────┐
│ New broadcast                                                      │
├──────────────────────────────────────────────────────────────────┤
│ Audience:                                                          │
│   ( ) All organizations                                            │
│   ( ) Specific plans:    [✓] Recon  [_] Draft  [_] Office  …       │
│   ( ) Specific bundles:  [_] cad  [_] research  …                  │
│   ( ) Specific orgs:     [+ Add organizations]                     │
│   ( ) By tag:            [texas-only_______________________]       │
│                                                                    │
│ Channels: [✓] In-app banner   [✓] Email                            │
│                                                                    │
│ Subject:  [_____________________________________________]          │
│                                                                    │
│ Body (Markdown):                                                   │
│ [_____________________________________________________________]    │
│ [_____________________________________________________________]    │
│                                                                    │
│ Schedule: ( ) Send now   ( ) Send at [2026-05-13 14:00 CT]         │
│                                                                    │
│ Preview audience: 24 organizations · 89 users                      │
│                                                                    │
│ [Cancel] [Save draft] [Schedule] [Send now]                        │
└──────────────────────────────────────────────────────────────────┘
```

Broadcast history at `/platform/broadcasts`:

```sql
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composer_email  TEXT NOT NULL REFERENCES public.operator_users(email),
  subject         TEXT NOT NULL,
  body_markdown   TEXT NOT NULL,
  audience_filter JSONB NOT NULL,                  -- {plans:[], bundles:[], orgs:[], tag:""}
  channels        TEXT[] NOT NULL,                 -- ['email','in_app']
  status          TEXT NOT NULL DEFAULT 'draft',   -- draft / scheduled / sent / canceled
  scheduled_for   TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  audience_count_snapshot INT,
  delivery_counts JSONB DEFAULT '{}',              -- {sent, opened, clicked, bounced}
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. Phased delivery

Maps to master plan Phase F. ~2 weeks.

| Slice | Description | Estimate | Status |
|---|---|---|---|
| **F-1** | `lib/saas/notifications/*` service skeleton + types | 2 days | ✅ Shipped — `lib/saas/notifications/index.ts` |
| **F-2** | Email adapter (Resend) + base templates (welcome, invite, password-reset) | 2 days | ✅ Shipped — `lib/saas/notifications/{email,templates,events}.ts` + 22 vitest cases |
| **F-3** | In-app adapter + WebSocket fanout | 2 days | ✅ DB-write half shipped — `lib/saas/notifications/in-app.ts` writes to `org_notifications` via supabaseAdmin. WebSocket fanout deferred to the slice that builds the bell-icon UI consumer (the existing /api/ws/ticket is research-pipeline-specific; a generic per-user channel lands with the consumer). |
| **F-4** | User preferences UI in /admin/me?tab=profile | 1 day |
| **F-5** | Lifecycle event triggers wired (trial-ending, payment-failed, etc.) — fires from existing Stripe webhook + scheduled crons | 3 days |
| **F-6** | Operator broadcast composer + history at /platform/broadcasts | 3 days |
| **F-7** | Operator email-template editor at /platform/settings | 2 days |
| **F-8** | SMS adapter (Twilio) + security-alert event wiring | 2 days |

**Total: ~2 weeks**.

---

## 7. Open questions

1. **Operator-editable templates default**. Ship with defaults baked in, or require operator authoring before any email fires? Recommend defaults + operator can override.
2. **Email throttling**. Cap broadcasts at N emails per minute to avoid Resend rate limits. Recommend 100/min, configurable.
3. **Unsubscribe legal requirement**. CAN-SPAM compliance — all marketing emails need an unsubscribe link. Transactional emails (security alerts, password reset) are exempt. Recommend unsubscribe link on broadcasts + release notes; not on lifecycle emails.
4. **SMS opt-in flow**. Customer must enroll phone number + verify (Twilio Verify). Recommend yes; security alerts only.

---

## 8. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Broadcast sent to wrong audience | Medium | Audience-count preview before send + 5-min cooldown for the same audience |
| Email delivery rate hits Resend daily limit | Medium | Throttle broadcasts; alert operator at 80% of quota |
| Customer marks our domain as spam | High | DKIM + SPF + DMARC properly configured at `starrsoftware.com` DNS |
| SMS costs explode | Medium | Hard daily cap configured in Twilio; per-org SMS opt-in only |
| Template editor breaks production templates | Medium | Default templates always available as fallback; operator edits previewed before save |

---

## 9. Cross-references

- `STARR_SAAS_MASTER_PLAN.md` §5.3 (in-app messaging) + §5.4 (transactional)
- `OPERATOR_CONSOLE.md` §3.8 (broadcast composer)
- `CUSTOMER_PORTAL.md` §3.8 (in-app notifications)
- `seeds/267_saas_customer_portal_schema.sql` — `org_notifications` table
- `app/api/contact/route.ts` — existing Resend wiring
- `app/api/ws/ticket/route.ts` — extended for in-app notification fanout
