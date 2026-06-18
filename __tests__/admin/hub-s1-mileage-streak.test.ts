// __tests__/admin/hub-s1-mileage-streak.test.ts
//
// Slice S1 of widget-size-responsive-content-2026-06-18 — add
// per-bucket growth to mileage-tracker + streak-counter so a
// surveyor who resizes either widget gets progressively richer
// content (the user's spec: "Like the weather widget, all of
// the other widgets should show more or less details related
// to that widget depending on its size.").

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mileageLayoutForBucket, periodChipLabel } from '@/lib/hub/widgets/mileage-tracker';
import { streakGoalPct, streakLayoutForBucket } from '@/lib/hub/widgets/streak-counter';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('mileage-tracker pure helpers (S1)', () => {
  it('mileageLayoutForBucket is identity over the 5 buckets', () => {
    expect(mileageLayoutForBucket('tiny')).toBe('tiny');
    expect(mileageLayoutForBucket('small')).toBe('small');
    expect(mileageLayoutForBucket('medium')).toBe('medium');
    expect(mileageLayoutForBucket('large')).toBe('large');
    expect(mileageLayoutForBucket('xlarge')).toBe('xlarge');
  });

  it("periodChipLabel returns the short Today / Week / Month strings", () => {
    expect(periodChipLabel('today')).toBe('Today');
    expect(periodChipLabel('week')).toBe('Week');
    expect(periodChipLabel('month')).toBe('Month');
  });
});

describe('mileage-tracker rendering contract (S1)', () => {
  const SRC = read('lib/hub/widgets/mileage-tracker/index.tsx');

  it('tiny has its own testid', () => {
    expect(SRC).toMatch(/data-testid="mileage-tracker-tiny"/);
  });

  it("the past-tiny container uses a per-bucket dynamic testid", () => {
    expect(SRC).toMatch(/data-testid=\{`mileage-tracker-\$\{bucket\}`\}/);
  });

  it('period chip strip renders only at medium+', () => {
    expect(SRC).toMatch(/const showPeriodChips = bucket === 'medium' \|\| bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="mileage-tracker-period-chips"/);
  });

  it('"Log a trip" CTA + IRS rate hint render at large+ only', () => {
    expect(SRC).toMatch(/const showCtaRow = bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="mileage-tracker-cta"/);
    expect(SRC).toMatch(/IRS standard rate \$\{IRS_BUSINESS_RATE_USD\.toFixed\(2\)\}\/mi/);
  });

  it('average-per-trip block is xlarge-only', () => {
    expect(SRC).toMatch(/const showAvgPerTrip = bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="mileage-tracker-avg-per-trip"/);
  });
});

describe('streak-counter pure helpers (S1)', () => {
  it('streakGoalPct clamps to 0–100 + handles non-positive goals', () => {
    expect(streakGoalPct(5, 10)).toBe(50);
    expect(streakGoalPct(15, 10)).toBe(100);
    expect(streakGoalPct(0, 10)).toBe(0);
    expect(streakGoalPct(5, 0)).toBe(0);
    expect(streakGoalPct(5, -1)).toBe(0);
    expect(streakGoalPct(5, Number.NaN)).toBe(0);
  });

  it('streakLayoutForBucket picks tiny / compact / progress / milestones', () => {
    expect(streakLayoutForBucket('tiny')).toBe('tiny');
    expect(streakLayoutForBucket('small')).toBe('compact');
    expect(streakLayoutForBucket('medium')).toBe('progress');
    expect(streakLayoutForBucket('large')).toBe('milestones');
    expect(streakLayoutForBucket('xlarge')).toBe('milestones');
  });
});

describe('streak-counter rendering contract (S1)', () => {
  const SRC = read('lib/hub/widgets/streak-counter/index.tsx');

  it('tiny + per-bucket dynamic testids', () => {
    expect(SRC).toMatch(/data-testid="streak-counter-tiny"/);
    expect(SRC).toMatch(/data-testid=\{`streak-counter-\$\{bucket\}`\}/);
  });

  it('goal progress bar renders only at medium+', () => {
    expect(SRC).toMatch(/const showGoalBar = bucket === 'medium' \|\| bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="streak-counter-goal-bar"/);
  });

  it('milestone strip renders only at large+', () => {
    expect(SRC).toMatch(/const showMilestoneStrip = bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="streak-counter-milestones"/);
  });

  it('milestone pip count is bounded between 1 and 14 (the goal, clamped)', () => {
    expect(SRC).toMatch(/Math\.max\(1, Math\.min\(14, goal\)\)/);
  });
});
