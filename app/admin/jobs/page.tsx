'use client';
// app/admin/jobs/page.tsx — the Jobs & Projects portal.
//
// C7 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// ── THE STYLESHEET TRAP, AND THIS TIME THE CODEBASE HAD ALREADY WRITTEN IT DOWN ─────────────────
//
// `app/admin/projects/layout.tsx` carries this note, from the last time somebody hit it:
//
//     "The projects pages were first written against `jobs-page__*`, which is declared in
//      AdminJobs.css — a stylesheet imported by app/admin/jobs/layout.tsx and therefore scoped to
//      the /admin/jobs route tree. Nothing under /admin/projects ever loaded it, so every header,
//      button and title rendered as raw browser default WHILE REPORTING ZERO HORIZONTAL OVERFLOW."
//
// Moving the projects body into this portal reverses the direction and re-creates the same failure:
// `AdminProjects.css` is loaded by the layout of a route that is now a redirect, so the tab would
// render unstyled and nothing would fail. It is imported here. `AdminJobs.css` comes free — this
// portal is inside `app/admin/jobs/`, whose layout still loads it for the job RECORDS.
//
// ── WHY `/admin/calendar` IS NOT A TAB, AND IT IS NOT AN OVERSIGHT ──────────────────────────────
//
// §4's table lists it. Absorbing it would have required one of two things, and both are refused by
// §5's first rule:
//
//   · `/admin/calendar` has **no `roles`** — every signed-in person sees it in their nav today. This
//     portal sits at `/admin/jobs`, whose middleware gate is
//     `['admin','developer','field_crew','researcher','tech_support']`. Absorbing the calendar under
//     that gate TAKES IT AWAY from everybody else, which is the narrowing §5 calls the same sin as
//     widening and harder to notice.
//   · Widening `/admin/jobs` to fix that is worse: middleware matches by PREFIX, and `/admin/jobs`
//     is the prefix of `/admin/jobs/[id]` and `/admin/jobs/[id]/field` — **job records**, which §4
//     says are not touched. It would open a customer's job record to every role in the product as a
//     side effect of a navigation change.
//
// There is no third option: middleware has no way to express "this path but not its dynamic
// children". So the calendar keeps its own route and its own reach, and C13 — which revisits the
// workspaces with the full picture — is the right place to decide where it belongs.

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ListChecks, FolderKanban, Activity, MapPin, FilePlus, FolderPlus, Upload, CloudSun, BadgeCheck } from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
// See the header. Without this, the projects tab renders as raw browser default and says nothing.
import '../styles/AdminProjects.css';

import JobsTab from './_tabs/JobsTab';
import ProjectsTab from './_tabs/ProjectsTab';
import ActivityTab from './_tabs/ActivityTab';
import WeatherTab from './_tabs/WeatherTab';
import ComplianceTab from './_tabs/ComplianceTab';
import FieldDataTab from './_tabs/FieldDataTab';
import './JobsPortal.css';

/** The list four of these pages shared. Named once so the tabs cannot drift from each other. */
const WORK_VIEW = ['admin', 'developer', 'tech_support'];

const PORTAL: PortalSpec = {
  route: '/admin/jobs',
  tabs: [
    { id: 'jobs', label: 'Jobs', icon: ListChecks, hint: 'Every job, its stage, and who is on it.', roles: WORK_VIEW as never },
    { id: 'projects', label: 'Projects', icon: FolderKanban, hint: 'The containers jobs belong to — one client, one site, many jobs.', roles: WORK_VIEW as never },
    { id: 'field-data', label: 'Field data', icon: MapPin, hint: 'What the crews have sent back, and what is still on a collector.', roles: WORK_VIEW as never },
    // The hint carries a distinction the registry description used to: this is a WORKING feed and
    // not a compliance record — the Audit Log is that. §2.6 of the platform audit found five places
    // answering "what happened and who did it", and the fix was to make each one say which question
    // it answers. Losing that sentence in a consolidation would put it back to four logs and no map.
    { id: 'activity', label: 'Activity', icon: Activity, hint: 'What the firm did today — clock-ins, stage changes, uploads. A working feed, not a compliance record: the Audit Log is that.', roles: WORK_VIEW as never },
    // ── C13a: §4's addendum — "can we work, and may we" ──────────────────────────────
    //
    // Weather carries its old row's four roles; compliance carries its three.
    //
    // Compliance's door got WIDER in this move: it had its own three-role middleware entry and
    // /admin/jobs is gated to five. §5 allows that only when the boundary is elsewhere and holds,
    // and it did not — GET /api/admin/compliance answered any signed-in account with the whole
    // register of licences, insurance and instrument calibration, while every write on the same
    // route already called isAdmin. Closed in this slice, before the move.
    //
    // Weather's went the other way: it had no middleware entry at all, so as a tab it is narrower
    // than it was — of a path the nav never offered to the roles losing it.
    { id: 'weather', label: 'Weather', icon: CloudSun, hint: 'What the sky is doing over the jobs, and whether the crews can work.', roles: [...WORK_VIEW, 'field_crew'] as never },
    { id: 'compliance', label: 'Compliance', icon: BadgeCheck, hint: 'Licences, insurance and calibration — what is current, and what lapses next.', roles: WORK_VIEW as never },
  ],
  defaultTab: 'jobs',
};

export default function JobsPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select, tabKeyDown } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);
  const isAdmin = viewer.roles.includes('admin');

  return (
    <div className="jbp-portal">
      <nav className="jbp-portal__tabs" role="tablist" aria-label="Jobs and projects">
        {tabs.map((t) => {
          const Icon = t.icon as typeof ListChecks;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab-id={t.id}
              id={`jbp-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`jbp-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`jbp-portal__tab${isActive ? ' jbp-portal__tab--active' : ''}`}
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
        <p className="jbp-portal__none">
          Every part of Jobs &amp; Projects is switched off for this company. An admin can turn them
          back on in Settings → Pages.
        </p>
      )}

      {activeTab && (
        <div className="jbp-portal__toolbar">
          <p className="jbp-portal__hint">{activeTab.hint}</p>
          {/* The plan's three buttons, each on the tab it belongs to and only for admins — all three
            * routes are admin-gated in middleware, and a button that bounces you is worse than one
            * that is honestly absent. */}
          {isAdmin && active === 'jobs' && (
            <div className="jbp-portal__actions">
              <Link className="jbp-portal__action" href="/admin/jobs/new">
                <FilePlus size={14} aria-hidden /> New job
              </Link>
              <Link className="jbp-portal__action" href="/admin/jobs/import">
                <Upload size={14} aria-hidden /> Import
              </Link>
            </div>
          )}
          {isAdmin && active === 'projects' && (
            <div className="jbp-portal__actions">
              <Link className="jbp-portal__action" href="/admin/projects/new">
                <FolderPlus size={14} aria-hidden /> New project
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Only the active panel mounts. The jobs list and the activity feed each fetch on mount, and
          the field-data tab opens a live feed — rendering all four would start that feed for
          somebody who came to look at a project. */}
      <div id={`jbp-panel-${active}`} role="tabpanel" aria-labelledby={`jbp-tab-${active}`}>
        {active === 'jobs' && <JobsTab />}
        {active === 'projects' && <ProjectsTab />}
        {active === 'field-data' && <FieldDataTab />}
        {active === 'activity' && <ActivityTab />}
        {active === 'weather' && <WeatherTab />}
        {active === 'compliance' && <ComplianceTab />}
      </div>
    </div>
  );
}
