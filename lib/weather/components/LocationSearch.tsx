'use client';
// lib/weather/components/LocationSearch.tsx
//
// The one location picker, shared by the weather widget's settings, the widget's inline "change
// location" control, and the /admin/weather page (owner, 2026-08-06: *"add the search functionality
// to the widget and the weather page"*).
//
// Shared rather than written twice on purpose: two pickers drift, and this repo has a documented
// history of exactly that — the icon rail and the mobile drawer disagreeing about 32 routes because
// each kept its own list. One component, three mount points.
//
// Styling uses the hub's `--theme-*` variables with plain fallbacks, so it inherits the user's skin
// inside a widget and still looks right on the standalone page, which is not themed.

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { LocationHit } from '@/lib/weather/location-search';

import './LocationSearch.css';

export interface LocationSearchProps {
  onSelect: (hit: LocationHit) => void;
  /** Shown when nothing is typed — normally the currently-selected place. */
  placeholder?: string;
  /** Renders a smaller control for the widget's cramped settings panel. */
  compact?: boolean;
  autoFocus?: boolean;
  /** Called when the user presses Escape on an empty box — lets the widget close its popover. */
  onDismiss?: () => void;
}

const DEBOUNCE_MS = 250;

const KIND_LABEL: Record<LocationHit['kind'], string> = {
  city: 'City',
  county: 'County',
  zip: 'ZIP',
};

export default function LocationSearch({
  onSelect,
  placeholder = 'Search any US city or county…',
  compact = false,
  autoFocus = false,
  onDismiss,
}: LocationSearchProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [searched, setSearched] = useState(false);

  const listId = useId();
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Every in-flight request gets a sequence number; only the newest may write state. Without this a
  // slow "a" can land after a fast "austin" and repopulate the list with the wrong results.
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/weather/locations?q=${encodeURIComponent(q)}`);
        if (mine !== seq.current) return;
        if (!res.ok) { setResults([]); return; }
        const data = await res.json() as { results?: LocationHit[] };
        setResults(data.results ?? []);
        setActiveIdx((data.results ?? []).length > 0 ? 0 : -1);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) { setLoading(false); setSearched(true); }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Close on an outside click. The widget mounts this in a popover, so leaving it open after a
  // click elsewhere would cover the forecast it is meant to change.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = useCallback((hit: LocationHit) => {
    onSelect(hit);
    setQuery('');
    setResults([]);
    setOpen(false);
    setActiveIdx(-1);
    setSearched(false);
  }, [onSelect]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (open && results.length) { setOpen(false); return; }
      onDismiss?.();
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[activeIdx] ?? results[0];
      if (hit) choose(hit);
    }
  };

  const showList = open && query.trim().length >= 2;

  return (
    <div
      ref={boxRef}
      className={`wx-loc${compact ? ' wx-loc--compact' : ''}`}
      data-testid="weather-location-search"
    >
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIdx >= 0 ? `${listId}-opt-${activeIdx}` : undefined}
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        data-testid="weather-location-input"
        className="wx-loc__input"
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          data-testid="weather-location-results"
          className="wx-loc__list"
        >
          {loading && results.length === 0 && (
            <li className="wx-loc__msg">Searching&hellip;</li>
          )}
          {!loading && searched && results.length === 0 && (
            <li className="wx-loc__msg" data-testid="weather-location-empty">
              Nothing found in the US for “{query.trim()}”.
            </li>
          )}
          {results.map((hit, i) => (
            <li
              key={hit.id}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              data-testid="weather-location-option"
              onMouseEnter={() => setActiveIdx(i)}
              // `onMouseDown` rather than `onClick`: the input's blur fires first on click and can
              // close the list before the click lands, which reads to the user as "nothing happened".
              onMouseDown={(e) => { e.preventDefault(); choose(hit); }}
              className={`wx-loc__opt${i === activeIdx ? ' wx-loc__opt--active' : ''}`}
            >
              <span aria-hidden className={`wx-loc__kind wx-loc__kind--${hit.kind}`}>
                {KIND_LABEL[hit.kind]}
              </span>
              <span className="wx-loc__text">
                <span className="wx-loc__name">{hit.name}</span>
                <span className="wx-loc__meta">
                  {/* A city's county is the thing that disambiguates the eleven Springfields. */}
                  {hit.county ? `${hit.county} County · ${hit.state}` : hit.state}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
