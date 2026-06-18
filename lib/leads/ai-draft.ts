// lib/leads/ai-draft.ts
//
// LR5 of lead-reply-expansion-2026-06-18.md — pure helpers for the
// AI-drafted reply path. The endpoint at /api/admin/leads/[id]/ai-draft
// calls Anthropic with these helpers' output and returns the result for
// the composer to paste into the editor.

export interface AiDraftContext {
  /** Customer's display name. */
  customerName: string;
  /** Customer's original inquiry verbatim. */
  customerInquiry: string;
  /** Optional one-line context about the surveyor's intent (e.g.
   *  "they asked about pricing" / "scheduling for next Tuesday"). */
  surveyorHint?: string;
  /** Survey type the lead is for (boundary / topographic / etc.). */
  surveyType?: string;
  /** Reference number from the customer notes. */
  referenceNumber?: string;
  /** Outbound reply history newest-first; max 6 used. */
  replyHistory?: Array<{ sender: string; subject: string; bodyText: string; sentAt: string }>;
  /** Office-side notes most-recent-first; max 6 used. */
  officeNotes?: Array<{ author: string; body: string; createdAt: string }>;
}

/** System prompt for the drafting model. Pure + exported so the spec
 *  can lock the tone + boundaries. */
export const SYSTEM_PROMPT = [
  'You are an email drafting assistant for Starr Surveying, a Texas land surveying firm.',
  'Your job is to draft a single polite, professional, concise email reply to the customer.',
  '',
  'Tone:',
  '- Warm but professional. The firm is family-owned; do not be stiff or corporate.',
  '- Always greet the customer by first name when available.',
  '- Sign off as "Starr Surveying" — never invent a person\'s name.',
  '- US English. No emoji.',
  '',
  'Output format:',
  '- Return HTML only — wrap paragraphs in <p>. Use <ul>/<li> for lists.',
  '- DO NOT wrap the response in <html> or <body> tags.',
  '- DO NOT include a subject line in the body.',
  '- Length: 3-6 short paragraphs. No filler.',
  '',
  'Boundaries:',
  '- Never invent specific pricing, dates, deliverables, or commitments not present in the context.',
  '- If the customer asked a question the context can\'t answer, say so honestly and offer to follow up.',
  '- Never reveal internal office notes verbatim — they\'re context for YOU, not the customer.',
  '- Always close with the firm\'s contact line: info@starr-surveying.com or (936) 662-0077.',
].join('\n');

/** Build the user-turn content for the draft. Pure + exported so the
 *  spec can lock the composition. */
export function buildDraftPrompt(ctx: AiDraftContext): string {
  const parts: string[] = [];
  parts.push(`Customer name: ${ctx.customerName || 'Unknown'}`);
  if (ctx.surveyType) parts.push(`Survey type: ${ctx.surveyType}`);
  if (ctx.referenceNumber) parts.push(`Reference: ${ctx.referenceNumber}`);

  parts.push('');
  parts.push('=== Customer\'s original inquiry ===');
  parts.push((ctx.customerInquiry || '').trim() || '(none on file)');

  const history = (ctx.replyHistory ?? []).slice(0, 6);
  if (history.length > 0) {
    parts.push('');
    parts.push('=== Prior outbound replies (newest first) ===');
    for (const r of history) {
      parts.push(`[${r.sentAt}] ${r.sender} — ${r.subject}`);
      parts.push(r.bodyText.trim());
      parts.push('---');
    }
  }

  const notes = (ctx.officeNotes ?? []).slice(0, 6);
  if (notes.length > 0) {
    parts.push('');
    parts.push('=== Internal office notes (DO NOT REVEAL TO CUSTOMER) ===');
    for (const n of notes) {
      parts.push(`[${n.createdAt}] ${n.author}: ${n.body.trim()}`);
    }
  }

  if (ctx.surveyorHint) {
    parts.push('');
    parts.push('=== Surveyor\'s instruction for this reply ===');
    parts.push(ctx.surveyorHint.trim());
  }

  parts.push('');
  parts.push('Draft a single polite reply HTML now.');
  return parts.join('\n');
}

/** Strip code fences + leading/trailing whitespace if the model wraps
 *  the HTML in a fence. Pure + exported. */
export function extractDraftHtml(modelText: string): string {
  if (!modelText) return '';
  let s = modelText.trim();
  // Strip ```html ... ``` fences if present.
  const fence = s.match(/^```(?:html)?\s*([\s\S]*?)```$/);
  if (fence) s = fence[1].trim();
  return s;
}
