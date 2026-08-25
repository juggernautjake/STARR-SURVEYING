// app/admin/weather/page.tsx — absorbed by the Jobs portal.
//
// C13a of §4's addendum in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Crew members send each other this URL when a day looks doubtful.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/jobs?tab=weather');
}
