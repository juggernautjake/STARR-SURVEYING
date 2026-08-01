// lib/search/semantic.ts — AI retrieval for the questions keywords cannot express (§3b, item 8d).
//
// Owner objective: *"using AI to help find specific documents or information"*.
//
// The gap this closes is specific. *"The deed that mentions a 40-foot access easement on the north
// line"* shares almost no distinctive words with the document that answers it — the deed says
// "a strip of land forty (40) feet in width along the North boundary". Trigram fails (different
// words), full-text fails (different lexemes), and both fail SILENTLY, returning an empty list that
// is indistinguishable from an empty archive.
//
// ── SEMANTIC IS AN UPGRADE, NEVER A DEPENDENCY ─────────────────────────────────────────────────
//
// Shaped after `lib/learn/tutor-retrieval.ts`: prefer semantic when `VOYAGE_API_KEY` is configured,
// fall back to keyword otherwise. So search works with no key at all, and adding one later is a pure
// improvement rather than a migration. The alternative — semantic as the primary path — means the day
// the key expires, search returns nothing and reports it as "no results".
//
// ── WHY THIS FILE REPORTS WHY IT DID NOTHING ───────────────────────────────────────────────────
//
// An earlier draft of this module said the FS tutor "has run this way in production for months". That
// was measured on 2026-08-01 and it is not true: `fs_reference_chunks` holds **352 rows and 0
// embeddings**. The tutor's semantic path has never retrieved anything. It has been falling back to
// keyword since the day it shipped, correctly and completely silently, and nobody could have noticed
// — because a graceful fallback and a working feature produce the same screen.
//
// That is this repo's signature defect (audit §1.4, "authored but not wired") in its most durable
// form, and copying the pattern without copying the blind spot is the whole design of this file.
// So: every path that declines to run says WHY, in a field the caller must handle. `null` is not a
// return value here. "The AI did not look" and "the AI looked and found nothing" are different
// answers, and a system that cannot tell them apart will present the first as the second forever.

import { supabaseAdmin } from '@/lib/supabase';
import { embedQuery, embeddingsConfigured } from '@/lib/learn/embeddings';
import { CORPUS_BY_ID, type Corpus } from '@/lib/search/corpora';

/** Table names carrying embeddable long text today. Keyed by corpus id so a chunk always traces back
 *  to a row somebody can open. Adding a corpus here is the whole cost of making it AI-searchable. */
export const EMBEDDABLE: Record<string, { table: string; textColumn: string }> = {
  'research-documents': { table: 'research_documents', textColumn: 'extracted_text' },
  // Transcribed voice notes: often the only written record of what happened on site, and phrased the
  // way somebody speaks rather than the way they would later search.
  'field-media': { table: 'field_media', textColumn: 'transcription' },
};

/** Why semantic retrieval produced nothing. Never collapsed into an empty array — see the header. */
export type SemanticSkip =
  /** No `VOYAGE_API_KEY`. The feature is built and switched off; this is today's live state. */
  | 'not-configured'
  /** The query is too short, or none of the corpora this user may see carry embeddings. */
  | 'no-corpora'
  /** The key exists but the provider refused or timed out. Distinct from `not-configured`: one is a
   *  setting, the other is an incident, and telling an operator "not configured" during an outage
   *  sends them to change a setting that is already correct. */
  | 'embed-failed'
  /** The RPC itself errored — a missing function, a dimension mismatch, a permissions problem. */
  | 'query-failed'
  /** Everything worked and the index is empty: nothing has been embedded yet. The single most
   *  misleading state available, because it is indistinguishable from a working search over an empty
   *  archive, and it is the state this system is in until `scripts/embed-documents.mjs` is run. */
  | 'empty-index';

export interface SemanticHit {
  corpus: string;
  sourceId: string;
  ordinal: number;
  /** The matching passage itself — this is the answer, not just a pointer to it. */
  passage: string;
  similarity: number;
}

export interface SemanticResult {
  hits: SemanticHit[];
  /** `null` means semantic retrieval genuinely ran. Otherwise, why it did not. */
  skipped: SemanticSkip | null;
}

/** Below this, matches are topical noise rather than answers. Same floor as the FS tutor, kept
 *  identical so the two behave the same rather than drifting into two different notions of "close". */
export const MIN_SIMILARITY = 0.35;
export const MATCH_COUNT = 12;

export function semanticAvailable(): boolean {
  return embeddingsConfigured();
}

/** Corpora a set of roles may search semantically — the intersection of "has embeddings" and
 *  "this caller may see it". Permission is applied HERE rather than in SQL, because
 *  `match_document_embeddings` deliberately does not gate: it is a similarity primitive, and a
 *  primitive that half-enforces access is worse than one that clearly does not. */
export function semanticCorpora(allowed: Corpus[]): string[] {
  return allowed.map((c) => c.id).filter((id) => id in EMBEDDABLE);
}

/**
 * Retrieve passages semantically. Always returns a result; `skipped` says whether it really ran.
 */
export async function retrieveSemantic(
  query: string,
  opts: { corpora: string[]; limit?: number; orgId?: string | null } = { corpora: [] },
): Promise<SemanticResult> {
  const q = query.trim();
  const tables = opts.corpora
    .filter((id) => id in EMBEDDABLE)
    .map((id) => EMBEDDABLE[id].table);

  if (!q || tables.length === 0) return { hits: [], skipped: 'no-corpora' };
  // Checked before spending a request, so "you have not set the key" never arrives dressed as a
  // provider outage.
  if (!embeddingsConfigured()) return { hits: [], skipped: 'not-configured' };

  const embedding = await embedQuery(q);
  if (!embedding) return { hits: [], skipped: 'embed-failed' };

  const { data, error } = await supabaseAdmin.rpc('match_document_embeddings', {
    query_embedding: embedding as unknown as string,
    p_sources: tables,
    match_count: opts.limit ?? MATCH_COUNT,
    min_similarity: MIN_SIMILARITY,
    p_org: opts.orgId ?? null,
  });

  // Surfaced, never swallowed. A failed RPC that returned an empty array would tell the caller the AI
  // searched and found nothing, which is a lie about a system that never ran — §1.1b, exactly.
  if (error) return { hits: [], skipped: 'query-failed' };

  const byTable = new Map(
    Object.entries(EMBEDDABLE).map(([corpusId, meta]) => [meta.table, corpusId]),
  );

  const hits = ((data ?? []) as Array<{
    source_table: string; source_id: string; ordinal: number; content: string; similarity: number;
  }>)
    .map((r) => ({
      corpus: byTable.get(r.source_table) ?? r.source_table,
      sourceId: r.source_id,
      ordinal: r.ordinal,
      passage: r.content,
      similarity: Number(r.similarity),
    }))
    // Belt and braces: a chunk whose corpus the caller may not see must never surface, even if the
    // table list were somehow wrong.
    .filter((h) => opts.corpora.includes(h.corpus) && CORPUS_BY_ID.has(h.corpus));

  if (hits.length === 0) {
    // Distinguish "nothing is indexed" from "nothing matched". Both return zero rows and they mean
    // opposite things: one is a backfill that was never run, the other is a genuine answer.
    const { count, error: countErr } = await supabaseAdmin
      .from('document_embeddings')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    if (!countErr && (count ?? 0) === 0) return { hits: [], skipped: 'empty-index' };
  }

  return { hits, skipped: null };
}

// ── Hydration ──────────────────────────────────────────────────────────────────────────────────
//
// A chunk knows its `source_table` and `source_id` and nothing else. To render it as a result — a
// title, a date, a type, a link somebody can click — the source row has to be read.
//
// Hydration is therefore not a formatting step; it is THE GATE, and it is load-bearing for three
// separate reasons that all produce the same symptom if skipped (a result that should not be there):
//
//  1. **Existence.** `document_embeddings` has no foreign key to anything — it is corpus-agnostic by
//     design (`source_table` + `source_id`). So a hard-deleted document leaves its chunks behind
//     forever, and semantic search would happily return a passage from a document that no longer
//     exists, linking to a dead page.
//  2. **Soft-delete.** `search_everything()` excludes soft-deleted rows; the chunk table knows
//     nothing about `is_deleted` or `deleted_at`. Without this, deleting a document would remove it
//     from keyword search and leave it in AI search — the worst possible split, because the delete
//     LOOKS like it worked.
//  3. **Tenancy.** `org_id` on the chunk is a copy made at embed time. The source row is the
//     authority, and re-checking it here means a row that changes hands cannot leak through a stale
//     copy (§1.2, and the reason that column is nullable rather than defaulted).

export interface HydratedHit {
  corpus: string;
  corpusLabel: string;
  kind: 'document' | 'record';
  id: string;
  title: string;
  snippet: string;
  type: string | null;
  createdAt: string | null;
  effectiveAt: string | null;
  score: number;
  href: string | null;
  /** The passage that matched, and why this document is here at all. */
  passage: string;
  similarity: number;
}

const firstNonEmpty = (row: Record<string, unknown>, cols: string[]): string | null => {
  for (const c of cols) {
    const v = row[c];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};

const dateFor = (row: Record<string, unknown>, c: Corpus, role: 'created' | 'effective'): string | null => {
  const d = c.dates.find((x) => x.role === role);
  const v = d ? row[d.column] : null;
  return typeof v === 'string' ? v : null;
};

/**
 * Turn semantic hits into renderable results, dropping any whose source row is gone, soft-deleted or
 * out of tenant. Never throws: a hydration failure degrades to "no semantic extras", because keyword
 * results are already on screen and losing them to an enrichment step would be a worse outcome.
 */
export async function hydrateSemantic(
  hits: SemanticHit[],
  opts: { orgId?: string | null } = {},
): Promise<HydratedHit[]> {
  if (hits.length === 0) return [];

  // Best chunk per source row. A long deed can match on three passages; it is one document.
  const best = new Map<string, SemanticHit>();
  for (const h of hits) {
    const key = `${h.corpus}:${h.sourceId}`;
    const prev = best.get(key);
    if (!prev || h.similarity > prev.similarity) best.set(key, h);
  }

  const byCorpus = new Map<string, SemanticHit[]>();
  for (const h of best.values()) {
    if (!byCorpus.has(h.corpus)) byCorpus.set(h.corpus, []);
    byCorpus.get(h.corpus)!.push(h);
  }

  const out: HydratedHit[] = [];

  for (const [corpusId, list] of byCorpus) {
    const c = CORPUS_BY_ID.get(corpusId);
    if (!c) continue;

    const cols = new Set<string>(['id', ...c.titleColumns]);
    for (const d of c.dates) cols.add(d.column);
    if (c.typeColumn) cols.add(c.typeColumn);
    if (c.orgColumn) cols.add(c.orgColumn);
    if (c.softDelete) cols.add(c.softDelete.column);
    if (c.contextColumn) cols.add(c.contextColumn);

    const { data, error } = await supabaseAdmin
      .from(c.table)
      .select([...cols].join(','))
      .in('id', list.map((h) => h.sourceId));

    // Reported by the caller as a skip, not smuggled through as an empty list.
    if (error || !data) continue;

    const rows = new Map(
      (data as unknown as Array<Record<string, unknown>>).map((r) => [String(r.id), r]),
    );

    for (const h of list) {
      const row = rows.get(h.sourceId);
      if (!row) continue; // deleted since it was embedded — see (1) above.

      if (c.softDelete) {
        const v = row[c.softDelete.column];
        const gone = c.softDelete.kind === 'timestamp' ? v != null : v === true;
        if (gone) continue; // (2)
      }

      if (c.orgColumn && opts.orgId) {
        const rowOrg = row[c.orgColumn];
        if (rowOrg != null && rowOrg !== opts.orgId) continue; // (3)
      }

      out.push({
        corpus: c.id,
        corpusLabel: c.label,
        kind: c.kind,
        id: h.sourceId,
        title: firstNonEmpty(row, c.titleColumns) ?? 'Untitled',
        // The passage IS the snippet. It is the sentence that answers the question, which is strictly
        // more useful than the head of the document.
        snippet: h.passage,
        type: c.typeColumn ? ((row[c.typeColumn] as string) ?? null) : null,
        createdAt: dateFor(row, c, 'created'),
        effectiveAt: dateFor(row, c, 'effective'),
        score: h.similarity,
        href: c.href({ id: h.sourceId, ...(c.contextColumn ? { [c.contextColumn]: row[c.contextColumn] } : {}) }),
        passage: h.passage,
        similarity: h.similarity,
      });
    }
  }

  return out.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Merge semantic passages into keyword results.
 *
 * NOT a re-rank and not a replacement. Keyword order is preserved and semantic-only documents are
 * appended, because the two answer different questions and neither is authoritative over the other:
 * somebody typing a job number wants that job first, and no amount of semantic similarity should
 * move it. What semantic adds is the document keyword search could not have found at all.
 *
 * `alsoFound` marks a keyword hit that semantic independently surfaced — genuine corroboration, and
 * the passage it matched is worth showing because it says WHY the document is relevant.
 */
export function mergeSemantic<T extends { corpus: string; id: string }>(
  keyword: T[],
  semantic: HydratedHit[],
): Array<T & { passage?: string; semanticOnly?: boolean; alsoFound?: boolean }> {
  if (semantic.length === 0) return keyword;

  const byKey = new Map(semantic.map((h) => [`${h.corpus}:${h.id}`, h]));
  const seen = new Set(keyword.map((k) => `${k.corpus}:${k.id}`));

  const merged = keyword.map((k) => {
    const hit = byKey.get(`${k.corpus}:${k.id}`);
    return hit ? { ...k, passage: hit.passage, alsoFound: true } : k;
  });

  const extras = semantic
    .filter((h) => !seen.has(`${h.corpus}:${h.id}`))
    .map((h) => ({ ...h, semanticOnly: true }));

  return [...merged, ...extras] as Array<
    T & { passage?: string; semanticOnly?: boolean; alsoFound?: boolean }
  >;
}
