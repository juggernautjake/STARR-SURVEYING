'use client';
// Slice 124 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
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

export interface EquipmentOutContent extends Record<string, unknown> {
  scope: 'mine' | 'all';
}

const DEFAULTS: EquipmentOutContent = { scope: 'mine' };

interface EquipmentRow {
  id: string;
  inventory_id?: string | null;
  asset_name: string;
  checked_out_to?: string | null;
  checked_out_at?: string | null;
  expected_return_at?: string | null;
}

// hub-widget-excellence-12 R1 — the equipment/today GET returns
// `{ strips: { out_now: [...] } }` (NOT a flat `{ equipment }`), and the
// checked-out rows carry `equipment_name` / `checked_out_to_user` /
// `actual_checked_out_at` / `reserved_to` / `equipment_inventory_id` —
// not the `asset_name`/`checked_out_to`/… this widget originally read.
interface RawOutNow {
  id: string;
  equipment_inventory_id?: string | null;
  equipment_name?: string | null;
  checked_out_to_user?: string | null;
  actual_checked_out_at?: string | null;
  reserved_to?: string | null;
}

/** Map a raw equipment/today `out_now` row to the widget row. Pure +
 *  exported. */
export function toEquipmentOut(r: RawOutNow): EquipmentRow {
  return {
    id: r.id,
    inventory_id: r.equipment_inventory_id ?? null,
    asset_name: r.equipment_name ?? 'Equipment',
    checked_out_to: r.checked_out_to_user ?? null,
    checked_out_at: r.actual_checked_out_at ?? null,
    expected_return_at: r.reserved_to ?? null,
  };
}

/** True when the expected return is in the past. Pure + exported. */
export function isOverdue(expectedReturnAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!expectedReturnAt) return false;
  const t = Date.parse(expectedReturnAt);
  return Number.isFinite(t) && t < nowMs;
}

function EquipmentOutWidget({ size, content }: WidgetProps<EquipmentOutContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const { data: session } = useSession();
  const email = session?.user?.email ?? '';
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<EquipmentRow[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/equipment/today');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { strips?: { out_now?: RawOutNow[] } } = await res.json();
      let rows = (data.strips?.out_now ?? []).map(toEquipmentOut);
      // The route returns everyone's checked-out gear; "Mine" filters
      // client-side to the current user.
      if (settings.scope === 'mine' && email) {
        rows = rows.filter((r) => r.checked_out_to === email);
      }
      setItems(rows);
      setStatus(rows.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.scope, email]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>checked out</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🔧" title="Nothing checked out" description="Equipment in active use appears here." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>{items.length === 1 ? 'checked out' : 'checked out'}</span>
      </div>
    );
  }

  const showReturn = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={listStyle}>
      {visible.map((it) => {
        const overdue = isOverdue(it.expected_return_at);
        const inner = (
          <>
            <span style={titleStyle}>{it.asset_name}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
              {showReturn && it.expected_return_at && (
                <span style={overdue ? overdueStyle : mutedStyle}>
                  {overdue ? 'overdue' : `due ${formatDate(it.expected_return_at)}`}
                </span>
              )}
              <span style={mutedStyle}>{shortName(it.checked_out_to)}</span>
            </span>
          </>
        );
        return (
          <li key={it.id}>
            {it.inventory_id ? (
              <Link href={equipmentHref(it.inventory_id)} style={rowStyle} aria-label={`Open ${it.asset_name}`}>
                {inner}
              </Link>
            ) : (
              <span style={rowStyle}>{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function shortName(v: string | null | undefined): string {
  if (!v) return 'crew';
  return v.includes('@') ? v.split('@')[0] : v;
}

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function EquipmentOutSettings({ value, onChange }: WidgetSettingsFormProps<EquipmentOutContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={labelStyle}>Scope</span>
      <select value={settings.scope} onChange={(e) => onChange({ ...settings, scope: e.target.value as 'mine' | 'all' })}>
        <option value="mine">Checked out to me</option>
        <option value="all">All checked-out</option>
      </select>
    </label>
  );
}

defineWidget<EquipmentOutContent>({
  id: 'equipment-out-today',
  label: 'Equipment Out',
  description: 'Equipment currently checked out.',
  category: 'equipment',
  iconName: 'Wrench',
  defaultSize: { w: 3, h: 3 },
  // Slice 215 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'equipment_manager', 'tech_support', 'field_crew'],
  Widget: EquipmentOutWidget,
  SettingsForm: EquipmentOutSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)', textDecoration: 'none', color: 'inherit' };
const titleStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 };
const mutedStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', whiteSpace: 'nowrap' };
const overdueStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-danger, #dc2626)', fontWeight: 600, whiteSpace: 'nowrap' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };
