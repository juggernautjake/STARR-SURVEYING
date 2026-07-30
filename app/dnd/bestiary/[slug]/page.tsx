// /dnd/bestiary/[slug] — one creature, in full.
//
// SLICE B1-1/B1-2. The stat block is interactive (its attacks roll through the shared feed) and the aura animates
// here, where it is one creature rather than sixty and can afford to.
//
// PROVENANCE IS PRINTED, not buried. `source`, `licence` and `attribution` are NOT NULL on the table because the
// licences that let us carry this content require the attribution to travel with it. A catalogue page that omits it
// is not merely impolite, it is out of compliance — so it renders as part of the page rather than as a tooltip.
//
// The two actions the owner asked for on every listing — create a variant, use in a campaign — are stubbed as
// disabled affordances with the reason visible. That is deliberate rather than lazy: they are slices B3-1 and B3-3
// and they need the variant editor and the campaign grant path wired in. A button that silently does nothing is
// worse than one that says what it is waiting for, and leaving them out entirely would hide that the page is
// mid-build.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { loadCreature } from '@/lib/dnd/bestiary/query';
import { TAG_LABELS, type CreatureTag } from '@/lib/dnd/bestiary/taxonomy';
import { auraFor } from '@/lib/dnd/bestiary/aura';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';
import CreatureAura from '@/app/dnd/_ui/bestiary/CreatureAura';
import CreatureStatblock from '@/app/dnd/_ui/bestiary/CreatureStatblock';

export const dynamic = 'force-dynamic';

/**
 * A creature's slug carries a source prefix — `srd51:wolf` — so the same creature from two editions stays two rows.
 * The colon does not survive the round trip through a URL path segment intact, and the detail page 404'd on every
 * creature until this existed: the row was there, the lookup was correct, and the string arriving at the page was
 * percent-encoded. Decoding is unconditional because `decodeURIComponent` leaves an already-decoded slug alone.
 */
function creatureSlugFromParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // A malformed escape sequence is a bad URL, not a server error — fall through to the raw value, which will
    // simply not match and render the not-found page.
    return raw;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await loadCreature(creatureSlugFromParam(slug));
  return { title: found ? `${found.creature.name} | Bestiary` : 'Bestiary | Starr Tabletop' };
}

const systemName = (key: string) => GAME_SYSTEMS.find((s) => s.key === key)?.name ?? key;

export default async function CreaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await loadCreature(creatureSlugFromParam(slug));
  if (!found) notFound();
  const { creature: c, variants } = found;
  const aura = auraFor(c);

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 900, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <Link className={styles.hexBtn} href="/dnd/bestiary" style={{ marginBottom: 10 }}>← Bestiary</Link>
          </div>

          <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 14 }}>
            <div className={styles.framedPanelTop} />

            {/* Portrait beside the identity line, collapsing to stacked on a phone. `minmax(0, 1fr)` on the text
                column, because an undeclared grid column is implicit `auto` and sizes to MIN-CONTENT — which makes
                a long creature name push the layout wider than its container instead of wrapping. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <CreatureAura creature={c} size={168} />
                <div style={{ display: 'grid', gap: 4, flex: '1 1 240px', minWidth: 0 }}>
                  <h1 className={styles.title} style={{ textAlign: 'left', margin: 0 }}>{c.name}</h1>
                  <p style={{ margin: 0, color: 'var(--hx-muted)', fontStyle: 'italic' }}>
                    {[c.size, c.type, c.alignment].filter(Boolean).join(' ') || systemName(c.system)}
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--hx-teal-1)', border: '1px solid var(--hx-line)', borderRadius: 999, padding: '1px 8px' }}>
                      {systemName(c.system)}
                    </span>
                    {c.cr && (
                      <span style={{ fontSize: 11, color: 'var(--hx-gold-2)', border: '1px solid var(--hx-line)', borderRadius: 999, padding: '1px 8px' }}>
                        CR {c.cr}
                      </span>
                    )}
                    {c.tags.map((t) => (
                      <Link
                        key={t}
                        href={`/dnd/bestiary?tag=${encodeURIComponent(t)}`}
                        style={{ fontSize: 11, color: 'var(--hx-muted)', border: '1px solid var(--hx-line)', borderRadius: 999, padding: '1px 8px', textDecoration: 'none' }}
                      >
                        {TAG_LABELS[t as CreatureTag] ?? t}
                      </Link>
                    ))}
                  </div>
                  {/* What its aura is meant to convey — visible so a reader can tell us when it is wrong, which is
                      the only way a derived effect gets corrected. */}
                  <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--hx-muted)' }}>Aura: {aura.feel}</p>
                </div>
              </div>

              {c.description && <p style={{ margin: 0 }}>{c.description}</p>}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={styles.hexBtn} disabled title="Slice B3-1 — the variant editor is not wired up yet" style={{ minHeight: 40 }}>
                  Create a variant
                </button>
                <button type="button" className={styles.hexBtn} disabled title="Slice B3-3 — adding to a campaign is not wired up yet" style={{ minHeight: 40 }}>
                  Use in a campaign
                </button>
              </div>
            </div>
          </section>

          <section className={styles.framedPanel} style={{ padding: '14px 16px' }}>
            <div className={styles.framedPanelTop} />
            <h2 className={styles.panelTitle} style={{ marginTop: 0 }}>Stat block</h2>
            <CreatureStatblock statblock={c.statblock} name={c.name} />
          </section>

          {variants.length > 0 && (
            <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
              <div className={styles.framedPanelTop} />
              <h2 className={styles.panelTitle} style={{ margin: 0 }}>Variants</h2>
              {variants.map((v) => (
                <details key={v.id} style={{ border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', padding: '8px 10px' }}>
                  <summary style={{ cursor: 'pointer', minHeight: 34, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--hx-gold-2)' }}>{v.name}</strong>
                    {v.cr && <span style={{ fontSize: 11.5, color: 'var(--hx-teal-1)' }}>CR {v.cr}</span>}
                    {v.derivation && <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>— {v.derivation}</span>}
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    <CreatureStatblock statblock={v.statblock} name={v.name} />
                  </div>
                </details>
              ))}
            </section>
          )}

          {/* The attribution the licence requires. Small, but present on every page that carries the content. */}
          <p style={{ fontSize: 11, color: 'var(--hx-muted)', margin: 0 }}>
            {c.source}
            {c.licence ? ` · ${c.licence}` : ''}
            {c.attribution ? ` · ${c.attribution}` : ''}
            {c.sourceUrl ? (
              <>
                {' · '}
                <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--hx-teal-1)' }}>source</a>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}
