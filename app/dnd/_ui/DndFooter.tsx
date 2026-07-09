// Unique /dnd site footer — self-contained (no links back out to the marketing site),
// matching the "hidden hub, reachable by direct link only" model. The suggestion box
// rides in the footer so it's at the bottom of every /dnd page.
import styles from './hextech.module.css';
import SuggestionBox from './SuggestionBox';

export default function DndFooter() {
  return (
    <footer className={styles.siteFooter}>
      <div className={styles.siteFooterOrn} />
      <SuggestionBox />
      <div className={styles.siteFooterBrand} style={{ marginTop: 22 }}>Starr Tabletop</div>
      <p className={styles.siteFooterNote}>A hidden campaign hub — unlisted, reachable by direct link only.</p>
    </footer>
  );
}
