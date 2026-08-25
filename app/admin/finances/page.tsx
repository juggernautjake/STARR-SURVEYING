'use client';
// app/admin/finances/page.tsx — the Books & Tax portal.
//
// C8 / P7 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Four surfaces that answer one question — *what did the firm make, and what does it owe* — split
// across two workspaces' worth of history. §2.2's finding, in miniature: "Finances" meant job
// profitability, "Money Overview" meant the monthly totals, "Bank Reconciliation" meant the CSV
// queue, and the payout tax report sat under Payouts because that is where the data came from
// rather than because that is where somebody looks for it.
//
// ── ONE TAB CHANGES ITS MIDDLEWARE GATE, AND IT IS A WIDENING ───────────────────────────────────
//
// `/admin/payouts/tax-report` was admin-only, under the `/admin/payouts` prefix. As a tab of this
// portal its ROUTE gate becomes `/admin/finances`'s — admin, developer, tech_support.
//
// §5's first rule is about exactly this, so it is written down rather than noticed later: the tab
// carries `roles: ['admin']`, `resolveTab` will not open a tab the viewer may not see, and the
// report's own endpoint keeps every check it had. The redirect stub at `/admin/payouts/tax-report`
// still sits behind the payouts gate, so the old URL is no looser than it was.
//
// What a developer gains is the ability to reach a portal whose tax tab they cannot open. What they
// do not gain is the report.

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Briefcase, PieChart, Scale, FileSpreadsheet , FileBarChart } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import ScheduleCTab from './_tabs/ScheduleCTab';
import OverviewTab from './_tabs/OverviewTab';
import ReconcileTab from './_tabs/ReconcileTab';
import PayrollTaxTab from './_tabs/PayrollTaxTab';
import ReportsTab from './_tabs/ReportsTab';
import './FinancesPortal.css';

const BOOKS = ['admin', 'developer', 'tech_support'];

const PORTAL: PortalSpec = {
  route: '/admin/finances',
  tabs: [
    { id: 'overview', label: 'Overview', icon: PieChart, hint: 'Money in against money out, month by month.', roles: BOOKS as never },
    { id: 'schedule-c', label: 'Job profitability', icon: Briefcase, hint: 'What each job cost and what it earned. NOT invoicing — this is the margin.', roles: BOOKS as never },
    { id: 'reconcile', label: 'Reconcile', icon: Scale, hint: 'Bank rows waiting to be matched to something the firm recorded.', roles: BOOKS as never },
    // `/admin/payouts/tax-report` was admin-only. Carried across exactly — see the header.
    { id: 'payroll-tax', label: 'Payroll tax', icon: FileSpreadsheet, hint: 'What was withheld and what is owed, per person, per period.', roles: ['admin'] },
    // C13c / §4's addendum: "it is a financial report". Same middleware entry and the same three
    // roles as this portal, so nothing moved in either direction — the cleanest §5 match in the
    // plan. /admin/reports/job keeps its own route beneath the old path.
    { id: 'reports', label: 'Reports', icon: FileBarChart, hint: 'The firm as numbers — people, jobs and operations, over a period you choose.', roles: BOOKS as never },
  ],
  // The month's totals, not the per-job margin: somebody opening the books is usually answering
  // "how did we do", and the job-level answer is one tab along.
  defaultTab: 'overview',
};

export default function FinancesPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="fin-portal">
      <nav className="fin-portal__tabs" role="tablist" aria-label="Books and tax">
        {tabs.map((t) => {
          const Icon = t.icon as typeof PieChart;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`fin-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`fin-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`fin-portal__tab${isActive ? ' fin-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                select(next.id);
                document.getElementById(`fin-tab-${next.id}`)?.focus();
              }}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {!active && (
        <p className="fin-portal__none">
          Every part of Books &amp; Tax is switched off for this company. An admin can turn them back
          on in Settings → Pages.
        </p>
      )}

      {activeTab && <p className="fin-portal__hint">{activeTab.hint}</p>}

      <div id={`fin-panel-${active}`} role="tabpanel" aria-labelledby={`fin-tab-${active}`}>
        {active === 'overview' && <OverviewTab />}
        {active === 'schedule-c' && <ScheduleCTab />}
        {active === 'reconcile' && <ReconcileTab />}
        {active === 'payroll-tax' && <PayrollTaxTab />}
        {active === 'reports' && <ReportsTab />}
      </div>
    </div>
  );
}
