// lib/learn/tutor-retrieval.ts — retrieve trusted passages for the grounded FS tutor.
// Embeds the student's question and pulls the most similar chunks from the admin-curated
// reference library (seeds/403). Returns null when retrieval is unavailable (no embeddings
// key, table not migrated, or nothing relevant) so the tutor degrades to an ungrounded
// answer + web fallback rather than erroring.
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

export async function retrieveSources(query: string): Promise<RetrievedSource[] | null> {
  const q = query.trim();
  if (!q) return null;
  const embedding = await embedQuery(q);
  if (!embedding) return null; // embeddings not configured → ungrounded

  try {
    const { data, error } = await supabaseAdmin.rpc('match_fs_reference_chunks', {
      query_embedding: embedding,
      match_count: MATCH_COUNT,
      min_similarity: MIN_SIMILARITY,
    });
    if (error) return null; // table/function not migrated yet
    const rows = (data ?? []) as { content: string; similarity: number; doc_title: string; doc_source: string | null }[];
    if (rows.length === 0) return [];
    return rows.slice(0, KEEP).map((r, i) => ({
      n: i + 1,
      title: r.doc_title,
      source: r.doc_source,
      content: r.content.slice(0, PER_CHUNK_CHARS),
      similarity: r.similarity,
    }));
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
