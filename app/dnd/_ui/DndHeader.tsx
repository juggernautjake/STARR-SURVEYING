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
          <span className={styles.siteNavUser} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
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
    </header>
  );
}
