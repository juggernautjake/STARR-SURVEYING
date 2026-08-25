// app/admin/learn/manage/question-builder/page.tsx — absorbed by the Learning Content portal.
//
// C12d of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark, and authoring links get
// pasted between the people who write the courses.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/learn/manage?tab=question_builder');
}
