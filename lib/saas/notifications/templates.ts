// lib/saas/notifications/templates.ts
//
// File-local default email + SMS templates. Operator-editable copies
// in public.email_templates override these at dispatch time (lookup
// happens in events/<name>.ts).
//
// Templates use {{var}} substitution (see ./email.ts:renderTemplate).
// Markup is intentionally minimal — Resend renders well-formed HTML
// faithfully; complex layouts can land later. Plain-text alternative
// is provided for each so deliverability passes the SpamAssassin
// "has-text-version" test.
//
// Spec: docs/planning/in-progress/CUSTOMER_MESSAGING_PLAN.md §4.

import type { TemplateDef } from './email';

const FOOTER_HTML = `
  <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
  <p style="font-family: Inter, sans-serif; font-size: 12px; color: #6B7280;">
    Starr Software · Belton, TX · <a href="https://starrsoftware.com" style="color:#1D3095;">starrsoftware.com</a>
  </p>
`;

const FOOTER_TEXT = `
—
Starr Software · Belton, TX
https://starrsoftware.com
`;

// ── signup_welcome ─────────────────────────────────────────────────────

export const SIGNUP_WELCOME: TemplateDef = {
  subject: 'Welcome to Starr Software, {{user.name}}',
  html: `
    <div style="font-family: Inter, sans-serif; max-width: 600px;">
      <h1 style="font-family: Sora, sans-serif; color: #1D3095;">Welcome aboard.</h1>
      <p>Hi {{user.name}},</p>
      <p>
        Your firm — <strong>{{org.name}}</strong> — is set up on Starr Software.
        You're on a 14-day free trial of {{plan.label}}; no card on file yet.
      </p>
      <p>
        <a href="{{org.url}}/admin/me" style="display:inline-block; padding:10px 20px; background:#1D3095; color:#FFF; border-radius:6px; text-decoration:none;">
          Open your admin shell →
        </a>
      </p>
      <p style="color:#6B7280;">
        A few things to do first:
      </p>
      <ul style="color:#6B7280;">
        <li>Invite a teammate from <a href="{{org.url}}/admin/users">/admin/users</a></li>
        <li>Set your org branding at <a href="{{org.url}}/admin/settings">/admin/settings</a></li>
        <li>Add your payment method before trial ends</li>
      </ul>
      <p>If you get stuck, hit the support button in the admin shell — we'll respond fast.</p>
      ${FOOTER_HTML}
    </div>
  `,
  text: `
Welcome to Starr Software, {{user.name}}.

Your firm — {{org.name}} — is set up. 14-day free trial of {{plan.label}}, no card on file yet.

Open your admin shell: {{org.url}}/admin/me

A few things to do first:
  • Invite a teammate: {{org.url}}/admin/users
  • Set org branding: {{org.url}}/admin/settings
  • Add payment method before trial ends

Stuck? Hit the support button — we'll respond fast.

${FOOTER_TEXT}
  `.trim(),
};

// ── invite_sent ────────────────────────────────────────────────────────

export const INVITE_SENT: TemplateDef = {
  subject: '{{inviter.name}} invited you to {{org.name}} on Starr Software',
  html: `
    <div style="font-family: Inter, sans-serif; max-width: 600px;">
      <h1 style="font-family: Sora, sans-serif; color: #1D3095;">You're invited.</h1>
      <p>
        {{inviter.name}} ({{inviter.email}}) has invited you to join
        <strong>{{org.name}}</strong> on Starr Software as a {{invite.role}}.
      </p>
      <p>
        <a href="{{invite.url}}" style="display:inline-block; padding:10px 20px; background:#1D3095; color:#FFF; border-radius:6px; text-decoration:none;">
          Accept invitation →
        </a>
      </p>
      <p style="color:#6B7280; font-size:13px;">
        This link expires in 7 days. If you don't know {{inviter.name}}, you can safely ignore this email.
      </p>
      ${FOOTER_HTML}
    </div>
  `,
  text: `
{{inviter.name}} invited you to {{org.name}} on Starr Software.

Role: {{invite.role}}

Accept: {{invite.url}}

Link expires in 7 days. If you don't recognize {{inviter.name}}, you can safely ignore this.

${FOOTER_TEXT}
  `.trim(),
};

// ── password_reset ─────────────────────────────────────────────────────

export const PASSWORD_RESET: TemplateDef = {
  subject: 'Reset your Starr Software password',
  html: `
    <div style="font-family: Inter, sans-serif; max-width: 600px;">
      <h1 style="font-family: Sora, sans-serif; color: #1D3095;">Reset your password</h1>
      <p>
        We received a request to reset the password for the Starr Software account
        associated with {{user.email}}.
      </p>
      <p>
        <a href="{{reset.url}}" style="display:inline-block; padding:10px 20px; background:#1D3095; color:#FFF; border-radius:6px; text-decoration:none;">
          Reset password →
        </a>
      </p>
      <p style="color:#6B7280; font-size:13px;">
        This link expires in 60 minutes and is single-use. If you didn't request a reset,
        you can safely ignore this email — your password won't change.
      </p>
      ${FOOTER_HTML}
    </div>
  `,
  text: `
Reset your Starr Software password.

We received a request to reset the password for {{user.email}}.

Reset link (expires in 60 minutes, single-use):
  {{reset.url}}

If you didn't request a reset, you can safely ignore this — your password won't change.

${FOOTER_TEXT}
  `.trim(),
};

// ── trial_ending_d7 ─────────────────────────────────────────────────────

export const TRIAL_ENDING_D7: TemplateDef = {
  subject: 'Your Starr Software trial ends in 7 days',
  html: `
    <div style="font-family: Inter, sans-serif; max-width: 600px;">
      <h1 style="font-family: Sora, sans-serif; color: #1D3095;">7 days left in your trial</h1>
      <p>
        Hi {{user.name}}, your free trial of {{plan.label}} on Starr Software ends on
        <strong>{{trial.ends_at}}</strong>.
      </p>
      <p>
        Add a payment method now to keep access uninterrupted. We'll charge {{plan.amount}}
        per month starting {{trial.ends_at}}; cancel any time.
      </p>
      <p>
        <a href="{{org.url}}/admin/billing" style="display:inline-block; padding:10px 20px; background:#1D3095; color:#FFF; border-radius:6px; text-decoration:none;">
          Add payment method →
        </a>
      </p>
      ${FOOTER_HTML}
    </div>
  `,
  text: `
7 days left in your Starr Software trial.

Hi {{user.name}}, your free trial of {{plan.label}} ends on {{trial.ends_at}}.

Add a payment method to keep access uninterrupted: {{org.url}}/admin/billing

We'll charge {{plan.amount}} per month starting {{trial.ends_at}}; cancel any time.

${FOOTER_TEXT}
  `.trim(),
};

// ── payment_failed ─────────────────────────────────────────────────────

export const PAYMENT_FAILED: TemplateDef = {
  subject: 'Payment issue with your Starr Software subscription',
  html: `
    <div style="font-family: Inter, sans-serif; max-width: 600px;">
      <h1 style="font-family: Sora, sans-serif; color: #BD1218;">Payment couldn't go through</h1>
      <p>
        Hi {{user.name}}, the most recent payment for {{org.name}}'s {{plan.label}}
        subscription ({{invoice.amount}}) didn't process.
      </p>
      <p>
        Common causes: expired card, insufficient funds, or your bank flagged the
        charge as unusual. Stripe will automatically retry over the next 7 days.
      </p>
      <p>
        <a href="{{org.url}}/admin/billing" style="display:inline-block; padding:10px 20px; background:#BD1218; color:#FFF; border-radius:6px; text-decoration:none;">
          Update payment method →
        </a>
      </p>
      <p style="color:#6B7280; font-size:13px;">
        If we can't recover the payment within 7 days, your access switches to read-only
        while you sort it out. No data is lost.
      </p>
      ${FOOTER_HTML}
    </div>
  `,
  text: `
Payment issue with your Starr Software subscription.

The most recent payment for {{org.name}}'s {{plan.label}} subscription ({{invoice.amount}}) didn't process.

Update payment method: {{org.url}}/admin/billing

Stripe will automatically retry over the next 7 days. If we can't recover, your access switches to read-only — no data is lost.

${FOOTER_TEXT}
  `.trim(),
};
