// app/admin/research/components/ElementDetailPanel.tsx — Element inspection panel
'use client';

import { useState } from 'react';
import type { DrawingElement, ConfidenceFactors, ElementStyle } from '@/types/research';
import { getConfidenceColor, getConfidenceLevel, CONFIDENCE_WEIGHTS } from '@/lib/research/confidence';

const DASH_PRESETS = [
  { label: 'Solid', value: '' },
  { label: 'Dashed', value: '10,5' },
  { label: 'Dotted', value: '3,3' },
  { label: 'Dash-Dot', value: '10,5,3,5' },
  { label: 'Long Dash', value: '15,5' },
  { label: 'Center', value: '15,5,5,5' },
];

interface ElementDetailPanelProps {
  element: DrawingElement;
  onClose: () => void;
  onToggleVisibility?: (elementId: string, visible: boolean) => void;
  onToggleLock?: (elementId: string, locked: boolean) => void;
  onUpdateNotes?: (elementId: string, notes: string) => void;
  onStyleChange?: (elementId: string, style: Partial<ElementStyle>) => void;
  onViewSource?: (documentId: string, excerpt?: string) => void;
  onRevertElement?: (elementId: string) => void;
}

export default function ElementDetailPanel({
  element,
  onClose,
  onToggleVisibility,
  onToggleLock,
  onUpdateNotes,
  onStyleChange,
  onViewSource,
  onRevertElement,
}: ElementDetailPanelProps) {
  const [notes, setNotes] = useState(element.user_notes || '');
  const [showFactors, setShowFactors] = useState(false);
  const [showStyleEditor, setShowStyleEditor] = useState(false);

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
              <span className="research-element-panel__edited-badge">*edited</span>
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

      {/* Edited banner with revert option */}
      {element.user_modified && (
        <div className="research-element-panel__edited-banner">
          <div className="research-element-panel__edited-info">
            <span className="research-element-panel__edited-icon">*</span>
            <span>This element has been manually edited. Its position, style, or attributes differ from the AI-generated original.</span>
          </div>
          {onRevertElement && (
            <button
              className="research-element-panel__revert-btn"
              onClick={() => {
                if (window.confirm('Revert this element to its original AI-generated state? Your edits will be lost.')) {
                  onRevertElement(element.id);
                }
              }}
            >
              Revert to Original
            </button>
          )}
        </div>
      )}

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

      {/* Style Editor */}
      {onStyleChange && (
        <div className="research-element-panel__section">
          <button
            className="research-element-panel__factors-toggle"
            onClick={() => setShowStyleEditor(!showStyleEditor)}
            style={{ fontWeight: 600 }}
          >
            {showStyleEditor ? '▾' : '▸'} Edit Style
          </button>

          {showStyleEditor && (
            <div className="research-element-panel__style-editor">
              <div className="research-element-panel__style-row">
                <label>Stroke Color</label>
                <input
                  type="color"
                  value={element.style.stroke}
                  onChange={e => onStyleChange(element.id, { stroke: e.target.value })}
                  className="research-prefs__color-input"
                />
              </div>
              <div className="research-element-panel__style-row">
                <label>Stroke Width</label>
                <input
                  type="number"
                  min="0.25"
                  max="10"
                  step="0.25"
                  value={element.style.strokeWidth}
                  onChange={e => onStyleChange(element.id, { strokeWidth: Number(e.target.value) })}
                  className="research-prefs__num-input"
                />
              </div>
              <div className="research-element-panel__style-row">
                <label>Line Pattern</label>
                <select
                  value={element.style.strokeDasharray || ''}
                  onChange={e => onStyleChange(element.id, { strokeDasharray: e.target.value })}
                  className="research-prefs__select"
                >
                  {DASH_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              {element.style.fill && element.style.fill !== 'none' && (
                <div className="research-element-panel__style-row">
                  <label>Fill Color</label>
                  <input
                    type="color"
                    value={element.style.fill}
                    onChange={e => onStyleChange(element.id, { fill: e.target.value })}
                    className="research-prefs__color-input"
                  />
                </div>
              )}
              <div className="research-element-panel__style-row">
                <label>Opacity</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={element.style.opacity}
                  onChange={e => onStyleChange(element.id, { opacity: Number(e.target.value) })}
                />
                <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>{element.style.opacity}</span>
              </div>
            </div>
          )}
        </div>
      )}

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
          <p className="research-element-panel__source-hint">
            Click a source to view the original document with the relevant section highlighted.
          </p>
          {element.source_references.map((ref, idx) => (
            <div
              key={idx}
              className={`research-element-panel__source ${onViewSource ? 'research-element-panel__source--clickable' : ''}`}
              onClick={() => onViewSource?.(ref.document_id, ref.excerpt)}
              role={onViewSource ? 'button' : undefined}
              tabIndex={onViewSource ? 0 : undefined}
              onKeyDown={e => { if (onViewSource && e.key === 'Enter') onViewSource(ref.document_id, ref.excerpt); }}
            >
              <div className="research-element-panel__source-info">
                <span className="research-element-panel__source-icon">
                  {ref.document_label?.match(/\.(pdf|PDF)/) ? '📄' :
                   ref.document_label?.match(/\.(png|jpg|jpeg|tif|tiff)/i) ? '🖼' :
                   ref.document_label?.match(/http/i) ? '🔗' : '📋'}
                </span>
                <span className="research-element-panel__source-doc">
                  {ref.document_label || 'Document'}
                </span>
              </div>
              <div className="research-element-panel__source-meta">
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
                <span className="research-element-panel__source-action">
                  View in document &rarr;
                </span>
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
