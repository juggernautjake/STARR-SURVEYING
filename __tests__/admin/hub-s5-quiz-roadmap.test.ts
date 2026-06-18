// __tests__/admin/hub-s5-quiz-roadmap.test.ts
//
// Slice S5 of widget-size-responsive-content-2026-06-18 —
// per-bucket growth for the two non-legacy learning widgets:
//   - quiz-history: aggregate stats chip strip at medium+,
//     score-trend sparkline at large+.
//   - roadmap-progress: per-module mini-progress strip at large+.
// The three legacy widgets in S5 (class-assignments,
// flashcards-due, recommended-lessons) are deferred — their
// consolidated replacement `learning-stack` (W9d) already
// follows the W5 exemplary pattern.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  summarizeAttempts,
  tintForPct,
} from '@/lib/hub/widgets/quiz-history';
import { moduleCapForBucket } from '@/lib/hub/widgets/roadmap-progress';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('quiz-history pure helpers (S5)', () => {
  it('summarizeAttempts averages + buckets passed / failed', () => {
    const attempts = [
      { id: '1', quiz_name: 'A', score: 80, max_score: 100, completed_at: '' },
      { id: '2', quiz_name: 'B', score: 50, max_score: 100, completed_at: '' },
      { id: '3', quiz_name: 'C', score: 75, max_score: 100, completed_at: '' },
      { id: '4', quiz_name: 'D', score: 90, max_score: 100, completed_at: '' },
    ];
    expect(summarizeAttempts(attempts)).toEqual({
      avgPct: 74, // round((80+50+75+90)/4)
      passed: 3,  // 80 / 75 / 90 >= 60
      failed: 1,  // 50 < 60
      sparkline: [80, 50, 75, 90],
    });
  });

  it('caps the sparkline at 12 points', () => {
    const make = (n: number) => ({
      id: String(n), quiz_name: 'q', score: n, max_score: 100, completed_at: '',
    });
    const attempts = Array.from({ length: 20 }, (_, i) => make(i));
    expect(summarizeAttempts(attempts).sparkline).toHaveLength(12);
  });

  it('returns all-zero for an empty list', () => {
    expect(summarizeAttempts([])).toEqual({ avgPct: 0, passed: 0, failed: 0, sparkline: [] });
  });

  it('tintForPct maps score to success / warning / danger', () => {
    expect(tintForPct(95)).toBe('var(--theme-success)');
    expect(tintForPct(80)).toBe('var(--theme-success)');
    expect(tintForPct(75)).toBe('var(--theme-warning)');
    expect(tintForPct(60)).toBe('var(--theme-warning)');
    expect(tintForPct(50)).toBe('var(--theme-danger)');
  });
});

describe('quiz-history rendering contract (S5)', () => {
  const SRC = read('lib/hub/widgets/quiz-history/index.tsx');

  it('per-bucket dynamic testid', () => {
    expect(SRC).toMatch(/data-testid=\{`quiz-history-\$\{bucket\}`\}/);
  });

  it("aggregate stats chip strip renders at medium+", () => {
    expect(SRC).toMatch(/const showStats = bucket === 'medium' \|\| bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="quiz-history-stats-chips"/);
  });

  it('score trend sparkline renders at large+', () => {
    expect(SRC).toMatch(/const showSparkline = bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="quiz-history-sparkline"/);
  });
});

describe('roadmap-progress pure helpers (S5)', () => {
  it('moduleCapForBucket only surfaces modules at large+', () => {
    expect(moduleCapForBucket('tiny')).toBe(0);
    expect(moduleCapForBucket('small')).toBe(0);
    expect(moduleCapForBucket('medium')).toBe(0);
    expect(moduleCapForBucket('large')).toBe(4);
    expect(moduleCapForBucket('xlarge')).toBe(8);
  });
});

describe('roadmap-progress rendering contract (S5)', () => {
  const SRC = read('lib/hub/widgets/roadmap-progress/index.tsx');

  it('per-bucket dynamic testid', () => {
    expect(SRC).toMatch(/data-testid=\{`roadmap-progress-\$\{bucket\}`\}/);
  });

  it('per-module mini-progress strip renders at large+', () => {
    expect(SRC).toMatch(/const showModuleList = bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="roadmap-progress-modules"/);
  });

  it('toRoadmap now keeps the per-module list on the Roadmap rollup', () => {
    expect(SRC).toMatch(/modules: modules[\s\S]*?\.map\(\(m\) => \(\{[\s\S]*?title: m\.title/);
  });
});
