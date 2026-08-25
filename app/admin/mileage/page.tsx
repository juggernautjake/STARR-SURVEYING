// app/admin/mileage/page.tsx — absorbed by the Receipts & Spending portal (C5).
//
// C5 / P2.1 of docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// a mileage link is one crews follow from a phone.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/receipts?tab=mileage');
}
