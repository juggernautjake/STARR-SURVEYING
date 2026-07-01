// lib/cad/persistence/open-drawing.ts
//
// cad-branching — shared "open a cloud drawing by id" flow, factored out of
// SaveToDBDialog.doOpen so the branch + point-file dialogs load a drawing the
// exact same way (fetch → validate/migrate → loadDocument → remember the cloud
// save target → zoom to extents).

import { useDrawingStore, useSelectionStore, useUndoStore, useSaveTargetStore } from '@/lib/cad/store';
import { validateAndMigrateDocument } from '@/lib/cad/validate';
import { cadLog } from '@/lib/cad/logger';

/**
 * Fetch the drawing with cloud id `id`, load it into the editor, and remember
 * it as the Ctrl+S save target. Throws on a network / server error so callers
 * can surface the message.
 */
export async function openDrawingById(id: string): Promise<void> {
  const res = await fetch(`/api/admin/cad/drawings?id=${encodeURIComponent(id)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Server error: ${res.status}`);
  }
  const body = (await res.json()) as {
    drawing: { document: unknown; name?: string; description?: string | null };
  };
  const payload = body.drawing.document as { document?: unknown };
  const doc = validateAndMigrateDocument(payload?.document ?? payload);
  const recordName = body.drawing.name?.trim();
  if (recordName) doc.name = recordName;

  useDrawingStore.getState().loadDocument(doc);
  useSelectionStore.getState().deselectAll();
  useUndoStore.getState().clear();
  useSaveTargetStore.getState().setCloudTarget(
    doc.id,
    id,
    body.drawing.name ?? doc.name,
    body.drawing.description ?? null,
  );
  cadLog.info('FileIO', `Loaded drawing from DB: ${doc.name}`);
  setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
}

/**
 * Fetch just the full DrawingDocument (unwrapped + migrated) for a cloud id,
 * without touching the editor — used by the branch review UI to diff a branch
 * against its parent.
 */
export async function fetchDrawingDocument(id: string): Promise<{
  name: string;
  document: ReturnType<typeof validateAndMigrateDocument>;
} | null> {
  const res = await fetch(`/api/admin/cad/drawings?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { drawing?: { document?: unknown; name?: string } };
  if (!body.drawing) return null;
  const payload = body.drawing.document as { document?: unknown };
  const document = validateAndMigrateDocument(payload?.document ?? payload);
  return { name: body.drawing.name ?? document.name, document };
}
