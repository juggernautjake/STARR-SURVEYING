// app/admin/research/[projectId]/_sections/property-review-fields.ts — B1a.
//
// Which property facts the Review tab shows, and where each one comes from.
//
// ── WHY THIS IS A FUNCTION AND NOT JSX ──────────────────────────────────────────────────────────
//
// Every field here has a FALLBACK: the project row first, the run result second, or the reverse.
// That precedence is the only thing in the block that can be wrong in a way a surveyor would
// notice — a stale address from a project row winning over a freshly-researched one, or an owner
// name that the run found being hidden behind an empty column.
//
// The block it came from carried a comment recording that three of the columns it cast to did not
// exist (`owner_name`, `legal_description`, `acreage` are not on `research_projects`). Each had a
// working fallback, so the display was right and the first operand of every `||` was dead — while
// the identical cast three lines up the same file WAS doing damage, because an always-`undefined`
// `owner_name` meant the worker's owner-based clerk search never ran.
//
// That is the argument for pulling the precedence out where it can be asserted rather than read.

export interface ReviewField {
  label: string;
  value: string | null;
  /** Spans both columns — for the legal description, which is a paragraph. */
  wide?: boolean;
}

/** The project row, narrowed to the columns that actually exist on `research_projects`. */
export interface ProjectLike {
  property_address?: string | null;
  county?: string | null;
  state?: string | null;
  parcel_id?: string | null;
  legal_description_summary?: string | null;
  analysis_metadata?: unknown;
}

/**
 * Assemble the Review tab's property fields.
 *
 * `ownerName` is passed in rather than read here: it comes from `projectOwnerName()`, which knows
 * the several places an owner name has historically been written, and duplicating that lookup is
 * how the two copies drift apart.
 */
export function propertyReviewFields(
  project: ProjectLike,
  ownerName: string | null | undefined,
): ReviewField[] {
  const meta = project.analysis_metadata as Record<string, unknown> | null;
  const result = (meta?.result ?? null) as Record<string, unknown> | null;

  const str = (v: unknown): string | null => {
    if (typeof v === 'string') return v.trim() || null;
    if (typeof v === 'number') return String(v);
    return null;
  };

  const acreage = result?.acreage;

  const fields: ReviewField[] = [
    { label: 'Property Address', value: str(project.property_address) ?? str(result?.situsAddress) },
    { label: 'County', value: str(project.county) },
    { label: 'State', value: str(project.state) },
    // The run's owner name is the fallback, not the winner: `projectOwnerName` already prefers the
    // researched value where there is one, and re-deciding that here would give two answers.
    { label: 'Owner Name', value: str(ownerName) ?? str(result?.ownerName) },
    { label: 'Parcel / Property ID', value: str(project.parcel_id) ?? str(result?.propertyId) },
    { label: 'Lot', value: str(result?.lotNumber) },
    { label: 'Block', value: str(result?.blockNumber) },
    { label: 'Subdivision', value: str(result?.subdivisionName) },
    {
      // The run's legal description wins: it is the researched one, and the project column is
      // whatever was typed at intake.
      label: 'Legal Description',
      value: str(result?.legalDescription) ?? str(project.legal_description_summary),
      wide: true,
    },
    // `result.acreage ? …` dropped a genuine 0. Zero acres is not a real parcel, but the same
    // shortcut hid a zero document count two components away and that one mattered — so the check
    // is for absence, not for falsiness.
    { label: 'Acreage', value: acreage == null || acreage === '' ? null : `${acreage} ac` },
  ];

  return fields.filter((f) => f.value !== null);
}
