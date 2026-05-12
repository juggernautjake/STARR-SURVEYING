// app/admin/research/components/ElementDetailPanel.tsx — Element inspection panel
'use client';

import { useState } from 'react';
import type { DrawingElement, ConfidenceFactors, ElementStyle } from '@/types/research';
import { getConfidenceColor, getConfidenceLevel, CONFIDENCE_WEIGHTS } from '@/lib/research/confidence';
import Tooltip from './Tooltip';
import { confirm as confirmDialog } from './ConfirmDialog';

const DASH_PRESETS = [
  { label: 'Solid', value: '' },
  { label: 'Dashed', value: '10,5' },
  { label: 'Dotted', value: '3,3' },
  { label: 'Dash-Dot', value: '10,5,3,5' },
  { label: 'Long Dash', value: '15,5' },
  { label: 'Center', value: '15,5,5,5' },
];

const FONT_OPTIONS = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Tahoma'];

// Tooltip descriptions for confidence factors
const FACTOR_TIPS: Record<string, string> = {
  'Source Quality': 'How reliable is the original document? Higher-resolution scans and official records score better.',
  'Extraction Certainty': 'How confidently could the AI read this specific value from the document?',
  'Cross-Reference': 'Does this value match across multiple source documents? Higher means more agreement.',
  'Geometric Consistency': 'Does this element fit geometrically with neighboring elements (closure, angles, etc.)?',
  'Closure Contribution': 'How well does this element contribute to the overall boundary closure calculation?',
};

interface ElementDetailPanelProps {
  element: DrawingElement;
  onClose: () => void;
  onToggleVisibility?: (elementId: string, visible: boolean) => void;
  onToggleLock?: (elementId: string, locked: boolean) => void;
  onUpdateNotes?: (elementId: string, notes: string) => void;
  onStyleChange?: (elementId: string, style: Partial<ElementStyle>) => void;
  onViewSource?: (documentId: string, excerpt?: string) => void;
  onRevertElement?: (elementId: string) => void;
  showUITooltips?: boolean;
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
  showUITooltips = true,
}: ElementDetailPanelProps) {
  const [notes, setNotes] = useState(element.user_notes || '');
  const [showFactors, setShowFactors] = useState(false);
  const [showStyleEditor, setShowStyleEditor] = useState(false);

  const attrs = element.attributes as Record<string, unknown>;
  const confidenceLevel = getConfidenceLevel(element.confidence_score);
  const confidenceColor = getConfidenceColor(element.confidence_score);
  const tips = showUITooltips;

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
              <Tooltip text="This element was manually edited and differs from the AI-generated original" enabled={tips}>
                <span className="research-element-panel__edited-badge">*edited</span>
              </Tooltip>
            )}
          </div>
        </div>
        <Tooltip text="Close this element detail panel" enabled={tips}>
          <button
            className="research-element-panel__close"
            onClick={async () => {
              if (notes !== (element.user_notes || '')) {
                const ok = await confirmDialog({
                  title: 'Close without saving notes?',
                  body: 'You have unsaved notes on this element.',
                  confirmLabel: 'Close',
                  tone: 'danger',
                });
                if (!ok) return;
              }
              onClose();
            }}
            aria-label="Close panel"
          >
            &times;
          </button>
        </Tooltip>
      </div>

      {/* Edited banner with revert option */}
      {element.user_modified && (
        <div className="research-element-panel__edited-banner">
          <div className="research-element-panel__edited-info">
            <span className="research-element-panel__edited-icon">*</span>
            <span>This element has been manually edited. Its position, style, or attributes differ from the AI-generated original.</span>
          </div>
          {onRevertElement && (
            <Tooltip text="Restore this element to exactly how the AI originally generated it, discarding all your edits" enabled={tips} position="bottom">
              <button
                className="research-element-panel__revert-btn"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Revert element to its original state?',
                    body: 'Your edits will be lost.',
                    confirmLabel: 'Revert',
                    tone: 'danger',
                  });
                  if (ok) onRevertElement(element.id);
                }}
              >
                Revert to Original
              </button>
            </Tooltip>
          )}
        </div>
      )}

      {/* Confidence score */}
      <div className="research-element-panel__confidence">
        <div className="research-element-panel__confidence-header">
          <Tooltip text="How confident the AI is that this element is accurately positioned and measured. Green = high confidence, red = low confidence." enabled={tips}>
            <span className="research-element-panel__confidence-label">Confidence</span>
          </Tooltip>
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
        <Tooltip text="See what factors contribute to this confidence score — source quality, extraction certainty, cross-references, and more" enabled={tips}>
          <button
            className="research-element-panel__factors-toggle"
            onClick={() => setShowFactors(!showFactors)}
          >
            {showFactors ? '▾' : '▸'} Factor breakdown
          </button>
        </Tooltip>

        {showFactors && element.confidence_factors && (
          <div className="research-element-panel__factors">
            {renderFactorRow('Source Quality', element.confidence_factors.source_quality, CONFIDENCE_WEIGHTS.source_quality, tips)}
            {renderFactorRow('Extraction Certainty', element.confidence_factors.extraction_certainty, CONFIDENCE_WEIGHTS.extraction_certainty, tips)}
            {renderFactorRow('Cross-Reference', element.confidence_factors.cross_reference_match, CONFIDENCE_WEIGHTS.cross_reference_match, tips)}
            {renderFactorRow('Geometric Consistency', element.confidence_factors.geometric_consistency, CONFIDENCE_WEIGHTS.geometric_consistency, tips)}
            {renderFactorRow('Closure Contribution', element.confidence_factors.closure_contribution, CONFIDENCE_WEIGHTS.closure_contribution, tips)}
          </div>
        )}
      </div>

      {/* Style Editor */}
      {onStyleChange && (
        <div className="research-element-panel__section">
          <Tooltip text="Customize this element's appearance — change color, line width, pattern, fill, and opacity" enabled={tips}>
            <button
              className="research-element-panel__factors-toggle"
              onClick={() => setShowStyleEditor(!showStyleEditor)}
              style={{ fontWeight: 600 }}
            >
              {showStyleEditor ? '▾' : '▸'} Edit Style
            </button>
          </Tooltip>

          {showStyleEditor && (
            <div className="research-element-panel__style-editor">
              <div className="research-element-panel__style-row">
                <Tooltip text="The outline/line color for this element" enabled={tips} position="left">
                  <label>Stroke Color</label>
                </Tooltip>
                <input
                  type="color"
                  value={element.style.stroke}
                  onChange={e => onStyleChange(element.id, { stroke: e.target.value })}
                  className="research-prefs__color-input"
                />
              </div>
              <div className="research-element-panel__style-row">
                <Tooltip text="How thick the line is drawn (in points)" enabled={tips} position="left">
                  <label>Stroke Width</label>
                </Tooltip>
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
                <Tooltip text="The dash pattern — solid, dashed, dotted, or custom patterns" enabled={tips} position="left">
                  <label>Line Pattern</label>
                </Tooltip>
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
                  <Tooltip text="The interior fill color for closed shapes" enabled={tips} position="left">
                    <label>Fill Color</label>
                  </Tooltip>
                  <input
                    type="color"
                    value={element.style.fill}
                    onChange={e => onStyleChange(element.id, { fill: e.target.value })}
                    className="research-prefs__color-input"
                  />
                </div>
              )}
              <div className="research-element-panel__style-row">
                <Tooltip text="Transparency level — 0 is invisible, 1 is fully opaque" enabled={tips} position="left">
                  <label>Opacity</label>
                </Tooltip>
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

              {/* Font controls for label elements */}
              {element.element_type === 'label' && (
                <>
                  <div className="research-element-panel__style-row">
                    <Tooltip text="Font size for this label (in drawing units)" enabled={tips} position="left">
                      <label>Font Size</label>
                    </Tooltip>
                    <input
                      type="number"
                      min="4"
                      max="60"
                      step="1"
                      value={(element.style as ElementStyle & { fontSize?: number }).fontSize || 8}
                      onChange={e => onStyleChange(element.id, { fontSize: Number(e.target.value) } as Partial<ElementStyle>)}
                      className="research-prefs__num-input"
                    />
                  </div>
                  <div className="research-element-panel__style-row">
                    <Tooltip text="Font family for this label" enabled={tips} position="left">
                      <label>Font Family</label>
                    </Tooltip>
                    <select
                      value={(element.style as ElementStyle & { fontFamily?: string }).fontFamily || 'Arial'}
                      onChange={e => onStyleChange(element.id, { fontFamily: e.target.value } as Partial<ElementStyle>)}
                      className="research-prefs__select"
                    >
                      {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="research-element-panel__style-row">
                    <Tooltip text="Text color for this label" enabled={tips} position="left">
                      <label>Text Color</label>
                    </Tooltip>
                    <input
                      type="color"
                      value={element.style.stroke || '#000000'}
                      onChange={e => onStyleChange(element.id, { stroke: e.target.value })}
                      className="research-prefs__color-input"
                    />
                  </div>
                  <div className="research-element-panel__style-row">
                    <Tooltip text="Rotation angle for this label in degrees (positive = clockwise)" enabled={tips} position="left">
                      <label>Rotation°</label>
                    </Tooltip>
                    <input
                      type="number"
                      min="-180"
                      max="180"
                      step="1"
                      value={(attrs.rotation as number) || 0}
                      onChange={e => onStyleChange(element.id, { rotation: Number(e.target.value) } as Partial<ElementStyle>)}
                      className="research-prefs__num-input"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Attributes */}
      <div className="research-element-panel__section">
        <Tooltip text="Raw data attributes extracted by the AI — bearings, distances, coordinates, and other surveying measurements" enabled={tips}>
          <h4 className="research-element-panel__section-title">Attributes</h4>
        </Tooltip>
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
          <Tooltip text="The AI's detailed analysis and reasoning for how this element was interpreted from the source documents" enabled={tips}>
            <h4 className="research-element-panel__section-title">AI Analysis</h4>
          </Tooltip>
          <div className="research-element-panel__report">
            {element.ai_report}
          </div>
        </div>
      )}

      {/* Source References */}
      {element.source_references.length > 0 && (
        <div className="research-element-panel__section">
          <Tooltip text="The original documents where this data was found — click any source to view the document with the relevant section highlighted" enabled={tips}>
            <h4 className="research-element-panel__section-title">
              Sources ({element.source_references.length})
            </h4>
          </Tooltip>
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
          <Tooltip text="This element has conflicting data from different source documents. Review the Discrepancies tab to resolve them." enabled={tips}>
            <h4 className="research-element-panel__section-title">
              Discrepancies ({element.discrepancy_ids.length})
            </h4>
          </Tooltip>
          <div className="research-element-panel__disc-note">
            This element has {element.discrepancy_ids.length} related discrepanc{element.discrepancy_ids.length === 1 ? 'y' : 'ies'}.
            Check the Discrepancies tab in the Review step for details.
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="research-element-panel__actions">
        {onToggleVisibility && (
          <Tooltip text={element.visible ? 'Hide this element from the drawing (it can be shown again later)' : 'Make this hidden element visible on the drawing again'} enabled={tips}>
            <button
              className="research-element-panel__action-btn"
              onClick={() => onToggleVisibility(element.id, !element.visible)}
            >
              {element.visible ? 'Hide' : 'Show'}
            </button>
          </Tooltip>
        )}
        {onToggleLock && (
          <Tooltip text={element.locked ? 'Unlock this element so it can be moved, resized, or edited' : 'Lock this element to prevent accidental changes'} enabled={tips}>
            <button
              className="research-element-panel__action-btn"
              onClick={() => onToggleLock(element.id, !element.locked)}
            >
              {element.locked ? 'Unlock' : 'Lock'}
            </button>
          </Tooltip>
        )}
      </div>

      {/* User notes */}
      <div className="research-element-panel__section">
        <Tooltip text="Add your own notes about this element — observations, corrections needed, or review comments" enabled={tips}>
          <h4 className="research-element-panel__section-title">Notes</h4>
        </Tooltip>
        <textarea
          className="research-element-panel__notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add your notes about this element..."
          rows={3}
        />
        {notes !== (element.user_notes || '') && (
          <Tooltip text="Save your notes to the database" enabled={tips}>
            <button
              className="research-element-panel__save-btn"
              onClick={handleSaveNotes}
            >
              Save Notes
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ── Factor Row ───────────────────────────────────────────────────────────────

function renderFactorRow(label: string, score: number, weight: number, showTips: boolean): JSX.Element {
  const color = getConfidenceColor(score);
  const tipText = FACTOR_TIPS[label] || '';
  return (
    <div className="research-element-panel__factor">
      <div className="research-element-panel__factor-info">
        <Tooltip text={`${tipText} This factor is weighted at ${Math.round(weight * 100)}% of the total score.`} enabled={showTips} position="left">
          <span className="research-element-panel__factor-label">{label}</span>
        </Tooltip>
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
