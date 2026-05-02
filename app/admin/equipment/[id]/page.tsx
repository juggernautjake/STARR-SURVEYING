// app/admin/equipment/[id]/page.tsx — Equipment drilldown (Phase F10.1 polish)
//
// Read-only drilldown that surfaces every column the catalogue
// list compresses + the joined assignment history (job_equipment
// rows joined with jobs by id) per the user's "what team has been
// assigned to" follow-up.
//
// Mutations stay on the catalogue page (Edit / Retire / Restore /
// Print QR / Upload photo modals); the drilldown links back to
// the list. Keeps the page surface focused on context-rich
// reading.
//
// Future extensions (queued):
//   * "Open kit" link when this row is a kit OR a kit member
//   * "Templates that pin this unit" cleanup section (§5.12.7.8)
//   * Maintenance event timeline (lands w/ seeds/241 + F10.7)
//   * Reservations strip (lands w/ seeds/239 + F10.3)
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../hooks/usePageError';

interface EquipmentRow {
  id: string;
  name: string | null;
  category: string | null;
  item_kind: string | null;
  current_status: string | null;
  qr_code_id: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  notes: string | null;
  photo_url: string | null;
  condition: string | null;
  condition_updated_at: string | null;
  acquired_at: string | null;
  acquired_cost_cents: number | null;
  useful_life_months: number | null;
  placed_in_service_at: string | null;
  last_calibrated_at: string | null;
  next_calibration_due_at: string | null;
  warranty_expires_at: string | null;
  service_contract_vendor: string | null;
  last_serviced_at: string | null;
  unit: string | null;
  quantity_on_hand: number | null;
  low_stock_threshold: number | null;
  last_restocked_at: string | null;
  vendor: string | null;
  cost_per_unit_cents: number | null;
  home_location: string | null;
  vehicle_id: string | null;
  is_personal: boolean;
  owner_user_id: string | null;
  retired_at: string | null;
  retired_reason: string | null;
  serial_suspect: boolean;
  created_at: string;
  updated_at: string;
}

interface JobLite {
  id: string;
  name: string | null;
  job_number: string | null;
}

interface AssignmentRow {
  id: string;
  job_id: string | null;
  checked_out_by: string | null;
  checked_out_at: string | null;
  returned_at: string | null;
  equipment_name: string | null;
  serial_number: string | null;
  notes: string | null;
  jobs: JobLite | JobLite[] | null;
}

interface MaintenanceHistoryRow {
  id: string;
  kind: string;
  origin: string;
  state: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  vendor_name: string | null;
  cost_cents: number | null;
  qa_passed: boolean | null;
  next_due_at: string | null;
  summary: string;
}

interface DrilldownResponse {
  item: EquipmentRow;
  photo_signed_url: string | null;
  assignment_history: AssignmentRow[];
  assignment_history_error: string | null;
  maintenance_history: MaintenanceHistoryRow[];
  maintenance_history_error: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  available: { bg: '#DCFCE7', fg: '#15803D' },
  in_use: { bg: '#DBEAFE', fg: '#1D4ED8' },
  maintenance: { bg: '#FEF3C7', fg: '#92400E' },
  loaned_out: { bg: '#E0E7FF', fg: '#4338CA' },
  lost: { bg: '#FEE2E2', fg: '#B91C1C' },
  retired: { bg: '#F3F4F6', fg: '#6B7280' },
};

const CONDITION_COLORS: Record<string, { bg: string; fg: string }> = {
  new: { bg: '#DCFCE7', fg: '#15803D' },
  good: { bg: '#ECFDF5', fg: '#047857' },
  fair: { bg: '#FEF9C3', fg: '#854D0E' },
  poor: { bg: '#FED7AA', fg: '#9A3412' },
  damaged: { bg: '#FEE2E2', fg: '#B91C1C' },
  needs_repair: { bg: '#FCE7F3', fg: '#9F1239' },
};

function dollars(cents: number | null): string {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatLabel(raw: string | null): string {
  if (!raw) return '—';
  return raw
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getJob(j: AssignmentRow['jobs']): JobLite | null {
  if (!j) return null;
  return Array.isArray(j) ? (j[0] ?? null) : j;
}

export default function EquipmentDrilldownPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { safeFetch } = usePageError('EquipmentDrilldownPage');

  const [data, setData] = useState<DrilldownResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRow = useCallback(async () => {
    if (!session?.user?.email || !id) return;
    setLoading(true);
    const json = await safeFetch<DrilldownResponse>(
      `/api/admin/equipment/${id}`
    );
    if (json) setData(json);
    setLoading(false);
  }, [session, safeFetch, id]);

  useEffect(() => {
    void fetchRow();
  }, [fetchRow]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }
  if (loading && !data) {
    return <div style={styles.empty}>Loading…</div>;
  }
  if (!data) {
    return (
      <div style={styles.wrap}>
        <Link href="/admin/equipment/inventory" style={styles.backLink}>
          ← Back to catalogue
        </Link>
        <div style={styles.empty}>
          Couldn&apos;t load this row. It may have been retired or the id is
          invalid.
        </div>
      </div>
    );
  }

  const row = data.item;
  const isConsumable = row.item_kind === 'consumable';
  const statusKey = row.current_status ?? 'available';
  const statusColors = STATUS_COLORS[statusKey] ?? STATUS_COLORS.available;
  const conditionColors = row.condition
    ? (CONDITION_COLORS[row.condition] ?? {
        bg: '#F3F4F6',
        fg: '#6B7280',
      })
    : null;

  return (
    <div style={styles.wrap}>
      <Link href="/admin/equipment/inventory" style={styles.backLink}>
        ← Back to catalogue
      </Link>

      <header style={styles.header}>
        <h1 style={styles.h1}>{row.name ?? '(unnamed unit)'}</h1>
        <div style={styles.pillRow}>
          <span
            style={{
              ...styles.pill,
              background: statusColors.bg,
              color: statusColors.fg,
            }}
          >
            {formatLabel(row.current_status ?? 'available')}
          </span>
          {conditionColors ? (
            <span
              style={{
                ...styles.pill,
                background: conditionColors.bg,
                color: conditionColors.fg,
              }}
              title={
                row.condition_updated_at
                  ? `Last checked ${formatDate(row.condition_updated_at)}`
                  : undefined
              }
            >
              {formatLabel(row.condition)}
            </span>
          ) : null}
          {row.is_personal ? (
            <span style={{ ...styles.pill, background: '#E0E7FF', color: '#4338CA' }}>
              Personal kit
            </span>
          ) : null}
          {row.serial_suspect ? (
            <span style={{ ...styles.pill, background: '#FEE2E2', color: '#B91C1C' }}>
              Suspect SN
            </span>
          ) : null}
          {row.retired_at ? (
            <span style={{ ...styles.pill, background: '#F3F4F6', color: '#6B7280' }}>
              Retired
            </span>
          ) : null}
        </div>
      </header>

      <div style={styles.topGrid}>
        <div style={styles.photoBox}>
          {data.photo_signed_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.photo_signed_url}
              alt={row.name ?? ''}
              style={styles.photoLarge}
            />
          ) : row.photo_url ? (
            <div style={styles.photoFallback}>
              📷 Photo on file (signed URL unavailable; refresh)
            </div>
          ) : (
            <div style={styles.photoFallback}>
              📷 No photo yet — open Edit on the catalogue to upload.
            </div>
          )}
        </div>
        <div style={styles.infoGrid}>
          <Field label="Category">{formatLabel(row.category)}</Field>
          <Field label="Kind">{formatLabel(row.item_kind)}</Field>
          <Field label="QR code">
            {row.qr_code_id ? (
              <code style={styles.code}>{row.qr_code_id}</code>
            ) : (
              <span style={styles.muted}>—</span>
            )}
          </Field>
          <Field label="Home location">
            {row.home_location ?? <span style={styles.muted}>—</span>}
          </Field>
          {!isConsumable ? (
            <>
              <Field label="Brand">
                {row.brand ?? <span style={styles.muted}>—</span>}
              </Field>
              <Field label="Model">
                {row.model ?? <span style={styles.muted}>—</span>}
              </Field>
              <Field label="Serial number">
                {row.serial_number ? (
                  <code style={styles.code}>{row.serial_number}</code>
                ) : (
                  <span style={styles.muted}>—</span>
                )}
              </Field>
            </>
          ) : null}
        </div>
      </div>

      {isConsumable ? (
        <Section title="Consumable accounting">
          <div style={styles.infoGrid}>
            <Field label="Unit">
              {row.unit ?? <span style={styles.muted}>—</span>}
            </Field>
            <Field label="Quantity on hand">
              {row.quantity_on_hand != null ? (
                <strong>{row.quantity_on_hand}</strong>
              ) : (
                <span style={styles.muted}>—</span>
              )}
            </Field>
            <Field label="Low-stock threshold">
              {row.low_stock_threshold ?? (
                <span style={styles.muted}>—</span>
              )}
            </Field>
            <Field label="Cost per unit">
              {dollars(row.cost_per_unit_cents)}
            </Field>
            <Field label="Vendor">
              {row.vendor ?? <span style={styles.muted}>—</span>}
            </Field>
            <Field label="Last restocked">
              {formatDate(row.last_restocked_at)}
            </Field>
          </div>
        </Section>
      ) : null}

      <Section title="Cost basis (§5.12.10)">
        <div style={styles.infoGrid}>
          <Field label="Acquired cost">
            <strong>{dollars(row.acquired_cost_cents)}</strong>
          </Field>
          <Field label="Acquired at">{formatDate(row.acquired_at)}</Field>
          <Field label="Useful life (months)">
            {row.useful_life_months ?? <span style={styles.muted}>—</span>}
          </Field>
          <Field label="Placed in service">
            {formatDate(row.placed_in_service_at)}
          </Field>
        </div>
      </Section>

      <Section title="Calibration / warranty (§5.12.7.4)">
        <div style={styles.infoGrid}>
          <Field label="Last calibrated">
            {formatDate(row.last_calibrated_at)}
          </Field>
          <Field label="Next calibration due">
            {formatDate(row.next_calibration_due_at)}
          </Field>
          <Field label="Warranty expires">
            {formatDate(row.warranty_expires_at)}
          </Field>
          <Field label="Service vendor">
            {row.service_contract_vendor ?? (
              <span style={styles.muted}>—</span>
            )}
          </Field>
          <Field label="Last serviced">
            {formatDate(row.last_serviced_at)}
          </Field>
        </div>
      </Section>

      <Section title="Assignment history">
        <p style={styles.sectionSub}>
          Last 50 check-outs against this unit (joined to jobs by id).
          Open assignments show no return time.
        </p>
        {data.assignment_history_error ? (
          <div style={styles.warnBanner}>
            ⚠ Couldn&apos;t load full history: {data.assignment_history_error}
          </div>
        ) : null}
        {data.assignment_history.length === 0 ? (
          <div style={styles.empty}>
            No assignments recorded yet for this unit.
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Job</th>
                <th style={styles.th}>Checked out</th>
                <th style={styles.th}>Returned</th>
                <th style={styles.th}>By</th>
                <th style={styles.th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.assignment_history.map((a) => {
                const job = getJob(a.jobs);
                const isOpen = !a.returned_at;
                return (
                  <tr key={a.id}>
                    <td style={styles.td}>
                      {job ? (
                        <Link
                          href={`/admin/jobs/${job.id}`}
                          style={styles.link}
                        >
                          {job.job_number
                            ? `${job.job_number} · ${job.name ?? '(unnamed)'}`
                            : (job.name ?? '(unnamed job)')}
                        </Link>
                      ) : (
                        <span style={styles.muted}>(no job link)</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {formatDateTime(a.checked_out_at)}
                    </td>
                    <td style={styles.td}>
                      {isOpen ? (
                        <span
                          style={{
                            ...styles.pill,
                            background: '#DBEAFE',
                            color: '#1D4ED8',
                          }}
                        >
                          Open
                        </span>
                      ) : (
                        formatDateTime(a.returned_at)
                      )}
                    </td>
                    <td style={styles.td}>
                      {a.checked_out_by ?? <span style={styles.muted}>—</span>}
                    </td>
                    <td style={styles.td}>
                      {a.notes ?? <span style={styles.muted}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Maintenance history">
        <p style={styles.sectionSub}>
          Last 50 maintenance + calibration events for this unit.
          Click a row to open the detail page.
        </p>
        {data.maintenance_history_error ? (
          <div style={styles.warnBanner}>
            ⚠ Couldn&apos;t load full history: {data.maintenance_history_error}
          </div>
        ) : null}
        {data.maintenance_history.length === 0 ? (
          <div style={styles.empty}>
            No maintenance events recorded yet for this unit.
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>State</th>
                <th style={styles.th}>Kind</th>
                <th style={styles.th}>Scheduled</th>
                <th style={styles.th}>Completed</th>
                <th style={styles.th}>Vendor</th>
                <th style={styles.th}>Cost</th>
                <th style={styles.th}>Summary</th>
              </tr>
            </thead>
            <tbody>
              {data.maintenance_history.map((m) => (
                <tr
                  key={m.id}
                  style={
                    m.state === 'failed_qa'
                      ? maintRowStyles.failedRow
                      : undefined
                  }
                >
                  <td style={styles.td}>
                    <Link
                      href={`/admin/equipment/maintenance/${m.id}`}
                      style={styles.link}
                    >
                      <span style={maintStatePill(m.state)}>
                        {m.state.replace(/_/g, ' ')}
                      </span>
                    </Link>
                  </td>
                  <td style={styles.td}>
                    <span style={maintRowStyles.kindChip}>{m.kind}</span>
                    {m.qa_passed === false ? (
                      <span style={maintRowStyles.qaFailedBadge}>
                        QA fail
                      </span>
                    ) : null}
                  </td>
                  <td style={styles.td}>
                    {formatDateTime(m.scheduled_for)}
                  </td>
                  <td style={styles.td}>
                    {formatDateTime(m.completed_at)}
                  </td>
                  <td style={styles.td}>
                    {m.vendor_name ?? <span style={styles.muted}>—</span>}
                  </td>
                  <td style={styles.td}>
                    {m.cost_cents !== null ? (
                      `$${(m.cost_cents / 100).toFixed(2)}`
                    ) : (
                      <span style={styles.muted}>—</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <Link
                      href={`/admin/equipment/maintenance/${m.id}`}
                      style={styles.link}
                    >
                      {m.summary}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {row.notes ? (
        <Section title="Notes">
          <p style={styles.notesBlock}>{row.notes}</p>
        </Section>
      ) : null}

      {row.retired_at ? (
        <Section title="Retirement">
          <div style={styles.infoGrid}>
            <Field label="Retired at">
              {formatDateTime(row.retired_at)}
            </Field>
            <Field label="Reason">
              {row.retired_reason ?? <span style={styles.muted}>—</span>}
            </Field>
          </div>
        </Section>
      ) : null}

      <p style={styles.note}>
        ▸ Edit / retire / upload photo / print QR live on the catalogue
        page modals. Click back above to make changes.
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <span style={styles.fieldValue}>{children}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={styles.section}>
      <header style={styles.sectionHeader}>
        <h2 style={styles.h2}>{title}</h2>
      </header>
      <div style={styles.sectionBody}>{children}</div>
    </section>
  );
}

// F10.7 tail — per-unit maintenance history styling.
function maintStatePill(state: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    scheduled: { background: '#DBEAFE', color: '#1E3A8A' },
    in_progress: { background: '#1D3095', color: '#FFFFFF' },
    awaiting_parts: { background: '#FEF3C7', color: '#78350F' },
    awaiting_vendor: { background: '#FEF3C7', color: '#78350F' },
    complete: { background: '#DCFCE7', color: '#166534' },
    failed_qa: { background: '#FEE2E2', color: '#7F1D1D' },
    cancelled: {
      background: '#F3F4F6',
      color: '#6B7280',
      border: '1px dashed #D1D5DB',
    },
  };
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    ...(map[state] ?? { background: '#F3F4F6', color: '#374151' }),
  };
}

const maintRowStyles: Record<string, React.CSSProperties> = {
  failedRow: {
    background: 'rgba(254, 226, 226, 0.4)',
    borderLeft: '3px solid #B91C1C',
  },
  kindChip: {
    display: 'inline-block',
    background: '#F3F4F6',
    padding: '1px 8px',
    borderRadius: 4,
    fontSize: 11,
    color: '#374151',
    textTransform: 'capitalize' as const,
    marginRight: 6,
  },
  qaFailedBadge: {
    display: 'inline-block',
    background: '#FEE2E2',
    color: '#7F1D1D',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
  },
};

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 1100, margin: '0 auto' },
  backLink: {
    display: 'inline-block',
    marginBottom: 12,
    fontSize: 13,
    color: '#1D3095',
    textDecoration: 'none',
    fontWeight: 500,
  },
  header: { marginBottom: 16 },
  h1: { fontSize: 24, fontWeight: 600, margin: '0 0 8px' },
  pillRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  pill: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  topGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 240px) 1fr',
    gap: 16,
    marginBottom: 16,
  },
  photoBox: {
    background: '#F7F8FA',
    borderRadius: 12,
    border: '1px solid #E2E5EB',
    overflow: 'hidden',
    minHeight: 180,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLarge: {
    width: '100%',
    height: 'auto',
    aspectRatio: '1 / 1',
    objectFit: 'cover',
  },
  photoFallback: {
    padding: 20,
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 12px',
    background: '#F7F8FA',
    borderRadius: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldValue: { fontSize: 14, color: '#111827' },
  section: {
    marginBottom: 16,
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: '10px 14px',
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  h2: { fontSize: 14, fontWeight: 600, margin: 0 },
  sectionBody: { padding: 16 },
  sectionSub: {
    fontSize: 12,
    color: '#6B7280',
    margin: '0 0 12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    color: '#6B7280',
    fontWeight: 500,
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  td: {
    padding: '10px 14px',
    borderBottom: '1px solid #F3F4F6',
    verticalAlign: 'top',
  },
  link: { color: '#1D3095', fontWeight: 500, textDecoration: 'none' },
  muted: { color: '#9CA3AF' },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#FFFFFF',
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid #E2E5EB',
  },
  notesBlock: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  warnBanner: {
    background: '#FEF3C7',
    border: '1px solid #FCD34D',
    color: '#92400E',
    padding: 10,
    borderRadius: 8,
    fontSize: 12,
    marginBottom: 10,
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
    background: '#F7F8FA',
    borderRadius: 12,
    fontSize: 13,
  },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 24,
    fontStyle: 'italic',
    textAlign: 'center',
  },
};
