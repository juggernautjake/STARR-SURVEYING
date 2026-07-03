'use client';
// app/admin/cad/components/CADErrorBoundary.tsx
// React error boundary that wraps the entire CAD editor.
// Catches any uncaught render/lifecycle exception and shows a recovery UI
// instead of crashing the whole page.

import React from 'react';
import { cadLog } from '@/lib/cad/logger';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack: string;
  copied: boolean;
}

export default class CADErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '', stack: '', copied: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    const stack   = error instanceof Error ? (error.stack ?? '') : '';
    return { hasError: true, message, stack, copied: false };
  }

  /** Build a full, paste-ready report: the crash message + stack plus the
   *  recent CAD log ring-buffer (errors/warnings/context leading up to it). */
  private buildReport = (): string => {
    const lines = [
      'STARR CAD — crash report',
      `when: ${new Date().toISOString()}`,
      `url:  ${typeof window !== 'undefined' ? window.location.href : ''}`,
      '',
      `error: ${this.state.message}`,
      '',
      this.state.stack || '(no stack)',
    ];
    try {
      const entries = cadLog.getEntries();
      if (entries.length) {
        lines.push('', '── recent CAD log (oldest→newest) ──');
        for (const e of entries) {
          const ts = new Date(e.timestamp).toISOString().slice(11, 23);
          lines.push(`[${ts}] [${e.level}] [${e.context}] ${e.message}`);
        }
      }
    } catch { /* logger unavailable — message + stack are enough */ }
    return lines.join('\n');
  };

  private handleCopy = async () => {
    const text = this.buildReport();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  override componentDidCatch(error: unknown, info: React.ErrorInfo) {
    cadLog.error(
      'CADErrorBoundary',
      'Uncaught render error — CAD editor crashed',
      { error, componentStack: info.componentStack },
    );
  }

  private handleReload = () => {
    // Clear the error and attempt to remount; a full page reload is safest
    window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({ hasError: false, message: '', stack: '', copied: false });
  };

  override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center h-screen w-full bg-gray-950 text-gray-200 p-6">
        <div className="max-w-xl w-full bg-gray-900 border border-red-700 rounded-xl shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-red-400 text-2xl">⚠️</span>
            <h1 className="text-white text-lg font-semibold">Starr CAD — Unexpected Error</h1>
          </div>

          <p className="text-gray-400 text-sm leading-relaxed">
            The CAD editor encountered an unrecoverable error. Your most recent auto-save
            (if any) will be offered for recovery when you reload.
          </p>

          <div className="bg-gray-800 border border-gray-700 rounded p-3 text-xs font-mono text-red-300 max-h-40 overflow-auto whitespace-pre-wrap">
            {this.state.message}
            {this.state.stack && `\n\n${this.state.stack}`}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={this.handleReload}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
            >
              Reload Editor
            </button>
            <button
              onClick={this.handleCopy}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
              title="Copy the error, stack trace, and recent CAD log to the clipboard"
            >
              {this.state.copied ? 'Copied!' : 'Copy details'}
            </button>
            <button
              onClick={this.handleDismiss}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
            >
              Try to Continue
            </button>
          </div>

          <p className="text-gray-600 text-xs">
            “Copy details” grabs the error, stack trace, and recent CAD log for a
            bug report. Full details are also in the browser console (F12).
          </p>
        </div>
      </div>
    );
  }
}
