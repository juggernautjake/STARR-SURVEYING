// app/api/admin/equipment/templates/route.ts
//
// GET /api/admin/equipment/templates?job_type=&include_archived=1&q=&limit=
//
// Templates list endpoint — Phase F10.2a-i. Read-side foundation
// for the F10.2 dispatcher templates work the user explicitly
// asked for: "create a template that entails all of the equipment
// that would be used on that kind of job, and then could reuse
// that template over and over again."
//
// Each row is a header (without the line items) — the F10.2a-ii
// detail endpoint joins items + the latest snapshot for the edit
// page. Listing keeps the per-row payload small for the catalogue
// view + the F10.5 "apply template" picker on the job detail page.
//
// Filters:
//   * job_type — narrow to one tag (boundary / topo / stakeout /
//     road_work / etc.). Indexed via seeds/237 partial idx.
//   * include_archived=1 — opt-in to include is_archived=true
//     rows. Default filters them out so the picker stays clean.
//   * q — case-insensitive substring against name + description.
//   * limit — default 100, max 500. Templates rarely number in
//     the hundreds; the cap is sanity.
//
// Response: { items: TemplateRow[], total_count, filters_applied }.
//
// Auth: admin / developer / tech_support / equipment_manager.
// All four roles can SEE templates; only admin + equipment_manager
// can CREATE them per §5.12.3 permissions split (enforced on
// the F10.2b POST endpoint).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface TemplateRow {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  job_type: string | null;
  default_crew_size: number | null;
  default_duration_hours: number | null;
  requires_certifications: string[];
  composes_from: string[];
  version: number;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Cheap aggregate so the list view can show "5 line items" without
  // a per-row roundtrip. Pulled via the !inner / count syntax.
  item_count?: number;
}

const SELECT_COLUMNS =
  'id, name, slug, description, job_type, ' +
  'default_crew_size, default_duration_hours, ' +
  'requires_certifications, composes_from, version, is_archived, ' +
  'created_by, created_at, updated_at, ' +
  'equipment_template_items(count)';

export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('tech_support') &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const jobTypeRaw = searchParams.get('job_type');
    const includeArchived = searchParams.get('include_archived') === '1';
    const qRaw = searchParams.get('q');
    const limitRaw = searchParams.get('limit');

    const limit = (() => {
      if (!limitRaw) return DEFAULT_LIMIT;
      const n = parseInt(limitRaw, 10);
      if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
      return Math.min(n, MAX_LIMIT);
    })();

    let query = supabaseAdmin
      .from('equipment_templates')
      .select(SELECT_COLUMNS)
      .order('name', { ascending: true })
      .limit(limit);

    if (!includeArchived) {
      query = query.eq('is_archived', false);
    }
    if (jobTypeRaw) {
      query = query.eq('job_type', jobTypeRaw);
    }
    if (qRaw && qRaw.trim()) {
      const escaped = qRaw.trim().replace(/[%,]/g, '');
      query = query.or(
        `name.ilike.%${escaped}%,description.ilike.%${escaped}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[admin/equipment/templates] read failed', {
        error: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten the embedded count() into a top-level item_count for
    // the client. Supabase returns it as `equipment_template_items:
    // [{ count: N }]` — collapse it.
    type RawRow = Omit<TemplateRow, 'item_count'> & {
      equipment_template_items?: Array<{ count: number }>;
    };
    const items: TemplateRow[] = ((data ?? []) as RawRow[]).map((r) => {
      const itemCount = r.equipment_template_items?.[0]?.count ?? 0;
      const { equipment_template_items: _drop, ...rest } = r;
      return { ...rest, item_count: itemCount };
    });

    // Total-count probe (filtered to the same archive shape so
    // narrowing by job_type / q doesn't move the denominator the
    // catalogue UI shows in "Showing N of M").
    let totalCount: number | null = null;
    {
      let countQuery = supabaseAdmin
        .from('equipment_templates')
        .select('id', { count: 'exact', head: true });
      if (!includeArchived) {
        countQuery = countQuery.eq('is_archived', false);
      }
      const { count, error: countErr } = await countQuery;
      if (!countErr) totalCount = count;
    }

    return NextResponse.json({
      items,
      total_count: totalCount,
      filters_applied: {
        job_type: jobTypeRaw ?? null,
        include_archived: includeArchived,
        q: qRaw ?? null,
      },
      limit,
    });
  },
  { routeName: 'admin/equipment/templates' }
);
