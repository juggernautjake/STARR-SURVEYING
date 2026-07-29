// Unique /dnd site footer — self-contained (no links back out to the marketing site),
// matching the "hidden hub, reachable by direct link only" model. The suggestion box
// rides in the footer so it's at the bottom of every /dnd page.
import styles from './hextech.module.css';
import SuggestionBox from './SuggestionBox';
import { t } from '@/lib/i18n';

export default function DndFooter() {
  return (
    <footer className={styles.siteFooter}>
      <div className={styles.siteFooterOrn} />
      <SuggestionBox />
      {/* The brand name is NOT translated — a proper noun stays itself in every language, and wrapping
          one in `t()` invites a translator to render it. */}
      <div className={styles.siteFooterBrand} style={{ marginTop: 22 }}>Starr Tabletop</div>
      {/* The first real use of the passthrough (P10-6). It renders identically today — the key IS the
          English string — so this is a source change and not a visual one. New user-facing prose goes
          through `t()`; the ~11,900 existing strings are not retrofitted (see lib/i18n/index.ts). */}
      <p className={styles.siteFooterNote}>{t('A hidden campaign hub — unlisted, reachable by direct link only.')}</p>
    </footer>
  );
}
