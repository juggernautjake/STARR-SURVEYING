// lib/admin/legacy-redirects.ts
//
// consolidation Slice 2 (2026-05-30) — the redirect table the
// middleware applies for the legacy `my-*` + `/admin/profile` URLs.
// Extracted from middleware.ts so the spec can import the constant
// without dragging in next-auth's `next/server` runtime dependency
// (vitest runs in node + can't resolve next/server in a worker).

export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  '/admin/my-jobs':  '/admin/me?tab=jobs',
  '/admin/my-hours': '/admin/me?tab=hours',
  '/admin/my-pay':   '/admin/me?tab=pay',
  '/admin/my-notes': '/admin/me?tab=notes',
  '/admin/profile':  '/admin/me?tab=profile',
};
