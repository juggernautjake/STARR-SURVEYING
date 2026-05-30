// lib/notifications/drawing-note-recipients.ts
//
// drawings-collaboration Slice 3 — pure resolver for "who gets pinged
// by this drawing note". When the POST body carries `recipient_emails`
// explicitly, that wins. Otherwise the route falls back to the
// drawing's assignee + the job-scope cohort, minus the note's author
// so they don't ping themselves. Dependency-free → unit-tested in
// node.

export interface NoteRecipientInput {
  /** Optional list the caller passed in (e.g. an @-mention picker). */
  explicit?: readonly string[] | null;
  /** The drawing's `assigned_to` column. */
  assignee?: string | null;
  /** The job-team cohort from `usersForJobScope`. Already deduped +
   *  lowercased, but may include the author. */
  scope: readonly string[];
  /** The note's author — always excluded from the recipient list. */
  author: string;
}

/** Distinct, lowercased emails, in author-preferred order:
 *   1. explicit list (when non-empty);
 *   2. else assignee first, then the scope cohort.
 *  In every case the author is filtered out. */
export function resolveNoteRecipients(input: NoteRecipientInput): string[] {
  const author = input.author?.trim().toLowerCase() ?? '';
  const seen = new Set<string>();
  const out: string[] = [];

  function push(raw?: string | null) {
    const email = raw?.trim().toLowerCase();
    if (!email) return;
    if (email === author) return;
    if (seen.has(email)) return;
    seen.add(email);
    out.push(email);
  }

  const explicit = input.explicit?.filter((e) => !!e?.trim()) ?? [];
  if (explicit.length > 0) {
    for (const e of explicit) push(e);
    return out;
  }

  push(input.assignee ?? null);
  for (const s of input.scope) push(s);
  return out;
}
