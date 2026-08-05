'use client';
// app/AndrewAsh/studio/_ui/StudioNav.tsx — a sidebar on a desktop, a tab bar on a phone.
//
// One component, two shapes, because they are the same information architecture and keeping them as
// one thing is what stops the phone navigation quietly falling a release behind the desktop one.
//
// ── FIVE TABS, AND WHY THE FIFTH IS "MORE" ──────────────────────────────────────────────────────
//
// There are thirteen destinations in the studio. A phone fits five before the labels become
// unreadable. So the four highest-frequency actions get permanent tabs and everything else lives
// behind "More" — chosen by how often Andrew will actually tap them in a week, not by how important
// they sound:
//
//   Home      · the money and what needs attention
//   Inquiries · the reason to open the app at all, and the one with a badge
//   Money     · invoices and expenses, the two things done ON a phone
//   Pages     · editing the site
//   More      · everything else
//
// Documents, contracts, clients, coaching, media, demos and settings are all things done sitting
// down. They are one tap further away and that is correct.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BookOpen,
  CircleDollarSign,
  FileSignature,
  FileText,
  Files,
  GraduationCap,
  Home,
  Images,
  Inbox,
  LayoutGrid,
  MoreHorizontal,
  Receipt,
  Settings,
  Users,
  X,
  AudioLines,
  LogOut,
} from 'lucide-react';
import { BASE_PATH } from '@/lib/voice/content';
import type { StudioBadges } from '@/lib/voice/notifications';

const ICONS = {
  Home,
  Inbox,
  CircleDollarSign,
  LayoutGrid,
  BookOpen,
  Users,
  FileSignature,
  Receipt,
  Files,
  GraduationCap,
  Images,
  AudioLines,
  Settings,
  FileText,
} as const;

type IconName = keyof typeof ICONS;

interface NavEntry {
  href: string;
  label: string;
  icon: IconName;
  /** Phone tab bar. Everything else lives behind "More". */
  primary?: boolean;
  group: 'Work' | 'Business' | 'Site';
  /** Which badge count (if any) belongs on this tab. The count is derived from the destination's own
   *  data in `studioBadges`, so it can never disagree with what opening the tab shows. */
  badgeKey?: keyof StudioBadges;
}

const NAV: NavEntry[] = [
  { href: `${BASE_PATH}/studio`, label: 'Home', icon: 'Home', primary: true, group: 'Work' },
  { href: `${BASE_PATH}/studio/inquiries`, label: 'Inquiries', icon: 'Inbox', primary: true, group: 'Work', badgeKey: 'inquiries' },
  { href: `${BASE_PATH}/studio/invoices`, label: 'Money', icon: 'CircleDollarSign', primary: true, group: 'Business', badgeKey: 'money' },
  { href: `${BASE_PATH}/studio/pages`, label: 'Pages', icon: 'LayoutGrid', primary: true, group: 'Site' },

  { href: `${BASE_PATH}/studio/guide`, label: 'Start here', icon: 'BookOpen', group: 'Work' },
  { href: `${BASE_PATH}/studio/clients`, label: 'Clients', icon: 'Users', group: 'Business' },
  { href: `${BASE_PATH}/studio/contracts`, label: 'Contracts', icon: 'FileSignature', group: 'Business', badgeKey: 'contracts' },
  { href: `${BASE_PATH}/studio/expenses`, label: 'Expenses', icon: 'Receipt', group: 'Business' },
  { href: `${BASE_PATH}/studio/documents`, label: 'Documents', icon: 'Files', group: 'Business' },
  { href: `${BASE_PATH}/studio/coaching`, label: 'Coaching', icon: 'GraduationCap', group: 'Business' },
  { href: `${BASE_PATH}/studio/demos`, label: 'Demo reels', icon: 'AudioLines', group: 'Site' },
  { href: `${BASE_PATH}/studio/media`, label: 'Media', icon: 'Images', group: 'Site' },
  { href: `${BASE_PATH}/studio/settings`, label: 'Settings', icon: 'Settings', group: 'Site' },
];

export default function StudioNav({ displayName, badges }: { displayName: string; badges: StudioBadges }): React.ReactElement {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // `/studio` must match exactly or it lights up on every page in the studio; everything else matches
  // by prefix so a detail page keeps its parent tab highlighted.
  const isCurrent = (href: string): boolean =>
    href === `${BASE_PATH}/studio` ? pathname === href : pathname.startsWith(href);

  const primary = NAV.filter((n) => n.primary);
  const secondary = NAV.filter((n) => !n.primary);

  const badgeFor = (entry: NavEntry): number => (entry.badgeKey ? badges[entry.badgeKey] ?? 0 : 0);
  // What is waiting behind the "More" sheet, so the phone tab bar can say so without opening it.
  const secondaryBadge = secondary.reduce((sum, n) => sum + badgeFor(n), 0);

  const renderIcon = (name: IconName, size = 19) => {
    const Icon = ICONS[name];
    return <Icon size={size} aria-hidden />;
  };

  // The icon, with a corner count when its tab has something waiting. One place decides how a badge
  // looks, so the sidebar, the phone tabs and the More sheet can never drift apart.
  const iconWithBadge = (entry: NavEntry, size: number) => {
    const count = badgeFor(entry);
    if (count <= 0) return renderIcon(entry.icon, size);
    return (
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        {renderIcon(entry.icon, size)}
        <span className="vaNavBadge" aria-label={`${count} waiting`}>{count > 9 ? '9+' : count}</span>
      </span>
    );
  };

  return (
    <>
      <nav className="vaStudioNav" aria-label="Studio">
        <Link href={`${BASE_PATH}/studio`} className="vaStudioBrand">
          Andrew <span>Ash</span>
        </Link>

        {/* Phone: four tabs + More. Desktop: the CSS reveals every entry, so this list is rendered in
            full and the phone hides the non-primary items rather than the two lists diverging. */}
        {primary.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="vaStudioNavItem"
            aria-current={isCurrent(entry.href) ? 'page' : undefined}
          >
            {iconWithBadge(entry, 19)}
            {entry.label}
          </Link>
        ))}

        <button
          type="button"
          className="vaStudioNavItem vaStudioMoreBtn"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
        >
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <MoreHorizontal size={19} aria-hidden />
            {secondaryBadge > 0 && (
              <span className="vaNavBadge" aria-label={`${secondaryBadge} waiting behind More`}>
                {secondaryBadge > 9 ? '9+' : secondaryBadge}
              </span>
            )}
          </span>
          More
        </button>

        {/* Desktop-only: the rest of the destinations, grouped. Hidden on phones by CSS. */}
        <div className="vaStudioNavRest">
          {(['Work', 'Business', 'Site'] as const).map((group) => {
            const items = secondary.filter((n) => n.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <p className="vaStudioNavGroup">{group}</p>
                {items.map((entry) => (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    className="vaStudioNavItem"
                    aria-current={isCurrent(entry.href) ? 'page' : undefined}
                  >
                    {iconWithBadge(entry, 17)}
                    {entry.label}
                  </Link>
                ))}
              </div>
            );
          })}

          <p className="vaStudioNavGroup">{displayName}</p>
          <Link href={BASE_PATH} className="vaStudioNavItem">
            <Home size={17} aria-hidden />
            View the site
          </Link>
          <a href="/api/voice/auth/logout" className="vaStudioNavItem">
            <LogOut size={17} aria-hidden />
            Sign out
          </a>
        </div>
      </nav>

      {moreOpen && (
        <div className="vaStudioMore" role="dialog" aria-label="More" onClick={() => setMoreOpen(false)}>
          {/* Stop the backdrop's close handler firing for clicks inside the sheet. */}
          <div className="vaStudioMoreSheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <strong style={{ fontFamily: 'var(--va-font-display)', fontSize: '1.05rem' }}>Everything else</strong>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                style={{ background: 'none', border: 0, color: 'var(--va-text-muted)', cursor: 'pointer', padding: 6 }}
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className="vaStudioMoreGrid">
              {secondary.map((entry) => (
                <Link key={entry.href} href={entry.href} onClick={() => setMoreOpen(false)}>
                  {iconWithBadge(entry, 21)}
                  {entry.label}
                </Link>
              ))}
              <Link href={BASE_PATH} onClick={() => setMoreOpen(false)}>
                <Home size={21} aria-hidden />
                View site
              </Link>
              <a href="/api/voice/auth/logout">
                <LogOut size={21} aria-hidden />
                Sign out
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
