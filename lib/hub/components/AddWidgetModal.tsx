'use client';
// lib/hub/components/AddWidgetModal.tsx
//
// Catalog modal opened by the "+ Add Widget" affordance in the
// edit-mode bar. Lists every widget the user can add, grouped by
// category, filtered by an optional search term. Click an entry to
// append it to the draft layout (the modal then closes).
//
// Slice 100 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { UserRole } from '@/lib/auth';
import type { BundleId } from '@/lib/saas/bundles';
import { allWidgets, type WidgetCategory, type WidgetDefinition } from '@/lib/hub/widget-registry';
import { filterCatalog, groupByCategory } from '@/lib/hub/widget-catalog-filter';
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
  const [category, setCategory] = useState<WidgetCategory | 'all'>('all');
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

  const filtered = useMemo(
    () => filterCatalog(catalog, { roles, activeBundles, search, category }),
    [catalog, roles, activeBundles, search, category],
  );

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

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
            onChange={(e) => setSearch(e.target.value)}
            style={searchInputStyle}
            aria-label="Search widgets"
          />
        </div>

        <nav aria-label="Categories" style={tabsRowStyle}>
          {(['all', 'personal', 'work', 'time-pay', 'equipment', 'cad', 'research', 'learning', 'communication', 'office', 'financial', 'operational'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              style={category === c ? tabActiveStyle : tabStyle}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </nav>

        <div style={listStyle}>
          {filtered.length === 0 && (
            <div style={emptyStyle}>
              No widgets match — try clearing the search or picking a different category.
            </div>
          )}
          {category === 'all'
            ? renderGrouped(grouped, handleAdd)
            : renderFlat(filtered, handleAdd)}
        </div>
      </div>
    </div>
  );
}

function renderGrouped(
  grouped: Map<WidgetCategory, WidgetDefinition[]>,
  onPick: (def: WidgetDefinition) => void,
) {
  const order: WidgetCategory[] = [
    'personal', 'work', 'time-pay', 'equipment',
    'cad', 'research', 'learning', 'communication',
    'office', 'financial', 'operational',
  ];
  const out: React.ReactNode[] = [];
  for (const cat of order) {
    const widgets = grouped.get(cat);
    if (!widgets || widgets.length === 0) continue;
    out.push(
      <section key={cat} style={{ marginBottom: 'var(--hub-spc-3, 12px)' }}>
        <h3 style={sectionTitleStyle}>{CATEGORY_LABELS[cat]}</h3>
        <div style={tileGridStyle}>
          {widgets.map((w) => (
            <WidgetTile key={w.id} def={w} onPick={() => onPick(w)} />
          ))}
        </div>
      </section>,
    );
  }
  return out;
}

function renderFlat(widgets: WidgetDefinition[], onPick: (def: WidgetDefinition) => void) {
  return (
    <div style={tileGridStyle}>
      {widgets.map((w) => (
        <WidgetTile key={w.id} def={w} onPick={() => onPick(w)} />
      ))}
    </div>
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

const tabsRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--hub-spc-2, 8px)',
  padding: '0 var(--hub-spc-4, 16px) var(--hub-spc-3, 12px)',
  borderBottom: '1px solid var(--theme-border)',
};

const tabStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'transparent',
  color: 'var(--theme-fg-secondary)',
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  cursor: 'pointer',
};

const tabActiveStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'var(--theme-accent)',
  color: 'var(--theme-accent-fg)',
  borderColor: 'var(--theme-accent)',
};

const listStyle: React.CSSProperties = {
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
  overflowY: 'auto',
  flex: 1,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 'var(--hub-spc-2, 8px)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  color: 'var(--theme-fg-secondary)',
};

const tileGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 'var(--hub-spc-3, 12px)',
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
