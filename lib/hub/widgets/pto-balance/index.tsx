'use client';
// lib/hub/widgets/pto-balance/index.tsx
//
// PTO Balance widget. Reads `/api/admin/pto` and shows the user's
// current PTO balance + accrual rate + optional recent history.
//
// Slice 112 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetError from '@/lib/hub/components/WidgetError';

export type PtoFormat = 'hours' | 'days';

export interface PtoBalanceContent extends Record<string, unknown> {
  format: PtoFormat;
  showHistory: boolean;
  /** Hours per workday for the hours → days conversion. Defaults to 8. */
  hoursPerDay: number;
}

const DEFAULTS: PtoBalanceContent = {
  format: 'hours',
  showHistory: true,
  hoursPerDay: 8,
};

interface PtoBalance {
  balance_hours: number;
  accrual_rate_hours: number;
  accrual_period: string;
  last_accrued_at?: string | null;
  carryover_cap_hours?: number | null;
}

interface PtoTransaction {
  id: string;
  delta_hours: number;
  kind: string;
  reason?: string | null;
  created_at?: string | null;
}

function PtoBalanceWidget({ size, content }: WidgetProps<PtoBalanceContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);

  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [balance, setBalance] = useState<PtoBalance | null>(null);
  const [history, setHistory] = useState<PtoTransaction[]>([]);

  const fetchBalance = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/pto');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { balance?: PtoBalance | null; recent_transactions?: PtoTransaction[] } = await res.json();
      if (!data.balance) {
        setStatus('empty');
        return;
      }
      setBalance(data.balance);
      setHistory(data.recent_transactions ?? []);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'error') return <WidgetError message="Couldn't load PTO." onRetry={fetchBalance} />;
  if (status === 'empty' || !balance) {
    return (
      <WidgetEmpty
        icon="🏖"
        title="No PTO yet"
        description="Your PTO balance will appear here once an admin sets up your accrual."
      />
    );
  }

  const formatted = formatBalance(balance.balance_hours, settings.format, settings.hoursPerDay);
  const accrual = formatAccrual(balance.accrual_rate_hours, balance.accrual_period, settings.format, settings.hoursPerDay);
  const showHistory = settings.showHistory && bucket !== 'tiny' && bucket !== 'small' && history.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 'var(--hub-font-2xl, 1.5rem)', fontWeight: 700, color: 'var(--theme-success)' }}>
          {formatted}
        </span>
        <span style={mutedStyle}>{accrual}</span>
        {balance.last_accrued_at && bucket !== 'tiny' && (
          <span style={mutedStyle}>Last accrued {formatRelative(balance.last_accrued_at)}</span>
        )}
      </div>

      {showHistory && (
        <ul role="list" style={historyListStyle}>
          {history.slice(0, capForBucket(bucket)).map((t) => (
            <li key={t.id} style={historyRowStyle}>
              <span style={{ color: t.delta_hours >= 0 ? 'var(--theme-success)' : 'var(--theme-danger)', fontWeight: 600 }}>
                {t.delta_hours >= 0 ? '+' : ''}{formatBalance(t.delta_hours, settings.format, settings.hoursPerDay)}
              </span>
              <span style={mutedStyle}>{t.reason ?? t.kind}</span>
              {t.created_at && <span style={mutedStyle}>{formatRelative(t.created_at)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PtoBalanceSettings({ value, onChange }: WidgetSettingsFormProps<PtoBalanceContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Format</span>
        <select
          value={settings.format}
          onChange={(e) => onChange({ ...settings, format: e.target.value as PtoFormat })}
        >
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </label>
      {settings.format === 'days' && (
        <label>
          <span style={labelStyle}>Hours per day</span>
          <input
            type="number"
            min={1}
            max={24}
            step={0.5}
            value={settings.hoursPerDay}
            onChange={(e) => onChange({ ...settings, hoursPerDay: Math.max(1, Math.min(24, Number(e.target.value))) })}
          />
        </label>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={settings.showHistory}
          onChange={(e) => onChange({ ...settings, showHistory: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Show recent transactions</span>
      </label>
    </div>
  );
}

defineWidget<PtoBalanceContent>({
  id: 'pto-balance',
  label: 'PTO Balance',
  description: 'Your current PTO balance + accrual rate.',
  category: 'time-pay',
  iconName: 'Palmtree',
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  // Internal roles only — students/teachers don't accrue PTO.
  allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
  Widget: PtoBalanceWidget,
  SettingsForm: PtoBalanceSettings,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 0;
    case 'small':  return 0;
    case 'medium': return 3;
    case 'large':  return 6;
    case 'xlarge': return 12;
  }
}

export function formatBalance(hours: number, format: PtoFormat, hoursPerDay: number): string {
  if (!Number.isFinite(hours)) return '—';
  if (format === 'days') {
    if (hoursPerDay <= 0) return `${hours.toFixed(1)}h`;
    const days = hours / hoursPerDay;
    return `${days.toFixed(1)}d`;
  }
  return `${hours.toFixed(1)}h`;
}

export function formatAccrual(
  rate: number,
  period: string,
  format: PtoFormat,
  hoursPerDay: number,
): string {
  const amount = formatBalance(rate, format, hoursPerDay);
  const period_ = period === 'biweekly' ? 'every 2 weeks'
                : period === 'monthly'  ? 'per month'
                : period === 'weekly'   ? 'per week'
                : `per ${period}`;
  return `Accrues ${amount} ${period_}`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

const historyListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  borderTop: '1px solid var(--theme-border)',
  paddingTop: 'var(--hub-spc-2, 8px)',
};

const historyRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  fontSize: 'var(--hub-font-xs, 0.75rem)',
};

const mutedStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};
