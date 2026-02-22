// app/admin/research/components/DiscrepancyCard.tsx
'use client';

import { useState } from 'react';
import type { Discrepancy, ResolutionStatus } from '@/types/research';
import { SEVERITY_CONFIG } from '@/types/research';

interface DiscrepancyCardProps {
  discrepancy: Discrepancy;
  onResolve: (id: string, status: ResolutionStatus, notes: string) => Promise<void>;
}

const RESOLUTION_OPTIONS: { value: ResolutionStatus; label: string }[] = [
  { value: 'resolved', label: 'Resolved' },
  { value: 'accepted', label: 'Accept as-is' },
  { value: 'deferred', label: 'Defer — needs field verification' },
];

export default function DiscrepancyCard({ discrepancy: d, onResolve }: DiscrepancyCardProps) {
  const [showResolve, setShowResolve] = useState(false);
  const [resolutionStatus, setResolutionStatus] = useState<ResolutionStatus>('resolved');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const severity = SEVERITY_CONFIG[d.severity] || SEVERITY_CONFIG.info;
  const isResolved = d.resolution_status === 'resolved' || d.resolution_status === 'accepted';

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    await onResolve(d.id, resolutionStatus, resolutionNotes);
    setSaving(false);
    setShowResolve(false);
  }

  const affects = [
    d.affects_boundary && 'Boundary',
    d.affects_area && 'Area',
    d.affects_closure && 'Closure',
  ].filter(Boolean);

  return (
    <div className={`research-disc ${isResolved ? 'research-disc--resolved' : ''}`}>
      {/* Header */}
      <div className="research-disc__header">
        <span
          className="research-disc__severity"
          style={{ background: severity.color, color: '#fff' }}
        >
          {severity.icon} {severity.label}
        </span>
        <span className="research-disc__title">{d.title}</span>
        {isResolved && (
          <span className="research-disc__resolved-badge">Resolved</span>
        )}
      </div>

      {/* Probable cause */}
      {d.probable_cause && (
        <div className="research-disc__cause">
          Probable cause: {d.probable_cause.replace(/_/g, ' ')}
        </div>
      )}

      {/* Description */}
      <div className="research-disc__desc">{d.description}</div>

      {/* Affects badges */}
      {affects.length > 0 && (
        <div className="research-disc__affects">
          <span className="research-disc__affects-label">Affects:</span>
          {affects.map(a => (
            <span key={a} className="research-disc__affects-badge">{a}</span>
          ))}
        </div>
      )}

      {/* Estimated impact */}
      {d.estimated_impact && (
        <div className="research-disc__impact">
          Impact: {d.estimated_impact}
        </div>
      )}

      {/* AI Recommendation */}
      {d.ai_recommendation && (
        <div className="research-disc__recommendation">
          <span className="research-disc__recommendation-label">AI Recommendation:</span>
          <span className="research-disc__recommendation-text">{d.ai_recommendation}</span>
        </div>
      )}

      {/* Resolution info (if resolved) */}
      {isResolved && d.resolution_notes && (
        <div className="research-disc__resolution-info">
          <span className="research-disc__resolution-label">Resolution:</span>
          <span>{d.resolution_notes}</span>
          {d.resolved_by && (
            <span className="research-disc__resolution-by">by {d.resolved_by}</span>
          )}
        </div>
      )}

      {/* Actions */}
      {!isResolved && (
        <div className="research-disc__actions">
          <button
            className="research-disc__resolve-btn"
            onClick={() => setShowResolve(!showResolve)}
          >
            {showResolve ? 'Cancel' : 'Resolve'}
          </button>
        </div>
      )}

      {/* Resolution form */}
      {showResolve && (
        <div className="research-disc__resolve-form">
          <div className="research-disc__resolve-options">
            {RESOLUTION_OPTIONS.map(opt => (
              <label key={opt.value} className="research-disc__resolve-option">
                <input
                  type="radio"
                  name={`resolve-${d.id}`}
                  value={opt.value}
                  checked={resolutionStatus === opt.value}
                  onChange={() => setResolutionStatus(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <textarea
            className="research-disc__resolve-notes"
            placeholder="Add resolution notes (optional)..."
            value={resolutionNotes}
            onChange={e => setResolutionNotes(e.target.value)}
            rows={3}
          />
          <div className="research-disc__resolve-actions">
            <button
              className="research-disc__resolve-save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Resolution'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
