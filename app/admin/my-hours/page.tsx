// app/admin/my-hours/page.tsx
//
// Legacy redirect — the My Hours view now lives in the Hub at
// /admin/me?tab=hours (admin-nav redesign Phase 2 slice 2c).
// MyHoursPanel still ships from this folder so the Hub can import it.

import { redirect } from 'next/navigation';

export default function MyHoursPage(): never {
  redirect('/admin/me?tab=hours');
}
