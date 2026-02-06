// app/admin/components/jobs/JobCard.tsx — Job summary card/widget
'use client';

interface JobTeamMember {
  user_email: string;
  user_name?: string;
  role: string;
}

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
  job_team?: JobTeamMember[];
  job_tags?: { tag: string }[];
  total_hours?: number;
}

const STAGE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  quote: { label: 'Quote', color: '#F59E0B', icon: '💰' },
  research: { label: 'Research', color: '#8B5CF6', icon: '🔍' },
  fieldwork: { label: 'Field Work', color: '#059669', icon: '🏗️' },
  drawing: { label: 'Drawing', color: '#3B82F6', icon: '📐' },
  legal: { label: 'Legal', color: '#6366F1', icon: '⚖️' },
  delivery: { label: 'Delivery', color: '#10B981', icon: '📦' },
  completed: { label: 'Completed', color: '#6B7280', icon: '✅' },
  cancelled: { label: 'Cancelled', color: '#EF4444', icon: '❌' },
  on_hold: { label: 'On Hold', color: '#F97316', icon: '⏸️' },
};

const SURVEY_TYPES: Record<string, string> = {
  boundary: 'Boundary',
  topographic: 'Topographic',
  construction: 'Construction',
  subdivision: 'Subdivision',
  alta: 'ALTA/NSPS',
  elevation_cert: 'Elevation Certificate',
  route: 'Route',
  as_built: 'As-Built',
  control: 'Control',
  other: 'Other',
};

export default function JobCard({ job, onClick }: { job: Job; onClick?: () => void }) {
  const stageInfo = STAGE_CONFIG[job.stage] || STAGE_CONFIG.quote;
  const teamCount = job.job_team?.length || 0;
  const tags = job.job_tags?.map(t => typeof t === 'string' ? t : t.tag) || [];

  return (
    <button className="job-card" onClick={onClick} type="button">
      <div className="job-card__header">
        <span className="job-card__number">{job.job_number}</span>
        <span
          className="job-card__stage"
          style={{ background: stageInfo.color + '20', color: stageInfo.color }}
        >
          {stageInfo.icon} {stageInfo.label}
        </span>
      </div>

      <h3 className="job-card__name">
        {job.is_priority && <span className="job-card__priority" title="Priority">🔴</span>}
        {job.name}
      </h3>

      {job.client_name && (
        <p className="job-card__client">{job.client_name}</p>
      )}

      <div className="job-card__details">
        <span className="job-card__detail">
          <span className="job-card__detail-icon">📋</span>
          {SURVEY_TYPES[job.survey_type] || job.survey_type}
        </span>
        {job.acreage && (
          <span className="job-card__detail">
            <span className="job-card__detail-icon">📏</span>
            {job.acreage} acres
          </span>
        )}
        {teamCount > 0 && (
          <span className="job-card__detail">
            <span className="job-card__detail-icon">👥</span>
            {teamCount} member{teamCount !== 1 ? 's' : ''}
          </span>
        )}
        {job.total_hours !== undefined && job.total_hours > 0 && (
          <span className="job-card__detail">
            <span className="job-card__detail-icon">⏱️</span>
            {job.total_hours}h
          </span>
        )}
      </div>

      {job.address && (
        <p className="job-card__address">{job.address}</p>
      )}

      {tags.length > 0 && (
        <div className="job-card__tags">
          {tags.slice(0, 4).map(tag => (
            <span key={tag} className="job-card__tag">{tag}</span>
          ))}
          {tags.length > 4 && <span className="job-card__tag job-card__tag--more">+{tags.length - 4}</span>}
        </div>
      )}

      {job.deadline && (
        <div className="job-card__deadline">
          Due: {new Date(job.deadline).toLocaleDateString()}
        </div>
      )}
    </button>
  );
}

export { STAGE_CONFIG, SURVEY_TYPES };
