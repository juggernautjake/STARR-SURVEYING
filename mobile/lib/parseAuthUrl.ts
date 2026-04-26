/**
 * Parse a Supabase auth-callback URL into the access/refresh tokens.
 *
 * Both magic-link and password-reset emails redirect to deep links
 * shaped like `starr-field://<path>#access_token=...&refresh_token=...
 * &expires_in=3600&token_type=bearer&type=recovery`. The tokens live
 * in the URL **fragment** (after `#`), not the query string — so
 * Linking.parse(url).queryParams misses them.
 *
 * Returns null when the URL is missing the required tokens, e.g.
 * because it was a fresh launch with no incoming link or because the
 * user already consumed the link in a previous mount.
 */
export interface AuthCallbackTokens {
  accessToken: string;
  refreshToken: string;
  /** 'recovery' for password reset, 'magiclink' / 'signup' for OTP. */
  type: string | null;
}

export function parseAuthCallbackUrl(url: string | null): AuthCallbackTokens | null {
  if (!url) return null;

  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;

  const fragment = url.slice(hashIndex + 1);
  if (!fragment) return null;

  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) return null;

  return {
    accessToken,
    refreshToken,
    type: params.get('type'),
  };
}
