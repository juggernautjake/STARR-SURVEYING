// app/admin/profile/page.tsx
//
// Legacy redirect — the profile view now lives in the Hub at
// /admin/me?tab=profile (admin-nav redesign Phase 2 slice 2c).
// ProfilePanel still ships from this folder so the Hub can import it.

import { redirect } from 'next/navigation';

export default function ProfilePage(): never {
  redirect('/admin/me?tab=profile');
}
