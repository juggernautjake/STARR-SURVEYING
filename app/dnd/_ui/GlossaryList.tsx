'use client';
// app/dnd/_ui/GlossaryList.tsx — a system's fully-explained terms, browsable and filterable.
//
// Every entry is expanded from a real article (not a stub), grouped by kind, with a filter for
// looking something up mid-session. seeAlso links jump within the same system — never across, since
// the same word means different things in different games.
import { useMemo, useState } from 'react';
import styles from './hextech.module.css';
import type { GlossaryEntry } from '@/lib/dnd/glossary';
import GiveEntryButton, { grantKindForGlossary } from './GiveEntryButton';

const KIND_LABEL: Record<string, string> = {
  condition: 'Conditions',
  mechanic: 'Core mechanics',
  action: 'Actions',
  term: 'Terms',
  class: 'Classes',
  feature: 'Features',
  stat: 'Attributes',
};

const KIND_ORDER = ['mechanic', 'term', 'stat', 'action', 'condition', 'class', 'feature'];

/** Markdown-lite: **bold** + "· " bullets. */
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

export default function GlossaryList({
  system,
  systemName,
  entries,
}: {
  system: string;
  systemName: string;
  entries: GlossaryEntry[];
}) {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const hay = [e.term, ...(e.aliases ?? []), e.short, e.body].join('\n').toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [entries, filter]);

  const grouped = useMemo(() => {
    const g: Record<string, GlossaryEntry[]> = {};
    for (const e of shown) (g[e.kind] ||= []).push(e);
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.term.localeCompare(b.term));
    return g;
  }, [shown]);

  const kinds = KIND_ORDER.filter((k) => grouped[k]?.length);

  return (
    <section id="glossary" className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 12, scrollMarginTop: 16 }}>
      <div className={styles.framedPanelTop} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>Glossary</h2>
          <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: '3px 0 0' }}>
            {entries.length} {systemName} terms, each explained in full. Click one to read it.
          </p>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter terms…"
          aria-label={`Filter ${systemName} glossary`}
          style={{ flex: '0 1 260px', padding: '7px 10px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 13 }}
        />
      </div>

      {shown.length === 0 && (
        <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: 0 }}>Nothing in {systemName}’s glossary matches “{filter}”.</p>
      )}

      {kinds.map((kind) => (
        <div key={kind} style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hx-teal-1)', borderBottom: '1px solid var(--hx-line)', paddingBottom: 3 }}>
            {KIND_LABEL[kind] ?? kind} · {grouped[kind].length}
          </div>
          {grouped[kind].map((e) => {
            const isOpen = open === e.term;
            return (
              <div key={e.term} id={`term-${e.term.replace(/\s+/g, '-').toLowerCase()}`} style={{ borderBottom: '1px solid rgba(30,45,61,0.5)' }}>
                <button
                  onClick={() => setOpen(isOpen ? null : e.term)}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 2px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 2,
                  }}
                >
                  <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong style={{ color: isOpen ? 'var(--hx-gold-2)' : 'var(--hx-text)', fontSize: 13.5 }}>{e.term}</strong>
                    {e.aliases?.length ? (
                      <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>{e.aliases.slice(0, 3).join(' · ')}</span>
                    ) : null}
                    <span style={{ marginLeft: 'auto', color: 'var(--hx-muted)', fontSize: 11 }}>{isOpen ? '−' : '+'}</span>
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>{e.short}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '2px 2px 12px', fontSize: 13.5, color: 'var(--hx-text)' }}>
                    <Rich text={e.body} />
                    {/* Give this to a character — conditions and features only; a term like
                        "Advantage" describes how the game works, it isn't something you can be
                        given. Must sit OUTSIDE the toggle <button> above: nesting would be
                        invalid HTML and would swallow the click. */}
                    <GiveEntryButton kind={grantKindForGlossary(e.kind)} name={e.term} system={system} detail={e.body} />
                    {e.seeAlso?.length ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--hx-muted)' }}>
                        See also:{' '}
                        {e.seeAlso.map((ref, i) => (
                          <span key={ref}>
                            {i > 0 && ' · '}
                            <button
                              onClick={() => {
                                setOpen(ref);
                                document.getElementById(`term-${ref.replace(/\s+/g, '-').toLowerCase()}`)?.scrollIntoView({ block: 'center' });
                              }}
                              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--hx-teal-1)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
                            >
                              {ref}
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
