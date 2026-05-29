'use client';
// lib/hub/components/settings/components/RoutePicker.tsx
//
// Autocomplete-style route picker. Backed by `lib/admin/route-registry`
// so we don't duplicate the navigation source of truth. Used by the
// Interaction tab's "navigate to" click target.

import React, { useMemo, useState } from 'react';
import { ADMIN_ROUTES, type AdminRoute } from '@/lib/admin/route-registry';

interface RoutePickerProps {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
  /** Optional. When provided, hides routes the user can't access. The
   *  modal that owns RoutePicker passes the current user's roles. */
  roles?: string[];
}

export default function RoutePicker({ value, onChange, ariaLabel, roles }: RoutePickerProps) {
  const [search, setSearch] = useState('');

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ADMIN_ROUTES.filter((r) => {
      if (term && !matchesRoute(r, term)) return false;
      if (roles && r.roles && !r.roles.some((role) => roles.includes(role))) return false;
      return true;
    }).slice(0, 8);
  }, [search, roles]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        type="search"
        placeholder="Search routes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={searchStyle}
        aria-label={ariaLabel ?? 'Search routes'}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {candidates.map((r) => {
          const active = r.href === value;
          return (
            <button
              key={r.href}
              type="button"
              onClick={() => onChange(r.href)}
              aria-pressed={active}
              style={active ? rowActiveStyle : rowStyle}
            >
              <span style={{ fontWeight: 500 }}>{r.label}</span>
              <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{r.href}</span>
            </button>
          );
        })}
        {candidates.length === 0 && (
          <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
            No routes match.
          </span>
        )}
      </div>
      {value && (
        <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
          Selected: {value}
        </span>
      )}
    </div>
  );
}

function matchesRoute(r: AdminRoute, term: string): boolean {
  const label = r.label.toLowerCase();
  const href = r.href.toLowerCase();
  if (label.includes(term) || href.includes(term)) return true;
  for (const kw of r.keywords ?? []) {
    if (kw.toLowerCase().includes(term)) return true;
  }
  return false;
}

const searchStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  padding: '6px 10px',
  borderRadius: 4,
  border: '1px solid var(--theme-border)',
  background: 'transparent',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  textAlign: 'left',
};

const rowActiveStyle: React.CSSProperties = {
  ...rowStyle,
  background: 'color-mix(in srgb, var(--theme-accent) 12%, var(--theme-bg-surface))',
  borderColor: 'var(--theme-accent)',
};
