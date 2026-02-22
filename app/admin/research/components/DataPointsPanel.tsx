// app/admin/research/components/DataPointsPanel.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ExtractedDataPoint, DataCategory } from '@/types/research';

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
  return '#EF4444';
}

function confidenceLabel(score: number | null | undefined): string {
  if (score == null) return '—';
  return `${score}%`;
}

export default function DataPointsPanel({ projectId, onViewSource }: DataPointsPanelProps) {
  const [grouped, setGrouped] = useState<Record<string, ExtractedDataPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [expandedDp, setExpandedDp] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<string>('all');

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

  return (
    <div className="research-review__data">
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
                          {onViewSource && (
                            <button
                              className="research-review__dp-view-source"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewSource(dp.document_id, dp.source_text_excerpt || undefined);
                              }}
                            >
                              View in source document
                            </button>
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
