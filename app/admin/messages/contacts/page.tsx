// app/admin/messages/contacts/page.tsx — absorbed by the Messages portal.
//
// C9 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards.
//
// C13b renamed the tab from `contacts` to `directory`: /admin/contacts, the firm-wide CRM, became
// a tab of this same portal and it is the one people mean by "contacts". This is the INTERNAL team
// directory — a different noun that had the same word.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/messages?tab=directory');
}
