// app/admin/design/dossiers/page.tsx — absorbed by the Page Designer portal.
//
// C12c of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards, and the directory stays with it: the board component and its
// stylesheet still live here and the tab imports them from where they are.
//
// ── THIS ONE FORWARDS ITS QUERY, WHICH THE OTHER TWO DO NOT NEED TO ─────────────────────────────
//
// `?route=` is how the studio deep-links "write the dossier for THIS page" — the Page list and the
// dossier panel both build that URL. A plain `redirect('/admin/design?tab=dossiers')` would drop it
// and land every one of those links on an unfiltered board, which is the shape of bug a redirect
// stub is most likely to introduce and least likely to have anybody notice.

import { redirect } from 'next/navigation';

interface Props {
  // Next 14: a plain object, not a promise.
  searchParams: { route?: string };
}

export default function Page({ searchParams }: Props) {
  const route = searchParams?.route;
  redirect(route
    ? `/admin/design?tab=dossiers&route=${encodeURIComponent(route)}`
    : '/admin/design?tab=dossiers');
}
