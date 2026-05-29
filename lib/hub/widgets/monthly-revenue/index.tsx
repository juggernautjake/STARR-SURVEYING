'use client';
// Slice 139 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export interface MonthlyRevenueContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: MonthlyRevenueContent = {};

interface RevenueSummary { revenue_mtd: number; revenue_last_month: number; goal?: number | null; }

function MonthlyRevenueWidget() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [data, setData] = useState<RevenueSummary | null>(null);

  const fetchData = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/reports?metric=monthly-revenue');
      if (!res.ok) { setStatus('empty'); return; }
      const j = await res.json();
      setData(j);
      setStatus('ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  if (status === 'loading') return <WidgetSkeleton rows={2} />;
  if (status === 'empty' || !data) return <WidgetEmpty icon="💵" title="Revenue unavailable" description="Once /api/admin/reports lands, MTD revenue shows here." />;

  const deltaPct = data.revenue_last_month > 0
    ? Math.round(((data.revenue_mtd - data.revenue_last_month) / data.revenue_last_month) * 100)
    : 0;
  const trendColor = deltaPct >= 0 ? 'var(--theme-success)' : 'var(--theme-danger)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 'var(--hub-font-2xl, 1.5rem)', fontWeight: 700, color: 'var(--theme-success)' }}>
        ${data.revenue_mtd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
        Month-to-date · <span style={{ color: trendColor }}>{deltaPct >= 0 ? '+' : ''}{deltaPct}% vs last month</span>
      </span>
      {data.goal && (
        <div aria-hidden style={{ height: 6, borderRadius: 3, background: 'var(--theme-bg-elevated)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.round((data.revenue_mtd / data.goal) * 100))}%`, height: '100%', background: 'var(--theme-accent)' }} />
        </div>
      )}
    </div>
  );
}

defineWidget<MonthlyRevenueContent>({
  id: 'monthly-revenue',
  label: 'Monthly Revenue',
  description: 'MTD revenue + trend vs last month.',
  category: 'financial',
  iconName: 'DollarSign',
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin'],
  Widget: MonthlyRevenueWidget,
});
