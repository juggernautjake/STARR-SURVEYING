// app/admin/cards/page.tsx — absorbed by the Receipts & Spending portal (C5).
//
// C5 / P2.1 of docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// the card registry is linked from every receipt that matched a card.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/receipts?tab=cards');
}
