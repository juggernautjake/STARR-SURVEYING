'use client';
// lib/hub/widgets/team-status/index.tsx
//
// Team Status widget. Shows who's currently clocked in.
// Slice 118 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps, type WidgetSkeletonProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { teamMemberHref } from '@/lib/hub/widgets/_shared/widget-links';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import { SkeletonBlock } from '@/lib/hub/components/WidgetSkeleton';

export type TeamGroupBy = 'role' | 'shift' | 'none';

export interface TeamStatusContent extends Record<string, unknown> {
  groupBy: TeamGroupBy;
}

const DEFAULTS: TeamStatusContent = { groupBy: 'none' };

interface TeamMember {
  user_email: string;
  user_name?: string | null;
  role?: string | null;
  shift?: string | null;
  status: 'clocked-in' | 'on-break' | 'clocked-out';
  since?: string | null;
}

function TeamStatusWidget({ size, content }: WidgetProps<TeamStatusContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [members, setMembers] = useState<TeamMember[]>([]);

  const fetchTeam = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/team/status');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { members?: TeamMember[] } = await res.json();
      const list = (data.members ?? []).filter((m) => m.status === 'clocked-in' || m.status === 'on-break');
      setMembers(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, []);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  if (status === 'loading') return <TeamStatusSkeleton size={size} content={settings} />;
  if (status === 'empty') {
    // Slice 210 — tiny mode shows the zero-count badge so the cell
    // doesn't display the full empty-state illustration.
    if (bucket === 'tiny') {
      return (
        <div style={tinyWrapStyle}>
          <span style={tinyCountStyle}>0</span>
          <span style={tinyLabelStyle}>clocked in</span>
        </div>
      );
    }
    return <WidgetEmpty icon="👥" title="No one's clocked in" description="Team members appear here as they start their day." />;
  }

  // Slice 210 — tiny mode: counter only, no row list (a name + role
  // doesn't fit in a 1×1/2×1 cell).
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle}>
        <span style={tinyCountStyle}>{members.length}</span>
        <span style={tinyLabelStyle}>clocked in</span>
      </div>
    );
  }

  const visible = members.slice(0, capForBucket(bucket));

  if (settings.groupBy !== 'none') {
    const grouped = groupMembers(visible, settings.groupBy);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
        {Array.from(grouped.entries()).map(([key, group]) => (
          <section key={key}>
            <h4 style={sectionTitleStyle}>{key}</h4>
            <ul role="list" style={listStyle}>
              {group.map((m) => <MemberRow key={m.user_email} member={m} />)}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <ul role="list" style={listStyle}>
      {visible.map((m) => <MemberRow key={m.user_email} member={m} />)}
    </ul>
  );
}

function MemberRow({ member }: { member: TeamMember }) {
  const color = member.status === 'clocked-in' ? 'var(--theme-success)' : 'var(--theme-warning)';
  return (
    <li>
      {/* Row deep link → the teammate's profile. */}
      <Link href={teamMemberHref(member.user_email)} style={rowStyle} aria-label={`Open ${member.user_name ?? member.user_email}`}>
        <span aria-label={member.status} style={{ width: 8, height: 8, borderRadius: 8, background: color, flexShrink: 0 }} />
        <span style={nameStyle}>{member.user_name ?? member.user_email}</span>
        {member.role && (
          <span style={mutedStyle}>{member.role}</span>
        )}
      </Link>
    </li>
  );
}

function TeamStatusSettings({ value, onChange }: WidgetSettingsFormProps<TeamStatusContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={labelStyle}>Group by</span>
      <select value={settings.groupBy} onChange={(e) => onChange({ ...settings, groupBy: e.target.value as TeamGroupBy })}>
        <option value="none">No grouping</option>
        <option value="role">Role</option>
        <option value="shift">Shift</option>
      </select>
    </label>
  );
}

/** Slice 204 — custom skeleton matching the actual member-row
 *  layout: status dot + name + role chip. Falls back to the same
 *  `capForBucket` cap the live widget uses so the loading preview
 *  shows roughly the same number of rows that will appear. */
export function TeamStatusSkeleton({ size }: WidgetSkeletonProps<TeamStatusContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const rows = Math.min(capForBucket(bucket), 5);
  return (
    <ul
      role="status"
      aria-label="Loading team status"
      style={listStyle}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} style={rowStyle}>
          <SkeletonBlock width={8} height={8} borderRadius={8} />
          <SkeletonBlock width="50%" height={13} style={{ flex: 1 }} />
          <SkeletonBlock width={48} height={11} />
        </li>
      ))}
    </ul>
  );
}

defineWidget<TeamStatusContent>({
  id: 'team-status',
  label: 'Team Status',
  description: "Who's clocked in right now.",
  category: 'operational',
  iconName: 'Users',
  defaultSize: { w: 3, h: 3 },
  // Slice 210 — minSize lowered to 1×1 now that we have a proper
  // tiny-bucket render (just a clocked-in counter).
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support', 'equipment_manager'],
  Widget: TeamStatusWidget,
  SettingsForm: TeamStatusSettings,
  Skeleton: TeamStatusSkeleton,
});

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 3;
    case 'small':  return 6;
    case 'medium': return 10;
    case 'large':  return 18;
    case 'xlarge': return 30;
  }
}

export function groupMembers(members: TeamMember[], by: Exclude<TeamGroupBy, 'none'>): Map<string, TeamMember[]> {
  const out = new Map<string, TeamMember[]>();
  for (const m of members) {
    const key = by === 'role' ? (m.role ?? 'No role') : (m.shift ?? 'No shift');
    const bucket = out.get(key) ?? [];
    bucket.push(m);
    out.set(key, bucket);
  }
  return out;
}

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)', textDecoration: 'none', color: 'inherit' };
const nameStyle: React.CSSProperties = { flex: 1, fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const mutedStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' };
const sectionTitleStyle: React.CSSProperties = { margin: 0, marginBottom: 6, fontSize: 'var(--hub-font-xs, 0.75rem)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--theme-fg-secondary)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };

// Slice 210 — tiny-bucket layout.
const tinyWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 2,
};
const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
  fontWeight: 700,
  lineHeight: 1,
  color: 'var(--theme-success)',
};
const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};
