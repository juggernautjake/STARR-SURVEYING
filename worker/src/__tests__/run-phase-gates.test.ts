import { describe, it, expect } from 'vitest';
import {
  normaliseRunSettings,
  shouldRunAnalysis,
  shouldGatherDocuments,
  RUN_SETTING_KEYS,
} from '../research/run-settings.js';

// Plan GATHER_AND_REVIEW_SPLIT G6 — the run is split into a `gather` phase (acquire only, NO AI) and
// an `analyze` phase (OCR/summaries over what gather filed). These gates decide "does this run run
// AI" and "does this run gather", and the whole no-AI-in-gather guarantee rests on them, so pin them.

describe('phase parsing', () => {
  it('accepts the two valid phases and drops anything else', () => {
    expect(normaliseRunSettings({ phase: 'gather' }).phase).toBe('gather');
    expect(normaliseRunSettings({ phase: 'analyze' }).phase).toBe('analyze');
    expect(normaliseRunSettings({ phase: 'nonsense' }).phase).toBeUndefined();
    expect(normaliseRunSettings({}).phase).toBeUndefined();
  });

  it('exposes phase as a known setting key', () => {
    expect(RUN_SETTING_KEYS).toContain('phase');
  });
});

describe('shouldRunAnalysis — no AI in a gather run', () => {
  it('is false for a gather run', () => {
    expect(shouldRunAnalysis({ phase: 'gather' })).toBe(false);
  });
  it('is true for an analyze run and for a legacy un-phased run', () => {
    expect(shouldRunAnalysis({ phase: 'analyze' })).toBe(true);
    expect(shouldRunAnalysis({})).toBe(true);
  });
});

describe('shouldGatherDocuments — an analyze run does not re-gather', () => {
  it('is false for an analyze run', () => {
    expect(shouldGatherDocuments({ phase: 'analyze' })).toBe(false);
  });
  it('is true for a gather run and for a legacy un-phased run', () => {
    expect(shouldGatherDocuments({ phase: 'gather' })).toBe(true);
    expect(shouldGatherDocuments({})).toBe(true);
  });
});
