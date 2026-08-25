// app/admin/finances/overview/page.tsx — absorbed by a C8 portal.
//
// C8 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// the monthly money summary is linked from the hub.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/finances?tab=overview');
}
