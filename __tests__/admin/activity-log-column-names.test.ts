// __tests__/admin/activity-log-column-names.test.ts
//
// ── FIVE ROUTES WROTE TO A COLUMN THAT DOES NOT EXIST, FOR MONTHS ───────────────────────────────
//
// `activity_log` has **`action_type`** and **`metadata`**. Five routes inserted **`action`** and
// **`details`**:
//
//   · jobs (job created)          · jobs/files (file uploaded)     · jobs/team (member added)
//   · jobs/stages (stage changed) · cad/drawings (drawing saved)
//
// Every one of those inserts is wrapped in `fireAndForget`, which swallows the rejection. So the
// writes failed silently and **not one job event was ever logged**. Five other routes
// (employees/manage, time-logs/{advances,approve,bonuses}) used the right names, so the table had
// 59 rows in it and looked perfectly healthy from the outside.
//
// The only reason anybody found out is that the READER had the mirror-image bug and reads are not
// fire-and-forget: opening the Activity tab returned
// `column activity_log.action does not exist`. Had the select been correct, the tab would simply
// have been empty forever and read as "nothing has happened on this job yet".
//
// ── WHY A SOURCE SCAN ───────────────────────────────────────────────────────────────────────────
//
// There is no unit test that can see this. Both halves type-check (the insert takes an untyped
// object), both halves are obviously correct in isolation, and the failure is a swallowed promise.
// Only the column name is wrong, and only the database knows.
//
// Found by opening the tab in a browser during the Q1 pass of
// docs/planning/completed/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** The real column names, as measured against the live schema on 2026-08-14. */
const REAL_COLUMNS = ['id', 'user_email', 'action_type', 'entity_type', 'entity_id', 'metadata', 'ip_address', 'created_at', 'org_id'];

/** Names that look right, are not, and fail silently through `fireAndForget`. */
const WRONG_KEYS = ['action', 'details'];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next', '.git'].includes(e.name)) walk(p, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Comments stripped — this file's own header names the wrong keys, and so do the fix notes left
 *  in the routes. A scan over raw text would flag the explanation of the bug as the bug. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FILES = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]
  .map((f) => ({ file: path.relative(ROOT, f).split(path.sep).join('/'), src: code(fs.readFileSync(f, 'utf8')) }))
  .filter((f) => f.src.includes('activity_log'));

describe('activity_log is written and read with the columns it actually has', () => {
  it('finds the files that touch the table', () => {
    // Guards the guard: a scan matching nothing passes forever.
    expect(FILES.length).toBeGreaterThan(5);
  });

  it('no insert uses `action:` or `details:`', () => {
    const offenders: string[] = [];
    for (const { file, src } of FILES) {
      // The insert payload, bounded to the object that follows `.from('activity_log').insert(`.
      // Bounded rather than file-wide because plenty of these routes legitimately have an `action`
      // variable of their own in scope (`time_logs_bulk_${action}` is one).
      const re = /\.from\(\s*['"`]activity_log['"`]\s*\)\s*\.insert\(([\s\S]{0,600}?)\)\s*\)?/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        for (const key of WRONG_KEYS) {
          if (new RegExp(`(^|[{,\\s])${key}\\s*:`).test(m[1]!)) {
            offenders.push(`${file} — insert uses \`${key}:\``);
          }
        }
      }
    }
    expect(
      [...new Set(offenders)],
      'activity_log has `action_type` and `metadata`, not `action` and `details`. These inserts are\n'
      + 'wrapped in fireAndForget, so a wrong name is REJECTED SILENTLY and the event is simply never\n'
      + `logged:\n  ${[...new Set(offenders)].join('\n  ')}`,
    ).toEqual([]);
  });

  it('no select asks for `action` or `details`', () => {
    const offenders: string[] = [];
    for (const { file, src } of FILES) {
      const re = /\.from\(\s*['"`]activity_log['"`]\s*\)\s*[\s\S]{0,200}?\.select\(\s*['"`]([^'"`]*)['"`]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const cols = m[1]!.split(',').map((c) => c.trim());
        for (const col of cols) {
          if (col && col !== '*' && !REAL_COLUMNS.includes(col)) {
            offenders.push(`${file} — selects \`${col}\``);
          }
        }
      }
    }
    expect(
      [...new Set(offenders)],
      'These selects name a column activity_log does not have. Unlike the inserts, a bad select is\n'
      + `loud — it 500s the page that reads it:\n  ${[...new Set(offenders)].join('\n  ')}`,
    ).toEqual([]);
  });

  it('the labels the feed renders match the action_type values the writers emit', () => {
    // The other half of the same defect class: a writer emitting `job_photo_uploaded` and a reader
    // labelling `photo_uploaded` produces a timeline of raw snake_case, which reads as a data
    // problem rather than as a missing label.
    const activityRoute = fs.readFileSync(path.join(ROOT, 'app/api/admin/jobs/activity/route.ts'), 'utf8');
    const labelled = new Set(
      [...activityRoute.matchAll(/^\s{2}([a-z_]+):\s*'/gm)].map((m) => m[1]!),
    );
    const emitted = new Set<string>();
    for (const { src } of FILES) {
      for (const m of src.matchAll(/action_type:\s*['"`]([a-z_]+)['"`]/g)) emitted.add(m[1]!);
    }
    // Only the job-scoped ones — the feed deliberately covers jobs, not payroll or role changes.
    const jobEvents = [...emitted].filter((e) => e.startsWith('job_') || e.startsWith('cad_'));
    const unlabelled = jobEvents.filter((e) => !labelled.has(e));
    expect(
      unlabelled,
      `These job events are written to activity_log but have no label in ACTION_LABELS, so the feed
renders them as raw snake_case:\n  ${unlabelled.join('\n  ')}`,
    ).toEqual([]);
  });
});
