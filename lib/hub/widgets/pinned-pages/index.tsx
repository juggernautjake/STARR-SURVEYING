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
import { findRoute, type AdminRoute } from '@/lib/admin/route-registry';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';

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

  // Resolve each pinned href into a route object (icon/label). When
  // findRoute returns undefined the user pinned a route that's since
  // been retired — fall back to the raw href as the label.
  const items: Array<{ href: string; label: string; iconName?: string }> = pinned.map((href) => {
    const route = findRoute(href);
    if (route) return { href, label: route.label, iconName: route.iconName };
    return { href, label: href.replace(/^\/admin\//, '') };
  });

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

  // ── Tiny: 2 vertically stacked text links, no icons.
  if (bucket === 'tiny') {
    return (
      <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
        {items.slice(0, 2).map((it) => (
          <li key={it.href}>
            <Link href={it.href} style={textLinkStyle}>{it.label}</Link>
          </li>
        ))}
      </ul>
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

  // ── Grid style — columns depend on bucket.
  const cols = colsForBucket(bucket);
  const cap = capForBucket(bucket);
  return (
    <div
      role="list"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 'var(--hub-spc-3, 12px)',
      }}
    >
      {items.slice(0, cap).map((it) => (
        <Link
          key={it.href}
          href={it.href}
          role="listitem"
          style={pinCardStyle}
        >
          {settings.iconStyle !== 'none' && <IconCell name={it.iconName} style={settings.iconStyle} />}
          <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{it.label}</span>
        </Link>
      ))}
    </div>
  );
}

function PinnedPagesSettings({ value, onChange }: WidgetSettingsFormProps<PinnedPagesContent>) {
  const settings = { ...DEFAULTS, ...value };
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
    </div>
  );
}

defineWidget<PinnedPagesContent>({
  id: 'pinned-pages',
  label: 'Pinned Pages',
  description: 'Quick links to pages you visit often.',
  category: 'personal',
  iconName: 'Pin',
  defaultSize: { w: 6, h: 2 },
  minSize: { w: 3, h: 1 },
  maxSize: { w: 12, h: 4 },
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

const textLinkStyle: React.CSSProperties = {
  color: 'var(--theme-accent)',
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: 'var(--hub-font-sm, 0.875rem)',
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
