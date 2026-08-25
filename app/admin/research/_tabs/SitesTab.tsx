// app/admin/research/_tabs/SitesTab.tsx — a tab of the Research portal.
//
// C11b / P13 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
// Was `/admin/research/sites/page.tsx`, which was a four-line server wrapper around
// `SitesClient` plus a `metadata` title. The wrapper WAS the page: a tab needs neither, so this
// is the client component and its stylesheet, named as a tab.

'use client';

import SitesClient from '../sites/SitesClient';
import '../sites/Sites.css';

export default function SitesTab() {
  return <SitesClient />;
}
