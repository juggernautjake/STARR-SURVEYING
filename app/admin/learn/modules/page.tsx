// app/admin/learn/modules/page.tsx — absorbed by the Knowledge portal.
//
// C11a of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards, and here it has to: this directory still holds record pages
// beneath it, and every link to one of those resolves through this path.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/learn?tab=modules');
}
