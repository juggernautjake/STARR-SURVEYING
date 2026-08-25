// app/admin/design/_tabs/DossiersTab.tsx — a tab of the Page Designer.
//
// C12c / P17 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
// Was `app/admin/design/dossiers/page.tsx`.
//
// ── THE ONE WRAPPER THAT WAS NOT JUST A WRAPPER ─────────────────────────────────────────────────
//
// The other three boards had server wrappers whose whole body was `return <Board />`, so the wrapper
// WAS the page and a tab needed neither it nor its `metadata` title. This one also read a query
// parameter:
//
//     export default async function DossiersPage({ searchParams }: Props) {
//       return <DossierBoard initialRoute={searchParams.route} />;
//     }
//
// `?route=` is how the studio deep-links "write the dossier for THIS page" — the page list and the
// editor's checklist panel both build that URL, and its old header says so: *"the link that brings
// most people here is the one in the editor's checklist panel."* Rendering `<DossierBoard />` with
// no prop compiles, typechecks, and silently lands every one of those links on an unfiltered board.
// It was written that way for about ten minutes.
//
// A tab cannot take `searchParams` — that is a page-level prop — so it reads the same parameter from
// the client side, which is where the portal keeps `?tab=` anyway.

'use client';

import { useSearchParams } from 'next/navigation';
import DossierBoard from '../dossiers/DossierBoard';

export default function DossiersTab() {
  const params = useSearchParams();
  return <DossierBoard initialRoute={params?.get('route') ?? undefined} />;
}
