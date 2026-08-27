'use client';
// lib/hub/components/AddWidgetModal.tsx
//
// Catalog modal opened by the "+ Add Widget" affordance in the edit-mode bar.
//
// Slice 100 of customizable-hub-and-work-mode-2026-05-28.md, rebuilt for H2-H6 of
// HUB_CUSTOMIZER_2026-08-27.md.
//
// ── IT OPENS ON CATEGORIES, NOT ON WIDGETS ──────────────────────────────────────────────────────
//
// It used to render every permitted widget grouped under always-open headings — 55 tiles behind one
// scrollbar. Grouping without collapsing is still a wall, which was the owner's actual complaint:
// "the hub opens showing categories rather than a wall of widgets". So each category is now a closed
// box you open, and opening one pushes the rest down rather than replacing them.
//
// The filter-tab row is gone with it. A single-selection filter and a set of openable boxes answer
// the same question twice, and the tabs were the half that could only ever show you one category.
//
// ── SEARCH OPERATES ON CATEGORIES ───────────────────────────────────────────────────────────────
//
// `buildCategorySections` hides a whole box when nothing in it matches, and narrows the tiles inside
// the boxes that survive. A search matching three widgets should leave you looking at one box, not
// eleven boxes of which ten are empty.
//
// ── DISCLOSURE IS DERIVED, WHICH IS THE ONLY SUBTLE PART ────────────────────────────────────────
//
// A search opens what it surfaces (H4) and clearing it must restore exactly what you had (H6). Those
// fight if there is one open-set that the search mutates. `category-disclosure.ts` keeps user intent
// and search-derived opening apart and derives what is shown, so clearing restores by construction.
// The reasoning is in that file's header; do not collapse the two pieces of state back into one.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { UserRole } from '@/lib/auth-roles';
import type { BundleId } from '@/lib/saas/bundles';
import { allWidgets, type WidgetCategory, type WidgetDefinition } from '@/lib/hub/widget-registry';
import { buildCategorySections, type CategorySection } from '@/lib/hub/widget-catalog-filter';
import {
  emptyDisclosure,
  isCategoryOpen,
  isSearchActive,
  onSearchChanged,
  toggleCategory,
  type DisclosureState,
} from '@/lib/hub/category-disclosure';
import { useHubStore } from '@/lib/hub/hub-store';
import { useHubActions } from '@/lib/hub/use-hub-actions';
import { compactLayout } from '@/lib/hub/grid-math';
import { HUB_GRID_COLS } from '@/lib/hub/grid-model';
import type { WidgetInstance } from '@/lib/hub/types';

export interface AddWidgetModalProps {
  open: boolean;
  onClose: () => void;
  /** Roles the current user holds — gates which catalog entries
   *  appear. Empty array shows only universal widgets. */
  roles: UserRole[];
  /** Active bundles. `null` skips the gate (legacy / non-SaaS). */
  activeBundles?: BundleId[] | null;
}

const CATEGORY_LABELS: Record<WidgetCategory | 'all', string> = {
  all:           'All',
  personal:      'Personal',
  work:          'Work',
  'time-pay':    'Time & Pay',
  equipment:     'Equipment',
  cad:           'CAD',
  research:      'Research',
  learning:      'Learning',
  communication: 'Communication',
  office:        'Office',
  financial:     'Financial',
  operational:   'Operational',
};

// Slice 201 — when `open=false` the outer component renders nothing
// + skips ALL the hook calls that walk the catalog (`allWidgets`,
// `filterCatalog`, `groupByCategory`). The hooks live in the inner
// `AddWidgetModalBody` which only mounts when `open` is true. Net
// effect: in the common case (modal closed) the parent canvas pays
// almost nothing for keeping this component in the tree.
export default function AddWidgetModal({ open, onClose, roles, activeBundles = null }: AddWidgetModalProps) {
  if (!open) return null;
  return (
    <AddWidgetModalBody
      onClose={onClose}
      roles={roles}
      activeBundles={activeBundles}
    />
  );
}

interface AddWidgetModalBodyProps {
  onClose: () => void;
  roles: UserRole[];
  activeBundles: BundleId[] | null;
}

function AddWidgetModalBody({ onClose, roles, activeBundles }: AddWidgetModalBodyProps) {
  const [search, setSearch] = useState('');
  const [disclosure, setDisclosure] = useState<DisclosureState>(emptyDisclosure);
  const prevSearch = useRef('');
  const draftWidgets = useHubStore((s) => s.draftWidgets);
  // Slice 200 — actions via getState (stable closures), no wasted subscription.
  const { setDraftWidgets } = useHubActions();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Focus the search input when the modal opens. Body only mounts
  // while the modal is open so this fires exactly once per open.
  useEffect(() => {
    const id = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);

  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Catalog walk now only runs while the modal is mounted —
  // previously fired on every parent render even when closed.
  const catalog = useMemo(() => allWidgets(), []);

  const sections = useMemo(
    () => buildCategorySections(catalog, { roles, activeBundles, search }),
    [catalog, roles, activeBundles, search],
  );

  const searchActive = isSearchActive(search);

  function onSearch(next: string) {
    // Overrides belong to the query that produced them, so they are dropped when it changes.
    setDisclosure((d) => onSearchChanged(d, next, prevSearch.current));
    prevSearch.current = next;
    setSearch(next);
  }

  function handleAdd(def: WidgetDefinition) {
    const existing = draftWidgets ?? [];
    const newInstance: WidgetInstance = {
      id: makeInstanceId(),
      type: def.id,
      x: 0,
      y: 0,
      w: def.defaultSize.w,
      h: def.defaultSize.h,
      customization: { content: def.defaultContent },
    };
    const compacted = compactLayout([...existing, newInstance], HUB_GRID_COLS);
    setDraftWidgets(compacted);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add widget"
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* H5 — a fade, not a pop. Results update on every keystroke, so boxes and tiles arrive and
            leave constantly; without this the catalog looks like things are blinking in and out of
            existence. Follows the inline-<style> pattern from WidgetSkeleton, since this component
            is otherwise inline-styled and has no stylesheet of its own. Reduced motion opts out. */}
        <style>{`
          @keyframes hub-cat-fade {
            from { opacity: 0; transform: translateY(-3px); }
            to   { opacity: 1; transform: none; }
          }
          .hub-cat-reveal { animation: hub-cat-fade 170ms ease both; }
          .hub-cat-reveal > * { animation: hub-cat-fade 190ms ease both; }
          @media (prefers-reduced-motion: reduce) {
            .hub-cat-reveal, .hub-cat-reveal > * { animation: none !important; }
          }
        `}</style>
        <header style={headerStyle}>
          <h2 style={titleStyle}>Add a widget</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={closeButtonStyle}>×</button>
        </header>

        <div style={searchRowStyle}>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search widgets…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            style={searchInputStyle}
            aria-label="Search widgets"
          />
        </div>

        <div style={listStyle}>
          {sections.length === 0 && (
            <div style={emptyStyle}>
              Nothing matches “{search.trim()}”. Try a shorter word — the search looks at every
              widget&rsquo;s name, description and category.
            </div>
          )}
          {sections.map((section) => (
            <CategoryBox
              key={section.category}
              section={section}
              open={isCategoryOpen(disclosure, section.category, { searchActive, matched: section.matched })}
              onToggle={() => setDisclosure((d) => toggleCategory(d, section.category, {
                searchActive, matched: section.matched,
              }))}
              onPick={handleAdd}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One category, closed by default, opening in place.
 *
 * The count on the header is what makes a closed box worth having: you can see how much is inside
 * without opening it. When a search has narrowed the box, both numbers are shown — "3 of 12" — so a
 * shortened list never reads as a category that lost widgets.
 */
function CategoryBox({ section, open, onToggle, onPick }: {
  section: CategorySection;
  open: boolean;
  onToggle: () => void;
  onPick: (def: WidgetDefinition) => void;
}) {
  const narrowed = section.widgets.length !== section.total;
  return (
    <section style={boxStyle} data-category={section.category} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={boxHeadStyle}
      >
        <span style={{ ...caretStyle, transform: open ? 'rotate(90deg)' : 'none' }} aria-hidden="true">▸</span>
        <span style={boxTitleStyle}>{CATEGORY_LABELS[section.category]}</span>
        <span style={boxCountStyle}>
          {narrowed ? `${section.widgets.length} of ${section.total}` : section.total}
        </span>
      </button>

      {open && (
        // H5 — fade in rather than appear. Keywords update per keystroke, so boxes and tiles are
        // constantly arriving and leaving; without this the screen looks like things are popping in
        // and out of existence.
        <div style={tileGridStyle} className="hub-cat-reveal">
          {section.widgets.map((w) => (
            <WidgetTile key={w.id} def={w} onPick={() => onPick(w)} />
          ))}
        </div>
      )}
    </section>
  );
}

function WidgetTile({ def, onPick }: { def: WidgetDefinition; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Add ${def.label}`}
      style={tileStyle}
    >
      <span style={tileLabelStyle}>{def.label}</span>
      <span style={tileDescriptionStyle}>{def.description}</span>
    </button>
  );
}

function makeInstanceId(): string {
  // Stable enough; consumed only by the layout JSON. crypto.randomUUID
  // when available (modern Node, browsers); fallback Math.random for
  // older runtimes.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Style fragments ───────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'color-mix(in srgb, var(--theme-bg-page) 60%, transparent)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: 'var(--hub-spc-5, 24px)',
  zIndex: 50,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  borderRadius: 12,
  width: 'min(720px, 100%)',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
  borderBottom: '1px solid var(--theme-border)',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--hub-font-lg, 1.125rem)',
  fontWeight: 600,
};

const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--theme-fg-secondary)',
  fontSize: 24,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 4,
};

const searchRowStyle: React.CSSProperties = {
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};

const boxStyle: React.CSSProperties = {
  border: '1px solid var(--theme-border)',
  borderRadius: 10,
  marginBottom: 'var(--hub-spc-2, 8px)',
  overflow: 'hidden',
  background: 'var(--theme-bg-surface)',
};

const boxHeadStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  width: '100%',
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-3, 12px)',
  border: 'none',
  background: 'transparent',
  color: 'var(--theme-fg-primary)',
  font: 'inherit',
  textAlign: 'left' as const,
  cursor: 'pointer',
  minHeight: 44,
};

const caretStyle: React.CSSProperties = {
  flex: '0 0 auto',
  width: 12,
  fontSize: 11,
  color: 'var(--theme-fg-secondary)',
  transition: 'transform 160ms ease',
};

const boxTitleStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 650,
};

const boxCountStyle: React.CSSProperties = {
  flex: '0 0 auto',
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  fontVariantNumeric: 'tabular-nums',
};

const listStyle: React.CSSProperties = {
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
  overflowY: 'auto',
  flex: 1,
  borderTop: '1px solid var(--theme-border)',
};

const tileGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: 'var(--hub-spc-2, 8px)',
  padding: '0 var(--hub-spc-3, 12px) var(--hub-spc-3, 12px)',
};

const tileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
  padding: 'var(--hub-spc-3, 12px)',
  borderRadius: 8,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  textAlign: 'left' as const,
  cursor: 'pointer',
};

const tileLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-base, 1rem)',
  fontWeight: 600,
};

const tileDescriptionStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
};

const emptyStyle: React.CSSProperties = {
  padding: 'var(--hub-spc-4, 16px)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  color: 'var(--theme-fg-secondary)',
  textAlign: 'center' as const,
};
