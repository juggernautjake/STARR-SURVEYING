'use client';
// lib/hub/widgets/drawings-hub/index.tsx
//
// Slice W9b (hub-cad-roles-polish-2026-06-18) — consolidated
// drawings widget. Absorbs:
//   - drawings              (all drawings, sorted recent)
//   - drawings-in-progress  (same fetch — the schema has no
//                           workflow status, so "in progress"
//                           was just "recent")
//   - recent-drawings       (same fetch)
//
// All three legacy widgets call `/api/admin/cad/drawings?mine=…`
// with the same shape — the consolidation just exposes the
// scope toggle (Mine / All) at medium+ and gives the bigger
// buckets more rows + the deep-link CTA.
//
// Size-relative content (W5 pattern):
//   tiny    — single drawing count
//   small   — last 4 drawings, scope = current setting
//   medium  — last 6 drawings + Mine/All scope toggle
//   large   — last 8 drawings + scope toggle + Job column
//   xlarge  — last 12 drawings + scope toggle + Job column

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetError from '@/lib/hub/components/WidgetError';

export type DrawingsScope = 'mine' | 'all';

interface Drawing {
  id: string;
  name: string;
  job_id?: string | null;
  job_name?: string | null;
  updated_at?: string | null;
}

interface DrawingsHubContent extends Record<string, unknown> {
  /** Default scope when the widget mounts. The user can toggle
   *  via the medium+ chip without persisting back to settings;
   *  the next render resets to the saved default. */
  scope: DrawingsScope;
  showOpenLink: boolean;
}
const DEFAULTS: DrawingsHubContent = { scope: 'mine', showOpenLink: true };

interface FetchState {
  status: 'loading' | 'ok' | 'empty' | 'error';
  errorMessage: string;
  items: Drawing[];
}

function DrawingsHubWidget({ size, content }: WidgetProps<DrawingsHubContent>) {
  const settings = useMemo(() => ({ ...DEFAULTS, ...content }), [content]);
  const bucket = sizeBucket(size.w, size.h);
  const [scope, setScope] = useState<DrawingsScope>(settings.scope);
  const [state, setState] = useState<FetchState>({ status: 'loading', errorMessage: '', items: [] });

  // Re-sync scope when the saved default changes (settings panel
  // edit). Local toggles still work mid-session.
  useEffect(() => setScope(settings.scope), [settings.scope]);

  const refresh = useCallback(async (next: DrawingsScope) => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const params = new URLSearchParams();
      if (next === 'mine') params.set('mine', 'true');
      const res = await fetch(`/api/admin/cad/drawings?${params}`);
      if (res.status === 401 || res.status === 403) {
        setState({ status: 'empty', errorMessage: '', items: [] });
        return;
      }
      if (!res.ok) {
        setState({ status: 'error', errorMessage: `HTTP ${res.status}`, items: [] });
        return;
      }
      const data = await res.json() as { drawings?: Drawing[] };
      const items = data.drawings ?? [];
      setState({ status: items.length === 0 ? 'empty' : 'ok', errorMessage: '', items });
    } catch (err) {
      setState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        items: [],
      });
    }
  }, []);

  useEffect(() => { void refresh(scope); }, [scope, refresh]);

  if (state.status === 'loading') return <WidgetSkeleton rows={3} />;
  if (state.status === 'error') {
    return <WidgetError message={`Couldn't load drawings (${state.errorMessage}).`} onRetry={() => refresh(scope)} />;
  }
  if (state.status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyWrapStyle} data-testid="drawings-hub-tiny">
          <span style={tinyCountStyle}>0</span>
          <span style={tinyLabelStyle}>drawings</span>
        </div>
      );
    }
    return <WidgetEmpty icon="📐" title="No drawings" description={scope === 'mine' ? "You don't have any drawings yet." : 'No drawings in the system yet.'} />;
  }

  // tiny
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle} data-testid="drawings-hub-tiny">
        <span style={tinyCountStyle}>{state.items.length}</span>
        <span style={tinyLabelStyle}>{scope === 'mine' ? 'my drawings' : 'drawings'}</span>
      </div>
    );
  }

  const limit = limitForBucket(bucket);
  const showJobCol = bucket === 'large' || bucket === 'xlarge';
  const showScopeToggle = bucket !== 'small';

  return (
    <div style={columnStyle} data-testid={`drawings-hub-${bucket}`}>
      <header style={sectionHeaderStyle}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Drawings</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showScopeToggle && (
            <span role="group" aria-label="Drawing scope" style={chipRowStyle} data-testid="drawings-hub-scope-toggle">
              <button
                type="button"
                onClick={() => setScope('mine')}
                style={scope === 'mine' ? chipActiveStyle : chipStyle}
                aria-pressed={scope === 'mine'}
              >
                Mine
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                style={scope === 'all' ? chipActiveStyle : chipStyle}
                aria-pressed={scope === 'all'}
              >
                All
              </button>
            </span>
          )}
          {settings.showOpenLink && (
            <a href="/admin/cad" style={openLinkStyle}>Open →</a>
          )}
        </div>
      </header>
      <ul style={listStyle}>
        {state.items.slice(0, limit).map((d) => (
          <li key={d.id} style={rowStyle}>
            <a href={`/admin/cad?drawing=${encodeURIComponent(d.id)}`} style={rowLinkStyle}>
              <span style={rowTitleStyle}>{d.name}</span>
              <span style={rowMetaStyle}>
                {showJobCol && d.job_name && <span style={{ marginRight: 8 }}>{d.job_name}</span>}
                {d.updated_at && <span>{formatRelative(d.updated_at)}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Pure helpers ──────────────────────────────────────────────────────

export function limitForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny': return 0;
    case 'small': return 4;
    case 'medium': return 6;
    case 'large': return 8;
    case 'xlarge': return 12;
  }
}

/** Tiny relative-time formatter — picks the largest matching unit
 *  so the row meta stays short. Pure + exported. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const minutes = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

// ─── Style fragments ───────────────────────────────────────────────────

const tinyWrapStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  height: '100%', gap: 2,
};
const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 700, lineHeight: 1,
  color: 'var(--theme-fg-primary)',
};
const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const columnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, height: '100%', minHeight: 0,
};
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1px solid var(--theme-border)', paddingBottom: 4,
};
const chipRowStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 2,
};
const chipStyle: React.CSSProperties = {
  padding: '0 8px', borderRadius: 12,
  fontSize: '0.7rem', fontWeight: 600,
  background: 'transparent', color: 'var(--theme-fg-secondary)',
  border: '1px solid var(--theme-border)', cursor: 'pointer',
};
const chipActiveStyle: React.CSSProperties = {
  ...chipStyle,
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #fff)',
  borderColor: 'var(--theme-accent, #3b82f6)',
};
const openLinkStyle: React.CSSProperties = {
  fontSize: '0.7rem', color: 'var(--theme-accent, #3b82f6)', textDecoration: 'none',
};
const listStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', flexDirection: 'column', gap: 4,
  overflow: 'auto', minHeight: 0,
};
const rowStyle: React.CSSProperties = { padding: '2px 0' };
const rowLinkStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 1, textDecoration: 'none',
  color: 'inherit',
};
const rowTitleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.85rem)', fontWeight: 500,
  color: 'var(--theme-fg-primary)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const rowMetaStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
};

defineWidget<DrawingsHubContent>({
  id: 'drawings-hub',
  label: 'Drawings',
  description: 'Recent CAD drawings — your own or everyone\'s, with a deep-link to the editor.',
  category: 'cad',
  iconName: 'PenTool',
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: DrawingsHubWidget,
});
