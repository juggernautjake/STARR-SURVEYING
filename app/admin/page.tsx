// app/admin/page.tsx
//
// /admin landing → redirect to /admin/me (Hub).
//
// Admin-nav redesign Phase 2 (slice 2a): the Hub replaces /admin/dashboard
// as the post-login destination per ADMIN_NAVIGATION_REDESIGN.md §5.1 +
// §8 Phase 2. /admin/dashboard itself stays live and reachable from the
// rail / palette; the redirect just shifts the bare /admin alias to the
// Hub.

import { redirect } from 'next/navigation';

export default function AdminIndex(): never {
  redirect('/admin/me');
}
