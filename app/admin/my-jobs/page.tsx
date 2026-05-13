// app/admin/my-jobs/page.tsx
//
// Legacy redirect — the My Jobs view now lives in the Hub at
// /admin/me?tab=jobs (admin-nav redesign Phase 2 slice 2c).
// MyJobsPanel still ships from this folder so the Hub can import it.

import { redirect } from 'next/navigation';

export default function MyJobsPage(): never {
  redirect('/admin/me?tab=jobs');
}
