'use client';
// app/admin/research/start/StartResearchConfirm.tsx — the button that actually creates it.
//
// Split from the page because this is the only interactive part, and because the creation has to be
// a POST. See the page's header for why a GET would have been wrong: Next.js prefetches `<Link>`s,
// so a create-on-navigate would fire on hover.
//
// It posts to the EXISTING `/api/admin/research` rather than a new endpoint. That route already
// handles the address splitting, the `research_project_jobs` links, the `intake_notes` fallback and
// the supplemental hints — all of which have their own hard-won comments and none of which should
// exist twice.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { researchCreateBody, type ResearchPrefill } from '@/lib/research/from-job';

export default function StartResearchConfirm({ jobId, prefill }: { jobId: string; prefill: ResearchPrefill }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    // Guard against a double-click producing two projects. The button is disabled below too; this
    // is the half that survives a fast second press before React re-renders.
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
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

      router.push(`/admin/research/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong starting the research.');
      setBusy(false);
    }
  }

  return (
    <div className="startres__actions">
      <button
        type="button"
        className="startres__go"
        onClick={() => void start()}
        disabled={busy}
        data-testid="start-research-go"
      >
        {busy ? 'Setting it up…' : 'Start the research'}
      </button>
      <a className="startres__cancel" href={`/admin/jobs/${jobId}`}>Cancel</a>

      {error && (
        <p className="startres__error" role="alert" data-testid="start-research-error">{error}</p>
      )}
    </div>
  );
}
