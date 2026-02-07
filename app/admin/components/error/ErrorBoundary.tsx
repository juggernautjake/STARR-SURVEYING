// app/admin/components/error/ErrorBoundary.tsx — React Error Boundary
// Catches render errors in child components and triggers the error report dialog
'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import {
  type ErrorReport,
  getBreadcrumbs,
  getConsoleLogs,
  getEnvironmentInfo,
  submitErrorReport,
} from '@/lib/errorHandler';

interface Props {
  children: ReactNode;
  /** Name of the page/section this boundary wraps */
  pageName?: string;
  /** User session info for error reports */
  userEmail?: string;
  userName?: string;
  userRole?: string;
  /** Optional fallback UI */
  fallback?: ReactNode;
  /** Called when an error is caught — use this to trigger the ErrorProvider dialog */
  onError?: (error: Error, componentName?: string) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reportSubmitted: boolean;
  showNotes: boolean;
  userNotes: string;
  userExpected: string;
  userCause: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  submitting: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    reportSubmitted: false,
    showNotes: false,
    userNotes: '',
    userExpected: '',
    userCause: '',
    severity: 'high',
    submitting: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Notify parent provider if available
    if (this.props.onError) {
      this.props.onError(error, errorInfo.componentStack?.split('\n')[1]?.trim() || this.props.pageName);
    }

    // Auto-submit a basic report immediately (without user notes)
    const report: ErrorReport = {
      error_message: error.message,
      error_stack: error.stack,
      error_type: 'render',
      component_name: errorInfo.componentStack?.split('\n')[1]?.trim() || this.props.pageName || 'Unknown',
      page_url: typeof window !== 'undefined' ? window.location.href : '',
      page_title: typeof document !== 'undefined' ? document.title : '',
      route_path: typeof window !== 'undefined' ? window.location.pathname : '',
      user_email: this.props.userEmail || 'anonymous',
      user_name: this.props.userName,
      user_role: this.props.userRole,
      breadcrumbs: getBreadcrumbs(),
      console_logs: getConsoleLogs(),
      occurred_at: new Date().toISOString(),
      ...getEnvironmentInfo(),
    };

    // Submit silently — the inline form lets the user add notes
    submitErrorReport(report).catch(() => {});
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      reportSubmitted: false,
      showNotes: false,
      userNotes: '',
      userExpected: '',
      userCause: '',
    });
  };

  handleSubmitNotes = async () => {
    this.setState({ submitting: true });
    const report: ErrorReport = {
      error_message: this.state.error?.message || 'Component render error',
      error_stack: this.state.error?.stack,
      error_type: 'render',
      component_name: this.state.errorInfo?.componentStack?.split('\n')[1]?.trim() || this.props.pageName || 'Unknown',
      page_url: typeof window !== 'undefined' ? window.location.href : '',
      page_title: typeof document !== 'undefined' ? document.title : '',
      route_path: typeof window !== 'undefined' ? window.location.pathname : '',
      user_email: this.props.userEmail || 'anonymous',
      user_name: this.props.userName,
      user_role: this.props.userRole,
      user_notes: this.state.userNotes,
      user_expected: this.state.userExpected,
      user_cause_guess: this.state.userCause,
      severity: this.state.severity,
      breadcrumbs: getBreadcrumbs(),
      console_logs: getConsoleLogs(),
      occurred_at: new Date().toISOString(),
      ...getEnvironmentInfo(),
    };

    await submitErrorReport(report);
    this.setState({ reportSubmitted: true, showNotes: false, submitting: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const { error, showNotes, reportSubmitted, userNotes, userExpected, userCause, severity, submitting } = this.state;

    return (
      <div className="err-boundary">
        <div className="err-boundary__card">
          <div className="err-boundary__icon">⚠️</div>
          <h2 className="err-boundary__title">Something went wrong</h2>
          <p className="err-boundary__message">
            {this.props.pageName
              ? `An error occurred in ${this.props.pageName}. The error has been automatically reported.`
              : 'An unexpected error occurred. The error has been automatically reported.'}
          </p>

          <div className="err-boundary__error-detail">
            <code>{error?.message || 'Unknown error'}</code>
          </div>

          <div className="err-boundary__actions">
            <button className="err-boundary__btn err-boundary__btn--primary" onClick={this.handleRetry}>
              Try Again
            </button>
            <button className="err-boundary__btn" onClick={() => window.location.href = '/admin/dashboard'}>
              Go to Dashboard
            </button>
            {!reportSubmitted && !showNotes && (
              <button className="err-boundary__btn err-boundary__btn--outline" onClick={() => this.setState({ showNotes: true })}>
                Add Details to Report
              </button>
            )}
          </div>

          {reportSubmitted && (
            <div className="err-boundary__success">
              Thank you! Your feedback has been submitted and will help us fix this issue.
            </div>
          )}

          {showNotes && !reportSubmitted && (
            <div className="err-boundary__notes-form">
              <h4>Help Us Fix This</h4>
              <p className="err-boundary__notes-intro">Your feedback helps us identify and resolve issues faster.</p>

              <div className="err-boundary__field">
                <label>What were you doing when this happened? <span style={{ color: '#EF4444' }}>*</span></label>
                <textarea
                  value={userNotes}
                  onChange={e => this.setState({ userNotes: e.target.value })}
                  placeholder="e.g., I was viewing a lesson and tried to open the quiz..."
                  rows={3}
                />
              </div>

              <div className="err-boundary__field">
                <label>What did you expect to happen?</label>
                <textarea
                  value={userExpected}
                  onChange={e => this.setState({ userExpected: e.target.value })}
                  placeholder="e.g., The quiz should have opened with questions..."
                  rows={2}
                />
              </div>

              <div className="err-boundary__field">
                <label>Why do you think it happened? (optional)</label>
                <textarea
                  value={userCause}
                  onChange={e => this.setState({ userCause: e.target.value })}
                  placeholder="e.g., Maybe the lesson data didn't load fully..."
                  rows={2}
                />
              </div>

              <div className="err-boundary__field">
                <label>Severity</label>
                <div className="err-boundary__severity-row">
                  {(['low', 'medium', 'high', 'critical'] as const).map(s => (
                    <button
                      key={s}
                      className={`err-boundary__sev-btn ${severity === s ? 'err-boundary__sev-btn--active' : ''}`}
                      data-severity={s}
                      onClick={() => this.setState({ severity: s })}
                      type="button"
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="err-boundary__notes-actions">
                <button
                  className="err-boundary__btn err-boundary__btn--primary"
                  onClick={this.handleSubmitNotes}
                  disabled={!userNotes.trim() || submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Feedback'}
                </button>
                <button
                  className="err-boundary__btn"
                  onClick={() => this.setState({ showNotes: false })}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
