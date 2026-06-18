'use client';
// Slice 142 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 212 of hub-grid-8x8-square-cells-2026-05-29.md — adopt the
// shared stat-bucket helpers + a tiny-mode reachable at 1×1.
// Slice S1 of widget-size-responsive-content-2026-06-18.md — add
// per-bucket growth (period switcher chips at medium+, "Log a
// trip" CTA + IRS rate hint at large+, an "average per trip"
// stat at xlarge) so the surveyor sees more useful info as they
// grow the tile.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

// IRS 2026 standard mileage rate for business miles. Surfaced
// at large+ as a footnote so the reimbursement number reads in
// the right context.
const IRS_BUSINESS_RATE_USD = 0.70;

export interface MileageTrackerContent extends Record<string, unknown> {
  period: 'today' | 'week' | 'month';
}
const DEFAULTS: MileageTrackerContent = { period: 'week' };

interface MileageSummary { miles: number; trips: number; reimbursable_amount: number; }

function MileageTrackerWidget({ size, content }: WidgetProps<MileageTrackerContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [summary, setSummary] = useState<MileageSummary | null>(null);

  const fetchSummary = useCallback(async () => {
    setStatus('loading');
    try {
      // hub-widget-excellence-15 — uses the new ?summary=1 mode which is
      // self-scoped (caller's own mileage), so every role this widget
      // is allowed for can read it (the admin IRS export stays gated).
      const res = await fetch(`/api/admin/mileage?summary=1&period=${settings.period}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: MileageSummary = await res.json();
      setSummary(data);
      setStatus(data.miles > 0 ? 'ok' : 'empty');
    } catch { setStatus('empty'); }
  }, [settings.period]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  if (status === 'loading') return <WidgetSkeleton rows={2} />;
  if (status === 'empty' || !summary) {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>—</span>
          <span style={tinyStatLabelStyle()}>miles</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🚗" title="No mileage" description="Trips log here as you drive." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()} data-testid="mileage-tracker-tiny">
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{summary.miles.toFixed(0)}</span>
        <span style={tinyStatLabelStyle()}>miles {periodLabel(settings.period)}</span>
      </div>
    );
  }

  const showPeriodChips = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const showCtaRow = bucket === 'large' || bucket === 'xlarge';
  const showAvgPerTrip = bucket === 'xlarge';
  const avgPerTrip = summary.trips > 0 ? summary.miles / summary.trips : 0;

  return (
    <div
      data-testid={`mileage-tracker-${bucket}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, height: '100%' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>
          {summary.miles.toFixed(1)} mi
        </span>
        <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
          {summary.trips} trip{summary.trips === 1 ? '' : 's'} · ${summary.reimbursable_amount.toFixed(2)} reimbursable
        </span>
      </div>

      {showAvgPerTrip && summary.trips > 0 && (
        <div
          data-testid="mileage-tracker-avg-per-trip"
          style={{
            display: 'flex', flexDirection: 'column', gap: 1,
            padding: '6px 8px',
            borderRadius: 6,
            background: 'var(--theme-bg-elevated)',
          }}
        >
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--theme-fg-primary)' }}>
            {avgPerTrip.toFixed(1)} mi/trip
          </span>
          <span style={{ fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)' }}>
            Avg this period
          </span>
        </div>
      )}

      {showPeriodChips && (
        <ul
          data-testid="mileage-tracker-period-chips"
          aria-label="Switch period"
          style={periodChipsStyle}
        >
          {(['today', 'week', 'month'] as const).map((p) => {
            const active = settings.period === p;
            return (
              <li key={p}>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); }}
                  style={{
                    ...periodChipStyle,
                    ...(active ? periodChipActiveStyle : null),
                  }}
                  // Read-only at the widget level — the surveyor
                  // changes the period in the widget settings.
                  // We still render the chip strip so the active
                  // period is unmistakable at a glance.
                  aria-pressed={active}
                  aria-disabled
                  title={`Showing ${periodLabel(p)}`}
                >
                  {periodChipLabel(p)}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showCtaRow && (
        <div
          data-testid="mileage-tracker-cta-row"
          style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <span style={{ fontSize: 'var(--hub-font-xs, 0.7rem)', color: 'var(--theme-fg-muted, var(--theme-fg-secondary))' }}>
            IRS standard rate ${IRS_BUSINESS_RATE_USD.toFixed(2)}/mi
          </span>
          <Link
            href="/admin/me?tab=mileage"
            style={ctaStyle}
            data-testid="mileage-tracker-cta"
          >
            Log a trip →
          </Link>
        </div>
      )}
    </div>
  );
}

const periodChipsStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', gap: 4,
};
const periodChipStyle: React.CSSProperties = {
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-secondary)',
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: '0.7rem',
  fontWeight: 600,
  cursor: 'default',
};
const periodChipActiveStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 14%, transparent)',
  color: 'var(--theme-accent, #3b82f6)',
  borderColor: 'var(--theme-accent, #3b82f6)',
};
const ctaStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '4px 10px',
  borderRadius: 6,
  background: 'var(--theme-accent, #3b82f6)',
  color: 'white',
  fontSize: '0.75rem',
  fontWeight: 600,
  textDecoration: 'none',
  alignSelf: 'flex-start',
};

function MileageTrackerSettings({ value, onChange }: WidgetSettingsFormProps<MileageTrackerContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>Period</span>
      <select value={settings.period} onChange={(e) => onChange({ ...settings, period: e.target.value as MileageTrackerContent['period'] })}>
        <option value="today">Today</option>
        <option value="week">This week</option>
        <option value="month">This month</option>
      </select>
    </label>
  );
}

defineWidget<MileageTrackerContent>({
  id: 'mileage-tracker',
  label: 'Mileage Tracker',
  description: 'Miles + reimbursement this period.',
  category: 'operational',
  iconName: 'Car',
  defaultSize: { w: 2, h: 2 },
  // Slice 212 — minSize lowered to 1×1 with the tiny stat-card mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 4, h: 4 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'tech_support'],
  Widget: MileageTrackerWidget,
  SettingsForm: MileageTrackerSettings,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

export function periodLabel(period: MileageTrackerContent['period']): string {
  switch (period) {
    case 'today': return 'today';
    case 'week':  return 'this wk';
    case 'month': return 'this mo';
  }
}

/** Short two-character chip label for the period-switcher strip at medium+. */
export function periodChipLabel(period: MileageTrackerContent['period']): string {
  switch (period) {
    case 'today': return 'Today';
    case 'week':  return 'Week';
    case 'month': return 'Month';
  }
}

/** Pure helper — pick the layout variant per bucket. Used by the
 *  S1 spec to lock the size-relative contract. */
export function mileageLayoutForBucket(bucket: SizeBucket): 'tiny' | 'small' | 'medium' | 'large' | 'xlarge' {
  return bucket;
}
