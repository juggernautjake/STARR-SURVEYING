// app/admin/components/jobs/JobTeamPanel.tsx — Team members with roles
'use client';
import { useState } from 'react';

interface TeamMember {
  id: string;
  user_email: string;
  user_name?: string;
  role: string;
  assigned_at: string;
  notes?: string;
}

const ROLES: Record<string, { label: string; icon: string }> = {
  lead_rpls: { label: 'Lead RPLS', icon: '👔' },
  party_chief: { label: 'Party Chief', icon: '🎯' },
  survey_technician: { label: 'Survey Technician', icon: '📐' },
  instrument_operator: { label: 'Instrument Operator', icon: '🔭' },
  rod_person: { label: 'Rod Person', icon: '📏' },
  survey_drafter: { label: 'Survey Drafter', icon: '✏️' },
  office_tech: { label: 'Office Technician', icon: '💻' },
  other: { label: 'Other', icon: '👤' },
};

interface Props {
  team: TeamMember[];
  onAdd?: (email: string, name: string, role: string) => void;
  onRemove?: (id: string) => void;
  onChangeRole?: (id: string, role: string) => void;
  editable?: boolean;
}

export default function JobTeamPanel({ team, onAdd, onRemove, onChangeRole, editable }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('survey_technician');

  function handleAdd() {
    if (!email || !role) return;
    onAdd?.(email, name || email.split('@')[0], role);
    setEmail('');
    setName('');
    setRole('survey_technician');
    setShowAdd(false);
  }

  return (
    <div className="job-team">
      <div className="job-team__header">
        <h3 className="job-team__title">Crew & Team</h3>
        <span className="job-team__count">{team.length} member{team.length !== 1 ? 's' : ''}</span>
        {editable && (
          <button className="job-team__add-btn" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="job-team__add-form">
          <input
            className="job-team__input"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            className="job-team__input"
            placeholder="Name (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <select
            className="job-team__select"
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            {Object.entries(ROLES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button className="job-team__submit-btn" onClick={handleAdd}>Add Member</button>
        </div>
      )}

      {team.length === 0 && (
        <div className="job-team__empty">No team members assigned yet</div>
      )}

      <div className="job-team__list">
        {team.map(member => {
          const roleInfo = ROLES[member.role] || ROLES.other;
          return (
            <div key={member.id} className="job-team__member">
              <div className="job-team__member-avatar">
                {(member.user_name || member.user_email).charAt(0).toUpperCase()}
              </div>
              <div className="job-team__member-info">
                <span className="job-team__member-name">
                  {member.user_name || member.user_email.split('@')[0]}
                </span>
                <span className="job-team__member-role">
                  {roleInfo.icon} {roleInfo.label}
                </span>
              </div>
              {editable && (
                <div className="job-team__member-actions">
                  <select
                    className="job-team__role-select"
                    value={member.role}
                    onChange={e => onChangeRole?.(member.id, e.target.value)}
                  >
                    {Object.entries(ROLES).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <button
                    className="job-team__remove-btn"
                    onClick={() => onRemove?.(member.id)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ROLES };
