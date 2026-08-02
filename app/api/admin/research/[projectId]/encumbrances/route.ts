// app/api/admin/research/[projectId]/encumbrances/route.ts — what encumbers this property (R34).
//
// One place answering the question, built from the subject's own documents AND from the neighbours'
// — because an easement is usually recorded against only one of the two tracts it crosses, so a
// rollup from the subject's records alone is systematically incomplete, and incomplete precisely at
// the boundary.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import {
  rollUpEncumbrances,
  summariseEncumbrances,
  type EncumbranceInput,
} from '@/lib/research/encumbrance-rollup';
import type { ExtractedDataPoint } from '@/types/research';

const ENCUMBRANCE_CATEGORIES = ['easement', 'right_of_way', 'setback', 'restrictive_covenant'];

function extractProjectId(req: NextRequest): string | null {
  const after = req.nextUrl.pathname.split('/research/')[1];
  return after ? after.split('/')[0] || null : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // The subject's own encumbrances.
  const { data: own, error: ownErr } = await supabaseAdmin
    .from('extracted_data_points')
    .select('*')
    .eq('research_project_id', projectId)
    .in('data_category', ENCUMBRANCE_CATEGORIES);

  if (ownErr) {
    return NextResponse.json(
      { error: 'The encumbrances could not be read. This is not the same as there being none.' },
      { status: 500 },
    );
  }

  const inputs: EncumbranceInput[] = ((own ?? []) as ExtractedDataPoint[]).map((f) => ({
    id: f.id,
    category: f.data_category,
    rawValue: f.raw_value,
    displayValue: f.display_value,
    documentId: f.document_id,
    reviewStatus: f.review_status,
    correctedValue: f.corrected_value,
  }));

  // And the neighbours'. Only those researched in full have their own project with extracted facts —
  // a shallow neighbour has pages we looked at, not data points, so it contributes nothing here yet.
  // That is exactly the gap the "research this property fully" action (R33) closes.
  const { data: adjoiners } = await supabaseAdmin
    .from('research_adjoiners')
    .select('id, owner_name, parcel_id, adjoins_where, deep_project_id, depth')
    .eq('research_project_id', projectId)
    .not('deep_project_id', 'is', null);

  const researched = (adjoiners ?? []) as Array<{
    id: string; owner_name: string | null; parcel_id: string | null;
    adjoins_where: string | null; deep_project_id: string;
  }>;

  if (researched.length > 0) {
    const { data: neighbourFacts } = await supabaseAdmin
      .from('extracted_data_points')
      .select('*')
      .in('research_project_id', researched.map((a) => a.deep_project_id))
      .in('data_category', ENCUMBRANCE_CATEGORIES);

    const byProject = new Map(researched.map((a) => [a.deep_project_id, a]));
    for (const f of (neighbourFacts ?? []) as ExtractedDataPoint[]) {
      const a = byProject.get(f.research_project_id);
      if (!a) continue;
      inputs.push({
        id: f.id,
        category: f.data_category,
        rawValue: f.raw_value,
        displayValue: f.display_value,
        documentId: f.document_id,
        adjoinerId: a.id,
        adjoinerLabel: a.owner_name || (a.parcel_id ? `parcel ${a.parcel_id}` : 'a neighbour'),
        adjoinsWhere: a.adjoins_where,
        reviewStatus: f.review_status,
        correctedValue: f.corrected_value,
      });
    }
  }

  const encumbrances = rollUpEncumbrances(inputs);

  // How many neighbours are still shallow — the size of the gap this rollup cannot close by itself.
  const { count: shallowCount } = await supabaseAdmin
    .from('research_adjoiners')
    .select('id', { count: 'exact', head: true })
    .eq('research_project_id', projectId)
    .eq('depth', 'shallow');

  return NextResponse.json(
    {
      encumbrances,
      summary: summariseEncumbrances(encumbrances),
      neighboursResearched: researched.length,
      neighboursNotResearched: shallowCount ?? 0,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'research/encumbrances' });
