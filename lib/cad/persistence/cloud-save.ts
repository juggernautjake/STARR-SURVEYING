// lib/cad/persistence/cloud-save.ts
//
// Shared cloud-save helper so both the Save-to-Cloud dialog and the
// one-click Save (Ctrl+S) hit the same endpoint with the same payload
// shape. Updates the existing record when `id` is given, else inserts.
import type { DrawingDocument } from '../types';

export interface CloudSaveOptions {
  /** Existing cloud record id → update; omit → insert new. */
  id?: string;
  name: string;
  /** Preserve the stored description; omitting it NULLs it server-side. */
  description?: string | null;
}

export async function saveDrawingToCloud(
  doc: DrawingDocument,
  opts: CloudSaveOptions,
): Promise<{ id: string; name: string }> {
  const jobId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('job')
      : null;

  const payload = {
    id: opts.id,
    name: (opts.name || doc.name).trim(),
    description: opts.description ?? undefined,
    document: { version: '1.0', application: 'starr-cad', document: doc },
    feature_count: Object.keys(doc.features).length,
    layer_count: Object.keys(doc.layers).length,
    ...(jobId ? { job_id: jobId } : {}),
  };

  const res = await fetch('/api/admin/cad/drawings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Server error: ${res.status}`);
  }
  const body = (await res.json()) as { drawing: { id: string; name: string } };
  return { id: body.drawing.id, name: body.drawing.name };
}
