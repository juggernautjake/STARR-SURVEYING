// lib/voice/auth.ts — Andrew's login for the /AndrewAsh studio.
//
// Two identities exist on this platform and they are deliberately not the same mechanism:
//
//   OWNER  — Andrew. Signs in with an email + password, gets an HMAC-signed session cookie, and can
//            edit everything. One account (maybe two later), so there is no user management to build.
//   CLIENT — everyone he works with. Never signs in at all; they follow a long random token in a link
//            to see their own contracts and invoices. See `lib/voice/tokens.ts`.
//
// Giving clients passwords would mean account recovery, email verification and a support burden, for
// an audience that visits twice: once to sign, once to pay. Giving Andrew a token link would mean the
// keys to the business live in his browser history. The asymmetry is the design.
//
// The signing/verification code mirrors `lib/dnd/auth.ts`, which has been in production here for
// months — same cookie shape, same timing-safe compare, no new dependency.

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';

const COOKIE = 'va_session';
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days — shorter than /dnd's 30; this session can send invoices.
const DEV_SECRET = 'va-dev-secret-change-in-prod';

const SECRET =
  process.env.VOICE_SESSION_SECRET ||
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  DEV_SECRET;

// A production deploy running on the shared dev default has forgeable sessions: anyone who reads this
// file can mint a cookie that owns the studio. Say so loudly at boot rather than leaving it to be
// discovered.
if (SECRET === DEV_SECRET && process.env.NODE_ENV === 'production') {
  console.error(
    '[voice/auth] No VOICE_SESSION_SECRET (or AUTH_SECRET/NEXTAUTH_SECRET) set in production — ' +
      'studio session cookies are signed with a public default and are trivially forgeable. Set VOICE_SESSION_SECRET.',
  );
}

export interface VoiceSession {
  userId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'assistant';
}

// ── password hashing ─────────────────────────────────────────────────────────────────────────────

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

// The rules themselves live in `./auth-rules`, which imports nothing — the login form is a client
// component and needs them for inline feedback, and this module imports bcryptjs, node:crypto and
// next/headers. Re-exported so server callers keep one import site and there is one definition.
export { passwordProblem, emailProblem } from './auth-rules';

// ── signed token ─────────────────────────────────────────────────────────────────────────────────

export function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // Length must be compared first: timingSafeEqual THROWS on a length mismatch rather than returning
  // false, which would turn a malformed cookie into a 500 on every page load.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof p.exp === 'number' && Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

// ── session cookie ───────────────────────────────────────────────────────────────────────────────

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.VOICE_COOKIE_INSECURE !== '1',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE,
  };
}

export function setVoiceSession(user: {
  id: string;
  email: string;
  display_name: string;
  role?: string;
}): void {
  cookies().set(
    COOKIE,
    signToken({
      userId: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role === 'assistant' ? 'assistant' : 'owner',
      exp: Date.now() + MAX_AGE * 1000,
    }),
    cookieOptions(),
  );
}

export function getVoiceSession(): VoiceSession | null {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const p = verifyToken(token);
  if (!p || typeof p.userId !== 'string') return null;
  return {
    userId: p.userId,
    email: String(p.email ?? ''),
    displayName: String(p.displayName ?? 'Andrew'),
    role: p.role === 'assistant' ? 'assistant' : 'owner',
  };
}

export function clearVoiceSession(): void {
  cookies().delete(COOKIE);
}

export function isVoiceOwner(session: VoiceSession | null): boolean {
  return session?.role === 'owner';
}

// ── bootstrap ────────────────────────────────────────────────────────────────────────────────────

/**
 * True when no studio account exists yet.
 *
 * FIRST-RUN CLAIM, AND WHY IT IS SAFE HERE. When the table is empty, `/AndrewAsh/login` offers to
 * create the first account instead of asking for one. That is an open door — but only until it is
 * walked through once, and the alternative (seeding a password hash into a SQL file committed to a
 * repo) publishes Andrew's credentials to everyone with git access, permanently. A door that closes
 * after the first visitor beats a key taped to the frame.
 *
 * `VOICE_SIGNUP_KEY`, when set, additionally requires a shared secret on the create-account request,
 * which closes the window entirely for a deploy that is public before Andrew gets to it.
 */
export async function studioNeedsSetup(): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from('va_users')
    .select('id', { count: 'exact', head: true });
  // Fail CLOSED. A database error must not be reported as "no accounts exist", because that would
  // expose account creation on a live site every time the database hiccups.
  if (error) return false;
  return (count ?? 0) === 0;
}

/** The shared secret guarding first-run account creation, or null when unset. */
export function signupKey(): string | null {
  const k = process.env.VOICE_SIGNUP_KEY?.trim();
  return k ? k : null;
}

/** Full user row for the current session, or null. */
export async function getVoiceUser() {
  const s = getVoiceSession();
  if (!s) return null;
  const { data } = await supabaseAdmin.from('va_users').select('*').eq('id', s.userId).maybeSingle();
  return data;
}

/** Guard for API routes. Returns the session or null; callers 401 on null. */
export function requireVoiceSession(): VoiceSession | null {
  return getVoiceSession();
}
