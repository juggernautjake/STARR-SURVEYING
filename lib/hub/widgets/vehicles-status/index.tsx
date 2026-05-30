'use client';
// Slice 127 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
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

// hub-widget-excellence-12 R1 — `/api/admin/equipment/vehicles` doesn't
// exist; the real endpoint is `/api/admin/vehicles`, and the `vehicles`
// table has NO status/driver/next_service columns — only `name` /
// `license_plate` / `active`. So the only real status signal is active
// vs. inactive; the widget is an honest fleet roster.
export type VehicleStatusFilter = 'all' | 'active' | 'inactive';
export type VehicleStatus = 'available' | 'offline';

export interface VehiclesStatusContent extends Record<string, unknown> {
  filter: VehicleStatusFilter;
}
const DEFAULTS: VehiclesStatusContent = { filter: 'all' };

interface VehicleRow {
  id: string;
  name: string;
  license_plate?: string | null;
  status: VehicleStatus;
}

interface RawVehicle {
  id: string;
  name?: string | null;
  license_plate?: string | null;
  active?: boolean | null;
}

/** Map a raw vehicles row; status is derived from `active`. Pure +
 *  exported. */
export function toVehicle(r: RawVehicle): VehicleRow {
  return {
    id: r.id,
    name: r.name ?? 'Vehicle',
    license_plate: r.license_plate ?? null,
    status: r.active === false ? 'offline' : 'available',
  };
}

/** Filter the roster by the (active-derived) status. Pure + exported. */
export function filterVehicles(rows: VehicleRow[], filter: VehicleStatusFilter): VehicleRow[] {
  if (filter === 'active') return rows.filter((v) => v.status === 'available');
  if (filter === 'inactive') return rows.filter((v) => v.status === 'offline');
  return rows;
}

function VehiclesStatusWidget({ size, content }: WidgetProps<VehiclesStatusContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<VehicleRow[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/vehicles');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { vehicles?: RawVehicle[] } = await res.json();
      const rows = filterVehicles((data.vehicles ?? []).map(toVehicle), settings.filter);
      setItems(rows);
      setStatus(rows.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>vehicles</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🚚" title="No vehicles" description="Fleet rows appear here as drivers check in." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-fg-primary)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>{items.length === 1 ? 'vehicle' : 'vehicles'}</span>
      </div>
    );
  }

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((v) => (
        <li key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
          <span aria-label={v.status} style={{ width: 8, height: 8, borderRadius: 8, background: vehicleColor(v.status), flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
          {v.license_plate && (
            <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', flexShrink: 0 }}>{v.license_plate}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function VehiclesStatusSettings({ value, onChange }: WidgetSettingsFormProps<VehiclesStatusContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>Filter</span>
      <select value={settings.filter} onChange={(e) => onChange({ ...settings, filter: e.target.value as VehicleStatusFilter })}>
        <option value="all">All vehicles</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </label>
  );
}

defineWidget<VehiclesStatusContent>({
  id: 'vehicles-status',
  label: 'Vehicles Status',
  description: 'Fleet at a glance — driver, status, next service.',
  category: 'equipment',
  iconName: 'Truck',
  defaultSize: { w: 4, h: 3 },
  // Slice 215 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'equipment_manager', 'tech_support'],
  Widget: VehiclesStatusWidget,
  SettingsForm: VehiclesStatusSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

export function vehicleColor(status: VehicleStatus): string {
  switch (status) {
    case 'available': return 'var(--theme-success)';
    case 'offline': return 'var(--theme-fg-muted)';
  }
}
