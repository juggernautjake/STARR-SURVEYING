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
import { GAME_SYSTEMS } from '@/lib/dnd/systems';
import { dndAiConfigured } from '@/lib/dnd/ai';
import LibrarySearch from '@/app/dnd/_ui/LibrarySearch';
import LibraryChat from '@/app/dnd/_ui/LibraryChat';
import GlossaryList from '@/app/dnd/_ui/GlossaryList';
import { igSystemLogo, IG_ART_CREDIT } from '@/lib/dnd/systems/intuitive-games/art';

export function generateStaticParams() {
  return GAME_SYSTEMS.map((s) => ({ key: s.key }));
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
  if (!page) notFound();

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
              {page.key === 'intuitive-games' && (
                // Brendan's Intuitive Games logo — the system's own mark, credited to him.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={igSystemLogo()} alt="Intuitive Games logo" title={IG_ART_CREDIT} style={{ width: 56, height: 56, flex: '0 0 auto' }} />
              )}
              <h1 className={styles.title} style={{ textAlign: 'left', margin: 0 }}>{page.name}</h1>
            </div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hx-teal-1)', marginTop: 4 }}>
              {page.tagline}
            </div>
            <p style={{ color: 'var(--hx-muted)', margin: '6px 0 0', maxWidth: 720 }}>
              {page.notes} {page.publisher ? `· ${page.publisher}` : ''} · Facts drawn from <em>{page.source}</em>.
              {page.key === 'intuitive-games' && <> · <span style={{ color: 'var(--hx-gold-2)' }}>{IG_ART_CREDIT}</span></>}
            </p>
          </div>

          {/* ── jump links ─────────────────────────────────────────────── */}
          <nav
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)' }}
            aria-label="Jump to a section"
          >
            {page.sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--hx-gold-2)', textDecoration: 'none' }}>
                {s.title}
              </a>
            ))}
            {glossary.length > 0 && (
              <a href="#glossary" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--hx-gold-2)', textDecoration: 'none' }}>
                Glossary ({glossary.length})
              </a>
            )}
            {classes.length > 0 && (
              <a href="#progression" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--hx-gold-2)', textDecoration: 'none' }}>
                Class tables
              </a>
            )}
          </nav>

          <LibrarySearch system={page.key} systemName={page.name} />

          {/* ── the rules, section by section ──────────────────────────── */}
          {page.sections.map((s) => (
            <section key={s.id} id={s.id} className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10, scrollMarginTop: 16 }}>
              <div className={styles.framedPanelTop} />
              <div>
                <h2 className={styles.panelTitle} style={{ margin: 0 }}>{s.title}</h2>
                {s.lead && <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: '3px 0 0' }}>{s.lead}</p>}
              </div>

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
            </section>
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

          <LibraryChat aiConfigured={dndAiConfigured()} system={page.key} title={`Ask the librarian — ${page.name}`} />
        </div>
      </div>
    </div>
  );
}
