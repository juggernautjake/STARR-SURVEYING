// app/api/webhooks/email-inbound/route.ts
//
// LR7 of lead-reply-expansion-2026-06-18.md — provider-agnostic
// inbound-email webhook. Resend Inbound, Postmark, SendGrid Inbound
// Parse, Mailgun Routes all POST broadly similar JSON; the parser at
// lib/leads/inbound-parser.ts normalises the field names, and this
// route writes a lead_replies row with `direction='inbound'` when a
// matching SS-… reference number is found.
//
// Auth: shared-secret header. Set `EMAIL_INBOUND_WEBHOOK_SECRET` in
// env; the provider sends it in the `X-Webhook-Secret` header. The
// route 401s when the secret is missing or doesn't match.
//
// Idempotency: the unique partial index on inbound_message_id (seed
// 322) prevents double-insert on webhook retries. We catch the
// 23505 conflict + return success so the provider stops retrying.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { parseInbound, type InboundPayload } from '@/lib/leads/inbound-parser';

const PG_UNIQUE_VIOLATION = '23505';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const secret = process.env.EMAIL_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Inbound webhook is not configured' },
      { status: 503 },
    );
  }
  const provided = req.headers.get('x-webhook-secret');
  // B1-3 — CONSTANT TIME. `provided !== secret` short-circuits at the first differing character, so the
  // time to reject leaks how much of the secret a caller has right. That is only worth exploiting
  // against an endpoint anyone can call as often as they like — which is exactly what a webhook is.
  //
  // The Stripe webhook beside this one already compares its signature this way; this one did not, and
  // the difference was not a decision anyone made.
  if (!provided || !timingSafeEqualStr(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: InboundPayload;
  try {
    payload = (await req.json()) as InboundPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = parseInbound(payload);
  if (!parsed) {
    // No SS reference found — drop politely. The provider should NOT
    // retry; respond 200 so it doesn't.
    return NextResponse.json({
      success: true,
      stored: false,
      reason: 'no_reference_number',
    });
  }

  // Find the lead the reference points at. The intake helper
  // prepends `Ref: SS-…` to lead.notes, so a LIKE on the prefix
  // pattern locates the row.
  const refPattern = `Ref: ${parsed.referenceNumber}%`;
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('id')
    .like('notes', refPattern)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadErr) {
    return NextResponse.json({ error: leadErr.message }, { status: 500 });
  }
  if (!lead) {
    // Unknown reference — log silently and 200 so retries stop.
    console.warn(`[email-inbound] no lead found for ${parsed.referenceNumber}`);
    return NextResponse.json({
      success: true,
      stored: false,
      reason: 'lead_not_found',
      reference: parsed.referenceNumber,
    });
  }

  const insertPayload = {
    lead_id: (lead as { id: string }).id,
    direction: 'inbound' as const,
    sender_email: parsed.fromEmail,
    from_email: parsed.fromEmail,
    to_email: 'info@starr-surveying.com',
    subject: parsed.subject,
    body_html: parsed.bodyHtml,
    body_text: parsed.bodyText,
    attachments: [],
    resend_id: null,
    send_error: null,
    inbound_message_id: parsed.messageId,
  };

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('lead_replies')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertErr) {
    // Webhook retry: the unique partial index on inbound_message_id
    // rejected the duplicate. Tell the provider success so it stops.
    if ((insertErr as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return NextResponse.json({
        success: true,
        stored: false,
        reason: 'duplicate',
      });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    stored: true,
    replyId: inserted?.id ?? null,
  });
}, { routeName: 'webhooks/email-inbound' });


/**
 * Constant-time string comparison.
 *
 * The length check is unavoidable and harmless: a secret's LENGTH is not the secret, and comparing
 * different-length strings byte-by-byte would either read past the end or leak through the loop bound.
 * Everything after it takes the same time whatever the contents are.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}