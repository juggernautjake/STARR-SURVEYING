'use client';
// lib/hub/widgets/crew-calendar/index.tsx
// Slice 121 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export type CrewWeekRange = 'this-week' | 'next-week' | 'two-weeks';

export interface CrewCalendarContent extends Record<string, unknown> {
  employeeFilter: string;
  weekRange: CrewWeekRange;
}

const DEFAULTS: CrewCalendarContent = { employeeFilter: '', weekRange: 'this-week' };

interface CrewCell {
  user_email: string;
  user_name?: string | null;
  day: string;
  status: 'available' | 'assigned' | 'off' | 'pto';
  job_name?: string | null;
}

function CrewCalendarWidget({ size, content }: WidgetProps<CrewCalendarContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [cells, setCells] = useState<CrewCell[]>([]);

  const fetchCalendar = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams({ range: settings.weekRange });
      if (settings.employeeFilter) params.set('employee', settings.employeeFilter);
      const res = await fetch(`/api/admin/personnel/crew-calendar?${params}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { cells?: CrewCell[] } = await res.json();
      const list = data.cells ?? [];
      setCells(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.employeeFilter, settings.weekRange]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  const employees = useMemo(() => Array.from(new Set(cells.map((c) => c.user_email))).slice(0, capForBucket(bucket)), [cells, bucket]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="📅" title="No crew scheduled" description="Open crew calendar to assign shifts." />;

  return (
    <ul role="list" style={listStyle}>
      {employees.map((email) => {
        const cellsForEmployee = cells.filter((c) => c.user_email === email);
        const name = cellsForEmployee[0]?.user_name ?? email;
        return (
          <li key={email} style={rowStyle}>
            <span style={nameStyle}>{name}</span>
            <span style={{ display: 'inline-flex', gap: 2 }}>
              {cellsForEmployee.slice(0, bucket === 'tiny' ? 3 : 7).map((c) => (
                <span key={c.day} title={`${c.day}: ${c.status}`} style={statusDot(c.status)} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CrewCalendarSettings({ value, onChange }: WidgetSettingsFormProps<CrewCalendarContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Week range</span>
        <select value={settings.weekRange} onChange={(e) => onChange({ ...settings, weekRange: e.target.value as CrewWeekRange })}>
          <option value="this-week">This week</option>
          <option value="next-week">Next week</option>
          <option value="two-weeks">Next 2 weeks</option>
        </select>
      </label>
      <label>
        <span style={labelStyle}>Filter to employee (email)</span>
        <input
          type="email"
          value={settings.employeeFilter}
          placeholder="leave blank for all"
          onChange={(e) => onChange({ ...settings, employeeFilter: e.target.value })}
        />
      </label>
    </div>
  );
}

defineWidget<CrewCalendarContent>({
  id: 'crew-calendar',
  label: 'Crew Calendar',
  description: 'Multi-employee schedule at a glance.',
  category: 'operational',
  iconName: 'CalendarDays',
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support', 'equipment_manager'],
  Widget: CrewCalendarWidget,
  SettingsForm: CrewCalendarSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 2;
    case 'small':  return 4;
    case 'medium': return 6;
    case 'large':  return 10;
    case 'xlarge': return 20;
  }
}

export function statusDot(status: CrewCell['status']): React.CSSProperties {
  const color =
    status === 'assigned'  ? 'var(--theme-accent)'  :
    status === 'available' ? 'var(--theme-success)' :
    status === 'pto'       ? 'var(--theme-warning)' :
                             'var(--theme-fg-muted)';
  return { display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: color };
}

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' };
const nameStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };
