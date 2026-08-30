// app/api/admin/email/send/route.ts
//
// employee-pond Slice E9c — admin-only "send an email to an
// employee" endpoint backing the /admin/email/new composer page.
// Models the Resend integration from app/api/contact/route.ts.
//
// Auth: any signed-in admin user. Body: { to, subject, body }. The
// sender's email becomes the `reply_to` so a recipient hitting
// "Reply" lands on the actual sender, not the noreply alias.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin, ALL_ROLES } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { orgIdForSession } from '@/lib/saas/org-scope-context';
import { getTenantProfile } from '@/lib/saas/tenant-profile';
import { outboundIdentity } from '@/lib/email/sender';

interface SendBody {
  to?: string;        // one address, or several separated by , ; or newlines
  role?: string;      // optional: expand to all (non-banned) users with this role
  subject?: string;
  body?: string;
}

// EM4 — guard against accidental blasts. A hard cap the route enforces; the
// composer also confirms the count before posting.
const MAX_RECIPIENTS = 100;

/** EM5 — best-effort audit row; never blocks/fails the send if logging errors. */
async function logEmailSend(row: {
  sender_email: string;
  subject: string;
  role: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  recipients: string[];
}): Promise<void> {
  try {
    await supabaseAdmin.from('email_send_log').insert(row);
  } catch { /* logging must never break a send */ }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Split a free-text recipient field on commas / semicolons / whitespace. */
function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const senderEmail = session.user.email;

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subject = (body.subject ?? '').trim();
  const text = (body.body ?? '').trim();
  const role = (body.role ?? '').trim();

  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'Body is required' }, { status: 400 });

  // ── Build the recipient set: free-text addresses + optional role expansion ──
  const recipientSet = new Set<string>();
  for (const addr of parseRecipients(body.to ?? '')) {
    if (!isValidEmail(addr)) {
      return NextResponse.json({ error: `Recipient email looks invalid: ${addr}` }, { status: 400 });
    }
    recipientSet.add(addr);
  }

  if (role) {
    if (!(ALL_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: `Unknown role: ${role}` }, { status: 400 });
    }
    const { data: roleUsers, error: roleErr } = await supabaseAdmin
      .from('registered_users')
      .select('email, is_banned, roles')
      .contains('roles', [role]);
    if (roleErr) {
      return NextResponse.json({ error: 'Failed to expand role recipients' }, { status: 500 });
    }
    for (const u of (roleUsers || []) as { email?: string; is_banned?: boolean }[]) {
      if (u.email && !u.is_banned && isValidEmail(u.email)) recipientSet.add(u.email);
    }
  }

  const recipients = [...recipientSet];
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Too many recipients (${recipients.length}). Max ${MAX_RECIPIENTS} per send.` },
      { status: 400 },
    );
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY || RESEND_API_KEY === 'your_resend_api_key') {
    // ── IN PRODUCTION: RECORD THE ATTEMPT HONESTLY, AND SAY IT FAILED ──────────────────────────
    //
    // Found 2026-08-29 sweeping every direct Resend caller. Of the seven, four already reported an
    // unconfigured key honestly (they capture `send_error` and return it). This one did not, and it
    // was the worst-shaped of the set:
    //
    //   · it wrote an email-send record claiming `sent_count: recipients.length, failed_count: 0`
    //     — a PERMANENT FALSE RECORD of a delivery that did not happen, and
    //   · it returned `success: true`, so the admin who just composed the message is told it went.
    //
    // `dev: true` was in the response, but a flag the UI does not read is not a disclosure, and the
    // log row was already false by the time anybody could act on it.
    //
    // The route's own convention for "the mail service let us down" is a 502 (see the failure path
    // below), so that is what this returns. The attempt is still logged, because it did happen —
    // just with the counts the other way round, which is the difference between a record and a
    // claim.
    if (process.env.NODE_ENV === 'production') {
      const why = RESEND_API_KEY ? 'RESEND_API_KEY is still the placeholder value' : 'RESEND_API_KEY is missing';
      console.error(`[admin/email/send] NOT SENT to ${recipients.length} recipient(s) — ${why}.`);
      await logEmailSend({
        sender_email: senderEmail, subject, role: role || null,
        recipient_count: recipients.length, sent_count: 0, failed_count: recipients.length,
        recipients,
      });
      return NextResponse.json(
        { error: `Email was not sent — ${why}. Nothing was delivered.`, failed: recipients },
        { status: 502 },
      );
    }

    // Dev mode — log + return success so the UI flow is reachable
    // without a live Resend key configured.
    console.log(`[DEV] /admin/email/new send: from=${senderEmail} to=${recipients.join(', ')} subject=${subject}`);
    await logEmailSend({
      sender_email: senderEmail, subject, role: role || null,
      recipient_count: recipients.length, sent_count: recipients.length, failed_count: 0,
      recipients,
    });
    return NextResponse.json({ success: true, dev: true, sent_count: recipients.length, recipients });
  }

  const html = text
    .split(/\r?\n\r?\n/)
    .map((para) => `<p>${escapeHtml(para).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');

  // Send one message per recipient so addresses are never disclosed to the
  // others (important for customer privacy on a multi-send). Failures are
  // collected rather than aborting the whole batch.
  // The firm's name on a no-reply envelope; the human sender stays the reply-to below, which is what
  // the header comment on this route already describes (audit item 8h).
  const sender = outboundIdentity(await getTenantProfile(orgIdForSession(session)), { noreply: true });

  const failed: string[] = [];
  await Promise.all(recipients.map(async (addr) => {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: sender.from,
          to: [addr],
          reply_to: senderEmail,
          subject,
          text,
          html,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error(`[admin/email/send] Resend error for ${addr}:`, error);
        failed.push(addr);
      }
    } catch (err) {
      console.error(`[admin/email/send] threw for ${addr}:`, err);
      failed.push(addr);
    }
  }));

  const sentCount = recipients.length - failed.length;
  await logEmailSend({
    sender_email: senderEmail, subject, role: role || null,
    recipient_count: recipients.length, sent_count: sentCount, failed_count: failed.length,
    recipients,
  });
  if (sentCount === 0) {
    return NextResponse.json({ error: 'Failed to send email — service error', failed }, { status: 502 });
  }
  return NextResponse.json({ success: true, sent_count: sentCount, failed_count: failed.length, failed });
}, { routeName: 'admin/email/send' });

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
