// app/admin/field-data/page.tsx — absorbed by the Jobs & Projects portal (C7).
//
// C7 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// a field upload notification links straight here.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/jobs?tab=field-data');
}
