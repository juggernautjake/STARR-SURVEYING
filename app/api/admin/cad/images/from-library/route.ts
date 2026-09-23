// app/api/admin/cad/images/from-library/route.ts — put a library plat under a CAD drawing.
//
// Owner, 2026-09-23: "I want to create a filing system that integrates with the CAD software, with
// the projects/jobs system, with the research system and all of that."
//
// ── THE GAP THIS FILLS ──────────────────────────────────────────────────────────────────────────
//
// There was no path at all from a research document to a drawing. Not a broken one — nothing:
// `research_documents` is not referenced anywhere under app/api/admin/cad, app/admin/cad or lib/cad.
// The only way a plat became an underlay was a person downloading it from the research page and
// re-uploading it through `POST /api/admin/cad/images`, which takes a base64 data URL because the
// client already had the file in the browser.
//
// So the firm could hold 8,077 Bell plats and a drafter would still fetch one by hand.
//
// ── WHY IT COPIES INSTEAD OF POINTING ───────────────────────────────────────────────────────────
//
// A drawing keeps its images in the `cad-images` bucket and refers to them by URL from inside the
// document JSONB. It would be less work to write the research document's URL straight into the
// drawing — and it would mean a drawing silently changing when a research document is superseded,
// re-filed under a new path, or removed. A survey drawing must not move under the drafter.
//
// So the bytes are copied once, into the drawing's own bucket, and `sourceDocumentId` records where
// they came from. That is provenance without coupling: the drawing is stable, and the link back to
// the library survives.
//
// ── AND IT ASKS THE LIBRARY'S PERMISSION ────────────────────────────────────────────────────────
//
// Only a `shareable` document may be pulled in. A customer's own uploaded survey and a TexasFile
// purchase are both in `research_documents`, and neither may travel into another customer's
// drawing. Seed 658 defaults that column to false so silence means no.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  supabaseAdmin, CAD_IMAGES_BUCKET, RESEARCH_DOCUMENTS_BUCKET, ensureStorageBucket,
} from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** The drawing bucket's own limit (seeds/290). A plat above it is a scan, not an underlay. */
const MAX_BYTES = 25 * 1024 * 1024;

interface DocRow {
  id: string;
  document_label: string | null;
  original_filename: string | null;
  storage_path: string | null;
  storage_url: string | null;
  pages_pdf_url: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  county_fips: string | null;
  shareable: boolean | null;
  provenance: string | null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { documentId?: string };
  const documentId = (body.documentId ?? '').trim();
  if (!documentId) return NextResponse.json({ error: 'documentId is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('research_documents')
    .select('id, document_label, original_filename, storage_path, storage_url, pages_pdf_url, '
      + 'file_type, file_size_bytes, county_fips, shareable, provenance')
    .eq('id', documentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Could not read that document', details: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No such document.' }, { status: 404 });

  const doc = data as unknown as DocRow;

  // ── The licence gate, before a single byte moves ────────────────────────────────────────────
  if (doc.shareable !== true) {
    return NextResponse.json({
      error: doc.provenance === 'customer_upload'
        ? 'That is a customer’s own file. It stays on the job it was uploaded to.'
        : 'That document is not marked shareable, so it cannot be placed in another drawing. '
          + 'Purchased documents are held for the job that bought them.',
    }, { status: 403 });
  }

  if (!doc.storage_path) {
    return NextResponse.json({
      error: 'That document has no stored file — only a link to where it came from. '
        + 'Nothing to place under a drawing yet.',
    }, { status: 409 });
  }

  // Read it out of the research bucket. Signed rather than public, because this route must keep
  // working if that bucket is ever made private — which it should be.
  const signed = await supabaseAdmin.storage
    .from(RESEARCH_DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, 120);
  const href = signed.data?.signedUrl ?? doc.pages_pdf_url ?? doc.storage_url;
  if (!href) return NextResponse.json({ error: 'The stored file could not be reached.' }, { status: 502 });

  const res = await fetch(href);
  if (!res.ok) return NextResponse.json({ error: `The stored file could not be read (HTTP ${res.status}).` }, { status: 502 });
  const bytes = Buffer.from(await res.arrayBuffer());

  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({
      error: `That plat is ${(bytes.length / 1024 / 1024).toFixed(1)} MB and the drawing image limit is `
        + `${MAX_BYTES / 1024 / 1024} MB. Crop or downsample it first.`,
    }, { status: 413 });
  }

  const contentType = res.headers.get('content-type')
    ?? (doc.file_type === 'pdf' ? 'application/pdf' : 'image/png');

  await ensureStorageBucket(CAD_IMAGES_BUCKET, { public: true, fileSizeLimit: MAX_BYTES });

  // Keyed by the document id, so placing the same plat twice reuses one object rather than
  // accumulating a copy per drawing.
  const ext = contentType === 'application/pdf' ? 'pdf' : (contentType.split('/')[1] || 'png');
  const key = `library/${doc.id}.${ext}`;

  const up = await supabaseAdmin.storage
    .from(CAD_IMAGES_BUCKET)
    .upload(key, bytes, { contentType, cacheControl: '31536000', upsert: true });
  if (up.error) return NextResponse.json({ error: `Could not place the image: ${up.error.message}` }, { status: 502 });

  const url = supabaseAdmin.storage.from(CAD_IMAGES_BUCKET).getPublicUrl(key).data.publicUrl;

  return NextResponse.json({
    image: {
      name: doc.document_label || doc.original_filename || 'Plat',
      url,
      path: key,
      contentType,
      bytes: bytes.length,
      // Provenance travels with the image so a drawing can say where its underlay came from.
      sourceDocumentId: doc.id,
      sourceCounty: doc.county_fips,
    },
  });
}, { routeName: 'cad/images/from-library' });
