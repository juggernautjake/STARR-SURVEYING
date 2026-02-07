// app/admin/components/error/ErrorReportDialog.tsx — User-facing error report modal
'use client';

import { useState } from 'react';
import type { ErrorReport } from '@/lib/errorHandler';

interface ErrorReportDialogProps {
  errorMessage: string;
  errorType: string;
  pagePath: string;
  componentName?: string;
  onSubmit: (feedback: {
    notes: string;
    expected: string;
    causeGuess: string;
    severity: ErrorReport['severity'];
  }) => void;
  onDismiss: () => void;
}

const ERROR_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  render: { label: 'Display Error', icon: '🖥️', color: '#EF4444' },
  api: { label: 'Server Error', icon: '🌐', color: '#F59E0B' },
  runtime: { label: 'Application Error', icon: '⚠️', color: '#EF4444' },
  promise: { label: 'Background Error', icon: '🔄', color: '#8B5CF6' },
  network: { label: 'Network Error', icon: '📡', color: '#3B82F6' },
  validation: { label: 'Validation Error', icon: '📝', color: '#F59E0B' },
  auth: { label: 'Authentication Error', icon: '🔒', color: '#EF4444' },
  unknown: { label: 'Unexpected Error', icon: '❓', color: '#6B7280' },
};

const SEVERITY_OPTIONS: { value: ErrorReport['severity']; label: string; color: string; desc: string }[] = [
  { value: 'low', label: 'Low', color: '#3B82F6', desc: 'Minor issue, can work around it' },
  { value: 'medium', label: 'Medium', color: '#F59E0B', desc: 'Noticeable issue, slows me down' },
  { value: 'high', label: 'High', color: '#EF4444', desc: 'Major issue, can\'t complete my task' },
  { value: 'critical', label: 'Critical', color: '#991B1B', desc: 'Everything is broken' },
];

export default function ErrorReportDialog({
  errorMessage,
  errorType,
  pagePath,
  componentName,
  onSubmit,
  onDismiss,
}: ErrorReportDialogProps) {
  const [notes, setNotes] = useState('');
  const [expected, setExpected] = useState('');
  const [causeGuess, setCauseGuess] = useState('');
  const [severity, setSeverity] = useState<ErrorReport['severity']>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const typeInfo = ERROR_TYPE_LABELS[errorType] || ERROR_TYPE_LABELS.unknown;

  async function handleSubmit() {
    setSubmitting(true);
    await onSubmit({ notes, expected, causeGuess, severity });
    setSubmitting(false);
  }

  return (
    <div className="err-dialog-overlay" onClick={onDismiss}>
      <div className="err-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="err-dialog__header">
          <div className="err-dialog__header-left">
            <span className="err-dialog__icon">{typeInfo.icon}</span>
            <div>
              <h3 className="err-dialog__title">Something went wrong</h3>
              <span className="err-dialog__type" style={{ color: typeInfo.color }}>{typeInfo.label}</span>
            </div>
          </div>
          <button className="err-dialog__close" onClick={onDismiss} title="Dismiss">✕</button>
        </div>

        {/* Error summary */}
        <div className="err-dialog__error-box">
          <p className="err-dialog__error-msg">{errorMessage}</p>
          <button className="err-dialog__toggle-details" onClick={() => setShowDetails(!showDetails)}>
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          {showDetails && (
            <div className="err-dialog__details">
              <div className="err-dialog__detail-row">
                <span className="err-dialog__detail-label">Page</span>
                <span className="err-dialog__detail-value">{pagePath}</span>
              </div>
              <div className="err-dialog__detail-row">
                <span className="err-dialog__detail-label">Type</span>
                <span className="err-dialog__detail-value">{errorType}</span>
              </div>
              {componentName && (
                <div className="err-dialog__detail-row">
                  <span className="err-dialog__detail-label">Component</span>
                  <span className="err-dialog__detail-value">{componentName}</span>
                </div>
              )}
              <div className="err-dialog__detail-row">
                <span className="err-dialog__detail-label">Time</span>
                <span className="err-dialog__detail-value">{new Date().toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* User feedback form */}
        <div className="err-dialog__form">
          <p className="err-dialog__form-intro">
            Your feedback helps us fix issues faster. Please describe what happened:
          </p>

          <div className="err-dialog__field">
            <label className="err-dialog__label">
              What were you doing when the error occurred? <span className="err-dialog__required">*</span>
            </label>
            <textarea
              className="err-dialog__textarea"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g., I was trying to save a new job entry, clicked the Save button..."
              rows={3}
            />
          </div>

          <div className="err-dialog__field">
            <label className="err-dialog__label">What did you expect to happen?</label>
            <textarea
              className="err-dialog__textarea"
              value={expected}
              onChange={e => setExpected(e.target.value)}
              placeholder="e.g., I expected the job to be saved and to see it in the jobs list..."
              rows={2}
            />
          </div>

          <div className="err-dialog__field">
            <label className="err-dialog__label">Why do you think this happened? (optional)</label>
            <textarea
              className="err-dialog__textarea"
              value={causeGuess}
              onChange={e => setCauseGuess(e.target.value)}
              placeholder="e.g., Maybe the connection dropped, or I entered too many characters..."
              rows={2}
            />
          </div>

          <div className="err-dialog__field">
            <label className="err-dialog__label">How severe is this for you?</label>
            <div className="err-dialog__severity">
              {SEVERITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`err-dialog__severity-btn ${severity === opt.value ? 'err-dialog__severity-btn--active' : ''}`}
                  style={{
                    borderColor: severity === opt.value ? opt.color : undefined,
                    background: severity === opt.value ? `${opt.color}10` : undefined,
                    color: severity === opt.value ? opt.color : undefined,
                  }}
                  onClick={() => setSeverity(opt.value)}
                  type="button"
                >
                  <span className="err-dialog__severity-label">{opt.label}</span>
                  <span className="err-dialog__severity-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="err-dialog__actions">
          <button className="err-dialog__btn err-dialog__btn--secondary" onClick={onDismiss} disabled={submitting}>
            Dismiss
          </button>
          <button
            className="err-dialog__btn err-dialog__btn--primary"
            onClick={handleSubmit}
            disabled={submitting || !notes.trim()}
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>

        <p className="err-dialog__footer-note">
          Error reports include technical details (browser info, page URL) to help troubleshoot the issue.
        </p>
      </div>
    </div>
  );
}
