'use client';
// app/admin/invoicing/page.tsx — the Customer Money portal.
//
// C8 / P8 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Everything about money coming IN from a customer: the invoices, what has not been paid, what
// arrived and has not been matched, and the categories invoice lines are built from.
//
// §2.2 is why the label matters as much as the merge. "Billing" meant the subscription this firm
// pays for the software; "Invoicing" means what its customers pay it. Four rows spread that
// distinction thinner every time somebody added one.
//
// ── ONE TAB IS NARROWER THAN THE PORTAL, AND STAYS THAT WAY ─────────────────────────────────────
//
// `/admin/receivables` was `['admin','developer']` — no `tech_support` — while the other three are
// `['admin','developer','tech_support']`. Carried across exactly: the `collections` tab keeps the
// narrower list, so a `tech_support` account opening this portal sees three tabs and not four.
//
// §5's first rule cuts both ways, and this is the direction that is easy to get wrong by being
// tidy: rounding `collections` up to the portal's list would have handed somebody a list of what
// every customer owes, as a side effect of a navigation change nobody would review for that.

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { FileText, Banknote, Inbox, Tags, FilePlus } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import InvoicesTab from './_tabs/InvoicesTab';
import CollectionsTab from './_tabs/CollectionsTab';
import IncomingTab from './_tabs/IncomingTab';
import CategoriesTab from './_tabs/CategoriesTab';
import './InvoicingPortal.css';

const MONEY_IN = ['admin', 'developer', 'tech_support'];

const PORTAL: PortalSpec = {
  route: '/admin/invoicing',
  tabs: [
    { id: 'invoices', label: 'Invoices', icon: FileText, hint: 'What the firm has billed its customers, and where each one stands.', roles: MONEY_IN as never },
    // `/admin/receivables` was ['admin','developer'] — see the header.
    { id: 'collections', label: 'Collections', icon: Banknote, hint: 'What is overdue, by how long, and who owes it.', roles: ['admin', 'developer'] },
    { id: 'incoming', label: 'Incoming', icon: Inbox, hint: 'Payments that arrived and have not been matched to an invoice yet.', roles: MONEY_IN as never },
    { id: 'categories', label: 'Categories', icon: Tags, hint: 'The line items invoices are built from.', roles: MONEY_IN as never },
  ],
  defaultTab: 'invoices',
};

export default function InvoicingPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="inv-portal">
      <nav className="inv-portal__tabs" role="tablist" aria-label="Customer money">
        {tabs.map((t) => {
          const Icon = t.icon as typeof FileText;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`inv-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`inv-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`inv-portal__tab${isActive ? ' inv-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                select(next.id);
                document.getElementById(`inv-tab-${next.id}`)?.focus();
              }}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {!active && (
        <p className="inv-portal__none">
          Every part of Customer Money is switched off for this company. An admin can turn them back
          on in Settings → Pages.
        </p>
      )}

      {activeTab && (
        <div className="inv-portal__toolbar">
          <p className="inv-portal__hint">{activeTab.hint}</p>
          {/* The plan's button. `/admin/invoices/new` keeps its route — it is 889 lines of composer
            * and a thing you arrive at from the invoice list, not a place you browse to. */}
          {active === 'invoices' && (
            <Link className="inv-portal__action" href="/admin/invoices/new">
              <FilePlus size={14} aria-hidden /> New invoice
            </Link>
          )}
        </div>
      )}

      <div id={`inv-panel-${active}`} role="tabpanel" aria-labelledby={`inv-tab-${active}`}>
        {active === 'invoices' && <InvoicesTab />}
        {active === 'collections' && <CollectionsTab />}
        {active === 'incoming' && <IncomingTab />}
        {active === 'categories' && <CategoriesTab />}
      </div>
    </div>
  );
}
