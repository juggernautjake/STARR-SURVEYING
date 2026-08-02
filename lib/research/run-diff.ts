// lib/research/run-diff.ts — what changed since the last run (plan R27).
//
// ── TWO GAPS, NOT ONE ───────────────────────────────────────────────────────────────────────────
//
// `PipelineDiffEngine` exists and diffs boundary calls, confidence and closure between two stored
// versions. An API route calls it. **No screen renders it** — so the engine has been running for
// nobody, which is this repo's most common defect.
//
// And its scope is narrower than R27 asks for. The plan wants "new instruments, changed CAD values,
// new imagery": document-level and fact-level change, not just the geometry. A job that sat for three
// months and gained two new deeds needs to be told that, and the call diff cannot say it.
//
// ── WHAT CAN AND CANNOT BE KNOWN ────────────────────────────────────────────────────────────────
//
// Additions are exact: a document or fact created after the previous run started is new, and
// `created_at` says so. **Changes** are the honest problem. Nothing snapshots a CAD value per run,
// so "this acreage used to read 2.45" is unanswerable in general — except where a row keeps both
// halves, which is precisely what R23's corrections do (`raw_value` alongside `corrected_value`).
//
// So this module reports what it can prove and states what it cannot, rather than implying a
// complete change list. A diff that silently omits changed values is worse than one that says it
// only detects additions and corrections.

export interface RunWindow {
  /** When the PREVIOUS run started. Everything after this is new work. */
  since: string | null;
  previousRunAt: string | null;
  currentRunAt: string | null;
}

export interface DocumentLite {
  id: string;
  document_label?: string | null;
  original_filename?: string | null;
  document_type?: string | null;
  recording_info?: string | null;
  created_at: string;
}

export interface FactLite {
  id: string;
  data_category: string;
  raw_value: string;
  display_value?: string | null;
  corrected_value?: string | null;
  review_status?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export type ChangeKind = 'new_document' | 'new_imagery' | 'new_fact' | 'corrected_fact';

export interface RunChange {
  kind: ChangeKind;
  label: string;
  detail: string;
  at: string;
}

export interface RunDiff {
  window: RunWindow;
  changes: RunChange[];
  counts: Record<ChangeKind, number>;
  /** Stated limits of this comparison. Printed, not hidden. */
  caveats: string[];
  headline: string;
  /** True when there is no previous run to compare against — the first run is not "no changes". */
  firstRun: boolean;
}

const IMAGERY_TYPES = new Set(['aerial_photo', 'gis_map', 'flood_map', 'topo_map', 'road_map', 'map_screenshot']);

function docLabel(d: DocumentLite): string {
  return d.document_label || d.recording_info || d.original_filename || 'an unnamed document';
}

/** What arrived, and what a person changed, since the previous run started.
 *
 *  Windowed on the previous run's START rather than its finish: a document fetched during that run
 *  belongs to it, and windowing on the finish would report the whole of the last run's haul as new
 *  work on the next one. */
export function diffSinceLastRun(
  window: RunWindow,
  documents: DocumentLite[],
  facts: FactLite[],
): RunDiff {
  const counts: Record<ChangeKind, number> = {
    new_document: 0, new_imagery: 0, new_fact: 0, corrected_fact: 0,
  };
  const changes: RunChange[] = [];
  const firstRun = !window.since;

  if (!firstRun) {
    const since = Date.parse(window.since!);

    for (const d of documents) {
      if (Date.parse(d.created_at) <= since) continue;
      const kind: ChangeKind = IMAGERY_TYPES.has(d.document_type ?? '') ? 'new_imagery' : 'new_document';
      counts[kind]++;
      changes.push({
        kind,
        label: docLabel(d),
        detail: kind === 'new_imagery'
          ? `New ${(d.document_type ?? 'image').replace(/_/g, ' ')} captured for this property.`
          : `New ${(d.document_type ?? 'document').replace(/_/g, ' ')} — it was not in the previous run.`,
        at: d.created_at,
      });
    }

    for (const f of facts) {
      // A correction is the one CHANGE we can prove, because the row keeps both halves (R23).
      if (f.review_status === 'corrected' && f.reviewed_at && Date.parse(f.reviewed_at) > since) {
        counts.corrected_fact++;
        changes.push({
          kind: 'corrected_fact',
          label: `${f.data_category.replace(/_/g, ' ')}: ${f.corrected_value}`,
          detail: `Corrected by a reviewer — the extraction had read "${f.display_value || f.raw_value}".`,
          at: f.reviewed_at,
        });
        continue;
      }
      if (Date.parse(f.created_at) > since) {
        counts.new_fact++;
        changes.push({
          kind: 'new_fact',
          label: `${f.data_category.replace(/_/g, ' ')}: ${f.display_value || f.raw_value}`,
          detail: 'Extracted in this run; it was not present before.',
          at: f.created_at,
        });
      }
    }
  }

  changes.sort((a, b) => b.at.localeCompare(a.at));

  // The limits of this comparison, said out loud. A diff that silently omits changed values is worse
  // than one that admits it detects additions and corrections only.
  const caveats = firstRun ? [] : [
    'Only additions and reviewer corrections can be detected. A value that the county itself changed ' +
    'between runs — a CAD acreage revised in place, for example — is not detectable, because nothing ' +
    'snapshots those values per run.',
  ];

  const headline = firstRun
    ? 'This is the first run for this property, so there is nothing to compare it against. That is not the same as nothing having changed.'
    : changes.length === 0
      ? `Nothing new has been found since ${window.since!.slice(0, 10)}. Additions and corrections only — see the note below.`
      : `${changes.length} change(s) since ${window.since!.slice(0, 10)}: ` +
        [
          counts.new_document ? `${counts.new_document} new document(s)` : null,
          counts.new_imagery ? `${counts.new_imagery} new image(s)` : null,
          counts.new_fact ? `${counts.new_fact} new fact(s)` : null,
          counts.corrected_fact ? `${counts.corrected_fact} correction(s)` : null,
        ].filter(Boolean).join(', ') + '.';

  return { window, changes, counts, caveats, headline, firstRun };
}

/** The changes that should make somebody re-read the packet.
 *
 *  A new deed or a corrected bearing invalidates conclusions drawn without them; a new aerial photo
 *  usually does not. Saying which is the difference between a change list and a to-do. */
export function materialChanges(diff: RunDiff): RunChange[] {
  return diff.changes.filter((c) => c.kind === 'new_document' || c.kind === 'corrected_fact');
}

export function packetImpact(diff: RunDiff, packetApprovedAt: string | null): string {
  if (!packetApprovedAt) return '';
  const material = materialChanges(diff).filter((c) => c.at > packetApprovedAt);
  if (material.length === 0) return '';
  return (
    `${material.length} material change(s) have landed since the packet was approved on ` +
    `${packetApprovedAt.slice(0, 10)}. The approved packet does not reflect them — re-assemble it ` +
    'before the crew goes out.'
  );
}
