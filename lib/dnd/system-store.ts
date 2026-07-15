// lib/dnd/system-store.ts — the game-systems rules/feats/abilities store (Phase V, Slice 2).
// Ingest curated entries for ONE system and retrieve them scoped to that system only, so an AI
// build can never pull another system's rules (the anti-contamination guarantee). Reuses the
// learn RAG embedding lib; degrades gracefully (returns [] / skips embedding) when no key is set.
import { supabaseAdmin } from '@/lib/supabase';
import { embedDocuments, embedQuery, embeddingsConfigured } from '@/lib/learn/embeddings';

export type SystemEntryKind =
  | 'rule' | 'feat' | 'ability' | 'spell' | 'class' | 'species' | 'item' | 'condition' | 'other';

export interface SystemEntryInput {
  kind?: SystemEntryKind;
  name: string;
  body?: string;
  source?: string;
  data?: unknown;
}

export interface SystemEntry {
  id: string;
  system_id: string;
  kind: string;
  name: string;
  body: string;
  source: string | null;
  similarity?: number;
}

/** The text an entry is embedded/retrieved on: its name plus body (name weighted by repetition). */
export function entryEmbedText(e: { name: string; body?: string }): string {
  const name = (e.name || '').trim();
  const body = (e.body || '').trim();
  return `${name}\n${name}\n${body}`.trim();
}

/** Resolve a system row id from its stable key (e.g. 'dnd5e-2014'), or null. */
export async function systemIdForKey(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('dnd_systems').select('id').eq('key', key).maybeSingle();
  return (data?.id as string) ?? null;
}

/** Add curated entries to a system. Embeds each (when configured) so semantic search works. */
export async function addSystemEntries(systemKey: string, entries: SystemEntryInput[]): Promise<{ added: number; embedded: boolean }> {
  const clean = (entries || []).filter((e) => e && String(e.name || '').trim());
  if (!clean.length) return { added: 0, embedded: false };
  const systemId = await systemIdForKey(systemKey);
  if (!systemId) throw new Error(`Unknown system: ${systemKey}`);

  let embeddings: (number[] | null)[] = clean.map(() => null);
  const canEmbed = embeddingsConfigured();
  if (canEmbed) {
    try {
      embeddings = await embedDocuments(clean.map((e) => entryEmbedText(e)));
    } catch {
      embeddings = clean.map(() => null); // store the text now; a backfill can embed later
    }
  }

  const rows = clean.map((e, i) => ({
    system_id: systemId,
    kind: e.kind ?? 'rule',
    name: e.name.trim(),
    body: (e.body ?? '').trim(),
    source: e.source ?? null,
    data: e.data ?? null,
    embedding: embeddings[i] ?? null,
    token_estimate: Math.ceil(entryEmbedText(e).length / 4),
  }));
  const { error } = await supabaseAdmin.from('dnd_system_entries').insert(rows);
  if (error) throw new Error(error.message);
  return { added: rows.length, embedded: canEmbed && embeddings.some(Boolean) };
}

/** Semantic search WITHIN a single system (scoped by system_id in the SQL function). Returns []
 *  when embeddings aren't configured or the system is unknown — never falls back to another system. */
export async function searchSystemEntries(
  systemKey: string,
  query: string,
  opts: { matchCount?: number; minSimilarity?: number } = {},
): Promise<SystemEntry[]> {
  if (!query.trim() || !embeddingsConfigured()) return [];
  const systemId = await systemIdForKey(systemKey);
  if (!systemId) return [];
  const qv = await embedQuery(query);
  if (!qv) return [];
  const { data, error } = await supabaseAdmin.rpc('match_dnd_system_entries', {
    p_system_id: systemId,
    query_embedding: qv,
    match_count: opts.matchCount ?? 8,
    min_similarity: opts.minSimilarity ?? 0.35,
  });
  if (error) return [];
  return (data ?? []) as SystemEntry[];
}

/** Plain (non-semantic) listing for the browse UI — always scoped to one system. */
export async function listSystemEntries(systemKey: string, kind?: string, limit = 200): Promise<SystemEntry[]> {
  const systemId = await systemIdForKey(systemKey);
  if (!systemId) return [];
  let q = supabaseAdmin
    .from('dnd_system_entries')
    .select('id, system_id, kind, name, body, source')
    .eq('system_id', systemId)
    .order('kind', { ascending: true })
    .order('name', { ascending: true })
    .limit(limit);
  if (kind) q = q.eq('kind', kind);
  const { data } = await q;
  return (data ?? []) as SystemEntry[];
}
