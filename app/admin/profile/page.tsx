// app/admin/profile/page.tsx
//
// Thin route wrapper around `ProfilePanel`. The same panel renders
// inside the Hub at /admin/me?tab=profile (admin-nav redesign Phase 2
// slice 2b). When slice 2c lands the redirect, this file flips to a
// server-side `redirect('/admin/me?tab=profile')`.

import ProfilePanel from './ProfilePanel';

export default function ProfilePage() {
  return <ProfilePanel />;
}
