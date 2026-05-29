'use client';
// Slice 139 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 210 of hub-grid-8x8-square-cells-2026-05-29.md — bucket-aware
// typography + progress detail so the widget reads at every size.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export interface MonthlyRevenueContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: MonthlyRevenueContent = {};

interface RevenueSummary { revenue_mtd: number; revenue_last_month: number; goal?: number | null; }

function MonthlyRevenueWidget({ size }: WidgetProps<MonthlyRevenueContent>) {
  const bucket = sizeBucket(size.w, size.h);
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
  if (status === 'empty' || !data) {
    if (bucket === 'tiny') {
      return (
        <div style={tinyWrapStyle}>
          <span style={tinyAmountStyle}>—</span>
          <span style={mutedStyle}>MTD</span>
        </div>
      );
    }
    return <WidgetEmpty icon="💵" title="Revenue unavailable" description="Once /api/admin/reports lands, MTD revenue shows here." />;
  }

  const deltaPct = data.revenue_last_month > 0
    ? Math.round(((data.revenue_mtd - data.revenue_last_month) / data.revenue_last_month) * 100)
    : 0;
  const trendColor = deltaPct >= 0 ? 'var(--theme-success)' : 'var(--theme-danger)';
  const goalPct = data.goal && data.goal > 0
    ? Math.min(100, Math.round((data.revenue_mtd / data.goal) * 100))
    : null;

  // Tiny — just the dollar number, abbreviated.
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle}>
        <span style={tinyAmountStyle}>{formatCompact(data.revenue_mtd)}</span>
        <span style={mutedStyle}>{deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}%</span>
      </div>
    );
  }

  // Small — full dollar amount + trend, no goal bar.
  // Medium+ — adds goal progress + last-month context.
  const showGoalBar = goalPct !== null && bucket !== 'small';
  const showLastMonthLine = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';

  return (
    <div style={contentStyle}>
      <span style={amountStyleForBucket(bucket)}>
        ${data.revenue_mtd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
      <span style={mutedStyle}>
        Month-to-date · <span style={{ color: trendColor }}>{deltaPct >= 0 ? '+' : ''}{deltaPct}%</span>
        {showLastMonthLine && <> vs last month</>}
      </span>
      {showGoalBar && goalPct !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div aria-hidden style={goalBarTrackStyle}>
            <div style={{ ...goalBarFillStyle, width: `${goalPct}%` }} />
          </div>
          <span style={mutedStyle}>{goalPct}% of monthly goal</span>
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
  defaultSize: { w: 2, h: 2 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin'],
  Widget: MonthlyRevenueWidget,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function amountStyleForBucket(bucket: SizeBucket): React.CSSProperties {
  // Font size scales with widget bucket so a small widget reads its
  // number cleanly + a large widget doesn't waste vertical space.
  const fontSize =
    bucket === 'tiny'   ? 'clamp(1.5rem, 3.5vw, 2.25rem)' :
    bucket === 'small'  ? 'var(--hub-font-xl, 1.25rem)' :
    bucket === 'medium' ? 'var(--hub-font-2xl, 1.5rem)' :
    bucket === 'large'  ? '2rem' :
                           '2.5rem';
  return {
    fontSize,
    fontWeight: 700,
    color: 'var(--theme-success)',
    lineHeight: 1.1,
  };
}

// ─── Style fragments ─────────────────────────────────────────────────

const contentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
};

const tinyWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 2,
};

const tinyAmountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.25rem, 3vw, 2rem)',
  fontWeight: 700,
  color: 'var(--theme-success)',
  lineHeight: 1,
};

const mutedStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
};

const goalBarTrackStyle: React.CSSProperties = {
  height: 6,
  borderRadius: 3,
  background: 'var(--theme-bg-elevated)',
  overflow: 'hidden',
};

const goalBarFillStyle: React.CSSProperties = {
  height: '100%',
  background: 'var(--theme-accent)',
};
