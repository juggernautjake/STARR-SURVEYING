// app/admin/page.tsx
//
// /admin landing → redirect to /admin/me (Hub).
//
// Admin-nav redesign Phase 2 (slice 2a) made the Hub the post-login destination per
// ADMIN_NAVIGATION_REDESIGN.md §5.1 + §8 Phase 2, but left /admin/dashboard live beside it —
// two pages both claiming to be the home. Platform audit Phase 1 item 6 (2026-08-01) finished the
// job: the dashboard page is gone and its URL redirects here via LEGACY_REDIRECTS.

import { redirect } from 'next/navigation';

export default function AdminIndex(): never {
  redirect('/admin/me');
}
