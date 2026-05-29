'use client';
// Slice 127 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export type VehicleStatusFilter = 'all' | 'in-use' | 'available' | 'maintenance';

export interface VehiclesStatusContent extends Record<string, unknown> {
  filter: VehicleStatusFilter;
}
const DEFAULTS: VehiclesStatusContent = { filter: 'all' };

interface VehicleRow {
  id: string;
  name: string;
  status: 'in-use' | 'available' | 'maintenance' | 'offline';
  driver?: string | null;
  next_service_at?: string | null;
}

function VehiclesStatusWidget({ size, content }: WidgetProps<VehiclesStatusContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<VehicleRow[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/admin/equipment/vehicles?filter=${settings.filter}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { vehicles?: VehicleRow[] } = await res.json();
      setItems(data.vehicles ?? []);
      setStatus((data.vehicles ?? []).length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="🚚" title="No vehicles" description="Fleet rows appear here as drivers check in." />;

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((v) => (
        <li key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
          <span aria-label={v.status} style={{ width: 8, height: 8, borderRadius: 8, background: vehicleColor(v.status) }} />
          <span style={{ flex: 1, fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{v.name}</span>
          {v.driver && bucket !== 'tiny' && (
            <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{v.driver}</span>
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
        <option value="in-use">In use</option>
        <option value="available">Available</option>
        <option value="maintenance">In maintenance</option>
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
  minSize: { w: 2, h: 2 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'equipment_manager', 'tech_support'],
  Widget: VehiclesStatusWidget,
  SettingsForm: VehiclesStatusSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

export function vehicleColor(status: VehicleRow['status']): string {
  switch (status) {
    case 'available': return 'var(--theme-success)';
    case 'in-use': return 'var(--theme-accent)';
    case 'maintenance': return 'var(--theme-warning)';
    case 'offline': return 'var(--theme-fg-muted)';
  }
}
