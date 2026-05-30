'use client';
// Slice 145 of customizable-hub-and-work-mode-2026-05-28.md.
// hub-widget-excellence-15 — the four sections are now LIVE: each fetches
// the SAME endpoint its standalone widget uses (schedule / weather /
// team-status / assignments — no new endpoints, per the doc guardrail),
// condenses it through the pure summarizers, and carries its own
// "Go to …" deep link. Sections fetch independently so one failure
// doesn't blank the others.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import { resolveBool, resolveBoundedInt } from '@/lib/hub/widgets/_shared/content-resolvers';
import {
  summarizeSchedule,
  summarizeWeather,
  summarizeCrew,
  summarizeActions,
  todayRange,
  type SectionSummary,
} from './sections';

export interface DailyBriefingContent extends Record<string, unknown> {
  showWeather?: boolean;
  showSchedule?: boolean;
  maxJobs?: number;
}
const DEFAULTS: DailyBriefingContent = { showWeather: true, showSchedule: true, maxJobs: 3 };

export const resolveShowWeather  = (c: DailyBriefingContent): boolean => resolveBool(c.showWeather,  true);
export const resolveShowSchedule = (c: DailyBriefingContent): boolean => resolveBool(c.showSchedule, true);
export const resolveMaxJobs      = (c: DailyBriefingContent): number  => resolveBoundedInt(c.maxJobs, 1, 10, 3) ?? 3;

/** How many sections render at a given size — medium shows 2, large /
 *  xlarge show all four (tiny/small short-circuit to "resize me"). */
export function sectionCap(bucket: SizeBucket): number {
  return bucket === 'medium' ? 2 : 4;
}

// ── Section loaders. Each hits the SAME endpoint the standalone widget
//    uses and degrades to an empty summary on failure.
async function loadWeather(): Promise<SectionSummary> {
  try {
    const res = await fetch('/api/admin/weather');
    if (!res.ok) return summarizeWeather(null);
    return summarizeWeather(await res.json());
  } catch { return summarizeWeather(null); }
}
async function loadCrew(): Promise<SectionSummary> {
  try {
    const res = await fetch('/api/admin/team/status');
    if (!res.ok) return summarizeCrew([]);
    const data = await res.json();
    return summarizeCrew(data.members ?? []);
  } catch { return summarizeCrew([]); }
}
async function loadActions(): Promise<SectionSummary> {
  try {
    const res = await fetch('/api/admin/assignments?mine=true');
    if (!res.ok) return summarizeActions([]);
    const data = await res.json();
    return summarizeActions(data.assignments ?? []);
  } catch { return summarizeActions([]); }
}
async function loadSchedule(maxJobs: number): Promise<SectionSummary> {
  try {
    const { from, to } = todayRange(new Date());
    const res = await fetch(`/api/admin/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) return summarizeSchedule([], maxJobs);
    const data = await res.json();
    return summarizeSchedule(data.events ?? [], maxJobs);
  } catch { return summarizeSchedule([], maxJobs); }
}

function DailyBriefingWidget({ size, content }: WidgetProps<DailyBriefingContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const showWeather  = resolveShowWeather(content);
  const showSchedule = resolveShowSchedule(content);
  const maxJobs      = resolveMaxJobs(content);

  // Stable schedule loader (re-created only when maxJobs changes).
  const scheduleLoader = useCallback(() => loadSchedule(maxJobs), [maxJobs]);

  if (bucket === 'tiny' || bucket === 'small') {
    return <WidgetEmpty icon="📋" title="Resize me larger" description="The Daily Briefing composite needs medium+ space." />;
  }

  // Ordered, toggle-filtered section descriptors, then capped by size.
  const candidates: Array<SectionDescriptor | null> = [
    showSchedule ? { key: 'schedule', icon: '🗓', title: 'Today', load: scheduleLoader, goTo: '/admin/schedule', goToLabel: 'Schedule' } : null,
    showWeather  ? { key: 'weather',  icon: '☁️', title: 'Weather', load: loadWeather } : null,
    { key: 'crew',    icon: '👥', title: 'Crew', load: loadCrew, goTo: '/admin/team', goToLabel: 'Team' },
    { key: 'actions', icon: '✅', title: 'Action items', load: loadActions, goTo: '/admin/assignments', goToLabel: 'Assignments' },
  ];
  const all: SectionDescriptor[] = candidates.filter((s): s is SectionDescriptor => s !== null);

  const visible = all.slice(0, sectionCap(bucket));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--hub-spc-3, 12px)' }}>
      {visible.map((s) => (
        <BriefingSection key={s.key} descriptor={s} />
      ))}
    </div>
  );
}

interface SectionDescriptor {
  key: string;
  icon: string;
  title: string;
  load: () => Promise<SectionSummary>;
  goTo?: string;
  goToLabel?: string;
}

function BriefingSection({ descriptor }: { descriptor: SectionDescriptor }) {
  const { icon, title, load, goTo, goToLabel } = descriptor;
  const [summary, setSummary] = useState<SectionSummary | null>(null);

  useEffect(() => {
    let alive = true;
    load().then((s) => { if (alive) setSummary(s); }).catch(() => { if (alive) setSummary({ headline: '—', detail: '' }); });
    return () => { alive = false; };
  }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: 'var(--hub-spc-3, 12px)', borderRadius: 6, background: 'var(--theme-bg-elevated)', minWidth: 0 }}>
      <span aria-hidden style={{ fontSize: '1.25rem' }}>{icon}</span>
      <h4 style={{ margin: '4px 0 2px', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600 }}>{title}</h4>
      <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)' }}>
        {summary ? summary.headline : 'Loading…'}
      </span>
      {summary?.detail && (
        <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary.detail}
        </span>
      )}
      {goTo && (
        <Link href={goTo} style={{ marginTop: 'auto', paddingTop: 6, fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-accent)', textDecoration: 'none' }}>
          {goToLabel ?? 'Go to'} →
        </Link>
      )}
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
