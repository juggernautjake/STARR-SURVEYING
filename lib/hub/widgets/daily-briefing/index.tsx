'use client';
// Slice 145 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';

export interface DailyBriefingContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: DailyBriefingContent = {};

function DailyBriefingWidget({ size }: WidgetProps<DailyBriefingContent>) {
  const bucket = sizeBucket(size.w, size.h);
  if (bucket === 'tiny' || bucket === 'small') {
    return <WidgetEmpty icon="📋" title="Resize me larger" description="The Daily Briefing composite needs medium+ space." />;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--hub-spc-3, 12px)' }}>
      <Section title="Today" subtitle="Schedule + assignments" icon="🗓" />
      <Section title="Weather" subtitle="Forecast for your job site" icon="☁️" />
      <Section title="Crew" subtitle="Who's on the clock" icon="👥" />
      <Section title="Action items" subtitle="Tasks due today" icon="✅" />
    </div>
  );
}

function Section({ title, subtitle, icon }: { title: string; subtitle: string; icon: string }) {
  return (
    <div style={{ padding: 'var(--hub-spc-3, 12px)', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
      <span aria-hidden style={{ fontSize: '1.25rem' }}>{icon}</span>
      <h4 style={{ margin: '4px 0 2px', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600 }}>{title}</h4>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{subtitle}</span>
    </div>
  );
}

defineWidget<DailyBriefingContent>({
  id: 'daily-briefing',
  label: 'Daily Briefing',
  description: 'A composite of schedule + weather + crew + tasks.',
  category: 'personal',
  iconName: 'LayoutGrid',
  defaultSize: { w: 12, h: 3 },
  minSize: { w: 6, h: 2 },
  maxSize: { w: 12, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: DailyBriefingWidget,
});
