// app/admin/research/components/ElementDetailPanel.tsx — Element inspection panel
'use client';

import { useState } from 'react';
import type { DrawingElement, ConfidenceFactors } from '@/types/research';
import { getConfidenceColor, getConfidenceLevel, CONFIDENCE_WEIGHTS } from '@/lib/research/confidence';

interface ElementDetailPanelProps {
  element: DrawingElement;
  onClose: () => void;
  onToggleVisibility?: (elementId: string, visible: boolean) => void;
  onToggleLock?: (elementId: string, locked: boolean) => void;
  onUpdateNotes?: (elementId: string, notes: string) => void;
  onViewSource?: (documentId: string, excerpt?: string) => void;
}

export default function ElementDetailPanel({
  element,
  onClose,
  onToggleVisibility,
  onToggleLock,
  onUpdateNotes,
  onViewSource,
}: ElementDetailPanelProps) {
  const [notes, setNotes] = useState(element.user_notes || '');
  const [showFactors, setShowFactors] = useState(false);

  const attrs = element.attributes as Record<string, unknown>;
  const confidenceLevel = getConfidenceLevel(element.confidence_score);
  const confidenceColor = getConfidenceColor(element.confidence_score);

  function handleSaveNotes() {
    onUpdateNotes?.(element.id, notes);
  }

  return (
    <div className="research-element-panel">
      <div className="research-element-panel__header">
        <div>
          <h3 className="research-element-panel__title">
            {element.feature_class.replace(/_/g, ' ')}
          </h3>
          <div className="research-element-panel__type">
            {element.element_type} | Layer: {element.layer}
            {element.user_modified && (
              <span className="research-element-panel__modified"> (modified)</span>
            )}
          </div>
        </div>
        <button
          className="research-element-panel__close"
          onClick={onClose}
          aria-label="Close panel"
        >
          &times;
        </button>
      </div>

      {/* Confidence score */}
      <div className="research-element-panel__confidence">
        <div className="research-element-panel__confidence-header">
          <span className="research-element-panel__confidence-label">Confidence</span>
          <span
            className="research-element-panel__confidence-value"
            style={{ color: confidenceColor }}
          >
            {Math.round(element.confidence_score)}%
          </span>
          <span className="research-element-panel__confidence-level" style={{ color: confidenceColor }}>
            {confidenceLevel.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="research-element-panel__confidence-bar">
          <div
            className="research-element-panel__confidence-fill"
            style={{ width: `${element.confidence_score}%`, background: confidenceColor }}
          />
        </div>

        {/* Expandable factor breakdown */}
        <button
          className="research-element-panel__factors-toggle"
          onClick={() => setShowFactors(!showFactors)}
        >
          {showFactors ? '▾' : '▸'} Factor breakdown
        </button>

        {showFactors && element.confidence_factors && (
          <div className="research-element-panel__factors">
            {renderFactorRow('Source Quality', element.confidence_factors.source_quality, CONFIDENCE_WEIGHTS.source_quality)}
            {renderFactorRow('Extraction Certainty', element.confidence_factors.extraction_certainty, CONFIDENCE_WEIGHTS.extraction_certainty)}
            {renderFactorRow('Cross-Reference', element.confidence_factors.cross_reference_match, CONFIDENCE_WEIGHTS.cross_reference_match)}
            {renderFactorRow('Geometric Consistency', element.confidence_factors.geometric_consistency, CONFIDENCE_WEIGHTS.geometric_consistency)}
            {renderFactorRow('Closure Contribution', element.confidence_factors.closure_contribution, CONFIDENCE_WEIGHTS.closure_contribution)}
          </div>
        )}
      </div>

      {/* Attributes */}
      <div className="research-element-panel__section">
        <h4 className="research-element-panel__section-title">Attributes</h4>
        <div className="research-element-panel__attrs">
          {Object.entries(attrs).map(([key, value]) => {
            if (value === null || value === undefined) return null;
            const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
            return (
              <div key={key} className="research-element-panel__attr">
                <span className="research-element-panel__attr-key">{key.replace(/_/g, ' ')}</span>
                <span className="research-element-panel__attr-value">{display}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Report */}
      {element.ai_report && (
        <div className="research-element-panel__section">
          <h4 className="research-element-panel__section-title">AI Analysis</h4>
          <div className="research-element-panel__report">
            {element.ai_report}
          </div>
        </div>
      )}

      {/* Source References */}
      {element.source_references.length > 0 && (
        <div className="research-element-panel__section">
          <h4 className="research-element-panel__section-title">
            Sources ({element.source_references.length})
          </h4>
          {element.source_references.map((ref, idx) => (
            <div key={idx} className="research-element-panel__source">
              <div className="research-element-panel__source-info">
                <span className="research-element-panel__source-doc">
                  {ref.document_label || 'Document'}
                </span>
                {ref.page && (
                  <span className="research-element-panel__source-page">
                    Page {ref.page}
                  </span>
                )}
                {ref.location && (
                  <span className="research-element-panel__source-loc">
                    {ref.location}
                  </span>
                )}
              </div>
              {ref.excerpt && (
                <div className="research-element-panel__source-excerpt">
                  &ldquo;{ref.excerpt}&rdquo;
                </div>
              )}
              {onViewSource && (
                <button
                  className="research-element-panel__source-btn"
                  onClick={() => onViewSource(ref.document_id, ref.excerpt)}
                >
                  View source
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Discrepancies */}
      {element.discrepancy_ids.length > 0 && (
        <div className="research-element-panel__section">
          <h4 className="research-element-panel__section-title">
            Discrepancies ({element.discrepancy_ids.length})
          </h4>
          <div className="research-element-panel__disc-note">
            This element has {element.discrepancy_ids.length} related discrepanc{element.discrepancy_ids.length === 1 ? 'y' : 'ies'}.
            Check the Discrepancies tab in the Review step for details.
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="research-element-panel__actions">
        {onToggleVisibility && (
          <button
            className="research-element-panel__action-btn"
            onClick={() => onToggleVisibility(element.id, !element.visible)}
          >
            {element.visible ? 'Hide' : 'Show'}
          </button>
        )}
        {onToggleLock && (
          <button
            className="research-element-panel__action-btn"
            onClick={() => onToggleLock(element.id, !element.locked)}
          >
            {element.locked ? 'Unlock' : 'Lock'}
          </button>
        )}
      </div>

      {/* User notes */}
      <div className="research-element-panel__section">
        <h4 className="research-element-panel__section-title">Notes</h4>
        <textarea
          className="research-element-panel__notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add your notes about this element..."
          rows={3}
        />
        {notes !== (element.user_notes || '') && (
          <button
            className="research-element-panel__save-btn"
            onClick={handleSaveNotes}
          >
            Save Notes
          </button>
        )}
      </div>
    </div>
  );
}

// ── Factor Row ───────────────────────────────────────────────────────────────

function renderFactorRow(label: string, score: number, weight: number): JSX.Element {
  const color = getConfidenceColor(score);
  return (
    <div className="research-element-panel__factor">
      <div className="research-element-panel__factor-info">
        <span className="research-element-panel__factor-label">{label}</span>
        <span className="research-element-panel__factor-weight">({Math.round(weight * 100)}%)</span>
      </div>
      <div className="research-element-panel__factor-bar-wrap">
        <div className="research-element-panel__factor-bar">
          <div
            className="research-element-panel__factor-fill"
            style={{ width: `${score}%`, background: color }}
          />
        </div>
        <span className="research-element-panel__factor-score" style={{ color }}>{Math.round(score)}</span>
      </div>
    </div>
  );
}
