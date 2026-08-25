'use client';
// app/admin/people/page.tsx — the People portal.
//
// C9 / P10 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// §2.3 found **ten routes describing one noun**. The fix at the time was a front door on top of
// them; this is the rest of that fix — the six that are about administering a person become tabs,
// and the directory people actually use stays the default.
//
// ── §4's WARNING, TAKEN LITERALLY ───────────────────────────────────────────────────────────────
//
// *"`/admin/employees` and `/admin/users` are different nouns — a person who works here versus a
// login. They are adjacent, not identical, and the tab labels have to keep that clear."*
//
// So: **Employees** and **Accounts**, not "People" and "Users". The tab hints say which is which in
// the first clause, because a tab strip is read at a glance and a wrong guess here means somebody
// editing the wrong record.
//
// ── THE GATE MOVES DOWN A LEVEL FOR THREE TABS, AND THIS IS THE MOST SENSITIVE PLACE IT HAS ─────
//
// `/admin/users` (middleware: admin, tech_support), `/admin/employees` (admin, developer,
// tech_support) and `/admin/roles` (admin) were gated at the door. `/admin/people` is **not** — the
// middleware's own note says why, and it is the §5 argument in the codebase's words:
//
//     "/admin/people — the staff directory is open to staff BY DESIGN. Its API strips roles and
//      account state for non-admins rather than refusing the request, so a gate here would remove a
//      feature rather than protect one."
//
// It cannot become gated without taking the directory from the crew, and `role-requests` is open for
// a stronger reason still: *asking* for a role has to be available to everyone, or the people who
// most need access are the ones who cannot request it.
//
// So the portal stays open and each tab carries its page's exact list. That is the C4 pattern on the
// product's most sensitive surface, so the replacement was **checked rather than asserted**:
// `/api/admin/users` calls `isAdmin` on GET and POST, `/api/admin/roles/custom` answers 403 to a
// non-admin, and `/api/admin/invites` scopes by `resolveAdminOrg`. What a `field_crew` member gains
// is a portal whose accounts tab they cannot open.
//
// ── AND THE STYLESHEET, FOR THE THIRD PORTAL RUNNING ────────────────────────────────────────────
//
// `app/admin/employees/layout.tsx` exists to import `AdminEmployeeManage.css`. That layout still
// serves `/admin/employees/[email]` and `/admin/employees/manage`, so it stays — but the employees
// TAB is outside its route tree now and would render unstyled with nothing failing.

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Users, UsersRound, KeyRound, UserPlus, ShieldPlus, ShieldQuestion, UserCog } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
// See the header. Without this the employees tab renders as raw browser default.
import '../styles/AdminEmployeeManage.css';

import PeopleDirectory from './PeopleDirectory';
import EmployeesTab from './_tabs/EmployeesTab';
import AccountsTab from './_tabs/AccountsTab';
import InvitesTab from './_tabs/InvitesTab';
import RolesTab from './_tabs/RolesTab';
import RequestsTab from './_tabs/RequestsTab';
import './People.css';
import './PeoplePortal.css';

const PORTAL: PortalSpec = {
  route: '/admin/people',
  tabs: [
    // Ungated, and the default. The middleware note calls this "the most common use of it" — a crew
    // member looking up a colleague's number.
    { id: 'directory', label: 'Directory', icon: Users, hint: 'Everyone at the firm and how to reach them.' },
    { id: 'employees', label: 'Employees', icon: UsersRound, hint: 'People who WORK here — their record, their crew, their status.', roles: ['admin', 'developer', 'tech_support'] },
    { id: 'accounts', label: 'Accounts', icon: KeyRound, hint: 'LOGINS — who can sign in, and what each account may do. Not the same list as Employees.', roles: ['admin', 'tech_support'] },
    { id: 'invites', label: 'Invites', icon: UserPlus, hint: 'People asked to join and not yet signed up.', roles: ['admin', 'tech_support'] },
    { id: 'roles', label: 'Roles', icon: ShieldPlus, hint: 'What each role is allowed to do.', roles: ['admin'] },
    // Ungated, deliberately — see the header. Asking for access cannot require access.
    { id: 'requests', label: 'Requests', icon: ShieldQuestion, hint: 'People asking for a role, and the decision on each.' },
  ],
  defaultTab: 'directory',
};

export default function PeoplePortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="ppl-portal">
      <nav className="ppl-portal__tabs" role="tablist" aria-label="People">
        {tabs.map((t) => {
          const Icon = t.icon as typeof Users;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`ppl-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`ppl-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`ppl-portal__tab${isActive ? ' ppl-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                select(next.id);
                document.getElementById(`ppl-tab-${next.id}`)?.focus();
              }}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Cannot happen while `directory` is ungated, and kept for the same reason as the Hours
          portal's: "cannot happen" is a property of today's role lists, not of this component. */}
      {!active && (
        <p className="ppl-portal__none">
          Every part of People is switched off for this company. An admin can turn them back on in
          Settings → Pages.
        </p>
      )}

      {activeTab && (
        <div className="ppl-portal__toolbar">
          <p className="ppl-portal__hint">{activeTab.hint}</p>
          {/* `/admin/employees/manage` keeps its route — it is a record EDITOR you arrive at from the
            * person you are editing, not a place you browse to, and it lives under the layout that
            * carries its stylesheet. */}
          {active === 'employees' && (
            <Link className="ppl-portal__action" href="/admin/employees/manage">
              <UserCog size={14} aria-hidden /> Manage an employee
            </Link>
          )}
        </div>
      )}

      <div id={`ppl-panel-${active}`} role="tabpanel" aria-labelledby={`ppl-tab-${active}`}>
        {active === 'directory' && <PeopleDirectory />}
        {active === 'employees' && <EmployeesTab />}
        {active === 'accounts' && <AccountsTab />}
        {active === 'invites' && <InvitesTab />}
        {active === 'roles' && <RolesTab />}
        {active === 'requests' && <RequestsTab />}
      </div>
    </div>
  );
}
