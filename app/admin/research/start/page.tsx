// app/admin/research/start/page.tsx — "Research this Property", from a job.
//
// Owner, 2026-09-20: "on jobs in projects we need to be able to run research runs for the jobs …
// we need to create one and put it next to the create interactive map button." And: "it should
// inherit all of the information for the job such as any documents, address, property id, customer
// name, etc, and it should use that to auto fill info for the research run."
//
// ── WHY THIS IS A CONFIRM SCREEN AND NOT A REDIRECT ─────────────────────────────────────────────
//
// The obvious build is a route handler that reads the job, creates the project and redirects. It
// would be fewer files and it would be wrong, for two reasons.
//
//   1. **Next.js prefetches `<Link>`s.** A GET that creates a row would fire when somebody's mouse
//      passes over the button in the job header. Not when they click it — when they pass over it.
//      A week of that is a research project per hover.
//
//   2. **Two of the inherited fields need a human to see them before the run starts.** A job has no
//      parcel id and no owner — only `client_name`, who may be a title company. Both are spelled
//      out in `lib/research/from-job.ts`. The operator can fix a wrong assumption here in four
//      seconds, or discover it after a paid run has searched a realtor's name in the grantor index.
//
// So: the button navigates here, this page shows what it is about to inherit and what is missing,
// and nothing is written until somebody presses the button. The creation itself goes through the
// existing POST /api/admin/research, so this page adds no second way to make a project.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { researchPrefillFromJob, type JobForResearch } from '@/lib/research/from-job';
import { offerJobFiles, describeOffer, type JobFileForResearch } from '@/lib/research/job-documents';
import { loadMapLibrary } from '@/lib/jobs/property-map-server';
import StartResearchConfirm from './StartResearchConfirm';
import './StartResearch.css';

export const dynamic = 'force-dynamic';

interface PriorProject {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

/** Everything `researchPrefillFromJob` reads, plus what this page displays. */
const JOB_COLUMNS = [
  'id', 'job_number', 'name', 'address', 'city', 'state', 'zip', 'county',
  'survey_type', 'acreage', 'lot_number', 'subdivision', 'abstract_number',
  'client_name', 'client_company', 'client_email', 'client_phone',
  'project_id', 'notes', 'instructions',
].join(', ');

export default async function StartResearchPage(
  { searchParams }: { searchParams: Promise<{ job?: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) redirect('/api/auth/signin');

  const { job: jobId } = await searchParams;
  if (!jobId) notFound();

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!job) notFound();

  const prefill = researchPrefillFromJob(job as unknown as JobForResearch);

  // ── ALREADY RESEARCHED? ───────────────────────────────────────────────────────────────────────
  // `research_project_jobs` is the source of truth for the job↔project link (seed 633:23-25 says
  // the legacy `research_projects.job_id` "stops being the source of truth; the join table is").
  //
  // Existing projects are OFFERED, not auto-opened. A second survey on the same parcel a year later
  // is a legitimate second research project, and silently redirecting to last year's would hide the
  // button's whole purpose behind a link somebody has to notice is stale.
  // Two reads rather than one join. The embedded-select form types as `any` through the Supabase
  // client here, and silencing that with a cast would hide a genuinely wrong shape later; two plain
  // queries stay checked.
  const { data: linkRows } = await supabaseAdmin
    .from('research_project_jobs')
    .select('research_project_id')
    .eq('job_id', jobId);

  const linkedIds = ((linkRows ?? []) as Array<{ research_project_id: string }>)
    .map((r) => r.research_project_id)
    .filter(Boolean);

  const { data: priorRows } = linkedIds.length
    ? await supabaseAdmin
        .from('research_projects')
        .select('id, name, status, created_at')
        .in('id', linkedIds)
        .order('created_at', { ascending: false })
    : { data: [] as PriorProject[] };

  const existing = (priorRows ?? []) as PriorProject[];

  // The job's files, so the confirm screen can offer the documents rather than promising to carry
  // something vague.
  //
  // `is_deleted`, NOT `deleted_at`. Every other table in this feature soft-deletes with a
  // timestamp; `job_files` uses a boolean, and asking it for `deleted_at` is an error from
  // Postgres, not an empty list — so the first version of this page would have 500'd on every job
  // with a file. Caught by reading the actual columns rather than assuming the convention held.
  // `loadMapLibrary` rather than a fresh query: it already reads every file on a job and bulk-signs
  // both the file and its generated thumbnail, per bucket, in one round trip. Writing a second
  // loader here would mean a second place for the signing TTL and the `is_deleted` vs `deleted_at`
  // difference to be got wrong — and the second one has already been got wrong once today.
  //
  // `mapId` is null because assignment to map points is irrelevant to research; the field comes
  // back empty and is ignored.
  const library = await loadMapLibrary(jobId, null);

  const jobFiles: JobFileForResearch[] = library.map((f) => ({
    id: f.id,
    name: f.name,
    contentType: f.mimeType,
    section: f.section,
    sizeBytes: f.sizeBytes,
    thumbUrl: f.thumbUrl,
    url: f.url,
  }));

  const offered = offerJobFiles(jobFiles);

  const jobLabel = [job.job_number, job.name].filter(Boolean).join(' — ') || jobId;

  return (
    <main className="startres">
      <Link href={`/admin/jobs/${jobId}`} className="startres__back">← Back to {jobLabel}</Link>

      <header className="startres__head">
        <h1 className="startres__title">Research this property</h1>
        <p className="startres__sub">
          Everything below comes from the job. Check it, then start — nothing is created until you do.
        </p>
      </header>

      {existing.length > 0 && (
        <section className="startres__card startres__card--prior" aria-labelledby="sr-prior">
          <h2 id="sr-prior" className="startres__cardtitle">
            This job already has {existing.length === 1 ? 'a research project' : `${existing.length} research projects`}
          </h2>
          <ul className="startres__priorlist">
            {existing.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/research/${p.id}`} className="startres__priorlink">{p.name}</Link>
                <span className="startres__priormeta">{p.status} · {new Date(p.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
          <p className="startres__hint">
            Open one of those to re-run it with what it already found. Starting a new one below is
            the right move for a genuinely separate question — a second survey, or a different parcel.
          </p>
        </section>
      )}

      <section className="startres__card" aria-labelledby="sr-inherit">
        <h2 id="sr-inherit" className="startres__cardtitle">What it inherits from this job</h2>
        <dl className="startres__facts">
          <Fact label="Project name" value={prefill.name} />
          <Fact label="Address" value={prefill.propertyAddress} />
          <Fact label="City / ZIP" value={[prefill.city, prefill.zip].filter(Boolean).join(' ') || null} />
          <Fact label="County" value={prefill.county ? `${prefill.county} County` : null} />
          <Fact label="State" value={prefill.state} />
          <Fact label="Legal description" value={prefill.legalDescriptionSummary} />
          <Fact
            label="Name to search"
            value={prefill.ownerName}
            caveat={prefill.ownerIsAssumed
              ? 'This is the client who ordered the survey. If they are not the record owner — a title company, a realtor, a lender — change it once the run opens.'
              : null}
          />
          <Fact label="Files on the job" value={jobFiles.length ? describeOffer(jobFiles) : null} />
        </dl>
      </section>

      {prefill.missing.length > 0 && (
        <section className="startres__card startres__card--gap" aria-labelledby="sr-missing">
          <h2 id="sr-missing" className="startres__cardtitle">What it does not have</h2>
          <ul className="startres__missing">
            {prefill.missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <p className="startres__hint">
            You can start without these and fill them in on the run. They are listed because a run
            with no address and no parcel id will not get past its own readiness check.
          </p>
        </section>
      )}

      <StartResearchConfirm jobId={jobId} prefill={prefill} files={offered} />
    </main>
  );
}

function Fact({ label, value, caveat }: { label: string; value: string | null; caveat?: string | null }) {
  return (
    <div className={`startres__fact${value ? '' : ' startres__fact--empty'}`}>
      <dt className="startres__factlabel">{label}</dt>
      <dd className="startres__factvalue">
        {value ?? <span className="startres__none">not on this job</span>}
        {caveat && <span className="startres__caveat">{caveat}</span>}
      </dd>
    </div>
  );
}
