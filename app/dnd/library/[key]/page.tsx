// /dnd/library/[key] — one game system, written out in full.
//
// Rendered from the deterministic catalog + that system's glossary (both DB-free), so the page is
// complete with no embeddings key and no seeded rows. Every section uses the SYSTEM'S OWN nouns —
// Blades has Playbooks and Heritages, not Classes and Species — because calling a playbook a class
// is exactly the kind of quiet cross-system error this library exists to prevent.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { libraryPageFor } from '@/lib/dnd/library';
import { glossaryFor } from '@/lib/dnd/glossary';
import { classesForSystem, subclassesFor } from '@/lib/dnd/classes/registry';
import { GAME_SYSTEMS, isSystemAvailable } from '@/lib/dnd/systems';
import { dndAiConfigured } from '@/lib/dnd/ai';
import LibrarySearch from '@/app/dnd/_ui/LibrarySearch';
import LibraryChatDock from '@/app/dnd/_ui/LibraryChatDock';
import GiveEntryButton from '@/app/dnd/_ui/GiveEntryButton';
import SpellBrowser from '@/app/dnd/_ui/SpellBrowser';
import BackToTop from '@/app/dnd/_ui/BackToTop';
import DeepLinkOpener from './DeepLinkOpener';
import { entryAnchorId } from '@/lib/dnd/library-anchors';
import GlossaryList from '@/app/dnd/_ui/GlossaryList';
import JumpNav from '@/app/dnd/_ui/JumpNav';
import { igSystemLogo, IG_ART_CREDIT } from '@/lib/dnd/systems/intuitive-games/art';

export function generateStaticParams() {
  // Only the playable systems have a public library page; under-construction systems are hidden (owner 2026-07-18).
  return GAME_SYSTEMS.filter((s) => isSystemAvailable(s.key)).map((s) => ({ key: s.key }));
}

export function generateMetadata({ params }: { params: { key: string } }): Metadata {
  const p = libraryPageFor(params.key);
  return { title: p ? `${p.name} — Rules Library | Starr Tabletop` : 'Rules Library' };
}

/** Markdown-lite: **bold** + "· " bullets, matching the rest of the platform's prose. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const bullet = line.trimStart().startsWith('· ');
        return (
          <p key={i} style={{ margin: line.trim() ? '0 0 6px' : 0, paddingLeft: bullet ? 12 : 0, lineHeight: 1.65 }}>
            {line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
              p.startsWith('**') && p.endsWith('**') ? (
                <strong key={j} style={{ color: 'var(--hx-gold-2)' }}>{p.slice(2, -2)}</strong>
              ) : (
                <span key={j}>{p}</span>
              ),
            )}
          </p>
        );
      })}
    </>
  );
}

export default function LibrarySystemPage({ params }: { params: { key: string } }) {
  const page = libraryPageFor(params.key);
  // Under-construction systems are hidden — their library page 404s (owner 2026-07-18).
  if (!page || !isSystemAvailable(params.key)) notFound();

  const glossary = glossaryFor(params.key);
  const classes = classesForSystem(params.key);

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 1000, margin: '0 auto', display: 'grid', gap: 16 }}>
          {/* ── header ─────────────────────────────────────────────────── */}
          <div>
            <Link className={styles.hexBtn} href="/dnd/library" style={{ marginBottom: 10 }}>← Rules Library</Link>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8 }}>
              {page.key === 'intuitive-games' ? (
                // Brendan's Intuitive Games logo + title link to his site — the system's own source material,
                // credited to him (owner 2026-07-17). Opens intuitivegames.net in a new tab.
                <a href="https://www.intuitivegames.net" target="_blank" rel="noreferrer noopener"
                  style={{ display: 'flex', gap: 14, alignItems: 'center', textDecoration: 'none' }}
                  title="View the source material on intuitivegames.net">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={igSystemLogo()} alt="Intuitive Games logo" style={{ width: 56, height: 56, flex: '0 0 auto' }} />
                  <h1 className={styles.title} style={{ textAlign: 'left', margin: 0 }}>{page.name}</h1>
                </a>
              ) : (
                <h1 className={styles.title} style={{ textAlign: 'left', margin: 0 }}>{page.name}</h1>
              )}
            </div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hx-teal-1)', marginTop: 4 }}>
              {page.tagline}
            </div>
            <p style={{ color: 'var(--hx-muted)', margin: '6px 0 0', maxWidth: 720 }}>
              {page.notes} {page.publisher ? `· ${page.publisher}` : ''} · Facts drawn from <em>{page.source}</em>.
              {page.key === 'intuitive-games' && <> · <span style={{ color: 'var(--hx-gold-2)' }}>{IG_ART_CREDIT}</span></>}
            </p>
            {page.key === 'intuitive-games' && (
              // An explicit "see the source material" link to Brendan's site (owner 2026-07-17).
              <a href="https://www.intuitivegames.net" target="_blank" rel="noreferrer noopener"
                style={{ display: 'inline-block', marginTop: 6, fontSize: 13, color: 'var(--hx-teal-1)' }}>
                ◆ Click here to see the source material on intuitivegames.net →
              </a>
            )}
          </div>

          {/* ── jump links ─────────────────────────────────────────────── */}
          {/* JumpNav scrolls without pushing a hash history entry, so Back leaves the page in one press
              (Slice 37 — a plain #anchor made Back "jump up and down" the same page). */}
          <JumpNav
            items={[
              ...page.sections.map((s) => ({ id: s.id, label: s.title })),
              ...(glossary.length > 0 ? [{ id: 'glossary', label: `Glossary (${glossary.length})` }] : []),
              ...(classes.length > 0 ? [{ id: 'progression', label: 'Class tables' }] : []),
            ]}
          />

          {/* Expands the collapsed <details> a `#entry-…` link points at — without it a search
              result lands on a closed one-line strip and reads as a broken link. */}
          <DeepLinkOpener />
          {/* The system pages are very long; searching again is the commonest next action, so the
              button returns to the top AND focuses the search box. */}
          <BackToTop label="Back to search" />

          <LibrarySearch system={page.key} systemName={page.name} />

          {/* Faceted spell browser — search + filter the whole catalog. Renders only for a
              system that HAS one, so it simply doesn't appear where there's nothing to browse. */}
          <SpellBrowser system={page.key} />

          {/* ── the rules, section by section ──────────────────────────── */}
          {/* Each section is a collapsible <details>, DEFAULT CLOSED (owner 2026-07-18): the page opens as a
              scannable list of section headers you expand on demand — native, no-JS, accessible, and much
              better on mobile. (Per-entry expansion within a section is the next slice.) */}
          {page.sections.map((s) => (
            <details key={s.id} id={s.id} className={styles.framedPanel} style={{ padding: '12px 16px', scrollMarginTop: 16 }}>
              <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
                <h2 className={styles.panelTitle} style={{ margin: 0, display: 'inline' }}>{s.title}</h2>
                {s.lead && <span style={{ color: 'var(--hx-muted)', fontSize: 13, marginLeft: 8 }}>— {s.lead}</span>}
              </summary>
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>

              {s.facts && (
                <dl style={{ display: 'grid', gap: 10, margin: 0 }}>
                  {s.facts.map((f, i) => (
                    <div key={i} style={{ display: 'grid', gap: 2 }}>
                      <dt style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-teal-1)' }}>{f.label}</dt>
                      <dd style={{ margin: 0, fontSize: 13.5, color: 'var(--hx-text)', lineHeight: 1.65 }}>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {s.body && (
                <ul style={{ display: 'grid', gap: 8, margin: 0, paddingLeft: 18 }}>
                  {s.body.map((b, i) => (
                    <li key={i} style={{ fontSize: 13.5, color: 'var(--hx-text)', lineHeight: 1.65 }}>
                      <Rich text={b} />
                    </li>
                  ))}
                </ul>
              )}

              {s.chips && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {s.chips.map((c) => (
                    <span key={c} style={{ fontSize: 12, padding: '4px 9px', border: '1px solid var(--hx-line)', background: 'rgba(10,200,185,0.06)', color: 'var(--hx-text)' }}>
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {/* Per-entry collapsibles (MOB2c) — each name expands to its full detail; nested inside the
                  section <details>, also default-closed. The owner's "click a race to expand every detail". */}
              {s.entries && (
                <div style={{ display: 'grid', gap: 6 }}>
                  {s.entries.map((e) => (
                    // `id` from the SHARED anchor helper, so a search hit's href and this element
                    // cannot drift apart. `scrollMarginTop` keeps the row clear of the sticky header
                    // when DeepLinkOpener scrolls to it.
                    <details key={e.name} id={entryAnchorId(e.name)} style={{ border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', padding: '7px 10px', scrollMarginTop: 72 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 13.5 }}>
                        <strong style={{ color: 'var(--hx-gold-2)' }}>{e.name}</strong>
                        {e.brief && <span style={{ color: 'var(--hx-muted)', marginLeft: 8 }}>— {e.brief}</span>}
                      </summary>
                      {/* Artwork (e.g. a species portrait) shown large + centered at the top of the open
                          accordion, above the detail text (owner 2026-07-17). Only when the entry has art. */}
                      {e.image && (
                        <figure style={{ margin: '10px 0 4px', display: 'grid', justifyItems: 'center', gap: 4 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={e.image} alt={e.name} title={e.imageCredit} loading="lazy"
                            style={{ width: 'min(260px, 80%)', height: 'auto', borderRadius: 8, background: '#f4f1ea', border: '1px solid var(--hx-line)', padding: 6 }} />
                          {e.imageCredit && <figcaption style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>{e.imageCredit}</figcaption>}
                        </figure>
                      )}
                      <div style={{ fontSize: 13, color: 'var(--hx-text)', lineHeight: 1.65, marginTop: 6 }}>
                        <Rich text={e.detail} />
                      </div>
                      {/* Hand this entry to one of your characters. Renders only for sections we
                          can deliver as real sheet mechanics — see grantKindForSection. */}
                      <GiveEntryButton sectionId={s.id} name={e.name} system={page.key} detail={e.detail} />
                    </details>
                  ))}
                </div>
              )}

              {s.table && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {s.table.headers.map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--hx-gold-1)', color: 'var(--hx-gold-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.table.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ padding: '5px 8px', borderBottom: '1px solid var(--hx-line)', color: j === 0 ? 'var(--hx-text)' : 'var(--hx-muted)', fontWeight: j === 0 ? 600 : 400 }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {s.images && (
                <figure style={{ margin: 0, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {s.images.gallery.map((g) => (
                      <div key={g.src} style={{ display: 'grid', gap: 3, justifyItems: 'center', width: 116 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={g.src} alt={g.caption} title={s.images!.credit} loading="lazy" style={{ width: 116, height: 'auto', borderRadius: 8, background: '#f4f1ea', border: '1px solid var(--hx-line)', padding: 4 }} />
                        <span style={{ fontSize: 11.5, color: 'var(--hx-gold-2)' }}>{g.caption}</span>
                      </div>
                    ))}
                  </div>
                  {s.images.credit && <figcaption style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>{s.images.credit}</figcaption>}
                </figure>
              )}
              </div>
            </details>
          ))}

          {/* ── full class tables, for systems that have them ──────────── */}
          {classes.length > 0 && (
            <section id="progression" className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 12, scrollMarginTop: 16 }}>
              <div className={styles.framedPanelTop} />
              <div>
                <h2 className={styles.panelTitle} style={{ margin: 0 }}>Class tables — every level, 1 to 20</h2>
                <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: '3px 0 0' }}>
                  What each class gains at each level, and the choices it unlocks. This is the same data the character
                  builder walks you through.
                </p>
              </div>
              {classes.map((c) => {
                const subs = subclassesFor(c.system, c.key);
                return (
                  <details key={c.key} style={{ border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)' }}>
                    <summary style={{ padding: '9px 12px', cursor: 'pointer', color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)', fontSize: 15 }}>
                      {c.name}
                      <span style={{ color: 'var(--hx-muted)', fontSize: 12, fontFamily: 'var(--hx-font-body)' }}>
                        {' '}· d{c.hitDie} · {c.savingThrows.map((s) => s.toUpperCase()).join('/')} saves · {c.features.length} features · {subs.length} {c.subclassLabel.toLowerCase()}s
                      </span>
                    </summary>
                    <div style={{ padding: '4px 12px 12px', display: 'grid', gap: 8 }}>
                      <p style={{ color: 'var(--hx-muted)', fontSize: 12.5, margin: 0 }}>{c.description}</p>
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((lv) => {
                        const feats = c.features.filter((f) => f.level === lv);
                        if (!feats.length) return null;
                        return (
                          <div key={lv} style={{ display: 'grid', gap: 3, borderTop: '1px solid var(--hx-line)', paddingTop: 6 }}>
                            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hx-teal-1)' }}>Level {lv}</div>
                            {feats.map((f, i) => (
                              <div key={i}>
                                <strong style={{ color: 'var(--hx-gold-2)', fontSize: 13.5 }}>{f.name}</strong>
                                {f.choice && (
                                  <span style={{ fontSize: 10, marginLeft: 6, padding: '1px 5px', border: '1px solid var(--hx-teal-2)', color: 'var(--hx-teal-1)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    choice
                                  </span>
                                )}
                                <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>
                                  <Rich text={f.body} />
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                      {subs.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--hx-gold-1)', paddingTop: 8 }}>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-gold-2)', marginBottom: 4 }}>
                            {c.subclassLabel}s
                          </div>
                          {subs.map((s) => (
                            <div key={s.key} style={{ marginBottom: 8 }}>
                              <strong style={{ color: 'var(--hx-text)', fontSize: 13 }}>{s.name}</strong>
                              <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{s.description}</div>
                              <div style={{ fontSize: 11.5, color: 'var(--hx-muted)', marginTop: 2 }}>
                                Features at {[...new Set(s.features.map((f) => f.level))].sort((a, b) => a - b).join(', ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </section>
          )}

          {/* ── the glossary ───────────────────────────────────────────── */}
          {glossary.length > 0 && <GlossaryList system={page.key} systemName={page.name} entries={glossary} />}

          {/* Floating launcher, pinned to THIS system so every answer stays scoped to it. */}
          <LibraryChatDock aiConfigured={dndAiConfigured()} system={page.key} systemName={page.name} />
        </div>
      </div>
    </div>
  );
}
