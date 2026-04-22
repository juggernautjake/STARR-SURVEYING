// worker/src/shared/ws-ticket.ts
//
// HMAC-signed authentication ticket for the WebSocket server.
//
// **Location rationale:** lives under worker/src/shared so that
// `worker/src/lib/research-events-emit.ts` can use it without violating
// the worker tsconfig's `rootDir: ./src` constraint. The Next.js app
// imports it from `@/worker/src/shared/ws-ticket`; server/ws.ts uses a
// relative path. All three reference the same source file.
//
// Why a separate ticket instead of next-auth cookies on the WS connection:
//   1. Browsers do not send cookies on cross-origin WebSocket handshakes,
//      so we cannot reuse the next-auth session cookie if the WS server
//      runs on a different origin/port (it does — server/ws.ts on :3001).
//   2. A short-lived (60s) ticket means the WS auth surface is decoupled
//      from the long-lived HTTP session, so a leaked ticket is harmless
//      after one minute.
//   3. WS_TICKET_SECRET is independent of NEXTAUTH_SECRET so we can
//      rotate WS auth without invalidating user HTTP sessions, and a
//      compromise of one secret does not compromise the other.
//
// Flow:
//   1. Browser hits POST /api/ws/ticket with their next-auth session.
//   2. Route returns { ticket, jobIds, exp }.
//   3. Browser opens ws://host:3001/?ticket=<ticket>.
//   4. WS server validates HMAC + exp + jobIds.
//
// Format:
//   header.payload.signature   (JWT-shaped, but NOT a real JWT —
//                               we use raw HMAC-SHA256 to keep dependencies
//                               minimal; no jose / jsonwebtoken needed.)
//
//   header  = base64url({ alg: 'HS256', typ: 'STARR-WS' })
//   payload = base64url({ userId, jobIds[], iat, exp })
//   sig     = base64url(HMAC-SHA256(secret, header + '.' + payload))

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WsTicketPayload {
  /** The user id this ticket belongs to. */
  userId: string;
  /** Job ids the holder is authorized to subscribe to. */
  jobIds: string[];
  /** Issued-at, unix seconds. */
  iat: number;
  /** Expires-at, unix seconds. */
  exp: number;
}

const HEADER = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'STARR-WS' }));

/** Default ticket lifetime — 60 seconds. Caller can override. */
export const WS_TICKET_DEFAULT_TTL_SECONDS = 60;

/**
 * Issue a fresh ticket for a user with the given job authorization. Caller
 * is responsible for verifying the user's HTTP session before calling
 * this — the ticket helper takes user identity as input, not as a guess.
 */
export function issueWsTicket(
  userId: string,
  jobIds: string[],
  secret: string,
  ttlSeconds: number = WS_TICKET_DEFAULT_TTL_SECONDS,
): { ticket: string; payload: WsTicketPayload } {
  if (!secret) throw new Error('issueWsTicket: secret is required');
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const payload: WsTicketPayload = { userId, jobIds, iat, exp };
  const payloadEnc = base64UrlEncode(JSON.stringify(payload));
  const sig = sign(`${HEADER}.${payloadEnc}`, secret);
  return { ticket: `${HEADER}.${payloadEnc}.${sig}`, payload };
}

/**
 * Validate a ticket. Returns the payload on success, throws on any
 * failure (bad format, wrong sig, expired). The thrown error message
 * is operator-readable; do NOT surface it to clients verbatim.
 */
export function verifyWsTicket(
  ticket: string,
  secret: string,
  /** Override clock for tests. Defaults to Date.now()/1000. */
  nowSeconds: number = Math.floor(Date.now() / 1000),
): WsTicketPayload {
  if (!secret) throw new Error('verifyWsTicket: secret is required');
  const parts = ticket.split('.');
  if (parts.length !== 3) throw new Error('verifyWsTicket: malformed ticket (expected 3 parts)');
  const [headerEnc, payloadEnc, sigEnc] = parts as [string, string, string];

  // Header sanity. We don't use it for anything else but a wrong header
  // means this ticket wasn't issued by us.
  if (headerEnc !== HEADER) throw new Error('verifyWsTicket: header mismatch');

  // Constant-time signature check.
  const expectedSig = sign(`${headerEnc}.${payloadEnc}`, secret);
  const a = Buffer.from(sigEnc);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('verifyWsTicket: signature mismatch');
  }

  // Payload parse + exp check.
  let payload: WsTicketPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadEnc).toString('utf8')) as WsTicketPayload;
  } catch {
    throw new Error('verifyWsTicket: payload is not valid JSON');
  }
  if (typeof payload.userId !== 'string' || !Array.isArray(payload.jobIds) ||
      typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    throw new Error('verifyWsTicket: payload shape invalid');
  }
  if (payload.exp <= nowSeconds) {
    throw new Error('verifyWsTicket: ticket expired');
  }
  return payload;
}

// ── Internals ──────────────────────────────────────────────────────────────

function sign(input: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(input).digest();
  return base64UrlEncodeBytes(mac);
}

function base64UrlEncode(input: string): string {
  return base64UrlEncodeBytes(Buffer.from(input, 'utf8'));
}

function base64UrlEncodeBytes(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}
