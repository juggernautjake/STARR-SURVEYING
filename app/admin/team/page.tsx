// app/admin/team/page.tsx — absorbed by the Hours portal.
//
// C13e of §4's addendum in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards, and the directory stays with it: /admin/team/[email] is one
// person's day and keeps its own route beneath this path.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/hours?tab=team');
}
