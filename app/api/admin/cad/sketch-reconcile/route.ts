// app/api/admin/cad/sketch-reconcile/route.ts
//
// CAD_POINTS_AND_AI slice F — API endpoint for hand-sketch
// reconciliation. Accepts a multipart upload with the sketch
// image + a JSON list of collected survey points + an optional
// surveyor-supplied notes string. Routes to
// `reconcileSketch()` and returns the structured result.
//
// Auth-gated to admin (same gate as the rest of /api/admin).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { reconcileSketch, type SketchReconcileInput } from '@/lib/cad/ai/sketch-reconcile';
import { MissingApiKeyError } from '@/lib/cad/ai-engine/claude-deed-parser';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vision calls can take up to ~30s

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB — fits comfortably under Resend / Vision limits
const ALLOWED_MEDIA: Record<string, SketchReconcileInput['imageMediaType']> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get('sketch');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing sketch file field.' }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: `Sketch exceeds ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
  }
  const media = ALLOWED_MEDIA[file.type];
  if (!media) {
    return NextResponse.json({ error: `Unsupported image type ${file.type}; use PNG, JPEG, or WebP.` }, { status: 415 });
  }

  let collectedPoints: SketchReconcileInput['collectedPoints'];
  try {
    const raw = form.get('collectedPoints');
    if (typeof raw !== 'string') throw new Error('collectedPoints must be a JSON string.');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('collectedPoints must be an array.');
    collectedPoints = parsed
      .filter((p): p is { name: string; x: number; y: number } =>
        !!p && typeof p === 'object' &&
        typeof (p as { name?: unknown }).name === 'string' &&
        typeof (p as { x?: unknown }).x === 'number' &&
        typeof (p as { y?: unknown }).y === 'number');
  } catch (e) {
    return NextResponse.json({ error: `Bad collectedPoints: ${e instanceof Error ? e.message : 'invalid'}` }, { status: 400 });
  }

  const notesField = form.get('notes');
  const notes = typeof notesField === 'string' && notesField.trim() ? notesField.trim() : undefined;

  const imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  try {
    const result = await reconcileSketch({
      imageBase64,
      imageMediaType: media,
      collectedPoints,
      notes,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    // C44e — an unset key is not a bad gateway.
    //
    // `reconcileSketch` throws `MissingApiKeyError` exactly as the proposer does, but this route
    // folded it in with every upstream failure and returned 502. The two lead somewhere different:
    // a 502 says Anthropic failed, so retry, while an unset key says nobody has configured this
    // yet, so go set it. The other two CAD AI routes already separate them; this one is the odd
    // surface, and "configured" versus "working" is the distinction C44e exists to keep visible.
    if (e instanceof MissingApiKeyError) {
      return NextResponse.json(
        { ok: false, error: 'Sketch reconciliation is offline — ANTHROPIC_API_KEY is not configured.' },
        { status: 503 },
      );
    }
    const message = e instanceof Error ? e.message : 'Unknown sketch-reconcile error.';
    console.error('[sketch-reconcile] error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
