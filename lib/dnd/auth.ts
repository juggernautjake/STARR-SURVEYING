// lib/dnd/auth.ts — invite-only auth for the hidden /dnd platform (Phase B, B1).
// Separate from Starr staff auth: its own `dnd_users` table + a signed session
// cookie. Passwords hashed with bcryptjs; the session is an HMAC-signed token
// (no extra deps). The app talks to the DB via the service role.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';

const COOKIE = 'dnd_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const SECRET =
  process.env.DND_SESSION_SECRET ||
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  'dnd-dev-secret-change-in-prod';

export interface DndSession {
  userId: string;
  email: string;
  displayName: string;
}

// ── password hashing ─────────────────────────────────────────────────────────
export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

// ── signed token (HMAC-SHA256 over a base64url payload) ──────────────────────
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
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof p.exp === 'number' && Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

// ── session cookie ───────────────────────────────────────────────────────────
export function setDndSession(user: { id: string; email: string; display_name: string }): void {
  const token = signToken({
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    exp: Date.now() + MAX_AGE * 1000,
  });
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

// Access model (user decision 2026-07-06): /dnd is PUBLIC by default — a hidden hub
// reachable by direct link only (noindex, no links in from the marketing site). The
// home page is a public roster picker and clicking a card "enters as" that identity
// (no password). The full invite/login infrastructure (B1–B7) is retained and can be
// switched back on for the future by setting DND_REQUIRE_LOGIN=1, which flips the
// middleware gate + the page-level redirects back to the login flow.
export function isDndLoginRequired(): boolean {
  return process.env.DND_REQUIRE_LOGIN === '1';
}

/** True when /dnd is running open (the default). Kept as the name the pages already
 *  use; it's simply the inverse of the opt-in login gate. */
export function isDndOpenAccess(): boolean {
  return !isDndLoginRequired();
}

export function getDndSession(): DndSession | null {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const p = verifyToken(token);
  if (!p || typeof p.userId !== 'string') return null;
  return { userId: p.userId as string, email: String(p.email), displayName: String(p.displayName) };
}

export function clearDndSession(): void {
  cookies().delete(COOKIE);
}

// full user row for the current session (or null)
export async function getDndUser() {
  const s = getDndSession();
  if (!s) return null;
  const { data } = await supabaseAdmin.from('dnd_users').select('*').eq('id', s.userId).maybeSingle();
  if (data) {
    void supabaseAdmin.from('dnd_users').update({ last_seen_at: new Date().toISOString() }).eq('id', s.userId);
  }
  return data;
}

// is the current user the DM of (or a member of) a campaign?
export async function getCampaignRole(campaignId: string): Promise<'dm' | 'player' | null> {
  const s = getDndSession();
  if (!s) return null;
  const { data } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', s.userId)
    .maybeSingle();
  return (data?.role as 'dm' | 'player') ?? null;
}
