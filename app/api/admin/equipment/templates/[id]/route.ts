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

// ── PATCH /api/admin/equipment/templates/{id} — header edit ───────────────
//
// Phase F10.2b-ii. Updates the mutable header fields on a template
// + bumps `version` + inserts a new immutable snapshot into
// equipment_template_versions per the §5.12.3 versioning rule.
//
// Body: any subset of the F10.2b-i POST allow-list MINUS slug
// (slug is set on create + locked because changing it would break
// any external bookmark / URL). composes_from / requires_certs /
// required_personnel_slots all editable.
//
// Items are NOT edited via this endpoint — they have their own
// POST/PATCH/DELETE in F10.2c so the operator can add/remove a
// single line without rewriting the whole array. F10.2c also
// triggers a version bump from its side (sharing this snapshot
// helper).
//
// Snapshot semantics (the audit-trail contract):
//   1. Read current items (we need them in items_jsonb of the
//      new snapshot so the audit trail shows what items existed
//      at this version).
//   2. UPDATE header w/ bumped version + updated_at.
//   3. INSERT snapshot row at the new version.
//
// Step 3 failure is logged but doesn't roll back — same posture
// as the POST. The live row + items still work; the missing
// snapshot is recoverable by a future "rebuild snapshots" admin
// tool.
//
// Auth: admin (incl. developer via isAdmin) + equipment_manager.
// tech_support read-only per §5.12.3.

const HEADER_PATCH_KEYS = new Set([
  'name',
  'description',
  'job_type',
  'default_crew_size',
  'default_duration_hours',
  'requires_certifications',
  'required_personnel_slots',
  'composes_from',
  'is_archived',
]);

const PATCH_UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface PatchBody {
  [key: string]: unknown;
}

export const PATCH = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const id = pathSegments[pathSegments.length - 1];
    if (!id || !PATCH_UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'id must be a UUID' },
        { status: 400 }
      );
    }

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (HEADER_PATCH_KEYS.has(k) && v !== undefined) {
        update[k] = v;
      }
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields supplied' },
        { status: 400 }
      );
    }

    // Validate strings + arrays. Mirrors the POST but only on
    // supplied keys.
    if (typeof update.name === 'string') {
      const trimmed = update.name.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: 'name cannot be empty' },
          { status: 400 }
        );
      }
      if (trimmed.length > 200) {
        return NextResponse.json(
          { error: 'name must be ≤200 characters' },
          { status: 400 }
        );
      }
      update.name = trimmed;
    }
    if (update.composes_from !== undefined) {
      if (!Array.isArray(update.composes_from)) {
        return NextResponse.json(
          { error: 'composes_from must be an array of UUIDs' },
          { status: 400 }
        );
      }
      const arr = update.composes_from;
      const bad = arr.find(
        (v) => typeof v !== 'string' || !PATCH_UUID_RE.test(v as string)
      );
      if (bad !== undefined) {
        return NextResponse.json(
          { error: `composes_from contains a non-UUID: "${bad}"` },
          { status: 400 }
        );
      }
      // Self-loop guard — can't compose from self (recursion guard
      // proper runs at apply time per §5.12.3, but the no-self-loop
      // guarantee is cheap to enforce here).
      if ((arr as string[]).includes(id)) {
        return NextResponse.json(
          { error: 'composes_from cannot reference the template itself' },
          { status: 400 }
        );
      }
    }
    if (update.requires_certifications !== undefined) {
      if (
        !Array.isArray(update.requires_certifications) ||
        (update.requires_certifications as unknown[]).some(
          (v) => typeof v !== 'string'
        )
      ) {
        return NextResponse.json(
          { error: 'requires_certifications must be an array of strings' },
          { status: 400 }
        );
      }
    }
    for (const key of [
      'default_crew_size',
      'default_duration_hours',
    ] as const) {
      const v = update[key];
      if (v !== undefined && v !== null) {
        if (typeof v !== 'number' || v < 0) {
          return NextResponse.json(
            { error: `${key} must be a non-negative number` },
            { status: 400 }
          );
        }
      }
    }
    if (update.is_archived !== undefined) {
      if (typeof update.is_archived !== 'boolean') {
        return NextResponse.json(
          { error: 'is_archived must be a boolean' },
          { status: 400 }
        );
      }
    }

    // Read current header + items in parallel — header to get
    // current version; items to snapshot into the new version row.
    const [headerRes, itemsRes] = await Promise.all([
      supabaseAdmin
        .from('equipment_templates')
        .select('id, name, description, job_type, version')
        .eq('id', id)
        .maybeSingle(),
      supabaseAdmin
        .from('equipment_template_items')
        .select(ITEM_COLUMNS)
        .eq('template_id', id)
        .order('sort_order', { ascending: true }),
    ]);

    if (headerRes.error) {
      console.error('[admin/equipment/templates/:id PATCH] read failed', {
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
    const currentHeader = headerRes.data as { version: number };
    const newVersion = currentHeader.version + 1;
    const items = itemsRes.error ? [] : (itemsRes.data ?? []);

    // UPDATE header.
    const nowIso = new Date().toISOString();
    update.version = newVersion;
    update.updated_at = nowIso;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('equipment_templates')
      .update(update)
      .eq('id', id)
      .select(HEADER_COLUMNS)
      .maybeSingle();
    if (updateErr) {
      console.error(
        '[admin/equipment/templates/:id PATCH] update failed',
        { id, error: updateErr.message }
      );
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }
    if (!updated) {
      return NextResponse.json(
        { error: 'Template not found (race lost)' },
        { status: 404 }
      );
    }

    // INSERT snapshot row at the new version. Best-effort —
    // failure is logged but doesn't roll back the header update.
    type FullHeader = {
      id: string;
      name: string;
      description: string | null;
      job_type: string | null;
      composes_from: string[];
      required_personnel_slots: unknown;
      requires_certifications: string[];
      version: number;
    };
    const u = updated as FullHeader;
    const { error: snapErr } = await supabaseAdmin
      .from('equipment_template_versions')
      .insert({
        template_id: id,
        version: newVersion,
        name_at_version: u.name,
        description_at_version: u.description,
        job_type_at_version: u.job_type,
        composes_from_at_version: u.composes_from ?? [],
        required_personnel_slots_at_version: u.required_personnel_slots ?? [],
        requires_certifications_at_version: u.requires_certifications ?? [],
        items_jsonb: items,
      });
    if (snapErr) {
      console.warn(
        '[admin/equipment/templates/:id PATCH] snapshot write failed (non-fatal)',
        { id, version: newVersion, error: snapErr.message }
      );
    }

    console.log('[admin/equipment/templates/:id PATCH] updated', {
      id,
      keys: Object.keys(update).filter(
        (k) => k !== 'version' && k !== 'updated_at'
      ),
      new_version: newVersion,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      template: updated,
      version: newVersion,
    });
  },
  { routeName: 'admin/equipment/templates/:id#patch' }
);

// ── DELETE /api/admin/equipment/templates/{id} — soft-archive ─────────────
//
// Phase F10.2b-iii. Hard-delete is intentionally NOT supported —
// historical job_equipment rows carry from_template_id pointing
// at templates per the §5.12.3 versioning contract; deleting the
// template would orphan that audit chain. Instead, this endpoint
// flips is_archived=true (same effect as PATCH body
// `{ is_archived: true }` but exposed under DELETE for clients
// that prefer REST verb semantics).
//
// Idempotent: already-archived rows return 200 with
// already_archived: true (no version bump, no snapshot write).
//
// Restore is via PATCH `{ is_archived: false }` — symmetric with
// the F10.1e equipment retire/restore split where the unretire
// path lives on the same surface as the retire.
//
// Auth: admin (incl. developer via isAdmin) + equipment_manager.

export const DELETE = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const id = pathSegments[pathSegments.length - 1];
    if (!id || !PATCH_UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'id must be a UUID' },
        { status: 400 }
      );
    }

    // Read current state to detect already-archived idempotent
    // re-run + capture items for the snapshot.
    const [headerRes, itemsRes] = await Promise.all([
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
    ]);

    if (headerRes.error) {
      console.error('[admin/equipment/templates/:id DELETE] read failed', {
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

    type RowShape = {
      id: string;
      version: number;
      is_archived: boolean;
      name: string;
      description: string | null;
      job_type: string | null;
      composes_from: string[];
      required_personnel_slots: unknown;
      requires_certifications: string[];
    };
    const row = headerRes.data as RowShape;
    if (row.is_archived) {
      return NextResponse.json({
        template: row,
        already_archived: true,
      });
    }

    const newVersion = row.version + 1;
    const nowIso = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('equipment_templates')
      .update({
        is_archived: true,
        version: newVersion,
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('is_archived', false) // race guard
      .select(HEADER_COLUMNS)
      .maybeSingle();

    if (updateErr) {
      console.error(
        '[admin/equipment/templates/:id DELETE] update failed',
        { id, error: updateErr.message }
      );
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }
    if (!updated) {
      // Race lost — somebody else archived it between our read
      // and our write. Re-read for the response.
      const { data: refreshed } = await supabaseAdmin
        .from('equipment_templates')
        .select(HEADER_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      return NextResponse.json({
        template: refreshed ?? row,
        already_archived: true,
      });
    }

    // Snapshot the archive transition. Best-effort.
    const items = itemsRes.error ? [] : (itemsRes.data ?? []);
    const u = updated as RowShape;
    const { error: snapErr } = await supabaseAdmin
      .from('equipment_template_versions')
      .insert({
        template_id: id,
        version: newVersion,
        name_at_version: u.name,
        description_at_version: u.description,
        job_type_at_version: u.job_type,
        composes_from_at_version: u.composes_from ?? [],
        required_personnel_slots_at_version: u.required_personnel_slots ?? [],
        requires_certifications_at_version: u.requires_certifications ?? [],
        items_jsonb: items,
      });
    if (snapErr) {
      console.warn(
        '[admin/equipment/templates/:id DELETE] snapshot write failed (non-fatal)',
        { id, version: newVersion, error: snapErr.message }
      );
    }

    console.log('[admin/equipment/templates/:id DELETE] archived', {
      id,
      new_version: newVersion,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      template: updated,
      already_archived: false,
      version: newVersion,
    });
  },
  { routeName: 'admin/equipment/templates/:id#delete' }
);
