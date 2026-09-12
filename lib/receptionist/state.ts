// lib/receptionist/state.ts — the conversation so far, carried in a cookie Twilio sends back.
//
// Vercel functions keep nothing between requests, and the repo applies database migrations by
// hand, so the receptionist keeps its per-call state where Twilio already keeps state for us:
// Twilio stores cookies set by a webhook response and returns them on every later webhook of the
// SAME call. That is exactly the lifetime a phone conversation needs and it costs no table.
//
// The cookie is deflate-compressed JSON, base64url. A cookie must stay under ~4 KB, so the turn
// list is trimmed from the front once it grows; the receptionist only needs recent context plus
// the facts it has already collected, which are kept separately and never trimmed.
import { deflateSync, inflateSync } from 'node:zlib';

export interface CallFacts {
  kind?: 'customer' | 'personal' | 'vendor' | 'unknown';
  name?: string;
  phone?: string;
  address?: string;
  service?: string;
  details?: string;
  leadId?: string;
  leadRef?: string;
}

export interface CallState {
  turns: Array<{ role: 'caller' | 'assistant'; text: string }>;
  facts: CallFacts;
  silence: number;   // consecutive empty Gather results
  started: number;   // epoch ms
}

export const COOKIE_NAME = 'starr_rcpt';
const MAX_COOKIE_BYTES = 3500;
const MAX_TURNS = 16;

export function emptyState(): CallState {
  return { turns: [], facts: {}, silence: 0, started: Date.now() };
}

export function encodeState(state: CallState): string {
  let s: CallState = { ...state, turns: state.turns.slice(-MAX_TURNS) };
  for (;;) {
    const out = deflateSync(Buffer.from(JSON.stringify(s), 'utf8')).toString('base64url');
    if (out.length <= MAX_COOKIE_BYTES || s.turns.length <= 2) return out;
    s = { ...s, turns: s.turns.slice(2) };
  }
}

export function decodeState(value: string | undefined | null): CallState {
  if (!value) return emptyState();
  try {
    const parsed = JSON.parse(inflateSync(Buffer.from(value, 'base64url')).toString('utf8')) as Partial<CallState>;
    return {
      turns: Array.isArray(parsed.turns) ? parsed.turns : [],
      facts: parsed.facts ?? {},
      silence: parsed.silence ?? 0,
      started: parsed.started ?? Date.now(),
    };
  } catch {
    return emptyState();
  }
}

export function readStateCookie(request: Request): CallState {
  const header = request.headers.get('cookie') ?? '';
  const m = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return decodeState(m?.[1]);
}

export function stateCookieHeader(state: CallState): string {
  return `${COOKIE_NAME}=${encodeState(state)}; Path=/api/twilio; Max-Age=3600; HttpOnly; Secure; SameSite=None`;
}

export function clearStateCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/api/twilio; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}
