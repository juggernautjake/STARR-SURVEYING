// app/admin/users/page.tsx — absorbed by a C9 portal.
//
// C9 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// an account link arrives in the invite email.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/people?tab=accounts');
}
