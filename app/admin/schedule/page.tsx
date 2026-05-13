// app/admin/schedule/page.tsx
//
// Legacy redirect — the schedule view now lives in the Hub at
// /admin/me?tab=schedule (admin-nav redesign Phase 2 slice 2c).
// SchedulePanel still ships from this folder so the Hub can import it.

import { redirect } from 'next/navigation';

export default function SchedulePage(): never {
  redirect('/admin/me?tab=schedule');
}
