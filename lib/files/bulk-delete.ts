// lib/files/bulk-delete.ts — the pure core of "select some files and delete them" (and Undo).
//
// Owner, 2026-09-27: *"we need a clear way to delete images and videos and files and stuff in my
// projects and jobs folders … with the view and download buttons that there is a delete button as
// well. We should also be able to just do a selection of the images and delete groups of images."*
//
// Files on this site live in several tables (File Explorer nodes, job files, research documents,
// My Files, vehicle photos), each with its own rules about who may delete and whether a delete can
// be undone. The UI should not have to know any of that. It sends a list of `{ kind, id }`; each
// kind has a HANDLER (lib/files/delete-handlers.ts) that does its own permission check, storage and
// row work, and history entry. This file is only the part with no I/O:
//
//   - validating what the browser sent (it is untrusted input);
//   - running the handlers one item at a time, so a failure on item 3 of 10 is reported against
//     item 3 and items 4–10 still run — a bulk action must never be all-or-nothing by accident;
//   - summarising the outcome so the UI can say "7 deleted, 1 could not be: …".

export const DELETE_KINDS = [
  'file_node', 'job_file', 'research_document', 'user_file', 'vehicle_photo', 'equipment_photo', 'lead_attachment',
] as const;
export type DeleteKind = (typeof DELETE_KINDS)[number];

/** Kinds whose delete is SOFT and can be undone (restore). The rest remove the file for good. */
export const RESTORABLE_KINDS: ReadonlySet<DeleteKind> = new Set<DeleteKind>(['file_node', 'job_file']);

/** One request may name at most this many items — a selection, not a table wipe. */
export const MAX_BULK_ITEMS = 200;

export interface DeleteTarget {
  kind: DeleteKind;
  id: string;
}

export interface DeleteActor {
  email: string;
  roles: string[];
  admin: boolean;
}

export interface ItemResult {
  kind: DeleteKind;
  id: string;
  ok: boolean;
  /** The file's name, when the handler could read it — for "could not delete survey.pdf". */
  name?: string;
  /** HTTP-ish status for a failure: 403 not allowed, 404 gone, 500 broke. */
  status?: number;
  error?: string;
  /** True when this item can be brought back with the restore call. */
  restorable?: boolean;
}

export type HandlerOutcome =
  | { ok: true; name?: string }
  | { ok: false; status: number; error: string; name?: string };

export interface KindHandler {
  delete(id: string, actor: DeleteActor): Promise<HandlerOutcome>;
  /** Absent for kinds that cannot be undone. */
  restore?(id: string, actor: DeleteActor): Promise<HandlerOutcome>;
}

export type Handlers = Record<DeleteKind, KindHandler>;

/**
 * A lead attachment's id for delete: `<leadId>_<8 hex>`, the hex a hash of its name and size.
 * Attachments live in a JSON array on the lead and have no id of their own; an INDEX would shift
 * as soon as one of several selected attachments was removed, so a content key is used instead.
 * (Two attachments with the same name AND size are indistinguishable; the first is removed.)
 */
export function leadAttachmentKey(a: { name: string; size: number }): string {
  let h = 0x811c9dc5;
  const s = `${a.name}|${a.size}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function leadAttachmentId(leadId: string, a: { name: string; size: number }): string {
  return `${leadId}_${leadAttachmentKey(a)}`;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Validate a request body `{ targets: [{ kind, id }] }`. Returns the targets, de-duplicated and in
 * order, or a message saying what is wrong. Nothing about permissions — that is each handler's job.
 */
export function parseTargets(body: unknown): { ok: true; targets: DeleteTarget[] } | { ok: false; error: string } {
  const raw = (body as { targets?: unknown } | null)?.targets;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'Nothing to delete: send { targets: [{ kind, id }] }.' };
  if (raw.length > MAX_BULK_ITEMS) return { ok: false, error: `At most ${MAX_BULK_ITEMS} items at a time.` };
  const seen = new Set<string>();
  const targets: DeleteTarget[] = [];
  for (const t of raw) {
    const kind = (t as { kind?: unknown })?.kind;
    const id = (t as { id?: unknown })?.id;
    if (typeof kind !== 'string' || !(DELETE_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, error: `Unknown kind "${String(kind)}".` };
    }
    if (typeof id !== 'string' || !ID_RE.test(id)) return { ok: false, error: 'Every item needs a valid id.' };
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ kind: kind as DeleteKind, id });
  }
  return { ok: true, targets };
}

/**
 * Run `op` for every target, one at a time, never letting one failure stop the rest. A handler that
 * THROWS is reported as a 500 for its item, not allowed to take the batch down.
 */
export async function runBulk(
  op: 'delete' | 'restore',
  targets: DeleteTarget[],
  actor: DeleteActor,
  handlers: Handlers,
): Promise<ItemResult[]> {
  const results: ItemResult[] = [];
  for (const t of targets) {
    const handler = handlers[t.kind];
    const fn = op === 'delete' ? handler?.delete : handler?.restore;
    if (!fn) {
      results.push({ ...t, ok: false, status: 400, error: op === 'restore' ? 'This kind of file cannot be restored.' : 'Unsupported.' });
      continue;
    }
    try {
      const out = await fn.call(handler, t.id, actor);
      results.push(out.ok
        ? { ...t, ok: true, name: out.name, restorable: op === 'delete' ? RESTORABLE_KINDS.has(t.kind) : undefined }
        : { ...t, ok: false, status: out.status, error: out.error, name: out.name });
    } catch (err) {
      results.push({ ...t, ok: false, status: 500, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

export interface BulkSummary {
  succeeded: number;
  failed: number;
  /** "Deleted 3 files." / "Deleted 2 of 3 files. Could not delete: a.pdf (not allowed)." */
  message: string;
}

export function summarise(op: 'delete' | 'restore', results: ItemResult[]): BulkSummary {
  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);
  const verb = op === 'delete' ? 'Deleted' : 'Restored';
  const noun = (n: number) => (n === 1 ? 'file' : 'files');
  let message = bad.length === 0
    ? `${verb} ${ok.length} ${noun(ok.length)}.`
    : `${verb} ${ok.length} of ${results.length} ${noun(results.length)}.`;
  if (bad.length > 0) {
    const list = bad.slice(0, 5).map((r) => `${r.name ?? r.id} (${r.error ?? 'failed'})`).join('; ');
    message += ` Could not ${op}: ${list}${bad.length > 5 ? `; and ${bad.length - 5} more` : ''}.`;
  }
  return { succeeded: ok.length, failed: bad.length, message };
}

/** The HTTP status for a whole batch: 200 all good, 207 mixed, or the shared status when ALL failed
 *  for the same reason (so a caller with no permission at all gets a plain 403). */
export function batchStatus(results: ItemResult[]): number {
  if (results.every((r) => r.ok)) return 200;
  if (results.some((r) => r.ok)) return 207;
  const statuses = new Set(results.map((r) => r.status ?? 500));
  return statuses.size === 1 ? [...statuses][0]! : 207;
}

/**
 * What a File Explorer / FolderExplorer node deletes AS — or null when it is not deleted from a
 * file list at all (a CAD drawing is deleted in CAD, a receipt in Receipts, field media on the
 * phone). Only the row behind the node matters, never the mount path it is shown under.
 */
export function deleteTargetForMountNode(n: {
  id: string;
  name: string;
  source?: { table: string; id: string } | null;
}): (DeleteTarget & { name: string }) | null {
  if (n.source?.table === 'job_files') return { kind: 'job_file', id: n.source.id, name: n.name };
  if (n.source?.table === 'research_documents') return { kind: 'research_document', id: n.source.id, name: n.name };
  if (!n.source && !n.id.startsWith('mnt:')) return { kind: 'file_node', id: n.id, name: n.name };
  return null;
}
