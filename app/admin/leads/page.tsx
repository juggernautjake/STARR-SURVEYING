// app/admin/leads/page.tsx — absorbed by the Growth portal.
//
// C10 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. `/admin/leads/[id]` is a LEAD RECORD and keeps its own route, so
// this file is the only thing under `/admin/leads` that moved — every link to a specific lead, and
// there are many (job pages, the calendar's lead-to-job flow, reply mail), still resolves.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/marketing?tab=leads');
}
