// Unique /dnd site footer — self-contained (no links back out to the marketing site),
// matching the "hidden hub, reachable by direct link only" model.
import styles from './hextech.module.css';

export default function DndFooter() {
  return (
    <footer className={styles.siteFooter}>
      <div className={styles.siteFooterOrn} />
      <div className={styles.siteFooterBrand}>Starr Tabletop</div>
      <p className={styles.siteFooterNote}>A hidden campaign hub — unlisted, reachable by direct link only.</p>
    </footer>
  );
}
