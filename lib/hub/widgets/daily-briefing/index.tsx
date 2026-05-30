'use client';
// Slice 145 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';

// Slice 15c — wired to the Slice-12 schema fields:
//   - showWeather  toggles the Weather sub-section
//   - showSchedule toggles the Today (schedule) sub-section
//   - maxJobs      caps the "Up to N jobs" hint inside the Today section
import { resolveBool, resolveBoundedInt } from '@/lib/hub/widgets/_shared/content-resolvers';

export interface DailyBriefingContent extends Record<string, unknown> {
  showWeather?: boolean;
  showSchedule?: boolean;
  maxJobs?: number;
}
const DEFAULTS: DailyBriefingContent = { showWeather: true, showSchedule: true, maxJobs: 3 };

export const resolveShowWeather  = (c: DailyBriefingContent): boolean      => resolveBool(c.showWeather,  true);
export const resolveShowSchedule = (c: DailyBriefingContent): boolean      => resolveBool(c.showSchedule, true);
export const resolveMaxJobs      = (c: DailyBriefingContent): number       =>
  resolveBoundedInt(c.maxJobs, 1, 10, 3) ?? 3;

function DailyBriefingWidget({ size, content }: WidgetProps<DailyBriefingContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const showWeather  = resolveShowWeather(content);
  const showSchedule = resolveShowSchedule(content);
  const maxJobs      = resolveMaxJobs(content);
  if (bucket === 'tiny' || bucket === 'small') {
    return <WidgetEmpty icon="📋" title="Resize me larger" description="The Daily Briefing composite needs medium+ space." />;
  }
  // Crew + Action items are always-on (they don't have toggles in the
  // Slice-12 schema). Weather + Schedule (Today) are gated by their
  // toggles. The Today subtitle echoes the maxJobs hint so the
  // surveyor sees the cap reflected even though real schedule data
  // hasn't landed yet.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--hub-spc-3, 12px)' }}>
      {showSchedule && (
        <Section title="Today" subtitle={`Schedule + assignments · up to ${maxJobs} jobs`} icon="🗓" />
      )}
      {showWeather && (
        <Section title="Weather" subtitle="Forecast for your job site" icon="☁️" />
      )}
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
  defaultSize: { w: 8, h: 3 },
  minSize: { w: 4, h: 2 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: DailyBriefingWidget,
});
