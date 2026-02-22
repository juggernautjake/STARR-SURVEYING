// app/admin/research/components/VerificationPanel.tsx — Verification dashboard
// Shows overall confidence, breakdown chart, math checks, and persisting issues
'use client';

import { useState } from 'react';
import type { ComparisonResult, PersistingIssue, MathCheckSummary } from '@/types/research';
import { SEVERITY_CONFIG } from '@/types/research';
import Tooltip from './Tooltip';

interface VerificationPanelProps {
  comparison: ComparisonResult | null;
  isVerifying: boolean;
  onRunVerification: () => void;
  onReVerify: () => void;
  onAdvanceToExport: () => void;
  drawingName: string;
  showUITooltips?: boolean;
}

// ── Confidence Level Helpers ────────────────────────────────────────────────

function getConfidenceGrade(score: number): { label: string; color: string; bg: string } {
  if (score >= 90) return { label: 'Excellent', color: '#059669', bg: '#ECFDF5' };
  if (score >= 75) return { label: 'Good', color: '#2563EB', bg: '#EFF6FF' };
  if (score >= 55) return { label: 'Fair', color: '#F59E0B', bg: '#FFFBEB' };
  if (score >= 35) return { label: 'Poor', color: '#F97316', bg: '#FFF7ED' };
  return { label: 'Very Low', color: '#EF4444', bg: '#FEF2F2' };
}

const BREAKDOWN_LABELS: Record<string, { label: string; tip: string }> = {
  boundary_accuracy: { label: 'Boundary', tip: 'Accuracy of property boundary lines compared to source documents' },
  monument_accuracy: { label: 'Monuments', tip: 'Accuracy of survey monument placement and identification' },
  easement_accuracy: { label: 'Easements', tip: 'Accuracy of easement and right-of-way line positions' },
  area_accuracy: { label: 'Area', tip: 'How closely the computed area matches the stated area in source documents' },
  closure_quality: { label: 'Closure', tip: 'Quality of the traverse closure — how well the boundary returns to the starting point' },
};

// ── Main Component ──────────────────────────────────────────────────────────

export default function VerificationPanel({
  comparison,
  isVerifying,
  onRunVerification,
  onReVerify,
  onAdvanceToExport,
  drawingName,
  showUITooltips = true,
}: VerificationPanelProps) {
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const tips = showUITooltips;

  // Not yet verified — show CTA
  if (!comparison && !isVerifying) {
    return (
      <div className="research-verify">
        <div className="research-verify__cta">
          <div className="research-verify__cta-icon">&#128269;</div>
          <h3 className="research-verify__cta-title">Verify Drawing Accuracy</h3>
          <p className="research-verify__cta-text">
            Run the AI verification engine to compare <strong>{drawingName}</strong> against
            all source documents. This performs mathematical checks (closure, area, calls)
            and a semantic comparison to generate a confidence score.
          </p>
          <button
            className="research-verify__cta-btn"
            onClick={onRunVerification}
          >
            Run Verification
          </button>
        </div>
      </div>
    );
  }

  // Verifying in progress
  if (isVerifying) {
    return (
      <div className="research-verify">
        <div className="research-verify__loading">
          <div className="research-verify__spinner" />
          <h3 className="research-verify__loading-title">Verifying Drawing...</h3>
          <p className="research-verify__loading-text">
            Running mathematical checks and AI comparison against source documents.
            This may take 30-60 seconds.
          </p>
        </div>
      </div>
    );
  }

  // Verification complete — show results
  const grade = getConfidenceGrade(comparison!.overall_confidence);
  const c = comparison!;

  return (
    <div className="research-verify">
      {/* Overall Confidence Score */}
      <div className="research-verify__score-card" style={{ borderColor: grade.color }}>
        <div className="research-verify__score-header">
          <Tooltip text="Overall confidence score based on element accuracy (40%), math checks (25%), AI comparison (20%), and discrepancy resolution (15%)" enabled={tips} position="bottom">
            <h3 className="research-verify__score-label">Overall Confidence</h3>
          </Tooltip>
          <span className="research-verify__timestamp">
            Verified {new Date(c.ran_at).toLocaleString()}
          </span>
        </div>
        <div className="research-verify__score-row">
          <div className="research-verify__score-circle" style={{ borderColor: grade.color, color: grade.color }}>
            <span className="research-verify__score-number">{c.overall_confidence}</span>
            <span className="research-verify__score-pct">%</span>
          </div>
          <div className="research-verify__score-info">
            <span className="research-verify__score-grade" style={{ color: grade.color, background: grade.bg }}>
              {grade.label}
            </span>
            <p className="research-verify__score-notes">{c.comparison_notes}</p>
          </div>
        </div>
      </div>

      {/* Confidence Breakdown Bars */}
      <div className="research-verify__breakdown">
        <h4 className="research-verify__section-title">Confidence Breakdown</h4>
        <div className="research-verify__breakdown-grid">
          {Object.entries(c.confidence_breakdown).map(([key, value]) => {
            const info = BREAKDOWN_LABELS[key] || { label: key, tip: '' };
            const barGrade = getConfidenceGrade(value);
            return (
              <Tooltip key={key} text={info.tip} enabled={tips} position="top">
                <div className="research-verify__bar-row">
                  <span className="research-verify__bar-label">{info.label}</span>
                  <div className="research-verify__bar-track">
                    <div
                      className="research-verify__bar-fill"
                      style={{ width: `${value}%`, background: barGrade.color }}
                    />
                  </div>
                  <span className="research-verify__bar-value" style={{ color: barGrade.color }}>
                    {value}%
                  </span>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Mathematical Checks */}
      <div className="research-verify__math">
        <h4 className="research-verify__section-title">Mathematical Checks</h4>
        <MathChecksTable checks={c.math_checks} tips={tips} />
      </div>

      {/* Persisting Issues */}
      {c.persisting_issues.length > 0 && (
        <div className="research-verify__issues">
          <h4 className="research-verify__section-title">
            Persisting Issues ({c.persisting_issues.length})
          </h4>
          <div className="research-verify__issues-list">
            {c.persisting_issues.map((issue, idx) => (
              <IssueRow
                key={idx}
                issue={issue}
                expanded={expandedIssue === idx}
                onToggle={() => setExpandedIssue(expandedIssue === idx ? null : idx)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="research-verify__actions">
        <Tooltip text="Re-run the verification after making drawing changes" enabled={tips} position="top">
          <button className="research-verify__action-btn research-verify__action-btn--secondary" onClick={onReVerify}>
            Re-Verify
          </button>
        </Tooltip>
        <Tooltip text="Proceed to the export step to download your drawing" enabled={tips} position="top">
          <button className="research-verify__action-btn research-verify__action-btn--primary" onClick={onAdvanceToExport}>
            Continue to Export
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

// ── Math Checks Table ───────────────────────────────────────────────────────

function MathChecksTable({ checks, tips }: { checks: MathCheckSummary; tips: boolean }) {
  const rows: { label: string; value: string; status: 'pass' | 'warn' | 'fail' | 'na'; tip: string }[] = [
    {
      label: 'Traverse Closure',
      value: checks.closure_precision !== null
        ? `1:${checks.closure_precision.toLocaleString()} (${checks.closure_misclosure_ft?.toFixed(3)} ft)`
        : 'N/A',
      status: checks.closure_precision === null ? 'na'
        : checks.closure_precision >= 10000 ? 'pass'
        : checks.closure_precision >= 5000 ? 'warn' : 'fail',
      tip: 'How accurately the boundary traverse returns to the starting point. 1:10,000+ is professional grade.',
    },
    {
      label: 'Area Comparison',
      value: checks.area_stated_acres !== null && checks.area_computed_acres !== null
        ? `Stated: ${checks.area_stated_acres.toFixed(3)} ac | Computed: ${checks.area_computed_acres.toFixed(3)} ac (diff: ${checks.area_difference_acres?.toFixed(4)} ac)`
        : 'N/A',
      status: checks.area_difference_acres === null ? 'na'
        : checks.area_difference_acres < 0.01 ? 'pass'
        : checks.area_difference_acres < 0.05 ? 'warn' : 'fail',
      tip: 'Comparison between the area stated in source documents and the area computed from the drawing geometry.',
    },
    {
      label: 'Call Verification',
      value: `${checks.calls_verified} of ${checks.calls_total} calls verified`,
      status: checks.calls_total === 0 ? 'na'
        : checks.calls_verified / checks.calls_total >= 0.95 ? 'pass'
        : checks.calls_verified / checks.calls_total >= 0.7 ? 'warn' : 'fail',
      tip: 'How many bearing/distance calls from source documents have a corresponding element in the drawing.',
    },
    {
      label: 'Line Continuity',
      value: checks.continuity_ok ? 'All lines connected' : 'Gaps detected',
      status: checks.continuity_ok ? 'pass' : 'fail',
      tip: 'Whether adjacent boundary lines share endpoints (no gaps between segments).',
    },
  ];

  const STATUS_ICONS: Record<string, string> = { pass: '\u2705', warn: '\u26A0\uFE0F', fail: '\u274C', na: '\u2014' };

  return (
    <div className="research-verify__math-table">
      {rows.map(row => (
        <Tooltip key={row.label} text={row.tip} enabled={tips} position="right">
          <div className={`research-verify__math-row research-verify__math-row--${row.status}`}>
            <span className="research-verify__math-icon">{STATUS_ICONS[row.status]}</span>
            <span className="research-verify__math-label">{row.label}</span>
            <span className="research-verify__math-value">{row.value}</span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

// ── Issue Row ───────────────────────────────────────────────────────────────

function IssueRow({ issue, expanded, onToggle }: { issue: PersistingIssue; expanded: boolean; onToggle: () => void }) {
  const severity = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.info;

  return (
    <div className={`research-verify__issue ${expanded ? 'research-verify__issue--expanded' : ''}`}>
      <button className="research-verify__issue-header" onClick={onToggle}>
        <span className="research-verify__issue-severity" style={{ background: severity.color, color: '#fff' }}>
          {severity.icon} {severity.label}
        </span>
        <span className="research-verify__issue-title">{issue.title}</span>
        <span className="research-verify__issue-arrow">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div className="research-verify__issue-body">
          <p className="research-verify__issue-desc">{issue.description}</p>
          <div className="research-verify__issue-rec">
            <strong>Recommendation:</strong> {issue.recommendation}
          </div>
        </div>
      )}
    </div>
  );
}
