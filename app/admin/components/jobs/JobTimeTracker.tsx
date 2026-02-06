// app/admin/components/jobs/JobTimeTracker.tsx — Time logging
'use client';
import { useState } from 'react';

interface TimeEntry {
  id: string;
  user_email: string;
  user_name?: string;
  work_type: string;
  start_time: string;
  end_time?: string;
  duration_minutes?: number;
  description?: string;
  billable: boolean;
}

const WORK_TYPES: Record<string, { label: string; icon: string }> = {
  field: { label: 'Field Work', icon: '🏗️' },
  office: { label: 'Office', icon: '💻' },
  research: { label: 'Research', icon: '🔍' },
  drawing: { label: 'Drawing/CAD', icon: '📐' },
  legal: { label: 'Legal', icon: '⚖️' },
  travel: { label: 'Travel', icon: '🚗' },
  general: { label: 'General', icon: '📋' },
  other: { label: 'Other', icon: '📌' },
};

interface Props {
  entries: TimeEntry[];
  totalHours: number;
  onAdd?: (entry: { work_type: string; duration_minutes: number; description: string }) => void;
  onDelete?: (id: string) => void;
}

export default function JobTimeTracker({ entries, totalHours, onAdd, onDelete }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [workType, setWorkType] = useState('field');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [description, setDescription] = useState('');

  function handleAdd() {
    const totalMins = (parseInt(hours || '0') * 60) + parseInt(minutes || '0');
    if (totalMins <= 0) return;
    onAdd?.({ work_type: workType, duration_minutes: totalMins, description });
    setHours('');
    setMinutes('');
    setDescription('');
    setShowAdd(false);
  }

  function formatDuration(mins?: number): string {
    if (!mins) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // Group entries by user
  const byUser = entries.reduce((acc: Record<string, { name: string; minutes: number }>, e) => {
    const key = e.user_email;
    if (!acc[key]) acc[key] = { name: e.user_name || e.user_email.split('@')[0], minutes: 0 };
    acc[key].minutes += e.duration_minutes || 0;
    return acc;
  }, {});

  return (
    <div className="job-time">
      <div className="job-time__header">
        <h3 className="job-time__title">Time Tracking</h3>
        <span className="job-time__total">{totalHours}h total</span>
        {onAdd && (
          <button className="job-time__add-btn" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Log Time'}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="job-time__add-form">
          <select
            className="job-time__select"
            value={workType}
            onChange={e => setWorkType(e.target.value)}
          >
            {Object.entries(WORK_TYPES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <div className="job-time__duration-inputs">
            <input
              className="job-time__input job-time__input--small"
              type="number"
              placeholder="Hours"
              value={hours}
              onChange={e => setHours(e.target.value)}
              min="0"
            />
            <span className="job-time__input-sep">h</span>
            <input
              className="job-time__input job-time__input--small"
              type="number"
              placeholder="Min"
              value={minutes}
              onChange={e => setMinutes(e.target.value)}
              min="0"
              max="59"
            />
            <span className="job-time__input-sep">m</span>
          </div>
          <input
            className="job-time__input"
            placeholder="What did you work on?"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <button className="job-time__submit-btn" onClick={handleAdd}>Log Entry</button>
        </div>
      )}

      {/* User summary */}
      {Object.keys(byUser).length > 0 && (
        <div className="job-time__summary">
          {Object.entries(byUser).map(([email, { name, minutes: mins }]) => (
            <div key={email} className="job-time__summary-item">
              <span className="job-time__summary-name">{name}</span>
              <span className="job-time__summary-hours">{formatDuration(mins)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent entries */}
      {entries.length > 0 && (
        <div className="job-time__entries">
          {entries.slice(0, 10).map(entry => {
            const typeInfo = WORK_TYPES[entry.work_type] || WORK_TYPES.general;
            return (
              <div key={entry.id} className="job-time__entry">
                <span className="job-time__entry-icon">{typeInfo.icon}</span>
                <div className="job-time__entry-info">
                  <span className="job-time__entry-user">
                    {entry.user_name || entry.user_email.split('@')[0]}
                  </span>
                  <span className="job-time__entry-desc">
                    {typeInfo.label}{entry.description ? ` — ${entry.description}` : ''}
                  </span>
                </div>
                <span className="job-time__entry-duration">{formatDuration(entry.duration_minutes)}</span>
                {onDelete && (
                  <button className="job-time__entry-delete" onClick={() => onDelete(entry.id)}>×</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { WORK_TYPES };
