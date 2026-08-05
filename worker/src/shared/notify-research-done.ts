// worker/src/shared/notify-research-done.ts
//
// TELL WHOEVER STARTED THE RESEARCH THAT IT FINISHED
// ══════════════════════════════════════════════════
//
// *"Whenever AI research gets done, it notifies whoever initiated the research."*
//
// A run takes minutes and nobody watches the whole time. When it finishes — or fails — the person
// who kicked it off should be told, with a link back to the result, rather than having to keep
// checking the page.
//
// The initiator is `research_projects.created_by`, an email. This writes one `notifications` row for
// that person, the same shape the app's `notify()` helper writes, so it lands in their bell and — via
// W-5 — badges the research widget if they have it on their hub.
//
// ── IDEMPOTENT ──────────────────────────────────────────────────────────────────────────────────
//
// The completion path can run more than once — a re-run, a retried job, the county-specific and
// unified pipelines both reaching an end. Keyed on `(source_type, source_id)`: if a
// `research_complete` notification already exists for this project, another is not written. Two "your
// research is done" bells for one run is noise, and noise is how people learn to ignore the bell.
//
// Best-effort by design: a notification failure must never fail the run that just succeeded.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = any;

export interface ResearchDoneInput {
  projectId: string;
  /** 'complete' | 'partial' | 'failed' — shapes the wording, not whether we notify. */
  outcome: 'complete' | 'partial' | 'failed';
  /** Optional: a short reason to include, e.g. the failure message. */
  detail?: string | null;
}

/**
 * Notify the initiator that their research run reached an end state.
 *
 * Returns quietly on every failure path (no supabase, no project, no initiator, already notified,
 * insert error) — the caller is a fire-and-forget tail on a finished run and must not be broken by
 * bookkeeping.
 */
export async function notifyResearchInitiator(supabase: Supabase, input: ResearchDoneInput): Promise<void> {
  if (!supabase) return;

  try {
    const { data: project } = await supabase
      .from('research_projects')
      .select('created_by, property_address, county, name')
      .eq('id', input.projectId)
      .maybeSingle();

    const initiator: string | null = project?.created_by ?? null;
    // No initiator on record means nobody to tell — a system-triggered run, or an old row. Not an
    // error, just nothing to do.
    if (!initiator) return;

    // Already told them? Do not tell them twice.
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('source_type', 'research_project')
      .eq('source_id', input.projectId)
      .eq('type', 'research_complete')
      .limit(1);
    if (Array.isArray(existing) && existing.length > 0) return;

    const where = project?.property_address
      ? `${project.property_address}${project.county ? `, ${project.county} County` : ''}`
      : project?.name || 'your property';

    const title =
      input.outcome === 'failed'
        ? `Research could not finish — ${where}`
        : input.outcome === 'partial'
          ? `Research finished with gaps — ${where}`
          : `Research is ready — ${where}`;

    const body =
      input.outcome === 'failed'
        ? `The run did not complete.${input.detail ? ` ${input.detail}` : ''} Open it to see how far it got.`
        : input.outcome === 'partial'
          ? 'Some sources could not be read, so parts are marked incomplete. Open it to review what was found.'
          : 'Open it to review the findings.';

    const { error } = await supabase.from('notifications').insert({
      user_email: initiator,
      type: 'research_complete',
      title,
      body,
      icon: input.outcome === 'failed' ? '⚠️' : '🔎',
      link: `/admin/research/${input.projectId}`,
      source_type: 'research_project',
      source_id: input.projectId,
      // A failure is worth a louder nudge than a clean finish; both are still just a bell.
      escalation_level: input.outcome === 'failed' ? 1 : 0,
    });
    if (error) {
      console.warn(`[notify-research] ${input.projectId}: could not write notification: ${error.message}`);
    }
  } catch (err) {
    console.warn(
      `[notify-research] ${input.projectId}: error notifying initiator:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
