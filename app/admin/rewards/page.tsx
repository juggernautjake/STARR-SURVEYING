// app/admin/rewards/page.tsx — absorbed by the Pay & Payouts portal (C6).
//
// C6 / P1.2 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// the store is linked from the XP notifications.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/pay?tab=rewards');
}
