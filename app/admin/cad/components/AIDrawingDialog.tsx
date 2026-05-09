'use client';
// app/admin/cad/components/AIDrawingDialog.tsx
//
// Phase 6 — entry-point modal for the AI Drawing Engine.
// Inputs:
//   * Imported survey points (read from usePointStore)
//   * Optional pasted/typed legal description (deed text)
//   * Optional free-text user prompt
//   * Toggles: generate labels / optimize labels / score
//
// On submit, POSTs to /api/admin/cad/ai-pipeline and pushes
// the result into the AI store. The next slice (review queue
// UI) consumes that result.
//
// This is the smallest dialog that gives a user a clickable
// "Run AI Pipeline" button end-to-end. The full review queue
// + per-feature accept/modify/reject actions land in follow-up
// slices.

import { useState } from 'react';

import { usePointStore, useAIStore } from '@/lib/cad/store';
import type { AIJobPayload, AIJobResult } from '@/lib/cad/ai-engine/types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface AIDrawingDialogProps {
  onClose: () => void;
}

export default function AIDrawingDialog({
  onClose,
}: AIDrawingDialogProps) {
  useEscapeToClose(onClose);
  const points = usePointStore((s) => Object.values(s.points));
  const status = useAIStore((s) => s.status);
  const error = useAIStore((s) => s.error);
  const result = useAIStore((s) => s.result);
  const setStarted = useAIStore((s) => s.start);
  const setResult = useAIStore((s) => s.setResult);
  const setError = useAIStore((s) => s.setError);
  const setLastPayload = useAIStore((s) => s.setLastPayload);

  const [deedText, setDeedText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generateLabels, setGenerateLabels] = useState(true);
  const [optimizeLabels, setOptimizeLabels] = useState(true);
  const [scoreConfidence, setScoreConfidence] = useState(true);
  const [autoSelectScale, setAutoSelectScale] = useState(true);

  const isRunning = status === 'running';
  const canRun = points.length > 0 && !isRunning;

  async function handleRun() {
    setStarted();
    try {
      const payload: AIJobPayload = {
        points,
        deedData:
          deedText.trim().length > 0
            ? {
                source: 'LEGAL_DESCRIPTION',
                rawText: deedText.trim(),
                calls: [],
                curves: [],
                basisOfBearings: null,
                beginningMonument: null,
                county: null,
                survey: null,
                abstract: null,
                volume: null,
                page: null,
              }
            : null,
        fieldNotes: null,
        userPrompt: prompt.trim().length > 0 ? prompt.trim() : null,
        answers: [],
        templateId: null,
        coordinateSystem: 'NAD83_TX_CENTRAL',
        codeLibrary: [],
        customSymbols: [],
        customLineTypes: [],
        autoSelectScale,
        autoSelectOrientation: true,
        generateLabels,
        optimizeLabels,
        includeConfidenceScoring: scoreConfidence,
      };

      // Cache the payload so §28.5 can re-POST it with answers.
      setLastPayload(payload);
      const res = await fetch('/api/admin/cad/ai-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as
        | AIJobResult
        | { error?: string };
      if (!res.ok) {
        const msg =
          (json as { error?: string }).error ??
          `Pipeline request failed (${res.status}).`;
        setError(msg);
        return;
      }
      setResult(json as AIJobResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header style={styles.header}>
          <h2 style={styles.title}>🤖 AI Drawing Engine</h2>
          <button
            type="button"
            style={styles.close}
            onClick={onClose}
            aria-label="Close"
            disabled={isRunning}
          >
            ✕
          </button>
        </header>

        <div style={styles.body}>
          <p style={styles.copy}>
            Phase 6 pipeline. {points.length} point
            {points.length === 1 ? '' : 's'} loaded. Optional deed
            text triggers reconciliation against the field traverse;
            empty deed runs stages 1, 2, 4, 5, 6 only.
          </p>

          <label style={styles.field}>
            <span style={styles.label}>Deed text (optional)</span>
            <textarea
              value={deedText}
              onChange={(e) => setDeedText(e.target.value)}
              rows={6}
              placeholder={
                'BEGINNING at a 1/2" iron rod found...\nTHENCE N 45°30\'15" E, a distance of 234.56 feet...'
              }
              style={styles.textarea}
              disabled={isRunning}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Instructions (optional)</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="Free-form notes for the AI — drawing style, callouts to include, etc."
              style={styles.textarea}
              disabled={isRunning}
            />
          </label>

          <div style={styles.toggleGrid}>
            <Toggle
              checked={generateLabels}
              onChange={setGenerateLabels}
              disabled={isRunning}
              label="Generate labels"
            />
            <Toggle
              checked={optimizeLabels}
              onChange={setOptimizeLabels}
              disabled={isRunning || !generateLabels}
              label="Optimize labels"
            />
            <Toggle
              checked={scoreConfidence}
              onChange={setScoreConfidence}
              disabled={isRunning}
              label="Score confidence"
            />
            <Toggle
              checked={autoSelectScale}
              onChange={setAutoSelectScale}
              disabled={isRunning}
              label="Auto-pick scale + paper"
            />
          </div>

          {error ? <div style={styles.error}>⚠ {error}</div> : null}
          {status === 'done' && result ? (
            <div style={styles.success}>
              ✓ Pipeline complete in{' '}
              {(result.processingTimeMs / 1000).toFixed(1)}s.{' '}
              {result.features.length} features ·{' '}
              {result.annotations.length} annotations ·{' '}
              {result.reviewQueue.summary.totalElements} review
              items.
              {result.warnings.length > 0 ? (
                <ul style={styles.warningsList}>
                  {result.warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer style={styles.footer}>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            style={styles.cancelBtn}
          >
            {status === 'done' ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={!canRun}
            style={canRun ? styles.runBtn : styles.runBtnDisabled}
          >
            {isRunning ? 'Running…' : 'Run pipeline'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <label style={styles.toggleRow}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.5)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 60,
    zIndex: 1000,
  },
  modal: {
    background: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 640,
    maxHeight: 'calc(100vh - 120px)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 16, fontWeight: 600, margin: 0 },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    color: '#6B7280',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  body: {
    padding: 20,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  copy: { margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#374151' },
  textarea: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  toggleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
    paddingTop: 4,
  },
  toggleRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    fontSize: 13,
    color: '#374151',
    cursor: 'pointer',
  },
  error: {
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
  },
  success: {
    background: '#DCFCE7',
    border: '1px solid #86EFAC',
    color: '#166534',
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
  },
  warningsList: {
    marginTop: 6,
    paddingLeft: 18,
    fontSize: 11,
    color: '#854D0E',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '12px 20px',
    borderTop: '1px solid #E2E5EB',
    background: '#FAFBFC',
    borderRadius: '0 0 12px 12px',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
  },
  runBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  runBtnDisabled: {
    background: '#9CA3AF',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'not-allowed',
    fontSize: 13,
    fontWeight: 500,
    opacity: 0.6,
  },
};
