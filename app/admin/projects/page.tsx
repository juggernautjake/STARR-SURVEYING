// app/admin/projects/page.tsx — absorbed by the Jobs & Projects portal (C7).
//
// C7 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// a project is linked from every job that belongs to one.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/jobs?tab=projects');
}
