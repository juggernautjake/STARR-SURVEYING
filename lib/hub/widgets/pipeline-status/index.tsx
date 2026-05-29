'use client';
// Slice 131 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

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
  if (status === 'empty') return <WidgetEmpty icon="🔁" title="Pipelines quiet" description="Recent runs appear here." />;

  const cap = bucket === 'tiny' ? 2 : bucket === 'small' ? 4 : bucket === 'medium' ? 6 : bucket === 'large' ? 12 : 24;
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {runs.slice(0, cap).map((r) => (
        <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
          <span aria-label={r.status} style={{ width: 8, height: 8, borderRadius: 8, background: pipelineColor(r.status) }} />
          <span style={{ flex: 1, fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{r.name}</span>
          <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{r.status}</span>
        </li>
      ))}
    </ul>
  );
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
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 8, h: 6 },
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
