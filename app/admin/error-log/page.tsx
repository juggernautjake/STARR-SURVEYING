// app/admin/error-log/page.tsx — absorbed by the System portal.
//
// C12a of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark, and this URL in
// particular gets pasted into support threads.
//
// It has a middleware entry of its own, which the portal does not — see the tab header.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/support?tab=error-log');
}
