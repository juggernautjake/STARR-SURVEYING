// app/api/admin/equipment/templates/[id]/route.ts
//
// GET /api/admin/equipment/templates/{id}
//
// Templates detail endpoint — Phase F10.2a-ii. Returns the
// template header + every line item ordered by sort_order +
// version metadata so the F10.2e edit page can render the full
// editable form on first load.
//
// Response shape:
//   {
//     template: TemplateRow,           // header from seeds/237
//     items: TemplateItem[],           // ordered by sort_order ASC
//     version_count: number,           // history depth from
//                                      // equipment_template_versions
//     latest_snapshot_at: string|null, // when the current `version`
//                                      // was saved (for "last edited"
//                                      // hint)
//   }
//
// 404 when the id doesn't match a row. UUID-validated path-param.
//
// Auth: admin / developer / tech_support / equipment_manager —
// all four read templates; only admin + equipment_manager edit.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface TemplateHeader {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  job_type: string | null;
  default_crew_size: number | null;
  default_duration_hours: number | null;
  requires_certifications: string[];
  required_personnel_slots: unknown;
  composes_from: string[];
  version: number;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface TemplateItem {
  id: string;
  template_id: string;
  item_kind: 'durable' | 'consumable' | 'kit' | string;
  equipment_inventory_id: string | null;
  category: string | null;
  quantity: number;
  is_required: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const HEADER_COLUMNS =
  'id, name, slug, description, job_type, ' +
  'default_crew_size, default_duration_hours, ' +
  'requires_certifications, required_personnel_slots, composes_from, ' +
  'version, is_archived, created_by, created_at, updated_at';

const ITEM_COLUMNS =
  'id, template_id, item_kind, equipment_inventory_id, category, ' +
  'quantity, is_required, notes, sort_order, created_at, updated_at';

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

    // Pull `[id]` from URL pathname — matches the §F10.1d-i
    // pattern.
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const id = pathSegments[pathSegments.length - 1];
    if (
      !id ||
      !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        id
      )
    ) {
      return NextResponse.json(
        { error: 'id must be a UUID' },
        { status: 400 }
      );
    }

    // Three queries fired in parallel — header, items, version
    // metadata. The version-count probe is cheap (`head: true,
    // count: 'exact'`) and the latest_snapshot_at lookup pulls
    // exactly one row.
    const [headerRes, itemsRes, versionsCountRes, latestSnapshotRes] =
      await Promise.all([
        supabaseAdmin
          .from('equipment_templates')
          .select(HEADER_COLUMNS)
          .eq('id', id)
          .maybeSingle(),
        supabaseAdmin
          .from('equipment_template_items')
          .select(ITEM_COLUMNS)
          .eq('template_id', id)
          .order('sort_order', { ascending: true }),
        supabaseAdmin
          .from('equipment_template_versions')
          .select('id', { count: 'exact', head: true })
          .eq('template_id', id),
        supabaseAdmin
          .from('equipment_template_versions')
          .select('saved_at')
          .eq('template_id', id)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (headerRes.error) {
      console.error('[admin/equipment/templates/:id] header read failed', {
        id,
        error: headerRes.error.message,
      });
      return NextResponse.json(
        { error: headerRes.error.message },
        { status: 500 }
      );
    }
    if (!headerRes.data) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }
    if (itemsRes.error) {
      console.error('[admin/equipment/templates/:id] items read failed', {
        id,
        error: itemsRes.error.message,
      });
      return NextResponse.json(
        { error: itemsRes.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      template: headerRes.data as TemplateHeader,
      items: (itemsRes.data ?? []) as TemplateItem[],
      version_count: versionsCountRes.count ?? 0,
      latest_snapshot_at:
        (latestSnapshotRes.data as { saved_at: string } | null)?.saved_at ??
        null,
    });
  },
  { routeName: 'admin/equipment/templates/:id' }
);
