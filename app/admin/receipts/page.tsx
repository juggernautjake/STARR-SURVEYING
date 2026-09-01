'use client';
// app/admin/receipts/page.tsx — the Receipts & Spending portal.
//
// C5 / P2.1 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Owner, named explicitly: *"one portal for receipt management… adding receipts, reviewing receipts,
// and approving and denying receipts or specific items on receipts."*
//
// ── WHAT THIS SLICE IS AND IS NOT ───────────────────────────────────────────────────────────────
//
// This is **P2.1 only**: cards, pass-through and mileage become tabs. The other half of the owner's
// sentence — *"or specific items on receipts"* — is **P2.2**, four separate items in the plan, and
// the doc marks the accounting question behind it as still open. Shipping the tabs does not ship
// per-line approval, and this comment is here so nobody reads the merged portal as the whole
// request having been answered.
//
// ── TWO KINDS OF TAB, AND WHY THEY DO NOT COLLIDE ───────────────────────────────────────────────
//
// The approval queue has its OWN tab strip — pending / approved / rejected / exported / needs
// review — and it stays exactly where it is, inside the queue, on `useState`. Those are FILTERS of
// one list. These are different subjects.
//
// That is not a stylistic distinction; it is why nothing collides. The queue's filter was never in
// the URL, so `?tab=` was free for the portal to take. A filter that had also wanted the query
// string would have needed a name of its own, and the first portal to hit that is the one that will
// have to decide it.
//
// ── THE ROLE SPLIT, WHICH IS NARROWER HERE THAN IN C4 ───────────────────────────────────────────
//
// §5's rule: the portal must not be a wider door than the pages it absorbs. `/admin/cards` and
// `/admin/pass-through` were **admin-only**; the queue and mileage were admin / developer /
// tech_support. The union is the queue's own list, so the registry row is unchanged and the two
// admin-only tabs carry their own gate — a developer opening this portal sees two tabs, not four.

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Receipt, CreditCard, ArrowLeftRight, Car, Camera } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import QueueTab from './_tabs/QueueTab';
import CardsTab from './_tabs/CardsTab';
import RebilledTab from './_tabs/RebilledTab';
import MileageTab from './_tabs/MileageTab';
import './ReceiptsPortal.css';

const PORTAL: PortalSpec = {
  route: '/admin/receipts',
  tabs: [
    { id: 'queue', label: 'Queue', icon: Receipt, hint: 'Receipts waiting on a decision, and everything already decided.' },
    {
      id: 'cards',
      label: 'Cards',
      icon: CreditCard,
      hint: 'Every card the firm has seen on a receipt, and what a charge on it means for the books.',
      // `/admin/cards` was admin-only. Carried across, not widened — a card registry says whose
      // money a charge was, which is the sort of thing §5 rule 1 is about.
      roles: ['admin'],
    },
    {
      id: 'rebilled',
      label: 'Rebilled',
      icon: ArrowLeftRight,
      hint: 'Money paid on a customer’s behalf, and what was billed back. Only a wash when the two match to the cent.',
      // `/admin/pass-through` was admin-only.
      roles: ['admin'],
    },
    { id: 'mileage', label: 'Mileage', icon: Car, hint: 'The other reimbursable — trips logged, and what they are owed.' },
  ],
  defaultTab: 'queue',
};

export default function ReceiptsPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select, tabKeyDown } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="rcp-portal">
      <nav className="rcp-portal__tabs" role="tablist" aria-label="Receipts and spending">
        {tabs.map((t) => {
          const Icon = t.icon as typeof Receipt;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab-id={t.id}
              id={`rcp-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`rcp-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`rcp-portal__tab${isActive ? ' rcp-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={tabKeyDown}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {!active && (
        <p className="rcp-portal__none">
          Every part of Receipts &amp; Spending is switched off for this company. An admin can turn
          them back on in Settings → Pages.
        </p>
      )}

      {activeTab && (
        <div className="rcp-portal__toolbar">
          <p className="rcp-portal__hint">{activeTab.hint}</p>
          {/* The plan's `+ Capture` button. `/admin/receipts/new` stays a ROUTE and keeps its own
            * registry row, deliberately: it is the one surface here that **anyone at the firm** can
            * reach — a crew member holding a fuel receipt is not an admin, and folding it into an
            * admin-gated portal would take it away from the people who file most of them. */}
          <Link className="rcp-portal__action" href="/admin/receipts/new">
            <Camera size={14} aria-hidden /> Capture a receipt
          </Link>
        </div>
      )}

      {/* Only the active panel mounts. The queue alone is 2,400 lines that fetch on mount; rendering
          all four and hiding three would make opening the mileage log pay for the approval queue. */}
      <div id={`rcp-panel-${active}`} role="tabpanel" aria-labelledby={`rcp-tab-${active}`}>
        {active === 'queue' && <QueueTab />}
        {active === 'cards' && <CardsTab />}
        {active === 'rebilled' && <RebilledTab />}
        {active === 'mileage' && <MileageTab />}
      </div>
    </div>
  );
}
