// app/admin/hours-approval/page.tsx — absorbed by the Hours portal (C4).
//
// C4 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark, and this pair in particular
// has been linked to from notification emails — a 404 there says the timesheet is gone.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/hours?tab=approvals');
}
