// app/admin/payroll/page.tsx — absorbed by the Pay & Payouts portal (C6).
//
// C6 / P1.2 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark — and here in particular,
// a payroll run is linked from every pay notification.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/pay?tab=payroll');
}
