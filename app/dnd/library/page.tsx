// /dnd/library — the rules library index: every supported game system, plus a search that spans
// all of them. Rendered from the deterministic catalog (lib/dnd/library.ts → system-rules.ts), so
// it needs no DB round-trip and works with no embeddings key.
import Link from 'next/link';
import type { Metadata } from 'next';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { allLibraryPages } from '@/lib/dnd/library';
import LibrarySearch from '@/app/dnd/_ui/LibrarySearch';
import LibraryChatDock from '@/app/dnd/_ui/LibraryChatDock';
import { dndAiConfigured } from '@/lib/dnd/ai';

export const metadata: Metadata = { title: 'Rules Library | Starr Tabletop' };

export default function LibraryIndexPage() {
  const pages = allLibraryPages();
  const aiConfigured = dndAiConfigured();

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <Link className={styles.hexBtn} href="/dnd" style={{ marginBottom: 10 }}>← Lobby</Link>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>Rules Library</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0', maxWidth: 720 }}>
              {pages.length} playable game systems, each written out in full — how the dice work, how characters advance,
              and the exact numbers. Search across every system, or open one to read it end to end. Ask the librarian
              anything; it answers from the system you point it at, and never borrows another system’s rules.
            </p>
          </div>

          <LibrarySearch />

          <section className={styles.framedPanel} style={{ padding: '14px 16px' }}>
            <div className={styles.framedPanelTop} />
            <h2 className={styles.panelTitle} style={{ marginTop: 0 }}>Systems</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 10 }}>
              {pages.map((p) => (
                <Link
                  key={p.key}
                  href={`/dnd/library/${p.key}`}
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: '12px 14px',
                    border: '1px solid var(--hx-line)',
                    background: 'rgba(1,10,19,0.45)',
                    textDecoration: 'none',
                    borderRadius: 2,
                  }}
                >
                  <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 16 }}>{p.name}</strong>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-teal-1)' }}>{p.tagline}</span>
                  {p.publisher && <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{p.publisher}</span>}
                  <span style={{ fontSize: 12.5, color: 'var(--hx-text)', opacity: 0.85, lineHeight: 1.5 }}>{p.notes}</span>
                  <span style={{ fontSize: 11, color: 'var(--hx-muted)', marginTop: 2 }}>{p.sections.length} sections · {p.source}</span>
                </Link>
              ))}
              {/* Under-construction systems are hidden site-wide (owner 2026-07-18); a single placeholder card
                  tells players more systems + their character-sheet builders are on the way. */}
              <div style={{ display: 'grid', gap: 6, padding: '12px 14px', border: '1px dashed var(--hx-line)', background: 'rgba(1,10,19,0.25)', borderRadius: 2, alignContent: 'center' }}>
                <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-teal-1)', fontSize: 16 }}>◆ More systems coming soon</strong>
                <span style={{ fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
                  Additional game systems — and their character-sheet builders — are in development and will appear here
                  when they’re ready to play.
                </span>
              </div>
            </div>
          </section>

        </div>
      </div>

      {/* The librarian rides along as a floating launcher rather than sitting at the bottom
          of the page, where it was only findable by scrolling past everything it explains. */}
      <LibraryChatDock aiConfigured={aiConfigured} />
    </div>
  );
}
