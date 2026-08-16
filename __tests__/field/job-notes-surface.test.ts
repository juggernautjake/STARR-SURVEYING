// Job notes — the route contract and the panel that renders it.
//
// Owner, 2026-08-16: *"make it so that the user can open up the job and add a note to it … Job note
// entries should be recorded and should display who posted it to the job, from where and the date
// and time."*
//
// Source scans, for the reason the rest of this repo uses them: the route talks to Supabase and the
// panel is a client component behind a session. What is cheap and worth pinning is the shape of the
// contract between them and the three properties that would be quietly wrong if they regressed.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const routeRaw = read('app/api/admin/jobs/[id]/notes/route.ts');
const route = strip(routeRaw);
const panelRaw = read('app/admin/components/jobs/JobNotesPanel.tsx');
const panel = strip(panelRaw);
const jobPage = strip(read('app/admin/jobs/[id]/page.tsx'));
const fieldPage = strip(read('app/admin/jobs/[id]/field/page.tsx'));

describe('the three audit fields are decided by the server', () => {
  it('the author comes from the session, never from the body', () => {
    expect(route).toMatch(/const email = session\.user\.email/);
    expect(route).toMatch(/user_email: email/);
    // If the body could name the author, one person could post as another.
    expect(route).not.toMatch(/user_email:\s*body/);
  });

  it('the job comes from the URL, never from the body', () => {
    // Otherwise a note could be posted to a job the path does not name.
    expect(route).toMatch(/jobIdFrom\(req\)/);
    expect(route).not.toMatch(/job_id:\s*body/);
  });

  it('the origin is stamped server-side', () => {
    // A browser that supplies its own origin can supply somebody else's — the reasoning that kept
    // distanceSource off the client in C0b1.
    expect(route).toContain('officeJobNoteContext');
    expect(route).not.toMatch(/context_type:\s*body/);
  });

  it('the job must exist before a note is attached to it', () => {
    expect(route).toMatch(/Job not found/);
  });
});

describe('authorisation — signed in is not the same as allowed', () => {
  // This route shipped checking only `session?.user?.email`, while BOTH its neighbours check more:
  // `field-data` requires admin-or-tech_support and `instructions` requires org membership plus the
  // job being in that org. The tell was an `isAdmin` imported and never called.
  //
  // Why it mattered: every query here runs through `supabaseAdmin`, the service-role client that
  // bypasses RLS. `lib/saas/org-scope.ts` re-adds an org filter at that choke point, but only when a
  // scope is ACTIVE — and it is resolved from the caller's org membership. So a signed-in account
  // with NO org resolved no scope, got no filter, and read every tenant's notes. Requiring
  // membership is what makes the scope exist.

  it('both verbs require an org membership, not merely a session', () => {
    const gets = route.match(/export const (GET|POST)[\s\S]*?routeName/g) ?? [];
    expect(gets, 'expected both GET and POST handlers to be found').toHaveLength(2);
    for (const handler of gets) {
      expect(handler).toMatch(/orgMember\(session\.user\.email\)/);
      expect(handler).toMatch(/status:\s*403/);
    }
  });

  it('and the job must be in the CALLER’S org, on both verbs', () => {
    expect(route).toMatch(/function jobInOrg/);
    // Both handlers go through it — a note is neither read from nor written to another firm's job.
    expect(route.match(/jobInOrg\(jobId, member\.orgId\)/g) ?? []).toHaveLength(2);
  });

  it('a job in another org reads as 404, not 403, so the id is not confirmed', () => {
    // 403 on a foreign id tells the caller that id exists somewhere, which is a membership oracle.
    // `jobInOrg` collapses "absent" and "another firm's" into one null, and both call sites answer 404.
    expect(route).toMatch(/org_id !== orgId/);
    expect(route).toMatch(/org_id !== orgId\) return null/);
    expect(route.match(/'Job not found' \}, \{ status: 404 \}/g) ?? []).toHaveLength(2);
  });

  it('the dead `isAdmin` import is gone rather than left as decoration', () => {
    // An imported-but-uncalled authorisation helper reads, at a glance, as an authorisation check.
    // Checked against the STRIPPED source: the header explains the removal and names it in prose.
    expect(route).not.toMatch(/\bisAdmin\b/);
  });
});

describe('the route refuses badly rather than silently', () => {
  it('an empty note is refused with a sentence', () => {
    expect(routeRaw).toMatch(/A note needs some text/);
  });

  it('an over-long note is refused with the actual length', () => {
    // "Too long" leaves the writer trimming blindly.
    expect(routeRaw).toMatch(/the limit is/);
    expect(route).toMatch(/MAX_NOTE_LEN/);
  });
});

describe('reading a note back', () => {
  it('resolves author names in one query, keyed by email', () => {
    // Notes key their author by EMAIL; points, media and files key by a `created_by` id. That is
    // why the manifest route's existing bulk lookup never covered notes and every note has always
    // rendered as a raw email address.
    expect(route).toContain('namesByEmail');
    expect(route).toMatch(/from\('registered_users'\)/);
    expect(route).toMatch(/\.in\('email'/);
  });

  it('returns the origin already resolved to a phrase', () => {
    // So the panel cannot invent its own vocabulary for the same fact.
    expect(route).toContain('describeJobNoteOrigin');
    expect(route).toMatch(/origin_label/);
  });

  it('newest first', () => {
    expect(route).toMatch(/ascending:\s*false/);
  });

  it('POST returns the created row in the same shape GET uses', () => {
    // So the panel can prepend it instead of re-fetching, without inventing a row that differs
    // from what everyone else will see.
    expect(route).toMatch(/toEntry\(row, names\)/);
    expect(route).toMatch(/const SELECT\s*=/);
  });
});

describe('the panel prints who, from where, and when', () => {
  it('shows the author name, falling back to the email', () => {
    expect(panel).toMatch(/author_name \?\? n\.author_email/);
  });

  it('shows the origin label', () => {
    expect(panel).toMatch(/origin_label/);
  });

  it('shows an absolute date and time, not "3 days ago"', () => {
    // A note about a gate code is evidence about a particular visit; relative time makes two
    // visits look alike.
    expect(panel).toMatch(/toLocaleString/);
    expect(panelRaw).toMatch(/<time dateTime=/);
  });

  it('names a load failure instead of rendering an empty list', () => {
    // An empty list and a failed fetch look identical on screen, and this panel's whole job is to
    // say what is on the record for a job.
    expect(panel).toMatch(/setLoadError/);
    expect(panelRaw).toMatch(/role="alert"/);
  });

  it('names a save failure', () => {
    expect(panel).toMatch(/setSaveError/);
  });
});

describe('one notes surface, mounted where people actually look', () => {
  it('the job detail page mounts it', () => {
    // "Open up the job" lands on /admin/jobs/[id]. The C0d2 compose box was on the separate
    // /admin/jobs/[id]/field page — working, and where nobody looks. That is the C0b3b shape.
    expect(jobPage).toContain('<JobNotesPanel');
    expect(jobPage).toContain("from '../../components/jobs/JobNotesPanel'");
  });

  it('the field-data page mounts the SAME component rather than its own copy', () => {
    expect(fieldPage).toContain('<JobNotesPanel');
    // The inline compose box and its state are gone; two copies would drift, and the metadata line
    // is exactly the kind of detail that drifts first.
    expect(fieldPage).not.toMatch(/setNoteDraft/);
    expect(fieldPage).not.toMatch(/onAddNote/);
  });
});

describe('personal notes still save, and say so when they do not', () => {
  const myNotes = strip(read('app/admin/my-notes/MyNotesPanel.tsx'));

  it('a failed save is reported instead of swallowed', () => {
    // Was `catch { /* silent */ }` with no else on `if (res.ok)`. Auto-save runs every two seconds,
    // so the editor would keep showing "Saved 14:02" from the last success while every keystroke
    // since had gone nowhere.
    expect(myNotes).toMatch(/setSaveError/);
    expect(myNotes).not.toMatch(/catch \{ \/\* silent \*\/ \}/);
  });

  it('the error outranks the stale "Saved" line', () => {
    expect(myNotes).toMatch(/saveError[\s\S]{0,200}lastSaved/);
  });

  it('a personal note is still a personal note — no job_id on that path', () => {
    // The tab that creates personal notes must not start attaching them to a job.
    expect(myNotes).toMatch(/title: editTitle \|\| 'Untitled Note'/);
  });
});
