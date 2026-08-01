// __tests__/search/semantic-retrieval.test.ts — AI retrieval over business documents (§3b/8d).
//
// What is guarded here is not "does cosine similarity work" — Postgres owns that, and the retrieval
// path was verified against the live database with synthetic vectors (correct ranking, the 0.35
// floor, the corpus filter, and tenant scoping all confirmed over PostgREST).
//
// What is guarded here is the part that rots, and it is all one idea: **a system that cannot tell
// "the AI did not look" from "the AI looked and found nothing" will report the first as the second,
// forever, and nobody will ever notice.** That is not hypothetical. `fs_reference_chunks` — the
// pattern this module was modelled on — holds 352 rows and 0 embeddings, so the FS tutor's semantic
// path has never once retrieved anything, and its graceful fallback made that invisible.
//
// Plus hydration, which is the permission gate: `document_embeddings` has no foreign key to its
// sources, so chunks outlive the rows they came from.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) } }));

const embedQuery = vi.fn();
const embeddingsConfigured = vi.fn();
vi.mock('@/lib/learn/embeddings', () => ({
  embedQuery: (...a: unknown[]) => embedQuery(...a),
  embeddingsConfigured: () => embeddingsConfigured(),
}));

import {
  retrieveSemantic, hydrateSemantic, mergeSemantic, semanticCorpora, EMBEDDABLE, MIN_SIMILARITY,
  type HydratedHit,
} from '@/lib/search/semantic';
import { CORPORA, CORPUS_BY_ID, corporaFor } from '@/lib/search/corpora';

/** A `.from(table).select(cols).in('id', ids)` chain that resolves to `rows`. */
const selectReturning = (rows: unknown[] | null, error: unknown = null) => ({
  select: () => ({ in: () => Promise.resolve({ data: rows, error }) }),
});

/** The head-count chain `retrieveSemantic` uses to detect an empty index. */
const countReturning = (count: number) => ({
  select: () => ({ not: () => Promise.resolve({ count, error: null }) }),
});

beforeEach(() => {
  rpc.mockReset(); from.mockReset(); embedQuery.mockReset(); embeddingsConfigured.mockReset();
  embeddingsConfigured.mockReturnValue(true);
});

describe('every refusal to run says WHY', () => {
  it('reports not-configured rather than an empty result when there is no API key', async () => {
    // TODAY'S LIVE STATE. If this returned `{hits: []}` the UI would say "nothing matched", the owner
    // would conclude the archive is empty, and the one action that would fix it — setting the key —
    // would never occur to anyone.
    embeddingsConfigured.mockReturnValue(false);
    const r = await retrieveSemantic('easement on the north line', { corpora: ['research-documents'] });
    expect(r.skipped).toBe('not-configured');
    expect(r.hits).toEqual([]);
    expect(embedQuery).not.toHaveBeenCalled(); // and it did not spend a request to find out
  });

  it('distinguishes a provider outage from a missing key', async () => {
    // Different fixes. Telling an operator "not configured" during an outage sends them to change a
    // setting that is already correct, and they will change it wrongly.
    embedQuery.mockResolvedValue(null);
    const r = await retrieveSemantic('q', { corpora: ['research-documents'] });
    expect(r.skipped).toBe('embed-failed');
  });

  it('reports query-failed when the RPC errors, instead of swallowing it', async () => {
    // Audit §1.1b: three routes destructured `{ data }`, dropped `error`, and reported "nothing
    // found" for the lifetime of the feature.
    embedQuery.mockResolvedValue([0.1, 0.2]);
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    const r = await retrieveSemantic('q', { corpora: ['research-documents'] });
    expect(r.skipped).toBe('query-failed');
    expect(r.hits).toEqual([]);
  });

  it('reports empty-index — the state that looks exactly like a working search of an empty archive', async () => {
    // The single most misleading state available, and the one this system is in until the backfill
    // is run. Zero rows from a populated index and zero rows from an unpopulated one are the same
    // response; only this check separates them.
    embedQuery.mockResolvedValue([0.1, 0.2]);
    rpc.mockResolvedValue({ data: [], error: null });
    from.mockReturnValue(countReturning(0));
    const r = await retrieveSemantic('q', { corpora: ['research-documents'] });
    expect(r.skipped).toBe('empty-index');
  });

  it('but a populated index that genuinely matched nothing is NOT reported as a fault', async () => {
    embedQuery.mockResolvedValue([0.1, 0.2]);
    rpc.mockResolvedValue({ data: [], error: null });
    from.mockReturnValue(countReturning(4_000));
    const r = await retrieveSemantic('q', { corpora: ['research-documents'] });
    expect(r.skipped).toBeNull(); // it ran. "Nothing matched" is a real answer.
    expect(r.hits).toEqual([]);
  });

  it('never runs at all for a corpus with no embeddings', async () => {
    const r = await retrieveSemantic('q', { corpora: ['jobs'] });
    expect(r.skipped).toBe('no-corpora');
    expect(embedQuery).not.toHaveBeenCalled();
  });
});

describe('permission is applied where the primitive does not apply it', () => {
  it('semanticCorpora intersects "has embeddings" with "may see"', () => {
    // `match_document_embeddings` deliberately does not gate — it is a similarity primitive, and one
    // that half-enforces access is worse than one that clearly does not.
    const fieldCrew = corporaFor(['field_crew']).map((c) => c.id);
    expect(fieldCrew).not.toContain('research-documents'); // premise of the next assertion

    const ids = semanticCorpora(corporaFor(['field_crew']));
    expect(ids).not.toContain('research-documents');
    expect(ids).toContain('field-media');
  });

  it('drops a hit whose corpus the caller may not see, even if the RPC returned it', async () => {
    embedQuery.mockResolvedValue([0.1]);
    rpc.mockResolvedValue({
      data: [
        { source_table: 'research_documents', source_id: 'a', ordinal: 0, content: 'secret', similarity: 0.9 },
        { source_table: 'field_media', source_id: 'b', ordinal: 0, content: 'ok', similarity: 0.8 },
      ],
      error: null,
    });
    const r = await retrieveSemantic('q', { corpora: ['field-media'] });
    expect(r.hits.map((h) => h.corpus)).toEqual(['field-media']);
  });
});

describe('hydration is the gate, not a formatting step', () => {
  const hit = (id: string, sim = 0.8) => ({
    corpus: 'research-documents', sourceId: id, ordinal: 0, passage: `passage ${id}`, similarity: sim,
  });

  it('drops a chunk whose source row no longer exists', async () => {
    // Verified against the live database: document_embeddings has NO foreign key to its sources (it
    // is corpus-agnostic by design), so a hard-deleted document leaves its chunks behind and the RPC
    // returns them happily. Without this, AI search links to a dead page.
    from.mockReturnValue(selectReturning([]));
    expect(await hydrateSemantic([hit('ghost')])).toEqual([]);
  });

  it('drops a soft-deleted row, so delete cannot mean "gone from keyword, still in AI"', async () => {
    // The worst possible split, because the delete LOOKS like it worked.
    from.mockReturnValue(selectReturning([{ id: 'j1', file_name: 'plat.pdf', job_id: 'job9', is_deleted: true }]));
    const out = await hydrateSemantic([{ ...hit('j1'), corpus: 'job-files' }]);
    expect(out).toEqual([]);
  });

  it('drops a row belonging to another tenant, trusting the source row over the chunk copy', async () => {
    // `document_embeddings.org_id` is a copy made at embed time; the source row is the authority
    // (§1.2). A row that changes hands must not leak through a stale copy.
    from.mockReturnValue(selectReturning([
      { id: 'd1', document_label: 'Deed', research_project_id: 'p1', org_id: 'ORG-B' },
    ]));
    expect(await hydrateSemantic([hit('d1')], { orgId: 'ORG-A' })).toEqual([]);
    // …and keeps it for the org that owns it.
    from.mockReturnValue(selectReturning([
      { id: 'd1', document_label: 'Deed', research_project_id: 'p1', org_id: 'ORG-A' },
    ]));
    expect((await hydrateSemantic([hit('d1')], { orgId: 'ORG-A' })).length).toBe(1);
  });

  it('builds a real link from contextColumn, not from the row id', async () => {
    // A research document has no page of its own — it is read on its project's page. Linking to
    // /admin/research/<document id> would 404, which reads as data loss rather than a bad link.
    from.mockReturnValue(selectReturning([
      { id: 'doc1', document_label: 'DEED — WHITTENBURG', research_project_id: 'proj7', created_at: '2026-01-02T00:00:00Z' },
    ]));
    const [h] = await hydrateSemantic([hit('doc1')]);
    expect(h.href).toBe('/admin/research/proj7');
    expect(h.title).toBe('DEED — WHITTENBURG');
    // The passage IS the snippet: the sentence that answers the question beats the head of the file.
    expect(h.snippet).toBe('passage doc1');
  });

  it('collapses many matching passages of one document into one result', async () => {
    // A 40-page deed can match on three passages. It is still one document, and three copies of it
    // would push everything else off the page.
    from.mockReturnValue(selectReturning([{ id: 'doc1', document_label: 'Deed', research_project_id: 'p' }]));
    const out = await hydrateSemantic([hit('doc1', 0.5), hit('doc1', 0.91), hit('doc1', 0.7)]);
    expect(out).toHaveLength(1);
    expect(out[0].similarity).toBe(0.91); // and it keeps the BEST passage, not the first
    expect(out[0].passage).toBe('passage doc1');
  });

  it('degrades to no extras rather than throwing when hydration itself fails', async () => {
    // Keyword results are already on screen. Losing them to an enrichment step would be worse than
    // losing the enrichment.
    from.mockReturnValue(selectReturning(null, { message: 'boom' }));
    expect(await hydrateSemantic([hit('d1')])).toEqual([]);
  });
});

describe('merging never lets meaning outrank what somebody typed', () => {
  const kw = (id: string, corpus = 'jobs') => ({ corpus, id, title: `kw ${id}`, score: 9 });
  const sem = (id: string, corpus = 'research-documents', similarity = 0.9): HydratedHit => ({
    corpus, corpusLabel: 'Research documents', kind: 'document', id, title: `sem ${id}`,
    snippet: 'p', type: null, createdAt: null, effectiveAt: null, score: similarity,
    href: null, passage: `p ${id}`, similarity,
  });

  it('preserves keyword order exactly', () => {
    // Somebody typing a job number wants that job first, and no amount of semantic similarity should
    // move it. This is a merge, not a re-rank.
    const out = mergeSemantic([kw('a'), kw('b'), kw('c')], [sem('z')]);
    expect(out.slice(0, 3).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(out[3].id).toBe('z');
  });

  it('appends a document keyword search could not have found, flagged as such', () => {
    const out = mergeSemantic([kw('a')], [sem('z')]);
    const extra = out.find((r) => r.id === 'z')!;
    expect(extra.semanticOnly).toBe(true); // the UI badges it: a surprising result needs a reason
  });

  it('annotates rather than duplicates a document both halves found', () => {
    const out = mergeSemantic([kw('d1', 'research-documents')], [sem('d1')]);
    expect(out).toHaveLength(1);
    expect(out[0].alsoFound).toBe(true);
    expect(out[0].passage).toBe('p d1'); // and shows WHY it is relevant
    expect(out[0].semanticOnly).toBeUndefined();
  });

  it('matches on corpus AND id, so two tables sharing an id are not conflated', () => {
    const out = mergeSemantic([kw('same', 'jobs')], [sem('same', 'research-documents')]);
    expect(out).toHaveLength(2);
  });

  it('returns keyword results untouched when semantic contributed nothing', () => {
    const kws = [kw('a'), kw('b')];
    expect(mergeSemantic(kws, [])).toBe(kws);
  });
});

describe('the registry cannot drift from what is embeddable', () => {
  it('every EMBEDDABLE corpus is a real corpus with a real text column', () => {
    for (const [id, meta] of Object.entries(EMBEDDABLE)) {
      const c = CORPUS_BY_ID.get(id);
      expect(c, `EMBEDDABLE names "${id}", which is not a corpus`).toBeDefined();
      expect(c!.table).toBe(meta.table);
      // The embedded column must be one search already reads, or the AI index and the keyword index
      // would be built from different text and disagree about what a document says.
      expect(c!.bodyColumns, `${id}.${meta.textColumn} is not a searched column`).toContain(meta.textColumn);
    }
  });

  it('every corpus whose href needs a parent declares contextColumn', () => {
    // The SQL (seed 515) selects this per branch; semantic retrieval does not go through the SQL and
    // has to build the same link from the registry. Two sources of truth for one fact is how §1.3
    // produced two navigation lists 32 routes apart.
    for (const c of CORPORA) {
      const built = c.href({ id: 'ID' });
      if (built === null) continue;
      // A href that still contains "undefined" means it read a column the registry does not carry.
      if (built.includes('undefined')) {
        expect(c.contextColumn, `${c.id} builds "${built}" but declares no contextColumn`).toBeTruthy();
      }
    }
  });

  it('the declared contextColumn is the one seed 515 actually selects', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const sql = readFileSync(join(process.cwd(), 'seeds', '515_search_function.sql'), 'utf8');
    for (const c of CORPORA) {
      if (!c.contextColumn) continue;
      expect(sql, `seed 515 never selects ${c.contextColumn} for ${c.id}`)
        .toContain(`${c.contextColumn}::text`);
    }
  });

  it('the similarity floor matches the one the FS tutor uses', () => {
    // Kept identical on purpose, so the two do not drift into different notions of "close enough".
    expect(MIN_SIMILARITY).toBe(0.35);
  });
});
