// app/api/admin/leads/[id]/reply/route.ts
//
// lead-reply-2026-06-18 — admin Reply composer endpoint.
//
//   POST  /api/admin/leads/{id}/reply   multipart/form-data
//   GET   /api/admin/leads/{id}/reply   → { replies: LeadReply[] }
//
// POST accepts:
//   - subject:   string
//   - bodyHtml:  string   (rendered from the rich editor)
//   - bodyText:  string?  (optional plain-text fallback)
//   - to:        string?  (override; defaults to lead.email)
//   - attachments[]: File (zero or more)
//
// Flow:
//   1. Auth: admin only.
//   2. Load lead + figure out the recipient email.
//   3. Fan out to Resend (from "Starr Surveying <info@starr-surveying.com>",
//      reply-to info@, attachments as base64).
//   4. Always record a row in `public.lead_replies` — successful sends
//      get the resend_id; failures get the send_error so the office can
//      see why a reply didn't go out.
//
// GET returns the per-lead reply history newest-first for rendering
// the Sent Replies section on the lead detail page.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  signLeadAttachmentUrls,
  uploadLeadAttachments,
} from '@/lib/leads/intake';

interface ResendAttachment {
  filename: string;
  content: string;
}

interface LeadRow {
  id: string;
  name: string | null;
  email: string | null;
}

interface LeadReplyRow {
  id: string;
  lead_id: string;
  sender_email: string;
  to_email: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  attachments: Array<{ name: string; size: number }>;
  resend_id: string | null;
  send_error: string | null;
  sent_at: string;
}

function leadIdFromPath(req: NextRequest): string | null {
  // Path is /api/admin/leads/{id}/reply. The second-to-last segment is
  // the lead id (with `withErrorHandler` skipping ctx.params).
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idIdx = segments.indexOf('reply') - 1;
  return idIdx >= 0 ? segments[idIdx] : null;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { error: null as null, session };
}

// ── GET ──────────────────────────────────────────────────────────────────────
export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const leadId = leadIdFromPath(req);
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('lead_replies')
    .select('id, lead_id, sender_email, to_email, subject, body_html, body_text, attachments, resend_id, send_error, sent_at')
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // LR2 — replace each reply's raw storage_path attachments with
  // short-lived signed URLs so the history view can render a
  // working download link without exposing the bucket. Failures fall
  // through to metadata-only chips (existing UI contract).
  const rows = (data ?? []) as LeadReplyRow[];
  const replies = await Promise.all(
    rows.map(async (r) => {
      const signed = await signLeadAttachmentUrls(
        supabaseAdmin.storage,
        r.attachments ?? [],
      );
      return { ...r, attachments: signed };
    }),
  );
  return NextResponse.json({ replies });
}, { routeName: 'admin/leads/[id]/reply' });

// ── POST ─────────────────────────────────────────────────────────────────────
export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const senderEmail = gate.session!.user!.email!;

  const leadId = leadIdFromPath(req);
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

  // Parse multipart payload.
  let subject = '';
  let bodyHtml = '';
  let bodyText: string | null = null;
  let toOverride: string | null = null;
  const files: ResendAttachment[] = [];
  const fileSummaries: Array<{ name: string; size: number }> = [];
  // LR2 — carry raw bytes alongside the Resend-friendly base64 so the
  // upload-after-insert step can push them to the lead-attachments
  // bucket under `replies/<reply_id>/<uuid>-<name>`.
  const uploadable: Array<{
    name: string;
    size: number;
    bytes: Buffer;
    contentType: string;
  }> = [];

  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const json = (await req.json()) as Record<string, unknown>;
    subject = String(json.subject ?? '').trim();
    bodyHtml = String(json.bodyHtml ?? '').trim();
    bodyText = typeof json.bodyText === 'string' ? json.bodyText : null;
    toOverride = typeof json.to === 'string' && json.to.trim() ? json.to.trim() : null;
  } else {
    const form = await req.formData();
    for (const [key, value] of form.entries()) {
      if (key === 'attachments' && value instanceof File) {
        const buf = Buffer.from(await value.arrayBuffer());
        fileSummaries.push({ name: value.name, size: buf.length });
        files.push({ filename: value.name, content: buf.toString('base64') });
        uploadable.push({
          name: value.name,
          size: buf.length,
          bytes: buf,
          contentType: value.type || 'application/octet-stream',
        });
      } else if (typeof value === 'string') {
        if (key === 'subject') subject = value.trim();
        else if (key === 'bodyHtml') bodyHtml = value.trim();
        else if (key === 'bodyText') bodyText = value;
        else if (key === 'to' && value.trim()) toOverride = value.trim();
      }
    }
  }

  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  if (!bodyHtml) return NextResponse.json({ error: 'Reply body is required' }, { status: 400 });

  // Resolve the recipient.
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('id, name, email')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const recipient = (toOverride ?? (lead as LeadRow).email ?? '').trim();
  if (!recipient) {
    return NextResponse.json(
      { error: 'No recipient email on the lead — supply `to` in the body or add an email to the lead.' },
      { status: 400 },
    );
  }

  // Send via Resend. Falls back to a dev-mode log when no key is set.
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  let resendId: string | null = null;
  let sendError: string | null = null;

  if (RESEND_API_KEY && RESEND_API_KEY !== 'your_resend_api_key') {
    try {
      const payload: Record<string, unknown> = {
        from: 'Starr Surveying <info@starr-surveying.com>',
        to: [recipient],
        reply_to: 'info@starr-surveying.com',
        subject,
        html: bodyHtml,
        text: bodyText ?? undefined,
      };
      if (files.length > 0) payload.attachments = files;
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { id?: string };
        resendId = typeof data.id === 'string' ? data.id : null;
      } else {
        const err = (await resp.json().catch(() => ({}))) as { message?: string };
        sendError = err.message ?? `Resend ${resp.status}`;
      }
    } catch (e) {
      sendError = e instanceof Error ? e.message : 'Network error sending reply';
    }
  } else {
    sendError = 'RESEND_API_KEY not configured (dev mode)';
    console.log(`[lead-reply] DEV — would send to ${recipient}: ${subject}`);
  }

  // Always record the reply — including failures — so the surveyor sees
  // what was attempted.
  const insertPayload = {
    lead_id: leadId,
    sender_email: senderEmail,
    to_email: recipient,
    subject,
    body_html: bodyHtml,
    body_text: bodyText,
    attachments: fileSummaries,
    resend_id: resendId,
    send_error: sendError,
  };

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('lead_replies')
    .insert(insertPayload)
    .select('id, sent_at')
    .single();

  if (insertErr) {
    // The send itself may have succeeded; surface the row-insert failure
    // separately so the UI can decide what to do.
    return NextResponse.json(
      {
        success: !sendError,
        sent: !sendError,
        sendError,
        rowError: insertErr.message,
      },
      { status: 500 },
    );
  }

  // LR2 — once the reply row exists, push the bytes into the
  // lead-attachments bucket under `replies/<reply_id>/...` and
  // backfill the row's attachments JSONB with the storage_path so
  // the history view's chips link to real downloads (via signed
  // URLs from GET). Failures fall through silently — the Resend
  // email is the legal record of what was sent.
  if (uploadable.length > 0 && inserted?.id) {
    try {
      const uploaded = await uploadLeadAttachments(
        supabaseAdmin.storage,
        leadId,
        uploadable,
        undefined,
        `replies/${inserted.id}`,
      );
      const { error: updateErr } = await supabaseAdmin
        .from('lead_replies')
        .update({ attachments: uploaded })
        .eq('id', inserted.id);
      if (updateErr) {
        console.error('[lead-reply] attachment backfill failed:', updateErr.message);
      }
    } catch (e) {
      console.error('[lead-reply] attachment upload threw:', e);
    }
  }

  if (sendError) {
    return NextResponse.json(
      {
        success: false,
        sent: false,
        sendError,
        replyId: inserted?.id,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    sent: true,
    replyId: inserted?.id,
    sentAt: inserted?.sent_at,
    resendId,
  });
}, { routeName: 'admin/leads/[id]/reply' });
