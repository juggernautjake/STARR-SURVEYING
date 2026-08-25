'use client';
// app/admin/research/page.tsx — the Research portal.
//
// C11b / P13 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Seven routes describing one subject. The projects list keeps the front door and the other six —
// coverage, the document library, the data sources, site health, the pipeline dashboard and the
// research billing rollup — become tabs beside it.
//
// ── WHAT DELIBERATELY DID NOT COME ──────────────────────────────────────────────────────────────
//
//   · `/admin/research/[projectId]` — 3,654 lines, and §8 calls it untouched. A project IS a record,
//     and §4 says a record is not a tab.
//   · `/admin/research/testing` — a lab. It also has its OWN middleware entry, three roles rather
//     than six, listed BEFORE `/admin/research` so it wins the prefix match. Absorbing it would have
//     widened it from three roles to six, which is exactly what §5 forbids.
//   · `/admin/cad` — its own shell.
//
// ── §5, AND THE ONE THING THAT ACTUALLY MOVED ───────────────────────────────────────────────────
//
// All six absorbed pages already sat behind the same middleware prefix as this one — `/admin/research`
// gates to six roles, and none of the six had a narrower entry. So the DOOR does not move at all;
// what the narrower registry rows expressed was nav visibility, not a gate.
//
// C11b-0 is what makes those rows worth carrying onto tabs. Before it, five of the six endpoints
// behind these screens answered any signed-in account — the role gate everybody could see on
// `/admin/research` ran on page paths only and was never in front of the data. It is now, so a tab
// list here is a courtesy over a boundary that holds rather than a courtesy over nothing.
//
// ── THE ONE PACKAGING CONSEQUENCE, RECORDED RATHER THAN DISCOVERED LATER ────────────────────────
//
// `bundleForRoute` reads a PATHNAME. A tab is a query parameter, so a tab cannot carry its own
// bundle: everything here resolves as `/admin/research`, which is `recon`.
//
// Three of the absorbed routes were deliberately bundle-EXEMPT in `ROUTE_BUNDLE_OVERRIDES` —
// pipeline and billing (and testing, which is not here) are marked operator-only, "no customer
// bundle gate". As tabs, pipeline and billing are now inside a `recon`-gated path. That is a real
// change and it is safe for the audience those tools have: `middleware.ts` skips the bundle check
// entirely for `isOperator`, so an operator reaches them regardless of what any org has bought. What
// changes is a non-operator without Recon, who is refused — and who is also not offered the tab and
// is refused by the API since C11b-0. Absorbing a bundle-exempt route into a bundled portal always
// costs this; it is worth knowing before the next portal does it by accident.

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Microscope, Map as MapIcon, Library, Globe, ShieldCheck, Workflow, Receipt } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import ProjectsTab from './_tabs/ProjectsTab';
import CoverageTab from './_tabs/CoverageTab';
import LibraryTab from './_tabs/LibraryTab';
import SitesTab from './_tabs/SitesTab';
import SelfHealTab from './_tabs/SelfHealTab';
import PipelineTab from './_tabs/PipelineTab';
import BillingTab from './_tabs/BillingTab';
import './ResearchPortal.css';

// Each tab carries its old registry row's roles verbatim. They are a courtesy — the door is one
// middleware entry for all seven and the boundary is the API — but the courtesy is the product's own
// statement about who each screen is for, and it survives the move unchanged.
const PORTAL: PortalSpec = {
  route: '/admin/research',
  tabs: [
    { id: 'projects', label: 'Projects', icon: Microscope, hint: 'Every property research project, and where each one has got to.' },
    { id: 'coverage', label: 'Coverage', icon: MapIcon, hint: 'Which counties we can read, and how well.', roles: ['admin', 'developer', 'researcher', 'drawer', 'tech_support'] },
    { id: 'library', label: 'Library', icon: Library, hint: 'Every document the research has pulled, across all projects.', roles: ['admin', 'developer', 'researcher', 'drawer', 'tech_support'] },
    { id: 'sites', label: 'Data sources', icon: Globe, hint: 'Register a county portal — CAD, clerk, plat or GIS — and prove it works.', roles: ['admin', 'developer', 'tech_support'] },
    { id: 'self-heal', label: 'Site health', icon: ShieldCheck, hint: 'Check every county portal at once, and decide what fixes itself.', roles: ['admin', 'developer', 'tech_support'] },
    { id: 'pipeline', label: 'Pipeline', icon: Workflow, hint: 'What the pipeline has run, and what it did.', roles: ['admin', 'developer', 'tech_support'] },
    { id: 'billing', label: 'Billing', icon: Receipt, hint: 'What research has cost, and what has been charged on.', roles: ['admin', 'developer', 'tech_support'] },
  ],
  defaultTab: 'projects',
};

export default function ResearchPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="rsh-portal">
      <nav className="rsh-portal__tabs" role="tablist" aria-label="Research">
        {tabs.map((t) => {
          const Icon = t.icon as typeof Microscope;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`rsh-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`rsh-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`rsh-portal__tab${isActive ? ' rsh-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                select(next.id);
                document.getElementById(`rsh-tab-${next.id}`)?.focus();
              }}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Cannot happen while `projects` is ungated, and kept for the same reason as every other
          portal's: "cannot happen" is a property of today's role lists, not of this component. */}
      {!active && (
        <p className="rsh-portal__none">
          Every part of Research is switched off for this company. An admin can turn them back on in
          Settings → Pages.
        </p>
      )}

      {activeTab && <p className="rsh-portal__hint">{activeTab.hint}</p>}

      {/* One at a time rather than seven hidden with CSS: each fetches on mount, and mounting all
          seven would fire every research query on every visit to answer one question. */}
      <div id={`rsh-panel-${active}`} role="tabpanel" aria-labelledby={`rsh-tab-${active}`}>
        {active === 'projects' && <ProjectsTab />}
        {active === 'coverage' && <CoverageTab />}
        {active === 'library' && <LibraryTab />}
        {active === 'sites' && <SitesTab />}
        {active === 'self-heal' && <SelfHealTab />}
        {active === 'pipeline' && <PipelineTab />}
        {active === 'billing' && <BillingTab />}
      </div>
    </div>
  );
}
