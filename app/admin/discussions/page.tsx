// app/admin/discussions/page.tsx — absorbed by the Messages portal.
//
// C13b of §4's addendum in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/messages?tab=discussions');
}
