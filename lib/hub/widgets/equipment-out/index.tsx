'use client';
// Slice 124 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export interface EquipmentOutContent extends Record<string, unknown> {
  scope: 'mine' | 'all';
}

const DEFAULTS: EquipmentOutContent = { scope: 'mine' };

interface EquipmentRow {
  id: string;
  asset_name: string;
  checked_out_to?: string | null;
  checked_out_at?: string | null;
  expected_return_at?: string | null;
}

function EquipmentOutWidget({ size, content }: WidgetProps<EquipmentOutContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<EquipmentRow[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams({ status: 'checked-out' });
      if (settings.scope === 'mine') params.set('mine', 'true');
      const res = await fetch(`/api/admin/equipment/today?${params}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { equipment?: EquipmentRow[] } = await res.json();
      setItems(data.equipment ?? []);
      setStatus((data.equipment ?? []).length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.scope]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="🔧" title="Nothing checked out" description="Equipment in active use appears here." />;

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={listStyle}>
      {visible.map((it) => (
        <li key={it.id} style={rowStyle}>
          <span style={titleStyle}>{it.asset_name}</span>
          {bucket !== 'tiny' && (
            <span style={mutedStyle}>{it.checked_out_to ?? 'crew'}</span>
          )}
        </li>
      ))}
    </ul>
  );
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
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'equipment_manager', 'tech_support', 'field_crew'],
  Widget: EquipmentOutWidget,
  SettingsForm: EquipmentOutSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' };
const titleStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)' };
const mutedStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };
