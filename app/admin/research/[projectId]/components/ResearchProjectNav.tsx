'use client';
// app/admin/research/[projectId]/components/ResearchProjectNav.tsx
//
// Project workspace navigation bar. Hoisted out of the hub
// page into the shared `[projectId]/layout.tsx` so every
// sub-route renders the same strip (previously only the hub
// did, so the surveyor lost the nav on Boundary / Documents /
// Field Report).
//
// `usePathname()` lights up the `--active` class on whichever
// link matches the current route. The Library + Billing
// destinations are global routes (not under `[projectId]`)
// and never match — they remain in the strip for convenience
// but show as inactive everywhere.

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';

interface NavLink {
  href: string;
  label: string;
  matches: (pathname: string) => boolean;
}

export default function ResearchProjectNav() {
  const pathname = usePathname() ?? '';
  const { projectId } = useParams<{ projectId: string }>();

  const links: NavLink[] = [
    {
      href: `/admin/research/${projectId}/boundary`,
      label: '📐 Boundary Viewer',
      matches: (p) => p.startsWith(`/admin/research/${projectId}/boundary`),
    },
    {
      href: `/admin/research/${projectId}/documents`,
      label: '📁 Documents',
      matches: (p) => p.startsWith(`/admin/research/${projectId}/documents`),
    },
    {
      href: `/admin/research/${projectId}/report`,
      label: 'Field Report',
      matches: (p) => p.startsWith(`/admin/research/${projectId}/report`),
    },
    {
      href: '/admin/research/library',
      label: '📚 Library',
      matches: (p) => p.startsWith('/admin/research/library'),
    },
    {
      href: '/admin/research/billing',
      label: '💳 Billing',
      matches: (p) => p.startsWith('/admin/research/billing'),
    },
  ];

  return (
    <div className="research-project-nav">
      {links.map((link) => {
        const isActive = link.matches(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              isActive
                ? 'research-project-nav__link research-project-nav__link--active'
                : 'research-project-nav__link'
            }
            aria-current={isActive ? 'page' : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
