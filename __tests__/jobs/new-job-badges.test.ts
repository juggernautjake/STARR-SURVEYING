/**
 * NEW bubbles for unseen jobs, and the due bubble (owner, 2026-09-10).
 *
 * "If a job gets created, then everyone that should be notified should get a notification … the
 * workcase icon on the navbar [gets] a little notification bubble that has NEW on it … Job
 * Projects should have New by it … any job the user has not seen yet should have a NEW bubble on
 * it … as soon as they open it, the notification will be cleared." And: "The NEW bubble on the
 * job project listings should sit beside the date created row … if a job has a due date … within
 * two days … DUE IN TWO DAYS, DUE IN ONE DAY, DUE TODAY, PAST DUE."
 *
 * One truth: an unread `job_created` notification per recipient. The rule for the due bubble is a
 * pure function, tested here; the wiring pins check the CALLERS.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dueBubble } from '@/lib/admin/listing';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

describe('dueBubble: the words beside the deadline', () => {
  const now = new Date(2026, 8, 10, 15, 30); // Thu Sep 10 2026, mid-afternoon
  const on = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).toISOString();

  it('says nothing more than two days out, or with no deadline', () => {
    expect(dueBubble(null, now)).toBeNull();
    expect(dueBubble(undefined, now)).toBeNull();
    expect(dueBubble('not a date', now)).toBeNull();
    expect(dueBubble(on(2026, 9, 13), now)).toBeNull();
  });
  it('two days, one day, today — by calendar day, not by hours', () => {
    expect(dueBubble(on(2026, 9, 12), now)).toEqual({ label: 'Due in two days', tone: 'soon' });
    expect(dueBubble(on(2026, 9, 11), now)).toEqual({ label: 'Due in one day', tone: 'soon' });
    // 9 a.m. today is still "today" at 3:30 p.m. — the day is the unit, not the clock.
    expect(dueBubble(on(2026, 9, 10, 9), now)).toEqual({ label: 'Due today', tone: 'today' });
    expect(dueBubble(on(2026, 9, 10, 23), now)).toEqual({ label: 'Due today', tone: 'today' });
  });
  it('past due from the day after the deadline', () => {
    expect(dueBubble(on(2026, 9, 9), now)).toEqual({ label: 'Past due', tone: 'past' });
    expect(dueBubble(on(2026, 1, 1), now)).toEqual({ label: 'Past due', tone: 'past' });
  });
});

describe('a new job tells everyone who works jobs', () => {
  const lib = stripJs(read('lib/notifications.ts'));
  const route = stripJs(read('app/api/admin/jobs/route.ts'));

  it('one job_created notification per recipient, linking to the job, keyed by the job id', () => {
    expect(lib).toContain('export async function notifyJobCreated(');
    expect(lib).toContain("type: 'job_created'");
    expect(lib).toContain("source_type: 'job'");
    expect(lib).toContain('source_id: job.id');
    expect(lib).toContain('link: `/admin/jobs/${job.id}`');
  });
  it('the creator is left out — they have seen it', () => {
    expect(lib).toContain('u.email.toLowerCase() !== job.created_by.toLowerCase()');
  });
  it('the job creation route calls it after the row exists, and a failure is a warning not a failed create', () => {
    const at = route.indexOf('await notifyJobCreated({');
    expect(at).toBeGreaterThan(route.indexOf(".from('jobs')\n    .insert({"));
    expect(route.slice(at - 200, at + 600)).toMatch(/try \{[\s\S]*await notifyJobCreated\([\s\S]*\} catch \(e\) \{[\s\S]*warnings\.push/);
  });
  it('the type is a hub badge topic, so the bell and the My Jobs widget count it too', () => {
    expect(stripJs(read('lib/hub/notification-topics.ts'))).toMatch(/job_created: \{ widgetIds: \['my-jobs'/);
  });
});

describe('the new-jobs endpoint reads and clears the same rows', () => {
  const route = stripJs(read('app/api/admin/jobs/new/route.ts'));
  it('GET: unread, undismissed job_created rows for the caller, filtered to jobs that still exist', () => {
    expect(route).toContain(".eq('type', 'job_created')");
    expect(route).toContain(".eq('is_read', false)");
    expect(route).toContain(".eq('is_dismissed', false)");
    expect(route).toContain(".is('deleted_at', null)");
    expect(route).toContain("select('id, project_id')");
  });
  it('POST: marks the caller\'s row for that job read — never another person\'s', () => {
    const at = route.indexOf('export const POST');
    const post = route.slice(at);
    expect(post).toContain(".eq('user_email', session.user.email)");
    expect(post).toContain(".eq('source_id', jobId)");
    expect(post).toContain('is_read: true');
  });
});

describe('the client hook is the one reader, and every surface uses it', () => {
  const hook = stripJs(read('lib/admin/use-new-jobs.ts'));
  it('one shared request per page, refreshed on focus and on a timer; markSeen is optimistic', () => {
    expect(hook).toContain("fetch('/api/admin/jobs/new'");
    expect(hook).toContain("window.addEventListener('focus', onFocus)");
    expect(hook).toContain('window.setInterval(');
    expect(hook).toContain('export function markJobSeen(');
    expect(hook).toContain("method: 'POST'");
  });
  it('the Work icon carries NEW and the Job Projects row says New', () => {
    const fly = stripJs(read('app/admin/components/nav/WorkspaceFlyout.tsx'));
    expect(fly).toContain("from '@/lib/admin/use-new-jobs'");
    expect(fly).toContain("const hasNewJobs = workspace === 'work' && newJobs.jobIds.size > 0;");
    expect(fly).toContain('data-testid="rail-new-jobs"');
    expect(fly).toContain("hasNewJobs && route.href === '/admin/jobs'");
    expect(fly).toContain('data-testid="flyout-new-jobs"');
    const css = read('app/admin/components/nav/IconRail.css');
    expect(css).toContain('.admin-rail__new {');
    expect(css).toContain('.admin-rail__flyout-new {');
  });
  it('the project cards: NEW beside Created, the due bubble beside Deadline', () => {
    const tab = stripJs(read('app/admin/jobs/_tabs/ProjectsTab.tsx'));
    expect(tab).toContain("from '@/lib/admin/use-new-jobs'");
    expect(tab).toContain('const isNew = newJobs.projectIds.has(p.id);');
    const created = tab.indexOf('<span className="lst-card__k">Created</span>');
    expect(tab.slice(created, created + 400)).toContain('data-testid="project-new"');
    const deadline = tab.indexOf('<span className="lst-card__k">Deadline</span>');
    expect(tab.slice(deadline, deadline + 700)).toContain('data-testid="project-due"');
    expect(tab, 'the old "· overdue" text is back beside the bubble').not.toContain("' · overdue'");
    const css = read('app/admin/components/listing/Listing.css');
    for (const cls of ['lst-bubble', 'lst-bubble--new', 'lst-bubble--soon', 'lst-bubble--today', 'lst-bubble--past']) {
      expect(css).toContain(`.${cls}`);
    }
  });
  it('the job cards and the project page rows say New too, and the job page clears it', () => {
    expect(stripJs(read('app/admin/components/jobs/JobCard.tsx'))).toContain('data-testid="job-new"');
    expect(stripJs(read('app/admin/jobs/_tabs/JobsTab.tsx'))).toContain('isNew={newJobs.jobIds.has(job.id)}');
    expect(stripJs(read('app/admin/projects/[id]/page.tsx'))).toContain('data-testid="project-job-new"');
    const jobPage = stripJs(read('app/admin/jobs/[id]/page.tsx'));
    expect(jobPage).toContain("from '@/lib/admin/use-new-jobs'");
    expect(jobPage).toContain('useEffect(() => { if (jobId) markJobSeen(jobId); }, [jobId]);');
  });
});
