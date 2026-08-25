// app/admin/contacts/page.tsx — absorbed by the Messages portal.
//
// C13b of §4's addendum in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. And it has to: /admin/contacts/[id] is a contact record, and every link to one resolves through this path.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/messages?tab=contacts');
}
