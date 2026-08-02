'use client';
// app/admin/components/nav/WorkspaceLanding.tsx
//
// Shared layout for the new workspace landing pages (admin-nav redesign
// Phase 3 slice 3a) at /admin/work, /admin/office, /admin/research-cad.
// /admin/equipment + /admin/learn are existing landings; the rail
// links them directly. /admin/me is the Hub.
//
// Phase 3 shipped these landings as a directory of the workspace's routes so
// the Hub's "Workspaces" column no longer 404s, with a subtitle promising that
// "Phase 4 adds at-a-glance widgets here".
//
// Platform audit §2.1 counted that promise as part of the four-competing-homes
// problem: a landing that says it is unfinished teaches people not to come
// back to it, and they navigate around it forever after. This is Phase 4 —
// the counts arrive from `/api/admin/workspace-summary`, and the subtitle now
// describes the page instead of apologising for it.
//
// The stat strip renders only what came back. A count the server could not
// take is absent rather than zero: "0 unpaid invoices" is very good news and
// a failed query looks exactly like it.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

import {
  WORKSPACES,
  accessibleRoutes,
  type Workspace,
} from '@/lib/admin/route-registry';
import { isInternalUser } from '@/lib/saas/internal-user';
import type { UserRole } from '@/lib/auth-roles';

import './WorkspaceLanding.css';

interface WorkspaceLandingProps {
  workspace: Workspace;
}

interface WorkspaceStat {
  label: string;
  value: number;
  href: string;
  tone?: 'neutral' | 'attention';
}

export default function WorkspaceLanding({ workspace }: WorkspaceLandingProps) {
  const { data: session } = useSession();
  const meta = WORKSPACES[workspace];

  const [stats, setStats] = useState<WorkspaceStat[]>([]);

  useEffect(() => {
    let cancelled = false;
    setStats([]);
    fetch(`/api/admin/workspace-summary?workspace=${encodeURIComponent(workspace)}`)
      .then((r) => (r.ok ? r.json() : { stats: [] }))
      .then((j: { stats?: WorkspaceStat[] }) => { if (!cancelled) setStats(j.stats ?? []); })
      .catch(() => { /* the directory below is the page; the strip is an addition to it */ });
    return () => { cancelled = true; };
  }, [workspace]);

  const roles: UserRole[] =
    (session?.user?.roles ?? (session?.user?.role ? [session.user.role] : [])) as UserRole[];
  const isCompanyUser = isInternalUser(session);

  // Show the workspace's own routes. The landing page itself is in the
  // registry too (so the Hub's Workspaces column links to it) — filter
  // it out of the card grid so we don't list "Office" inside Office.
  const routes = accessibleRoutes({ roles, isCompanyUser })
    .filter((r) => r.workspace === workspace)
    .filter((r) => r.href !== meta.href)
    .filter((r) => r.showInRail !== false);

  // Grouped when the workspace declares sections (Money does — §2.2's four groups), flat otherwise.
  // Order comes from first appearance in the registry rather than from a second list: two orderings
  // of the same thing is §1.3's defect, and this file has no business having an opinion about
  // whether "Money in" comes before "Money out".
  const sections: Array<{ title: string | null; routes: typeof routes }> = [];
  for (const r of routes) {
    const title = r.section ?? null;
    const last = sections.find((s) => s.title === title);
    if (last) last.routes.push(r);
    else sections.push({ title, routes: [r] });
  }
  const grouped = sections.some((s) => s.title !== null);

  return (
    <div className="ws-landing">
      <header className="ws-landing__header">
        <h1 className="ws-landing__title">{meta.label}</h1>
        <span className="ws-landing__shortcut">{meta.shortcut}</span>
      </header>
      {stats.length > 0 ? (
        <ul className="ws-landing__stats" aria-label={`${meta.label} at a glance`}>
          {stats.map((s) => (
            <li key={s.label}>
              <Link
                href={s.href}
                className={`ws-landing__stat${s.tone === 'attention' && s.value > 0 ? ' ws-landing__stat--attention' : ''}`}
              >
                <span className="ws-landing__stat-value">{s.value}</span>
                <span className="ws-landing__stat-label">{s.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="ws-landing__subtitle">
        Every page in {meta.label} you can reach — {routes.length} {routes.length === 1 ? 'page' : 'pages'}.
      </p>
      {routes.length === 0 ? (
        <p className="ws-landing__empty">
          No pages in this workspace are accessible with your current
          role + access. Ask an admin if this looks wrong.
        </p>
      ) : (
        sections.map((group) => (
          <section key={group.title ?? '_'} className="ws-landing__section">
            {grouped ? (
              <h2 className="ws-landing__section-title">{group.title ?? 'Everything else'}</h2>
            ) : null}
            <div className="ws-landing__grid">
              {group.routes.map((route) => (
                <Link key={route.href} href={route.href} className="ws-landing__card">
                  <span className="ws-landing__card-label">{route.label}</span>
                  {route.description ? (
                    <span className="ws-landing__card-meta">{route.description}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
