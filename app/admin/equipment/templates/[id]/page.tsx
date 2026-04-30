// app/admin/equipment/templates/[id]/page.tsx — Edit template (Phase F10.2e-ii)
//
// Manage an existing template's header + line items. F10.2e-ii is
// split into 5 sub-batches per the small-chunks principle:
//   F10.2e-ii-a (THIS): page shell + header form (PATCH on save)
//   F10.2e-ii-b: items table (read-only display + per-row Edit/
//                Delete buttons that wire to the next two batches)
//   F10.2e-ii-c: Add-item modal (POST)
//   F10.2e-ii-d: Edit-item modal (PATCH w/ XOR swap)
//   F10.2e-ii-e: Delete-item confirm + DELETE
//
// This batch loads the template via GET + lets the operator edit
// the header fields + save via PATCH. Items render in a stub
// section showing the count + a "lands in F10.2e-ii-b" hint.
//
// Auth: admin / developer / equipment_manager (mutations);
// tech_support read-only.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../../hooks/usePageError';

interface TemplateHeader {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  job_type: string | null;
  default_crew_size: number | null;
  default_duration_hours: number | null;
  requires_certifications: string[];
  required_personnel_slots: unknown;
  composes_from: string[];
  version: number;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface TemplateItem {
  id: string;
  template_id: string;
  item_kind: 'durable' | 'consumable' | 'kit' | string;
  equipment_inventory_id: string | null;
  category: string | null;
  quantity: number;
  is_required: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface DetailResponse {
  template: TemplateHeader;
  items: TemplateItem[];
  version_count: number;
  latest_snapshot_at: string | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function TemplateEditPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { safeFetch } = usePageError('TemplateEditPage');

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable header form state. Pre-fills from data once loaded.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [jobType, setJobType] = useState('');
  const [defaultCrewSize, setDefaultCrewSize] = useState('');
  const [defaultDurationHours, setDefaultDurationHours] = useState('');
  const [requiresCerts, setRequiresCerts] = useState(''); // comma-separated
  const [composesFrom, setComposesFrom] = useState(''); // newline-separated UUIDs

  const [submitting, setSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplate = useCallback(async () => {
    if (!session?.user?.email || !id) return;
    setLoading(true);
    const json = await safeFetch<DetailResponse>(
      `/api/admin/equipment/templates/${id}`
    );
    if (json) {
      setData(json);
      const t = json.template;
      setName(t.name ?? '');
      setDescription(t.description ?? '');
      setJobType(t.job_type ?? '');
      setDefaultCrewSize(
        t.default_crew_size != null ? String(t.default_crew_size) : ''
      );
      setDefaultDurationHours(
        t.default_duration_hours != null
          ? String(t.default_duration_hours)
          : ''
      );
      setRequiresCerts((t.requires_certifications ?? []).join(', '));
      setComposesFrom((t.composes_from ?? []).join('\n'));
    }
    setLoading(false);
  }, [session, safeFetch, id]);

  useEffect(() => {
    void fetchTemplate();
  }, [fetchTemplate]);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!id || !data) return;
      setError(null);
      setActionMsg(null);

      const trimmedName = name.trim();
      if (!trimmedName) {
        setError('Name is required.');
        return;
      }

      const update: Record<string, unknown> = {
        name: trimmedName,
        description: description.trim() || null,
        job_type: jobType.trim() || null,
      };

      if (defaultCrewSize.trim()) {
        const n = parseInt(defaultCrewSize.trim(), 10);
        if (!Number.isInteger(n) || n < 0) {
          setError('Default crew size must be a non-negative integer.');
          return;
        }
        update.default_crew_size = n;
      } else {
        update.default_crew_size = null;
      }

      if (defaultDurationHours.trim()) {
        const n = parseFloat(defaultDurationHours.trim());
        if (!Number.isFinite(n) || n < 0) {
          setError('Default duration hours must be a non-negative number.');
          return;
        }
        update.default_duration_hours = n;
      } else {
        update.default_duration_hours = null;
      }

      update.requires_certifications = requiresCerts.trim()
        ? requiresCerts
            .split(',')
            .map((c) => c.trim().toLowerCase())
            .filter(Boolean)
        : [];

      // composes_from: newline-separated UUIDs. Client guard against
      // self-loop matches the server-side check.
      const composeIds = composesFrom
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const uuidRe =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      const bad = composeIds.find((u) => !uuidRe.test(u));
      if (bad) {
        setError(`composes_from contains a non-UUID entry: "${bad}"`);
        return;
      }
      if (composeIds.includes(id)) {
        setError(
          'composes_from cannot reference this template itself.'
        );
        return;
      }
      update.composes_from = composeIds;

      setSubmitting(true);
      const res = await safeFetch<{ template: TemplateHeader; version: number }>(
        `/api/admin/equipment/templates/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      );
      setSubmitting(false);

      if (res?.template) {
        setActionMsg(
          `✓ Saved. Bumped to v${res.version}; snapshot recorded.`
        );
        // Refetch so the items count + version_count + latest_snapshot_at
        // header fields refresh too. Pre-fill stays in sync because
        // fetchTemplate re-pushes form state.
        void fetchTemplate();
      } else {
        setError('Save failed. Check the error log; the form is unchanged.');
      }
    },
    [
      id,
      data,
      name,
      description,
      jobType,
      defaultCrewSize,
      defaultDurationHours,
      requiresCerts,
      composesFrom,
      safeFetch,
      fetchTemplate,
    ]
  );

  const isDirty = useMemo(() => {
    if (!data) return false;
    const t = data.template;
    return (
      name !== (t.name ?? '') ||
      description !== (t.description ?? '') ||
      jobType !== (t.job_type ?? '') ||
      defaultCrewSize !==
        (t.default_crew_size != null ? String(t.default_crew_size) : '') ||
      defaultDurationHours !==
        (t.default_duration_hours != null
          ? String(t.default_duration_hours)
          : '') ||
      requiresCerts !== (t.requires_certifications ?? []).join(', ') ||
      composesFrom !== (t.composes_from ?? []).join('\n')
    );
  }, [
    data,
    name,
    description,
    jobType,
    defaultCrewSize,
    defaultDurationHours,
    requiresCerts,
    composesFrom,
  ]);

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }
  if (loading && !data) {
    return <div style={styles.empty}>Loading…</div>;
  }
  if (!data) {
    return (
      <div style={styles.wrap}>
        <Link href="/admin/equipment/templates" style={styles.backLink}>
          ← Back to templates
        </Link>
        <div style={styles.empty}>
          Couldn&apos;t load this template. It may have been removed or the
          id is invalid.
        </div>
      </div>
    );
  }

  const t = data.template;
  const itemCount = data.items.length;

  return (
    <div style={styles.wrap}>
      <Link href="/admin/equipment/templates" style={styles.backLink}>
        ← Back to templates
      </Link>

      <header style={styles.header}>
        <h1 style={styles.h1}>{t.name}</h1>
        <div style={styles.metaRow}>
          {t.is_archived ? (
            <span style={styles.archivedBadge}>Archived</span>
          ) : (
            <span style={styles.activeBadge}>Active</span>
          )}
          <span style={styles.metaItem}>
            <code style={styles.code}>v{t.version}</code> ·{' '}
            {data.version_count} snapshot
            {data.version_count === 1 ? '' : 's'}
          </span>
          <span style={styles.metaItem}>
            Last edited {formatDateTime(t.updated_at)}
          </span>
          {data.latest_snapshot_at ? (
            <span style={styles.metaItem}>
              Latest snapshot {formatDateTime(data.latest_snapshot_at)}
            </span>
          ) : null}
          {t.slug ? (
            <span style={styles.metaItem}>
              slug: <code style={styles.code}>{t.slug}</code>
            </span>
          ) : null}
        </div>
      </header>

      {actionMsg ? (
        <div style={styles.successBanner}>{actionMsg}</div>
      ) : null}

      <section style={styles.section}>
        <header style={styles.sectionHeader}>
          <h2 style={styles.h2}>Header</h2>
          <p style={styles.sectionSub}>
            Editing here bumps version + writes a fresh snapshot per
            §5.12.3 audit-trail rule. Slug is locked after creation
            to preserve URL bookmarks.
          </p>
        </header>
        <form onSubmit={handleSave} style={styles.form}>
          <label style={styles.field}>
            <span style={styles.formLabel}>Name *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              maxLength={200}
              required
            />
          </label>

          <label style={styles.field}>
            <span style={styles.formLabel}>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...styles.input, minHeight: 60 }}
            />
          </label>

          <div style={styles.gridRow}>
            <label style={styles.field}>
              <span style={styles.formLabel}>Job type</span>
              <input
                type="text"
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                style={styles.input}
                placeholder="boundary / topo / stakeout"
              />
            </label>
            <label style={styles.field}>
              <span style={styles.formLabel}>Default crew size</span>
              <input
                type="number"
                value={defaultCrewSize}
                onChange={(e) => setDefaultCrewSize(e.target.value)}
                style={styles.input}
                min={0}
                step={1}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.formLabel}>Default duration (hrs)</span>
              <input
                type="number"
                value={defaultDurationHours}
                onChange={(e) => setDefaultDurationHours(e.target.value)}
                style={styles.input}
                min={0}
                step={0.5}
              />
            </label>
          </div>

          <label style={styles.field}>
            <span style={styles.formLabel}>Required certifications</span>
            <input
              type="text"
              value={requiresCerts}
              onChange={(e) => setRequiresCerts(e.target.value)}
              style={styles.input}
              placeholder="rpls, osha_30"
            />
            <span style={styles.modalHint}>
              ▸ Comma-separated; lowercase. F10.4 personnel availability
              check refuses to assign someone without these credentials
              when applying this template.
            </span>
          </label>

          <label style={styles.field}>
            <span style={styles.formLabel}>Composes from (UUIDs)</span>
            <textarea
              value={composesFrom}
              onChange={(e) => setComposesFrom(e.target.value)}
              style={{ ...styles.input, minHeight: 60, fontFamily: 'Menlo, monospace', fontSize: 12 }}
              placeholder="One template UUID per line — this template stacks on top of those at apply time."
            />
            <span style={styles.modalHint}>
              ▸ Stackable add-ons per §5.12.3 composition. App-side
              recursion guard runs at apply time (MAX_DEPTH=4); server
              also enforces a self-loop check. v2 polish: turn this
              into a typeahead picker.
            </span>
          </label>

          {error ? <div style={styles.errorBanner}>⚠ {error}</div> : null}

          <div style={styles.actions}>
            <button
              type="submit"
              style={styles.submitBtn}
              disabled={submitting || !isDirty || !name.trim()}
              title={
                !isDirty
                  ? 'No changes to save.'
                  : 'Save header edits — bumps version + writes snapshot.'
              }
            >
              {submitting ? 'Saving…' : 'Save header'}
            </button>
          </div>
        </form>
      </section>

      <section style={styles.section}>
        <header style={styles.itemsHeader}>
          <div>
            <h2 style={styles.h2}>
              Line items{' '}
              <span style={styles.muted}>· {itemCount}</span>
            </h2>
            <p style={styles.sectionSub}>
              Durables / consumables / kits this template pulls into a
              job at apply time. Each line either pins a specific
              inventory unit OR resolves any unit of a category at
              apply-time (XOR enforced server-side).
            </p>
          </div>
          <button
            type="button"
            style={styles.addBtn}
            disabled
            title="Add-item modal lands in the next sub-batch (F10.2e-ii-c). Use the items POST endpoint directly via curl until then."
          >
            + Add item
          </button>
        </header>
        <div style={styles.sectionBody}>
          {itemCount === 0 ? (
            <div style={styles.empty}>
              No line items yet. The <strong>+ Add item</strong> button
              wires up in F10.2e-ii-c.
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thRight}>Order</th>
                  <th style={styles.th}>Kind</th>
                  <th style={styles.th}>Specific or category</th>
                  <th style={styles.thRight}>Qty</th>
                  <th style={styles.th}>Required?</th>
                  <th style={styles.th}>Notes</th>
                  <th style={styles.thRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((item) => (
                    <tr key={item.id}>
                      <td style={styles.tdRight}>{item.sort_order}</td>
                      <td style={styles.td}>
                        <span style={styles.kindBadge}>
                          {item.item_kind}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {item.equipment_inventory_id ? (
                          <span title="Pinned to a specific inventory unit (resolved at apply-time to that exact row)">
                            <span style={styles.pinBadge}>📌 unit</span>{' '}
                            <code style={styles.code}>
                              {item.equipment_inventory_id.slice(0, 8)}
                            </code>
                          </span>
                        ) : item.category ? (
                          <span title="Any-of-kind: resolved at apply-time to whatever's available in this category">
                            <span style={styles.categoryBadge}>
                              ⊕ category
                            </span>{' '}
                            <code style={styles.code}>{item.category}</code>
                          </span>
                        ) : (
                          <span style={styles.muted}>—</span>
                        )}
                      </td>
                      <td style={styles.tdRight}>{item.quantity}</td>
                      <td style={styles.td}>
                        {item.is_required ? (
                          <span style={styles.requiredBadge}>required</span>
                        ) : (
                          <span style={styles.optionalBadge}>optional</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {item.notes ? (
                          <span style={styles.notesCell} title={item.notes}>
                            {item.notes}
                          </span>
                        ) : (
                          <span style={styles.muted}>—</span>
                        )}
                      </td>
                      <td style={styles.tdRight}>
                        <div style={styles.rowActionBar}>
                          <button
                            type="button"
                            style={styles.rowActionBtn}
                            disabled
                            title="Edit-item modal lands in F10.2e-ii-d"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            style={styles.rowActionBtnDanger}
                            disabled
                            title="Delete-item flow lands in F10.2e-ii-e"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <p style={styles.note}>
        ▸ Activation gate: <code>seeds/237</code> + <code>seeds/238</code>{' '}
        applied. Save-as-template (F10.2f) and Apply-template
        (F10.2g/F10.3) flows land later. Sidebar entry deferred to
        F10.6.
      </p>
    </div>
  );
}

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
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 12,
    color: '#6B7280',
    alignItems: 'center',
  },
  metaItem: { display: 'inline-flex', alignItems: 'center', gap: 4 },
  activeBadge: {
    fontSize: 10,
    padding: '2px 8px',
    background: '#DCFCE7',
    color: '#15803D',
    borderRadius: 999,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  archivedBadge: {
    fontSize: 10,
    padding: '2px 8px',
    background: '#F3F4F6',
    color: '#6B7280',
    borderRadius: 999,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  successBanner: {
    background: '#F0FDF4',
    border: '1px solid #86EFAC',
    color: '#15803D',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  errorBanner: {
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
  },
  section: {
    marginBottom: 16,
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: '12px 16px',
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  h2: { fontSize: 14, fontWeight: 600, margin: 0 },
  sectionSub: {
    fontSize: 12,
    color: '#6B7280',
    margin: '4px 0 0',
  },
  sectionBody: { padding: 16 },
  itemsHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
    background: '#F7F8FA',
    borderBottom: '1px solid #E2E5EB',
  },
  addBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    flexShrink: 0,
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
    background: '#FAFBFC',
    borderBottom: '1px solid #E2E5EB',
  },
  thRight: {
    textAlign: 'right',
    padding: '10px 14px',
    color: '#6B7280',
    fontWeight: 500,
    background: '#FAFBFC',
    borderBottom: '1px solid #E2E5EB',
  },
  td: {
    padding: '10px 14px',
    borderBottom: '1px solid #F3F4F6',
    verticalAlign: 'middle',
  },
  tdRight: {
    padding: '10px 14px',
    borderBottom: '1px solid #F3F4F6',
    textAlign: 'right',
    verticalAlign: 'middle',
    fontVariantNumeric: 'tabular-nums',
  },
  kindBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    background: '#E0E7FF',
    color: '#4338CA',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pinBadge: {
    fontSize: 10,
    padding: '1px 6px',
    background: '#FEF3C7',
    color: '#92400E',
    borderRadius: 4,
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  categoryBadge: {
    fontSize: 10,
    padding: '1px 6px',
    background: '#DBEAFE',
    color: '#1D4ED8',
    borderRadius: 4,
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  requiredBadge: {
    fontSize: 10,
    padding: '1px 6px',
    background: '#FEE2E2',
    color: '#B91C1C',
    borderRadius: 4,
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  optionalBadge: {
    fontSize: 10,
    padding: '1px 6px',
    background: '#F3F4F6',
    color: '#6B7280',
    borderRadius: 4,
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  notesCell: {
    display: 'inline-block',
    maxWidth: 280,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
  },
  rowActionBar: {
    display: 'inline-flex',
    gap: 6,
    justifyContent: 'flex-end',
  },
  rowActionBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#1D3095',
    fontWeight: 500,
  },
  rowActionBtnDanger: {
    background: 'transparent',
    border: '1px solid #FCA5A5',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: 500,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 16,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  formLabel: { fontSize: 12, fontWeight: 600, color: '#374151' },
  modalHint: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    fontStyle: 'italic',
  },
  input: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  gridRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  },
  submitBtn: {
    background: '#15803D',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: '#6B7280',
    background: '#FAFBFC',
    borderRadius: 8,
    fontSize: 13,
  },
  code: {
    fontFamily: 'Menlo, monospace',
    fontSize: 11,
    background: '#F7F8FA',
    padding: '1px 6px',
    borderRadius: 4,
    border: '1px solid #E2E5EB',
  },
  muted: { color: '#9CA3AF', fontWeight: 400 },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 24,
    fontStyle: 'italic',
    textAlign: 'center',
  },
};
