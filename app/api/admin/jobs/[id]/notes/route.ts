// app/api/admin/jobs/[id]/notes/route.ts — the note log for one job.
//
// Owner, 2026-08-16: *"make it so that the user can open up the job and add a note to it … Job note
// entries should be recorded and should display who posted it to the job, from where and the date
// and time."*
//
// ── WHY A SECOND WRITER TO `fieldbook_notes`, WHEN THIS REPO KEEPS PUNISHING THAT ───────────────
//
// `POST /api/admin/learn/fieldbook` already accepts `job_id`. Adding a route that writes the same
// table is exactly the shape C44z declined ("a second table would split a job's notes by which
// screen wrote them"), so it needs a reason rather than a preference.
//
// The reason is the audit line the owner asked for. Three of its four fields must not be
// client-asserted:
//
//   * **who** — taken from the session, never from the body;
//   * **which job** — taken from the URL, so a note cannot be posted to a job the path does not
//     name;
//   * **from where** — stamped server-side by `officeJobNoteContext`. A browser that supplies its
//     own origin is a browser that can supply somebody else's, which is the reasoning that kept
//     `distanceSource` off the client in C0b1.
//
// The generic fieldbook route stays exactly as it is and remains the personal-note path. What is
// NOT duplicated is the meaning of a row: the origin vocabulary lives in `lib/field/job-note-origin.ts`
// and both readers use it.
//
// ── AND WHY NOT JUST WIDEN /jobs/[id]/field-data ────────────────────────────────────────────────
//
// That route returns the whole field manifest — points, media with signed URLs, notes and files, in
// four bulk fetches. A notes panel on the job page would pull all of it to render a list of
// sentences, and every signed URL it minted would go unused.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { jobNoteOrigin, describeJobNoteOrigin, officeJobNoteContext } from '@/lib/field/job-note-origin';

const MAX_NOTE_LEN = 4000;

/** `/api/admin/jobs/{id}/notes` — the id is the segment before the last. */
function jobIdFrom(req: NextRequest): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 2] ?? null;
}

export interface JobNoteEntry {
  id: string;
  body: string;
  title: string | null;
  /** Who posted it. `name` is null when the author is not a registered user any more. */
  author_email: string;
  author_name: string | null;
  /** From where, already resolved to a phrase the card can print. */
  origin: string;
  origin_label: string;
  /** When. ISO; the client formats to the reader's locale. */
  created_at: string;
  updated_at: string | null;
  /** Present on notes the field app attached to a specific shot. */
  data_point_id: string | null;
  note_template: string | null;
}

/** Shared by GET and POST so a freshly-created note comes back in exactly the shape the list uses —
 *  otherwise the row the panel inserts locally differs from the row it re-reads. */
type NoteRow = {
  id: string;
  title: string | null;
  content: string | null;
  user_email: string | null;
  created_at: string;
  updated_at: string | null;
  context_type: string | null;
  context_label: string | null;
  page_url: string | null;
  data_point_id: string | null;
  note_template: string | null;
};

const SELECT =
  'id, title, content, user_email, created_at, updated_at, context_type, context_label, page_url, data_point_id, note_template';

/** Resolve author display names in ONE query. Notes key their author by EMAIL, not by the
 *  `created_by` id that points, media and files use — which is why the manifest route's existing
 *  bulk lookup never covered them and every note has always rendered as a raw email address. */
async function namesByEmail(emails: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(emails.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data } = await supabaseAdmin
    .from('registered_users')
    .select('email, name')
    .in('email', unique);
  for (const u of (data ?? []) as Array<{ email: string; name: string | null }>) {
    if (u.name) out.set(u.email, u.name);
  }
  return out;
}

function toEntry(row: NoteRow, names: Map<string, string>): JobNoteEntry {
  const origin = jobNoteOrigin(row);
  return {
    id: row.id,
    body: row.content ?? '',
    title: row.title,
    author_email: row.user_email ?? '',
    author_name: row.user_email ? names.get(row.user_email) ?? null : null,
    origin,
    origin_label: describeJobNoteOrigin(origin),
    created_at: row.created_at,
    updated_at: row.updated_at,
    data_point_id: row.data_point_id,
    note_template: row.note_template,
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobId = jobIdFrom(req);
  if (!jobId) return NextResponse.json({ error: 'Missing job id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('fieldbook_notes')
    .select(SELECT)
    .eq('job_id', jobId)
    // Newest first: a note log is read from the top, and the most recent access instruction is the
    // one that matters on the way to site.
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as NoteRow[];
  const names = await namesByEmail(rows.map((r) => r.user_email ?? ''));
  return NextResponse.json({ notes: rows.map((r) => toEntry(r, names)) });
}, { routeName: 'admin/jobs.notes.get' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const email = session.user.email;

  const jobId = jobIdFrom(req);
  if (!jobId) return NextResponse.json({ error: 'Missing job id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const content = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!content) {
    return NextResponse.json({ error: 'A note needs some text.' }, { status: 400 });
  }
  if (content.length > MAX_NOTE_LEN) {
    return NextResponse.json(
      { error: `That note is ${content.length} characters; the limit is ${MAX_NOTE_LEN}.` },
      { status: 400 },
    );
  }

  // The job must exist, and its name/number are denormalised onto the note so the fieldbook list
  // can label it without joining. Reading them here rather than trusting the body is the same rule
  // as the origin: the client names the job by id in the path and nothing else.
  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('id, name, job_number')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const jobRow = job as { id: string; name: string | null; job_number: string | null };

  const { data, error } = await supabaseAdmin
    .from('fieldbook_notes')
    .insert({
      user_email: email,
      // The first line is the handle the fieldbook list renders. A note with no title shows as
      // "Untitled Note" there, which tells a reader nothing about which job note they are looking at.
      title: content.split('\n')[0].slice(0, 80),
      content,
      job_id: jobRow.id,
      job_name: jobRow.name,
      job_number: jobRow.job_number,
      // A job note belongs to the crew working the job, not to whoever typed it.
      is_public: true,
      // C0d2: `is_current` is read as a soft-archive flag by every READER (mobile and both admin
      // screens), so a new note must be true or it renders "archived" the moment it is written.
      // The per-user "note I have open" pointer that the learn route maintains is deliberately NOT
      // touched here — see BLOCKERS.md, where the two meanings are recorded for a decision.
      is_current: true,
      content_format: 'rich_text',
      media: [],
      tags: [],
      ...officeJobNoteContext(jobRow.id),
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = data as NoteRow;
  const names = await namesByEmail([row.user_email ?? '']);
  return NextResponse.json({ note: toEntry(row, names) }, { status: 201 });
}, { routeName: 'admin/jobs.notes.post' });
