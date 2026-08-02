// app/admin/research/components/DataPointsPanel.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ExtractedDataPoint, DataCategory } from '@/types/research';
// "The AI said" must not render as "here is the deed, at this line" (research plan R17).
import { evidenceFor, evidenceTotals } from '@/lib/research/fact-evidence';
// Whether a PERSON has looked — an axis independent of whether there is evidence (research plan R23).
import { reviewMeta, reviewProgress, type ReviewStatus } from '@/lib/research/fact-review';

interface DataPointsPanelProps {
  projectId: string;
  onViewSource?: (documentId: string, excerpt?: string) => void;
}

const CATEGORY_LABELS: Partial<Record<DataCategory, { label: string; icon: string }>> = {
  call:                 { label: 'Boundary Calls', icon: '📏' },
  bearing:              { label: 'Bearings', icon: '🧭' },
  distance:             { label: 'Distances', icon: '📐' },
  monument:             { label: 'Monuments', icon: '📍' },
  point_of_beginning:   { label: 'Point of Beginning', icon: '🎯' },
  curve_data:           { label: 'Curve Data', icon: '🔄' },
  area:                 { label: 'Area', icon: '📊' },
  boundary_description: { label: 'Boundary Descriptions', icon: '📋' },
  easement:             { label: 'Easements', icon: '🛤️' },
  setback:              { label: 'Setbacks', icon: '↔️' },
  right_of_way:         { label: 'Right of Way', icon: '🛣️' },
  adjoiner:             { label: 'Adjoiners', icon: '🏘️' },
  recording_reference:  { label: 'Recording References', icon: '📜' },
  date_reference:       { label: 'Date References', icon: '📅' },
  surveyor_info:        { label: 'Surveyor Info', icon: '👷' },
  legal_description:    { label: 'Legal Description', icon: '⚖️' },
  lot_block:            { label: 'Lot/Block', icon: '🏗️' },
  subdivision_name:     { label: 'Subdivision', icon: '🏘️' },
  coordinate:           { label: 'Coordinates', icon: '📌' },
  elevation:            { label: 'Elevations', icon: '🏔️' },
  flood_zone:           { label: 'Flood Zone', icon: '🌊' },
  other:                { label: 'Other', icon: '📎' },
};

// Priority ordering for categories
const CATEGORY_ORDER: DataCategory[] = [
  'point_of_beginning', 'call', 'bearing', 'distance', 'curve_data',
  'monument', 'area', 'boundary_description', 'easement', 'setback',
  'right_of_way', 'adjoiner', 'legal_description', 'lot_block',
  'subdivision_name', 'recording_reference', 'date_reference',
  'surveyor_info', 'coordinate', 'elevation', 'flood_zone', 'other',
];

function confidenceColor(score: number | null | undefined): string {
  if (score == null) return '#9CA3AF';
  if (score >= 85) return '#059669';
  if (score >= 60) return '#F59E0B';
  return 'var(--color-error)';
}

function confidenceLabel(score: number | null | undefined): string {
  if (score == null) return '—';
  return `${score}%`;
}

/** Evidence is not confidence, and the two must not share a visual language. Confidence is the
 *  model's opinion of its own output; evidence is whether there is a page to go and look at. A
 *  95%-confident fact with no source is weaker than a 70%-confident quoted one, and the colours have
 *  to say so. */
const EVIDENCE_TONE: Record<string, string> = {
  located:  'var(--color-success-text, #059669)',
  quoted:   'var(--color-success-text, #059669)',
  page:     'var(--color-text-secondary, #6B7280)',
  document: 'var(--color-text-secondary, #6B7280)',
  asserted: 'var(--color-error, #DC2626)',
};

export default function DataPointsPanel({ projectId, onViewSource }: DataPointsPanelProps) {
  const [grouped, setGrouped] = useState<Record<string, ExtractedDataPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [expandedDp, setExpandedDp] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<string>('all');
  // Review state (plan R23).
  const [savingReview, setSavingReview] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState('');

  const loadData = useCallback(async () => {
    try {
      const url = filterCategory !== 'all'
        ? `/api/admin/research/${projectId}/data-points?category=${filterCategory}`
        : `/api/admin/research/${projectId}/data-points`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setGrouped(data.grouped || {});
        setTotal(data.total || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId, filterCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** Record a verdict on one fact (plan R23). Updates in place rather than reloading the list, so a
   *  reviewer working down fifty facts does not lose their scroll position on every click. */
  const review = useCallback(async (
    dp: ExtractedDataPoint,
    status: ReviewStatus,
    correctedValue?: string,
  ) => {
    setSavingReview(dp.id);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/data-points/${dp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: status, corrected_value: correctedValue ?? null }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setReviewError(err.error ?? 'The review could not be saved.');
        return;
      }
      const { data_point } = await res.json() as { data_point: ExtractedDataPoint };
      setReviewError(null);
      setGrouped(prev => {
        const next: Record<string, ExtractedDataPoint[]> = {};
        for (const [cat, list] of Object.entries(prev)) {
          next[cat] = list.map(x => (x.id === data_point.id ? data_point : x));
        }
        return next;
      });
      setCorrecting(null);
    } catch {
      setReviewError('Unable to save the review — check your connection.');
    } finally {
      setSavingReview(null);
    }
  }, [projectId]);

  function toggleGroup(cat: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  // Sort categories by priority
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a as DataCategory);
    const ib = CATEGORY_ORDER.indexOf(b as DataCategory);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const availableCategories = Object.keys(grouped);

  if (loading) {
    return (
      <div className="research-review__loading">
        <div className="research-card__skeleton-line research-card__skeleton-line--long" />
        <div className="research-card__skeleton-line research-card__skeleton-line--medium" />
        <div className="research-card__skeleton-line research-card__skeleton-line--short" />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="research-review__empty">
        No data points were extracted. Check your documents and try running analysis again.
      </div>
    );
  }

  // Leads with what is UNEVIDENCED rather than with the total: "412 data points extracted" reads as
  // thoroughness, while "412 extracted, 38 with no source" reads as a work list (plan R17).
  const allPoints = Object.values(grouped).flat();
  const totals = evidenceTotals(allPoints);
  const progress = reviewProgress(allPoints);

  return (
    <div className="research-review__data">
      <p
        className={`research-review__evidence-headline${
          totals.unevidenced > 0 ? ' research-review__evidence-headline--warn' : ''
        }`}
      >
        {totals.headline}
      </p>
      {/* How much of this has a person actually checked (plan R23). */}
      <p className="research-review__evidence-headline">{progress.headline}</p>
      {reviewError && (
        <p className="research-review__evidence-headline research-review__evidence-headline--warn">
          {reviewError}
        </p>
      )}

      {/* Category filter */}
      {availableCategories.length > 1 && (
        <div className="research-review__filters">
          <button
            className={`research-review__filter-chip ${filterCategory === 'all' ? 'research-review__filter-chip--active' : ''}`}
            onClick={() => setFilterCategory('all')}
          >
            All ({total})
          </button>
          {sortedCategories.map(cat => {
            const info = CATEGORY_LABELS[cat as DataCategory];
            return (
              <button
                key={cat}
                className={`research-review__filter-chip ${filterCategory === cat ? 'research-review__filter-chip--active' : ''}`}
                onClick={() => setFilterCategory(cat)}
              >
                {info?.icon || '📎'} {info?.label || cat.replace(/_/g, ' ')} ({grouped[cat]?.length || 0})
              </button>
            );
          })}
        </div>
      )}

      {/* Grouped data points */}
      {sortedCategories.map(cat => {
        const points = grouped[cat] || [];
        const info = CATEGORY_LABELS[cat as DataCategory];
        const isCollapsed = collapsedGroups.has(cat);

        return (
          <div key={cat} className="research-review__group">
            <button
              className="research-review__group-header"
              onClick={() => toggleGroup(cat)}
            >
              <span className="research-review__group-icon">{info?.icon || '📎'}</span>
              <span className="research-review__group-title">
                {info?.label || cat.replace(/_/g, ' ')}
              </span>
              <span className="research-review__group-count">{points.length}</span>
              <span className="research-review__group-chevron">
                {isCollapsed ? '▸' : '▾'}
              </span>
            </button>

            {!isCollapsed && (
              <div className="research-review__group-body">
                {points.map(dp => {
                  const isExpanded = expandedDp === dp.id;
                  return (
                    <div key={dp.id} className="research-review__dp">
                      <div
                        className="research-review__dp-main"
                        onClick={() => setExpandedDp(isExpanded ? null : dp.id)}
                      >
                        <div className="research-review__dp-value">
                          {dp.display_value || dp.raw_value}
                        </div>
                        <div className="research-review__dp-meta">
                          {dp.sequence_order != null && (
                            <span className="research-review__dp-seq">#{dp.sequence_order}</span>
                          )}
                          {/* Two independent axes: whether there is EVIDENCE (R17) and whether a
                              person has LOOKED (R23). A quoted fact can still be misread, and an
                              unevidenced one can be confirmed by a surveyor who knows the property. */}
                          <span
                            className={`research-review__dp-review research-review__dp-review--${reviewMeta(dp).status}`}
                            title={reviewMeta(dp).detail}
                          >
                            {reviewMeta(dp).label}
                          </span>
                          <span
                            className="research-review__dp-evidence"
                            style={{ color: EVIDENCE_TONE[evidenceFor(dp).strength] }}
                            title={evidenceFor(dp).detail}
                          >
                            {evidenceFor(dp).label}
                          </span>
                          <span
                            className="research-review__dp-confidence"
                            style={{ color: confidenceColor(dp.extraction_confidence) }}
                          >
                            {confidenceLabel(dp.extraction_confidence)}
                          </span>
                          <span className="research-review__dp-expand">
                            {isExpanded ? '▾' : 'ℹ️'}
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="research-review__dp-detail">
                          {dp.source_text_excerpt && (
                            <div className="research-review__dp-excerpt">
                              <span className="research-review__dp-detail-label">Source:</span>
                              <span className="research-review__dp-detail-value">
                                &ldquo;{dp.source_text_excerpt}&rdquo;
                              </span>
                            </div>
                          )}
                          {dp.source_location && (
                            <div className="research-review__dp-loc">
                              <span className="research-review__dp-detail-label">Location:</span>
                              <span className="research-review__dp-detail-value">
                                {dp.source_page ? `Page ${dp.source_page}, ` : ''}{dp.source_location}
                              </span>
                            </div>
                          )}
                          {dp.confidence_reasoning && (
                            <div className="research-review__dp-reasoning">
                              <span className="research-review__dp-detail-label">AI Note:</span>
                              <span className="research-review__dp-detail-value">{dp.confidence_reasoning}</span>
                            </div>
                          )}
                          {dp.sequence_group && (
                            <div className="research-review__dp-group-info">
                              <span className="research-review__dp-detail-label">Group:</span>
                              <span className="research-review__dp-detail-value">
                                {dp.sequence_group.replace(/_/g, ' ')}
                              </span>
                            </div>
                          )}
                          {/* Accept / reject / correct (plan R23). A reviewer who spots a wrong
                              bearing had nowhere to put that knowledge before this. */}
                          <div className="research-review__dp-verdict">
                            <span className="research-review__dp-detail-label">Verdict:</span>
                            <span className="research-review__dp-detail-value">{reviewMeta(dp).detail}</span>
                            <div className="research-review__dp-verdict-actions">
                              {(['accepted', 'rejected'] as const).map(s => (
                                <button
                                  key={s}
                                  className={`research-review__dp-verdict-btn${
                                    reviewMeta(dp).status === s ? ' research-review__dp-verdict-btn--on' : ''
                                  }`}
                                  disabled={savingReview === dp.id}
                                  onClick={(e) => { e.stopPropagation(); void review(dp, s); }}
                                >
                                  {s === 'accepted' ? 'Accept' : 'Reject'}
                                </button>
                              ))}
                              <button
                                className="research-review__dp-verdict-btn"
                                disabled={savingReview === dp.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCorrecting(correcting === dp.id ? null : dp.id);
                                  setCorrectionDraft(dp.corrected_value ?? dp.display_value ?? dp.raw_value);
                                }}
                              >
                                Correct…
                              </button>
                              {reviewMeta(dp).status !== 'unreviewed' && (
                                <button
                                  className="research-review__dp-verdict-btn"
                                  disabled={savingReview === dp.id}
                                  onClick={(e) => { e.stopPropagation(); void review(dp, 'unreviewed'); }}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            {correcting === dp.id && (
                              <div className="research-review__dp-correction" onClick={e => e.stopPropagation()}>
                                <input
                                  className="research-review__dp-correction-input"
                                  value={correctionDraft}
                                  onChange={e => setCorrectionDraft(e.target.value)}
                                  placeholder="What the document actually says"
                                />
                                <button
                                  className="research-review__dp-verdict-btn research-review__dp-verdict-btn--on"
                                  disabled={savingReview === dp.id || !correctionDraft.trim()}
                                  onClick={() => void review(dp, 'corrected', correctionDraft.trim())}
                                >
                                  Save correction
                                </button>
                                {/* Said out loud: the original is kept, which is what makes the
                                    pair usable as a golden record for the self-healing checks. */}
                                <span className="research-review__dp-correction-note">
                                  The original extraction is kept — this records what it should have said.
                                </span>
                              </div>
                            )}
                          </div>

                          {/* The evidence sentence, always — it is the answer to "how do you know
                              that?", which is the question a reviewer is actually asking. */}
                          <div className="research-review__dp-evidence-detail">
                            <span className="research-review__dp-detail-label">Evidence:</span>
                            <span className="research-review__dp-detail-value">{evidenceFor(dp).detail}</span>
                          </div>
                          {onViewSource && (
                            evidenceFor(dp).canLocate ? (
                              <button
                                className="research-review__dp-view-source"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewSource(dp.document_id, dp.source_text_excerpt || undefined);
                                }}
                              >
                                View in source document
                              </button>
                            ) : (
                              // Offered on every row before, including rows with nothing to find —
                              // and a button that opens a document and lands nowhere teaches a
                              // reviewer that the whole affordance is unreliable.
                              <span className="research-review__dp-no-source">
                                Nothing to open — this value has no recorded source.
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
