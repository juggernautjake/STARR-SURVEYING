// app/admin/components/jobs/JobCadPanel.tsx — CAD drawings for a job
// JOB_WORKSPACE_BUILDOUT slice A.
//
// Lists the CAD drawings linked to this job and launches the Starr
// CAD editor in the job's context:
//   New Drawing → /admin/cad?job=<id>&job_name=<name>
//   Open row    → /admin/cad?drawing=<id>
// The editor reads those params (CADLayout) to load/seed + keep the
// job link on save (SaveToDBDialog).
'use client';
import { useCallback, useEffect, useState } from 'react';

interface JobDrawing {
  id: string;
  name: string;
  description?: string | null;
  feature_count: number;
  layer_count: number;
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  jobId: string;
  jobName: string;
  onCountChange?: (count: number) => void;
}

export default function JobCadPanel({ jobId, jobName, onCountChange }: Props) {
  const [drawings, setDrawings] = useState<JobDrawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cad/drawings?job_id=${encodeURIComponent(jobId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to load drawings (${res.status})`);
      const list: JobDrawing[] = data.drawings ?? [];
      setDrawings(list);
      onCountChange?.(list.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load drawings');
    }
    setLoading(false);
  }, [jobId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  const newDrawingHref =
    `/admin/cad?job=${encodeURIComponent(jobId)}&job_name=${encodeURIComponent(jobName)}`;

  return (
    <div className="job-detail__section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3>CAD Drawings</h3>
          <p className="job-detail__section-desc">
            Open the Starr CAD editor to draft this job&apos;s survey. Drawings you save here stay linked to the job and show up below.
          </p>
        </div>
        <a href={newDrawingHref} className="jobs-page__btn jobs-page__btn--primary">
          ✏️ New Drawing
        </a>
      </div>

      {loading && <p className="job-detail__section-desc">Loading drawings…</p>}

      {error && (
        <div className="job-detail__error" role="alert" style={{ marginTop: '0.75rem' }}>
          {error} <button className="jobs-page__btn jobs-page__btn--secondary" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && drawings.length === 0 && (
        <div className="job-detail__messages-placeholder" style={{ marginTop: '1rem' }}>
          <span>📐</span>
          <p>No drawings yet for this job.</p>
          <p className="job-detail__field-data-sub">Click <strong>New Drawing</strong> to start drafting in the CAD editor — it will be saved against this job automatically.</p>
        </div>
      )}

      {!loading && drawings.length > 0 && (
        <ul className="job-cad__list" style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'grid', gap: '0.5rem' }}>
          {drawings.map((d) => (
            <li key={d.id}>
              <a
                href={`/admin/cad?drawing=${encodeURIComponent(d.id)}`}
                className="job-cad__row"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                  padding: '0.75rem 1rem', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8,
                  textDecoration: 'none', color: 'inherit', background: 'var(--surface, #fff)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    📐 {d.name}
                  </div>
                  {d.description && (
                    <div className="job-detail__field-data-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.description}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
                  <div>{d.feature_count} features · {d.layer_count} layers</div>
                  <div>Updated {new Date(d.updated_at).toLocaleDateString()}</div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
