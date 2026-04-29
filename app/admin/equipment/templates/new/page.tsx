// app/admin/equipment/templates/new/page.tsx — Create template (Phase F10.2e-i)
//
// Header-only form for creating a new equipment template. POSTs
// to /api/admin/equipment/templates with the header fields + an
// empty items array; on success redirects to /[id] where the
// operator adds line items via the F10.2c endpoints (UI lands in
// F10.2e-ii).
//
// Why split create from item-management:
//   * The F10.2b-i POST endpoint already accepts items inline,
//     but a header-only first save lets us keep this page small +
//     focused. The edit page handles items management end-to-end.
//   * Operators iterating on multiple items get the version-bump
//     behaviour per item (each one snapshots into
//     equipment_template_versions) which mirrors how they'll
//     edit existing templates.
//
// Auth: admin / developer / equipment_manager. tech_support
// read-only per §5.12.3.
'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { usePageError } from '../../../hooks/usePageError';

interface TemplateRow {
  id: string;
  name: string;
  slug: string | null;
}

export default function NewTemplatePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { safeFetch } = usePageError('NewTemplatePage');

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [jobType, setJobType] = useState('');
  const [defaultCrewSize, setDefaultCrewSize] = useState('');
  const [defaultDurationHours, setDefaultDurationHours] = useState('');
  const [requiresCerts, setRequiresCerts] = useState(''); // comma-separated
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedName = name.trim();
      if (!trimmedName) {
        setError('Name is required.');
        return;
      }

      const body: Record<string, unknown> = { name: trimmedName };
      if (slug.trim()) body.slug = slug.trim();
      if (description.trim()) body.description = description.trim();
      if (jobType.trim()) body.job_type = jobType.trim();

      if (defaultCrewSize.trim()) {
        const n = parseInt(defaultCrewSize.trim(), 10);
        if (!Number.isInteger(n) || n < 0) {
          setError('Default crew size must be a non-negative integer.');
          return;
        }
        body.default_crew_size = n;
      }
      if (defaultDurationHours.trim()) {
        const n = parseFloat(defaultDurationHours.trim());
        if (!Number.isFinite(n) || n < 0) {
          setError('Default duration hours must be a non-negative number.');
          return;
        }
        body.default_duration_hours = n;
      }

      if (requiresCerts.trim()) {
        body.requires_certifications = requiresCerts
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
      }

      setSubmitting(true);
      const res = await safeFetch<{ template: TemplateRow }>(
        '/api/admin/equipment/templates',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      setSubmitting(false);

      if (res?.template) {
        // Hand off to the edit page so the operator can add items.
        router.push(`/admin/equipment/templates/${res.template.id}`);
      } else {
        setError(
          'Create failed. Check the error log; the form is unchanged.'
        );
      }
    },
    [
      defaultCrewSize,
      defaultDurationHours,
      description,
      jobType,
      name,
      requiresCerts,
      router,
      safeFetch,
      slug,
    ]
  );

  if (!session?.user?.email) {
    return <div style={styles.empty}>Sign in required.</div>;
  }

  return (
    <div style={styles.wrap}>
      <Link href="/admin/equipment/templates" style={styles.backLink}>
        ← Back to templates
      </Link>

      <header style={styles.header}>
        <h1 style={styles.h1}>New equipment template</h1>
        <p style={styles.subtitle}>
          Create the header now; you&apos;ll add line items (durables /
          consumables / kits) on the edit page once the template
          exists. Each item edit bumps version + snapshots into
          equipment_template_versions per the §5.12.3 audit-trail rule.
        </p>
      </header>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.field}>
          <span style={styles.formLabel}>Name *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
            maxLength={200}
            required
            autoFocus
            placeholder="Residential 4-corner boundary — total station"
          />
        </label>

        <label style={styles.field}>
          <span style={styles.formLabel}>Slug (optional)</span>
          <input
            type="text"
            value={slug}
            onChange={(e) =>
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, '_')
                  .replace(/_+/g, '_')
              )
            }
            style={styles.input}
            placeholder="residential_4corner_total_station"
          />
          <span style={styles.modalHint}>
            ▸ Stable URL slug. UNIQUE — collision returns 409.
            Auto-normalised: lowercase, underscores only.
          </span>
        </label>

        <label style={styles.field}>
          <span style={styles.formLabel}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...styles.input, minHeight: 60 }}
            placeholder="One-paragraph context dispatchers see on the picker."
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
              placeholder="boundary / topo / stakeout / road_work"
            />
            <span style={styles.modalHint}>
              ▸ Powers the picker filter on the F10.2g apply flow.
            </span>
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
              placeholder="2"
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
              placeholder="4"
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
            ▸ Comma-separated. Lowercase. Personnel availability check
            (§5.12.4, F10.4) refuses to assign someone without these
            credentials when applying this template.
          </span>
        </label>

        {error ? <div style={styles.errorBanner}>⚠ {error}</div> : null}

        <div style={styles.actions}>
          <Link
            href="/admin/equipment/templates"
            style={styles.secondaryBtn}
          >
            Cancel
          </Link>
          <button
            type="submit"
            style={styles.submitBtn}
            disabled={submitting || !name.trim()}
          >
            {submitting ? 'Creating…' : 'Create template'}
          </button>
        </div>
      </form>

      <p style={styles.note}>
        ▸ After creation, you&apos;ll land on the edit page where you add
        line items, set composition (stack other templates), and edit
        the header further.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '24px', maxWidth: 800, margin: '0 auto' },
  backLink: {
    display: 'inline-block',
    marginBottom: 12,
    fontSize: 13,
    color: '#1D3095',
    textDecoration: 'none',
    fontWeight: 500,
  },
  header: { marginBottom: 16 },
  h1: { fontSize: 22, fontWeight: 600, margin: '0 0 4px' },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    margin: 0,
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    background: '#FFFFFF',
    border: '1px solid #E2E5EB',
    borderRadius: 12,
    padding: 20,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  formLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
  },
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
  errorBanner: {
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  secondaryBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
    textDecoration: 'none',
    display: 'inline-block',
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
  },
  note: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 24,
    fontStyle: 'italic',
    textAlign: 'center',
  },
};
