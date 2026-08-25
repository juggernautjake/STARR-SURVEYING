// app/admin/research/pipeline/page.tsx — absorbed by the Research portal.
//
// C11b of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/research?tab=pipeline');
}
