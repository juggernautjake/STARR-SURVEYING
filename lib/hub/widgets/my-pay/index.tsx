'use client';
// lib/hub/widgets/my-pay/index.tsx
//
// My Pay widget. Reads the user's payroll profile from the existing
// `/api/admin/payroll/employees?email={email}` endpoint and surfaces a
// privacy-toggleable summary at every size bucket.
//
//   tiny    →   $22.50/hr
//   small   →   hourly rate + available balance
//   medium  →   adds total earned + total withdrawn
//   large   →   adds salary type + pay frequency
//   xlarge  →   full grid of every stat
//
// The privacy toggle (eye icon in the header) masks every dollar
// figure with •••• and persists per-session in widget content. Settings
// panel exposes which stats to show, whether amounts get a positive
// color tint, and whether to surface the last-updated timestamp.
//
// Slice 96 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetError from '@/lib/hub/components/WidgetError';

/** Every stat the widget can render. The settings panel exposes
 *  these as checkboxes; the renderer uses {@link visibleStatsForBucket}
 *  to enforce sensible maximums per bucket. */
export type MyPayStat =
  | 'hourly_rate'
  | 'available_balance'
  | 'total_earned'
  | 'total_withdrawn'
  | 'salary_type'
  | 'pay_frequency';

export const ALL_MY_PAY_STATS: ReadonlyArray<MyPayStat> = [
  'hourly_rate',
  'available_balance',
  'total_earned',
  'total_withdrawn',
  'salary_type',
  'pay_frequency',
];

interface MyPayProfile {
  hourly_rate: number;
  available_balance: number;
  total_earned: number;
  total_withdrawn: number;
  salary_type: string;
  pay_frequency: string;
}

export interface MyPayContent extends Record<string, unknown> {
  /** Default selection — the renderer further filters by bucket so a
   *  tiny tile doesn't try to cram 6 stats into 2 lines. */
  stats: MyPayStat[];
  /** When true, dollar figures get a `--theme-success` tint. */
  colorAmounts: boolean;
  /** When true, the footer shows "Updated …" — defaults off to avoid
   *  the stale-data anxiety effect. */
  showUpdated: boolean;
  /** Per-instance privacy toggle. Defaults visible — the user opts
   *  in to masking. */
  privacy: boolean;
  /** Currency formatting. `currency` = "$1,234.56", `compact` = "$1.2k"
   *  when >= 1000. */
  amountStyle: 'currency' | 'compact';
}

const DEFAULTS: MyPayContent = {
  stats: ['hourly_rate', 'available_balance', 'total_earned', 'total_withdrawn'],
  colorAmounts: true,
  showUpdated: false,
  privacy: false,
  amountStyle: 'currency',
};

const PROFILE_ENDPOINT = '/api/admin/payroll/employees';

function MyPayWidget({ size, content }: WidgetProps<MyPayContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const { data: session } = useSession();
  const email = session?.user?.email ?? '';

  // The privacy toggle has two sources: the saved per-instance setting
  // (`content.privacy`) and a session-only override the user can flip
  // from the header without persisting. The override starts seeded from
  // the saved value.
  const [privacyOverride, setPrivacyOverride] = useState<boolean>(settings.privacy);
  const privacy = privacyOverride;

  const [profile, setProfile] = useState<MyPayProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>(
    email ? 'loading' : 'empty',
  );
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!email) {
      setStatus('empty');
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch(`${PROFILE_ENDPOINT}?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { profile?: MyPayProfile | null; exists?: boolean } = await res.json();
      if (!data.exists || !data.profile) {
        setStatus('empty');
        setProfile(null);
        return;
      }
      setProfile(data.profile);
      setLastUpdated(new Date().toISOString());
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, [email]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const visibleStats: MyPayStat[] = useMemo(
    () => visibleStatsForBucket(settings.stats, bucket),
    [settings.stats, bucket],
  );

  if (status === 'loading') {
    return <WidgetSkeleton rows={Math.max(2, visibleStats.length)} />;
  }
  if (status === 'error') {
    return <WidgetError message="Couldn't load your pay summary." onRetry={fetchProfile} />;
  }
  if (status === 'empty' || !profile) {
    return (
      <WidgetEmpty
        icon="💰"
        title="No pay profile yet"
        description="An admin will set up your pay profile so this widget can fill in."
      />
    );
  }

  const formatStyle: 'currency' | 'compact' = settings.amountStyle;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--hub-spc-2, 8px)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--hub-spc-2, 8px)',
        }}
      >
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>
          My pay
        </span>
        <button
          type="button"
          onClick={() => setPrivacyOverride((p) => !p)}
          aria-pressed={privacy}
          aria-label={privacy ? 'Show pay amounts' : 'Hide pay amounts'}
          title={privacy ? 'Show pay amounts' : 'Hide pay amounts'}
          style={privacyToggleStyle}
        >
          {privacy ? '🙈' : '👁'}
        </button>
      </header>

      <div
        role="list"
        style={{
          display: 'grid',
          gridTemplateColumns: gridColsForBucket(bucket, visibleStats.length),
          gap: 'var(--hub-spc-3, 12px)',
          flex: 1,
        }}
      >
        {visibleStats.map((statId) => (
          <StatTile
            key={statId}
            statId={statId}
            value={profile[statId]}
            privacy={privacy}
            colorAmounts={settings.colorAmounts}
            formatStyle={formatStyle}
          />
        ))}
      </div>

      {settings.showUpdated && lastUpdated && (
        <footer style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
          Updated {formatRelative(lastUpdated)}
        </footer>
      )}
    </div>
  );
}

function MyPaySettings({ value, onChange }: WidgetSettingsFormProps<MyPayContent>) {
  const settings = { ...DEFAULTS, ...value };
  function toggleStat(statId: MyPayStat) {
    const next = settings.stats.includes(statId)
      ? settings.stats.filter((s) => s !== statId)
      : [...settings.stats, statId];
    onChange({ ...settings, stats: next });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={settingsLabelStyle}>Stats to show</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
          {ALL_MY_PAY_STATS.map((s) => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.stats.includes(s)}
                onChange={() => toggleStat(s)}
              />
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{labelForStat(s)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label>
        <span style={settingsLabelStyle}>Amount style</span>
        <select
          value={settings.amountStyle}
          onChange={(e) => onChange({ ...settings, amountStyle: e.target.value as MyPayContent['amountStyle'] })}
        >
          <option value="currency">Full currency ($1,234.56)</option>
          <option value="compact">Compact ($1.2k)</option>
        </select>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.colorAmounts}
          onChange={(e) => onChange({ ...settings, colorAmounts: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
          Color dollar amounts with the theme success tint
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.showUpdated}
          onChange={(e) => onChange({ ...settings, showUpdated: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
          Show last-updated timestamp in the footer
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.privacy}
          onChange={(e) => onChange({ ...settings, privacy: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
          Mask amounts by default (privacy mode)
        </span>
      </label>
    </div>
  );
}

defineWidget<MyPayContent>({
  id: 'my-pay',
  label: 'My Pay',
  description: 'Your pay summary at a glance — with a one-tap privacy toggle.',
  category: 'time-pay',
  iconName: 'Wallet',
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 2, h: 1 },
  maxSize: { w: 12, h: 4 },
  defaultContent: DEFAULTS,
  // Only roles paid by the hour. Salaried roles + students see the
  // widget hidden from the Add-Widget modal but a saved instance still
  // renders (with no profile → empty state).
  allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'tech_support'],
  Widget: MyPayWidget,
  SettingsForm: MyPaySettings,
});

// ─── StatTile ─────────────────────────────────────────────────────────

function StatTile({
  statId,
  value,
  privacy,
  colorAmounts,
  formatStyle,
}: {
  statId: MyPayStat;
  value: string | number;
  privacy: boolean;
  colorAmounts: boolean;
  formatStyle: 'currency' | 'compact';
}) {
  const isCurrency = isCurrencyStat(statId);
  const display = privacy && isCurrency
    ? '••••'
    : formatValue(statId, value, formatStyle);

  return (
    <div role="listitem" style={statTileStyle}>
      <div style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {labelForStat(statId)}
      </div>
      <div
        style={{
          fontSize: 'var(--hub-font-lg, 1.125rem)',
          fontWeight: 600,
          color: colorAmounts && isCurrency && !privacy ? 'var(--theme-success)' : 'var(--theme-fg-primary)',
        }}
      >
        {display}
      </div>
    </div>
  );
}

// ─── Helpers (exported for tests) ────────────────────────────────────

/** Caps the visible stats per bucket: tiny=1, small=2, medium=4,
 *  large=6 (everything), xlarge=6. Preserves user order. */
export function visibleStatsForBucket(stats: MyPayStat[], bucket: SizeBucket): MyPayStat[] {
  return stats.slice(0, capForBucket(bucket));
}

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny': return 1;
    case 'small': return 2;
    case 'medium': return 4;
    case 'large': return 6;
    case 'xlarge': return 6;
  }
}

export function isCurrencyStat(statId: MyPayStat): boolean {
  switch (statId) {
    case 'hourly_rate':
    case 'available_balance':
    case 'total_earned':
    case 'total_withdrawn':
      return true;
    case 'salary_type':
    case 'pay_frequency':
      return false;
  }
}

export function labelForStat(statId: MyPayStat): string {
  switch (statId) {
    case 'hourly_rate':       return 'Hourly';
    case 'available_balance': return 'Available';
    case 'total_earned':      return 'Total earned';
    case 'total_withdrawn':   return 'Total withdrawn';
    case 'salary_type':       return 'Pay type';
    case 'pay_frequency':     return 'Frequency';
  }
}

export function formatValue(
  statId: MyPayStat,
  value: string | number,
  formatStyle: 'currency' | 'compact',
): string {
  if (!isCurrencyStat(statId)) return String(value ?? '—');
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  if (statId === 'hourly_rate') return `$${n.toFixed(2)}/hr`;
  if (formatStyle === 'compact' && n >= 1000) {
    return `$${(n / 1000).toFixed(1)}k`;
  }
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function gridColsForBucket(bucket: SizeBucket, statCount: number): string {
  if (bucket === 'tiny') return '1fr';
  if (bucket === 'small') return 'repeat(2, 1fr)';
  if (bucket === 'medium') return 'repeat(2, 1fr)';
  if (bucket === 'large') return `repeat(${Math.min(3, statCount || 1)}, 1fr)`;
  return `repeat(${Math.min(3, statCount || 1)}, 1fr)`;
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

// ─── Style fragments ───────────────────────────────────────────────────

const settingsLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};

const privacyToggleStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '1rem',
  padding: 4,
  borderRadius: 4,
  color: 'var(--theme-fg-secondary)',
};

const statTileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: 'var(--hub-spc-2, 8px)',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
};
