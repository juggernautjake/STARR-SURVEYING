'use client';
// lib/hub/widgets/approvals/index.tsx
//
// consolidation Slice 3 (2026-05-30) — the unified Approvals widget.
// Folds the three legacy widgets (`pending-hours`, `pending-receipts`,
// `pending-time-off`) into one tile with a tab row so the surveyor
// can flip between queues without re-arranging the hub.
//
// The three legacy widgets still register so a saved layout doesn't
// lose its tiles; this slice ships the unified widget alongside them,
// marked as the new default in the catalog. A future slice migrates
// saved layouts and deletes the legacy ids.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';
import {
  pickDefaultMode,
  type ApprovalCounts,
  type ApprovalMode,
} from './pick-mode';

export interface ApprovalsContent extends Record<string, unknown> {
  /** Which queue is selected when the widget mounts. `auto` picks the
   *  largest queue at fetch time so the surveyor lands on the most
   *  pressing pile of work. */
  defaultMode?: 'auto' | ApprovalMode;
  /** Max rows shown per mode; 1-20, clamped. */
  maxItems?: number;
}
const DEFAULTS: ApprovalsContent = { defaultMode: 'auto', maxItems: 5 };

interface HoursRow      { id: string; user_email: string; user_name: string | null; total_hours: number; }
interface ReceiptRow    { id: string; vendor: string | null; amount: number; submitted_by: string | null; }
interface TimeOffRow    { id: string; user_email: string; user_name: string | null; start_date: string; end_date: string; hours_requested: number; }

interface ApprovalsState {
  hours: HoursRow[];
  receipts: ReceiptRow[];
  timeOff: TimeOffRow[];
}

const EMPTY_STATE: ApprovalsState = { hours: [], receipts: [], timeOff: [] };

const TAB_ORDER: ApprovalMode[] = ['hours', 'receipts', 'time-off'];
const TAB_LABEL: Record<ApprovalMode, string> = {
  'hours': 'Hours',
  'receipts': 'Receipts',
  'time-off': 'Time off',
};

function ApprovalsWidget({ size, content }: WidgetProps<ApprovalsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [state, setState] = useState<ApprovalsState>(EMPTY_STATE);
  const [mode, setMode] = useState<ApprovalMode | null>(
    settings.defaultMode === 'auto' ? null : (settings.defaultMode ?? 'hours'),
  );

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [hoursRes, receiptsRes, timeOffRes] = await Promise.all([
        fetch('/api/admin/time-logs?status=pending'),
        fetch('/api/admin/receipts?status=pending'),
        fetch('/api/admin/time-off?queue=1&status=pending'),
      ]);
      const hoursJson      = hoursRes.ok      ? await hoursRes.json()      : { logs: [] };
      const receiptsJson   = receiptsRes.ok   ? await receiptsRes.json()   : { receipts: [] };
      const timeOffJson    = timeOffRes.ok    ? await timeOffRes.json()    : { requests: [] };

      const next: ApprovalsState = {
        hours: aggregateHours(hoursJson.logs ?? []),
        receipts: mapReceipts(receiptsJson.receipts ?? []),
        timeOff: mapTimeOff(timeOffJson.requests ?? timeOffJson.events ?? []),
      };
      setState(next);
      // First-mount mode resolution: auto-pick whichever has the most
      // items unless the surveyor saved a fixed default.
      if (mode === null) {
        setMode(pickDefaultMode({
          hours: next.hours.length,
          receipts: next.receipts.length,
          timeOff: next.timeOff.length,
        }));
      }
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, [mode]);

  useEffect(() => { void load(); }, [load]);

  const counts: ApprovalCounts = {
    hours: state.hours.length,
    receipts: state.receipts.length,
    timeOff: state.timeOff.length,
  };
  const activeMode: ApprovalMode = mode ?? 'hours';
  const total = counts.hours + counts.receipts + counts.timeOff;
  const maxItems = clampInt(settings.maxItems, 1, 20, 5);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, total > 0 ? 'var(--theme-warning)' : 'var(--theme-fg-secondary)')}>
          {total}
        </span>
        <span style={tinyStatLabelStyle()}>pending</span>
      </div>
    );
  }

  if (status === 'error') {
    return <WidgetEmpty icon="⚠️" title="Couldn't load approvals" description="Try refreshing the hub." />;
  }

  if (total === 0) {
    return <WidgetEmpty icon="✅" title="All clear" description="No approvals waiting. Nice work." />;
  }

  return (
    <div style={wrapStyle}>
      <div role="tablist" aria-label="Approval queue" style={tabRowStyle}>
        {TAB_ORDER.map((m) => {
          const isActive = m === activeMode;
          const count = m === 'hours' ? counts.hours : m === 'receipts' ? counts.receipts : counts.timeOff;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setMode(m)}
              style={isActive ? activeTabStyle : tabStyle}
              data-mode={m}
            >
              {TAB_LABEL[m]}
              <span style={tabCountStyle}>{count}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" style={panelStyle}>
        {activeMode === 'hours' && renderHours(state.hours.slice(0, maxItems))}
        {activeMode === 'receipts' && renderReceipts(state.receipts.slice(0, maxItems))}
        {activeMode === 'time-off' && renderTimeOff(state.timeOff.slice(0, maxItems))}
      </div>
    </div>
  );
}

defineWidget<ApprovalsContent>({
  id: 'approvals',
  label: 'Approvals',
  description: 'Hours, receipts, and time-off awaiting your approval — one tile.',
  category: 'office',
  iconName: 'CheckCircle2',
  defaultSize: { w: 4, h: 3 },
  // 1×1 minimum to satisfy the Phase-35 catalog contract (a tiny tile
  // renders just the count). Larger tiles unlock the tab row + list.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support'],
  Widget: ApprovalsWidget,
});

// ─── Per-mode renderers ─────────────────────────────────────────────

function renderHours(rows: HoursRow[]): React.ReactElement {
  if (rows.length === 0) return <EmptyMode emoji="⏱" label="No pending hours" />;
  return (
    <ul style={listStyle} role="list">
      {rows.map((r) => (
        <li key={r.id} style={rowStyle}>
          <span style={nameStyle}>{r.user_name ?? r.user_email}</span>
          <span style={amountStyle}>{r.total_hours.toFixed(1)}h</span>
        </li>
      ))}
    </ul>
  );
}

function renderReceipts(rows: ReceiptRow[]): React.ReactElement {
  if (rows.length === 0) return <EmptyMode emoji="🧾" label="No pending receipts" />;
  return (
    <ul style={listStyle} role="list">
      {rows.map((r) => (
        <li key={r.id} style={rowStyle}>
          <span style={nameStyle}>{r.vendor ?? r.submitted_by ?? 'Receipt'}</span>
          <span style={amountStyle}>${r.amount.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}

function renderTimeOff(rows: TimeOffRow[]): React.ReactElement {
  if (rows.length === 0) return <EmptyMode emoji="🌴" label="No pending time-off" />;
  return (
    <ul style={listStyle} role="list">
      {rows.map((r) => (
        <li key={r.id} style={rowStyle}>
          <span style={nameStyle}>{r.user_name ?? r.user_email}</span>
          <span style={amountStyle}>{r.hours_requested.toFixed(0)}h</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyMode({ emoji, label }: { emoji: string; label: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 12, color: 'var(--theme-fg-secondary)' }}>
      <span style={{ fontSize: '1.5rem' }} aria-hidden>{emoji}</span>
      <span>{label}</span>
    </div>
  );
}

// ─── Pure helpers (exported for tests) ──────────────────────────────

interface RawHoursLog { user_email?: string | null; user_name?: string | null; log_date?: string | null; hours?: number | null; }

/** Aggregate the raw daily-log rows into per-(submitter, week) totals,
 *  matching what the legacy `pending-hours` widget shows. Pure. */
export function aggregateHours(rows: ReadonlyArray<RawHoursLog>): HoursRow[] {
  const buckets = new Map<string, HoursRow>();
  for (const r of rows) {
    const email = r.user_email?.trim();
    if (!email) continue;
    if (r.hours == null) continue;
    const hours = Number(r.hours);
    if (!Number.isFinite(hours)) continue;
    const week = weekStartIso(r.log_date ?? '') ?? '0000-01-01';
    const key = `${email}::${week}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.total_hours += hours;
    } else {
      buckets.set(key, {
        id: key,
        user_email: email,
        user_name: r.user_name ?? null,
        total_hours: hours,
      });
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.total_hours - a.total_hours);
}

interface RawReceipt { id?: string | null; vendor_name?: string | null; total_cents?: number | null; submitted_by_name?: string | null; submitted_by_email?: string | null; }

export function mapReceipts(rows: ReadonlyArray<RawReceipt>): ReceiptRow[] {
  const out: ReceiptRow[] = [];
  for (const r of rows) {
    const id = r.id?.trim();
    if (!id) continue;
    out.push({
      id,
      vendor: r.vendor_name ?? null,
      amount: (Number(r.total_cents) || 0) / 100,
      submitted_by: r.submitted_by_name ?? r.submitted_by_email ?? null,
    });
  }
  return out;
}

interface RawTimeOff { id?: string | null; assigned_to?: string | null; start_time?: string | null; end_time?: string | null; all_day?: boolean | null; hours_requested?: number | null; }

export function mapTimeOff(rows: ReadonlyArray<RawTimeOff>): TimeOffRow[] {
  const out: TimeOffRow[] = [];
  for (const r of rows) {
    const id = r.id?.trim();
    const email = r.assigned_to?.trim();
    if (!id || !email) continue;
    const start = (r.start_time ?? '').slice(0, 10);
    const end = (r.end_time ?? '').slice(0, 10);
    const hours = Number(r.hours_requested);
    out.push({
      id,
      user_email: email,
      user_name: null,
      start_date: start,
      end_date: end,
      hours_requested: Number.isFinite(hours) && hours > 0 ? hours : estimateHours(start, end, !!r.all_day),
    });
  }
  return out;
}

function estimateHours(start: string, end: string, allDay: boolean): number {
  if (!start || !end || !allDay) return 0;
  const a = Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)));
  const b = Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10)));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  const days = Math.max(1, Math.round((b - a) / 86_400_000) + 1);
  return days * 8;
}

function weekStartIso(logDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(logDate)) return null;
  const [y, m, d] = logDate.slice(0, 10).split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  if (!Number.isFinite(utc)) return null;
  const dayOfWeek = new Date(utc).getUTCDay() || 7;
  const monday = new Date(utc - (dayOfWeek - 1) * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

// ─── Style fragments ────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  height: '100%',
  minWidth: 0,
};
const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  paddingBottom: 4,
  borderBottom: '1px solid var(--theme-border)',
};
const tabStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--theme-fg-secondary)',
  cursor: 'pointer',
  fontSize: '0.8rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};
const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'var(--theme-accent)',
  color: 'var(--theme-accent-fg, white)',
  borderColor: 'var(--theme-accent)',
};
const tabCountStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 700,
  padding: '0 4px',
  borderRadius: 8,
  background: 'color-mix(in srgb, currentColor 18%, transparent)',
  minWidth: 16,
  textAlign: 'center',
};
const panelStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
};
const listStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 4,
};
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  padding: '6px 10px', borderRadius: 6,
  background: 'var(--theme-bg-elevated)', fontSize: '0.85rem',
};
const nameStyle: React.CSSProperties = {
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const amountStyle: React.CSSProperties = {
  fontWeight: 600, color: 'var(--theme-warning)',
};
