'use client';
// app/admin/my-jobs/MyJobsPanel.tsx
//
// Extracted body of /admin/my-jobs so the same component renders in the
// Hub at /admin/me?tab=jobs (admin-nav redesign Phase 2 slice 2b/2).
// The legacy route delegates to this panel until slice 2c lands the
// redirect.

import '../styles/AdminJobs.css';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FolderOpen } from 'lucide-react';
import { usePageError } from '../hooks/usePageError';
import JobCard from '../components/jobs/JobCard';

interface Job {
  id: string;
  job_number: string;
  name: string;
  stage: string;
  survey_type: string;
  acreage?: number;
  address?: string;
  client_name?: string;
  is_priority?: boolean;
  deadline?: string;
  lead_rpls_email?: string;
  created_at: string;
  job_team?: { user_email: string; user_name?: string; role: string }[];
  job_tags?: { tag: string }[];
}

export default function MyJobsPanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const { reportPageError } = usePageError('MyJobsPanel');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMyJobs() {
      try {
        const res = await fetch('/api/admin/jobs?my_jobs=true');
        if (res.ok) {
          const data = await res.json();
          setJobs(data.jobs || []);
        }
      } catch (err) {
        reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load my jobs' });
      }
      setLoading(false);
    }
    loadMyJobs();
  }, [reportPageError]);

  if (!session?.user) return null;

  const activeJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.stage));
  const completedJobs = jobs.filter(j => j.stage === 'completed');

  return (
    <>

      <div className="jobs-page">
        <div className="jobs-page__header">
          <div className="jobs-page__header-left">
            <h2 className="jobs-page__title">My Jobs</h2>
            <span className="jobs-page__count">{jobs.length} assigned</span>
          </div>
        </div>

        {/* My role summary */}
        <div className="jobs-page__my-summary">
          <div className="jobs-page__my-stat">
            <span className="jobs-page__my-stat-value">{activeJobs.length}</span>
            <span className="jobs-page__my-stat-label">Active Jobs</span>
          </div>
          <div className="jobs-page__my-stat">
            <span className="jobs-page__my-stat-value">
              {jobs.filter(j => j.stage === 'fieldwork').length}
            </span>
            <span className="jobs-page__my-stat-label">In Field</span>
          </div>
          <div className="jobs-page__my-stat">
            <span className="jobs-page__my-stat-value">{completedJobs.length}</span>
            <span className="jobs-page__my-stat-label">Completed</span>
          </div>
        </div>

        {loading ? (
          <div className="jobs-page__grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="job-card job-card--skeleton">
                <div className="job-card__skeleton-header" />
                <div className="job-card__skeleton-title" />
                <div className="job-card__skeleton-details" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="jobs-page__empty">
            <span className="jobs-page__empty-icon"><FolderOpen size={30} strokeWidth={1.5} /></span>
            <h3>No jobs assigned</h3>
            <p>You will see jobs here once you are assigned to a crew.</p>
          </div>
        ) : (
          <>
            {activeJobs.length > 0 && (
              <div className="jobs-page__section">
                <h3 className="jobs-page__section-title">Active Jobs</h3>
                <div className="jobs-page__grid">
                  {activeJobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onClick={() => router.push(`/admin/jobs/${job.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
            {completedJobs.length > 0 && (
              <div className="jobs-page__section">
                <h3 className="jobs-page__section-title">Completed Jobs</h3>
                <div className="jobs-page__grid">
                  {completedJobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onClick={() => router.push(`/admin/jobs/${job.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
