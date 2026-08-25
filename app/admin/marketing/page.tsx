'use client';
// /admin/marketing — one advertising page with tabs. A1.
//
// Owner, 2026-08-11: *"We want it so that we can combine the advertising pages into one page that
// has tabs for the different advertising elements that we need to manage."*
//
// ── WHAT WAS WRONG WITH FOUR PAGES ──────────────────────────────────────────────────────────────
//
// They were four routes and four nav entries — Marketing, Ad spend, Ad conversions, Ad upload log —
// and the split was by *implementation*, not by anything a person thinks about. "Did the ads work
// this month?" needs the dashboard and the spend page; "why is Google's number lower than ours?"
// needs the upload log and the exports page. Every real question crossed two pages, and the nav
// gave no clue which two.
//
// ── THE TAB STATE LIVES IN THE URL ──────────────────────────────────────────────────────────────
//
// `?tab=spend`, not component state. Three things depend on it: a reload keeps you where you were,
// the browser's back button steps between tabs the way people expect, and — the one that matters
// most here — a tab is a link somebody can send. "Look at the upload log" should be a URL, not four
// words of instructions.
//
// It also makes the redirects honest: the old routes still exist and now point at their tab, so
// every bookmark, every link in an old email, and the registry's keywords all keep working.
//
// ── WHY THE BODIES DID NOT CHANGE ───────────────────────────────────────────────────────────────
//
// The four page components moved to `_tabs/` untouched. Rewriting them in the same slice that
// re-arranged them would have made a regression impossible to attribute: if a number came out wrong
// afterwards, nobody could tell whether the consolidation or the rewrite did it. A2–A5 change what
// is inside them; this slice only changes where they live.

// ── C10: §5's ARITHMETIC CAME OUT BACKWARDS HERE, AND THE ANSWER WAS TO FIX THE DOOR ────────────
//
// Every slice before this one asked "does the portal open wider than the pages it absorbs?" and
// carried role lists onto tabs. Here the absorbed page had the WIDER door: middleware let `admin`,
// `developer` and `tech_support` into `/admin/leads`, and the nav offered it to all three, while
// `/admin/marketing` has always been `admin` alone.
//
// So the plan's move looked like a narrowing. It is not, and checking rather than assuming is what
// showed why: **all nine `/api/admin/leads/*` endpoints call `isAdmin`, which is `admin` alone.** A
// `developer` who followed that nav link got the page and a 403 from every fetch on it. The door has
// been wider than the boundary for as long as both have existed, and what the two extra roles were
// offered is an empty board.
//
// §5.1 says hiding an element is a courtesy and refusing the request is the boundary. The boundary
// here says `admin`, and moving it is a product decision about who may see leads — not one a
// consolidation slice gets to make. So the door came to the boundary: `/admin/leads` is `['admin']`
// in middleware now, matching what its API has always enforced. Nobody loses a working page,
// because nobody outside `admin` ever had one.

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { BarChart3, DollarSign, Upload, FileDown, Inbox } from 'lucide-react';

import RangePicker from './RangePicker';
import AdsAccessBanner from './AdsAccessBanner';
import { rangeFromParams, rangeToParams, type DateRange } from '@/lib/marketing/date-range';
import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
import DashboardTab from './_tabs/DashboardTab';
import SpendTab from './_tabs/SpendTab';
import UploadsTab from './_tabs/UploadsTab';
import ExportsTab from './_tabs/ExportsTab';
import LeadsTab from './_tabs/LeadsTab';
import './Marketing.css';

const TABS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: BarChart3,
    hint: 'Funnel, cost per stage, attribution coverage.',
  },
  {
    // C10 — `/admin/leads`, absorbed. Second rather than last because the strip now reads in the
    // funnel's order: what the ads did, who they produced, what they cost, what we sent back to
    // Google, and whether the sending worked.
    id: 'leads',
    label: 'Leads',
    icon: Inbox,
    hint: 'Everyone who has asked us for something, and who still owes them a call.',
  },
  {
    id: 'spend',
    label: 'Spend',
    icon: DollarSign,
    hint: 'What the ads cost — imported nightly, or typed from the invoice.',
  },
  {
    id: 'conversions',
    label: 'Conversions',
    icon: FileDown,
    hint: 'Download offline conversions for Google Ads.',
  },
  {
    id: 'uploads',
    // Renamed 2026-08-17. It was "Upload log", which describes half of what the tab holds and not
    // the half people go looking for: connecting and RECONNECTING the Google Ads account lives here
    // too. Owner: *"I am not seeing the connect / reconnect google ads button on the marketing
    // page"* — it was on this tab the whole time, behind a name that gave no reason to open it.
    label: 'Connection & uploads',
    icon: Upload,
    hint: 'Connect or reconnect Google Ads, and see what the nightly upload sent or Google rejected.',
  },
];

type TabId = 'overview' | 'leads' | 'spend' | 'conversions' | 'uploads';

// ── C2 ────────────────────────────────────────────────────────────────────────────────────────
//
// This page is the reason the shell's URL writer takes an argument at all. It keeps a DATE RANGE in
// the query string beside the tab, and it had one writer for the whole string precisely because
// each of its four predecessor pages owned its own pair of date inputs — so changing the tab
// dropped the period. `portalHref` takes those other parameters, so that bug cannot come back
// inside the thing extracted from the page that had it.
const PORTAL: PortalSpec = { route: '/admin/marketing', tabs: TABS, defaultTab: 'overview' };

export default function MarketingPage(): React.ReactElement {
  const params = useSearchParams();
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  // A2 — the period, also from the URL. Resolved on every render against a fresh clock, which is
  // what makes `?preset=this-month` show September in September rather than freezing on the month
  // the link was made. See lib/marketing/date-range.ts.
  const range = useMemo(() => rangeFromParams(params, new Date()), [params]);

  // The period, as query parameters, handed to the shell so a tab change carries it. This is the
  // "one writer for the whole query string" property, now enforced by the shell rather than by this
  // page remembering to do it — which is what makes it hold for the sixteen portals after this one.
  const rangeParams = useMemo(() => rangeToParams(range), [range]);

  const { active: rawActive, tabs: VISIBLE, select, navigate: go } = usePortalTabs(PORTAL, viewer, rangeParams);
  const active = (rawActive ?? 'overview') as TabId;

  const navigate = useCallback(
    (nextTab: TabId, nextRange: DateRange) => go(nextTab, rangeToParams(nextRange)),
    [go],
  );

  // `!` was safe while TABS was the whole list. It is not now that the strip is filtered, and a
  // viewer who can see no tab would have crashed the page here rather than rendering an empty strip.
  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div className="mkt-shell">
      {/* Horizontally scrollable on a phone rather than wrapped onto two rows: four tabs stay one
          predictable strip, and the scroll is the reformat-vs-scroll rule from M4 applied to a
          control that genuinely is a single row. */}
      <nav className="mkt-tabs" role="tablist" aria-label="Advertising sections">
        {VISIBLE.map((t) => {
          const Icon = t.icon as typeof BarChart3;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`mkt-panel-${t.id}`}
              className={`mkt-tab${isActive ? ' mkt-tab--active' : ''}`}
              onClick={() => select(t.id)}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* A6 — the connection's real state, on the page where the numbers are read. The owner asked
          "are we Basic verified?"; the honest answer is not in this repo, so it is probed. Sits
          above the tabs because every figure below is only as live as this line says it is. */}
      <AdsAccessBanner />

      <div className="mkt-toolbar">
        <p className="mkt-tabs__hint">{activeTab.hint}</p>
        {/* Not shown on the upload log: that tab lists cron runs, which are not a period of ad
            performance. A control that appears everywhere and silently does nothing on one tab is
            worse than one that is honestly absent.

            C10 — and not on Leads either, for exactly that reason. The lead board filters by STATUS
            and reads no date range, so a period control above it would have been this very rule
            broken by the slice that quotes it. */}
        {active !== 'uploads' && active !== 'leads' ? (
          <RangePicker value={range} onChange={(r) => navigate(active, r)} />
        ) : null}
      </div>

      <div id={`mkt-panel-${active}`} role="tabpanel" aria-label={activeTab.label}>
        {/* Rendered one at a time rather than all four hidden with CSS. Each of these fetches on
            mount, and mounting all four would fire every advertising query on every visit to answer
            one question. */}
        {active === 'overview' ? <DashboardTab range={range} /> : null}
        {active === 'leads' ? <LeadsTab /> : null}
        {active === 'spend' ? <SpendTab range={range} /> : null}
        {active === 'conversions' ? <ExportsTab range={range} /> : null}
        {active === 'uploads' ? <UploadsTab /> : null}
      </div>
    </div>
  );
}
