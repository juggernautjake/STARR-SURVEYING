// lib/leads/inbound-parser.ts
//
// LR7 of lead-reply-expansion-2026-06-18.md — pure helpers for
// parsing an inbound email payload (Resend Inbound, Postmark,
// SendGrid Inbound Parse, Mailgun Routes all post similar JSON
// shapes) into the bits the lead-replies inbound writer needs.
//
// The functions here are deliberately provider-agnostic — they take
// whatever JSON the webhook POSTed and try the common field names.

export interface InboundPayload {
  from?: string | { email?: string; address?: string; name?: string };
  to?: string | string[] | { email?: string }[];
  subject?: string;
  text?: string;
  html?: string;
  // Common provider variants
  HtmlBody?: string;       // Postmark
  TextBody?: string;       // Postmark
  email?: string;          // Mailgun stores from in `sender` or `From` too
  body_plain?: string;     // Mailgun
  body_html?: string;      // Mailgun
  messageId?: string;
  MessageID?: string;      // Postmark
  message_id?: string;     // Resend / SendGrid
  // Catch-all so we can scan for the SS ref in any string field.
  [key: string]: unknown;
}

export interface ParsedInbound {
  fromEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  messageId: string | null;
  referenceNumber: string | null;
}

const REF_RE = /\b(SS-\d{6,8}-[A-Z0-9-]{3,12})\b/;

/** Pure helper — pull the canonical sender email out of the provider's
 *  payload, falling back through the common field names. */
export function extractFromEmail(payload: InboundPayload): string {
  const raw = payload.from ?? (payload as { sender?: string }).sender;
  if (typeof raw === 'string') return parseAddress(raw);
  if (raw && typeof raw === 'object') {
    const obj = raw as { email?: string; address?: string };
    if (obj.email) return obj.email.toLowerCase();
    if (obj.address) return obj.address.toLowerCase();
  }
  if (typeof payload.email === 'string') return parseAddress(payload.email);
  return '';
}

/** Pure helper — strip "Display Name <addr@x>" wrappers + lowercase. */
export function parseAddress(raw: string): string {
  const angle = raw.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : raw).trim().toLowerCase();
  // Strip surrounding quotes that some providers add.
  return addr.replace(/^['"]|['"]$/g, '');
}

/** Pure helper — first text body the payload exposes. */
export function extractBodyText(payload: InboundPayload): string {
  return (
    typeof payload.text === 'string' ? payload.text
    : typeof payload.TextBody === 'string' ? payload.TextBody
    : typeof payload.body_plain === 'string' ? payload.body_plain
    : ''
  ).trim();
}

/** Pure helper — first HTML body the payload exposes (may be empty). */
export function extractBodyHtml(payload: InboundPayload): string | null {
  const raw =
    typeof payload.html === 'string' ? payload.html
    : typeof payload.HtmlBody === 'string' ? payload.HtmlBody
    : typeof payload.body_html === 'string' ? payload.body_html
    : null;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** LR9 QA pass — sanitize inbound email HTML before storing. The
 *  RepliesList renders inbound bodies via dangerouslySetInnerHTML, so
 *  a hostile customer email could otherwise inject a <script> tag or
 *  an `onerror=` handler and run JS in the surveyor's session.
 *
 *  This is a conservative, regex-based pass — not a full DOM parser
 *  (would require a heavy DOMPurify dep). It strips:
 *    - <script> / <style> / <iframe> / <object> / <embed> blocks
 *    - inline event handler attributes (on\w+=)
 *    - javascript: URIs anywhere in attribute values
 *    - data: URIs in src / href (covers data:text/html exfil)
 *
 *  Anything that gets past these patterns is bounded by the
 *  contentEditable / dangerouslySetInnerHTML render surface, which
 *  already prevents form submits + most exotic attack surfaces. Pure
 *  + exported so vitest can lock the strip rules. */
export function sanitizeInboundHtml(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input);

  // Strip dangerous tag blocks (including their contents).
  s = s.replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, '');
  // Strip self-closing / opening-only variants too (e.g. <iframe />).
  s = s.replace(/<\/?(script|style|iframe|object|embed)\b[^>]*>/gi, '');

  // Strip inline event handlers on any tag: onerror=, onclick=, etc.
  s = s.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Strip javascript: URIs (with or without quotes around the value).
  s = s.replace(/(href|src|action|formaction)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  s = s.replace(/(href|src|action|formaction)\s*=\s*javascript:[^\s>]+/gi, '$1="#"');

  // Strip data: URIs in src / href (covers data:text/html exfil and
  // most other inline-document tricks).
  s = s.replace(/(href|src)\s*=\s*(["'])\s*data:[^"']*\2/gi, '$1="#"');

  return s.trim() || null;
}

/** Pure helper — find an SS-… reference number anywhere in the
 *  payload's subject or body. Returns null when none is present;
 *  the webhook drops the message in that case so we don't write
 *  noise into the lead history. */
export function extractReferenceNumber(payload: InboundPayload): string | null {
  const subject = typeof payload.subject === 'string' ? payload.subject : '';
  const text = extractBodyText(payload);
  const html = extractBodyHtml(payload) ?? '';
  for (const haystack of [subject, text, html]) {
    const m = haystack.match(REF_RE);
    if (m) return m[1];
  }
  return null;
}

/** Pure helper — the provider's message id, falling back through the
 *  common field names. Used to dedupe webhook retries. */
export function extractMessageId(payload: InboundPayload): string | null {
  return (
    typeof payload.messageId === 'string' ? payload.messageId
    : typeof payload.MessageID === 'string' ? payload.MessageID
    : typeof payload.message_id === 'string' ? payload.message_id
    : null
  );
}

/** Full parse → ready to insert. Returns null when the payload is
 *  missing the must-have bits (a sender + a reference number).
 *  LR9 QA pass — the body html is passed through `sanitizeInboundHtml`
 *  before being returned so the row stored in `lead_replies` is
 *  already safe for the RepliesList's dangerouslySetInnerHTML render. */
export function parseInbound(payload: InboundPayload): ParsedInbound | null {
  const fromEmail = extractFromEmail(payload);
  const referenceNumber = extractReferenceNumber(payload);
  if (!fromEmail || !referenceNumber) return null;
  return {
    fromEmail,
    subject: typeof payload.subject === 'string' ? payload.subject : '',
    bodyText: extractBodyText(payload),
    bodyHtml: sanitizeInboundHtml(extractBodyHtml(payload)),
    messageId: extractMessageId(payload),
    referenceNumber,
  };
}
