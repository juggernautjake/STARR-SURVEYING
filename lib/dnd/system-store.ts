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

/**
 * Keyword search WITHIN a single system — the fallback that makes the library searchable with
 * no embeddings key. Matches the query's words against name/body/kind (AND across words, so
 * "warlock slots" only matches entries mentioning both). Scoped by system_id like every other
 * read here, so it can never surface another system's rules.
 */
export async function keywordSearchSystemEntries(systemKey: string, query: string, limit = 24): Promise<SystemEntry[]> {
  const systemId = await systemIdForKey(systemKey);
  if (!systemId) return [];
  const words = query.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
  if (!words.length) return [];
  let q = supabaseAdmin
    .from('dnd_system_entries')
    .select('id, system_id, kind, name, body, source')
    .eq('system_id', systemId);
  // Each word must appear somewhere in the entry (name OR body OR kind).
  for (const w of words) {
    const safe = w.replace(/[%,()]/g, ' ').trim();
    if (!safe) continue;
    q = q.or(`name.ilike.%${safe}%,body.ilike.%${safe}%,kind.ilike.%${safe}%`);
  }
  const { data } = await q.limit(limit);
  const rows = (data ?? []) as SystemEntry[];
  // Rank: a name hit beats a body hit, and more matched words beats fewer.
  const score = (e: SystemEntry) => {
    const name = e.name.toLowerCase();
    const body = (e.body || '').toLowerCase();
    let s = 0;
    for (const w of words) {
      if (name.includes(w)) s += 3;
      else if (body.includes(w)) s += 1;
    }
    if (name === query.trim().toLowerCase()) s += 10;
    return s;
  };
  return rows.sort((a, b) => score(b) - score(a));
}

/**
 * Search WITHIN a single system. Semantic when embeddings are configured, otherwise (and as a
 * top-up whenever the vector pass is thin) keyword. Never falls back to another system.
 *
 * The vector-only version returned [] with no VOYAGE_API_KEY, which meant the library's search
 * box silently found nothing for text-only entries — the state every system is in until the
 * embeddings backfill runs.
 */
export async function searchSystemEntries(
  systemKey: string,
  query: string,
  opts: { matchCount?: number; minSimilarity?: number } = {},
): Promise<SystemEntry[]> {
  if (!query.trim()) return [];
  const systemId = await systemIdForKey(systemKey);
  if (!systemId) return [];

  let semantic: SystemEntry[] = [];
  if (embeddingsConfigured()) {
    const qv = await embedQuery(query);
    if (qv) {
      const { data, error } = await supabaseAdmin.rpc('match_dnd_system_entries', {
        p_system_id: systemId,
        query_embedding: qv,
        match_count: opts.matchCount ?? 8,
        min_similarity: opts.minSimilarity ?? 0.35,
      });
      if (!error) semantic = (data ?? []) as SystemEntry[];
    }
  }

  const keyword = await keywordSearchSystemEntries(systemKey, query, opts.matchCount ?? 24);
  // Merge, semantic first, de-duped by id.
  const seen = new Set(semantic.map((e) => e.id));
  return [...semantic, ...keyword.filter((e) => !seen.has(e.id))];
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
