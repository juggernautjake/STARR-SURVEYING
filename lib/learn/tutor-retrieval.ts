// lib/learn/tutor-retrieval.ts — retrieve trusted passages for the grounded FS tutor.
// Pulls the most relevant chunks from the admin-curated reference library. Two backends:
//   • SEMANTIC (seeds/403): embed the question with Voyage and match by cosine similarity.
//   • FULL-TEXT (seeds/404): Postgres keyword search — needs no external key.
// Prefers semantic when a VOYAGE_API_KEY is configured and falls back to full-text otherwise,
// so the tutor is grounded from day one and adding a Voyage key later is a pure upgrade.
// Returns null only when BOTH backends are unavailable (e.g. tables not migrated) so the
// tutor degrades to an ungrounded answer + web fallback rather than erroring; returns [] when
// the library simply has no matching passage.
import { supabaseAdmin } from '@/lib/supabase';
import { embedQuery } from '@/lib/learn/embeddings';

export interface RetrievedSource {
  n: number;               // 1-based citation index the tutor uses as [S1], [S2]…
  title: string;
  source: string | null;
  content: string;
  similarity: number;
}

const MATCH_COUNT = 8;
const KEEP = 6;              // top passages to actually put in the prompt
const PER_CHUNK_CHARS = 1500;
const MIN_SIMILARITY = 0.4;

interface ChunkRow { content: string; similarity: number; doc_title: string; doc_source: string | null }

function toSources(rows: ChunkRow[]): RetrievedSource[] {
  return rows.slice(0, KEEP).map((r, i) => ({
    n: i + 1,
    title: r.doc_title,
    source: r.doc_source,
    content: r.content.slice(0, PER_CHUNK_CHARS),
    similarity: r.similarity,
  }));
}

export async function retrieveSources(query: string): Promise<RetrievedSource[] | null> {
  const q = query.trim();
  if (!q) return null;

  // SEMANTIC first, when embeddings are configured. embedQuery returns null with no key.
  const embedding = await embedQuery(q);
  if (embedding) {
    try {
      const { data, error } = await supabaseAdmin.rpc('match_fs_reference_chunks', {
        query_embedding: embedding,
        match_count: MATCH_COUNT,
        min_similarity: MIN_SIMILARITY,
      });
      if (!error) {
        const rows = (data ?? []) as ChunkRow[];
        if (rows.length > 0) return toSources(rows);
        // No semantic hit → fall through to full-text (catches exact-term questions).
      }
    } catch {
      /* fall through to full-text */
    }
  }

  // FULL-TEXT fallback — no external key required (seeds/404).
  try {
    const { data, error } = await supabaseAdmin.rpc('search_fs_reference_chunks_fts', {
      query_text: q,
      match_count: MATCH_COUNT,
    });
    if (error) return null; // neither backend migrated yet → ungrounded
    const rows = (data ?? []) as ChunkRow[];
    return toSources(rows); // [] when the library has no matching passage
  } catch {
    return null;
  }
}

/** Render retrieved sources as a prompt block the tutor must answer from. */
export function formatSourcesBlock(sources: RetrievedSource[]): string {
  return sources
    .map((s) => `[S${s.n}] ${s.title}${s.source ? ` — ${s.source}` : ''}\n"""\n${s.content}\n"""`)
    .join('\n\n');
}
