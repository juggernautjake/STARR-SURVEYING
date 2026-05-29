// __tests__/work-mode/work-mode-store.test.ts
//
// Slices 155 + 158 — work-mode store + helpers.

import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkModeStore, timeInModeMs } from '@/lib/work-mode/work-mode-store';

function reset() {
  useWorkModeStore.setState({ mode: null, jobId: null, enteredAt: null });
}

describe('work-mode store', () => {
  beforeEach(reset);

  it('starts with no active mode', () => {
    expect(useWorkModeStore.getState().mode).toBeNull();
    expect(useWorkModeStore.getState().enteredAt).toBeNull();
  });

  it('enterWorkMode sets mode + enteredAt + optional jobId', () => {
    useWorkModeStore.getState().enterWorkMode('field_crew', 'job-1');
    const s = useWorkModeStore.getState();
    expect(s.mode).toBe('field_crew');
    expect(s.jobId).toBe('job-1');
    expect(s.enteredAt).not.toBeNull();
  });

  it('exitWorkMode clears every field', () => {
    useWorkModeStore.getState().enterWorkMode('drawer');
    useWorkModeStore.getState().exitWorkMode();
    const s = useWorkModeStore.getState();
    expect(s.mode).toBeNull();
    expect(s.jobId).toBeNull();
    expect(s.enteredAt).toBeNull();
  });

  it('setJobId updates the job id without leaving mode', () => {
    useWorkModeStore.getState().enterWorkMode('field_crew');
    useWorkModeStore.getState().setJobId('job-x');
    expect(useWorkModeStore.getState().jobId).toBe('job-x');
    expect(useWorkModeStore.getState().mode).toBe('field_crew');
  });
});

describe('timeInModeMs', () => {
  it('returns null when not in mode', () => {
    expect(timeInModeMs(null)).toBeNull();
  });

  it('returns positive elapsed for past entry', () => {
    const enteredAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const elapsed = timeInModeMs(enteredAt);
    expect(elapsed).not.toBeNull();
    expect(elapsed!).toBeGreaterThan(4 * 60 * 1000);
  });

  it('returns 0 for future enteredAt', () => {
    const future = new Date(Date.now() + 60 * 1000).toISOString();
    expect(timeInModeMs(future)).toBe(0);
  });

  it('returns null for unparseable iso', () => {
    expect(timeInModeMs('not a date')).toBeNull();
  });
});
