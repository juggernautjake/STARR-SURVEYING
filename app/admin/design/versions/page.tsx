// app/admin/design/versions/page.tsx — site versions.
//
// Phase V of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.

import type { Metadata } from 'next';
import VersionsBoard from './VersionsBoard';

export const metadata: Metadata = { title: 'Site versions' };

export default function SiteVersionsPage() {
  return <VersionsBoard />;
}
