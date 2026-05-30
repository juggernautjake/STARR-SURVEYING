// __tests__/research/pipeline-runs.test.ts
//
// hub-widget-excellence-12 — pipeline-status R1: the pipeline endpoint
// was a `{ runs: [] }` stub. It now maps real research projects to runs.
// Lock the pure mapper.

import { describe, it, expect } from 'vitest';
import { mapProjectStatusToRun, toPipelineRun } from '@/lib/research/pipeline-runs';

describe('mapProjectStatusToRun', () => {
  it('maps the research workflow stages to run statuses', () => {
    expect(mapProjectStatusToRun('complete')).toBe('success');
    expect(mapProjectStatusToRun('upload')).toBe('queued');
    expect(mapProjectStatusToRun('configure')).toBe('queued');
    for (const s of ['analyzing', 'review', 'drawing', 'verifying']) {
      expect(mapProjectStatusToRun(s)).toBe('running');
    }
  });
  it('treats unknown/null as queued (never invents a failure)', () => {
    expect(mapProjectStatusToRun('weird')).toBe('queued');
    expect(mapProjectStatusToRun(null)).toBe('queued');
  });
});

describe('toPipelineRun', () => {
  it('maps a project to a run row', () => {
    expect(toPipelineRun({
      id: 'p1', name: 'Johnson parcel', status: 'analyzing', updated_at: '2026-05-30T10:00:00Z',
    })).toEqual({
      id: 'p1', name: 'Johnson parcel', status: 'running', started_at: '2026-05-30T10:00:00Z',
    });
  });
  it('falls back the name + tolerates a missing date', () => {
    expect(toPipelineRun({ id: 'p2', status: 'complete' })).toEqual({
      id: 'p2', name: 'Research project', status: 'success', started_at: null,
    });
  });
});
