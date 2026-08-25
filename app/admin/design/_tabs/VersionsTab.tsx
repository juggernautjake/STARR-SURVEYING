// app/admin/design/_tabs/VersionsTab.tsx — a tab of the Page Designer.
//
// C12c / P17 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
// Was `/admin/design/versions/page.tsx`, which was a server wrapper around `VersionsBoard` plus a `metadata` title. The
// wrapper WAS the page — a tab needs neither — so this is the board, named as a tab.

'use client';

import VersionsBoard from '../versions/VersionsBoard';

export default function VersionsTab() {
  return <VersionsBoard />;
}
