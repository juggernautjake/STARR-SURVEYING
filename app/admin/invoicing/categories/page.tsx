// app/admin/invoicing/categories/page.tsx — absorbed by a C8 portal.
//
// C8 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// a category is linked from every invoice line that uses one.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/invoicing?tab=categories');
}
