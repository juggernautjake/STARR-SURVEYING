// __tests__/admin/hub-w9d-learning-stack.test.ts
//
// Slice W9d — consolidated learning-stack widget. Pure helpers +
// source-lock for the size-relative contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  assignmentHref,
  learningLayoutForBucket,
  recommendedLessonHref,
  totalLearningCount,
} from '@/lib/hub/widgets/learning-stack';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('totalLearningCount (pure)', () => {
  it('sums positive assignment + flashcard counts', () => {
    expect(totalLearningCount(3, 4)).toBe(7);
  });

  it('clamps negative inputs to zero', () => {
    expect(totalLearningCount(-2, 5)).toBe(5);
    expect(totalLearningCount(3, -1)).toBe(3);
  });

  it('returns 0 when both inputs are zero', () => {
    expect(totalLearningCount(0, 0)).toBe(0);
  });
});

describe('learningLayoutForBucket (pure)', () => {
  it('returns tiny / small / medium / three for each bucket', () => {
    expect(learningLayoutForBucket('tiny')).toBe('tiny');
    expect(learningLayoutForBucket('small')).toBe('small');
    expect(learningLayoutForBucket('medium')).toBe('medium');
    expect(learningLayoutForBucket('large')).toBe('three');
    expect(learningLayoutForBucket('xlarge')).toBe('three');
  });
});

describe('assignmentHref (pure)', () => {
  it('routes to the lesson when both module + lesson are present', () => {
    expect(assignmentHref({ module_id: 'm1', lesson_id: 'l2' })).toBe('/admin/learn/modules/m1/l2');
  });

  it('falls back to the module list when the lesson is missing', () => {
    expect(assignmentHref({ module_id: 'm1', lesson_id: null })).toBe('/admin/learn/modules/m1');
  });

  it('falls back to /admin/learn when nothing is set', () => {
    expect(assignmentHref({ module_id: null, lesson_id: null })).toBe('/admin/learn');
  });
});

describe('recommendedLessonHref (pure)', () => {
  it('routes to the lesson when the module is set', () => {
    expect(recommendedLessonHref({ id: 'l3', module_id: 'm4' })).toBe('/admin/learn/modules/m4/l3');
  });

  it('falls back to the module list when the module is missing', () => {
    expect(recommendedLessonHref({ id: 'l3', module_id: null })).toBe('/admin/learn/modules');
  });
});

describe('learning-stack widget registration + render (W9d)', () => {
  const SRC = read('lib/hub/widgets/learning-stack/index.tsx');

  it('registers with id "learning-stack"', () => {
    expect(SRC).toMatch(/defineWidget<LearningStackContent>\(\{\s*\n\s*id: 'learning-stack'/);
  });

  it("treats 401 / 403 as 'empty' (matches the W5 / W8 / W9a / W9b / W9c pattern)", () => {
    expect(SRC).toMatch(/res\.status === 401 \|\| res\.status === 403/);
  });

  it('size-relative testids: tiny / small / medium static + per-bucket dynamic at large / xlarge', () => {
    expect(SRC).toMatch(/data-testid="learning-stack-tiny"/);
    expect(SRC).toMatch(/data-testid="learning-stack-small"/);
    expect(SRC).toMatch(/data-testid="learning-stack-medium"/);
    expect(SRC).toMatch(/data-testid=\{`learning-stack-\$\{bucket\}`\}/);
  });

  it('large + xlarge render three columns (Assignments + Flashcards + Recommended)', () => {
    expect(SRC).toMatch(/threeColStyle/);
    expect(SRC).toMatch(/gridTemplateColumns: '1fr 1fr 1fr'/);
    expect(SRC).toMatch(/<AssignmentsSection\s/);
    expect(SRC).toMatch(/<FlashcardsSection\s/);
    expect(SRC).toMatch(/<RecommendedSection\s/);
  });

  it('per-section "Open →" links route to learn / flashcards / modules', () => {
    expect(SRC).toMatch(/href="\/admin\/learn"/);
    expect(SRC).toMatch(/href="\/admin\/learn\/flashcards"/);
    expect(SRC).toMatch(/href="\/admin\/learn\/modules"/);
  });

  it('xlarge bumps the per-list cap above the large default', () => {
    expect(SRC).toMatch(/bucket === 'xlarge' \? 10 : 6/);
  });

  it('uses the learning category so the Add-Widget modal groups it correctly', () => {
    expect(SRC).toMatch(/category: 'learning'/);
  });
});

describe('register-all + widget-options wire learning-stack (W9d)', () => {
  it('imports the new widget', () => {
    const SRC = read('lib/hub/widgets/register-all.ts');
    expect(SRC).toMatch(/import '\.\/learning-stack'/);
  });

  it("the schema registry has a 'learning-stack' entry so the Slice-12 coverage spec passes", () => {
    const SRC = read('lib/hub/widget-options.ts');
    expect(SRC).toMatch(/'learning-stack':\s*\{\s*source:\s*'none'\s*\}/);
  });
});
