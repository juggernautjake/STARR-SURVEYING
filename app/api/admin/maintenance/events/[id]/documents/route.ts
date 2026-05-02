// app/api/admin/maintenance/events/[id]/documents/route.ts
//
// GET  /api/admin/maintenance/events/[id]/documents
// POST /api/admin/maintenance/events/[id]/documents
//
// Phase F10.7-d — list + record-on-upload for the
// `maintenance_event_documents` table from seeds/247.
//
// File-bucket upload itself happens client-side: the F10.7-g
// detail-page UI requests a signed upload URL from a separate
// helper (file-bucket signing endpoint, §5.6 pattern), uploads
// the bytes directly to storage, then POSTs here with the
// resulting `storage_url` so the metadata row is recorded.
// Splitting upload-bytes from upload-metadata keeps the file
// path off the Next.js server (no streamed bytes in a
// serverless function — important for the 50 MB calibration
// PDFs).
//
// GET returns every document for the event in upload order
// (newest first) so the F10.7-g history tab renders without
// per-file roundtrips.
//
// POST validates: parent event exists; `kind` is one of the
// seeds/247 enum values; storage_url + filename are sane
// strings; size_bytes is non-negative when present. The
// seeds/247 ON DELETE CASCADE on event_id keeps orphan rows
// impossible.
//
// Auth: GET = EQUIPMENT_ROLES; POST = admin / developer /
// equipment_manager.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ALLOWED_KINDS = new Set([
  'calibration_cert',
  'work_order',
  'parts_invoice',
  'before_photo',
  'after_photo',
  'qa_report',
  'other',
]);

function eventIdFromUrl(url: URL): string | null {
  // /api/admin/maintenance/events/[id]/documents
  // segments after 'events': [id, 'documents']
  const segments = url.pathname.split('/').filter(Boolean);
  const eventsIdx = segments.indexOf('events');
  if (eventsIdx < 0) return null;
  const id = segments[eventsIdx + 1];
  if (!id || !UUID_RE.test(id)) return null;
  return id;
}

// ──────────────────────────────────────────────────────────────
// GET — list attachments for the event
// ──────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
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

  const url = new URL(req.url);
  const eventId = eventIdFromUrl(url);
  if (!eventId) {
    return NextResponse.json(
      { error: 'event id must be a UUID.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('maintenance_event_documents')
    .select(
      'id, event_id, kind, storage_url, filename, size_bytes, ' +
        'description, uploaded_by, uploaded_at'
    )
    .eq('event_id', eventId)
    .order('uploaded_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows =
    (data ?? []) as Array<{
      id: string;
      event_id: string;
      kind: string;
      storage_url: string;
      filename: string | null;
      size_bytes: number | null;
      description: string | null;
      uploaded_by: string | null;
      uploaded_at: string;
    }>;

  // Resolve uploader display fields in one batch.
  const uploaderIds = Array.from(
    new Set(rows.map((r) => r.uploaded_by).filter((v): v is string => !!v))
  );
  const uploaderById = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('registered_users')
      .select('id, email, name')
      .in('id', uploaderIds);
    for (const r of (users ?? []) as Array<{
      id: string;
      email: string | null;
      name: string | null;
    }>) {
      uploaderById.set(r.id, r.name ?? r.email ?? r.id);
    }
  }

  return NextResponse.json({
    documents: rows.map((r) => ({
      ...r,
      uploaded_by_label: r.uploaded_by
        ? uploaderById.get(r.uploaded_by) ?? null
        : null,
    })),
    count: rows.length,
  });
}, { routeName: 'admin/maintenance/events/:id/documents#get' });

// ──────────────────────────────────────────────────────────────
// POST — record metadata for an uploaded attachment
// ──────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
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
  const actorUserId =
    (session.user as { id?: string } | undefined)?.id ?? null;

  const url = new URL(req.url);
  const eventId = eventIdFromUrl(url);
  if (!eventId) {
    return NextResponse.json(
      { error: 'event id must be a UUID.' },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object.' },
      { status: 400 }
    );
  }

  const kind = typeof body.kind === 'string' ? body.kind.trim() : '';
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json(
      {
        error:
          '`kind` is required and must be one of: ' +
          Array.from(ALLOWED_KINDS).join(', '),
      },
      { status: 400 }
    );
  }

  const storageUrl =
    typeof body.storage_url === 'string' ? body.storage_url.trim() : '';
  if (!storageUrl) {
    return NextResponse.json(
      { error: '`storage_url` is required.' },
      { status: 400 }
    );
  }
  if (storageUrl.length > 2000) {
    return NextResponse.json(
      { error: '`storage_url` must be ≤ 2000 characters.' },
      { status: 400 }
    );
  }

  let filename: string | null = null;
  if (body.filename !== undefined && body.filename !== null) {
    if (typeof body.filename !== 'string') {
      return NextResponse.json(
        { error: '`filename` must be a string when present.' },
        { status: 400 }
      );
    }
    const trimmed = body.filename.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > 255) {
        return NextResponse.json(
          { error: '`filename` must be ≤ 255 characters.' },
          { status: 400 }
        );
      }
      filename = trimmed;
    }
  }

  let sizeBytes: number | null = null;
  if (body.size_bytes !== undefined && body.size_bytes !== null) {
    if (
      typeof body.size_bytes !== 'number' ||
      !Number.isInteger(body.size_bytes) ||
      body.size_bytes < 0
    ) {
      return NextResponse.json(
        {
          error:
            '`size_bytes` must be a non-negative integer when present.',
        },
        { status: 400 }
      );
    }
    sizeBytes = body.size_bytes;
  }

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      return NextResponse.json(
        { error: '`description` must be a string when present.' },
        { status: 400 }
      );
    }
    const trimmed = body.description.trim();
    description = trimmed.length > 0 ? trimmed : null;
  }

  // Validate parent event exists. The seeds/247 FK ON DELETE
  // CASCADE means a missing parent → orphan-impossible at the
  // DB level, but a friendly 404 here saves the client a
  // PostgREST FK error round-trip.
  const { data: parent, error: parentErr } = await supabaseAdmin
    .from('maintenance_events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle();
  if (parentErr) {
    return NextResponse.json(
      { error: parentErr.message },
      { status: 500 }
    );
  }
  if (!parent) {
    return NextResponse.json(
      { error: 'Maintenance event not found.' },
      { status: 404 }
    );
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('maintenance_event_documents')
    .insert({
      event_id: eventId,
      kind,
      storage_url: storageUrl,
      filename,
      size_bytes: sizeBytes,
      description,
      uploaded_by: actorUserId,
    })
    .select(
      'id, event_id, kind, storage_url, filename, size_bytes, ' +
        'description, uploaded_by, uploaded_at'
    )
    .maybeSingle();
  if (insertErr) {
    console.error(
      '[admin/maintenance/events/:id/documents POST] insert failed',
      { event_id: eventId, error: insertErr.message }
    );
    return NextResponse.json(
      { error: insertErr.message ?? 'Insert failed.' },
      { status: 500 }
    );
  }
  if (!inserted) {
    return NextResponse.json(
      { error: 'Insert returned no row.' },
      { status: 500 }
    );
  }

  console.log(
    '[admin/maintenance/events/:id/documents POST] ok',
    {
      event_id: eventId,
      document_id: (inserted as { id: string }).id,
      kind,
      size_bytes: sizeBytes,
      actor_email: session.user.email,
    }
  );

  return NextResponse.json({ document: inserted });
}, { routeName: 'admin/maintenance/events/:id/documents#post' });
