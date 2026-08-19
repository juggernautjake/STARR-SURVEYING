// lib/files/audit.ts — who did what to a file or folder, and how to say it.
//
// ── THE BUG THIS MODULE EXISTS TO MAKE IMPOSSIBLE ────────────────────────────────────────────────
//
// `activity_log` has columns `action_type` and `metadata`. Six routes — the job, CAD and file ones,
// which is to say *precisely the ones anybody would want a history of* — wrote `action` and
// `details` instead. PostgREST rejects that with `PGRST204: Could not find the 'action' column`,
// and every one of those writes was wrapped in `fireAndForget`, whose whole job is to swallow the
// error so an advisory write can never fail a user's action.
//
// So the platform reported that it was tracking job files, CAD saves, team changes and stage moves,
// and was recording **none of them**. Nothing failed. Nothing was logged. The reader in
// `jobs/activity` asked for `action, details` too, so it errored on every call and the Activity tab
// quietly showed only the half that came from `job_stages_history`. Proven against the live
// database on 2026-08-19 rather than inferred: 70 rows, 3 of them about a job, none written since
// 2026-08-14.
//
// The lesson is not "be careful with column names" — it is that a fire-and-forget write has no
// feedback path, so its shape has to be pinned somewhere that *does*. That is this file:
// `fileEventRow` is pure, it is the only place a file event's columns are spelled, and
// `__tests__/files/audit.test.ts` asserts those spellings. A rename that breaks the insert now
// breaks a test instead of breaking silently in production.
//
// Pure. No I/O — the write lives in `lib/files/audit-log.ts`.

/** Everything that can happen to a node in the File Explorer.
 *
 *  Prefixed `file_` so a history query can find them all without listing them, and so they never
 *  collide with the `job_*` actions that share this table. */
export type FileAction =
  | 'file_folder_created'
  | 'file_uploaded'
  | 'file_renamed'
  | 'file_moved'
  | 'file_copied'
  | 'file_deleted'
  | 'file_permissions_changed'
  | 'file_downloaded'
  // The bin. `file_restored` is why a delete is worth recording in the first place — a history that
  // shows a file was deleted but not that it came back is worse than no history, because it is
  // confidently wrong.
  | 'file_restored'
  | 'file_purged';

/** The entity a file event hangs on. One value, so `entity_type` cannot drift between routes. */
export const FILE_ENTITY = 'file_node';

export interface FileEventInput {
  action: FileAction;
  /** The node the event is ABOUT. History is keyed on this, never on a path — which is what makes
   *  a file's history survive being renamed and moved. */
  nodeId: string;
  actorEmail: string;
  /** Free-form specifics: the name, the old name, where it moved from and to, a size. */
  metadata?: Record<string, unknown>;
}

/** The exact row to insert into `activity_log`. The column names live here and nowhere else. */
export function fileEventRow(input: FileEventInput): {
  user_email: string;
  action_type: FileAction;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
} {
  return {
    user_email: input.actorEmail,
    action_type: input.action,
    entity_type: FILE_ENTITY,
    entity_id: input.nodeId,
    metadata: input.metadata ?? {},
  };
}

const LABELS: Record<FileAction, string> = {
  file_folder_created: 'Folder created',
  file_uploaded: 'Uploaded',
  file_renamed: 'Renamed',
  file_moved: 'Moved',
  file_copied: 'Copied',
  file_deleted: 'Deleted',
  file_permissions_changed: 'Permissions changed',
  file_downloaded: 'Downloaded',
  file_restored: 'Restored',
  file_purged: 'Permanently deleted',
};

export interface DescribedEvent {
  label: string;
  /** The one line that says what actually changed, or undefined when the label already says it. */
  detail?: string;
}

function str(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : undefined;
}

/**
 * Turn a stored event into something a person reads.
 *
 * A rename that does not say what it was called before is not a history, it is a timestamp — so
 * every action that has a "from" carries it, and the describe function is where that contract is
 * enforced rather than in each panel that renders one.
 */
export function describeFileEvent(action: string, metadata: unknown): DescribedEvent {
  const m = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>;
  const label = LABELS[action as FileAction] ?? action.replace(/^file_/, '').replace(/_/g, ' ');

  switch (action) {
    case 'file_renamed': {
      const from = str(m.from_name);
      const to = str(m.to_name);
      return { label, detail: from && to ? `${from} → ${to}` : to };
    }
    case 'file_moved': {
      const from = str(m.from_parent_name) ?? (m.from_parent_id === null ? 'the top level' : undefined);
      const to = str(m.to_parent_name) ?? (m.to_parent_id === null ? 'the top level' : undefined);
      return { label, detail: from && to ? `${from} → ${to}` : to };
    }
    case 'file_permissions_changed': {
      // The count is the honest summary: naming every grant in a one-line history entry is how a
      // history stops being skimmable. The panel can show the grants themselves.
      const n = typeof m.grant_count === 'number' ? m.grant_count : undefined;
      const mode = str(m.permission_mode);
      const parts = [mode ? (mode === 'inherit' ? 'inherits from its parent' : 'set on this item') : undefined,
        n !== undefined ? `${n} ${n === 1 ? 'grant' : 'grants'}` : undefined].filter(Boolean);
      return { label, detail: parts.length ? parts.join(' · ') : undefined };
    }
    case 'file_copied': {
      const from = str(m.source_name);
      return { label, detail: from ? `from ${from}` : str(m.name) };
    }
    case 'file_restored': {
      const name = str(m.name);
      // A restore that had to rename to avoid a collision must SAY so, or the file appears to have
      // come back under a name the person never chose and they conclude the wrong one was restored.
      const renamed = str(m.restored_as);
      const n = typeof m.descendants === 'number' && m.descendants > 0 ? `with ${m.descendants} item(s)` : undefined;
      const as = renamed && renamed !== name ? `restored as ${renamed}` : undefined;
      return { label, detail: [name, as, n].filter(Boolean).join(' · ') || undefined };
    }
    case 'file_uploaded': {
      const name = str(m.name);
      const size = typeof m.size_bytes === 'number' ? humanSize(m.size_bytes) : undefined;
      return { label, detail: [name, size].filter(Boolean).join(' · ') || undefined };
    }
    default:
      return { label, detail: str(m.name) };
  }
}

export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
