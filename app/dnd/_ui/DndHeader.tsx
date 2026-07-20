'use client';
// Unique /dnd site header — the D&D platform is "a different site hiding underneath"
// the Starr marketing site (which has its own header suppressed by LayoutShell). Kept
// self-contained: it links only within /dnd, never back out to the marketing pages, so
// the hub stays reachable by direct link only.
//
// The nav is a click-to-open DROPDOWN driven by React state (not a <details>, which didn't reliably close on
// navigation and can't close on an outside click). It closes: (a) when a nav item is picked — the Link routes
// AND the menu closes; (b) on a click anywhere outside the menu; (c) on Escape; (d) whenever the route changes
// (belt-and-braces, since the header persists in the layout across client-side navigations).
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import styles from './hextech.module.css';
import HeaderBack from './HeaderBack';
import LogoutButton from './LogoutButton';

export default function DndHeader({ userName }: { userName?: string | null }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // (d) Close on any route change — the header stays mounted across client-side navigations, so without this
  // the menu would linger open on the new page after a link is followed.
  useEffect(() => { setOpen(false); }, [pathname]);

  // (b) outside-click + (c) Escape close, wired only while the menu is open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header className={styles.siteHeader}>
      <HeaderBack />
      <Link href="/dnd" className={styles.siteBrand}>
        {/* Four small diamonds arranged into one larger diamond (top · left · right · bottom),
            flanking the wordmark symmetrically on both sides. */}
        <span className={styles.siteBrandCluster} aria-hidden>
          <span>◆</span><span>◆</span><span>◆</span><span>◆</span>
        </span>
        <span className={styles.siteBrandText}>Starr Tabletop</span>
        <span className={styles.siteBrandCluster} aria-hidden>
          <span>◆</span><span>◆</span><span>◆</span><span>◆</span>
        </span>
      </Link>
      {/* The dropdown. `data-open` toggles the CSS that reveals the panel; the toggle is a real button (works
          on desktop + mobile identically). */}
      <div className={styles.siteMenu} data-open={open ? 'true' : 'false'} ref={menuRef}>
        <button
          type="button"
          className={styles.siteMenuToggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Menu"
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden>☰</span>
          <span className={styles.siteMenuLabel}>{userName || 'Menu'}</span>
        </button>
        <nav className={styles.siteNav} role="menu">
          {/* Every item closes the menu on click; the Link still routes (we don't preventDefault). */}
          {/* SIGNED OUT: the library is readable by anyone with the link, so the menu offers
              exactly that plus a way to sign in (owner 2026-07-20). Everything else here
              CREATES something and needs an account — "＋ Character" used to show signed-out and
              would have dead-ended a visitor who tapped it. Reading is open; creating is gated. */}
          <Link href="/dnd/library" className={styles.siteNavLink} onClick={() => setOpen(false)}>Library</Link>
          {userName ? (
            <>
              <Link href="/dnd" className={styles.siteNavLink} onClick={() => setOpen(false)}>Lobby</Link>
              <Link href="/dnd/characters/new" className={styles.siteNavLink} onClick={() => setOpen(false)}>＋ Character</Link>
              <Link href="/dnd?new=campaign" className={styles.siteNavLink} onClick={() => setOpen(false)}>＋ Campaign</Link>
              {/* Maps live inside a campaign's Map Studio, so this takes a signed-in user to the campaigns hub to
                  pick which campaign to make a map for. */}
              <Link href="/dnd?new=map" className={styles.siteNavLink} onClick={() => setOpen(false)}>＋ Map</Link>
              <span className={styles.siteNavUser}>
                <span style={{ opacity: 0.85 }}>Signed in as <strong>{userName}</strong></span>
                <LogoutButton />
              </span>
            </>
          ) : (
            // Straight to the hub: /dnd/login is a legacy route that only redirects here, and
            // the real sign-in / claim-name form lives on the hub itself.
            <Link href="/dnd" className={styles.siteNavLink} onClick={() => setOpen(false)}>Log in / Create account</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
