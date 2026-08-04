'use client';
// app/admin/cad/components/CADErrorBoundary.tsx
// React error boundary that wraps the entire CAD editor.
// Catches any uncaught render/lifecycle exception and shows a recovery UI
// instead of crashing the whole page.

import React from 'react';
import { cadLog } from '@/lib/cad/logger';
import { emergencySave } from '@/lib/cad/persistence/emergency-save';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack: string;
  copied: boolean;
  /** S12 — outcome of the emergency recovery write, so the panel can state what actually happened
   *  instead of promising a snapshot that may not exist. */
  rescue: 'pending' | 'saved' | 'nothing-to-save' | 'failed';
}

export default class CADErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '', stack: '', copied: false, rescue: 'pending' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    const stack   = error instanceof Error ? (error.stack ?? '') : '';
    return { hasError: true, message, stack, copied: false, rescue: 'pending' };
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
    // S12 — write the recovery snapshot NOW.
    //
    // This panel already told the user their most recent auto-save would be offered on reload, and
    // nothing wrote one at this moment. The routine autosave is debounced 1.5 s after activity
    // settles, and a render crash is very often caused by the edit just made — precisely the edit
    // still sitting inside that window. The store is untouched by a render failure, so the document
    // is fully intact here and there is nothing stopping us from saving it.
    void emergencySave('react-error-boundary').then((r) => {
      this.setState({
        rescue: r.saved ? 'saved' : r.skipped === 'not-dirty' ? 'nothing-to-save' : 'failed',
      });
    });
  }

  private handleReload = () => {
    // Clear the error and attempt to remount; a full page reload is safest
    window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({ hasError: false, message: '', stack: '', copied: false, rescue: 'pending' });
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
            The CAD editor encountered an unrecoverable error.
          </p>

          {/* S12 — say what actually happened to the drawing. The previous copy promised that "your
              most recent auto-save (if any) will be offered for recovery", which was a claim about
              a write nobody had made: the emergency save did not exist, and the routine one is
              debounced. A surveyor deciding whether to reload needs the fact, not the reassurance. */}
          <div
            className={`rounded p-3 text-sm border ${
              this.state.rescue === 'saved'
                ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200'
                : this.state.rescue === 'failed'
                  ? 'bg-red-950/50 border-red-700 text-red-200'
                  : 'bg-gray-800 border-gray-700 text-gray-300'
            }`}
            role="status"
          >
            {this.state.rescue === 'pending' && 'Saving a recovery copy of your drawing…'}
            {this.state.rescue === 'saved' && (
              <>
                <strong>Your work was saved.</strong> A recovery copy of this drawing was written
                just now, and will be offered when you reload.
              </>
            )}
            {this.state.rescue === 'nothing-to-save' && (
              <>
                <strong>Nothing was unsaved.</strong> Every change was already stored before the
                error, so reloading loses no work.
              </>
            )}
            {this.state.rescue === 'failed' && (
              <>
                <strong>The recovery copy could not be written.</strong> Do <em>not</em> reload yet —
                use “Try to Continue” and save the drawing manually (File → Save, or Save a copy) if
                the editor responds.
              </>
            )}
          </div>

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
