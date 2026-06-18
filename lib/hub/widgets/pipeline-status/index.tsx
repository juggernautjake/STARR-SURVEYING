'use client';
// Slice 131 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

export interface PipelineStatusContent extends Record<string, unknown> {
  showFailedOnly: boolean;
}
const DEFAULTS: PipelineStatusContent = { showFailedOnly: false };

interface PipelineRun { id: string; name: string; status: 'running' | 'success' | 'failed' | 'queued'; started_at?: string | null; }

function PipelineStatusWidget({ size, content }: WidgetProps<PipelineStatusContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [runs, setRuns] = useState<PipelineRun[]>([]);

  const fetchRuns = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/research/pipeline');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { runs?: PipelineRun[] } = await res.json();
      const list = settings.showFailedOnly ? (data.runs ?? []).filter((r) => r.status === 'failed') : (data.runs ?? []);
      setRuns(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, [settings.showFailedOnly]);
  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>runs</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🔁" title="Pipelines quiet" description="Recent runs appear here." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, runs.some((r) => r.status === 'failed') ? 'var(--theme-danger)' : 'var(--theme-accent)')}>{runs.length}</span>
        <span style={tinyStatLabelStyle()}>{runs.filter((r) => r.status === 'failed').length > 0 ? `${runs.filter((r) => r.status === 'failed').length} failed` : runs.length === 1 ? 'run' : 'runs'}</span>
      </div>
    );
  }

  const showStarted = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const cap = bucket === 'small' ? 4 : bucket === 'medium' ? 6 : bucket === 'large' ? 12 : 24;
  // Slice S3 — status-breakdown chip strip at medium+
  // (e.g. "3 running · 5 success · 2 failed · 1 queued") plus an
  // xlarge-only "failures" detail row pinned at the bottom of the
  // tile so an at-a-glance health check surfaces the actionable
  // failures without leaving the hub.
  const showStatusChips = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const showFailureFooter = bucket === 'xlarge';
  const counts = countByStatus(runs);
  const recentFailures = runs.filter((r) => r.status === 'failed').slice(0, 3);
  return (
    <div
      data-testid={`pipeline-status-${bucket}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, height: '100%' }}
    >
      {showStatusChips && (
        <ul
          data-testid="pipeline-status-status-chips"
          aria-label="Runs by status"
          style={chipStripStyle}
        >
          <li style={{ ...chipStyle, color: 'var(--theme-accent)' }} title="Running">
            <span style={{ ...statusDot, background: 'var(--theme-accent)' }} />
            <span><strong>{counts.running}</strong>&nbsp;running</span>
          </li>
          <li style={{ ...chipStyle, color: 'var(--theme-success)' }} title="Success">
            <span style={{ ...statusDot, background: 'var(--theme-success)' }} />
            <span><strong>{counts.success}</strong>&nbsp;success</span>
          </li>
          <li style={{ ...chipStyle, color: 'var(--theme-danger)' }} title="Failed">
            <span style={{ ...statusDot, background: 'var(--theme-danger)' }} />
            <span><strong>{counts.failed}</strong>&nbsp;failed</span>
          </li>
          <li style={{ ...chipStyle, color: 'var(--theme-fg-secondary)' }} title="Queued">
            <span style={{ ...statusDot, background: 'var(--theme-fg-muted)' }} />
            <span><strong>{counts.queued}</strong>&nbsp;queued</span>
          </li>
        </ul>
      )}

      <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
        {runs.slice(0, cap).map((r) => (
          <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
            <span aria-label={r.status} style={{ width: 8, height: 8, borderRadius: 8, background: pipelineColor(r.status), flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            {showStarted && r.started_at && (
              <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', flexShrink: 0 }}>{formatStarted(r.started_at)}</span>
            )}
            <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', flexShrink: 0 }}>{r.status}</span>
          </li>
        ))}
      </ul>

      {showFailureFooter && recentFailures.length > 0 && (
        <div
          data-testid="pipeline-status-failure-footer"
          style={failureFooterStyle}
        >
          <span style={{ fontSize: '0.7rem', color: 'var(--theme-danger)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Recent failures
          </span>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recentFailures.map((r) => (
              <li key={r.id} style={{ fontSize: '0.72rem', color: 'var(--theme-fg-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <strong style={{ color: 'var(--theme-fg-primary)' }}>{r.name}</strong>
                {r.started_at && <> · {formatStarted(r.started_at)}</>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Bucket runs into the four canonical statuses. Pure + exported. */
export function countByStatus(runs: PipelineRun[]): {
  running: number; success: number; failed: number; queued: number;
} {
  const out = { running: 0, success: 0, failed: 0, queued: 0 };
  for (const r of runs) {
    if (r.status === 'running' || r.status === 'success' || r.status === 'failed' || r.status === 'queued') {
      out[r.status] += 1;
    }
  }
  return out;
}

const statusDot: React.CSSProperties = { width: 6, height: 6, borderRadius: '50%' };
const chipStripStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', flexWrap: 'wrap', gap: 6,
};
const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--theme-bg-elevated)',
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
};
const failureFooterStyle: React.CSSProperties = {
  marginTop: 'auto',
  paddingTop: 6,
  borderTop: '1px solid var(--theme-border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

/** Short relative start time. Exported for testing. */
export function formatStarted(iso: string, nowMs: number = Date.now()): string {
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function PipelineStatusSettings({ value, onChange }: WidgetSettingsFormProps<PipelineStatusContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="checkbox" checked={settings.showFailedOnly} onChange={(e) => onChange({ ...settings, showFailedOnly: e.target.checked })} />
      <span style={{ fontSize: '0.875rem' }}>Failed runs only</span>
    </label>
  );
}

defineWidget<PipelineStatusContent>({
  id: 'pipeline-status',
  label: 'Pipeline Status',
  description: 'Research pipeline runs at a glance.',
  category: 'research',
  iconName: 'Workflow',
  defaultSize: { w: 3, h: 3 },
  // Slice 217 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'researcher', 'tech_support'],
  Widget: PipelineStatusWidget,
  SettingsForm: PipelineStatusSettings,
});

export function pipelineColor(status: PipelineRun['status']): string {
  switch (status) {
    case 'success': return 'var(--theme-success)';
    case 'running': return 'var(--theme-accent)';
    case 'failed': return 'var(--theme-danger)';
    case 'queued': return 'var(--theme-fg-muted)';
  }
}
