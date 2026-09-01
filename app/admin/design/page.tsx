'use client';
// app/admin/design/page.tsx — the Page Designer portal.
//
// C12c / P17 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// ── §8's STATED REASON FOR THIS SLICE IS NOT TRUE, AND THE SLICE IS STILL WORTH DOING ───────────
//
// §8 says: *"six sidebar links for one internal tool is exactly the complaint being answered."*
// Measured before building on it: the rail shows **one** design link. Five of the six rows are
// already `showInRail: false`, so there was never a sidebar to shorten. §8 also implies the boards
// are hard to move between; every one of them already carried a back-link to this page.
//
// So the honest justification is smaller and different from the one written down. The Page Designer
// is the tenth surface in this plan to hold several boards under one subject, and it is the only one
// that makes you go back to a hub between them. Four tabs is one click where there were two, and it
// is the shape a person has now learned on nine other pages. That is worth a slice; six-links-to-one
// was not, and repeating a reason that measurement has already contradicted would be worse than
// having no reason at all.
//
// §8's OTHER argument does survive, and it is the one that matters: *"the fact that the tool is mine
// to maintain is not a reason to exempt it from the rule in §3."* Agreed — which is why the premise
// being wrong is recorded rather than used as a way out.
//
// ── TWO OF THE FIVE KEEP THEIR ROUTES, FOR STRUCTURAL REASONS RATHER THAN PREFERENCE ────────────
//
//   · `/admin/design/serve` renders a design AT REAL SIZE, deliberately without chrome — that is the
//     entire point of it. A tab strip above a design pretending to be a page would make the thing it
//     exists to show untrue. Same reasoning §8 gives for an exam sitting.
//   · `/admin/design/conformance` is a SERVER component that reads `conformance.generated.json` with
//     `node:fs` at request time. As a tab it would need either `node:fs` in the browser bundle — the
//     exact trap C9 hit — or the numbers frozen into the build. It keeps its route and is offered as
//     a link from the toolbar, which is what it already was.
//
// `/admin/design/[id]` is one design: a record, and §4 says a record is not a tab.
//
// ── EVERY TAB HERE IS admin + developer, INHERITED RATHER THAN CHOSEN ───────────────────────────
//
// All six rows carried `['admin', 'developer']` and `middleware.ts` gates `/admin/design` to the
// same pair. So §5 costs nothing: the portal opens exactly as wide as what it holds, and no role
// list moved.

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { LayoutDashboard, Layers, FileText, Rocket, Gauge } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import HomeTab from './_tabs/HomeTab';
import CompareTab from './_tabs/CompareTab';
import DossiersTab from './_tabs/DossiersTab';
import VersionsTab from './_tabs/VersionsTab';
import './DesignPortal.css';

const PORTAL: PortalSpec = {
  route: '/admin/design',
  tabs: [
    { id: 'pages', label: 'Pages', icon: LayoutDashboard, hint: 'Every page, its designs, and which one is the record.' },
    { id: 'compare', label: 'Compare', icon: Layers, hint: 'Every version of one page, side by side, under any theme.' },
    { id: 'dossiers', label: 'Dossiers', icon: FileText, hint: 'What each page is for, what it does, and everything on it.' },
    { id: 'versions', label: 'Site versions', icon: Rocket, hint: 'A named set of designs across many pages, published in one action.' },
  ],
  defaultTab: 'pages',
};

export default function DesignPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select, tabKeyDown } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="dsg-portal">
      <nav className="dsg-portal__tabs" role="tablist" aria-label="Page Designer">
        {tabs.map((t) => {
          const Icon = t.icon as typeof LayoutDashboard;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab-id={t.id}
              id={`dsg-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`dsg-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`dsg-portal__tab${isActive ? ' dsg-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={tabKeyDown}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Cannot happen while every tab is admin+developer and the route is too, and kept for the
          same reason as every other portal's: "cannot happen" is a property of today's role lists,
          not of this component. */}
      {!active && (
        <p className="dsg-portal__none">
          Every part of the Page Designer is switched off for this company. An admin can turn them
          back on in Settings → Pages.
        </p>
      )}

      {activeTab && (
        <div className="dsg-portal__toolbar">
          <p className="dsg-portal__hint">{activeTab.hint}</p>
          {/* Conformance is a link rather than a tab — see the header. Offered here so it is one
            * click from anywhere in the tool rather than only from the Pages board. */}
          <Link className="dsg-portal__action" href="/admin/design/conformance">
            <Gauge size={14} aria-hidden /> Conformance
          </Link>
        </div>
      )}

      <div id={`dsg-panel-${active}`} role="tabpanel" aria-labelledby={`dsg-tab-${active}`}>
        {active === 'pages' && <HomeTab />}
        {active === 'compare' && <CompareTab />}
        {active === 'dossiers' && <DossiersTab />}
        {active === 'versions' && <VersionsTab />}
      </div>
    </div>
  );
}
