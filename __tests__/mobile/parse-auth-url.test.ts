import { describe, it, expect } from 'vitest';
import { parseAuthCallbackUrl } from '../../mobile/lib/parseAuthUrl';

// mobile/lib/parseAuthUrl.ts — extracts Supabase access/refresh tokens from a deep-link auth callback.
// Security- and login-critical: the tokens live in the URL FRAGMENT (after #), not the query string, and a
// bug here silently breaks magic-link / password-reset sign-in. Pure module, shipped untested.

const RECOVERY =
  'starr-field://reset#access_token=abc123&refresh_token=xyz789&expires_in=3600&token_type=bearer&type=recovery';

describe('parseAuthCallbackUrl', () => {
  it('extracts the tokens + type from the fragment of a recovery deep link', () => {
    expect(parseAuthCallbackUrl(RECOVERY)).toEqual({
      accessToken: 'abc123',
      refreshToken: 'xyz789',
      type: 'recovery',
    });
  });

  it('reads the type for a magic link, and null when type is absent', () => {
    expect(parseAuthCallbackUrl('app://x#access_token=a&refresh_token=b&type=magiclink')?.type).toBe('magiclink');
    expect(parseAuthCallbackUrl('app://x#access_token=a&refresh_token=b')?.type).toBeNull();
  });

  it('reads ONLY the fragment — query-string tokens are ignored, fragment tokens win', () => {
    // Supabase puts the real tokens in the fragment; query-string values must never be mistaken for them.
    expect(parseAuthCallbackUrl('starr-field://reset?access_token=q&refresh_token=q#type=recovery')).toBeNull();
    const both = parseAuthCallbackUrl('app://x?access_token=WRONG&refresh_token=WRONG#access_token=right&refresh_token=alsoright');
    expect(both).toEqual({ accessToken: 'right', refreshToken: 'alsoright', type: null });
  });

  it('returns null for missing, fragmentless, or incomplete token sets (never a partial object)', () => {
    expect(parseAuthCallbackUrl(null)).toBeNull();
    expect(parseAuthCallbackUrl('starr-field://reset')).toBeNull(); // no '#'
    expect(parseAuthCallbackUrl('starr-field://reset#')).toBeNull(); // empty fragment
    expect(parseAuthCallbackUrl('app://x#access_token=a')).toBeNull(); // missing refresh_token
    expect(parseAuthCallbackUrl('app://x#refresh_token=b')).toBeNull(); // missing access_token
    expect(parseAuthCallbackUrl('app://x#type=recovery&expires_in=3600')).toBeNull(); // neither token
  });

  it('URL-decodes percent-encoded token values', () => {
    const r = parseAuthCallbackUrl('app://x#access_token=a%2Bb%2Fc&refresh_token=r');
    expect(r?.accessToken).toBe('a+b/c');
  });
});
