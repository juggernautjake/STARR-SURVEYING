// app/admin/research/coverage/page.tsx — absorbed by the Research portal.
//
// C11b of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards, and the directory stays with it: its two panels and their stylesheets still
// live here and the tab imports them from where they are.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/research?tab=coverage');
}
