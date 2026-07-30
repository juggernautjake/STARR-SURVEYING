// CollapsibleSection — the one collapsible panel every library/rules section uses, on every system.
//
// OWNER, 2026-07-29: *"Please make it so that the spells section also is a toggle dropdown element like the
// sections titled HOW THE GAME RESOLVES and ABILITIES & ATTRIBUTES. Please make sure the glossary is also able
// to be toggled open and closed. Please make sure everything is closed by default. This should be the case for
// each section in each system."*
//
// WHY A SHARED COMPONENT RATHER THAN THREE CONVERSIONS. The library page already rendered its rules sections
// as default-closed `<details>` — that decision was made and shipped. Spells, Class tables and Glossary were
// missed because each is its OWN component with its own hand-rolled `<section className={framedPanel}>`
// header, so the collapsible pattern lived in the page and the exceptions lived elsewhere. Converting the
// three by hand would fix today's list and leave the fourth section, whenever it is written, free to be a
// plain `<section>` again. The pattern has to be the thing you reach for.
//
// So: this owns the chrome, and it is what "every section in each system" means structurally — the page's
// generic sections and the three bespoke ones now render the same element with the same behaviour.
//
// NATIVE `<details>`, DELIBERATELY. No JS, works before hydration, keyboard- and screen-reader-correct for
// free, and `DeepLinkOpener` already walks up opening every ancestor `<details>` so an `#entry-…` link still
// reveals what it points at. A hand-rolled toggle would have had to re-earn all four of those.
//
// The `<summary>` must be the FIRST child of `<details>`, which is why there is no `framedPanelTop` flourish
// here: the three bespoke sections had one, the page's sections never did, and dropping it is what makes them
// match — which is what was actually asked for.
import type { ReactNode } from 'react';
import styles from './hextech.module.css';

export interface CollapsibleSectionProps {
  /** Anchor id — deep links and the jump nav target it, so it must stay stable. */
  id: string;
  title: string;
  /** Short line shown beside the title while collapsed, so a closed section still says what it holds. */
  lead?: ReactNode;
  children: ReactNode;
  /**
   * Open on first render. Defaults to CLOSED, and every caller should leave it that way — the owner asked for
   * everything closed by default. It exists for a genuinely different surface (a one-section page, where a
   * collapsed-by-default section would render as a page with nothing on it), not as a per-section preference.
   */
  defaultOpen?: boolean;
  /** Extra padding override for sections whose content wants more room. */
  padding?: string;
}

export default function CollapsibleSection({
  id,
  title,
  lead,
  children,
  defaultOpen = false,
  padding = '12px 16px',
}: CollapsibleSectionProps) {
  return (
    <details id={id} className={styles.framedPanel} style={{ padding, scrollMarginTop: 16 }} open={defaultOpen}>
      {/* `disclosure` draws the rotating chevron and hides the native marker — see hextech.module.css.
          The native triangle was technically present and effectively invisible on a dark panel, which is
          what made a page of openable sections read as a page of headings (owner 2026-07-30). */}
      <summary className={`${styles.sectionSummary} ${styles.disclosure}`}>
        <h2 className={styles.panelTitle} style={{ margin: 0, display: 'inline' }}>
          {title}
        </h2>
        {lead ? <span style={{ color: 'var(--hx-muted)', fontSize: 13, marginLeft: 8 }}>— {lead}</span> : null}
      </summary>
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>{children}</div>
    </details>
  );
}
