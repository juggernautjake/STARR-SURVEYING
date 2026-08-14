// __tests__/notifications/every-job-mutation-notifies.test.ts — slice N5 of
// docs/planning/completed/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// Owner, 2026-08-14: *"Every time something happens with a job that someone is assigned to, they
// should get a notification about that thing."*
//
// ── WHY A SOURCE SCAN AND NOT A UNIT TEST ───────────────────────────────────────────────────────
//
// The bug this guards against is an ABSENCE. There is no failing assertion for a notification
// nobody wrote: the route works, the row is saved, the response is 200, and the only symptom is a
// person on a truck who was not told. That is invisible to every other kind of test, and it is
// exactly how this codebase arrived at twelve job-mutating routes of which one notified anybody.
//
// So the check is structural: a route that WRITES to a job-scoped table must either reach
// `notifyJobEvent` or be listed below with a reason. The exemption list is the point — it turns
// "we forgot" into "we decided", and the reason has to be written down before the build goes green.
//
// This is the same shape as the receipts expense-total scan, and for the same reason: the
// thirteenth mutation, written next month by somebody who has never read the plan, will not be
// silent by accident.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const API_ROOT = path.join(ROOT, 'app', 'api');

/**
 * Tables where a write is something that happened TO A JOB, in the sense the owner means: a person
 * assigned to that job would want to know.
 *
 * `job_time_entries` and `job_checklists` are deliberately absent — logging your own hours and
 * ticking your own checklist item are somebody working, not an event on the job. If that judgement
 * is ever revisited, adding the table here is the whole change.
 */
const JOB_TABLES = [
  'jobs',
  'job_files',
  'job_team',
  'job_stages_history',
  'job_payments',
  'job_contacts',
  'job_research',
  'job_equipment',
  'job_briefings',
  'job_briefing_items',
  'deliverables',
] as const;

/**
 * Routes that write a job table and legitimately do not notify. Every entry states WHY, because an
 * exemption without a reason is indistinguishable from the oversight this test exists to catch.
 */
const EXEMPT: Record<string, string> = {
  'admin/jobs/route.ts':
    'Creating a job notifies nobody because there is nobody on it yet — the crew arrives via '
    + 'jobs/team and personnel/assign, both of which notify. The PUT edits job fields (address, '
    + 'client, quote) and the DELETE soft-deletes; both are office bookkeeping on a record, and '
    + 'the stage, schedule, payment and deliverable changes that matter each have their own route.',
  'admin/jobs/[id]/briefings/route.ts':
    'Creates an empty DRAFT briefing, which is invisible to everyone but its author (B5/D5). '
    + 'Publishing is the event and it has its own route.',
  'admin/jobs/[id]/result/route.ts':
    'Won/lost/abandoned close-out is a sales outcome recorded by the office. The crew-facing '
    + 'consequence is the stage change, which notifies.',
  'admin/jobs/[id]/geofence/route.ts':
    'Sets the site boundary used by Work Mode clock-in. A geofence radius is configuration, not an '
    + 'event — the crew feels it as clock-in working, and a banner about it explains nothing.',
  'admin/jobs/research/route.ts':
    'Research documents are added continuously while a researcher works a job; each one is a row, '
    + 'not an announcement. The research packet being finished is what the crew needs, and that '
    + 'rides on the stage change.',
  'admin/jobs/contacts/route.ts':
    'Linking a contact record to a job is address-book bookkeeping. Nobody changes what they do '
    + 'because a phone number was filed.',
  'admin/contacts/[id]/jobs/route.ts':
    'The same link, made from the contact side. Exempt for the same reason.',
  'admin/jobs/equipment/route.ts':
    'The equipment subsystem has its own reservation/check-out notifications aimed at the holder '
    + 'and the equipment manager, who are the people it concerns.',
  'admin/jobs/checklists/route.ts':
    'Ticking a checklist item is somebody recording their own work.',
  'admin/jobs/time/route.ts':
    'Logging hours is somebody recording their own work; the hours subsystem notifies approvers.',
  'public/proposal/[token]/route.ts':
    'A client accepting a proposal creates the job. Same reason as jobs/route.ts: there is no crew '
    + 'on it yet at the moment of creation.',
  'cron/purge-deleted/route.ts':
    'Hard-deletes jobs tombstoned more than 30 days ago. There is nothing to notify: the job has '
    + 'been invisible for a month and its team rows go with it.',
};

/**
 * The file with its comments removed.
 *
 * Required, not tidiness: the routes wired by N3 EXPLAIN in their comments why they call the
 * notifier instead of resolving recipients themselves, and those comments name `jobRecipients` and
 * `resolveStageRecipients`. A scan over raw text flagged four files whose only offence was saying
 * what they had been careful not to do.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}

/** `.from('job_files')` / `.from("job_files")`, followed anywhere later by a write verb. */
function writesJobTable(src: string): string[] {
  const hit: string[] = [];
  for (const table of JOB_TABLES) {
    // The write verb must be chained onto THIS `.from(...)`, not merely present in the file — a
    // route that reads `jobs` and inserts into `change_orders` is not a job mutation. Chains here
    // are short, so a 300-character window after the `.from()` is generous and specific.
    const re = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)([\\s\\S]{0,300})`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (/\.(insert|update|upsert|delete)\s*\(/.test(m[1]!)) { hit.push(table); break; }
    }
  }
  return hit;
}

const ROUTES = walk(API_ROOT).map((file) => ({
  key: path.relative(API_ROOT, file).split(path.sep).join('/'),
  src: code(fs.readFileSync(file, 'utf8')),
}));

describe('every route that mutates a job tells the people on that job', () => {
  it('found the API routes at all', () => {
    // A scan that silently matches nothing passes forever. This is the canary.
    expect(ROUTES.length).toBeGreaterThan(100);
  });

  it('no job-mutating route is silent without a written reason', () => {
    const silent: string[] = [];
    for (const { key, src } of ROUTES) {
      const tables = writesJobTable(src);
      if (tables.length === 0) continue;
      if (src.includes('notifyJobEvent')) continue;
      if (key in EXEMPT) continue;
      silent.push(`${key}  (writes: ${[...new Set(tables)].join(', ')})`);
    }
    expect(
      silent,
      'These routes write to a job-scoped table and never reach notifyJobEvent.\n'
      + 'Either call it — one function, so "who is on this job" has one answer (D6) — or add the\n'
      + 'route to EXEMPT in this file with a sentence saying why the people on the job do not need\n'
      + `to hear about it:\n  ${silent.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every exemption still names a real route', () => {
    // An exemption for a file that has been renamed or deleted is a hole: the rule stops applying
    // to the route that replaced it, and nothing says so.
    const keys = new Set(ROUTES.map((r) => r.key));
    const stale = Object.keys(EXEMPT).filter((k) => !keys.has(k));
    expect(
      stale,
      `These EXEMPT entries point at routes that no longer exist. Remove them, or the rule has a
hole where the replacement route sits:\n  ${stale.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every exemption gives a reason long enough to be one', () => {
    const thin = Object.entries(EXEMPT).filter(([, why]) => why.trim().length < 40).map(([k]) => k);
    expect(thin, `An exemption with no real reason is the oversight it was meant to prevent, wearing
a comment:\n  ${thin.join('\n  ')}`).toEqual([]);
  });

  it('an exempted route that later starts notifying is no longer an exemption', () => {
    // Otherwise the list rots into a set of names nobody can safely remove, and the next person
    // reading it cannot tell which entries are decisions and which are stale.
    const contradictory = ROUTES
      .filter((r) => r.key in EXEMPT && r.src.includes('notifyJobEvent'))
      .map((r) => r.key);
    expect(
      contradictory,
      `These routes are listed as exempt AND call notifyJobEvent. Drop them from EXEMPT:
  ${contradictory.join('\n  ')}`,
    ).toEqual([]);
  });
});

// ── the second half of D6 ─────────────────────────────────────────────────────────────────────
//
// "One notifier" is only half the rule; the other half is one RESOLVER. Eleven sites each reading
// `job_team` is eleven definitions of "who is on this job" that agree the day they are written and
// drift the first time somebody adds a column. That is not hypothetical: `resolveStageRecipients`
// took a flat list of team emails and therefore notified people who had been REMOVED from the job
// and people who had DECLINED it, for years, because it had never heard of either column.
//
// The first version of this check flagged any route that read `job_team` and also called
// `notifyMany` anywhere in the file. It caught three routes that were entirely correct — equipment
// check-in, borrow-from-other-crew and personnel/respond all notify equipment managers and
// dispatchers resolved from `registered_users`, and merely happen to read an assignment row in the
// same file. A guard with false positives gets its assertion loosened by the next person to hit it,
// so it is replaced here by the precise version of the same invariant.
describe('the notifier is the only answer to "who is on this job"', () => {
  const SOURCE_FILES = [
    ...walk(path.join(ROOT, 'app')).concat(walkTs(path.join(ROOT, 'lib'))),
  ];

  it('jobRecipients has exactly one caller', () => {
    // Importing the resolver rather than the notifier is the sophisticated version of the mistake:
    // the recipient rule stays correct, and the route gets to skip the volume control, the digest
    // queue and the event vocabulary while looking like it did the right thing.
    const importers = SOURCE_FILES
      .filter((f) => /\bjobRecipients\b/.test(code(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
      .filter((f) => f !== 'lib/notifications/job-event.ts');
    expect(
      importers,
      `Only lib/notifications/job-event.ts may use jobRecipients. Call notifyJobEvent instead —
resolving the recipients yourself skips the per-user volume control and the digest queue:
  ${importers.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the retired stage resolver has not come back', () => {
    // Deleted by N3 rather than left exported-and-tested, because a superseded helper with a green
    // test around it reads like a supported option.
    const revived = SOURCE_FILES
      .filter((f) => /resolveStageRecipients/.test(code(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
    expect(
      revived,
      `resolveStageRecipients was retired: it notified people who had been removed from the job and
people who had declined it. Use notifyJobEvent:\n  ${revived.join('\n  ')}`,
    ).toEqual([]);
  });
});

/** Every .ts/.tsx under a directory — the route walker only wants `route.ts`. */
function walkTs(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walkTs(p, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
