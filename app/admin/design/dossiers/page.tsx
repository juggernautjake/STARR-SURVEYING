// app/admin/design/dossiers/page.tsx — the dossier for every page.
//
// Phase D of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// `?route=` opens straight onto one page, because the link that brings most people here is the one
// in the editor's checklist panel — "no one has written what this page is for yet. Write it."

import type { Metadata } from 'next';
import DossierBoard from './DossierBoard';

export const metadata: Metadata = { title: 'Page dossiers' };
export const dynamic = 'force-dynamic';

interface Props {
  // Next 14: a plain object, not a promise.
  searchParams: { route?: string };
}

export default async function DossiersPage({ searchParams }: Props) {
  return <DossierBoard initialRoute={searchParams.route} />;
}
