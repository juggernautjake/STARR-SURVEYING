// app/dnd/hextech-demo/page.tsx — living style guide for the Hextech DM design
// system (E1, §6.19). Renders every primitive so DM pages can compose from them.
//
// CORRECTED 2026-07-28 (P1-4, audit D-5). This header used to say "Auth-gated with the rest of /dnd (it's
// an internal style guide)". That stopped being true on 2026-07-06, when the owner made /dnd public by
// direct link — `dndGate` returns `NextResponse.next()` for everything unless `DND_REQUIRE_LOGIN=1`. So an
// internal style guide has been live to anyone with the URL while describing itself as protected, which is
// the worst version of this: the comment is why nobody re-checked.
//
// Now gated by `devRouteVisible()`, the same rule `preview/edit-flow` uses.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import styles from '../_ui/hextech.module.css';
import { devRouteVisible } from '@/lib/dnd/dev-routes';

export const metadata: Metadata = {
  title: 'Hextech Design System',
  robots: { index: false, follow: false },
};

export default function HextechDemoPage() {
  if (!devRouteVisible()) notFound();
  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 760, display: 'grid', gap: 16 }}>
          <div>
            <p className={styles.brand}>Starr Tabletop</p>
            <h1 className={styles.title}>Hextech Design System</h1>
            <p className={styles.subtitle}>The primitives every DM-side surface composes from.</p>
          </div>

          <section className={styles.framedPanel}>
            <div className={styles.framedPanelTop} />
            <h2 className={styles.panelTitle}>Framed Panel</h2>
            <p style={{ color: 'var(--hx-muted)', margin: 0 }}>
              Dark fill, gold hairline, angular corner brackets, gold top-accent bar, faint hex texture.
            </p>
            <div className={styles.ornament}>
              <span className={styles.ornamentGem} />
            </div>

            <h2 className={styles.panelTitle}>Buttons</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className={styles.hexBtn}>Default</button>
              <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`}>Primary</button>
              <button className={`${styles.hexBtn} ${styles.hexBtnTeal}`}>Magic</button>
              <button className={styles.hexBtn} disabled>
                Disabled
              </button>
            </div>
          </section>

          <section className={styles.framedPanel}>
            <h2 className={styles.panelTitle}>Portrait / Token Frames</h2>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div className={styles.portrait} style={{ background: 'linear-gradient(135deg,#785a28,#c8aa6e)' }} />
              <div className={`${styles.portrait} ${styles.portraitActive}`} style={{ background: 'linear-gradient(135deg,#0397ab,#0ac8b9)' }} />
              <span style={{ color: 'var(--hx-muted)', fontSize: 13 }}>
                left: static · right: active initiative turn (animated glow)
              </span>
            </div>
          </section>

          <section className={styles.framedPanel}>
            <h2 className={styles.panelTitle}>Tabs</h2>
            <div className={styles.tabbar}>
              <button className={`${styles.tabItem} ${styles.tabItemActive}`}>Initiative</button>
              <button className={styles.tabItem}>NPCs</button>
              <button className={styles.tabItem}>Chat</button>
              <button className={styles.tabItem}>Reveals</button>
            </div>
          </section>

          <section className={styles.framedPanel}>
            <h2 className={styles.panelTitle}>Loading</h2>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className={styles.spinner} />
              <span style={{ color: 'var(--hx-muted)', fontSize: 13 }}>Hextech spinner (rotating gold ring)</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
