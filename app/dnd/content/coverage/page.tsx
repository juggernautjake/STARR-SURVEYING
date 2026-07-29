// /dnd/content/coverage — what the Studio resolves, per kind and per system (P12-1).
//
// The Studio will let you author any of the 18 kinds in any system. Whether the result lands on a sheet as
// NUMBERS or as rules text was previously discoverable only one cell at a time, as a hint beside the
// system dropdown while you filled the form in. This is that answer as a grid.
//
// Entirely DERIVED from the kind registry — there is no list here to fall out of date. Build a bridge and
// the cell changes on the next request; add a system and a column appears.
import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { coverageMatrix, coverageGaps, type CoverageState } from '@/lib/dnd/homebrew/coverage';
import { availableSystems } from '@/lib/dnd/systems';
import { KIND_GROUPS } from '@/lib/dnd/homebrew/kinds';

export const metadata: Metadata = { title: 'Homebrew coverage | Starr Tabletop' };

const CELL: Record<CoverageState, { mark: string; label: string; color: string; bg: string }> = {
  mechanical: { mark: '●', label: 'Resolved on the sheet', color: 'var(--hx-teal-1)', bg: 'rgba(var(--hx-teal-1-rgb), 0.10)' },
  gap: { mark: '○', label: 'Rules text only — a bridge we have not built', color: 'var(--hx-gold-2)', bg: 'rgba(var(--hx-gold-2-rgb), 0.10)' },
  'by-design': { mark: '—', label: 'Rules text by design — no engine resolves this anywhere', color: 'var(--hx-muted)', bg: 'transparent' },
  'n/a': { mark: '·', label: 'Not a concept in this system', color: 'var(--hx-muted)', bg: 'transparent' },
};

export default function CoveragePage() {
  const systems = availableSystems();
  const m = coverageMatrix(systems);
  const gaps = coverageGaps(m);

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '8px 10px', fontSize: 11, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: 'var(--hx-muted)', fontWeight: 600, whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = { padding: '7px 10px', borderTop: '1px solid var(--hx-line)', fontSize: 13 };

  return (
    <div className={styles.root}>
      <div className={styles.screen}>
        {/* `minmax(0, 1fr)` is load-bearing, and this is the same defect P11-5 fixed on the bespoke
            sheets. A grid with no declared columns gets ONE IMPLICIT `auto` track, and an `auto` track
            sizes to its content's min-content — not to its container. The table below carries
            `minWidth: 560` (five columns of system names do not fit a phone), so without this cap the
            whole page became 562px wide at a 360px viewport and every sibling inherited it: the intro
            paragraph and the summary panel were measured overflowing, not just the table. The table is
            SUPPOSED to scroll inside its own container; the page is not. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, width: '100%', maxWidth: 900, alignContent: 'start' }}>
          <div>
            <Link href="/dnd/content" className={styles.buttonGhost} style={{ display: 'inline-block', marginBottom: 10 }}>
              ← Back to content
            </Link>
            <h1 style={{ margin: 0, fontFamily: 'var(--hx-font-display)', fontSize: 26, color: 'var(--hx-gold-2)' }}>
              Homebrew coverage
            </h1>
            <p style={{ color: 'var(--hx-muted)', fontSize: 13.5, lineHeight: 1.55, marginTop: 6 }}>
              Every kind can be authored in every system. This is whether the result is <strong>resolved onto a
              sheet as numbers</strong> or saved as rules text — shareable and searchable either way.
              Derived from the registry, so it cannot go stale.
            </p>
          </div>

          {/* Summary first: the only number that represents work is `gaps`. */}
          <section className={styles.framedPanel} style={{ padding: '12px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: 10 }}>
              {[
                { n: m.totals.mechanical, label: 'Resolved', color: 'var(--hx-teal-1)' },
                { n: m.totals.gaps, label: m.totals.gaps === 1 ? 'Gap' : 'Gaps', color: 'var(--hx-gold-2)' },
                { n: m.totals.byDesign + m.totals.notApplicable, label: 'Prose by design', color: 'var(--hx-muted)' },
                { n: m.totals.cells, label: 'Cells', color: 'var(--hx-text)' },
              ].map((t) => (
                <div key={t.label} style={{ textAlign: 'center', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 6px' }}>
                  <div style={{ fontFamily: 'var(--hx-font-display)', fontSize: 22, fontWeight: 700, color: t.color, lineHeight: 1.1 }}>{t.n}</div>
                  <div style={{ fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>{t.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* The grid. Wrapped in a scroll container because five columns of system names will not fit a
              phone, and a table that scrolls sideways is the right answer for a table — see the overflow
              detector, which exists partly to stop this being "fixed". */}
          <section className={styles.framedPanel} style={{ padding: '4px 0 8px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={th}>Kind</th>
                    {m.systems.map((s) => <th key={s.key} style={{ ...th, textAlign: 'center' }}>{s.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {KIND_GROUPS.flatMap((group) => {
                    const rows = m.rows.filter((r) => r.group === group);
                    if (!rows.length) return [];
                    return [
                      <tr key={`g-${group}`}>
                        <td colSpan={m.systems.length + 1} style={{ ...td, color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          {group}
                        </td>
                      </tr>,
                      ...rows.map((r) => (
                        <tr key={r.kind}>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            <span aria-hidden style={{ color: 'var(--hx-gold-2)', marginRight: 6 }}>{r.icon}</span>
                            {r.label}
                          </td>
                          {r.cells.map((c) => {
                            const v = CELL[c.state];
                            return (
                              <td key={c.system} style={{ ...td, textAlign: 'center', background: v.bg }}>
                                {/* The glyph is decorative; the STATE is the accessible text, so a screen
                                    reader hears "gap", not "circle". */}
                                <span aria-hidden style={{ color: v.color, fontSize: 15 }}>{v.mark}</span>
                                <span className={styles.srOnly}>{v.label}</span>
                              </td>
                            );
                          })}
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.framedPanel} style={{ padding: '12px 14px' }}>
            <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--hx-font-display)', fontSize: 14, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>
              Legend
            </h2>
            {(Object.keys(CELL) as CoverageState[]).map((k) => (
              <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12.5, padding: '3px 0' }}>
                <span aria-hidden style={{ color: CELL[k].color, width: 14, textAlign: 'center' }}>{CELL[k].mark}</span>
                <span style={{ color: 'var(--hx-text)' }}>{CELL[k].label}</span>
              </div>
            ))}
          </section>

          <section className={styles.framedPanel} style={{ padding: '12px 14px' }}>
            <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--hx-font-display)', fontSize: 14, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>
              What is left
            </h2>
            {gaps.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--hx-muted)', margin: 0 }}>Nothing — every kind resolves in every system that has the concept.</p>
            ) : (
              gaps.map((g) => (
                <div key={g.kind} style={{ fontSize: 13, padding: '4px 0', borderTop: '1px solid var(--hx-line)' }}>
                  <strong style={{ color: 'var(--hx-text)' }}>{g.label}</strong>
                  <span style={{ color: 'var(--hx-muted)' }}>
                    {' — rules text only in '}
                    {g.missing.map((k) => m.systems.find((s) => s.key === k)?.name ?? k).join(', ')}
                  </span>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
