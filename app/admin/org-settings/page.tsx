// app/admin/org-settings/page.tsx — absorbed by the Company portal.
//
// C12b of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark.
//
// It is linked from onboarding mail and from the billing screens.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/settings?tab=org-profile');
}
