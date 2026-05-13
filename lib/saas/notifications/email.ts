// lib/saas/notifications/email.ts
//
// Resend email adapter for the notifications service. Mirrors the
// pattern already in use at app/api/contact/route.ts:968 (direct
// fetch to api.resend.com — no SDK so the bundle stays small).
//
// Renders templates via a simple {{var}} substitution (no Handlebars
// dep). Operator-editable templates in public.email_templates take
// precedence over the file-local defaults; falls back to the literal
// strings in templates.ts when nothing is in the DB.
//
// Spec: docs/planning/in-progress/CUSTOMER_MESSAGING_PLAN.md §3 + §4.

import type { EmailDispatchInput } from './index';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Starr Software <noreply@starrsoftware.com>';
const DEFAULT_REPLY_TO = 'support@starrsoftware.com';

/** Send one email via Resend. Returns true on 2xx, false on any
 *  failure. Errors are logged but never thrown — caller decides
 *  whether to retry. */
export async function sendEmailViaResend(input: EmailDispatchInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  // Dev-mode short-circuit: log the email but don't actually send when
  // no key is configured. Matches the existing contact-route behavior
  // so dev runs don't spam Resend.
  if (!apiKey || apiKey === 'your_resend_api_key') {
    if (typeof console !== 'undefined') {
      console.info('[notifications/email] DEV mode (no RESEND_API_KEY) — would send:', {
        to: input.to,
        subject: input.subject,
      });
    }
    return true;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [input.to],
        reply_to: input.replyTo ?? DEFAULT_REPLY_TO,
        subject: input.subject,
        html: input.html,
        text: input.text,
        tags: tagsToResend(input.tags),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'unknown' }));
      if (typeof console !== 'undefined') {
        console.error('[notifications/email] Resend API error', response.status, error);
      }
      return false;
    }
    return true;
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.error('[notifications/email] send failed', err);
    }
    return false;
  }
}

// Resend tag format: array of {name, value} pairs. Convert our flat
// Record into that shape; skip empty values.
function tagsToResend(tags?: Record<string, string>): { name: string; value: string }[] | undefined {
  if (!tags) return undefined;
  const out: { name: string; value: string }[] = [];
  for (const [name, value] of Object.entries(tags)) {
    if (!value) continue;
    // Resend tag names are limited to [a-zA-Z0-9_-]; sanitize.
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const safeValue = value.slice(0, 256);
    out.push({ name: safeName, value: safeValue });
  }
  return out.length > 0 ? out : undefined;
}

// ── Template rendering ─────────────────────────────────────────────────

/** Substitutes {{var}} placeholders with values from `vars`. Missing
 *  keys leave the placeholder in place — surfacing them is more useful
 *  than silently rendering empty. Whitespace around the variable name
 *  is tolerated: `{{ user.name }}` works. */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in acc) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, vars);
    if (value === undefined || value === null) return `{{${path}}}`;
    return String(value);
  });
}

/** Renders a (subject, html, text) triple from a template definition.
 *  Either side can be empty; consumers handle plain-text-only or
 *  HTML-only templates. */
export interface TemplateDef {
  subject: string;
  html: string;
  text?: string;
}

export function renderTemplateDef(def: TemplateDef, vars: Record<string, unknown>): {
  subject: string; html: string; text?: string;
} {
  return {
    subject: renderTemplate(def.subject, vars),
    html: renderTemplate(def.html, vars),
    text: def.text ? renderTemplate(def.text, vars) : undefined,
  };
}
