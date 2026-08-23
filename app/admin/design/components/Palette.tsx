'use client';
// app/admin/design/components/Palette.tsx — find the element, then drop it on the page.
//
// Slices P1 + P1b of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"Mostly the process will be, find the element you want by searching it with the search
// feature/function, and then click, drag and drop the element onto the page."*
//
// So search is the primary control, not a filter tucked in a corner: it is focused by `/` from
// anywhere, it is the first thing in the panel, and results come back as LIVE PREVIEWS of the real
// element rather than names in a list. Every result says why it matched, because a search you
// cannot reason about is one you stop trusting the first time it surprises you.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ENTRIES, CATEGORIES, entriesInCategory, populatedCategories } from '@/lib/design/catalogue';
import type { CategoryId } from '@/lib/design/catalogue/types';
import { buildIndex, searchWithFallback } from '@/lib/design/search';
import { CONCEPTS } from '@/lib/design/search/concepts';
import { renderElement } from '@/lib/design/render';
import type { ViewId } from '@/lib/design/document';
import { EMOJI_GROUPS, SYMBOL_GROUPS, CHARACTER_COUNTS, searchCharacters } from '@/lib/design/libraries/characters';

interface Props {
  onPlace: (catalogId: string) => void;
  /** Drop a bare character — an emoji or a symbol — onto the artboard as free text. */
  onPlaceCharacter: (character: string) => void;
  viewId: ViewId;
}

/** A palette tile: the real element, rendered small and non-interactive. */
function Preview({ catalogId }: { catalogId: string }) {
  const entry = ENTRIES.find((e) => e.id === catalogId);
  if (!entry) return null;
  const html = renderElement(entry, {
    id: 'preview', kind: 'catalogue', catalogId, slots: {}, style: {},
    x: 0, y: 0, w: entry.size.default.w, h: entry.size.default.h, z: 0,
  });
  // Scaled down rather than shrunk: a 640px table has to be recognisable in a 200px tile, and
  // re-styling it to fit would show something the canvas will not.
  const scale = Math.min(1, 190 / entry.size.default.w);
  return (
    <div className="dsx-pal__preview" aria-hidden>
      <div
        style={{
          width: entry.size.default.w,
          height: Math.min(entry.size.default.h, 120),
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export default function Palette({ onPlace, onPlaceCharacter, viewId }: Props) {
  const [query, setQuery] = useState('');
  // 'symbol' is not a catalogue category — symbols are characters, not components — so the tab
  // state is a superset of the category ids rather than pretending otherwise.
  type Tab = CategoryId | 'all' | 'symbol';
  const [category, setCategory] = useState<Tab>('all');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const index = useMemo(() => buildIndex(ENTRIES), []);
  const categories = useMemo(() => populatedCategories(), []);

  const { hits, note } = useMemo(
    () => searchWithFallback(index, query, { categories: category === 'all' || category === 'symbol' ? undefined : [category], limit: 80 }),
    [index, query, category],
  );

  // `/` focuses the search from anywhere, the way every tool with a lot of things in it does.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === '/') { e.preventDefault(); inputRef.current?.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── EMOJI AND SYMBOLS ────────────────────────────────────────────────────────────────────────
  //
  // Two extra tabs rather than catalogue entries: 1,341 characters would swamp a palette of
  // twenty-seven components, and picking a character is a different act from picking an element —
  // you browse for one and search for the other.
  const characterTab = category === 'emoji' || category === 'symbol';
  const characterGroups = useMemo(() => {
    if (!characterTab) return [];
    return searchCharacters(category === 'emoji' ? EMOJI_GROUPS : SYMBOL_GROUPS, query);
  }, [category, characterTab, query]);

  const showingSearch = query.trim().length > 0;
  const grouped = useMemo(() => {
    if (showingSearch) return null;
    const list = category === 'all' ? categories : [category];
    return list
      .filter((id): id is CategoryId => id !== 'symbol')
      .map((id) => ({
        id,
        meta: CATEGORIES.find((c) => c.id === id)!,
        entries: entriesInCategory(id),
      }))
      .filter((g) => g.entries.length && g.meta);
  }, [categories, category, showingSearch]);

  return (
    <aside className="dsx-pal" aria-label="Elements">
      <div className="dsx-pal__search">
        <Search size={15} aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search elements — try “date”"
          aria-label="Search elements"
          data-testid="ds-palette-search"
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>
        )}
      </div>

      {/* Concepts as facets: narrowing by clicking beats narrowing by typing a better query. */}
      {!showingSearch && (
        <div className="dsx-pal__concepts">
          {CONCEPTS.slice(0, 8).map((c) => (
            <button key={c.id} className="dsx-pal__concept" onClick={() => setQuery(c.terms[0])}>{c.label}</button>
          ))}
        </div>
      )}

      <div className="dsx-pal__tabs" role="tablist" aria-label="Categories">
        <button role="tab" aria-selected={category === 'all'} className={`dsx-pal__tab${category === 'all' ? ' is-on' : ''}`} onClick={() => setCategory('all')}>All</button>
        {(['emoji', 'symbol'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={category === id}
            className={`dsx-pal__tab${category === id ? ' is-on' : ''}`}
            onClick={() => setCategory(id)}
          >
            {id === 'emoji' ? 'Emoji' : 'Symbols'}
          </button>
        ))}
        {categories.map((id) => {
          const meta = CATEGORIES.find((c) => c.id === id)!;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={category === id}
              className={`dsx-pal__tab${category === id ? ' is-on' : ''}`}
              onClick={() => setCategory(id)}
              title={meta.blurb}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      <div className="dsx-pal__list">
        {characterTab && (
          <>
            <p className="dsx-pal__note">
              {category === 'emoji'
                ? `${CHARACTER_COUNTS.emoji} emoji, enumerated from Unicode itself. Click one to drop it on the page.`
                : `${CHARACTER_COUNTS.symbols} symbols — arrows, maths, currency, typography, box drawing, and the survey marks.`}
            </p>
            {characterGroups.map((group) => (
              <section key={group.id} className="dsx-pal__group">
                <h3 className="dsx-pal__group-title">{group.label}<span>{group.chars.length}</span></h3>
                <div className="dsx-pal__chars">
                  {group.chars.map((entry) => (
                    <button
                      key={entry.c}
                      className="dsx-pal__char"
                      title={entry.k ? entry.k.join(', ') : group.label}
                      onClick={() => onPlaceCharacter(entry.c)}
                      data-testid={`ds-char-${entry.c}`}
                    >
                      {entry.c}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {characterGroups.length === 0 && (
              <p className="dsx-pal__note">Nothing matched. Try a group name — “arrows”, “food”, “currency”.</p>
            )}
          </>
        )}

        {!characterTab && note && <p className="dsx-pal__note">{note}</p>}

        {!characterTab && showingSearch && hits.map((hit) => (
          <button
            key={hit.entry.id}
            className="dsx-pal__item"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('application/x-design-entry', hit.entry.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => onPlace(hit.entry.id)}
            title={`${hit.entry.description}\n\nmatched: ${hit.reasons.join(' · ')}`}
            data-testid={`ds-palette-item-${hit.entry.id}`}
          >
            <Preview catalogId={hit.entry.id} />
            <span className="dsx-pal__label">{hit.entry.label}</span>
            {hit.reasons.length > 0 && <span className="dsx-pal__why">{hit.reasons[0]}</span>}
          </button>
        ))}

        {!characterTab && !showingSearch && grouped?.map((group) => (
          <section key={group.id} className="dsx-pal__group">
            <h3 className="dsx-pal__group-title">{group.meta.label}<span>{group.entries.length}</span></h3>
            {group.entries.map((entry) => (
              <button
                key={entry.id}
                className="dsx-pal__item"
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('application/x-design-entry', entry.id); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => onPlace(entry.id)}
                title={entry.description}
                data-testid={`ds-palette-item-${entry.id}`}
              >
                <Preview catalogId={entry.id} />
                <span className="dsx-pal__label">{entry.label}</span>
                {entry.usageCount > 0 && <span className="dsx-pal__why">used {entry.usageCount}× in the app</span>}
              </button>
            ))}
          </section>
        ))}

        {!characterTab && showingSearch && hits.length === 0 && !note && (
          <p className="dsx-pal__note">Nothing matched. Try what the thing does — “save”, “empty”, “date”.</p>
        )}
      </div>

      <p className="dsx-pal__foot">
        Drag onto the {viewId} artboard, or click to drop it in the middle. Press <kbd>/</kbd> to search.
      </p>
    </aside>
  );
}
