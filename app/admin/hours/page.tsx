'use client';
// app/admin/hours/page.tsx — the Hours & Time portal. The first one that proves §5.
//
// C4 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// §4, P3: *"The dossiers show /admin/my-hours and /admin/hours-approval already call the same three
// APIs — time-logs, time-logs/advances, time-logs/lock-period. They are one screen with two
// permission levels, built twice."*
//
// ── §5's THREE RULES, AND WHY THE FIRST ONE IS THE DANGEROUS ONE ────────────────────────────────
//
// *"A portal reachable by six roles whose tabs are gated to one is a WIDER door than six separately
// gated pages, and it is the single most dangerous thing in this plan."*
//
// So every tab below carries the EXACT role list its page carried, copied across rather than
// rewritten. `approvals` was admin / developer / tech_support and still is. `availability` was those
// three plus equipment_manager and still is. Nothing was widened, tidied or rounded up, and the test
// beside this asserts each list against the registry's own history rather than against my memory.
//
// **Rule 2 — never render an empty portal.** The registry gates a ROUTE, not a tab, so a portal
// whose entry is visible to somebody with no visible tab would be a dead link in their sidebar. That
// cannot happen here, and not by luck: `time-off` was ungated — every employee could request leave —
// so the union of the four role lists is everybody, and everybody has at least that tab. The
// registry entry therefore carries no `roles` at all, which is the honest expression of the union
// rather than a widening of it.
//
// **Rule 3 — the default is per role, and the URL still wins.** An admin lands on the approval
// queue, a dispatcher on availability, everybody else on their own timesheet. But
// `/admin/hours?tab=approvals` sent to a field crew member opens `my-time` instead — a default is a
// courtesy, and C2's `resolveTab` will not open a tab somebody may not see.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
//
// It does not merge `my-time` and `approvals` into one screen with conditional bits. They are the
// same DATA at two permission levels, and §5 says to collapse the pair into one portal with a
// role-chosen default — not to interleave two 1,600-line components and hope the conditionals are
// right. The merge that matters is the one in the sidebar.

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Clock, CheckSquare, Palmtree, CalendarClock, ClipboardList, Users } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import MyHoursPanel from '../my-hours/MyHoursPanel';
import ApprovalsTab from './_tabs/ApprovalsTab';
import AssignmentsTab from './_tabs/AssignmentsTab';
import TeamTab from './_tabs/TeamTab';
import TimeOffTab from './_tabs/TimeOffTab';
import AvailabilityClient from '../availability/AvailabilityClient';
import '../availability/Availability.css';
import './HoursPortal.css';

/**
 * Who decides hours rather than logs them.
 *
 * Named because it is used twice — the `approvals` tab's gate and the per-role default — and two
 * hand-written copies of one role list is how a default sends somebody to a tab they cannot see.
 */
const APPROVERS = ['admin', 'developer', 'tech_support'];

const PORTAL: PortalSpec = {
  route: '/admin/hours',
  tabs: [
    {
      id: 'my-time',
      label: 'My time',
      icon: Clock,
      hint: 'Your clock-in log and timesheet — and where you fix a missed clock-out.',
      // `/admin/my-hours`, verbatim: [...WORK_ROLES, 'employee', 'tech_support'].
      roles: ['admin', 'developer', 'field_crew', 'employee', 'tech_support'],
    },
    {
      // ── C13d / §4's addendum: "who is working, and on what" ─────────────────────────────────
      //
      // Second, beside My time, because they are the same question asked two ways: what am I meant
      // to be doing, and what did I do. The API scopes a non-admin to their own rows, so this is a
      // personal surface joining the personal portal — the opposite of the four merges this plan
      // has stopped at that line.
      id: 'assignments',
      label: 'Assignments',
      icon: ClipboardList,
      hint: 'What has been given to you to do — and, if you approve hours, what you have given out.',
      // `/admin/assignments`, verbatim: [...WORK_ROLES, 'employee', 'researcher', 'tech_support'].
      roles: ['admin', 'developer', 'field_crew', 'employee', 'researcher', 'tech_support'],
    },
    {
      id: 'approvals',
      label: 'Approvals',
      icon: CheckSquare,
      hint: 'Submitted timesheets waiting on a decision.',
      // `/admin/hours-approval`, verbatim.
      roles: APPROVERS as never,
    },
    {
      // ── C13e / §4's addendum: "who is working, and on what" ─────────────────────────────────
      //
      // After Approvals, because it is the same session: who is on the clock right now, and whose
      // timesheet is waiting on you.
      //
      // [admin, tech_support] rather than the row's three. The API has always admitted exactly those
      // two — a `developer` was offered the page and refused by every fetch on it — so this is C10's
      // bring-the-door-to-the-boundary, not a narrowing of anything that worked.
      id: 'team',
      label: 'Field team',
      icon: Users,
      hint: 'Who is on the clock, where, and how to reach them.',
      roles: ['admin', 'tech_support'],
    },
    {
      id: 'time-off',
      label: 'Time off',
      icon: Palmtree,
      hint: 'Request leave and see your balance. Managers get the approval queue here too.',
      // `/admin/time-off` had NO role list — every employee may ask for leave. Left ungated on
      // purpose: adding one here would be this slice narrowing a door while claiming to merge one,
      // which is the same sin as widening it and harder to notice.
    },
    {
      id: 'availability',
      label: 'Availability',
      icon: CalendarClock,
      hint: 'Who and what can go out on one day — crew, equipment and vehicles together.',
      // `/admin/availability`, verbatim.
      roles: ['admin', 'developer', 'tech_support', 'equipment_manager'],
    },
  ],
  // §5 rule 3. An approver opens on the queue that is waiting for them; a dispatcher on the day they
  // are planning; everybody else on their own hours, which is the only tab most people ever want.
  defaultTab: (roles) => {
    if (roles.some((r) => APPROVERS.includes(r))) return 'approvals';
    if (roles.includes('equipment_manager')) return 'availability';
    return 'my-time';
  },
};

export default function HoursPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="hrs-portal">
      <nav className="hrs-portal__tabs" role="tablist" aria-label="Hours and time">
        {tabs.map((t) => {
          const Icon = t.icon as typeof Clock;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`hrs-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`hrs-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`hrs-portal__tab${isActive ? ' hrs-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                select(next.id);
                document.getElementById(`hrs-tab-${next.id}`)?.focus();
              }}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Cannot happen while `time-off` is ungated — see the header. Kept anyway, because "cannot
          happen" is a property of today's role lists and not of this component, and the day somebody
          gates that tab is the day this branch stops being dead code. */}
      {!active && (
        <p className="hrs-portal__none">
          Every part of Hours &amp; Time is switched off for this company. An admin can turn them back
          on in Settings → Pages.
        </p>
      )}

      {activeTab && <p className="hrs-portal__hint">{activeTab.hint}</p>}

      {/* Only the active panel mounts. `approvals` is 1,600 lines that fetch three endpoints on
          mount, and rendering it behind a hidden div for everybody who opened their own timesheet
          would make the common case pay for the rare one. */}
      <div id={`hrs-panel-${active}`} role="tabpanel" aria-labelledby={`hrs-tab-${active}`}>
        {active === 'my-time' && <MyHoursPanel />}
        {active === 'assignments' && <AssignmentsTab />}
        {active === 'approvals' && <ApprovalsTab />}
        {active === 'team' && <TeamTab />}
        {active === 'time-off' && <TimeOffTab />}
        {active === 'availability' && <AvailabilityClient />}
      </div>
    </div>
  );
}
