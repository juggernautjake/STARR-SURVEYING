'use client'
// EquipConflictDialog — Area E1c. When equipping an item conflicts with what's already equipped (and the
// campaign's equipLimits are enforced), this popup explains the conflict and offers the owner's resolution:
// Cancel, or a clear per-conflict swap. It computes, for each conflict, whether unequipping THAT one item
// alone resolves it (dual-wield: free one hand) — those become individual "Unequip X & equip" choices; when
// no single removal is enough (a two-handed weapon over a sword + shield) it offers one "Unequip both & equip"
// action. Every path leaves a rules-legal equipped set.
import { equipConflicts, type EquipConflict, type EquipConflictItem } from '@/lib/dnd/equip-conflicts'

export interface EquipConflictState {
  target: EquipConflictItem
  conflicts: EquipConflict[]
}

export default function EquipConflictDialog({
  state,
  inventory,
  onResolve,
  onCancel,
}: {
  state: EquipConflictState
  inventory: EquipConflictItem[]
  /** Apply the chosen swap: unequip these ids, then equip the target. */
  onResolve: (unequipIds: string[]) => void
  onCancel: () => void
}) {
  const { target, conflicts } = state
  const targetName = (target.name && target.name.trim()) || 'this item'

  // A conflict is a valid SINGLE swap if unequipping just IT (target still not equipped) leaves nothing else
  // blocking the target — i.e. one removal is enough (dual-wield). We must NOT equip the target for this test,
  // since equipConflicts no-ops on an already-equipped target.
  const withoutConflict = (cid: string): EquipConflictItem[] =>
    inventory.map((it) => (it.id === cid ? { ...it, equipped: false } : it))
  const singleSwaps = conflicts.filter((c) => equipConflicts(withoutConflict(c.id), target.id).length === 0)
  const allIds = conflicts.map((c) => c.id)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Equip ${targetName}`}
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 16 }}
      onClick={onCancel}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line-strong)', borderRadius: 14, padding: '18px 18px 16px', boxShadow: '0 24px 70px -20px rgba(0,0,0,0.85)' }}
      >
        <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', color: 'var(--ink)', fontSize: 17 }}>
          Equip {targetName}?
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          This conflicts with what you already have equipped:
        </p>
        <ul style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {conflicts.map((c) => (
            <li key={c.id} style={{ fontSize: 12.5, color: 'var(--ink)', borderLeft: '2px solid var(--line-strong)', paddingLeft: 8 }}>
              {c.reason}
            </li>
          ))}
        </ul>

        <div style={{ display: 'grid', gap: 8 }}>
          {singleSwaps.length > 0 ? (
            // Each single-item swap that resolves the conflict — the owner's "swap for the sword / the shield".
            singleSwaps.map((c) => (
              <button key={c.id} className="btn solid" onClick={() => onResolve([c.id])} style={{ textAlign: 'left' }}>
                Unequip {c.name} &amp; equip {targetName}
              </button>
            ))
          ) : (
            // No single removal is enough (a two-handed weapon needs both hands) — clear them all.
            <button className="btn solid" onClick={() => onResolve(allIds)} style={{ textAlign: 'left' }}>
              Unequip {conflicts.map((c) => c.name).join(' & ')} &amp; equip {targetName}
            </button>
          )}
          <button className="btn ghost" onClick={onCancel}>
            Cancel — leave {targetName} unequipped
          </button>
        </div>
      </div>
    </div>
  )
}
