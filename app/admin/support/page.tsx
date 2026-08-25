'use client';
// app/admin/support/page.tsx — the System portal.
//
// C12a / P15 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Three routes about the software itself: your support tickets, what has gone wrong, and who did
// what. §8 calls this one "developer-facing; low traffic; low risk", and the first two of those are
// true — the third turned out to need checking rather than believing.
//
// ── §5 GOES THE OTHER WAY HERE, AND THE ANSWER IS THE PORTAL'S TAB LIST ─────────────────────────
//
// `/admin/error-log` has its own middleware entry — admin, developer, tech_support — and
// `/admin/support` has none at all. So this portal IS a wider door than one of the pages it absorbs,
// which §5 forbids unless the boundary is elsewhere and holds. It is, and the measurement is more
// interesting than a refusal would have been:
//
//   · `GET /api/admin/errors` answers 200 to anybody signed in and filters rows to `user_email`
//     unless the caller is an admin asking for the admin view. Non-admins have always been allowed
//     to read their own error reports; what they could not do is reach the page that draws them.
//   · `GET /api/admin/audit` answers 200 too, then looks up the caller's org membership and returns
//     `{ rows: [] }` unless they are an admin of that org.
//
// Both protect with a ROW FILTER rather than a status code, which is a legitimate pattern and one a
// probe that only reads status codes will report as a hole. It is not one. What it does mean is that
// the tab list is doing real work here: without it a non-admin would be offered an audit tab that
// can only ever be empty, which is its own small lie.
//
// ── THE RECORD STAYS ────────────────────────────────────────────────────────────────────────────
//
// `/admin/support/tickets/[id]` is a ticket — a record, and §4 says a record is not a tab. It keeps
// its route under the same prefix it always had.

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { LifeBuoy, TriangleAlert, ScrollText, MessageSquarePlus } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import TicketsTab from './_tabs/TicketsTab';
import ErrorLogTab from './_tabs/ErrorLogTab';
import AuditTab from './_tabs/AuditTab';
import './SupportPortal.css';

const PORTAL: PortalSpec = {
  route: '/admin/support',
  tabs: [
    // Ungated, as the support page always was: asking for help cannot require a role, for the same
    // reason C9 kept the role-request board open.
    { id: 'tickets', label: 'Support', icon: LifeBuoy, hint: 'Ask for help, and follow what you have already asked.' },
    // Both carry their registry row's exact list. See the header for why that list is a courtesy
    // over a boundary rather than the boundary itself.
    //
    // The hints are verbatim from the rows these replace, and that is load-bearing rather than tidy.
    // §2.6 says five surfaces answer "what happened and who did it" and each has to say WHICH
    // question it answers; those sentences lived in the registry descriptions, and a portal that
    // summarised them into "what went wrong" would put the product back to four logs and no map.
    // C7 moved the Activity feed's sentence to its tab hint for the same reason. A hint is better
    // placed than a description anyway: it is read above the thing itself, not in a menu tooltip.
    { id: 'error-log', label: 'Errors', icon: TriangleAlert, hint: 'Errors the software itself hit — stack traces and failed requests. For who-did-what, see the Audit log; for what the crew did, the Activity feed in Jobs.', roles: ['admin', 'developer', 'tech_support'] },
    { id: 'audit', label: 'Audit log', icon: ScrollText, hint: 'Who did what, and when — permission changes, record edits, operator access. The one to open for a compliance question.', roles: ['admin', 'developer', 'tech_support'] },
  ],
  defaultTab: 'tickets',
};

export default function SupportPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="sys-portal">
      <nav className="sys-portal__tabs" role="tablist" aria-label="System">
        {tabs.map((t) => {
          const Icon = t.icon as typeof LifeBuoy;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`sys-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`sys-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`sys-portal__tab${isActive ? ' sys-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                select(next.id);
                document.getElementById(`sys-tab-${next.id}`)?.focus();
              }}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Cannot happen while `tickets` is ungated, and kept for the same reason as every other
          portal's: "cannot happen" is a property of today's role lists, not of this component. */}
      {!active && (
        <p className="sys-portal__none">
          Every part of System is switched off for this company. An admin can turn them back on in
          Settings → Pages.
        </p>
      )}

      {activeTab && (
        <div className="sys-portal__toolbar">
          <p className="sys-portal__hint">{activeTab.hint}</p>
          {/* `/admin/support/new` keeps its route and becomes a button, the way §8 asks: raising a
            * ticket is a form you start from the list, and it is 316 lines of one. */}
          {active === 'tickets' && (
            <Link className="sys-portal__action" href="/admin/support/new">
              <MessageSquarePlus size={14} aria-hidden /> New ticket
            </Link>
          )}
        </div>
      )}

      <div id={`sys-panel-${active}`} role="tabpanel" aria-labelledby={`sys-tab-${active}`}>
        {active === 'tickets' && <TicketsTab />}
        {active === 'error-log' && <ErrorLogTab />}
        {active === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}
