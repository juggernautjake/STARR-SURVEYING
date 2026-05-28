// lib/integrations/google-calendar.ts
//
// Google Calendar v3 API client used by app/api/admin/google-calendar/*.
// Uses bare fetch (no googleapis SDK) to keep the bundle slim.
//
// Required env vars (already used by next-auth's Google provider):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   NEXTAUTH_URL              — the redirect URI is built from this.
//
// OAuth scope: https://www.googleapis.com/auth/calendar — read/write on the
// user's calendars. The connect flow requests offline + prompt=consent so we
// always get a refresh token back.

import { supabaseAdmin } from '@/lib/supabase';

export const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface StoredConnection {
  user_email: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  calendar_id: string;
  last_synced_at: string | null;
  scope: string | null;
}

export interface GCalEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  etag?: string;
  updated?: string;
}

/** Build the OAuth consent URL the Connect button redirects to. */
export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GCAL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }>;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function loadConnection(userEmail: string): Promise<StoredConnection | null> {
  const { data } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('user_email, access_token, refresh_token, token_expires_at, calendar_id, last_synced_at, scope')
    .eq('user_email', userEmail)
    .maybeSingle();
  return (data as StoredConnection | null) ?? null;
}

/**
 * Returns a valid access token, refreshing it if within 60s of expiry.
 * The refresh-and-store happens transparently for the caller.
 */
export async function getValidAccessToken(conn: StoredConnection): Promise<string> {
  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return conn.access_token;
  const fresh = await refreshAccessToken(conn.refresh_token);
  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from('google_calendar_connections')
    .update({ access_token: fresh.access_token, token_expires_at: newExpiresAt, updated_at: new Date().toISOString() })
    .eq('user_email', conn.user_email);
  return fresh.access_token;
}

async function gcalFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`GCal ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function scheduleEventToGCalEvent(ev: {
  title: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
}): GCalEvent {
  const out: GCalEvent = {
    summary: ev.title,
    description: ev.notes ?? undefined,
    location: ev.location ?? undefined,
  };
  if (ev.all_day) {
    out.start = { date: ev.start_time.slice(0, 10) };
    out.end   = { date: ev.end_time.slice(0, 10) };
  } else {
    out.start = { dateTime: ev.start_time };
    out.end   = { dateTime: ev.end_time };
  }
  return out;
}

export async function pushScheduleEvent(
  conn: StoredConnection,
  ev: { id: string; title: string; start_time: string; end_time: string; all_day: boolean; location: string | null; notes: string | null },
  existingGoogleEventId?: string,
): Promise<GCalEvent> {
  const token = await getValidAccessToken(conn);
  const body = scheduleEventToGCalEvent(ev);
  if (existingGoogleEventId) {
    return gcalFetch<GCalEvent>(token, `/calendars/${encodeURIComponent(conn.calendar_id)}/events/${encodeURIComponent(existingGoogleEventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }
  return gcalFetch<GCalEvent>(token, `/calendars/${encodeURIComponent(conn.calendar_id)}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteScheduleEvent(conn: StoredConnection, googleEventId: string): Promise<void> {
  const token = await getValidAccessToken(conn);
  const res = await fetch(`${API_BASE}/calendars/${encodeURIComponent(conn.calendar_id)}/events/${encodeURIComponent(googleEventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 = already deleted, ignore.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`GCal delete failed (${res.status}): ${await res.text()}`);
  }
}

export async function listRemoteEvents(
  conn: StoredConnection,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GCalEvent[]> {
  const token = await getValidAccessToken(conn);
  const params = new URLSearchParams({
    timeMin: timeMinIso, timeMax: timeMaxIso,
    singleEvents: 'true', maxResults: '250',
  });
  const data = await gcalFetch<{ items?: GCalEvent[] }>(
    token,
    `/calendars/${encodeURIComponent(conn.calendar_id)}/events?${params.toString()}`,
  );
  return data.items ?? [];
}
