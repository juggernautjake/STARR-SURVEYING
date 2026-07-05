// __tests__/learn/fs-prep-flashcards.test.ts
//
// Source-lock for the FS-prep Practice/Flashcards buildout
// (docs/planning/in-progress/FS_PREP_PRACTICE_FLASHCARDS_2026-07-05.md).
//
// Locks two things that are easy to regress:
//   1. seeds/402_fs_prep_flashcards.sql — 190 built-in cards across all 10
//      modules, idempotent (DELETE-then-INSERT), namespaced, deterministic UUIDs.
//   2. The route/page wiring for section-read tracking (P5), discovery-on-open
//      (P5), and quiz-pass unlock (P6) stays connected.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const SEED = fs.readFileSync(path.join(ROOT, 'seeds', '402_fs_prep_flashcards.sql'), 'utf8');

// Expected cards per module (must sum to 190).
const PER_MODULE: Record<number, number> = {
  1: 20, 2: 20, 3: 19, 4: 16, 5: 19, 6: 20, 7: 20, 8: 20, 9: 18, 10: 18,
};
const TOTAL = Object.values(PER_MODULE).reduce((a, b) => a + b, 0);

describe('seeds/402 — FS built-in flashcards', () => {
  const inserts = SEED.match(/INSERT INTO flashcards /g) ?? [];
  const deletes = SEED.match(/DELETE FROM flashcards /g) ?? [];
  const ids = [...SEED.matchAll(/VALUES \('(fb\d{2}8000-[0-9a-f-]+)'/g)].map((m) => m[1]!);

  it('has exactly 190 card inserts', () => {
    expect(TOTAL).toBe(190);
    expect(inserts.length).toBe(190);
  });

  it('is idempotent: one DELETE per module and a single BEGIN/COMMIT', () => {
    expect(deletes.length).toBe(10);
    expect((SEED.match(/BEGIN;/g) ?? []).length).toBe(1);
    expect((SEED.match(/COMMIT;/g) ?? []).length).toBe(1);
  });

  it('uses deterministic, unique flashcard UUIDs (fbNN8000 band)', () => {
    expect(ids.length).toBe(190);
    expect(new Set(ids).size).toBe(190);
  });

  it('authors the expected number of cards for every module', () => {
    for (const [n, count] of Object.entries(PER_MODULE)) {
      const prefix = `fb${String(n).padStart(2, '0')}8000`;
      const forModule = ids.filter((id) => id.startsWith(prefix));
      expect(forModule.length, `module ${n}`).toBe(count);
    }
  });

  it('links every card to its FS module id and namespacing tags', () => {
    for (let n = 1; n <= 10; n++) {
      const modId = `f500000${n.toString(16)}-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
      expect(SEED, `module ${n} id`).toContain(`'${modId}'`);
    }
    // every insert carries the shared namespace tag
    const tagged = SEED.match(/'fs-flashcards'/g) ?? [];
    expect(tagged.length).toBeGreaterThanOrEqual(190);
    // published + approved so they surface in the learner UI
    expect((SEED.match(/, true, 'approved'\);/g) ?? []).length).toBe(190);
  });
});

describe('FS-prep route/page wiring (P5 + P6)', () => {
  const route = fs.readFileSync(
    path.join(ROOT, 'app', 'api', 'admin', 'learn', 'exam-prep', 'fs', 'route.ts'),
    'utf8',
  );
  const page = fs.readFileSync(
    path.join(ROOT, 'app', 'admin', 'learn', 'exam-prep', 'sit', 'module', '[id]', 'page.tsx'),
    'utf8',
  );
  const quizRunner = fs.readFileSync(
    path.join(ROOT, 'app', 'admin', 'components', 'QuizRunner.tsx'),
    'utf8',
  );

  it('fs route handles the section-read + discovery + complete-quiz actions', () => {
    expect(route).toContain("action === 'mark_section_read'");
    expect(route).toContain("action === 'discover_module_cards'");
    expect(route).toContain("action === 'complete_quiz'");
    expect(route).toContain('sections_read');
    expect(route).toContain('user_flashcard_discovery');
  });

  it('module page fires the reading-tracking + discovery + quiz-unlock calls', () => {
    expect(page).toContain("action: 'mark_section_read'");
    expect(page).toContain("action: 'discover_module_cards'");
    expect(page).toContain("action: 'complete_quiz'");
    expect(page).toContain('onComplete={handleQuizComplete}');
    expect(page).toContain('sections read'); // the N/5 indicator
  });

  it('QuizRunner exposes the onComplete hook that drives module unlock', () => {
    expect(quizRunner).toContain('onComplete?:');
    expect(quizRunner).toContain('onComplete?.(');
  });
});
