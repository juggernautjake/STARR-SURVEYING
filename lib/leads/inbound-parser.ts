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
 *  missing the must-have bits (a sender + a reference number). */
export function parseInbound(payload: InboundPayload): ParsedInbound | null {
  const fromEmail = extractFromEmail(payload);
  const referenceNumber = extractReferenceNumber(payload);
  if (!fromEmail || !referenceNumber) return null;
  return {
    fromEmail,
    subject: typeof payload.subject === 'string' ? payload.subject : '',
    bodyText: extractBodyText(payload),
    bodyHtml: extractBodyHtml(payload),
    messageId: extractMessageId(payload),
    referenceNumber,
  };
}
