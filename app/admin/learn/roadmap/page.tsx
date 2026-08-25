// app/admin/learn/roadmap/page.tsx — absorbed by the Knowledge portal.
//
// C11a of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark and every link written
// into a lesson.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/learn?tab=roadmap');
}
