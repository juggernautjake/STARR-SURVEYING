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

  // Platform audit §2.1 / Phase 1 item 6 (2026-08-01) — "four competing home concepts", of which
  // two claimed to be THE home. `/admin/dashboard` was a 474-line hardcoded tile page; `/admin/me`
  // is the customisable hub with saved layouts. A new employee had no way to tell which was the app.
  //
  // Nothing was folded in, because there was nothing left to fold: every figure the dashboard
  // computed — lessons, quiz scores, flashcards due, activity, pending approvals, active jobs, hours
  // this week, upcoming events, PTO — already exists as a hub widget, each one configurable and
  // removable in a way the hardcoded tile never was. Deleting the page loses no capability.
  //
  // A redirect rather than a deletion because notification rows in the database still carry
  // `/admin/dashboard` links, and those outlive any deploy.
  '/admin/dashboard': '/admin/me',
};
