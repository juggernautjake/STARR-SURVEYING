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

  it('scopes every card to its FS module via category=fs:<uuid> (module_id NULL, FK-safe)', () => {
    for (let n = 1; n <= 10; n++) {
      const modId = `f500000${n.toString(16)}-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
      expect(SEED, `module ${n} category`).toContain(`'fs:${modId}'`);
    }
    // module_id is left NULL for every insert (it FKs a different course's table)
    expect((SEED.match(/, NULL, ARRAY\[/g) ?? []).length).toBe(190);
    // every insert carries the shared namespace tag
    expect((SEED.match(/'fs-flashcards'/g) ?? []).length).toBeGreaterThanOrEqual(190);
    // published + approved with a valid difficulty domain so they surface in the UI
    expect((SEED.match(/'(beginner|intermediate|advanced|expert)', true, 'approved'\);/g) ?? []).length).toBe(190);
  });
});

describe('seeds/368 — FS lesson content completeness (P8 spot-check)', () => {
  const content = fs.readFileSync(path.join(ROOT, 'seeds', '368_fs_prep_buildout.sql'), 'utf8');

  it('upserts all 10 FS study modules', () => {
    expect((content.match(/INSERT INTO fs_study_modules /g) ?? []).length).toBe(10);
  });

  it('every module carries all five lesson sections', () => {
    for (const type of ['overview', 'concepts', 'formulas', 'examples', 'tips']) {
      const count = (content.match(new RegExp(`"type": ?"${type}"`, 'g')) ?? []).length;
      expect(count, `section "${type}"`).toBe(10);
    }
  });

  it('content is substantial (not stub rows)', () => {
    // ~14k-26k chars/module of rich content → a large committed seed.
    expect(content.length).toBeGreaterThan(200_000);
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
