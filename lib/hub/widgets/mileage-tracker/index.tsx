'use client';
// Slice 142 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 212 of hub-grid-8x8-square-cells-2026-05-29.md — adopt the
// shared stat-bucket helpers + a tiny-mode reachable at 1×1.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

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
      const res = await fetch(`/api/admin/mileage?period=${settings.period}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data = await res.json();
      setSummary(data);
      setStatus('ok');
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
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{summary.miles.toFixed(0)}</span>
        <span style={tinyStatLabelStyle()}>miles {periodLabel(settings.period)}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>
        {summary.miles.toFixed(1)} mi
      </span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
        {summary.trips} trip{summary.trips === 1 ? '' : 's'} · ${summary.reimbursable_amount.toFixed(2)} reimbursable
      </span>
    </div>
  );
}

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
