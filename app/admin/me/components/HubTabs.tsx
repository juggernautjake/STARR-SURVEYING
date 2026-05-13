'use client';
// app/admin/me/components/HubTabs.tsx
//
// Hub panel 4 (§5.1) — personal hub tabs. Each tab maps to a legacy
// `My …` route; slice 2c moves the content into the tab body and adds
// redirects from those routes here. Slice 2a renders a clear hand-off
// link to the legacy page for each tab so this route works while the
// migration completes.
//
// Tab state survives reloads via the `?tab=` query string. Defaults to
// 'overview' when no tab is set so a fresh visit to /admin/me shows the
// Hub landing (panels 1-3 + 5 + 6); switching to a personal tab routes
// through the tab content.

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export const HUB_TABS = [
  'overview',
  'schedule',
  'jobs',
  'hours',
  'pay',
  'notes',
  'files',
  'profile',
  'fieldbook',
] as const;
export type HubTab = (typeof HUB_TABS)[number];

interface TabSpec {
  id: HubTab;
  label: string;
  legacyHref: string | null;   // null for tabs that aren't legacy-backed (overview)
  description: string;
}

const TABS: TabSpec[] = [
  { id: 'overview',  label: 'Overview',  legacyHref: null,                       description: 'Greeting + today + pinned / recent / workspaces.' },
  { id: 'schedule',  label: 'Schedule',  legacyHref: '/admin/schedule',          description: 'Your calendar of shifts + appointments.' },
  { id: 'jobs',      label: 'Jobs',      legacyHref: '/admin/my-jobs',           description: 'Jobs assigned to you.' },
  { id: 'hours',     label: 'Hours',     legacyHref: '/admin/my-hours',          description: 'Clock log + timesheet.' },
  { id: 'pay',       label: 'Pay',       legacyHref: '/admin/my-pay',            description: 'Paycheck history + progression.' },
  { id: 'notes',     label: 'Notes',     legacyHref: '/admin/my-notes',          description: 'Your personal notes.' },
  { id: 'files',     label: 'Files',     legacyHref: '/admin/my-files',          description: 'Files you\'ve uploaded.' },
  { id: 'profile',   label: 'Profile',   legacyHref: '/admin/profile',           description: 'Account + preferences + persona override.' },
  { id: 'fieldbook', label: 'Fieldbook', legacyHref: '/admin/learn/fieldbook',   description: 'Field notes + research bookmarks.' },
];

export function parseHubTab(value: string | null | undefined): HubTab {
  if (!value) return 'overview';
  return (HUB_TABS as readonly string[]).includes(value) ? (value as HubTab) : 'overview';
}

interface HubTabsProps {
  /** When provided, the tab body renders this instead of the legacy-
   *  link placeholder. Slice 2b will pass real components here. */
  children?: Partial<Record<HubTab, React.ReactNode>>;
}

export default function HubTabs({ children }: HubTabsProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = parseHubTab(searchParams.get('tab'));

  const setTab = useCallback(
    (tab: HubTab) => {
      const next = new URLSearchParams(searchParams.toString());
      if (tab === 'overview') next.delete('tab');
      else next.set('tab', tab);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const activeSpec = useMemo(() => TABS.find((t) => t.id === active)!, [active]);

  return (
    <section className="hub-panel hub-tabs">
      <header className="hub-panel__header">
        <h2 className="hub-panel__title">Personal</h2>
      </header>
      <div className="hub-tabs__strip" role="tablist" aria-label="Personal hub tabs">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`hub-tabs__tab${isActive ? ' hub-tabs__tab--active' : ''}`}
              onClick={() => setTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="hub-tabs__panel">
        {children?.[active] ?? (
          activeSpec.id === 'overview' ? (
            <p className="hub-tabs__overview">
              Pick a tab above for your personal surfaces, or scroll for
              the full Hub landing.
            </p>
          ) : (
            <div className="hub-tabs__handoff">
              <p>{activeSpec.description}</p>
              {activeSpec.legacyHref ? (
                <Link className="hub-btn hub-btn--primary" href={activeSpec.legacyHref}>
                  Open {activeSpec.label} →
                </Link>
              ) : null}
              <p className="hub-tabs__handoff-note">
                Tab content moves into this panel in slice 2b of the
                admin-nav redesign; the legacy route stays live until
                then.
              </p>
            </div>
          )
        )}
      </div>
    </section>
  );
}
