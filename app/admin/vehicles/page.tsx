// app/admin/vehicles/page.tsx — Fleet management
//
// Add / edit / archive vehicles. The list is the source-of-truth for
// the mobile vehicle picker on clock-in (F6 #vehicle-picker), which
// populates `job_time_entries.vehicle_id` for IRS mileage attribution.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface VehicleRow {
  id: string;
  name: string;
  license_plate: string | null;
  vin: string | null;
  active: boolean;
  condition: string | null;
  odometer_miles: number | null;
  last_inspected_at: string | null;
  condition_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const CONDITION_META: Record<string, { label: string; bg: string }> = {
  excellent: { label: 'Excellent', bg: '#10B981' },
  good: { label: 'Good', bg: '#22C55E' },
  fair: { label: 'Fair', bg: '#F59E0B' },
  poor: { label: 'Poor', bg: '#EF4444' },
  out_of_service: { label: 'Out of service', bg: '#7F1D1D' },
};

interface ListResponse {
  vehicles: VehicleRow[];
}

interface FormState {
  id: string | null;
  name: string;
  license_plate: string;
  vin: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  license_plate: '',
  vin: '',
};

export default function VehiclesPage() {
  const { data: session } = useSession();

  const [data, setData] = useState<VehicleRow[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [conditionTarget, setConditionTarget] = useState<VehicleRow | null>(null);

  const fetchList = useCallback(async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    setError('');
    try {
      const params = includeInactive ? '?include_inactive=1' : '';
      const res = await fetch(`/api/admin/vehicles${params}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
      }
      setData((json as ListResponse).vehicles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [session, includeInactive]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const method = form.id ? 'PUT' : 'POST';
      const res = await fetch('/api/admin/vehicles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(form.id ? { id: form.id } : {}),
          name: form.name.trim(),
          license_plate: form.license_plate.trim() || null,
          vin: form.vin.trim() || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Save failed (HTTP ${res.status})`);
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      await fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [form, fetchList]);

  const onArchive = useCallback(
    async (v: VehicleRow) => {
      if (
        !confirm(
          `Archive ${v.name}? It will disappear from the mobile picker. Historical time entries keep the link.`
        )
      ) {
        return;
      }
      setBusyId(v.id);
      try {
        const res = await fetch(`/api/admin/vehicles?id=${v.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
        }
        await fetchList();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      } finally {
        setBusyId(null);
      }
    },
    [fetchList]
  );

  const onReactivate = useCallback(
    async (v: VehicleRow) => {
      setBusyId(v.id);
      try {
        const res = await fetch('/api/admin/vehicles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: v.id, active: true }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
        }
        await fetchList();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      } finally {
        setBusyId(null);
      }
    },
    [fetchList]
  );

  const onEdit = (v: VehicleRow) => {
    setForm({
      id: v.id,
      name: v.name,
      license_plate: v.license_plate ?? '',
      vin: v.vin ?? '',
    });
    setShowForm(true);
  };

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>Vehicles</h1>
          <p style={styles.subtitle}>
            Fleet roster — drives the mobile vehicle picker on clock-in
            (F6 #vehicle-picker) and the per-vehicle IRS mileage
            attribution. Archive a row to hide it from the mobile
            picker without losing historical time-entry links.
          </p>
        </div>
        <button
          type="button"
          style={styles.primaryBtn}
          onClick={() => {
            setForm(EMPTY_FORM);
            setShowForm(true);
          }}
        >
          + Add vehicle
        </button>
      </header>

      <div style={styles.controls}>
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          <span>Show archived</span>
        </label>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {showForm ? (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>
            {form.id ? 'Edit vehicle' : 'Add vehicle'}
          </h3>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              style={styles.input}
              placeholder="Truck 3 / Big Red / Henry's F-150"
              maxLength={80}
              autoFocus
            />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>License plate</span>
            <input
              type="text"
              value={form.license_plate}
              onChange={(e) =>
                setForm((f) => ({ ...f, license_plate: e.target.value }))
              }
              style={styles.input}
              placeholder="ABC-1234"
              maxLength={20}
            />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>VIN (optional)</span>
            <input
              type="text"
              value={form.vin}
              onChange={(e) =>
                setForm((f) => ({ ...f, vin: e.target.value }))
              }
              style={styles.input}
              placeholder="1FTFW1ET5DFB12345"
              maxLength={32}
            />
          </label>
          <div style={styles.formActions}>
            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              style={styles.primaryBtn}
              onClick={() => void onSave()}
              disabled={saving || !form.name.trim()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}

      {loading && data.length === 0 ? (
        <div style={styles.empty}>Loading…</div>
      ) : data.length === 0 ? (
        <div style={styles.empty}>
          No vehicles yet. Tap “+ Add vehicle” to seed the fleet so
          surveyors can pick one on clock-in.
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Plate</th>
              <th style={styles.th}>VIN</th>
              <th style={styles.th}>Condition</th>
              <th style={styles.th}>Odometer</th>
              <th style={styles.th}>Status</th>
              <th style={styles.thRight}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((v) => (
              <tr key={v.id}>
                <td style={styles.td}>{v.name}</td>
                <td style={styles.td}>{v.license_plate ?? '—'}</td>
                <td style={styles.tdMono}>{v.vin ?? '—'}</td>
                <td style={styles.td}>
                  {v.condition ? (
                    <span
                      style={{ ...styles.statusBadge, background: CONDITION_META[v.condition]?.bg ?? '#9CA3AF' }}
                      title={v.last_inspected_at ? `Inspected ${new Date(v.last_inspected_at).toLocaleDateString()}` : undefined}
                    >
                      {CONDITION_META[v.condition]?.label ?? v.condition}
                    </span>
                  ) : (
                    <span style={{ color: '#9CA3AF' }}>Not logged</span>
                  )}
                </td>
                <td style={styles.td}>{v.odometer_miles != null ? `${v.odometer_miles.toLocaleString()} mi` : '—'}</td>
                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.statusBadge,
                      background: v.active ? '#10B981' : '#9CA3AF',
                    }}
                  >
                    {v.active ? 'Active' : 'Archived'}
                  </span>
                </td>
                <td style={styles.tdRight}>
                  <button
                    type="button"
                    style={styles.linkBtn}
                    onClick={() => setConditionTarget(v)}
                    disabled={busyId === v.id}
                    data-testid={`condition-${v.id}`}
                  >
                    Condition
                  </button>
                  <button
                    type="button"
                    style={styles.linkBtn}
                    onClick={() => onEdit(v)}
                    disabled={busyId === v.id}
                  >
                    Edit
                  </button>
                  {v.active ? (
                    <button
                      type="button"
                      style={styles.linkBtnDanger}
                      onClick={() => void onArchive(v)}
                      disabled={busyId === v.id}
                    >
                      Archive
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={styles.linkBtn}
                      onClick={() => void onReactivate(v)}
                      disabled={busyId === v.id}
                    >
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {conditionTarget ? (
        <ConditionModal
          vehicle={conditionTarget}
          onClose={() => setConditionTarget(null)}
          onSaved={() => { setConditionTarget(null); void fetchList(); }}
        />
      ) : null}
    </div>
  );
}

function ConditionModal({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: VehicleRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [condition, setCondition] = useState(vehicle.condition ?? 'good');
  const [odometer, setOdometer] = useState(vehicle.odometer_miles != null ? String(vehicle.odometer_miles) : '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setBusy(true);
    const body: Record<string, unknown> = { vehicle_id: vehicle.id, condition, notes: notes || undefined };
    const odo = parseInt(odometer, 10);
    if (Number.isFinite(odo) && odo >= 0) body.odometer_miles = odo;
    const res = await fetch('/api/admin/vehicles/condition', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Save failed.'); return; }
    onSaved();
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Log condition — ${vehicle.name}`}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Log condition — {vehicle.name}</h3>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Condition</span>
          <select value={condition} onChange={(e) => setCondition(e.target.value)} style={styles.input} data-testid="condition-select">
            {Object.entries(CONDITION_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Odometer (miles)</span>
          <input type="number" min={0} value={odometer} onChange={(e) => setOdometer(e.target.value)} style={styles.input} placeholder="e.g. 84210" />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Notes (optional)</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={styles.input} placeholder="e.g. new tires, check engine light on" />
        </label>
        {err ? <div style={styles.error}>{err}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" style={styles.linkBtn} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" style={styles.primaryBtn} onClick={submit} disabled={busy} data-testid="condition-submit">
            {busy ? 'Saving…' : 'Save condition'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' },
  wrap: {
    padding: '24px',
    maxWidth: 1100,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  h1: {
    fontSize: 22,
    fontWeight: 600,
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    margin: 0,
    maxWidth: 720,
    lineHeight: 1.5,
  },
  primaryBtn: {
    background: 'var(--color-brand-navy)',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  secondaryBtn: {
    background: 'transparent',
    color: 'var(--color-brand-navy)',
    border: '1px solid var(--color-brand-navy)',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  controls: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
  },
  checkboxRow: {
    display: 'inline-flex',
    gap: 8,
    alignItems: 'center',
    fontSize: 13,
    color: '#4B5563',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  error: {
    background: '#FEF2F2',
    border: '1px solid #B42318',
    color: '#B42318',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
    background: '#F7F8FA',
    borderRadius: 8,
  },
  formCard: {
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    background: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    fontSize: 14,
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#FFFFFF',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '10px 16px',
    color: '#6B7280',
    fontWeight: 500,
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  thRight: {
    textAlign: 'right',
    padding: '10px 16px',
    color: '#6B7280',
    fontWeight: 500,
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  td: {
    padding: '10px 16px',
    borderBottom: '1px solid #F3F4F6',
  },
  tdMono: {
    padding: '10px 16px',
    borderBottom: '1px solid #F3F4F6',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  tdRight: {
    padding: '10px 16px',
    borderBottom: '1px solid #F3F4F6',
    textAlign: 'right',
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
  },
  statusBadge: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
  },
  linkBtn: {
    background: 'transparent',
    color: 'var(--color-brand-navy)',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  },
  linkBtnDanger: {
    background: 'transparent',
    color: '#B42318',
    border: '1px solid #FCA5A5',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  },
};
