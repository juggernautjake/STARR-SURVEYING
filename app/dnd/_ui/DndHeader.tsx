// Unique /dnd site header — the D&D platform is "a different site hiding underneath"
// the Starr marketing site (which has its own header suppressed by LayoutShell). Kept
// self-contained: it links only within /dnd, never back out to the marketing pages, so
// the hub stays reachable by direct link only.
import Link from 'next/link';
import styles from './hextech.module.css';

export default function DndHeader() {
  return (
    <header className={styles.siteHeader}>
      <Link href="/dnd" className={styles.siteBrand}>
        <span className={styles.siteBrandMark} aria-hidden>
          ◆
        </span>
        Starr Tabletop
      </Link>
      <nav className={styles.siteNav}>
        <Link href="/dnd" className={styles.siteNavLink}>
          Lobby
        </Link>
        <Link href="/dnd/characters/new" className={styles.siteNavLink}>
          ＋ Character
        </Link>
      </nav>
    </header>
  );
}
