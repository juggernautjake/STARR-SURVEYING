// app/admin/design/versions/page.tsx — absorbed by the Page Designer portal.
//
// C12c of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards, and the directory stays with it: the board component and its
// stylesheet still live here and the tab imports them from where they are.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/design?tab=versions');
}
