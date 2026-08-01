// app/admin/search/types.ts — the shape /api/admin/search returns.
//
// Shared by the page and the result row rather than duplicated: two copies of a response type is how
// a field gets added on the server and silently never rendered.

export interface Hit {
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
  /** The passage AI retrieval matched on — present only when semantic search contributed (§8d). */
  passage?: string;
  /** Found ONLY by meaning, not by any word in the query. */
  semanticOnly?: boolean;
  /** Found by keyword AND independently by meaning — corroboration worth showing. */
  alsoFound?: boolean;
}

export interface CorpusOption { id: string; label: string; kind: string }

/** Whether the AI half ran, and if not, why. Rendered rather than ignored: a silent fallback to
 *  keyword is indistinguishable from a working AI search (§8d). */
export interface SemanticStatus {
  ran: boolean;
  skipped: string | null;
  found: number;
  message: string | null;
}

export interface SearchResponse {
  query: string;
  results?: Hit[];
  total?: number;
  truncated?: boolean;
  notes?: string[];
  corpora?: CorpusOption[];
  semantic?: SemanticStatus;
  error?: string;
}
