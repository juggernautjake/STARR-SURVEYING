'use client';
// lib/hub/widgets/pending-bin/index.tsx
//
// Slice W9a (hub-cad-roles-polish-2026-06-18) — consolidated
// "things waiting on you" widget. Absorbs four single-stream
// widgets:
//   - pending-receipts     (/api/admin/receipts?status=pending)
//   - pending-time-off     (/api/admin/time-off?queue=1&status=pending)
//   - pending-hours        (/api/admin/time-logs?status=pending)
//   - assignments-due      (/api/admin/assignments?…&due=today)
//
// Size-relative content (W5 pattern):
//   tiny    — single combined count
//   small   — most pressing section (assignments due today)
//   medium  — assignments + receipts, two columns
//   large   — three columns: assignments / receipts / hours
//   xlarge  — four columns (adds time-off)

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetError from '@/lib/hub/components/WidgetError';

interface Receipt { id: string; vendor?: string | null; amount_cents?: number | null; submitted_at?: string }
interface TimeOffRequest { id: string; employee_email?: string | null; start_date?: string | null }
interface TimeLog { id: string; user_email?: string | null; date?: string | null; hours?: number | null }
interface AssignmentDue { id: string; title?: string | null; due_date?: string | null }

interface PendingContent extends Record<string, unknown> {
  showOpenLink: boolean;
}
const DEFAULTS: PendingContent = { showOpenLink: true };

interface FetchState {
  status: 'loading' | 'ok' | 'empty' | 'error';
  errorMessage: string;
  receipts: Receipt[];
  timeOff: TimeOffRequest[];
  hours: TimeLog[];
  assignments: AssignmentDue[];
}

function PendingBinWidget({ size, content }: WidgetProps<PendingContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [state, setState] = useState<FetchState>({
    status: 'loading',
    errorMessage: '',
    receipts: [],
    timeOff: [],
    hours: [],
    assignments: [],
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const [rcptRes, tofRes, hrsRes, asgRes] = await Promise.all([
        fetch('/api/admin/receipts?status=pending').catch(() => null),
        fetch('/api/admin/time-off?queue=1&status=pending').catch(() => null),
        fetch('/api/admin/time-logs?status=pending').catch(() => null),
        fetch('/api/admin/assignments?due=today').catch(() => null),
      ]);

      function readOrSkip(res: Response | null): unknown | null {
        if (!res) return null;
        if (res.status === 401 || res.status === 403) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }

      const rcptData = await readOrSkip(rcptRes) as { receipts?: Receipt[] } | null;
      const tofData = await readOrSkip(tofRes) as { requests?: TimeOffRequest[] } | null;
      const hrsData = await readOrSkip(hrsRes) as { entries?: TimeLog[] } | null;
      const asgData = await readOrSkip(asgRes) as { assignments?: AssignmentDue[] } | null;

      const receipts = rcptData?.receipts ?? [];
      const timeOff = tofData?.requests ?? [];
      const hours = hrsData?.entries ?? [];
      const assignments = asgData?.assignments ?? [];
      const total = receipts.length + timeOff.length + hours.length + assignments.length;

      setState({
        status: total === 0 ? 'empty' : 'ok',
        errorMessage: '',
        receipts,
        timeOff,
        hours,
        assignments,
      });
    } catch (err) {
      setState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        receipts: [],
        timeOff: [],
        hours: [],
        assignments: [],
      });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (state.status === 'loading') return <WidgetSkeleton rows={3} />;
  if (state.status === 'error') {
    return <WidgetError message={`Couldn't reach the queue (${state.errorMessage}).`} onRetry={refresh} />;
  }
  if (state.status === 'empty') {
    return <WidgetEmpty icon="✅" title="Queue is clear" description="No pending receipts, time-off, hours, or due assignments." />;
  }

  const totalCount = state.receipts.length + state.timeOff.length + state.hours.length + state.assignments.length;

  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle} data-testid="pending-bin-tiny">
        <span style={tinyCountStyle}>{totalCount}</span>
        <span style={tinyLabelStyle}>pending</span>
      </div>
    );
  }

  if (bucket === 'small') {
    return (
      <div style={columnStyle} data-testid="pending-bin-small">
        <SectionHeader label="Due today" badge={state.assignments.length} showOpenLink={settings.showOpenLink} href="/admin/assignments" />
        <AssignmentList rows={state.assignments.slice(0, 4)} />
      </div>
    );
  }

  if (bucket === 'medium') {
    return (
      <div style={twoColStyle} data-testid="pending-bin-medium">
        <section style={columnStyle}>
          <SectionHeader label="Due today" badge={state.assignments.length} showOpenLink={settings.showOpenLink} href="/admin/assignments" />
          <AssignmentList rows={state.assignments.slice(0, 4)} />
        </section>
        <section style={columnStyle}>
          <SectionHeader label="Receipts" badge={state.receipts.length} showOpenLink={settings.showOpenLink} href="/admin/receipts" />
          <ReceiptList rows={state.receipts.slice(0, 4)} />
        </section>
      </div>
    );
  }

  // large: 3 cols; xlarge: 4 cols (adds time-off)
  if (bucket === 'large') {
    return (
      <div style={threeColStyle} data-testid="pending-bin-large">
        <section style={columnStyle}>
          <SectionHeader label="Due today" badge={state.assignments.length} showOpenLink={settings.showOpenLink} href="/admin/assignments" />
          <AssignmentList rows={state.assignments.slice(0, 5)} />
        </section>
        <section style={columnStyle}>
          <SectionHeader label="Receipts" badge={state.receipts.length} showOpenLink={settings.showOpenLink} href="/admin/receipts" />
          <ReceiptList rows={state.receipts.slice(0, 5)} />
        </section>
        <section style={columnStyle}>
          <SectionHeader label="Hours" badge={state.hours.length} showOpenLink={settings.showOpenLink} href="/admin/hours-approval" />
          <HoursList rows={state.hours.slice(0, 5)} />
        </section>
      </div>
    );
  }

  return (
    <div style={fourColStyle} data-testid="pending-bin-xlarge">
      <section style={columnStyle}>
        <SectionHeader label="Due today" badge={state.assignments.length} showOpenLink={settings.showOpenLink} href="/admin/assignments" />
        <AssignmentList rows={state.assignments.slice(0, 8)} />
      </section>
      <section style={columnStyle}>
        <SectionHeader label="Receipts" badge={state.receipts.length} showOpenLink={settings.showOpenLink} href="/admin/receipts" />
        <ReceiptList rows={state.receipts.slice(0, 8)} />
      </section>
      <section style={columnStyle}>
        <SectionHeader label="Hours" badge={state.hours.length} showOpenLink={settings.showOpenLink} href="/admin/hours-approval" />
        <HoursList rows={state.hours.slice(0, 8)} />
      </section>
      <section style={columnStyle}>
        <SectionHeader label="Time off" badge={state.timeOff.length} showOpenLink={settings.showOpenLink} href="/admin/time-off" />
        <TimeOffList rows={state.timeOff.slice(0, 8)} />
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function SectionHeader({ label, badge, showOpenLink, href }: {
  label: string; badge: number; showOpenLink: boolean; href: string;
}) {
  return (
    <header style={sectionHeaderStyle}>
      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
        {label}
        {badge > 0 && <span style={badgeStyle}>{badge}</span>}
      </span>
      {showOpenLink && (
        <a href={href} style={openLinkStyle}>Open →</a>
      )}
    </header>
  );
}

function ReceiptList({ rows }: { rows: Receipt[] }) {
  if (rows.length === 0) return <p style={emptyTextStyle}>No pending receipts.</p>;
  return (
    <ul style={listStyle}>
      {rows.map((r) => (
        <li key={r.id} style={rowStyle}>
          <span style={rowTitleStyle}>{r.vendor ?? 'Receipt'}</span>
          {typeof r.amount_cents === 'number' && (
            <span style={rowPreviewStyle}>${(r.amount_cents / 100).toFixed(2)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function TimeOffList({ rows }: { rows: TimeOffRequest[] }) {
  if (rows.length === 0) return <p style={emptyTextStyle}>No pending requests.</p>;
  return (
    <ul style={listStyle}>
      {rows.map((r) => (
        <li key={r.id} style={rowStyle}>
          <span style={rowTitleStyle}>{r.employee_email?.split('@')[0] ?? 'Request'}</span>
          {r.start_date && <span style={rowPreviewStyle}>from {r.start_date}</span>}
        </li>
      ))}
    </ul>
  );
}

function HoursList({ rows }: { rows: TimeLog[] }) {
  if (rows.length === 0) return <p style={emptyTextStyle}>No pending entries.</p>;
  return (
    <ul style={listStyle}>
      {rows.map((r) => (
        <li key={r.id} style={rowStyle}>
          <span style={rowTitleStyle}>{r.user_email?.split('@')[0] ?? 'Entry'}</span>
          {typeof r.hours === 'number' && <span style={rowPreviewStyle}>{r.hours.toFixed(2)}h · {r.date ?? '—'}</span>}
        </li>
      ))}
    </ul>
  );
}

function AssignmentList({ rows }: { rows: AssignmentDue[] }) {
  if (rows.length === 0) return <p style={emptyTextStyle}>Nothing due today.</p>;
  return (
    <ul style={listStyle}>
      {rows.map((a) => (
        <li key={a.id} style={rowStyle}>
          <span style={rowTitleStyle}>{a.title ?? 'Assignment'}</span>
          {a.due_date && <span style={rowPreviewStyle}>{a.due_date}</span>}
        </li>
      ))}
    </ul>
  );
}

// ─── Pure helpers ──────────────────────────────────────────────────────

export function totalPendingCount(state: Pick<FetchState, 'receipts' | 'timeOff' | 'hours' | 'assignments'>): number {
  return state.receipts.length + state.timeOff.length + state.hours.length + state.assignments.length;
}

export function pendingLayoutForBucket(bucket: SizeBucket): 'tiny' | 'small' | 'medium' | 'three' | 'four' {
  if (bucket === 'tiny') return 'tiny';
  if (bucket === 'small') return 'small';
  if (bucket === 'medium') return 'medium';
  if (bucket === 'large') return 'three';
  return 'four';
}

// ─── Style fragments ───────────────────────────────────────────────────

const tinyWrapStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  height: '100%', gap: 2,
};
const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 700, lineHeight: 1,
  color: 'var(--theme-fg-primary)',
};
const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const twoColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const threeColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const fourColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const columnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0,
};
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1px solid var(--theme-border)', paddingBottom: 4,
};
const badgeStyle: React.CSSProperties = {
  display: 'inline-block', marginLeft: 6, padding: '0 6px',
  borderRadius: 12, background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #fff)', fontSize: '0.65rem', fontWeight: 700,
};
const openLinkStyle: React.CSSProperties = {
  fontSize: '0.7rem', color: 'var(--theme-accent, #3b82f6)', textDecoration: 'none',
};
const listStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden',
};
const rowStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 1,
  padding: '4px 0',
};
const rowTitleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.85rem)', fontWeight: 500,
  color: 'var(--theme-fg-primary)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const rowPreviewStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const emptyTextStyle: React.CSSProperties = {
  margin: 0, fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
};

defineWidget<PendingContent>({
  id: 'pending-bin',
  label: 'Pending queue',
  description: 'Everything waiting on you: receipts, time-off, hours, due assignments.',
  category: 'personal',
  iconName: 'Inbox',
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: PendingBinWidget,
});
