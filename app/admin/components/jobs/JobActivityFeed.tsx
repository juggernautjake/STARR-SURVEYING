// app/admin/components/jobs/JobActivityFeed.tsx — the activity timeline of a job, or of a project.
// JOB_WORKSPACE_BUILDOUT slice E; project history + the change log 2026-10-11.
//
// Owner, 2026-10-11: *"All file additions and changes for each project and job should be tracked
// and logged."* The feed now carries the change log (`record_changes`, seeds/676): every file
// added, renamed, moved, deleted or restored — the phone's uploads included — and every edit to the
// job's or project's information, with each field's old and new value. On a project the feed covers
// the project and all of its jobs, each line naming the job it happened on.
//
// Styled by its own sheet: the job page loads AdminJobs.css, the project page does not, and a
// timeline that only looked right on one of them would be two components pretending to be one.
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import './JobActivityFeed.css';

interface ActivityItem {
  type: string;
  label: string;
  actor: string;
  at: string;
  detail?: string;
  fields?: string[];
  job_id?: string | null;
  job_name?: string | null;
  job_number?: string | null;
}

type Filter = 'all' | 'files' | 'edits';

const PAGE = 40;

/** The icon goes by what the event is about; the legacy `activity_log` kinds keep theirs. */
function iconFor(type: string): string {
  if (type.startsWith('file_') || type.includes('file_') || type === 'job_photo_uploaded') {
    if (type.endsWith('deleted') || type.endsWith('purged')) return '🗑️';
    if (type.endsWith('restored')) return '♻️';
    return type === 'job_photo_uploaded' ? '📷' : '📄';
  }
  if (type.startsWith('folder_') || type.includes('folder')) return '📁';
  if (type.startsWith('team_') || type.includes('team')) return '👤';
  if (type.includes('stage')) return '🔀';
  if (type.includes('cad')) return '📐';
  if (type.endsWith('_created')) return '✨';
  if (type.endsWith('_deleted')) return '🗑️';
  return '✏️';
}

function isFileEvent(type: string): boolean {
  return type.startsWith('file_') || type.startsWith('folder_') || type.includes('file_') || type.includes('folder') || type === 'job_photo_uploaded';
}

export default function JobActivityFeed({ jobId, projectId }: { jobId?: string; projectId?: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const onProject = !jobId && !!projectId;

  const url = jobId
    ? `/api/admin/jobs/activity?job_id=${encodeURIComponent(jobId)}`
    : `/api/admin/projects/${encodeURIComponent(projectId ?? '')}/activity`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to load activity (${res.status})`);
      setItems(data.activity ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity');
    }
    setLoading(false);
  }, [url]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setShown(PAGE); }, [filter]);

  const visible = useMemo(() => items.filter((it) => {
    if (filter === 'files') return isFileEvent(it.type);
    if (filter === 'edits') return !isFileEvent(it.type);
    return true;
  }), [items, filter]);

  return (
    <div className={`jaf${jobId ? ' job-detail__section' : ''}`} data-testid="activity-feed">
      <div className="jaf__head">
        <div>
          <h3 className="jaf__title">{onProject ? 'History' : 'Activity'}</h3>
          <p className="jaf__desc">
            {onProject
              ? 'Every change to this project and its jobs — files and information — newest first.'
              : 'Everything that has happened on this job — files and information — newest first.'}
          </p>
        </div>
        <button type="button" className="jaf__btn" onClick={load}>Refresh</button>
      </div>

      <div className="jaf__filters" role="group" aria-label="Show">
        {(['all', 'files', 'edits'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`jaf__chip${filter === f ? ' jaf__chip--on' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'files' ? 'Files' : 'Information'}
          </button>
        ))}
      </div>

      {loading && <p className="jaf__desc jaf__gap">Loading…</p>}
      {error && <div className="jaf__error" role="alert">{error}</div>}

      {!loading && !error && visible.length === 0 && (
        <div className="jaf__empty">
          <span aria-hidden="true">🕓</span>
          <p>{items.length === 0 ? 'No activity recorded yet.' : 'Nothing of that kind yet.'}</p>
        </div>
      )}

      {visible.length > 0 && (
        <ul className="jaf__list">
          {visible.slice(0, shown).map((it, i) => (
            <li key={`${it.at}-${i}`} className="jaf__item">
              <span aria-hidden="true" className="jaf__icon">{iconFor(it.type)}</span>
              <div className="jaf__body">
                <div className="jaf__line">
                  <span className="jaf__label">{it.label}</span>
                  {it.detail && <span className="jaf__detail"> — {it.detail}</span>}
                </div>
                {it.fields && it.fields.length > 0 && (
                  <ul className="jaf__fields">
                    {it.fields.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
                <div className="jaf__meta">
                  {it.actor} · {new Date(it.at).toLocaleString()}
                  {onProject && it.job_id && (
                    <>
                      {' · '}
                      <Link href={`/admin/jobs/${it.job_id}`} className="jaf__job">
                        {it.job_number ? `#${it.job_number}` : 'Job'}{it.job_name ? ` ${it.job_name}` : ''}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {visible.length > shown && (
        <button type="button" className="jaf__btn jaf__more" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, visible.length - shown)} more
        </button>
      )}
    </div>
  );
}
