'use client';
// lib/hub/widgets/contacts/index.tsx
//
// contacts plan Slice 5 — Contacts hub widget. Surfaces the N
// most-recently-touched contacts (filterable by label) so the
// surveyor can jump straight from the hub to a realtor / repeat
// client's profile without crossing the admin nav. Footer links to
// /admin/contacts.
//
// Settings: `labelFilter` (catalog id or 'all') + `maxItems` (1-20).
// Default filter = 'all' so a fresh hub shows the most-recent
// activity across every contact.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';
import { CONTACT_LABELS, findContactLabel } from '@/lib/contacts/labels';

export interface ContactsContent extends Record<string, unknown> {
  /** Catalog label id, a free-form key, or 'all'. */
  labelFilter: string;
  maxItems: number;
}
const DEFAULTS: ContactsContent = { labelFilter: 'all', maxItems: 6 };

interface ContactRow {
  id: string;
  name: string;
  company: string | null;
  labels: string[];
  updated_at: string;
}

function ContactsWidget({ size, content }: WidgetProps<ContactsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [items, setItems] = useState<ContactRow[]>([]);
  const maxItems = clampInt(settings.maxItems, 1, 20, 6);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams();
      if (settings.labelFilter && settings.labelFilter !== 'all') {
        params.set('label', settings.labelFilter);
      }
      // Pull a generous slice; the bucket cap below trims to fit.
      params.set('limit', String(Math.max(maxItems, 20)));
      const res = await fetch(`/api/admin/contacts?${params}`);
      if (!res.ok) { setStatus('error'); return; }
      const data: { contacts?: ContactRow[] } = await res.json();
      const rows = data.contacts ?? [];
      setItems(rows);
      setStatus(rows.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('error');
    }
  }, [settings.labelFilter, maxItems]);
  useEffect(() => { void fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, items.length > 0 ? 'var(--theme-accent)' : 'var(--theme-fg-secondary)')}>
          {items.length}
        </span>
        <span style={tinyStatLabelStyle()}>
          {settings.labelFilter === 'all'
            ? 'contacts'
            : (findContactLabel(settings.labelFilter)?.label ?? settings.labelFilter)}
        </span>
      </div>
    );
  }

  if (status === 'error') {
    return <WidgetEmpty icon="⚠️" title="Couldn't load contacts" description="Try refreshing the hub." />;
  }
  if (status === 'empty') {
    return (
      <WidgetEmpty
        icon="📇"
        title="No contacts yet"
        description="Track realtors, repeat clients, students, teachers, partners — anyone you want to keep on file."
      />
    );
  }

  const visible = items.slice(0, Math.min(maxItems, capForBucket(bucket)));
  return (
    <ul role="list" style={listStyle}>
      {visible.map((c) => (
        <li key={c.id}>
          <Link href={`/admin/contacts/${c.id}`} style={rowLinkStyle} aria-label={`Open ${c.name}`}>
            <span style={titleStyle}>{c.name}</span>
            {(c.company || c.labels.length > 0) && (
              <span style={subtitleStyle}>
                {c.company ?? ''}
                {c.company && c.labels.length > 0 ? ' · ' : ''}
                {labelsPreview(c.labels)}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ContactsSettings({ value, onChange }: WidgetSettingsFormProps<ContactsContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Filter:</span>
        <select
          value={settings.labelFilter}
          onChange={(e) => onChange({ ...settings, labelFilter: e.target.value })}
        >
          <option value="all">All contacts</option>
          {CONTACT_LABELS.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Max rows:</span>
        <input
          type="number"
          min={1}
          max={20}
          value={settings.maxItems}
          onChange={(e) => onChange({ ...settings, maxItems: clampInt(e.target.value, 1, 20, 6) })}
          style={{ width: 80 }}
        />
      </label>
    </div>
  );
}

defineWidget<ContactsContent>({
  id: 'contacts',
  label: 'Contacts',
  description: 'Recent contacts — realtors, clients, students, teachers, employees.',
  category: 'office',
  iconName: 'Users',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support'],
  Widget: ContactsWidget,
  SettingsForm: ContactsSettings,
});

// ─── Helpers (exported for tests) ───────────────────────────────────

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 0, small: 3, medium: 6, large: 12, xlarge: 24 });
}

/** Compact label string for the row subtitle: prefers catalog label
 *  text + truncates at 2 with "+N" suffix when there are more. */
export function labelsPreview(labels: ReadonlyArray<string>): string {
  if (!labels || labels.length === 0) return '';
  const display = labels.slice(0, 2).map((id) => findContactLabel(id)?.label ?? id);
  const extra = labels.length > 2 ? ` +${labels.length - 2}` : '';
  return `${display.join(', ')}${extra}`;
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

// ─── Style fragments ────────────────────────────────────────────────

const listStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)',
};
const rowLinkStyle: React.CSSProperties = {
  display: 'block', padding: '6px 12px', borderRadius: 6,
  background: 'var(--theme-bg-elevated)', textDecoration: 'none', color: 'inherit',
};
const titleStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const subtitleStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)',
};
