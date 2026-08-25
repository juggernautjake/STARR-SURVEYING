// app/admin/design/_tabs/HomeTab.tsx — a tab of the Page Designer.
//
// C12c / P17 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
// Was `/admin/design/page.tsx`, which was a server wrapper around `DesignHome` plus a `metadata` title. The
// wrapper WAS the page — a tab needs neither — so this is the board, named as a tab.

'use client';

import DesignHome from '../DesignHome';

export default function HomeTab() {
  return <DesignHome />;
}
