# Category 13 — Learning / academic widgets

*Part of the Hub Widget Excellence plan (`…-00-master-…`). Widgets:
**class-assignments, recommended-lessons, roadmap-progress,
flashcards-due, quiz-history, streak-counter**. The user: "Make sure
the academic widgets all work too." Each: Build/Wire + 4 audit rounds.*

---

## class-assignments
- **Endpoint:** `/api/admin/learn/assignments?status=…`. Fields:
  module_id, lesson_id, module_title, lesson_title, due_date, status,
  created_at.
- **Track:** class/module, assignment/lesson, due date, status.
- **Per-bucket priority** (matches the sketch's Class | Assignment |
  Due Date columns): tiny → count due; small → lesson title + due;
  medium → + module/class; large+ → full table + status.
- **Footer link:** "Go to learn →" `/admin/learn` (or
  `/admin/learn/roadmap`).
- **Row deep link:** → `/admin/learn/modules/{module_id}/{lesson_id}`.
- **Editor:** dueWithin, includeCompleted, groupByClass, columns,
  sortBy, rowLimit.
- **Notifications:** assignment due-soon / overdue study reminders
  (`notifyStudyReminder`, Doc 03).
- **Slices:** Build/Wire (footer link + row deep links + columns per
  the sketch) + R1–4.

## recommended-lessons
- **Endpoint:** `/api/admin/learn/recommended?limit=10`. Fields: id,
  title, module_title, estimated_minutes.
- **Track:** lesson, module, est. minutes, category.
- **Per-bucket:** tiny → count; small → title; medium+ → + module +
  minutes.
- **Footer link:** "Go to lessons →" `/admin/learn/modules` (or
  `/admin/learn`).
- **Row deep link:** → `/admin/learn/modules/{module_id}/{id}` (R1
  confirms the recommended payload includes module_id; today it links
  `/admin/learn/lessons/{id}` which R2 must verify exists or fix).
- **Editor:** maxItems, category.
- **Slices:** Build/Wire + R1–4. (R2 fixes the lesson link to the
  canonical `modules/{id}/{lessonId}` route.)

## roadmap-progress
- **Endpoint:** `/api/admin/learn/roadmap`. Fields: id, name,
  percent_complete, current_module.
- **Track:** roadmap %, name, current module.
- **Per-bucket:** tiny → percent; small → percent + name; medium+ →
  + current module + bar.
- **Footer link:** "Go to roadmap →" `/admin/learn/roadmap`.
- **Editor:** showName, showCurrent, showBar.
- **Slices:** Build/Wire (footer link) + R1–4.

## flashcards-due
- **Endpoint:** `/api/admin/learn/flashcards?due=true&summary=1`.
- **Track:** count due, next review.
- **Per-bucket:** tiny → count; small → count + "review"; medium+ →
  + next review + CTA.
- **Footer link:** "Go to flashcards →" `/admin/learn/flashcards`
  (already has a "Start review →" link — reconcile to the shared
  footer pattern).
- **Editor:** maxCards, hideEmpty.
- **Notifications:** cards-due study reminder (Doc 03).
- **Slices:** Build/Wire + R1–4.

## quiz-history
- **Endpoint:** `/api/admin/learn/quiz-attempts?limit=20`. Fields: id,
  quiz_name, score, max_score, completed_at.
- **Track:** quiz, score %, when, pass/fail.
- **Per-bucket:** tiny → count (or last %); small → quiz + %; medium+ →
  + date + color-coded.
- **Footer link:** "Go to quiz history →" `/admin/learn/quiz-history`.
- **Editor:** maxItems, showScore, onlyFailed.
- **Slices:** Build/Wire (footer link) + R1–4.

## streak-counter
- **Endpoint:** `/api/admin/learn/streak`. Fields: current_days,
  longest_days.
- **Track:** current streak, longest, goal progress, kind.
- **Per-bucket:** tiny → streak number; small → + label; medium+ →
  + longest + goal.
- **Footer link:** "Go to learn →" `/admin/learn` (optional — small
  stat widget; include if it reads well).
- **Editor:** kind (clockin/study/quiz), goal.
- **Notifications:** streak-at-risk reminder (Doc 03, optional).
- **Slices:** Build/Wire + R1–4.

## Guardrails
- Academic widgets must serve BOTH students and teachers correctly —
  R1 verifies the endpoints return the right rows per role (a teacher's
  assignments vs a student's). Don't leak another user's progress.
- Lesson/module deep links use the canonical
  `/admin/learn/modules/{id}/{lessonId}` shape; fix any legacy
  `/admin/learn/lessons/{id}` link that doesn't resolve.
