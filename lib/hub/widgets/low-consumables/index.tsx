'use client';
// Slice 126 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export interface LowConsumablesContent extends Record<string, unknown> {
  threshold: number;
}
const DEFAULTS: LowConsumablesContent = { threshold: 25 };

interface ConsumableItem {
  id: string;
  name: string;
  current_qty: number;
  reorder_threshold: number;
  unit?: string | null;
}

function LowConsumablesWidget({ size, content }: WidgetProps<LowConsumablesContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<ConsumableItem[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/admin/equipment/consumables?below=${settings.threshold}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { items?: ConsumableItem[] } = await res.json();
      const list = (data.items ?? []).filter((it) => it.current_qty <= it.reorder_threshold || it.current_qty <= settings.threshold);
      setItems(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.threshold]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="📦" title="Stocks healthy" description="No consumables below threshold." />;

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((it) => {
        const critical = it.current_qty <= 0;
        return (
          <li key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
            <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{it.name}</span>
            <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: critical ? 'var(--theme-danger)' : 'var(--theme-warning)', fontWeight: 600 }}>
              {it.current_qty} {it.unit ?? ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LowConsumablesSettings({ value, onChange }: WidgetSettingsFormProps<LowConsumablesContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>Threshold</span>
      <input type="number" min={0} max={1000} value={settings.threshold} onChange={(e) => onChange({ ...settings, threshold: Math.max(0, Math.min(1000, Number(e.target.value))) })} />
    </label>
  );
}

defineWidget<LowConsumablesContent>({
  id: 'low-consumables',
  label: 'Low Consumables',
  description: 'Consumables below reorder threshold.',
  category: 'equipment',
  iconName: 'PackageOpen',
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'equipment_manager', 'tech_support'],
  Widget: LowConsumablesWidget,
  SettingsForm: LowConsumablesSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}
