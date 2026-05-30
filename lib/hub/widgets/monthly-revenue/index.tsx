'use client';
// Slice 139 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 210 of hub-grid-8x8-square-cells-2026-05-29.md — bucket-aware
// typography + progress detail so the widget reads at every size.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

// Slice 15c — wired to the Slice-12 schema fields:
//   - period:         'month' | 'quarter' | 'year' (changes the label;
//                     the data still comes from the existing endpoint
//                     until backend grows per-period breakdowns)
//   - showTrend:      gates the ▲/▼ trend percentage line
//   - showComparison: gates the "vs last X" suffix on the muted line
import { resolveBool, resolveEnum } from '@/lib/hub/widgets/_shared/content-resolvers';

export type RevenuePeriod = 'month' | 'quarter' | 'year';
const PERIODS: ReadonlyArray<RevenuePeriod> = ['month', 'quarter', 'year'];

export interface MonthlyRevenueContent extends Record<string, unknown> {
  period?: RevenuePeriod;
  showTrend?: boolean;
  showComparison?: boolean;
}
const DEFAULTS: MonthlyRevenueContent = { period: 'month', showTrend: true, showComparison: true };

export const resolvePeriod         = (c: MonthlyRevenueContent): RevenuePeriod => resolveEnum(c.period, PERIODS, 'month');
export const resolveShowTrend      = (c: MonthlyRevenueContent): boolean       => resolveBool(c.showTrend, true);
export const resolveShowComparison = (c: MonthlyRevenueContent): boolean       => resolveBool(c.showComparison, true);

const PERIOD_LABEL: Record<RevenuePeriod, { ytd: string; vs: string }> = {
  month:   { ytd: 'Month-to-date',   vs: 'vs last month' },
  quarter: { ytd: 'Quarter-to-date', vs: 'vs last quarter' },
  year:    { ytd: 'Year-to-date',    vs: 'vs last year' },
};

interface RevenueSummary { revenue_mtd: number; revenue_last_month: number; goal?: number | null; }

function MonthlyRevenueWidget({ size, content }: WidgetProps<MonthlyRevenueContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const period = resolvePeriod(content);
  const showTrend = resolveShowTrend(content);
  const showComparison = resolveShowComparison(content);
  const periodLabel = PERIOD_LABEL[period];
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [data, setData] = useState<RevenueSummary | null>(null);

  const fetchData = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/admin/reports?metric=monthly-revenue&period=${period}`);
      if (!res.ok) { setStatus('empty'); return; }
      const j = await res.json();
      setData(j);
      setStatus('ok');
    } catch { setStatus('empty'); }
  }, [period]);
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

  // Tiny — just the dollar number, abbreviated. The trend pill folds
  // into the tiny size only when showTrend is on.
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle}>
        <span style={tinyAmountStyle}>{formatCompact(data.revenue_mtd)}</span>
        {showTrend && (
          <span style={mutedStyle}>{deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}%</span>
        )}
      </div>
    );
  }

  // Small — full dollar amount + trend, no goal bar.
  // Medium+ — adds goal progress + last-period context.
  const showGoalBar = goalPct !== null && bucket !== 'small';
  const showLastPeriodLine = showComparison &&
    (bucket === 'medium' || bucket === 'large' || bucket === 'xlarge');

  return (
    <div style={contentStyle}>
      <span style={amountStyleForBucket(bucket)}>
        ${data.revenue_mtd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
      <span style={mutedStyle}>
        {periodLabel.ytd}
        {showTrend && (
          <>
            {' · '}
            <span style={{ color: trendColor }}>{deltaPct >= 0 ? '+' : ''}{deltaPct}%</span>
          </>
        )}
        {showLastPeriodLine && <> {periodLabel.vs}</>}
      </span>
      {showGoalBar && goalPct !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div aria-hidden style={goalBarTrackStyle}>
            <div style={{ ...goalBarFillStyle, width: `${goalPct}%` }} />
          </div>
          <span style={mutedStyle}>{goalPct}% of {period}ly goal</span>
        </div>
      )}
    </div>
  );
}

export { PERIOD_LABEL };

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
