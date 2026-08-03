'use client';
// app/AndrewAsh/_ui/VoiceHeader.tsx — the site header.
//
// Sticky, translucent, and one row tall. A performer's site is a scroll, and a header that takes 120
// pixels of a phone screen the whole way down is 120 pixels of photograph the visitor never sees.
//
// The mobile menu closes on route change. That sounds obvious and is the single most common bug in
// hand-rolled headers built on the App Router: navigation does not unmount a layout component, so the
// open menu survives the click that navigated away and sits over the new page.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { BASE_PATH } from '@/lib/voice/content';

interface NavItem {
  label: string;
  href: string;
  external?: boolean;
}

interface Props {
  artistName: string;
  tagline: string;
  navItems: NavItem[];
}

export default function VoiceHeader({ artistName, tagline, navItems }: Props): React.ReactElement {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // The body must not scroll behind an open full-screen menu, and the lock has to be released on
  // unmount or a navigation mid-animation leaves the page frozen.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes it. Cheap, and its absence is the thing keyboard users notice first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const isCurrent = (href: string): boolean => {
    if (href === BASE_PATH) return pathname === BASE_PATH || pathname === `${BASE_PATH}/`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // "Andrew Ash" → "Andrew" + "Ash", so the surname can carry the accent colour. Falls back
  // gracefully for a one-word name, which is what a rename in the studio could easily produce.
  const parts = artistName.trim().split(/\s+/);
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : artistName;
  const last = parts.length > 1 ? parts[parts.length - 1] : '';

  return (
    <header className="vaHeader">
      <div className="vaContainer vaHeaderInner">
        <Link href={BASE_PATH} className="vaWordmark" aria-label={`${artistName} — home`}>
          <span style={{ color: 'var(--va-text)' }}>{first}</span>
          {last && <span>{last}</span>}
          <span className="vaWordmarkRole" aria-hidden="true">
            {tagline}
          </span>
        </Link>

        <nav className="vaNav" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="vaNavLink"
              aria-current={isCurrent(item.href) ? 'page' : undefined}
              {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="vaHeaderActions">
          <Link href={`${BASE_PATH}/contact`} className="vaBtn vaBtnSolid vaBtnSm">
            Request a quote
          </Link>
          <button
            type="button"
            className="vaMenuBtn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="va-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="vaMobileNav" id="va-mobile-nav" aria-label="Primary, mobile">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item.href) ? 'page' : undefined}
              {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {item.label}
            </Link>
          ))}

          {/* Below 500px the header cannot fit this button beside the wordmark and the menu toggle —
              trying to made the whole page 229px wider than the phone. It lives here instead, where
              it gets to be a full-width call to action rather than a squeeze. */}
          <Link href={`${BASE_PATH}/contact`} className="vaBtn vaBtnSolid vaMobileNavCta">
            Request a quote
          </Link>
        </nav>
      )}
    </header>
  );
}
