// lib/learn/recommended.ts
//
// hub-widget-excellence-13 — the /api/admin/learn/recommended endpoint
// was missing, so the recommended-lessons widget always showed empty.
// This pure helper picks the next lessons to suggest: lessons the user
// hasn't completed yet, in order, capped. Dependency-free + testable.

export interface RecommendableLesson {
  id: string;
  title?: string | null;
  module_id?: string | null;
}

export interface RecommendedLesson {
  id: string;
  title: string;
  module_id: string | null;
  module_title: string | null;
  estimated_minutes: number | null;
}

/**
 * From all lessons (already ordered), drop the ones the user has
 * completed and take the first `limit`. `moduleTitleById` supplies the
 * joined module name.
 */
export function pickRecommended(
  lessons: readonly RecommendableLesson[],
  completedLessonIds: ReadonlySet<string>,
  limit: number,
  moduleTitleById: ReadonlyMap<string, string> = new Map(),
): RecommendedLesson[] {
  const cap = Math.max(0, Math.floor(limit));
  const out: RecommendedLesson[] = [];
  for (const lesson of lessons) {
    if (out.length >= cap) break;
    if (completedLessonIds.has(lesson.id)) continue;
    out.push({
      id: lesson.id,
      title: lesson.title?.trim() || 'Lesson',
      module_id: lesson.module_id ?? null,
      module_title: lesson.module_id ? (moduleTitleById.get(lesson.module_id) ?? null) : null,
      estimated_minutes: null,
    });
  }
  return out;
}
