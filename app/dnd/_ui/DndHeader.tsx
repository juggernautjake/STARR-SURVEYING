// Unique /dnd site header — the D&D platform is "a different site hiding underneath"
// the Starr marketing site (which has its own header suppressed by LayoutShell). Kept
// self-contained: it links only within /dnd, never back out to the marketing pages, so
// the hub stays reachable by direct link only.
import Link from 'next/link';
import styles from './hextech.module.css';
import HeaderBack from './HeaderBack';
import LogoutButton from './LogoutButton';

export default function DndHeader({ userName }: { userName?: string | null }) {
  return (
    <header className={styles.siteHeader}>
      <HeaderBack />
      <Link href="/dnd" className={styles.siteBrand}>
        {/* Four small diamonds arranged into one larger diamond (top · left · right · bottom),
            flanking the wordmark symmetrically on both sides. */}
        <span className={styles.siteBrandCluster} aria-hidden>
          <span>◆</span>
          <span>◆</span>
          <span>◆</span>
          <span>◆</span>
        </span>
        <span className={styles.siteBrandText}>Starr Tabletop</span>
        <span className={styles.siteBrandCluster} aria-hidden>
          <span>◆</span>
          <span>◆</span>
          <span>◆</span>
          <span>◆</span>
        </span>
      </Link>
      {/* Collapsible nav (MOB1). Native <details> so this stays a server component with no client JS:
          on desktop the summary/hamburger is hidden and the nav shows inline as a bar; on a phone the nav
          collapses behind a "☰ {name}" toggle that opens as a dropdown — so the user's name is visible
          without opening, and Log out lives one tap inside. */}
      <details className={styles.siteMenu}>
        <summary className={styles.siteMenuToggle} aria-label="Menu">
          <span aria-hidden>☰</span>
          <span className={styles.siteMenuLabel}>{userName || 'Menu'}</span>
        </summary>
        <nav className={styles.siteNav}>
          <Link href="/dnd" className={styles.siteNavLink}>
            Lobby
          </Link>
          {/* The rules library — every system's classes, subclasses, features, conditions and rules,
              searchable and AI-navigable. Given a top-level nav slot so it's always one click away. */}
          <Link href="/dnd/library" className={styles.siteNavLink}>
            Library
          </Link>
          <Link href="/dnd/characters/new" className={styles.siteNavLink}>
            ＋ Character
          </Link>
          {/* Start a campaign (become its DM, invite players). Only for signed-in users — a campaign
              needs an owner. Opens the campaigns dashboard with the New Campaign form ready. */}
          {userName && (
            <Link href="/dnd?new=campaign" className={styles.siteNavLink}>
              ＋ Campaign
            </Link>
          )}
          {userName ? (
            <span className={styles.siteNavUser}>
              <span style={{ opacity: 0.85 }}>
                Signed in as <strong>{userName}</strong>
              </span>
              <LogoutButton />
            </span>
          ) : (
            <Link href="/dnd" className={styles.siteNavLink}>
              Sign in
            </Link>
          )}
        </nav>
      </details>
    </header>
  );
}
