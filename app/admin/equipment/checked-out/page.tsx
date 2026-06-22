'use client';

// app/admin/equipment/checked-out/page.tsx
//
// E3 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md — the equipment manager's
// check-in / check-out hub. One place to:
//   - Check an available item OUT to a crew member, vehicle, maintenance, or
//     other (with condition + expected-back + notes).
//   - See everything that's OUT right now and check it back IN (condition,
//     consumable usage, notes) in one click.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ASSIGNED_KINDS, CHECKOUT_CONDITIONS, RETURN_CONDITIONS,
  assignmentTargetLabel, type AssignedKind,
} from '@/lib/equipment/assignment';

interface Assignment {
  id: string;
  equipment_id: string;
  assigned_kind: string;
  assigned_label: string | null;
  assigned_user_name: string | null;
  checked_out_at: string;
  checkout_condition: string | null;
  expected_back_at: string | null;
  equipment?: { name: string | null; category: string | null; item_kind: string | null; unit: string | null } | null;
  vehicle?: { name: string | null } | null;
}
interface AvailItem { id: string; name: string | null; category: string | null; item_kind: string | null; }
interface Vehicle { id: string; name: string; }
interface Employee { id: string; name: string | null; email: string; }

const KIND_LABEL: Record<string, string> = { crew: 'Crew member', vehicle: 'Vehicle', maintenance: 'Maintenance', other: 'Other' };

export default function CheckedOutPage(): React.ReactElement {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState<Assignment | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/equipment/assignments?state=open');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setAssignments((j.assignments ?? []) as Assignment[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main style={styles.page} data-testid="equipment-checked-out">
      <div style={styles.header}>
        <div>
          <h1 style={styles.h1}>Check In / Out</h1>
          <p style={styles.lede}>Lend equipment to a crew, vehicle, or maintenance — and bring it back.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/admin/equipment/inventory" style={styles.btnGhost}>All equipment</Link>
          <button type="button" style={styles.btn} onClick={() => setShowCheckOut(true)} data-testid="open-checkout">
            + Check out equipment
          </button>
        </div>
      </div>

      {error && <p style={styles.error} role="alert">Couldn&rsquo;t load: {error}</p>}
      {assignments === null && !error && <p>Loading…</p>}

      {assignments !== null && assignments.length === 0 && (
        <div style={styles.empty} data-testid="checked-out-empty">
          Nothing is checked out right now. Use &ldquo;Check out equipment&rdquo; to lend something.
        </div>
      )}

      {assignments && assignments.length > 0 && (
        <div style={styles.card}>
          <div style={{ ...styles.row, ...styles.rowHead }}>
            <span>Item</span><span>Checked out to</span><span>Since</span><span>Condition out</span><span>Due back</span><span />
          </div>
          {assignments.map((a) => (
            <div key={a.id} style={styles.row} data-testid={`assignment-${a.equipment_id}`}>
              <span style={{ fontWeight: 600 }}>{a.equipment?.name ?? '—'}</span>
              <span>
                {KIND_LABEL[a.assigned_kind] ?? a.assigned_kind}
                <span style={{ display: 'block', fontSize: '0.8rem', color: '#6B7280' }}>
                  {assignmentTargetLabel({ assigned_kind: a.assigned_kind, assigned_label: a.assigned_label, assigned_user_name: a.assigned_user_name, assigned_vehicle_name: a.vehicle?.name })}
                </span>
              </span>
              <span>{new Date(a.checked_out_at).toLocaleString()}</span>
              <span style={{ textTransform: 'capitalize' }}>{a.checkout_condition ?? '—'}</span>
              <span style={a.expected_back_at && new Date(a.expected_back_at) < new Date() ? { color: '#B42318', fontWeight: 600 } : undefined}>
                {a.expected_back_at ? new Date(a.expected_back_at).toLocaleDateString() : '—'}
              </span>
              <span>
                <button type="button" style={styles.btnSm} onClick={() => setCheckInTarget(a)} data-testid={`checkin-${a.equipment_id}`}>
                  Check in
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {showCheckOut && (
        <CheckOutModal onClose={() => setShowCheckOut(false)} onDone={() => { setShowCheckOut(false); void load(); }} />
      )}
      {checkInTarget && (
        <CheckInModal assignment={checkInTarget} onClose={() => setCheckInTarget(null)} onDone={() => { setCheckInTarget(null); void load(); }} />
      )}
    </main>
  );
}

// ── Check-out modal ─────────────────────────────────────────────────────────
function CheckOutModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [items, setItems] = useState<AvailItem[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [equipmentId, setEquipmentId] = useState('');
  const [kind, setKind] = useState<AssignedKind>('crew');
  const [userId, setUserId] = useState('');   // team lead (crew)
  const [label, setLabel] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [condition, setCondition] = useState('good');
  const [expectedBack, setExpectedBack] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/admin/equipment?status=available&limit=500').then((r) => r.json()).then((j) => setItems((j.items ?? []) as AvailItem[])).catch(() => {});
    void fetch('/api/admin/vehicles').then((r) => r.json()).then((j) => setVehicles((j.vehicles ?? []) as Vehicle[])).catch(() => {});
    void fetch('/api/admin/employees/options').then((r) => r.json()).then((j) => setEmployees((j.employees ?? []) as Employee[])).catch(() => {});
  }, []);

  const selectedItem = useMemo(() => items.find((i) => i.id === equipmentId), [items, equipmentId]);

  async function submit() {
    setErr(null);
    if (!equipmentId) { setErr('Pick an item to check out.'); return; }
    if (kind === 'crew' && !userId) { setErr('Pick the team lead to check out with.'); return; }
    setBusy(true);
    const body: Record<string, unknown> = {
      assigned_kind: kind,
      condition,
      notes: notes || undefined,
      expected_back_at: expectedBack ? new Date(expectedBack).toISOString() : undefined,
    };
    if (kind === 'vehicle') body.assigned_vehicle_id = vehicleId || undefined;
    if (kind === 'crew') { body.assigned_user_id = userId; body.assigned_label = label || undefined; } // label = optional team name
    if (kind === 'maintenance' || kind === 'other') body.assigned_label = label || undefined;
    const res = await fetch(`/api/admin/equipment/${equipmentId}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Check-out failed.'); return; }
    onDone();
  }

  return (
    <Modal title="Check out equipment" onClose={onClose}>
      <label style={styles.field}>
        <span>Item</span>
        <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} style={styles.input} data-testid="checkout-item">
          <option value="">Select available equipment…</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.category ? ` · ${i.category}` : ''}</option>)}
        </select>
      </label>

      <label style={styles.field}>
        <span>Check out to</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as AssignedKind)} style={styles.input} data-testid="checkout-kind">
          {ASSIGNED_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>

      {kind === 'vehicle' && (
        <label style={styles.field}>
          <span>Vehicle</span>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={styles.input}>
            <option value="">Select vehicle…</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      )}

      {kind === 'crew' && (
        <>
          <label style={styles.field}>
            <span>Team lead (checked out with)</span>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} style={styles.input} data-testid="checkout-lead">
              <option value="">Select the team lead…</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name || emp.email}</option>)}
            </select>
          </label>
          <label style={styles.field}>
            <span>Team name / note (optional)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} style={styles.input} placeholder="e.g. Crew B (Andy + 2)" />
          </label>
        </>
      )}

      {(kind === 'maintenance' || kind === 'other') && (
        <label style={styles.field}>
          <span>{kind === 'maintenance' ? 'Vendor / reason (optional)' : 'Label'}</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} style={styles.input} placeholder={kind === 'maintenance' ? 'e.g. NIST calibration' : 'e.g. County loaner'} />
        </label>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <label style={{ ...styles.field, flex: 1 }}>
          <span>Condition going out</span>
          <select value={condition} onChange={(e) => setCondition(e.target.value)} style={styles.input}>
            {CHECKOUT_CONDITIONS.map((c) => <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>)}
          </select>
        </label>
        <label style={{ ...styles.field, flex: 1 }}>
          <span>Expected back (optional)</span>
          <input type="date" value={expectedBack} onChange={(e) => setExpectedBack(e.target.value)} style={styles.input} />
        </label>
      </div>

      <label style={styles.field}>
        <span>Notes (optional)</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={styles.input} />
      </label>

      {selectedItem?.item_kind === 'consumable' && (
        <p style={styles.hint}>Tip: record how many units get used when you check this back in.</p>
      )}
      {err && <p style={styles.error} role="alert">{err}</p>}
      <div style={styles.actions}>
        <button type="button" style={styles.btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" style={styles.btn} onClick={submit} disabled={busy} data-testid="checkout-submit">
          {busy ? 'Checking out…' : 'Check out'}
        </button>
      </div>
    </Modal>
  );
}

// ── Check-in modal ──────────────────────────────────────────────────────────
function CheckInModal({ assignment, onClose, onDone }: { assignment: Assignment; onClose: () => void; onDone: () => void }) {
  const isConsumable = assignment.equipment?.item_kind === 'consumable';
  const [condition, setCondition] = useState('good');
  const [consumed, setConsumed] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setBusy(true);
    const body: Record<string, unknown> = { condition, notes: notes || undefined };
    if (isConsumable && consumed) body.consumed_quantity = Number(consumed);
    const res = await fetch(`/api/admin/equipment/${assignment.equipment_id}/return`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Check-in failed.'); return; }
    onDone();
  }

  return (
    <Modal title={`Check in — ${assignment.equipment?.name ?? 'item'}`} onClose={onClose}>
      <label style={styles.field}>
        <span>Condition coming back</span>
        <select value={condition} onChange={(e) => setCondition(e.target.value)} style={styles.input} data-testid="checkin-condition">
          {RETURN_CONDITIONS.map((c) => <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>)}
        </select>
      </label>
      {(condition === 'damaged' || condition === 'lost') && (
        <p style={styles.hint}>This will route the item to maintenance{condition === 'lost' ? '/lost' : ''} and open a triage event.</p>
      )}
      {isConsumable && (
        <label style={styles.field}>
          <span>Units used {assignment.equipment?.unit ? `(${assignment.equipment.unit})` : ''}</span>
          <input type="number" min={0} value={consumed} onChange={(e) => setConsumed(e.target.value)} style={styles.input} placeholder="0" data-testid="checkin-consumed" />
        </label>
      )}
      <label style={styles.field}>
        <span>Notes (optional)</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={styles.input} />
      </label>
      {err && <p style={styles.error} role="alert">{err}</p>}
      <div style={styles.actions}>
        <button type="button" style={styles.btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" style={styles.btn} onClick={submit} disabled={busy} data-testid="checkin-submit">
          {busy ? 'Checking in…' : 'Check in'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <h2 style={styles.modalTitle}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: "'Inter', sans-serif", background: '#f4f5f9', minHeight: '100vh', padding: '1.5rem 1rem 4rem', color: '#152050' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', maxWidth: 1100, margin: '0 auto 1rem' },
  h1: { fontFamily: "'Sora', 'Inter', sans-serif", fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  lede: { color: '#4a5470', margin: '0.25rem 0 0' },
  card: { maxWidth: 1100, margin: '0 auto', background: '#fff', border: '1px solid #e4e7ee', borderRadius: 12, overflow: 'hidden' },
  row: { display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1.2fr 1fr 1fr 0.8fr', gap: '0.75rem', alignItems: 'center', padding: '0.7rem 1rem', borderBottom: '1px solid #eef0f4' },
  rowHead: { fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', background: '#fafbfd' },
  empty: { maxWidth: 1100, margin: '0 auto', padding: '2.5rem', textAlign: 'center', color: '#6b7280', background: '#fff', border: '1px solid #e4e7ee', borderRadius: 12 },
  error: { color: '#B42318', background: '#FDECEC', padding: '0.6rem 0.8rem', borderRadius: 8, maxWidth: 1100, margin: '0.75rem auto' },
  hint: { fontSize: '0.83rem', color: '#6b7280', margin: '0 0 0.5rem' },
  btn: { fontWeight: 700, padding: '0.6rem 1.1rem', background: '#1D3095', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
  btnGhost: { fontWeight: 600, padding: '0.6rem 1.1rem', background: 'transparent', color: '#1D3095', border: '1px solid #1D3095', borderRadius: 9, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
  btnSm: { fontWeight: 600, padding: '0.35rem 0.8rem', background: '#1D3095', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.82rem' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(21,32,80,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: '#fff', borderRadius: 14, padding: '1.5rem', width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(21,32,80,0.2)' },
  modalTitle: { fontFamily: "'Sora', sans-serif", fontSize: '1.15rem', margin: '0 0 1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', color: '#4a5470', marginBottom: '0.75rem' },
  input: { font: 'inherit', padding: '0.5rem 0.7rem', border: '1px solid #d6d9e3', borderRadius: 8, color: '#152050' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' },
};
