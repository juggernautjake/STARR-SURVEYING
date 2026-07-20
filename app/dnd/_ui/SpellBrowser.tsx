'use client';
// SpellBrowser — search and filter the whole spell catalog.
//
// S4 of DND_2024_COMPLETE_LIBRARY_2026-07-20 (owner: "make there be filter options so that we
// can filter what the results show"). Free-text search over name/school/summary, plus faceted
// filters built from the derived tag vocabulary — so the facets are always in step with the
// data rather than a hand-kept list that drifts.
//
// Everything runs client-side against the in-memory catalog: 405 spells is small, and it makes
// filtering instant with no round trip. Facet COUNTS are computed against the other active
// filters, so a count never promises results that clicking it won't produce.
import { useMemo, useState } from 'react';
import styles from './hextech.module.css';
import { spellsForSystem, spellCatalog, type SpellDef } from '@/lib/dnd/spells';
import { tagsForSpell, facetsFor, matchesTagFilters, tagCounts } from '@/lib/dnd/library-tags';
import GiveEntryButton from './GiveEntryButton';
import TermText from './TermText';

export default function SpellBrowser({ system }: { system: string }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [openSpell, setOpenSpell] = useState<string | null>(null);

  const all = useMemo(() => spellsForSystem(system), [system]);
  const status = useMemo(() => spellCatalog(system), [system]);
  // Tag every spell once; the browser then filters over the pairs.
  const tagged = useMemo(() => all.map((s) => ({ spell: s, tags: tagsForSpell(s) })), [all]);

  const textMatch = (s: SpellDef, needle: string) =>
    !needle ||
    s.name.toLowerCase().includes(needle) ||
    s.school.toLowerCase().includes(needle) ||
    s.summary.toLowerCase().includes(needle);

  const needle = q.trim().toLowerCase();
  const results = useMemo(
    () => tagged.filter((t) => textMatch(t.spell, needle) && matchesTagFilters(t.tags, selected)),
    [tagged, needle, selected],
  );

  // Facets are built from everything matching the TEXT search, so the panel still offers the
  // other options in a group you have already filtered on.
  const textFiltered = useMemo(() => tagged.filter((t) => textMatch(t.spell, needle)), [tagged, needle]);
  const facets = useMemo(() => facetsFor(textFiltered.map((t) => t.tags)), [textFiltered]);
  const counts = useMemo(() => {
    // For each facet key, how many results there would be if it were also selected.
    const m = new Map<string, number>();
    for (const f of facets) {
      for (const t of f.tags) {
        const trial = selected.includes(t.key) ? selected : [...selected, t.key];
        m.set(t.key, textFiltered.filter((x) => matchesTagFilters(x.tags, trial)).length);
      }
    }
    return m;
  }, [facets, textFiltered, selected]);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  if (!all.length) return null;

  return (
    <section id="spell-browser" className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 12, scrollMarginTop: 16 }}>
      <div className={styles.framedPanelTop} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>Spells</h2>
          <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: '3px 0 0' }}>
            {results.length === all.length
              ? `${all.length} spells — search or filter to narrow them.`
              : `${results.length} of ${all.length} spells.`}
          </p>
        </div>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, school, or effect…"
          aria-label="Search spells"
          style={{ flex: '0 1 280px', padding: '7px 10px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 13 }}
        />
      </div>

      {/* Facets */}
      <div style={{ display: 'grid', gap: 8 }}>
        {selected.length > 0 && (
          <button
            type="button" onClick={() => setSelected([])}
            style={{ justifySelf: 'start', background: 'none', border: '1px solid var(--hx-line)', color: 'var(--hx-teal-1)', fontSize: 12, padding: '3px 9px', borderRadius: 999, cursor: 'pointer' }}
          >
            Clear {selected.length} filter{selected.length === 1 ? '' : 's'} ✕
          </button>
        )}
        {facets.map((f) => (
          <div key={f.group} style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-teal-1)', minWidth: 92 }}>{f.label}</span>
            {f.tags.map((t) => {
              const on = selected.includes(t.key);
              const n = counts.get(t.key) ?? 0;
              return (
                <button
                  key={t.key} type="button" onClick={() => toggle(t.key)}
                  // A zero-count option is left clickable but dimmed: hiding it makes the panel
                  // jump around as you filter, which is worse than showing it is empty.
                  title={`${t.label} — ${n} match${n === 1 ? '' : 'es'}`}
                  style={{
                    fontSize: 11.5, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                    background: on ? 'rgba(10,200,185,0.16)' : 'transparent',
                    color: on ? 'var(--hx-teal-1)' : n === 0 ? 'var(--hx-muted)' : 'var(--hx-text)',
                    opacity: n === 0 && !on ? 0.45 : 1,
                  }}
                >
                  {t.label} <span style={{ opacity: 0.7 }}>{n}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: 0 }}>
          Nothing matches. Clear a filter, or search a different word.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 5 }}>
          {results.map(({ spell, tags }) => {
            const isOpen = openSpell === spell.key;
            return (
              <div key={spell.key} style={{ borderBottom: '1px solid rgba(30,45,61,0.5)', paddingBottom: 5 }}>
                <button
                  type="button" onClick={() => setOpenSpell(isOpen ? null : spell.key)}
                  aria-expanded={isOpen}
                  style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px 2px', display: 'grid', gap: 2 }}
                >
                  <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong style={{ color: isOpen ? 'var(--hx-gold-2)' : 'var(--hx-text)', fontSize: 13.5 }}>{spell.name}</strong>
                    <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
                      {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} · {spell.school}
                    </span>
                    <span style={{ marginLeft: 'auto', color: 'var(--hx-muted)', fontSize: 11 }}>{isOpen ? '−' : '+'}</span>
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>{spell.summary}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: '4px 2px 10px', fontSize: 13 }}>
                    <div style={{ color: 'var(--hx-muted)', fontSize: 12, marginBottom: 6 }}>
                      {spell.castTime} · {spell.range} · {spell.components}
                      {spell.material ? ` (${spell.material})` : ''} · {spell.duration}
                      {spell.concentration ? ' · Concentration' : ''}{spell.ritual ? ' · Ritual' : ''}
                    </div>
                    {/* Terms in the summary are clickable, with their own explain-tooltips. */}
                    <TermText text={spell.summary} system={system} selfTerm={spell.name} />
                    {spell.higher && (
                      <p style={{ marginTop: 6, color: 'var(--hx-muted)', fontSize: 12.5 }}>
                        <b>At higher levels:</b> {spell.higher}
                      </p>
                    )}
                    {spell.editionNote && (
                      <p style={{ marginTop: 6, color: 'var(--hx-gold-2)', fontSize: 12 }}><b>2024 vs 2014:</b> {spell.editionNote}</p>
                    )}
                    <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--hx-muted)' }}>
                      Classes: {spell.classes.join(', ')} · Source: {spell.source}
                    </div>
                    {/* Visible tag chips — the same vocabulary the facets filter on. */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
                      {tags.map((t) => (
                        <span key={t.key} style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 999, border: '1px solid var(--hx-line)', color: 'var(--hx-muted)' }}>
                          {t.label}
                        </span>
                      ))}
                    </div>
                    <GiveEntryButton sectionId="spells" name={spell.name} system={system} detail={spell.summary} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!status.complete && (
        <p style={{ fontSize: 11.5, color: 'var(--hx-muted)', margin: 0 }}>
          {all.length} spells catalogued. Anything missing can still be added by hand on a sheet.
        </p>
      )}
    </section>
  );
}
