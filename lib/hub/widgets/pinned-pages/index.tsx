'use client';
// lib/hub/widgets/pinned-pages/index.tsx
//
// Pinned Pages widget. Shows the user's pinned routes from
// nav-store + the existing route-registry icons/labels. All 5 size
// variants supported.
//
// Slice 94 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import Link from 'next/link';
import { useAdminNavStore } from '@/lib/admin/nav-store';
import { ADMIN_ROUTES, type AdminRoute } from '@/lib/admin/route-registry';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import { resolvePinnedRoutes } from './resolve';

interface PinnedPagesContent extends Record<string, unknown> {
  layoutStyle: 'grid' | 'list';
  iconStyle: 'emoji' | 'lucide' | 'none';
}

const DEFAULTS: PinnedPagesContent = {
  layoutStyle: 'grid',
  iconStyle: 'lucide',
};

function PinnedPagesWidget({ size, content }: WidgetProps<PinnedPagesContent>) {
  const pinned = useAdminNavStore((s) => s.pinnedRoutes);
  const bucket = sizeBucket(size.w, size.h);
  const settings = { ...DEFAULTS, ...content };

  // R2 — resolve pins against the registered route table, DROPPING any
  // that no longer resolve (a stale pin to a retired route would be a
  // dead link). Exact + deep-subtree matches keep the route's
  // label + icon.
  const items = resolvePinnedRoutes(pinned, ADMIN_ROUTES);

  if (items.length === 0) {
    return (
      <WidgetEmpty
        icon="📌"
        title="No pinned pages yet"
        description="Pin pages you visit often from any admin page."
        cta={<Link href="/admin/work">Browse pages</Link>}
      />
    );
  }

  // ── Tiny: the pin count (a name list doesn't fit a 1×1/2×1 cell).
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle}>
        <span style={tinyCountStyle}>{items.length}</span>
        <span style={tinyLabelStyle}>pinned</span>
      </div>
    );
  }

  // ── List style picks itself over grid when chosen.
  if (settings.layoutStyle === 'list') {
    return (
      <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} style={listRowStyle}>
              {settings.iconStyle !== 'none' && <IconCell name={it.iconName} style={settings.iconStyle} />}
              <span>{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  // ── Grid style — columns depend on bucket. Pins are capped at
  //    MAX_PINNED_ROUTES (5) so every resolved pin fits every grid.
  const cols = colsForBucket(bucket);
  return (
    <div
      role="list"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 'var(--hub-spc-3, 12px)',
        alignContent: 'start',
      }}
    >
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          role="listitem"
          style={pinCardStyle}
        >
          {settings.iconStyle !== 'none' && <IconCell name={it.iconName} style={settings.iconStyle} />}
          <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{it.label}</span>
        </Link>
      ))}
    </div>
  );
}

function PinnedPagesSettings({ value, onChange }: WidgetSettingsFormProps<PinnedPagesContent>) {
  const settings = { ...DEFAULTS, ...value };
  const pinned = useAdminNavStore((s) => s.pinnedRoutes);
  const unpinRoute = useAdminNavStore((s) => s.unpinRoute);
  const managed = resolvePinnedRoutes(pinned, ADMIN_ROUTES);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 }}>
          Layout style
        </span>
        <select
          value={settings.layoutStyle}
          onChange={(e) => onChange({ ...settings, layoutStyle: e.target.value as 'grid' | 'list' })}
        >
          <option value="grid">Grid</option>
          <option value="list">List</option>
        </select>
      </label>
      <label>
        <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 }}>
          Icon style
        </span>
        <select
          value={settings.iconStyle}
          onChange={(e) => onChange({ ...settings, iconStyle: e.target.value as 'emoji' | 'lucide' | 'none' })}
        >
          <option value="lucide">Lucide icons</option>
          <option value="emoji">Emoji</option>
          <option value="none">No icons</option>
        </select>
      </label>

      {/* R4 — manage pins inline: unpin without leaving the hub. Pins
          live in the shared nav-store, so this reflects (and edits) the
          same list the rail + command palette use. */}
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600 }}>Manage pins</legend>
        {managed.length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>
            No pinned pages yet. Pin pages from the nav rail or command palette.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
            {managed.map((it) => (
              <li key={it.href} style={managedRowStyle}>
                <span style={{ flex: 1, fontSize: 'var(--hub-font-sm, 0.875rem)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                <button
                  type="button"
                  aria-label={`Unpin ${it.label}`}
                  title="Unpin"
                  onClick={() => unpinRoute(it.href)}
                  style={unpinBtnStyle}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </div>
  );
}

defineWidget<PinnedPagesContent>({
  id: 'pinned-pages',
  label: 'Pinned Pages',
  description: 'Quick links to pages you visit often.',
  category: 'personal',
  iconName: 'Pin',
  defaultSize: { w: 4, h: 2 },
  // Slice 217 — minSize lowered to 1×1; widget already had a tiny bucket render.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: PinnedPagesWidget,
  SettingsForm: PinnedPagesSettings,
});

// ─── Helpers ───────────────────────────────────────────────────────────

export function colsForBucket(bucket: ReturnType<typeof sizeBucket>): number {
  switch (bucket) {
    case 'tiny': return 1;
    case 'small': return 2;
    case 'medium': return 3;
    case 'large': return 4;
    case 'xlarge': return 6;
  }
}

export function capForBucket(bucket: ReturnType<typeof sizeBucket>): number {
  switch (bucket) {
    case 'tiny': return 2;
    case 'small': return 4;
    case 'medium': return 6;
    case 'large': return 12;
    case 'xlarge': return 24;
  }
}

// ─── Style fragments ───────────────────────────────────────────────────

const tinyWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 2,
};
const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
  fontWeight: 700,
  lineHeight: 1,
  color: 'var(--theme-accent)',
};
const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const listRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
  borderRadius: 6,
  textDecoration: 'none',
  color: 'var(--theme-fg-primary)',
  background: 'var(--theme-bg-elevated)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};

const pinCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-2, 8px)',
  borderRadius: 8,
  textDecoration: 'none',
  color: 'var(--theme-fg-primary)',
  background: 'var(--theme-bg-elevated)',
  textAlign: 'center',
  minHeight: 56,
  overflow: 'hidden',
};

const managedRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 8px',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
};

const unpinBtnStyle: React.CSSProperties = {
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  borderRadius: 4,
  width: 24,
  height: 24,
  cursor: 'pointer',
  fontSize: '0.85rem',
  lineHeight: 1,
  flexShrink: 0,
};

function IconCell({ name, style }: { name?: string; style: 'emoji' | 'lucide' | 'none' }) {
  if (style === 'none' || !name) return null;
  // emoji + lucide both render as text for now; the lucide-render
  // pipeline doesn't have a registry mapping in this lib slice. The
  // Widget Registry's icon resolver (lands in slice 100) will pipe
  // the lucide component for real later.
  const glyph = style === 'emoji' ? emojiForRoute(name) : '◇';
  return (
    <span aria-hidden style={{ fontSize: '1.1rem', lineHeight: 1 }}>
      {glyph}
    </span>
  );
}

function emojiForRoute(iconName: string): string {
  // Fallback emoji table — only a handful of common ones. The lucide
  // mapping in slice 100 will give every route a real icon.
  const map: Record<string, string> = {
    Receipt: '🧾',
    Car: '🚗',
    MessagesSquare: '💬',
    Briefcase: '💼',
    Folder: '📁',
    FilePlus: '➕',
    MapPin: '📍',
    Wallet: '💰',
    Calendar: '🗓',
    Home: '🏠',
    Truck: '🚚',
    Building: '🏢',
    Compass: '🧭',
    GraduationCap: '🎓',
    Inbox: '📥',
  };
  return map[iconName] ?? '🔗';
}

// Re-export the AdminRoute type for downstream tests.
export type { AdminRoute };
