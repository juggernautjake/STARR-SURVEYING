// app/admin/pass-through/page.tsx — absorbed by the Receipts & Spending portal (C5).
//
// C5 / P2.1 of docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// a rebilled cost is linked from the job it was billed against.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/receipts?tab=rebilled');
}
