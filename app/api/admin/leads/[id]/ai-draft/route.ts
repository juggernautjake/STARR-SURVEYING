// app/api/admin/leads/[id]/ai-draft/route.ts
//
// LR5 of lead-reply-expansion-2026-06-18.md — Claude-drafted reply
// endpoint. Pulls the lead, the recent outbound reply history, and the
// recent office notes; builds a focused prompt; calls
// `claude-sonnet-4-6` once; returns the drafted HTML so the
// ReplyDialog can paste it into the editor.
//
//   POST /api/admin/leads/{id}/ai-draft   body: { surveyorHint?: string }
//        → { html: string, model: string }
//
// Auth: admin only. Returns 503 with `{ error: 'AI_DISABLED' }` when
// `ANTHROPIC_API_KEY` isn't set; the composer hides the AI Draft
// button when it sees that response.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  SYSTEM_PROMPT,
  buildDraftPrompt,
  extractDraftHtml,
  type AiDraftContext,
} from '@/lib/leads/ai-draft';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

function leadIdFromPath(req: NextRequest): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idIdx = segments.indexOf('ai-draft') - 1;
  return idIdx >= 0 ? segments[idIdx] : null;
}

function htmlToPlainText(html: string): string {
  return (html || '')
    .replace(/<\/?(p|br|div|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI_DISABLED', message: 'ANTHROPIC_API_KEY is not configured.' },
      { status: 503 },
    );
  }

  const leadId = leadIdFromPath(req);
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { surveyorHint?: unknown };
  const surveyorHint =
    typeof body.surveyorHint === 'string' && body.surveyorHint.trim().length > 0
      ? body.surveyorHint.trim()
      : undefined;

  // Load the lead.
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('id, name, notes, survey_type')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // Load recent reply history (newest first, capped at 6).
  const { data: replies } = await supabaseAdmin
    .from('lead_replies')
    .select('sender_email, subject, body_html, sent_at')
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: false })
    .limit(6);

  // Load recent office notes (newest first, capped at 6).
  const { data: notes } = await supabaseAdmin
    .from('lead_notes')
    .select('author_email, body, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(6);

  // Pull the reference number out of the customer's notes the same
  // way lib/leads/templates.ts extractRefNumber does.
  const refMatch = (lead.notes ?? '').match(/Ref:\s*(\S+)/);

  const ctx: AiDraftContext = {
    customerName: lead.name ?? '',
    customerInquiry: lead.notes ?? '',
    surveyType: lead.survey_type ?? undefined,
    referenceNumber: refMatch ? refMatch[1] : undefined,
    surveyorHint,
    replyHistory: (replies ?? []).map((r: { sender_email: string; subject: string; body_html: string; sent_at: string }) => ({
      sender: r.sender_email,
      subject: r.subject,
      bodyText: htmlToPlainText(r.body_html),
      sentAt: r.sent_at,
    })),
    officeNotes: (notes ?? []).map((n: { author_email: string; body: string; created_at: string }) => ({
      author: n.author_email,
      body: n.body,
      createdAt: n.created_at,
    })),
  };

  const userPrompt = buildDraftPrompt(ctx);

  const client = new Anthropic({ apiKey });
  let modelText = '';
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    for (const block of response.content) {
      if (block.type === 'text') modelText += block.text;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'AI request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const html = extractDraftHtml(modelText);
  return NextResponse.json({ html, model: MODEL });
}, { routeName: 'admin/leads/[id]/ai-draft' });
