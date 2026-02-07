// app/admin/my-jobs/page.tsx — Employee's assigned jobs
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';
import UnderConstruction from '../components/messaging/UnderConstruction';
import JobCard, { STAGE_CONFIG } from '../components/jobs/JobCard';

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

export default function MyJobsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { safeFetch, safeAction, reportPageError } = usePageError('MyJobsPage');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadMyJobs(); }, []);

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

  if (!session?.user) return null;

  const activeJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.stage));
  const completedJobs = jobs.filter(j => j.stage === 'completed');

  return (
    <>
      <UnderConstruction
        feature="My Jobs"
        description="View all jobs you are assigned to. Track your active surveys, see your role on each job, and access job details quickly."
      />

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
            <span className="jobs-page__empty-icon">🗂️</span>
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

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">My Jobs — Development Guide</h2>
        <div className="msg-setup-guide__section">
          <h3>Current Capabilities</h3>
          <ul className="msg-setup-guide__list">
            <li>Fetches only jobs where the current user is a team member</li>
            <li>Summary stats: active, in-field, completed counts</li>
            <li>Separates active and completed jobs into sections</li>
            <li>Click any job card to open full job detail view</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Improve the My Jobs page at /admin/my-jobs/page.tsx. Current: shows user's assigned jobs with active/completed sections.

NEXT STEPS:
1. Show the user's role on each job card (Party Chief, Technician, etc.)
2. Add notification badges for jobs with new messages or updates
3. Add time tracking quick-log from the job card
4. Add "Today's Schedule" section showing jobs scheduled for today
5. Add job notifications feed (stage changes, new assignments, messages)
6. Add quick-action buttons (log time, upload photo, send message)
7. Add map view showing all active job locations
8. Mobile-optimized card layout for field use`}</pre>
        </div>
      </div>
    </>
  );
}
