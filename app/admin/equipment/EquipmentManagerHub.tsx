'use client';

// app/admin/equipment/EquipmentManagerHub.tsx
//
// E6 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md — a command center at the top
// of the Equipment landing for the day-to-day equipment manager: big quick
// actions + at-a-glance counts (out now / low stock / vehicles needing
// attention), each linking straight to where the work happens. The full route
// card grid (WorkspaceLanding) still renders below it.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RouteIcon } from '@/lib/admin/route-icons';

interface Counts { outNow: number | null; lowStock: number | null; vehiclesAttention: number | null; }

export default function EquipmentManagerHub(): React.ReactElement {
  const [c, setC] = useState<Counts>({ outNow: null, lowStock: null, vehiclesAttention: null });

  useEffect(() => {
    let cancelled = false;
    async function n<T>(url: string, pick: (j: unknown) => T): Promise<T | null> {
      try { const r = await fetch(url); if (!r.ok) return null; return pick(await r.json()); } catch { return null; }
    }
    void (async () => {
      const [outNow, lowStock, vehiclesAttention] = await Promise.all([
        n('/api/admin/equipment/assignments?state=open', (j) => ((j as { assignments?: unknown[] }).assignments ?? []).length),
        n('/api/admin/equipment/consumables', (j) => ((j as { rows?: { reorder_badge?: string }[] }).rows ?? []).filter((r) => r.reorder_badge === 'reorder_now').length),
        n('/api/admin/vehicles', (j) => ((j as { vehicles?: { condition?: string }[] }).vehicles ?? []).filter((v) => v.condition === 'poor' || v.condition === 'out_of_service').length),
      ]);
      if (!cancelled) setC({ outNow, lowStock, vehiclesAttention });
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={S.wrap}>
      <div style={S.actions}>
        <Link href="/admin/equipment/checked-out" style={{ ...S.action, ...S.actionPrimary }}>
          <RouteIcon name="ArrowLeftRight" size={18} /> Check out / in
        </Link>
        <Link href="/admin/equipment/inventory" style={S.action}>
          <RouteIcon name="Package" size={18} /> Add / edit equipment
        </Link>
        <Link href="/admin/equipment/consumables" style={S.action}>
          <RouteIcon name="Boxes" size={18} /> Supplies & usage
        </Link>
        <Link href="/admin/equipment/maintenance" style={S.action}>
          <RouteIcon name="Wrench" size={18} /> Maintenance
        </Link>
        <Link href="/admin/vehicles" style={S.action}>
          <RouteIcon name="Truck" size={18} /> Vehicles
        </Link>
      </div>

      <div style={S.stats}>
        <StatCard href="/admin/equipment/checked-out" label="Checked out now" value={c.outNow} tone="#1D3095" />
        <StatCard href="/admin/equipment/consumables" label="Supplies to reorder" value={c.lowStock} tone={c.lowStock ? '#B42318' : '#1B7A3D'} />
        <StatCard href="/admin/vehicles" label="Vehicles needing attention" value={c.vehiclesAttention} tone={c.vehiclesAttention ? '#B45309' : '#1B7A3D'} />
      </div>
    </div>
  );
}

function StatCard({ href, label, value, tone }: { href: string; label: string; value: number | null; tone: string }) {
  return (
    <Link href={href} style={S.stat}>
      <span style={{ ...S.statValue, color: tone }}>{value == null ? '—' : value}</span>
      <span style={S.statLabel}>{label}</span>
    </Link>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1100, margin: '0 auto 0.5rem', padding: '0 1rem' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.85rem' },
  action: { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.6rem 1rem', borderRadius: 10, border: '1px solid var(--theme-border, #d6d9e3)', background: 'var(--theme-bg-surface, #fff)', color: 'var(--theme-fg-primary, #152050)', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none' },
  actionPrimary: { background: '#1D3095', color: '#fff', border: '1px solid #1D3095' },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' },
  stat: { display: 'flex', flexDirection: 'column', gap: '0.15rem', padding: '1rem 1.1rem', borderRadius: 12, border: '1px solid var(--theme-border, #e4e7ee)', background: 'var(--theme-bg-surface, #fff)', textDecoration: 'none' },
  statValue: { fontSize: '1.8rem', fontWeight: 700, lineHeight: 1, fontFamily: "'Sora', 'Inter', sans-serif" },
  statLabel: { fontSize: '0.82rem', color: 'var(--theme-fg-muted, #6b7280)' },
};
