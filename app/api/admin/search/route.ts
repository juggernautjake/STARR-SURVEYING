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
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { CORPUS_BY_ID, corporaFor } from '@/lib/search/corpora';
import { parseQuery, normaliseFilters, MIN_QUERY_LENGTH, type SearchFilters } from '@/lib/search/query';

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

  const { data, error } = await supabaseAdmin.rpc('search_everything', {
    p_query: parsed.raw,
    p_roles: roles,
    p_corpora: requested ?? null,
    p_types: filters.types ?? null,
    p_date_role: filters.dateRole,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_org: null,
    p_limit: filters.limit,
  });

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

  return NextResponse.json({
    query: parsed.raw,
    terms: parsed.terms,
    results,
    total: results.length,
    truncated: results.length >= filters.limit,
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
