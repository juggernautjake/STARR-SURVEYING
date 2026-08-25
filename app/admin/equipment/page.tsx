'use client';
// app/admin/equipment/page.tsx — the Equipment portal. One cage, one page.
//
// C3 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// §4, P5: *"The most mechanical merge in the document — fourteen links about one cage."*
//
// ── WHAT THIS REPLACED ──────────────────────────────────────────────────────────────────────────
//
// A workspace LANDING: a grid of cards, one per equipment route, whose only job was to get you to
// one of ten sibling pages. That is the shape §1 counted 138 times — the sidebar's problem given a
// second surface rather than solved.
//
// The registry called this route "Catalogue — All firm equipment" and it never was one; it was a
// directory of directories. Worth saying out loud, because a label that has drifted from its page
// is how a nav ends up with fourteen entries nobody can tell apart.
//
// ── THE TAB COMPONENTS MOVED UNTOUCHED ──────────────────────────────────────────────────────────
//
// Every one of these was a `page.tsx` and is now the same file under `_tabs/`, byte for byte apart
// from one import path. `/admin/marketing` set that precedent and gave the reason: *"Rewriting them
// in the same slice that re-arranged them would have made a regression impossible to attribute — if
// a number came out wrong afterwards, nobody could tell whether the consolidation or the rewrite
// did it."* Nine files, ~7,400 lines, and none of their behaviour is this slice's business.
//
// Each one still fetches its own data on mount, which gives the per-tab lazy fetch C2 asked for
// without any coordination: a tab that is not rendered has not mounted, so it has not fetched.
//
// ── AND WHY `inventory` AND `import` ARE NOT TABS ───────────────────────────────────────────────
//
// The plan is explicit: they stay as routes and become buttons. They are both `showInRail: false`
// already — editors you arrive at from the thing you are editing, not places you browse to — and
// `inventory` has three sibling modules it imports relatively, so moving it would have been the one
// mechanical move in this slice that was not mechanical.

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  CalendarClock, ArrowLeftRight, GanttChart, Wrench, Boxes, Files, Sparkles,
  TrendingUp, AlertTriangle, Truck, PackageOpen, Upload,
} from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import EquipmentManagerHub from './EquipmentManagerHub';

import TodayTab from './_tabs/TodayTab';
import CheckInOutTab from './_tabs/CheckInOutTab';
import ScheduleTab from './_tabs/ScheduleTab';
import MaintenanceTab from './_tabs/MaintenanceTab';
import SuppliesTab from './_tabs/SuppliesTab';
import TemplatesTab from './_tabs/TemplatesTab';
import CleanupTab from './_tabs/CleanupTab';
import ValuationTab from './_tabs/ValuationTab';
import AuditTab from './_tabs/AuditTab';
import VehiclesTab from './_tabs/VehiclesTab';
import './EquipmentPortal.css';

// ── THE CONFIGURATION, WHICH IS ALL C2 LEFT TO DO ───────────────────────────────────────────────
//
// Order is operational rather than alphabetical: what is happening today, then what is moving, then
// what is scheduled, then the reference material, then the audit trail. Somebody opening this page
// at 6am is answering "what goes out today", and somebody opening it in the office is answering
// "what did that cost" — the first is the default and the second is three tabs along.
const PORTAL: PortalSpec = {
  route: '/admin/equipment',
  tabs: [
    { id: 'today', label: 'Today', icon: CalendarClock, hint: 'Checkouts and returns due today.' },
    { id: 'check-in-out', label: 'Check in / out', icon: ArrowLeftRight, hint: 'Hand gear to a crew, a vehicle or maintenance — and take it back.' },
    { id: 'schedule', label: 'Schedule', icon: GanttChart, hint: 'Every unit over time, so a double-booking is visible before it happens.' },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench, hint: 'What is due, what is overdue, and what was done.' },
    { id: 'supplies', label: 'Supplies', icon: Boxes, hint: 'Consumables, and what is running out.' },
    { id: 'templates', label: 'Templates', icon: Files, hint: 'The kinds of gear this firm owns.' },
    { id: 'cleanup', label: 'Cleanup queue', icon: Sparkles, hint: 'Templates waiting to be tidied or merged.' },
    { id: 'valuation', label: 'Valuation', icon: TrendingUp, hint: 'What the fleet is worth, and what it has depreciated.' },
    {
      id: 'vehicles',
      label: 'Vehicles',
      icon: Truck,
      hint: 'The truck fleet — condition, mileage and who has which.',
      // Was `/admin/vehicles`, whose registry entry restricted it to these three. Carried across
      // rather than widened: a consolidation that quietly grants access is a consolidation nobody
      // can review, and §3's rule is that merging helps the sidebar and changes nothing else.
      roles: ['admin', 'developer', 'tech_support'],
    },
    { id: 'audit', label: 'Overrides', icon: AlertTriangle, hint: 'Every time somebody overrode a rule, and why.' },
  ],
  defaultTab: 'today',
};

export default function EquipmentPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  // No second query parameter — this portal is billing-shaped, not marketing-shaped. A tab that
  // later grows one (a date range on the schedule, say) passes it here and nothing else changes.
  const { active, tabs, select } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="eq-portal">
      {/* E6's command center stays above the tabs and outside them. It is the answer to "what needs
          me right now" across the whole cage, which is a different question from any single tab —
          and putting it inside one would hide it from the nine other places you might be standing. */}
      <EquipmentManagerHub />

      <nav className="eq-portal__tabs" role="tablist" aria-label="Equipment sections">
        {tabs.map((t) => {
          const Icon = t.icon as typeof Truck;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`eq-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`eq-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`eq-portal__tab${isActive ? ' eq-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                // Arrow-key navigation, matching the billing portal. A tablist that cannot be
                // walked with the keyboard is a tablist in markup only.
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                select(next.id);
                document.getElementById(`eq-tab-${next.id}`)?.focus();
              }}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* A viewer who can see NO tab. Every one switched off in Settings, or all of them role-gated
          away. C2 returns null rather than guessing, and this is what that null has to say — an
          empty strip above an empty page would read as the portal being broken. */}
      {!active && (
        <p className="eq-portal__none">
          Every part of Equipment is switched off for this company. An admin can turn them back on in
          Settings → Pages.
        </p>
      )}

      {activeTab && (
        <div className="eq-portal__toolbar">
          <p className="eq-portal__hint">{activeTab.hint}</p>
          {/* The plan's two buttons. Editors you arrive at from what you are editing, not places you
              browse to — which is why they were already `showInRail: false` and why they are here
              rather than in the strip. */}
          <div className="eq-portal__actions">
            <Link className="eq-portal__action" href="/admin/equipment/inventory">
              <PackageOpen size={14} aria-hidden /> Edit inventory
            </Link>
            <Link className="eq-portal__action" href="/admin/equipment/import">
              <Upload size={14} aria-hidden /> Import
            </Link>
          </div>
        </div>
      )}

      {/* Only the active panel is mounted. That IS the per-tab lazy fetch: each of these components
          fetches on mount, so a tab nobody opened has cost nothing. Rendering all ten and hiding
          nine would fire ten requests to show one. */}
      <div id={`eq-panel-${active}`} role="tabpanel" aria-labelledby={`eq-tab-${active}`}>
        {active === 'today' && <TodayTab />}
        {active === 'check-in-out' && <CheckInOutTab />}
        {active === 'schedule' && <ScheduleTab />}
        {active === 'maintenance' && <MaintenanceTab />}
        {active === 'supplies' && <SuppliesTab />}
        {active === 'templates' && <TemplatesTab />}
        {active === 'cleanup' && <CleanupTab />}
        {active === 'valuation' && <ValuationTab />}
        {active === 'vehicles' && <VehiclesTab />}
        {active === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}
