// __tests__/activity/record-activity.test.ts — "last touched first" and the change log (2026-10-11).
//
// Owner: the project/job last modified (a file uploaded, information changed) or viewed goes to the
// top of its list, and every file addition and change on a job or project is logged. The recording
// is done by triggers (seeds/676); these tests pin the pure ordering/wording and — because a
// helper nobody calls is the commonest defect here — that the routes and pages actually call it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  activityInstant, sortByActivity, activityLine, timeAgo, describeFieldChanges, changeView,
  isCoveredByChangeLog, type RecordChange,
} from '@/lib/activity/record-activity';
import { sortRows, SORT_OPTIONS } from '@/lib/admin/listing';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('activityInstant', () => {
  it('takes the later of modified and viewed', () => {
    expect(activityInstant({ last_modified_at: '2026-10-01T00:00:00Z', last_viewed_at: '2026-10-05T00:00:00Z' }, {}))
      .toBe('2026-10-05T00:00:00Z');
    expect(activityInstant({ last_modified_at: '2026-10-09T00:00:00Z', last_viewed_at: '2026-10-05T00:00:00Z' }, {}))
      .toBe('2026-10-09T00:00:00Z');
  });
  it('falls back to the row’s own timestamps when there is no stamp', () => {
    expect(activityInstant(undefined, { updated_at: '2026-09-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }))
      .toBe('2026-09-01T00:00:00Z');
    expect(activityInstant(null, { created_at: '2026-01-01T00:00:00Z' })).toBe('2026-01-01T00:00:00Z');
  });
});

describe('sortByActivity', () => {
  it('puts the most recently touched first, regardless of creation order', () => {
    const rows = [
      { id: 'old-but-busy', created_at: '2025-01-01', last_activity_at: '2026-10-11T10:00:00Z' },
      { id: 'new-but-idle', created_at: '2026-10-01', last_activity_at: '2026-10-01T00:00:00Z' },
      { id: 'middle', created_at: '2026-05-01', last_activity_at: '2026-10-05T00:00:00Z' },
    ];
    expect(sortByActivity(rows).map((r) => r.id)).toEqual(['old-but-busy', 'middle', 'new-but-idle']);
  });
});

describe('listing sort "Recently active"', () => {
  it('is offered first and orders by last_activity_at', () => {
    expect(SORT_OPTIONS[0].key).toBe('activity');
    const rows = [
      { name: 'A', created_at: '2026-10-10', last_activity_at: '2026-10-10' },
      { name: 'B', created_at: '2026-01-01', last_activity_at: '2026-10-11' },
    ];
    expect(sortRows(rows, 'activity').map((r) => r.name)).toEqual(['B', 'A']);
  });
});

describe('activityLine / timeAgo', () => {
  const now = Date.parse('2026-10-11T12:00:00Z');
  it('says which of edit or view put the row where it is', () => {
    expect(activityLine({ last_modified_at: '2026-10-11T11:55:00Z', last_viewed_at: '2026-10-11T09:00:00Z' }, now)).toBe('Edited 5 min ago');
    expect(activityLine({ last_modified_at: '2026-10-10T12:00:00Z', last_viewed_at: '2026-10-11T10:00:00Z' }, now)).toBe('Viewed 2 hr ago');
    expect(activityLine({}, now)).toBeNull();
  });
  it('reads naturally', () => {
    expect(timeAgo('2026-10-11T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-10-10T12:00:00Z', now)).toBe('1 day ago');
  });
});

describe('change-log wording', () => {
  const base: RecordChange = {
    id: '1', created_at: '2026-10-11T12:00:00Z', project_id: 'p', job_id: 'j', subject: 'file',
    subject_id: 'f', action: 'created', actor: 'a@b.com', changes: {}, label: 'plat.pdf',
  };
  it('a file added names the file', () => {
    expect(changeView(base)).toMatchObject({ label: 'File added', detail: 'plat.pdf', actor: 'a@b.com', type: 'file_created' });
  });
  it('a job edit lists the fields that moved, old → new', () => {
    const v = changeView({ ...base, subject: 'job', action: 'updated', label: 'Lance Lane',
      changes: { address: { from: '12 Oak St', to: '14 Oak St' }, is_priority: { from: false, to: true } } });
    expect(v.label).toBe('Job updated');
    expect(v.detail).toBe('2 fields');
    expect(v.fields).toEqual(['Address: 12 Oak St → 14 Oak St', 'Priority: no → yes']);
  });
  it('never prints an id at somebody', () => {
    expect(describeFieldChanges({ folder_id: { from: null, to: 'a1b2c3d4-0000-0000-0000-000000000000' } })).toEqual(['Folder changed']);
  });
  it('drops duplicate activity_log rows only after the change log began', () => {
    expect(isCoveredByChangeLog('job_file_uploaded', '2026-10-12T00:00:00Z', '2026-10-11T23:30:00Z')).toBe(true);
    expect(isCoveredByChangeLog('job_file_uploaded', '2026-09-01T00:00:00Z', '2026-10-11T23:30:00Z')).toBe(false);
    expect(isCoveredByChangeLog('cad_drawing_saved', '2026-10-12T00:00:00Z', '2026-10-11T23:30:00Z')).toBe(false);
  });
});

describe('seeds/676 records every write that matters', () => {
  const sql = read('seeds/676_record_activity.sql');
  it.each(['jobs', 'projects', 'job_files', 'job_file_folders', 'job_team'])('logs %s', (t) => {
    expect(sql).toMatch(new RegExp(`CREATE TRIGGER rc_log_trg AFTER INSERT[^;]*ON public\\.${t}\\b`));
  });
  it('takes the actor on every audited table and blanks the hint', () => {
    expect(sql).toContain("ARRAY['jobs', 'projects', 'job_files', 'job_file_folders', 'job_team']");
    expect(sql).toContain('NEW.change_actor := NULL');
  });
  it('ignores machine-only file updates (thumbnails, upload progress)', () => {
    expect(sql).toMatch(/'thumb_state'/);
    expect(sql).toMatch(/'upload_state'/);
  });
});

describe('wiring — the callers', () => {
  it('the jobs list orders by activity', () => {
    const s = read('app/api/admin/jobs/route.ts');
    expect(s).toContain("from '@/lib/activity/record-activity-server'");
    expect(s).toMatch(/sortByActivity\(/);
  });
  it('the projects list and a project’s jobs order by activity', () => {
    expect(read('app/api/admin/projects/route.ts')).toMatch(/projectActivityFor\(ids\)/);
    expect(read('app/api/admin/projects/[id]/route.ts')).toMatch(/jobActivityFor\(/);
  });
  it('the Projects tab defaults to Recently active', () => {
    expect(read('app/admin/jobs/_tabs/ProjectsTab.tsx')).toContain("useState<SortKey>('activity')");
  });
  it('opening a job or a project records a view', () => {
    expect(read('app/admin/jobs/[id]/page.tsx')).toMatch(/\/api\/admin\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/open/);
    expect(read('app/api/admin/projects/[id]/open/route.ts')).toMatch(/markProjectViewed\(/);
  });
  it('the job Activity tab and project History read the change log', () => {
    expect(read('app/api/admin/jobs/activity/route.ts')).toMatch(/changesForJob\(jobId\)/);
    expect(read('app/admin/projects/[id]/page.tsx')).toMatch(/<JobActivityFeed projectId=/);
  });
  it.each([
    'app/api/admin/jobs/route.ts',
    'app/api/admin/jobs/files/route.ts',
    'app/api/admin/jobs/files/[id]/route.ts',
    'app/api/admin/jobs/files/[id]/send/route.ts',
    'app/api/admin/jobs/folders/route.ts',
    'app/api/admin/jobs/folders/[id]/route.ts',
    'app/api/admin/jobs/team/route.ts',
    'app/api/admin/jobs/stages/route.ts',
    'app/api/admin/projects/route.ts',
    'app/api/admin/projects/[id]/route.ts',
    'lib/files/delete-handlers.ts',
  ])('%s names the person behind its writes', (p) => {
    expect(read(p)).toContain('change_actor');
  });
});
