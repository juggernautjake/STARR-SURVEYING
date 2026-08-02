// lib/research/job-packet.ts — the packet, reachable from the job (plan R26).
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// `research_projects.job_id` has been written on project creation since the table existed and read
// by nothing. So all the work of R13–R25 — the chain, the plats, the conflicts, the gameplan, the
// packet — lived behind `/admin/research/<uuid>`, a screen a field crew has no reason to open and
// often no permission to. The acceptance is exactly this: "a field user opens the job and reads the
// plan without touching the research UI."
//
// ── THE STATES THAT MUST NOT LOOK ALIKE ─────────────────────────────────────────────────────────
//
// Four different situations, and a naive implementation renders three of them as an empty panel:
//
//   no_research     — nothing has been researched for this job
//   research_only   — research exists, but nobody has approved a packet for the field
//   draft_only      — a packet exists in draft; it is NOT what the crew should work from
//   approved        — there is an approved packet
//
// The middle two are the dangerous ones. A crew that sees nothing concludes there is nothing, drives
// out, and repeats work somebody already did — or worse, works from a draft that a reviewer had not
// finished checking.

export type JobPacketState = 'no_research' | 'research_only' | 'draft_only' | 'approved';

export interface PacketRow {
  id: string;
  research_project_id: string;
  version: number;
  title: string;
  status: 'draft' | 'approved' | 'superseded';
  approved_by: string | null;
  approved_at: string | null;
  rendered_json: unknown;
}

export interface JobPacketStatus {
  state: JobPacketState;
  /** The packet a crew should work from. Null unless `state === 'approved'`. */
  packet: PacketRow | null;
  /** Research project ids attached to this job, so a supervisor can go and look. */
  projectIds: string[];
  headline: string;
  /** What to do about it. Empty when there is an approved packet. */
  nextStep: string;
}

/** Decide what the job page should say.
 *
 *  Takes the packets rather than fetching, so the decision is testable without a database — the four
 *  states are the whole point of this module and they deserve to be pinned down. */
export function jobPacketStatus(projectIds: string[], packets: PacketRow[]): JobPacketStatus {
  if (projectIds.length === 0) {
    return {
      state: 'no_research', packet: null, projectIds,
      headline: 'No property research is attached to this job.',
      nextStep: 'If research was done, it was created without linking this job — attach it from the research project.',
    };
  }

  // Most recently approved wins. `superseded` rows are deliberately not candidates: they are kept as
  // evidence of what a crew was previously given, not as something to work from now.
  const approved = packets
    .filter((p) => p.status === 'approved')
    .sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? ''));

  if (approved.length > 0) {
    const p = approved[0]!;
    return {
      state: 'approved', packet: p, projectIds,
      headline:
        `${p.title} (version ${p.version}) — approved by ${p.approved_by ?? 'unknown'}` +
        `${p.approved_at ? ` on ${p.approved_at.slice(0, 10)}` : ''}.`,
      nextStep: '',
    };
  }

  const drafts = packets.filter((p) => p.status === 'draft');
  if (drafts.length > 0) {
    return {
      state: 'draft_only', packet: null, projectIds,
      headline:
        `A research packet exists for this job but has NOT been approved (version ${drafts[0]!.version}, draft).`,
      // Said plainly: a draft is not a deliverable, and working from one is how unchecked facts reach
      // the ground.
      nextStep: 'Do not work from the draft. Ask whoever is reviewing it to approve it, or work from the source documents directly.',
    };
  }

  return {
    state: 'research_only', packet: null, projectIds,
    headline: 'Property research exists for this job, but no packet has been assembled for the field.',
    nextStep: 'The research is in the research workspace — somebody needs to assemble and approve a packet before the crew relies on it.',
  };
}

/** Everything a crew needs offline, pulled from the approved snapshot.
 *
 *  Reads `rendered_json` rather than the live tables on purpose: it is what was approved, and it is
 *  a single object, which is what makes it cacheable for a truck with no signal. */
export interface FieldBrief {
  title: string;
  /** Cover warnings — printed first, because they change what the crew does. */
  warnings: string[];
  sections: Array<{ title: string; entries: Array<{ heading: string; body: string; provenance: string; unsupported: boolean }> }>;
  itemCount: number;
}

export function fieldBrief(packet: PacketRow | null): FieldBrief | null {
  if (!packet?.rendered_json) return null;
  const r = packet.rendered_json as {
    title?: string;
    warnings?: string[];
    sections?: FieldBrief['sections'];
    itemCount?: number;
  };
  return {
    title: r.title ?? packet.title,
    warnings: r.warnings ?? [],
    sections: r.sections ?? [],
    itemCount: r.itemCount ?? 0,
  };
}

/** The two things a crew reads first, lifted out of the brief.
 *
 *  A packet with fifty facts buries the plan and the open questions, and a crew reading on a phone
 *  in a truck will not scroll to find them. */
export function fieldHighlights(brief: FieldBrief | null): { plan: string[]; questions: string[] } {
  if (!brief) return { plan: [], questions: [] };
  const bySection = (title: string) =>
    brief.sections.find((s) => s.title === title)?.entries.map((e) => e.heading) ?? [];
  return {
    plan: bySection('Field plan'),
    questions: bySection('Open questions for the field'),
  };
}
