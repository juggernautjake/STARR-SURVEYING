// app/admin/research/[projectId]/layout.tsx
//
// Shared layout for every route under `/admin/research/[projectId]`.
// Hoists the project navigation bar so Boundary / Documents /
// Field Report all see the same strip (previously only the hub
// page rendered it, so the surveyor lost the nav after the
// first click). The active link is derived from `usePathname()`
// inside ResearchProjectNav.

import type { ReactNode } from 'react';
import ResearchProjectNav from './components/ResearchProjectNav';

export default function ProjectLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <ResearchProjectNav />
      {children}
    </>
  );
}
