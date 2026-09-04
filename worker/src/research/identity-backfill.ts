// ── D4: give the rows that predate `identity_key` the key the pipeline now assigns ───────────────
//
// 734 of 768 live documents were filed before `file-document.ts` wrote an identity key. The project
// library reconstructs a key for them AT READ TIME (refFromRow), so in-run dedupe already works —
// but the key is never written back, so the app cannot group by it and the existing duplicate
// copies stay visible. This plans that write-back using the SAME two functions the live pipeline
// uses (refFromRow → identityKey), so a backfilled key is identical to the key a fresh run assigns.
//
// The partial unique index `(research_project_id, identity_key) WHERE identity_key IS NOT NULL AND
// duplicate_of IS NULL` makes backfill and duplicate-reconciliation ONE operation: within a project
// at most one non-duplicate row may hold a given key, so when a key lands on more than one row the
// extras must be marked `duplicate_of` the canonical in the same plan, exactly as a new run would.

import { identityKey } from './document-identity.js';
import { refFromRow } from './project-library.js';

/** The columns the plan reads. A loose row so the caller can pass a raw DB record. */
export interface BackfillRow {
  id: string;
  research_project_id: string;
  identity_key: string | null;
  duplicate_of: string | null;
  recording_info?: string | null;
  document_label?: string | null;
  original_filename?: string | null;
  harvest_metadata?: Record<string, unknown> | null;
  recorded_date?: string | null;
  /** ISO string; the earliest-created row in a key group is the canonical one when none is set. */
  created_at?: string | null;
}

export interface BackfillUpdate {
  id: string;
  identity_key: string;
  /** Present only for the non-canonical copies. */
  duplicate_of?: string;
  duplicate_reason?: string;
}

export interface BackfillPlan {
  updates: BackfillUpdate[];
  /** Rows whose key could not be reconstructed (no instrument in text or metadata). Left as-is. */
  unkeyable: number;
  /** Rows already carrying the correct key and duplicate state. Left as-is. */
  alreadyCorrect: number;
  /** Distinct (project, key) groups that had more than one row. */
  duplicateGroups: number;
}

/** Compute the identity key for a row, preferring one already stored. `null` when unkeyable. */
function keyForRow(row: BackfillRow, county: string): string | null {
  if (row.identity_key) return row.identity_key;
  return identityKey(refFromRow(row as unknown as Record<string, unknown>, county));
}

/**
 * Plan the identity-key backfill for a set of rows. Pure: no I/O, so the rule is unit-tested.
 *
 * @param rows every research_documents row under consideration (any project).
 * @param countyByProject the county each project is in — refFromRow needs it to build the key.
 */
export function planIdentityBackfill(
  rows: BackfillRow[],
  countyByProject: Map<string, string>,
): BackfillPlan {
  const plan: BackfillPlan = { updates: [], unkeyable: 0, alreadyCorrect: 0, duplicateGroups: 0 };

  // Group by (project, computed key). A row we cannot key at all is counted and dropped.
  const groups = new Map<string, { key: string; projectId: string; rows: BackfillRow[] }>();
  for (const row of rows) {
    const county = countyByProject.get(row.research_project_id) ?? '';
    const key = keyForRow(row, county);
    if (!key) { plan.unkeyable++; continue; }
    const gid = `${row.research_project_id}|${key}`;
    let g = groups.get(gid);
    if (!g) { g = { key, projectId: row.research_project_id, rows: [] }; groups.set(gid, g); }
    g.rows.push(row);
  }

  const createdAt = (r: BackfillRow) => (r.created_at ? Date.parse(r.created_at) : Number.POSITIVE_INFINITY);

  for (const g of groups.values()) {
    if (g.rows.length > 1) plan.duplicateGroups++;

    // ── Only a row that is not ALREADY a duplicate can hold the canonical slot ──────────────────
    //
    // A row the pipeline already marked `duplicate_of` (storage-path dedupe files this) is a
    // duplicate of some document and stays one — it only needs its key filled in, never a
    // re-canonicalisation and never a repointed lineage. Choosing such a row as canonical and then
    // not clearing its duplicate_of is what left the plan re-writing the same rows forever: the key
    // group had no non-duplicate member, so every pass "canonicalised" a row that stayed a
    // duplicate. Canonical is therefore chosen ONLY among rows with no duplicate_of.
    const eligible = g.rows.filter((r) => !r.duplicate_of);
    const existingCanonical = eligible.find((r) => r.identity_key === g.key);
    const canonical = existingCanonical
      ?? (eligible.length > 0
        ? [...eligible].sort((a, b) => createdAt(a) - createdAt(b) || a.id.localeCompare(b.id))[0]
        : null); // every row here is already a duplicate of some other document — no canonical to set

    for (const row of g.rows) {
      const keyOk = row.identity_key === g.key;
      if (row.duplicate_of) {
        // Already a duplicate: fill the key if missing, touch nothing else. This is the idempotent
        // branch that the old code lacked.
        if (keyOk) plan.alreadyCorrect++;
        else plan.updates.push({ id: row.id, identity_key: g.key });
        continue;
      }
      // No duplicate_of, so this row is in `eligible` and `canonical` is non-null.
      if (canonical && row.id === canonical.id) {
        if (keyOk) { plan.alreadyCorrect++; continue; }
        plan.updates.push({ id: row.id, identity_key: g.key });
      } else {
        // A second non-duplicate row with this key must yield to the canonical (the partial unique
        // index forbids two non-duplicate rows sharing a key in one project).
        plan.updates.push({
          id: row.id,
          identity_key: g.key,
          duplicate_of: canonical!.id,
          duplicate_reason: `backfill: same identity ${g.key} as canonical copy`,
        });
      }
    }
  }

  return plan;
}
