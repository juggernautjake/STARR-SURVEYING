'use client';
// app/admin/research/start/StartResearchConfirm.tsx — picking the documents, then creating it.
//
// Split from the page because this is the only interactive part, and because the creation has to be
// a POST. See the page's header for why a GET would have been wrong: Next.js prefetches `<Link>`s,
// so a create-on-navigate would fire on hover.
//
// It posts to the EXISTING `/api/admin/research` rather than a new endpoint. That route already
// handles the address splitting, the `research_project_jobs` links, the `intake_notes` fallback and
// the supplemental hints — all of which have their own hard-won comments and none of which should
// exist twice.
//
// ── TWO CALLS, NOT ONE TRANSACTION ──────────────────────────────────────────────────────────────
//
// Create the project, then attach the documents. If the attach fails the project still exists with
// everything else it inherited, and the operator lands on it with a warning rather than on an error
// page with nothing to show for the click. A single endpoint doing both would have to decide
// whether a failed copy should destroy a good project, and the answer is no.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { researchCreateBody, type ResearchPrefill } from '@/lib/research/from-job';
import type { OfferedFile } from '@/lib/research/job-documents';
import FilePicker from './FilePicker';

export default function StartResearchConfirm(
  { jobId, prefill, files }: { jobId: string; prefill: ResearchPrefill; files: OfferedFile[] },
) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(files.filter((f) => f.suggested).map((f) => f.id)),
  );

  async function start() {
    // Guard against a double-click producing two projects. The button is disabled below too; this
    // is the half that survives a fast second press before React re-renders.
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      setStep('Creating the project…');
      const res = await fetch('/api/admin/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(researchCreateBody(prefill)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `The project could not be created (${res.status}).`);

      const id = json?.project?.id;
      if (!id) throw new Error('The project was created but came back without an id, so there is nowhere to send you.');

      // A link that could not be written is surfaced, not swallowed — the route returns it as a
      // warning rather than failing, because the project itself is fine and the link is repairable.
      if (json?.warning) console.warn('[research/start]', json.warning);

      const chosen = [...picked];
      if (chosen.length > 0) {
        setStep(`Copying ${chosen.length} document${chosen.length === 1 ? '' : 's'}…`);
        try {
          const att = await fetch(`/api/admin/research/${id}/documents/from-job`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, jobFileIds: chosen }),
          });
          const attJson = await att.json().catch(() => ({}));
          // Never fatal — the project is good. A partial attach is reported where somebody will see
          // it rather than silently making the run thinner than the operator believes it to be.
          if (!att.ok) {
            console.warn('[research/start] documents could not be attached:', attJson?.error);
          } else if (Array.isArray(attJson?.skipped) && attJson.skipped.length > 0) {
            console.warn('[research/start] some documents were skipped:', attJson.skipped);
          }
        } catch (e) {
          console.warn('[research/start] the document copy failed:', e);
        }
      }

      router.push(`/admin/research/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong starting the research.');
      setStep(null);
      setBusy(false);
    }
  }

  const chosenFiles = files.filter((f) => picked.has(f.id));

  return (
    <>
      {files.length > 0 && (
        <section className="startres__card" aria-labelledby="sr-files">
          <h2 id="sr-files" className="startres__cardtitle">Files the research will read</h2>

          {chosenFiles.length === 0 ? (
            <p className="startres__hint">
              Nothing selected. The run will go ahead on the address and the public record alone,
              which is a legitimate choice — but if you have the deed, give it the deed.
            </p>
          ) : (
            <ul className="startres__chosen">
              {chosenFiles.slice(0, 8).map((f) => (
                <li key={f.id} className="startres__chosenitem">
                  {f.thumbUrl
                    ? <img className="startres__chosenthumb" src={f.thumbUrl} alt="" loading="lazy" />
                    : <span className="startres__chosenthumb startres__chosenthumb--none" aria-hidden />}
                  <span className="startres__chosenname">{f.name}</span>
                </li>
              ))}
              {chosenFiles.length > 8 && (
                <li className="startres__chosenmore">and {chosenFiles.length - 8} more</li>
              )}
            </ul>
          )}

          <div className="startres__filebar">
            <button
              type="button"
              className="startres__choose"
              onClick={() => setPicking(true)}
              disabled={busy}
              data-testid="start-research-choose-files"
            >
              Choose files…
            </button>
            <span className="startres__hint">
              {picked.size} of {files.length} selected · documents are ticked by default, site
              photos and video are not
            </span>
          </div>
        </section>
      )}

      {picking && (
        <FilePicker
          files={files}
          picked={picked}
          onClose={() => setPicking(false)}
          onDone={(next) => { setPicked(next); setPicking(false); }}
        />
      )}

      <div className="startres__actions">
        <button
          type="button"
          className="startres__go"
          onClick={() => void start()}
          disabled={busy}
          data-testid="start-research-go"
        >
          {busy ? (step ?? 'Setting it up…') : 'Start the research'}
        </button>
        <a className="startres__cancel" href={`/admin/jobs/${jobId}`}>Cancel</a>

        {error && (
          <p className="startres__error" role="alert" data-testid="start-research-error">{error}</p>
        )}
      </div>
    </>
  );
}
