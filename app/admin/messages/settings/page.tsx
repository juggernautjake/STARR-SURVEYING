// app/admin/messages/settings/page.tsx — absorbed by a C9 portal.
//
// C9 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// notification mail links here to turn itself off.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/messages?tab=settings');
}
