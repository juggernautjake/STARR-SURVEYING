'use client';
// Slice 125 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { equipmentHref } from '@/lib/hub/widgets/_shared/widget-links';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export type MaintenanceDueWindow = 'week' | 'month' | 'overdue-only';
export interface MaintenanceDueContent extends Record<string, unknown> {
  dueWithin: MaintenanceDueWindow;
}
const DEFAULTS: MaintenanceDueContent = { dueWithin: 'month' };

interface MaintenanceItem {
  id: string;
  inventory_id?: string | null;
  asset_name: string;
  task_type: string;
  due_at?: string | null;
  status?: string | null;
}

// hub-widget-excellence-12 R1 — `/api/admin/equipment/maintenance`
// doesn't exist; the real endpoint is `/api/admin/maintenance/events`,
// which returns `{ events }` enriched with `equipment_name` +
// `kind`/`state`/`scheduled_for`/`next_due_at`/`equipment_inventory_id`.
interface RawMaintenanceEvent {
  id: string;
  equipment_inventory_id?: string | null;
  equipment_name?: string | null;
  kind?: string | null;
  state?: string | null;
  scheduled_for?: string | null;
  next_due_at?: string | null;
}

/** Map a raw maintenance event to the widget row. Pure + exported. */
export function toMaintenanceItem(r: RawMaintenanceEvent): MaintenanceItem {
  return {
    id: r.id,
    inventory_id: r.equipment_inventory_id ?? null,
    asset_name: r.equipment_name ?? 'Equipment',
    task_type: humanizeKind(r.kind),
    due_at: r.scheduled_for ?? r.next_due_at ?? null,
    status: r.state ?? null,
  };
}

function humanizeKind(kind: string | null | undefined): string {
  if (!kind) return 'Maintenance';
  return kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Keep maintenance items whose due date falls in the window (overdue
 *  always counts for week/month; overdue-only keeps just past-due).
 *  Dateless items are dropped. Pure + exported. */
export function filterByDue(
  items: MaintenanceItem[],
  window: MaintenanceDueWindow,
  nowMs: number = Date.now(),
): MaintenanceItem[] {
  return items.filter((it) => {
    if (!it.due_at) return false;
    const t = Date.parse(it.due_at);
    if (!Number.isFinite(t)) return false;
    if (window === 'overdue-only') return t < nowMs;
    const cap = window === 'week' ? 7 * 86_400_000 : 30 * 86_400_000;
    return t <= nowMs + cap; // includes overdue
  });
}

function MaintenanceDueWidget({ size, content }: WidgetProps<MaintenanceDueContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<MaintenanceItem[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      // Open maintenance events (scheduled / in-progress); the GET
      // defaults to the open states when no `state` is given.
      const res = await fetch('/api/admin/maintenance/events');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { events?: RawMaintenanceEvent[] } = await res.json();
      const list = filterByDue((data.events ?? []).map(toMaintenanceItem), settings.dueWithin);
      setItems(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.dueWithin]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>due</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🛠" title="All caught up" description="No maintenance due in the chosen window." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>due</span>
      </div>
    );
  }

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((it) => {
        const overdue = it.due_at ? Date.parse(it.due_at) < Date.now() : false;
        const inner = (
          <>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.asset_name}</span>
              <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{it.task_type}</span>
            </span>
            {it.due_at && (
              <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: overdue ? 'var(--theme-danger)' : 'var(--theme-fg-secondary)', fontWeight: overdue ? 600 : 400, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {overdue ? 'Overdue' : new Date(it.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </>
        );
        return (
          <li key={it.id}>
            {it.inventory_id ? (
              <Link href={equipmentHref(it.inventory_id)} style={rowLinkStyle} aria-label={`Open ${it.asset_name}`}>{inner}</Link>
            ) : (
              <span style={rowLinkStyle}>{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MaintenanceDueSettings({ value, onChange }: WidgetSettingsFormProps<MaintenanceDueContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>Due within</span>
      <select value={settings.dueWithin} onChange={(e) => onChange({ ...settings, dueWithin: e.target.value as MaintenanceDueContent['dueWithin'] })}>
        <option value="overdue-only">Overdue only</option>
        <option value="week">Next 7 days</option>
        <option value="month">Next 30 days</option>
      </select>
    </label>
  );
}

defineWidget<MaintenanceDueContent>({
  id: 'maintenance-due',
  label: 'Maintenance Due',
  description: 'Equipment maintenance coming up.',
  category: 'equipment',
  iconName: 'WrenchSettings',
  defaultSize: { w: 3, h: 3 },
  // Slice 215 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'equipment_manager', 'tech_support'],
  Widget: MaintenanceDueWidget,
  SettingsForm: MaintenanceDueSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

const rowLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '6px 12px',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  textDecoration: 'none',
  color: 'inherit',
};
