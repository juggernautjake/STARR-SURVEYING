'use client';
// app/admin/components/listing/ListingControls.tsx — the search bar, the Filter dropdown and the pager
// that the stacked listing pages share (Projects, Research Projects — owner's drawings, 2026-09-09).
//
// Each page keeps its OWN filter fields (a project filters by project status, a research project by
// research stage); this file only supplies the frame they sit in, so the two pages look like
// siblings without either one owning the other.

import React, { useEffect, useRef, useState } from 'react';
import { Search, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import './Listing.css';

export function ListingSearch({ value, onChange, onSubmit, placeholder, testId }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; testId?: string;
}) {
  return (
    <form className="lst-search" onSubmit={(e) => { e.preventDefault(); onSubmit(); }} role="search">
      <Search size={16} className="lst-search__icon" aria-hidden="true" />
      <input
        type="search"
        className="lst-search__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid={testId}
        autoComplete="off"
      />
      {value ? (
        <button type="button" className="lst-search__clear" onClick={() => onChange('')} aria-label="Clear search">
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
      <button type="submit" className="lst-search__btn">Search</button>
    </form>
  );
}

/** "Filter ▾" — opens a panel of whatever fields the page puts inside it. `active` is how many
 *  filters differ from their default, shown on the button so a narrowed list is never a mystery. */
export function ListingFilter({ active, onReset, children, testId }: {
  active: number; onReset: () => void; children: React.ReactNode; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="lst-filter" ref={ref}>
      <button
        type="button"
        className={`lst-filter__btn${open ? ' lst-filter__btn--open' : ''}${active > 0 ? ' lst-filter__btn--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={testId}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        Filter
        {active > 0 ? <span className="lst-filter__count">{active}</span> : null}
        <ChevronDown size={14} aria-hidden="true" className="lst-filter__chev" />
      </button>
      {open ? (
        <div className="lst-filter__panel" role="dialog" aria-label="Filters">
          {children}
          <div className="lst-filter__foot">
            <button type="button" className="lst-filter__reset" onClick={onReset} disabled={active === 0}>Reset</button>
            <button type="button" className="lst-filter__done" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One labelled group inside the filter panel. */
export function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="lst-filter__group">
      <div className="lst-filter__label">{label}</div>
      <div className="lst-filter__options">{children}</div>
    </div>
  );
}

/** A radio-style chip. */
export function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`lst-chip${on ? ' lst-chip--on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

/** "‹ 1 of 16 ›" */
export function ListingPager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="lst-pager" aria-label="Pages">
      <button type="button" className="lst-pager__btn" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <span className="lst-pager__text">{page} of {pages}</span>
      <button type="button" className="lst-pager__btn" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
