'use client';
// lib/hub/widgets/field-pulse/index.tsx
//
// Slice W9e (hub-cad-roles-polish-2026-06-18) — consolidated
// field-pulse widget. Absorbs:
//   - team-status        — who's clocked in
//   - vehicles-status    — active fleet
//   - equipment-out      — gear checked out today
//   - low-consumables    — items at / below reorder
//
// Each legacy widget reads its own endpoint with no overlap:
//   - /api/admin/team/status                → { members[] }
//   - /api/admin/vehicles                   → { vehicles[] }
//   - /api/admin/equipment/today            → { strips: { out_now[] } }
//   - /api/admin/equipment/consumables      → { rows[] }
//
// The consolidated tile fans out four parallel reads with a local
// `readOrSkip` helper that treats 401 / 403 as quiet "no data"
// (W5 / W8 / W9a / W9b / W9c / W9d pattern). Renders size-relative
// content:
//   tiny    — aggregate count across all four sources
//   small   — Team column only (most actionable)
//   medium  — Team + Equipment-out (2-col)
//   large   — 4-tile grid (2x2)
//   xlarge  — 4-tile grid with row lists under each tile
//
// Legacy widgets stay registered so saved hub layouts keep
// rendering their team-status / vehicles-status / equipment-out /
// low-consumables tiles until users replace them.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetError from '@/lib/hub/components/WidgetError';

interface TeamMember {
  user_email: string;
  user_name?: string | null;
  status: 'clocked-in' | 'on-break' | 'clocked-out';
}
interface RawVehicle { id: string; name?: string | null; license_plate?: string | null; active?: boolean | null }
interface VehicleRow { id: string; name: string; active: boolean }
interface RawOutNow { id?: string; equipment_id?: string; equipment_name?: string | null; checked_out_to?: string | null }
interface EquipmentRow { id: string; name: string; checked_out_to: string | null }
interface RawConsumable {
  id: string; name?: string | null;
  current_qty?: number | null; reorder_threshold?: number | null;
  reorder_badge?: string | null;
}
interface ConsumableRow { id: string; name: string; currentQty: number; threshold: number }

interface FieldPulseContent extends Record<string, unknown> {
  showOpenLink: boolean;
}
const DEFAULTS: FieldPulseContent = { showOpenLink: true };

interface FetchState {
  status: 'loading' | 'ok' | 'empty' | 'error';
  errorMessage: string;
  team: TeamMember[];
  vehicles: VehicleRow[];
  equipment: EquipmentRow[];
  consumables: ConsumableRow[];
}

function FieldPulseWidget({ size, content }: WidgetProps<FieldPulseContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [state, setState] = useState<FetchState>({
    status: 'loading',
    errorMessage: '',
    team: [],
    vehicles: [],
    equipment: [],
    consumables: [],
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const [teamRes, vehiclesRes, equipmentRes, consumablesRes] = await Promise.all([
        fetch('/api/admin/team/status').catch(() => null),
        fetch('/api/admin/vehicles').catch(() => null),
        fetch('/api/admin/equipment/today').catch(() => null),
        fetch('/api/admin/equipment/consumables').catch(() => null),
      ]);

      function readOrSkip(res: Response | null): Promise<unknown | null> | null {
        if (!res) return Promise.resolve(null);
        if (res.status === 401 || res.status === 403) return Promise.resolve(null);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }

      const teamData = await readOrSkip(teamRes) as { members?: TeamMember[] } | null;
      const vehiclesData = await readOrSkip(vehiclesRes) as { vehicles?: RawVehicle[] } | null;
      const equipmentData = await readOrSkip(equipmentRes) as { strips?: { out_now?: RawOutNow[] } } | null;
      const consumablesData = await readOrSkip(consumablesRes) as { rows?: RawConsumable[] } | null;

      const team = (teamData?.members ?? []).filter((m) => m.status === 'clocked-in' || m.status === 'on-break');
      const vehicles: VehicleRow[] = (vehiclesData?.vehicles ?? [])
        .filter((v) => v.active !== false)
        .map((v) => ({ id: v.id, name: v.name ?? 'Vehicle', active: true }));
      const equipment: EquipmentRow[] = (equipmentData?.strips?.out_now ?? []).map((r) => ({
        id: r.id ?? r.equipment_id ?? '',
        name: r.equipment_name ?? 'Item',
        checked_out_to: r.checked_out_to ?? null,
      }));
      const consumables: ConsumableRow[] = (consumablesData?.rows ?? [])
        .map((r) => ({
          id: r.id,
          name: r.name ?? 'Item',
          currentQty: typeof r.current_qty === 'number' ? r.current_qty : 0,
          threshold: typeof r.reorder_threshold === 'number' ? r.reorder_threshold : 0,
        }))
        .filter((r) => isLowConsumable(r));

      const hasAny =
        team.length > 0
        || vehicles.length > 0
        || equipment.length > 0
        || consumables.length > 0;

      setState({
        status: hasAny ? 'ok' : 'empty',
        errorMessage: '',
        team,
        vehicles,
        equipment,
        consumables,
      });
    } catch (err) {
      setState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        team: [],
        vehicles: [],
        equipment: [],
        consumables: [],
      });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (state.status === 'loading') return <WidgetSkeleton rows={3} />;
  if (state.status === 'error') {
    return <WidgetError message={`Couldn't load field data (${state.errorMessage}).`} onRetry={refresh} />;
  }
  if (state.status === 'empty') {
    return <WidgetEmpty icon="🛠️" title="Field is quiet" description="No team, vehicles, equipment, or consumables to surface right now." />;
  }

  const pulseTotal = totalFieldPulseCount({
    team: state.team.length,
    vehicles: state.vehicles.length,
    equipment: state.equipment.length,
    consumables: state.consumables.length,
  });

  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle} data-testid="field-pulse-tiny">
        <span style={tinyCountStyle}>{pulseTotal}</span>
        <span style={tinyLabelStyle}>field signals</span>
      </div>
    );
  }

  if (bucket === 'small') {
    return (
      <div style={columnStyle} data-testid="field-pulse-small">
        <TeamTile members={state.team} showList showOpenLink={settings.showOpenLink} />
      </div>
    );
  }

  if (bucket === 'medium') {
    return (
      <div style={twoColStyle} data-testid="field-pulse-medium">
        <TeamTile members={state.team} showList={false} showOpenLink={settings.showOpenLink} />
        <EquipmentTile rows={state.equipment} showList={false} showOpenLink={settings.showOpenLink} />
      </div>
    );
  }

  // large + xlarge — 2x2 grid; xlarge shows row lists too.
  const showLists = bucket === 'xlarge';
  return (
    <div style={fourTileStyle} data-testid={`field-pulse-${bucket}`}>
      <TeamTile members={state.team} showList={showLists} showOpenLink={settings.showOpenLink} />
      <VehiclesTile rows={state.vehicles} showList={showLists} showOpenLink={settings.showOpenLink} />
      <EquipmentTile rows={state.equipment} showList={showLists} showOpenLink={settings.showOpenLink} />
      <ConsumablesTile rows={state.consumables} showList={showLists} showOpenLink={settings.showOpenLink} />
    </div>
  );
}

// ─── Tiles ────────────────────────────────────────────────────────────

function TeamTile({ members, showList, showOpenLink }: {
  members: TeamMember[]; showList: boolean; showOpenLink: boolean;
}) {
  return (
    <section style={tileStyle}>
      <Header label="Team" href="/admin/team" showOpenLink={showOpenLink} />
      <Stat value={members.length} unit={members.length === 1 ? 'on shift' : 'on shift'} accent="primary" />
      {showList && members.length > 0 && (
        <ul style={listStyle}>
          {members.slice(0, 6).map((m) => (
            <li key={m.user_email} style={rowStyle}>
              <span style={rowTitleStyle}>{m.user_name ?? m.user_email}</span>
              <span style={rowMetaStyle}>{m.status === 'on-break' ? 'On break' : 'On shift'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VehiclesTile({ rows, showList, showOpenLink }: {
  rows: VehicleRow[]; showList: boolean; showOpenLink: boolean;
}) {
  return (
    <section style={tileStyle}>
      <Header label="Vehicles" href="/admin/equipment/vehicles" showOpenLink={showOpenLink} />
      <Stat value={rows.length} unit={rows.length === 1 ? 'active' : 'active'} accent="primary" />
      {showList && rows.length > 0 && (
        <ul style={listStyle}>
          {rows.slice(0, 6).map((v) => (
            <li key={v.id} style={rowStyle}>
              <span style={rowTitleStyle}>{v.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EquipmentTile({ rows, showList, showOpenLink }: {
  rows: EquipmentRow[]; showList: boolean; showOpenLink: boolean;
}) {
  return (
    <section style={tileStyle}>
      <Header label="Equipment" href="/admin/equipment" showOpenLink={showOpenLink} />
      <Stat value={rows.length} unit={rows.length === 1 ? 'checked out' : 'checked out'} accent="warning" />
      {showList && rows.length > 0 && (
        <ul style={listStyle}>
          {rows.slice(0, 6).map((e) => (
            <li key={e.id} style={rowStyle}>
              <span style={rowTitleStyle}>{e.name}</span>
              {e.checked_out_to && <span style={rowMetaStyle}>{e.checked_out_to}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConsumablesTile({ rows, showList, showOpenLink }: {
  rows: ConsumableRow[]; showList: boolean; showOpenLink: boolean;
}) {
  return (
    <section style={tileStyle}>
      <Header label="Consumables" href="/admin/equipment/consumables" showOpenLink={showOpenLink} />
      <Stat value={rows.length} unit={rows.length === 1 ? 'low item' : 'low items'} accent="danger" />
      {showList && rows.length > 0 && (
        <ul style={listStyle}>
          {rows.slice(0, 6).map((c) => (
            <li key={c.id} style={rowStyle}>
              <span style={rowTitleStyle}>{c.name}</span>
              <span style={rowMetaStyle}>{c.currentQty}/{c.threshold}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Header({ label, href, showOpenLink }: {
  label: string; href: string; showOpenLink: boolean;
}) {
  return (
    <header style={sectionHeaderStyle}>
      <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{label}</span>
      {showOpenLink && <a href={href} style={openLinkStyle}>Open →</a>}
    </header>
  );
}

function Stat({ value, unit, accent }: { value: number; unit: string; accent: 'primary' | 'warning' | 'danger' }) {
  const color = accent === 'danger'
    ? 'var(--theme-danger)'
    : accent === 'warning'
      ? 'var(--theme-warning)'
      : 'var(--theme-fg-primary)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ ...metricStyle, color }}>{value}</span>
      <span style={metricLabelStyle}>{unit}</span>
    </div>
  );
}

// ─── Pure helpers (exported for tests) ─────────────────────────────────

/** Aggregate count across the four field-pulse sources. Pure + exported. */
export function totalFieldPulseCount(parts: {
  team: number; vehicles: number; equipment: number; consumables: number;
}): number {
  return Math.max(0, parts.team)
    + Math.max(0, parts.vehicles)
    + Math.max(0, parts.equipment)
    + Math.max(0, parts.consumables);
}

/** Pick a layout variant from a SizeBucket. Pure + exported. */
export function fieldPulseLayoutForBucket(bucket: SizeBucket): 'tiny' | 'small' | 'medium' | 'four' {
  if (bucket === 'tiny') return 'tiny';
  if (bucket === 'small') return 'small';
  if (bucket === 'medium') return 'medium';
  return 'four';
}

/** Match the low-consumables widget threshold rule (qty ≤ threshold).
 *  Pure + exported. */
export function isLowConsumable(item: { currentQty: number; threshold: number }): boolean {
  if (!Number.isFinite(item.threshold) || item.threshold <= 0) return false;
  return item.currentQty <= item.threshold;
}

// ─── Style fragments ───────────────────────────────────────────────────

const tinyWrapStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  height: '100%', gap: 2,
};
const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.4rem, 3vw, 2.2rem)', fontWeight: 700, lineHeight: 1,
  color: 'var(--theme-fg-primary)',
};
const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const columnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0,
};
const twoColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const fourTileStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
  gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const tileStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0,
};
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1px solid var(--theme-border)', paddingBottom: 4,
};
const openLinkStyle: React.CSSProperties = {
  fontSize: '0.7rem', color: 'var(--theme-accent, #3b82f6)', textDecoration: 'none',
};
const metricStyle: React.CSSProperties = {
  fontSize: '1.25rem', fontWeight: 700,
};
const metricLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase', letterSpacing: 0.4,
};
const listStyle: React.CSSProperties = {
  listStyle: 'none', margin: '4px 0 0', padding: 0,
  display: 'flex', flexDirection: 'column', gap: 4,
  overflow: 'auto', minHeight: 0,
};
const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', gap: 8,
  padding: '2px 0',
};
const rowTitleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.82rem)', color: 'var(--theme-fg-primary)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const rowMetaStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
  whiteSpace: 'nowrap',
};

defineWidget<FieldPulseContent>({
  id: 'field-pulse',
  label: 'Field Pulse',
  description: 'Team, vehicles, equipment, and consumables — one heartbeat.',
  category: 'operational',
  iconName: 'Activity',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: FieldPulseWidget,
});
