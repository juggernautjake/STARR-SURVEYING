// __tests__/cad/store/error-report-store.test.ts
//
// cad-multi-error-report-modal Slice 1 — global error-report
// store + multi-entry modal channel.

import { describe, it, expect, beforeEach } from 'vitest';
import { useErrorReportStore, formatEntries } from '@/lib/cad/store/error-report-store';

beforeEach(() => {
  useErrorReportStore.setState({ entries: [], open: false });
});

describe('useErrorReportStore', () => {
  it('report() pushes an entry with a generated id + timestamp + opens the modal', () => {
    const id = useErrorReportStore.getState().report({
      title: 'Boom',
      body: 'Something went wrong',
      severity: 'ERROR',
    });
    const state = useErrorReportStore.getState();
    expect(state.entries.length).toBe(1);
    expect(state.entries[0].id).toBe(id);
    expect(state.entries[0].timestamp).toBeGreaterThan(0);
    expect(state.entries[0].title).toBe('Boom');
    expect(state.open).toBe(true);
  });

  it('newer entries appear first (newest-first ordering)', () => {
    const a = useErrorReportStore.getState().report({ title: 'A', body: 'a', severity: 'ERROR' });
    const b = useErrorReportStore.getState().report({ title: 'B', body: 'b', severity: 'WARNING' });
    const ids = useErrorReportStore.getState().entries.map((e) => e.id);
    expect(ids).toEqual([b, a]);
  });

  it('dismiss(id) removes only that entry', () => {
    const a = useErrorReportStore.getState().report({ title: 'A', body: 'a', severity: 'ERROR' });
    useErrorReportStore.getState().report({ title: 'B', body: 'b', severity: 'ERROR' });
    useErrorReportStore.getState().dismiss(a);
    expect(useErrorReportStore.getState().entries.length).toBe(1);
    expect(useErrorReportStore.getState().entries[0].title).toBe('B');
  });

  it('clear() empties the entries list but leaves `open` untouched', () => {
    useErrorReportStore.getState().report({ title: 'A', body: 'a', severity: 'ERROR' });
    useErrorReportStore.getState().report({ title: 'B', body: 'b', severity: 'ERROR' });
    const wasOpen = useErrorReportStore.getState().open;
    useErrorReportStore.getState().clear();
    expect(useErrorReportStore.getState().entries.length).toBe(0);
    expect(useErrorReportStore.getState().open).toBe(wasOpen);
  });

  it('setOpen toggles the modal visibility without touching entries', () => {
    useErrorReportStore.getState().report({ title: 'A', body: 'a', severity: 'ERROR' });
    useErrorReportStore.getState().setOpen(false);
    expect(useErrorReportStore.getState().open).toBe(false);
    expect(useErrorReportStore.getState().entries.length).toBe(1);
    useErrorReportStore.getState().setOpen(true);
    expect(useErrorReportStore.getState().open).toBe(true);
  });
});

describe('formatEntries — flat copy-pasteable text', () => {
  it('renders one entry per block with severity + title + indented body + hint', () => {
    const entries = [
      {
        id: '1',
        title: 'A',
        body: 'line one\nline two',
        severity: 'ERROR' as const,
        hint: 'try X',
        timestamp: new Date('2026-05-31T12:00:00Z').getTime(),
      },
    ];
    const text = formatEntries(entries);
    expect(text).toContain('[ERROR] A');
    expect(text).toContain('  Hint: try X');
    expect(text).toContain('  line one');
    expect(text).toContain('  line two');
  });

  it('handles an empty list gracefully', () => {
    expect(formatEntries([])).toBe('');
  });
});

describe('reportFileLoadError — bridges FileLoadDiagnostic into the store', () => {
  it('builds a single ERROR entry with the formatted diagnostic body + hint', async () => {
    const { buildFileLoadDiagnostic } = await import('@/lib/cad/io/file-detect');
    const { reportFileLoadError } = await import('@/lib/cad/io/error-report');
    const diag = buildFileLoadDiagnostic(
      'survey.TRV',
      '#,TRAVERSE PC\r\n',
      new Error('Unexpected token #'),
      'parse',
    );
    reportFileLoadError(diag);
    const e = useErrorReportStore.getState().entries[0];
    expect(e.severity).toBe('ERROR');
    expect(e.title).toContain('survey.TRV');
    expect(e.title).toContain('TRV');
    expect(e.title).toContain('parse');
    expect(e.body).toContain('Detected format: TRV');
    expect(e.hint).toContain('Import Traverse PC');
  });
});
