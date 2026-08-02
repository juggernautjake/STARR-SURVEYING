'use client';
// lib/hub/widgets/proactive-alerts/index.tsx — "what the app noticed" (audit §5, Phase 3 item 16).
//
// The alert rules and the delivery cron make the firm's problems arrive in the bell. This is the
// other half of the same requirement: the standing view. A notification answers "has anything
// changed since I last looked"; this answers "what is wrong right now", which is a different
// question and the one somebody asks when they sit down at the start of a day.
//
// ── IT READS GET, WHICH DELIVERS NOTHING ────────────────────────────────────────────────────────
//
// `/api/admin/alerts` deliberately does not mark anything delivered on GET — otherwise the first
// person to load their hub would silently consume everybody else's notifications. So this widget is
// free to poll: rendering it can never cost anyone an alert.
//
// ── AN EMPTY STATE THAT MEANS SOMETHING ─────────────────────────────────────────────────────────
//
// "Nothing to flag" is a real answer here and the audit has burned this repo three times on the
// opposite (§1.1b, the compliance all-clear, the receivables page). The widget distinguishes not
// loaded / failed to load / genuinely clear, because a silent failure and a clean firm look the same
// on screen and mean opposite things.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import { statNumberStyle, tinyStatLabelStyle, tinyStatWrapStyle } from '@/lib/hub/widgets/_shared/stat-bucket';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export type AlertSeverity = 'info' | 'warn' | 'urgent';

export interface ProactiveAlertRow {
  dedupeKey: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href?: string;
}

export type AlertFloor = 'all' | 'warn' | 'urgent';
export interface ProactiveAlertsContent extends Record<string, unknown> {
  minSeverity: AlertFloor;
}
const DEFAULTS: ProactiveAlertsContent = { minSeverity: 'all' };

const RANK: Record<AlertSeverity, number> = { urgent: 0, warn: 1, info: 2 };

/** Keep alerts at or above the chosen floor. Pure + exported so the ordering rule is testable
 *  without a DOM: "warn and above" must include urgent, and getting that backwards hides exactly
 *  the alerts somebody raised the floor to see. */
export function atOrAbove(alerts: ProactiveAlertRow[], floor: AlertFloor): ProactiveAlertRow[] {
  if (floor === 'all') return alerts;
  const cap = floor === 'urgent' ? RANK.urgent : RANK.warn;
  return alerts.filter((a) => RANK[a.severity] <= cap);
}

/** How many of each severity, for the summary strip. Pure + exported. */
export function countBySeverity(alerts: ProactiveAlertRow[]): Record<AlertSeverity, number> {
  const out: Record<AlertSeverity, number> = { urgent: 0, warn: 0, info: 0 };
  for (const a of alerts) out[a.severity] += 1;
  return out;
}

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  urgent: 'var(--theme-danger)',
  warn: 'var(--theme-warning)',
  info: 'var(--theme-fg-secondary)',
};

function ProactiveAlertsWidget({ size, content }: WidgetProps<ProactiveAlertsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'clear' | 'failed'>('loading');
  const [alerts, setAlerts] = useState<ProactiveAlertRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/alerts');
      if (!res.ok) { setStatus('failed'); return; }
      const data: { alerts?: ProactiveAlertRow[] } = await res.json();
      const list = atOrAbove(data.alerts ?? [], settings.minSeverity);
      setAlerts(list);
      setStatus(list.length === 0 ? 'clear' : 'ok');
    } catch {
      setStatus('failed');
    }
  }, [settings.minSeverity]);

  useEffect(() => { void load(); }, [load]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;

  if (status === 'failed') {
    // Said out loud. An all-clear that is really a failed fetch is the single most expensive lie a
    // monitoring surface can tell, because it is indistinguishable from good news.
    return (
      <WidgetEmpty
        icon="⚠"
        title="Could not check"
        description="The alert checks did not run just now, so this is not an all-clear."
      />
    );
  }

  if (status === 'clear') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>flags</span>
        </div>
      );
    }
    return <WidgetEmpty icon="✓" title="Nothing to flag" description="No expiring dates, overruns, aged invoices or forgotten clock-outs." />;
  }

  const counts = countBySeverity(alerts);
  const worst: AlertSeverity = counts.urgent > 0 ? 'urgent' : counts.warn > 0 ? 'warn' : 'info';

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()} data-testid="proactive-alerts-tiny">
        <span style={statNumberStyle(bucket, SEVERITY_COLOR[worst])}>{alerts.length}</span>
        <span style={tinyStatLabelStyle()}>flags</span>
      </div>
    );
  }

  const visible = alerts.slice(0, capForBucket(bucket));
  const showSummary = bucket !== 'small';
  const showDetail = bucket === 'large' || bucket === 'xlarge';

  return (
    <div data-testid={`proactive-alerts-${bucket}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, height: '100%' }}>
      {showSummary && (
        <ul aria-label="Alert summary" style={summaryStripStyle} data-testid="proactive-alerts-summary">
          <li style={{ ...summaryChipStyle, color: SEVERITY_COLOR.urgent }}><strong>{counts.urgent}</strong>&nbsp;urgent</li>
          <li style={{ ...summaryChipStyle, color: SEVERITY_COLOR.warn }}><strong>{counts.warn}</strong>&nbsp;to watch</li>
          <li style={{ ...summaryChipStyle, color: SEVERITY_COLOR.info }}><strong>{counts.info}</strong>&nbsp;for info</li>
        </ul>
      )}

      <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
        {visible.map((a) => {
          const inner = (
            <>
              <span aria-hidden style={{ ...dotStyle, background: SEVERITY_COLOR[a.severity] }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.title}
                </span>
                {showDetail && (
                  <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{a.detail}</span>
                )}
              </span>
            </>
          );
          return (
            <li key={a.dedupeKey}>
              {/* An alert with no destination is a complaint — the rule module says so, and every
                  rule supplies an href. The span branch exists for the day one does not. */}
              {a.href ? (
                <Link href={a.href} style={rowLinkStyle} aria-label={a.title}>{inner}</Link>
              ) : (
                <span style={rowLinkStyle}>{inner}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProactiveAlertsSettings({ value, onChange }: WidgetSettingsFormProps<ProactiveAlertsContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>Show</span>
      <select
        value={settings.minSeverity}
        onChange={(e) => onChange({ ...settings, minSeverity: e.target.value as AlertFloor })}
      >
        <option value="all">Everything</option>
        <option value="warn">Worth watching and above</option>
        <option value="urgent">Urgent only</option>
      </select>
    </label>
  );
}

defineWidget<ProactiveAlertsContent>({
  id: 'proactive-alerts',
  label: 'Needs attention',
  description: 'What the app noticed without being asked — expiries, overruns, aged invoices.',
  category: 'work',
  iconName: 'Flame',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  // The route itself filters: a named audience sees its own alert, everything else needs `isAdmin`.
  // Listing the same roles here keeps anyone else from adding a tile that would always read "nothing
  // to flag" — an empty widget they cannot fix is worse than an absent one.
  allowedRoles: ['admin', 'developer'],
  Widget: ProactiveAlertsWidget,
  SettingsForm: ProactiveAlertsSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 3, medium: 5, large: 10, xlarge: 20 });
}

const summaryStripStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', flexWrap: 'wrap', gap: 6,
};
const summaryChipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--theme-bg-elevated)',
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
};
const dotStyle: React.CSSProperties = {
  width: 8, height: 8, borderRadius: 999, flexShrink: 0,
};
const rowLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  textDecoration: 'none',
  color: 'inherit',
};
