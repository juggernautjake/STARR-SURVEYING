// lib/learn/embeddings.ts — text embeddings for the grounded FS tutor (RAG).
//
// Uses Voyage AI (Anthropic's recommended embeddings provider). One model powers both
// halves of retrieval: documents are embedded at ingest time, the student's question is
// embedded at query time (input_type differs so the vectors land in the same space).
// Degrades gracefully: with no VOYAGE_API_KEY the tutor simply runs ungrounded.
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const MODEL = process.env.VOYAGE_EMBED_MODEL || 'voyage-3.5';
// Must match the vector(1024) column in seeds/403_fs_tutor_rag.sql.
export const EMBED_DIM = 1024;
const BATCH = 96; // Voyage accepts up to 128 inputs/request; stay comfortably under.

export function embeddingsConfigured(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

async function embedBatch(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not configured.');
  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType, output_dimension: EMBED_DIM }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Voyage embeddings failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
  const rows = (json.data ?? []).slice().sort((a, b) => a.index - b.index);
  return rows.map((r) => r.embedding);
}

/** Embed many document passages (batched). Returns one vector per input, in order. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH), 'document')));
  }
  return out;
}

/** Embed a single search query. Returns null if embeddings aren't configured, so callers
 *  can fall back to an ungrounded answer instead of erroring. */
export async function embedQuery(text: string): Promise<number[] | null> {
  if (!embeddingsConfigured()) return null;
  try {
    const [vec] = await embedBatch([text.slice(0, 8000)], 'query');
    return vec ?? null;
  } catch {
    return null;
  }
}
