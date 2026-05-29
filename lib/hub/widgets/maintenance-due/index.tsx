'use client';
// Slice 125 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export interface MaintenanceDueContent extends Record<string, unknown> {
  dueWithin: 'week' | 'month' | 'overdue-only';
}
const DEFAULTS: MaintenanceDueContent = { dueWithin: 'month' };

interface MaintenanceItem {
  id: string;
  asset_name: string;
  task_type: string;
  due_at?: string | null;
  status?: string | null;
}

function MaintenanceDueWidget({ size, content }: WidgetProps<MaintenanceDueContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<MaintenanceItem[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/admin/equipment/maintenance?due=${settings.dueWithin}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { items?: MaintenanceItem[] } = await res.json();
      setItems(data.items ?? []);
      setStatus((data.items ?? []).length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.dueWithin]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="🛠" title="All caught up" description="No maintenance due in the chosen window." />;

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((it) => {
        const overdue = it.due_at && Date.parse(it.due_at) < Date.now();
        return (
          <li key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{it.asset_name}</span>
              {bucket !== 'tiny' && (
                <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{it.task_type}</span>
              )}
            </span>
            {it.due_at && bucket !== 'tiny' && (
              <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: overdue ? 'var(--theme-danger)' : 'var(--theme-fg-secondary)', fontWeight: overdue ? 600 : 400 }}>
                {overdue ? 'Overdue' : new Date(it.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
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
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'equipment_manager', 'tech_support'],
  Widget: MaintenanceDueWidget,
  SettingsForm: MaintenanceDueSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}
