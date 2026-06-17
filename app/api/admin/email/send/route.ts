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
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface SendBody {
  to?: string;
  subject?: string;
  body?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

  const to = (body.to ?? '').trim();
  const subject = (body.subject ?? '').trim();
  const text = (body.body ?? '').trim();

  if (!to) return NextResponse.json({ error: 'Recipient (to) is required' }, { status: 400 });
  if (!isValidEmail(to)) {
    return NextResponse.json({ error: 'Recipient email looks invalid' }, { status: 400 });
  }
  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'Body is required' }, { status: 400 });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY || RESEND_API_KEY === 'your_resend_api_key') {
    // Dev mode — log + return success so the UI flow is reachable
    // without a live Resend key configured.
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] /admin/email/new send: from=${senderEmail} to=${to} subject=${subject}`);
    }
    return NextResponse.json({ success: true, dev: true });
  }

  try {
    const html = text
      .split(/\r?\n\r?\n/)
      .map((para) => `<p>${escapeHtml(para).replace(/\r?\n/g, '<br>')}</p>`)
      .join('');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Starr Surveying <noreply@starr-surveying.com>',
        to: [to],
        reply_to: senderEmail,
        subject,
        text,
        html,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('[admin/email/send] Resend error:', error);
      return NextResponse.json(
        { error: 'Failed to send email — service error' },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error('[admin/email/send] threw:', err);
    return NextResponse.json(
      { error: 'Failed to send email — network error' },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}, { routeName: 'admin/email/send' });

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
