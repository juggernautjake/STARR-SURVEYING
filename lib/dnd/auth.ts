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
const DEV_SECRET = 'dnd-dev-secret-change-in-prod';
const SECRET =
  process.env.DND_SESSION_SECRET ||
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  DEV_SECRET;

// A stable signing secret is what keeps sessions valid across requests/deploys. If production falls
// back to the shared dev default, tokens are trivially forgeable AND can stop verifying if the default
// ever changes — surfacing as "my session keeps signing me out". Warn loudly so it gets configured.
if (SECRET === DEV_SECRET && process.env.NODE_ENV === 'production') {
  console.error(
    '[dnd/auth] No DND_SESSION_SECRET (or AUTH_SECRET/NEXTAUTH_SECRET) set in production — ' +
      'the session cookie is signed with an insecure shared default and may not persist. Set DND_SESSION_SECRET.',
  );
}

// Cookie flags for the session. `secure` is on in production so the cookie only travels over HTTPS —
// but a deployment served over plain HTTP (e.g. behind a TLS-terminating proxy that forwards http)
// would have the browser DROP a Secure cookie, so new sign-ins never stick. `DND_COOKIE_INSECURE=1`
// opts such deployments out of the Secure flag so sessions persist.
function sessionCookieOptions() {
  const insecure = process.env.DND_COOKIE_INSECURE === '1';
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !insecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE,
  };
}

export interface DndSession {
  userId: string;
  email: string;
  displayName: string;
}

// ── pseudo-login identity (name-only accounts) ───────────────────────────────
// The user opted OUT of real auth for now: an account is just a name + password, no email. The
// `dnd_users.email` column is UNIQUE NOT NULL, and the existing "quick" accounts already store a
// synthetic string there (`quick:andrew`), so name accounts follow the same convention: the login
// key is `name:<normalized name>`. This keeps the name unique without a schema change and without
// ever asking for an email. When real auth arrives, these rows migrate cleanly (the key is
// namespaced and obviously synthetic).
export const NAME_ACCOUNT_PREFIX = 'name:';
export function nameToKey(name: string): string {
  return NAME_ACCOUNT_PREFIX + name.trim().toLowerCase().replace(/\s+/g, ' ');
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
  cookies().set(COOKIE, token, sessionCookieOptions());
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

// ── owner gate (requests board management) ───────────────────────────────────
// A minimal owner concept: only the owner account(s) may manage the suggestions/requests board
// (delete, change status). There is no admin flag in the /dnd schema, so ownership is matched on the
// synthetic pseudo-login key stored in `dnd_users.email` (e.g. `quick:jacob` / `name:jacob`). Defaults
// to Jacob's keys; override with DND_OWNER_KEYS (comma-separated synthetic keys) so it isn't hardcoded
// only. The password is the existing pseudo-login (no new auth surface).
export function dndOwnerKeys(): string[] {
  const env = process.env.DND_OWNER_KEYS;
  const raw = env ? env.split(',') : ['quick:jacob', 'name:jacob'];
  return raw.map((k) => k.trim().toLowerCase()).filter(Boolean);
}
export function isDndOwner(session: DndSession | null): boolean {
  if (!session) return false;
  return dndOwnerKeys().includes(String(session.email).trim().toLowerCase());
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
