/**
 * Session management for Bell County website interactions.
 * Handles cookie acquisition, session token extraction, and renewal.
 */

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints.js';

export interface SessionState {
  token: string;
  cookies: string;
  acquiredAt: number;
}

let cachedSession: SessionState | null = null;
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get or acquire a Bell CAD eSearch session.
 * Caches the session for 5 minutes.
 */
export async function getBellCadSession(): Promise<SessionState | null> {
  // Return cached session if still fresh
  if (cachedSession && Date.now() - cachedSession.acquiredAt < SESSION_TTL_MS) {
    return cachedSession;
  }

  try {
    const resp = await fetch(BELL_ENDPOINTS.cad.home, {
      headers: {
        'Accept': 'text/html,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUTS.httpRequest),
    });

    if (!resp.ok) return null;

    const html = await resp.text();

    // Extract session token
    const tokenMatch = html.match(/searchSessionToken['"]\s*(?:value|content)\s*=\s*['"]([^'"]+)/i)
      ?? html.match(/name=['"]searchSessionToken['"][^>]*value=['"]([^'"]+)/i)
      ?? html.match(/['"]searchSessionToken['"]\s*:\s*['"]([^'"]+)/i);

    if (!tokenMatch) return null;

    // Extract cookies
    const setCookies = resp.headers.getSetCookie?.() ?? [];
    const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

    cachedSession = {
      token: tokenMatch[1],
      cookies,
      acquiredAt: Date.now(),
    };

    return cachedSession;
  } catch {
    return null;
  }
}

/**
 * Invalidate the cached session (e.g., after a 403 response).
 */
export function invalidateSession(): void {
  cachedSession = null;
}
