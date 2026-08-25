// app/admin/email/sent/page.tsx — absorbed by a C9 portal.
//
// C9 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// a sent-mail receipt links back to the log.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/messages?tab=email');
}
