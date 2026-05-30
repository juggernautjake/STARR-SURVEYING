'use client';
// Slice 126 of customizable-hub-and-work-mode-2026-05-28.md.

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
  reorder_badge?: 'reorder_now' | 'reorder_soon' | 'ok';
}

// hub-widget-excellence-12 R1 — the consumables GET returns `{ rows }`
// (NOT `{ items }`) with `quantity_on_hand` / `low_stock_threshold` /
// `reorder_badge`, not the `current_qty`/`reorder_threshold` this widget
// originally read (so it always rendered empty).
interface RawConsumable {
  id: string;
  name?: string | null;
  unit?: string | null;
  quantity_on_hand?: number | null;
  low_stock_threshold?: number | null;
  reorder_badge?: 'reorder_now' | 'reorder_soon' | 'ok';
}

/** Map a raw consumables row to the widget row. Pure + exported. */
export function toLowConsumable(r: RawConsumable): ConsumableItem {
  return {
    id: r.id,
    name: r.name ?? 'Item',
    current_qty: typeof r.quantity_on_hand === 'number' ? r.quantity_on_hand : 0,
    reorder_threshold: typeof r.low_stock_threshold === 'number' ? r.low_stock_threshold : 0,
    unit: r.unit ?? null,
    reorder_badge: r.reorder_badge,
  };
}

/** Whether an item counts as "low": the server's reorder badge says so,
 *  or it's at/under the user's threshold. Pure + exported. */
export function isLow(item: ConsumableItem, threshold: number): boolean {
  if (item.reorder_badge === 'reorder_now' || item.reorder_badge === 'reorder_soon') return true;
  return item.current_qty <= item.reorder_threshold || item.current_qty <= threshold;
}

/** Percent of the reorder threshold still on hand (clamped 0–100).
 *  Pure + exported. */
export function stockPct(item: ConsumableItem): number {
  if (!Number.isFinite(item.reorder_threshold) || item.reorder_threshold <= 0) return 0;
  return Math.max(0, Math.min(100, (item.current_qty / item.reorder_threshold) * 100));
}

function LowConsumablesWidget({ size, content }: WidgetProps<LowConsumablesContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<ConsumableItem[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/equipment/consumables');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { rows?: RawConsumable[] } = await res.json();
      const list = (data.rows ?? []).map(toLowConsumable).filter((it) => isLow(it, settings.threshold));
      setItems(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.threshold]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>low items</span>
        </div>
      );
    }
    return <WidgetEmpty icon="📦" title="Stocks healthy" description="No consumables below threshold." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-danger)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>{items.length === 1 ? 'low item' : 'low items'}</span>
      </div>
    );
  }

  const showBar = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((it) => {
        const critical = it.current_qty <= 0;
        const pct = stockPct(it);
        return (
          <li key={it.id}>
            <Link href={equipmentHref(it.id)} style={rowLinkStyle} aria-label={`Open ${it.name}`}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: critical ? 'var(--theme-danger)' : 'var(--theme-warning)', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {it.current_qty}{it.unit ? ` ${it.unit}` : ''} / {it.reorder_threshold}
                </span>
              </span>
              {showBar && (
                <div aria-hidden style={{ height: 4, borderRadius: 2, background: 'var(--theme-bg-surface)', marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: critical ? 'var(--theme-danger)' : 'var(--theme-warning)' }} />
                </div>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const rowLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: '6px 12px',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  textDecoration: 'none',
  color: 'inherit',
};

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
  defaultSize: { w: 3, h: 3 },
  // Slice 215 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'equipment_manager', 'tech_support'],
  Widget: LowConsumablesWidget,
  SettingsForm: LowConsumablesSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}
