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

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, DollarSign, Upload, FileDown } from 'lucide-react';

import DashboardTab from './_tabs/DashboardTab';
import SpendTab from './_tabs/SpendTab';
import UploadsTab from './_tabs/UploadsTab';
import ExportsTab from './_tabs/ExportsTab';
import './Marketing.css';

const TABS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: BarChart3,
    hint: 'Funnel, cost per stage, attribution coverage.',
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
    label: 'Upload log',
    icon: Upload,
    hint: 'What the nightly upload sent, and what Google rejected.',
  },
] as const;

type TabId = (typeof TABS)[number]['id'];

const DEFAULT_TAB: TabId = 'overview';

export default function MarketingPage(): React.ReactElement {
  const router = useRouter();
  const params = useSearchParams();

  // An unknown `?tab=` falls back to the overview rather than rendering nothing. A mistyped or
  // stale link should land somewhere useful, not on a blank page.
  const active: TabId = useMemo(() => {
    const raw = params.get('tab');
    return TABS.some((t) => t.id === raw) ? (raw as TabId) : DEFAULT_TAB;
  }, [params]);

  const select = useCallback(
    (id: TabId) => {
      // `replace`, not `push`, and scroll:false. Flicking between four tabs should not bury the
      // page you arrived from under four history entries, and it should not jump you to the top of
      // a page you are already reading.
      router.replace(id === DEFAULT_TAB ? '/admin/marketing' : `/admin/marketing?tab=${id}`, {
        scroll: false,
      });
    },
    [router],
  );

  const activeTab = TABS.find((t) => t.id === active)!;

  return (
    <div className="mkt-shell">
      {/* Horizontally scrollable on a phone rather than wrapped onto two rows: four tabs stay one
          predictable strip, and the scroll is the reformat-vs-scroll rule from M4 applied to a
          control that genuinely is a single row. */}
      <nav className="mkt-tabs" role="tablist" aria-label="Advertising sections">
        {TABS.map((t) => {
          const Icon = t.icon;
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

      <p className="mkt-tabs__hint">{activeTab.hint}</p>

      <div id={`mkt-panel-${active}`} role="tabpanel" aria-label={activeTab.label}>
        {/* Rendered one at a time rather than all four hidden with CSS. Each of these fetches on
            mount, and mounting all four would fire every advertising query on every visit to answer
            one question. */}
        {active === 'overview' ? <DashboardTab /> : null}
        {active === 'spend' ? <SpendTab /> : null}
        {active === 'conversions' ? <ExportsTab /> : null}
        {active === 'uploads' ? <UploadsTab /> : null}
      </div>
    </div>
  );
}
