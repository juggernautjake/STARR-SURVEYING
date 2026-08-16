// C0d2 — composing a job note from the office, and the column that carries two meanings.
//
// ── WHAT C0d2 ACTUALLY NEEDED ───────────────────────────────────────────────────────────────────
//
// It was deferred with a real reason: Work Mode's field-notes tab wrote to `localStorage` keyed by
// job and never synced, so nothing durable existed to migrate and no second person could ever see a
// note. The open question was whether to build a durable per-job scratchpad.
//
// No — one already existed and was unreachable from the job page. `fieldbook_notes` carries
// `job_id`/`job_name`/`job_number`; `POST /api/admin/learn/fieldbook` already accepts all three;
// the mobile app already writes job notes; and two admin surfaces already READ them. What was
// missing was any way for a person at a desk to create one, so a note taken in the field was
// durable and a note taken in the office had nowhere to go.
//
// ── THE COLLISION THIS UNCOVERED ────────────────────────────────────────────────────────────────
//
// `is_current` is read two incompatible ways, and both are load-bearing:
//
//   * a SOFT-ARCHIVE flag — mobile says so outright and filters on it, and both admin readers
//     render `!is_current` as an "archived" badge;
//   * a per-user "the note I have open" POINTER — what the create route implemented, and the shape
//     seed 099's `(user_email, is_current) WHERE is_current = true` index is built for.
//
// They coexisted only because nothing wrote a job note through that route. Adding the compose box
// would have made creating one clear the pointer on the author's PREVIOUS job note, and the job
// page would have badged it "archived" in front of the crew for no visible reason.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const routeRaw = read('app/api/admin/learn/fieldbook/route.ts');
const route = strip(routeRaw);
const pageRaw = read('app/admin/jobs/[id]/field/page.tsx');
const page = strip(pageRaw);

describe('creating a job note does not archive the author’s last one', () => {
  it('the is_current sweep is skipped when the note belongs to a job', () => {
    // The whole defect in one assertion. Without the guard, every office note silently marked the
    // author's previous job note archived.
    expect(route).toMatch(/if\s*\(\s*!job_id\s*\)\s*\{[\s\S]{0,300}is_current:\s*false/);
  });

  it('a personal note still moves the pointer', () => {
    // The pointer meaning is real and is what the notebook UI uses. Removing the sweep outright
    // would have fixed the job page by breaking the notebook.
    expect(route).toContain('is_current: false');
    expect(route).toMatch(/eq\('user_email', email\)/);
  });

  it('a job note is still created active, because that is the meaning every reader uses', () => {
    // Both admin surfaces and mobile treat `is_current` as an archive flag. A job note created
    // false would render "archived" the instant it was written and vanish from mobile's lists.
    expect(route).toMatch(/is_current:\s*true/);
  });

  it('job notes are visible to the crew rather than private to their author', () => {
    // A note about a gate code that only its author can see is not a job note.
    expect(route).toMatch(/if \(job_id\)[\s\S]{0,200}is_public = true/);
  });
});

describe('the compose box writes to the shared table', () => {
  it('posts to the fieldbook route, not to a new per-job endpoint', () => {
    // Building a second table or a second compose surface would split a job's notes by which screen
    // wrote them — the mistake C44z declined to make one slice earlier.
    expect(page).toContain("fetch('/api/admin/learn/fieldbook'");
    expect(page).toMatch(/job_id:\s*jobId/);
  });

  it('sends the job name and number so the fieldbook list is readable', () => {
    expect(page).toMatch(/job_name:/);
    expect(page).toMatch(/job_number:/);
  });

  it('re-reads from the server instead of splicing the new note in locally', () => {
    // The server decides is_current, created_at and the author. A locally-invented row would
    // differ from what everyone else sees until the next reload.
    expect(page).toMatch(/await fetchData\(\)/);
  });

  it('refuses an empty note without calling the server', () => {
    expect(page).toMatch(/if \(!body \|\| !jobId \|\| savingNote\) return/);
  });

  it('shows the failure instead of swallowing it', () => {
    // "queued ≠ failed" — a note that silently did not save is worse than one that refused.
    expect(page).toMatch(/setNoteError\(/);
    expect(pageRaw).toMatch(/role="alert"/);
  });
});
