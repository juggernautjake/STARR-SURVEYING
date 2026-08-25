// app/admin/assignments/page.tsx — absorbed by the Hours portal.
//
// C13d of §4's addendum in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Assignment notifications link here, and a link in a notification
// outlives the page it was written against.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/hours?tab=assignments');
}
