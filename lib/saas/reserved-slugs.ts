// lib/saas/reserved-slugs.ts
//
// Slugs that cannot be claimed by a customer organization. These map
// to existing paths, future product surfaces, or generic words that
// shouldn't appear on a subdomain.
//
// Enforced at signup time (precheck + complete) and rejected loudly
// in the org-rename flow (when that ships).
//
// Spec: docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §5.1 +
//       MARKETING_SIGNUP_FLOW.md §4.

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Subdomains in active use
  'www', 'api', 'app', 'platform', 'admin', 'auth', 'login', 'register',
  'signup', 'pricing', 'docs', 'help', 'support', 'status', 'blog',
  'about', 'contact', 'services', 'resources', 'service-area',
  'credentials', 'share', 'sitemap',

  // Brand / common phishing-bait words
  'starr', 'starrsoftware', 'starr-software', 'starrsurveying',
  'starr-surveying', 'mail', 'email', 'webmail', 'smtp', 'imap',
  'ftp', 'sftp', 'ssh', 'vpn',

  // Generic phishing-prone slugs
  'account', 'accounts', 'billing', 'pay', 'payment', 'payments',
  'invoice', 'invoices', 'checkout', 'secure', 'security', 'verify',
  'verification', 'password', 'reset', 'password-reset',

  // CDN / infrastructure
  'cdn', 'static', 'assets', 'images', 'img', 'js', 'css',
  'fonts', 'media', 'uploads', 'downloads',

  // Common short
  'a', 'b', 'c', 'about-us', 'contact-us', 'home', 'index',
  'test', 'staging', 'dev', 'development', 'preview', 'beta',
  'alpha', 'demo',

  // Reserved for future product surfaces
  'me', 'us', 'we', 'team', 'crew', 'org', 'organization',
  'organizations', 'firm', 'firms', 'tenant', 'tenants',
  'workspace', 'workspaces', 'dashboard', 'console',
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{3,38}[a-z0-9])$/;

export type SlugValidationResult =
  | { ok: true }
  | { ok: false; reason: 'too_short' | 'too_long' | 'invalid_chars' | 'reserved' | 'leading_hyphen' | 'trailing_hyphen' };

/** Validates a proposed slug. The format rule per §5.1: lowercase,
 *  [a-z0-9-], 5-40 chars, not starting or ending with a hyphen. */
export function validateSlug(slug: string): SlugValidationResult {
  if (!slug) return { ok: false, reason: 'too_short' };
  if (slug.length < 5) return { ok: false, reason: 'too_short' };
  if (slug.length > 40) return { ok: false, reason: 'too_long' };
  if (slug.startsWith('-')) return { ok: false, reason: 'leading_hyphen' };
  if (slug.endsWith('-')) return { ok: false, reason: 'trailing_hyphen' };
  if (!SLUG_PATTERN.test(slug)) return { ok: false, reason: 'invalid_chars' };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: 'reserved' };
  return { ok: true };
}

/** Cheap "is this slug taken" check that doesn't hit the DB.
 *  Returns true for reserved slugs (which are always "taken" in our
 *  sense — they can't be claimed). Caller still has to query
 *  organizations table for the real uniqueness check. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
