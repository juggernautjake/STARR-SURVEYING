// app/api/admin/search/route.ts
//
// One search across every document and business record (platform audit §3b).
//
//   GET /api/admin/search?q=waggoner&corpora=jobs,research-documents&types=deed
//                        &date_role=effective&from=1974-01-01&to=1980-12-31&limit=50
//
// The ranking, the fuzzy matching and the date logic all live in `search_everything()` (seed 515),
// because the threshold that makes typo tolerance work can only be applied inside a function — see
// that seed's header. This route's job is narrower and entirely about not lying:
//
//   · establish WHO is asking, and pass their roles down as data rather than assuming them;
//   · turn untrusted query-string input into validated filters, reporting what it ignored;
//   · surface a failure as a failure.
//
// That last one is the one with history. Audit §1.1b found three research routes that destructured
// `{ data }`, dropped `error`, and so reported "nothing found" for years while querying tables that
// did not exist. A search box is the worst place to repeat it: an empty result is indistinguishable
// from an empty archive, so nobody ever reports it as broken.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { orgIdForSession } from '@/lib/saas/org-scope-context';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { CORPUS_BY_ID, corporaFor } from '@/lib/search/corpora';
import { parseQuery, normaliseFilters, MIN_QUERY_LENGTH, type SearchFilters } from '@/lib/search/query';
import {
  retrieveSemantic, hydrateSemantic, mergeSemantic, semanticCorpora, type SemanticSkip,
} from '@/lib/search/semantic';

/** A row as `search_everything()` returns it. */
interface SearchRow {
  corpus: string;
  row_id: string;
  title: string | null;
  snippet: string | null;
  doc_type: string | null;
  created_at: string | null;
  effective_at: string | null;
  score: number;
  context_id: string | null;
}

const csv = (v: string | null): string[] | undefined => {
  if (!v) return undefined;
  const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Roles come from the session and are passed to the function as data. They are never inferred
  // inside the SQL, and there is no "no roles means everything" fallback — see the seed 515 header.
  const roles = session.user.roles ?? [];

  // The tenant, passed explicitly (audit item 8g). `search_everything` is an RPC, so the scoped
  // client cannot filter it the way it filters a table read — the function takes `p_org` and applies
  // the bound itself. Search is the one surface that reads TEN corpora in a single query, so a
  // missing tenant bound here leaks further in one request than anywhere else in the app.
  const orgId = orgIdForSession(session);

  const sp = new URL(req.url).searchParams;
  const parsed = parseQuery(sp.get('q') ?? '');

  if (parsed.tooShort) {
    // 200, not 400. An empty search box is a normal state of the page, not a client error, and the
    // UI should render guidance rather than an error banner on first paint.
    return NextResponse.json({
      query: parsed.raw,
      results: [],
      total: 0,
      notes: [`Type at least ${MIN_QUERY_LENGTH} characters to search.`],
      corpora: corporaFor(roles).map((c) => ({ id: c.id, label: c.label, kind: c.kind })),
    });
  }

  const raw: SearchFilters = {
    corpora: csv(sp.get('corpora')),
    types: csv(sp.get('types')),
    dateRole: (sp.get('date_role') as SearchFilters['dateRole']) ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
  };
  const { filters, problems } = normaliseFilters(raw);

  // Intersect the requested corpora with the ones these roles may see. Doing it here as well as in
  // SQL is deliberate belt-and-braces: it means the response can TELL the user a corpus was excluded,
  // rather than silently returning fewer results than they asked for.
  const allowed = corporaFor(roles);
  const allowedIds = new Set(allowed.map((c) => c.id));
  let requested = filters.corpora?.filter((id) => CORPUS_BY_ID.has(id));
  if (filters.corpora?.length) {
    const unknown = filters.corpora.filter((id) => !CORPUS_BY_ID.has(id));
    if (unknown.length) problems.push(`Ignored unknown source(s): ${unknown.join(', ')}`);
    const denied = requested!.filter((id) => !allowedIds.has(id));
    if (denied.length) {
      problems.push(`You do not have access to: ${denied.map((id) => CORPUS_BY_ID.get(id)!.label).join(', ')}`);
    }
    requested = requested!.filter((id) => allowedIds.has(id));
    if (requested.length === 0) {
      return NextResponse.json({
        query: parsed.raw, results: [], total: 0,
        notes: [...problems, 'No searchable sources were left after filtering.'],
        corpora: allowed.map((c) => ({ id: c.id, label: c.label, kind: c.kind })),
      });
    }
  }

  // Keyword and semantic run CONCURRENTLY, and the keyword result is never made to wait on the AI
  // one. Semantic is an upgrade (§3b/8d): if the provider is slow, misconfigured or down, the answer
  // that already works must not be held up by it.
  const semanticIds = semanticCorpora(
    requested ? allowed.filter((c) => requested!.includes(c.id)) : allowed,
  );

  const [keyword, semantic] = await Promise.all([
    supabaseAdmin.rpc('search_everything', {
      p_query: parsed.raw,
      p_roles: roles,
      p_corpora: requested ?? null,
      p_types: filters.types ?? null,
      p_date_role: filters.dateRole,
      p_from: filters.from ?? null,
      p_to: filters.to ?? null,
      p_org: orgId,
      p_limit: filters.limit,
    }),
    retrieveSemantic(parsed.raw, { corpora: semanticIds, orgId }),
  ]);

  const { data, error } = keyword;

  if (error) {
    // Loudly. "The search failed" and "there is nothing to find" are different answers, and
    // conflating them is precisely what hid the §1.1b bugs for the lifetime of three routes.
    return NextResponse.json(
      { error: `Search failed: ${error.message}`, query: parsed.raw },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as SearchRow[];

  const results = rows.map((r) => {
    const corpus = CORPUS_BY_ID.get(r.corpus);
    return {
      corpus: r.corpus,
      corpusLabel: corpus?.label ?? r.corpus,
      kind: corpus?.kind ?? 'document',
      id: r.row_id,
      title: r.title ?? 'Untitled',
      snippet: r.snippet ?? '',
      type: r.doc_type,
      createdAt: r.created_at,
      effectiveAt: r.effective_at,
      score: Number(r.score),
      // `href` is null for corpora with no viewer page — `customers` today. The result still answers
      // the question because the snippet carries the contact details; rendering it as a dead link
      // would ship a 404 dressed as a feature.
      href: corpus ? corpus.href({ id: r.row_id, ...contextFor(r) }) : null,
    };
  });

  // Hydration is the permission gate for semantic hits, not a formatting step — it re-reads the
  // source row, so a deleted, soft-deleted or out-of-tenant document cannot surface through a chunk
  // that outlived it. See the `hydrateSemantic` header.
  const hydrated = semantic.hits.length ? await hydrateSemantic(semantic.hits, { orgId }) : [];
  const withSemantic = mergeSemantic(results, hydrated);

  // Date filters are applied by `search_everything`; semantic-only hits never passed through it, so
  // they would otherwise ignore a filter the user explicitly set — a result outside the range they
  // asked for reads as the filter being broken.
  const inRange = (h: (typeof withSemantic)[number]) => {
    if (!h.semanticOnly || (!filters.from && !filters.to)) return true;
    const d = filters.dateRole === 'effective' ? (h.effectiveAt ?? h.createdAt) : h.createdAt;
    if (!d) return false;
    const t = Date.parse(d);
    if (filters.from && t < Date.parse(filters.from)) return false;
    if (filters.to && t > Date.parse(filters.to) + 86_400_000 - 1) return false;
    return true;
  };
  const finalResults = withSemantic.filter(inRange);

  return NextResponse.json({
    query: parsed.raw,
    terms: parsed.terms,
    results: finalResults,
    total: finalResults.length,
    truncated: results.length >= filters.limit,
    // Reported on every response, whether it ran or not. The one thing this must never do is stay
    // quiet: a graceful fallback to keyword and a working AI search produce the same screen, which is
    // how `fs_reference_chunks` sat at 0 embeddings for months without anyone noticing (§8d).
    semantic: {
      ran: semantic.skipped === null,
      skipped: semantic.skipped,
      found: hydrated.length,
      message: semanticMessage(semantic.skipped),
    },
    filters: {
      corpora: requested ?? null,
      types: filters.types ?? null,
      dateRole: filters.dateRole,
      from: filters.from ?? null,
      to: filters.to ?? null,
      limit: filters.limit,
    },
    notes: problems,
    corpora: allowed.map((c) => ({ id: c.id, label: c.label, kind: c.kind })),
  });
}, { routeName: 'admin/search' });

/** What to tell a human when the AI half did not run.
 *
 *  Deliberately says what is true and what to do, rather than "AI unavailable". Two of these states
 *  are one command apart from working, and an operator who cannot tell "switched off" from "broken"
 *  will treat both as broken and neither as fixable. `no-corpora` returns null on purpose: filtering
 *  to Jobs only is a choice, not a fault, and warning about it on every search is noise. */
function semanticMessage(skip: SemanticSkip | null): string | null {
  switch (skip) {
    case 'not-configured':
      return 'AI search is off: VOYAGE_API_KEY is not set. Keyword and spelling-tolerant search still ran.';
    case 'empty-index':
      return 'AI search is on but nothing is indexed yet — run `node scripts/embed-documents.mjs`. Keyword search still ran.';
    case 'embed-failed':
      return 'AI search could not reach the embedding provider, so only keyword results are shown.';
    case 'query-failed':
      return 'AI search failed to query the index, so only keyword results are shown.';
    case 'no-corpora':
    case null:
      return null;
  }
}

/** The corpus `href` builders read a parent id under different names (`job_id`,
 *  `research_project_id`, `parent_id`). The function returns whichever one applies as `context_id`,
 *  so map it back onto every name a builder might ask for. */
function contextFor(r: SearchRow): Record<string, unknown> {
  return {
    job_id: r.context_id,
    research_project_id: r.context_id,
    parent_id: r.context_id,
  };
}
