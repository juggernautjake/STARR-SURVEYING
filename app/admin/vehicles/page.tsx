// app/admin/vehicles/page.tsx — Fleet management
//
// Add / edit / archive vehicles. The list is the source-of-truth for
// the mobile vehicle picker on clock-in (F6 #vehicle-picker), which
// populates `job_time_entries.vehicle_id` for IRS mileage attribution.
//
// vehicle-details-and-photos-2026-06-22 — extended every surface to
// capture the full vehicle record the user asked for: make / model /
// year, status (ok / maintenance_due / in_repair / damaged /
// out_of_service), free-text issue notes, and a photo gallery with
// upload + primary-photo selection.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

const STATUS_OPTIONS = [
  { value: 'ok',              label: 'OK / In service',     tint: '#10B981' },
  { value: 'maintenance_due', label: 'Needs maintenance',   tint: '#F59E0B' },
  { value: 'in_repair',       label: 'In repair',           tint: '#3B82F6' },
  { value: 'damaged',         label: 'Damaged',             tint: '#EF4444' },
  { value: 'out_of_service',  label: 'Out of service',      tint: '#6B7280' },
] as const;
type VehicleStatus = (typeof STATUS_OPTIONS)[number]['value'];
const STATUS_LABEL: Record<VehicleStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
) as Record<VehicleStatus, string>;
const STATUS_TINT: Record<VehicleStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.tint]),
) as Record<VehicleStatus, string>;

interface VehicleRow {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  model_year: number | null;
  license_plate: string | null;
  vin: string | null;
  status: VehicleStatus;
  issue_notes: string | null;
  primary_photo_path: string | null;
  primary_photo_url: string | null;
  photo_count: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface VehiclePhoto {
  id: string;
  vehicle_id: string;
  photo_path: string;
  caption: string | null;
  signed_url: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

interface ListResponse {
  vehicles: VehicleRow[];
}

interface FormState {
  id: string | null;
  name: string;
  make: string;
  model: string;
  model_year: string;
  license_plate: string;
  vin: string;
  status: VehicleStatus;
  issue_notes: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  make: '',
  model: '',
  model_year: '',
  license_plate: '',
  vin: '',
  status: 'ok',
  issue_notes: '',
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, VehiclePhoto[]>>({});
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);

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

  const fetchPhotos = useCallback(async (vehicleId: string) => {
    try {
      const res = await fetch(`/api/admin/vehicles/${vehicleId}/photos`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
      setPhotos((prev) => ({ ...prev, [vehicleId]: (json?.photos ?? []) as VehiclePhoto[] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photos');
    }
  }, []);

  const toggleExpanded = useCallback((vehicleId: string) => {
    setExpandedId((prev) => {
      const next = prev === vehicleId ? null : vehicleId;
      if (next && !photos[next]) void fetchPhotos(next);
      return next;
    });
  }, [fetchPhotos, photos]);

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
          make: form.make.trim() || null,
          model: form.model.trim() || null,
          model_year: form.model_year ? Number(form.model_year) : null,
          license_plate: form.license_plate.trim() || null,
          vin: form.vin.trim() || null,
          status: form.status,
          issue_notes: form.issue_notes.trim() || null,
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

  const onQuickStatus = useCallback(
    async (v: VehicleRow, status: VehicleStatus) => {
      setBusyId(v.id);
      try {
        const res = await fetch('/api/admin/vehicles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: v.id, status }),
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

  const onUploadPhoto = useCallback(
    async (vehicleId: string, file: File, makePrimary: boolean) => {
      if (file.size > 12 * 1024 * 1024) {
        setError('Photo is over 12 MB. Pick something smaller.');
        return;
      }
      setPhotoBusy(vehicleId);
      try {
        const fd = new FormData();
        fd.append('file', file);
        if (makePrimary) fd.append('make_primary', '1');
        const res = await fetch(`/api/admin/vehicles/${vehicleId}/photos`, {
          method: 'POST',
          body: fd,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? `Upload failed (HTTP ${res.status})`);
        await Promise.all([fetchPhotos(vehicleId), fetchList()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Photo upload failed');
      } finally {
        setPhotoBusy(null);
      }
    },
    [fetchList, fetchPhotos],
  );

  const onDeletePhoto = useCallback(
    async (vehicleId: string, photoId: string) => {
      if (!confirm('Delete this photo? This cannot be undone.')) return;
      setPhotoBusy(photoId);
      try {
        const res = await fetch(
          `/api/admin/vehicles/${vehicleId}/photos?photoId=${photoId}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
        }
        await Promise.all([fetchPhotos(vehicleId), fetchList()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Photo delete failed');
      } finally {
        setPhotoBusy(null);
      }
    },
    [fetchList, fetchPhotos],
  );

  const onMakePrimary = useCallback(
    async (vehicleId: string, photoPath: string) => {
      setPhotoBusy(photoPath);
      try {
        const res = await fetch('/api/admin/vehicles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: vehicleId, primary_photo_path: photoPath }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error ?? `Failed (HTTP ${res.status})`);
        }
        await fetchList();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed');
      } finally {
        setPhotoBusy(null);
      }
    },
    [fetchList],
  );

  const onEdit = (v: VehicleRow) => {
    setForm({
      id: v.id,
      name: v.name,
      make: v.make ?? '',
      model: v.model ?? '',
      model_year: v.model_year ? String(v.model_year) : '',
      license_plate: v.license_plate ?? '',
      vin: v.vin ?? '',
      status: v.status,
      issue_notes: v.issue_notes ?? '',
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
            and the per-vehicle IRS mileage attribution. Track make /
            model / year, mark damage or maintenance status, attach
            photos, and write notes for whoever picks up the truck next.
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
          <div style={styles.formGrid}>
            <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
              <span style={styles.fieldLabel}>Display name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={styles.input}
                placeholder="Truck 3 / Big Red / Henry's F-150"
                maxLength={80}
                autoFocus
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Make</span>
              <input
                type="text"
                value={form.make}
                onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))}
                style={styles.input}
                placeholder="Ford"
                maxLength={40}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Model</span>
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                style={styles.input}
                placeholder="F-150 SuperCrew"
                maxLength={60}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Year</span>
              <input
                type="number"
                value={form.model_year}
                onChange={(e) => setForm((f) => ({ ...f, model_year: e.target.value }))}
                style={styles.input}
                placeholder="2022"
                min={1900}
                max={2100}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>License plate</span>
              <input
                type="text"
                value={form.license_plate}
                onChange={(e) => setForm((f) => ({ ...f, license_plate: e.target.value }))}
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
                onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value }))}
                style={styles.input}
                placeholder="1FTFW1ET5DFB12345"
                maxLength={32}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as VehicleStatus }))}
                style={styles.input}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
              <span style={styles.fieldLabel}>Issue notes</span>
              <textarea
                value={form.issue_notes}
                onChange={(e) => setForm((f) => ({ ...f, issue_notes: e.target.value }))}
                style={{ ...styles.input, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Cracked windshield, oil change due, dent on tailgate…"
                maxLength={2000}
                rows={4}
              />
              <span style={styles.hint}>
                Visible to anyone who opens the vehicle row. Update as things get fixed.
              </span>
            </label>
          </div>
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
          No vehicles yet. Tap &ldquo;+ Add vehicle&rdquo; to seed the fleet so
          surveyors can pick one on clock-in.
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {data.map((v) => {
            const tint = STATUS_TINT[v.status] ?? '#6B7280';
            const isExpanded = expandedId === v.id;
            const vPhotos = photos[v.id] ?? [];
            return (
              <article key={v.id} style={{ ...styles.card, opacity: v.active ? 1 : 0.65 }}>
                <div style={styles.cardThumbWrap}>
                  {v.primary_photo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={v.primary_photo_url} alt={`${v.name} photo`} style={styles.cardThumb} />
                  ) : (
                    <div style={styles.cardThumbPlaceholder} aria-hidden>
                      <span style={{ fontSize: 32 }}>🚚</span>
                    </div>
                  )}
                  <span style={{ ...styles.statusPill, background: tint }}>
                    {STATUS_LABEL[v.status]}
                  </span>
                  {!v.active && (
                    <span style={{ ...styles.statusPill, ...styles.archivedPill }}>Archived</span>
                  )}
                </div>
                <div style={styles.cardBody}>
                  <h3 style={styles.cardTitle}>{v.name}</h3>
                  <p style={styles.cardSubtitle}>
                    {[v.model_year, v.make, v.model].filter(Boolean).join(' ') || '—'}
                  </p>
                  <dl style={styles.metaList}>
                    <div style={styles.metaRow}>
                      <dt style={styles.metaKey}>Plate</dt>
                      <dd style={styles.metaVal}>{v.license_plate ?? '—'}</dd>
                    </div>
                    <div style={styles.metaRow}>
                      <dt style={styles.metaKey}>VIN</dt>
                      <dd style={styles.metaValMono}>{v.vin ?? '—'}</dd>
                    </div>
                    <div style={styles.metaRow}>
                      <dt style={styles.metaKey}>Photos</dt>
                      <dd style={styles.metaVal}>{v.photo_count ?? 0}</dd>
                    </div>
                  </dl>
                  {v.issue_notes && (
                    <div style={styles.notesBox}>
                      <span style={styles.notesLabel}>Issue notes</span>
                      <p style={styles.notesBody}>{v.issue_notes}</p>
                    </div>
                  )}

                  <div style={styles.quickStatusRow}>
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => void onQuickStatus(v, s.value)}
                        disabled={busyId === v.id || v.status === s.value}
                        style={{
                          ...styles.statusChip,
                          borderColor: v.status === s.value ? s.tint : '#E2E5EB',
                          background: v.status === s.value ? `${s.tint}1A` : 'transparent',
                          color: v.status === s.value ? s.tint : '#4B5563',
                          fontWeight: v.status === s.value ? 600 : 500,
                          cursor: v.status === s.value ? 'default' : 'pointer',
                        }}
                        title={`Mark as ${s.label}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div style={styles.cardActions}>
                    <button
                      type="button"
                      style={styles.linkBtn}
                      onClick={() => onEdit(v)}
                      disabled={busyId === v.id}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      style={styles.linkBtn}
                      onClick={() => toggleExpanded(v.id)}
                    >
                      {isExpanded ? 'Hide photos' : `Photos (${v.photo_count ?? 0})`}
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
                  </div>

                  {isExpanded && (
                    <PhotoGallery
                      vehicleId={v.id}
                      primaryPath={v.primary_photo_path}
                      photos={vPhotos}
                      onUpload={(file, makePrimary) => void onUploadPhoto(v.id, file, makePrimary)}
                      onDelete={(photoId) => void onDeletePhoto(v.id, photoId)}
                      onMakePrimary={(path) => void onMakePrimary(v.id, path)}
                      busyKey={photoBusy}
                    />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PhotoGallery({
  vehicleId,
  primaryPath,
  photos,
  onUpload,
  onDelete,
  onMakePrimary,
  busyKey,
}: {
  vehicleId: string;
  primaryPath: string | null;
  photos: VehiclePhoto[];
  onUpload: (file: File, makePrimary: boolean) => void;
  onDelete: (photoId: string) => void;
  onMakePrimary: (photoPath: string) => void;
  busyKey: string | null;
}) {
  return (
    <div style={styles.galleryWrap}>
      <div style={styles.uploadRow}>
        <label style={styles.uploadBtn}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={styles.hiddenFile}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f, photos.length === 0);
              e.target.value = '';
            }}
          />
          📷 Take / upload photo
        </label>
        <span style={styles.hint}>
          On a phone, the camera opens directly. Up to 12 MB per image.
        </span>
      </div>
      {photos.length === 0 ? (
        <p style={styles.galleryEmpty}>No photos yet for this vehicle.</p>
      ) : (
        <div style={styles.galleryGrid}>
          {photos.map((p) => {
            const isPrimary = p.photo_path === primaryPath;
            return (
              <div key={p.id} style={styles.galleryItem}>
                {p.signed_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.signed_url} alt={p.caption ?? `Vehicle ${vehicleId} photo`} style={styles.galleryImg} />
                ) : (
                  <div style={styles.galleryImg} aria-hidden />
                )}
                {isPrimary && (
                  <span style={styles.primaryBadge}>★ Primary</span>
                )}
                <div style={styles.galleryActions}>
                  {!isPrimary && (
                    <button
                      type="button"
                      style={styles.galleryActionBtn}
                      onClick={() => onMakePrimary(p.photo_path)}
                      disabled={busyKey === p.photo_path}
                      title="Use this photo as the card thumbnail"
                    >
                      ★ Make primary
                    </button>
                  )}
                  <button
                    type="button"
                    style={{ ...styles.galleryActionBtn, color: '#B42318' }}
                    onClick={() => onDelete(p.id)}
                    disabled={busyKey === p.id}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '24px',
    maxWidth: 1200,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
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
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
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
  hint: {
    fontSize: 11,
    color: '#6B7280',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 16,
  },
  card: {
    border: '1px solid #E2E5EB',
    borderRadius: 14,
    background: '#FFFFFF',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
  },
  cardThumbWrap: {
    position: 'relative',
    background: '#F3F4F6',
    aspectRatio: '16 / 10',
    overflow: 'hidden',
  },
  cardThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  cardThumbPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9CA3AF',
  },
  statusPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    padding: '4px 10px',
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 600,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
  },
  archivedPill: {
    top: 10,
    left: 'auto',
    right: 10,
    background: '#6B7280',
  },
  cardBody: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
  },
  cardSubtitle: {
    margin: 0,
    fontSize: 13,
    color: '#6B7280',
  },
  metaList: {
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaKey: {
    margin: 0,
    color: '#6B7280',
    fontWeight: 500,
  },
  metaVal: {
    margin: 0,
    color: '#1F2937',
  },
  metaValMono: {
    margin: 0,
    color: '#1F2937',
    fontFamily: 'SF Mono, Menlo, monospace',
    fontSize: 11,
  },
  notesBox: {
    background: '#FFFBEB',
    border: '1px solid #FCD34D',
    borderRadius: 8,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesBody: {
    margin: 0,
    fontSize: 13,
    color: '#78350F',
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
  },
  quickStatusRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusChip: {
    padding: '4px 10px',
    borderRadius: 9999,
    border: '1px solid #E2E5EB',
    fontSize: 11,
    cursor: 'pointer',
  },
  cardActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 6,
    borderTop: '1px solid #F1F5F9',
    marginTop: 2,
  },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-brand-navy)',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 13,
    fontWeight: 500,
  },
  linkBtnDanger: {
    background: 'transparent',
    border: 'none',
    color: '#B42318',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 13,
    fontWeight: 500,
  },
  galleryWrap: {
    border: '1px solid #E2E5EB',
    borderRadius: 10,
    padding: 12,
    background: '#F9FAFB',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  uploadRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  uploadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 9999,
    background: 'var(--color-brand-navy)',
    color: '#FFFFFF',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  hiddenFile: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  galleryEmpty: {
    margin: 0,
    fontSize: 12,
    color: '#6B7280',
  },
  galleryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 8,
  },
  galleryItem: {
    position: 'relative',
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  galleryImg: {
    width: '100%',
    aspectRatio: '1 / 1',
    objectFit: 'cover',
    display: 'block',
    background: '#F3F4F6',
  },
  primaryBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    padding: '2px 8px',
    borderRadius: 6,
    background: '#1E3A8A',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  galleryActions: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 4,
    padding: 6,
    background: '#FFFFFF',
    borderTop: '1px solid #F1F5F9',
  },
  galleryActionBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-brand-navy)',
    padding: '4px 6px',
  },
};
