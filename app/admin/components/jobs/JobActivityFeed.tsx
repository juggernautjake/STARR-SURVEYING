// app/admin/components/jobs/JobActivityFeed.tsx — job activity timeline
// JOB_WORKSPACE_BUILDOUT slice E.
'use client';
import { useCallback, useEffect, useState } from 'react';

interface ActivityItem {
  type: string;
  label: string;
  actor: string;
  at: string;
  detail?: string;
}

const ICONS: Record<string, string> = {
  job_created: '✨',
  job_file_uploaded: '📁',
  job_photo_uploaded: '📷',
  job_team_added: '👤',
  job_stage_changed: '🔀',
  cad_drawing_saved: '📐',
};

export default function JobActivityFeed({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/activity?job_id=${encodeURIComponent(jobId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to load activity (${res.status})`);
      setItems(data.activity ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity');
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="job-detail__section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Activity</h3>
          <p className="job-detail__section-desc">Everything that has happened on this job, newest first.</p>
        </div>
        <button className="jobs-page__btn jobs-page__btn--secondary" onClick={load}>Refresh</button>
      </div>

      {loading && <p className="job-detail__section-desc" style={{ marginTop: '1rem' }}>Loading…</p>}
      {error && <div className="job-detail__error" role="alert" style={{ marginTop: '0.75rem' }}>{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="job-detail__messages-placeholder" style={{ marginTop: '1rem' }}>
          <span>🕓</span>
          <p>No activity recorded yet.</p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="job-activity" style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0' }}>
          {items.map((it, i) => (
            <li
              key={`${it.at}-${i}`}
              style={{
                display: 'flex', gap: '0.75rem', padding: '0.6rem 0',
                borderBottom: '1px solid var(--color-border, #e2e8f0)',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '1.1rem', lineHeight: 1.3 }}>{ICONS[it.type] ?? '•'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {it.label}
                  {it.detail && <span style={{ fontWeight: 400, color: 'var(--color-text-secondary, #475569)' }}> — {it.detail}</span>}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary, #94a3b8)' }}>
                  {it.actor} · {new Date(it.at).toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
