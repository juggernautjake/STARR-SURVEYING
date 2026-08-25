// app/admin/reports/page.tsx — absorbed by the Books & Tax portal.
//
// C13c of §4's addendum in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards, and the directory stays with it: /admin/reports/job is a report
// about one job and keeps its own route beneath this path.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/finances?tab=reports');
}
