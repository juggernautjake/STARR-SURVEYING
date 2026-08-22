// lib/files/comments.ts — the notes people leave on a file, and who may change them.
//
// Owner, 2026-08-22: *"I need to be able to name them and write notes for them too that people can
// review at a later time."*
//
// ── WHY A THREAD AND NOT A NOTES BOX ────────────────────────────────────────────────────────────
//
// `job_files.description` already exists and is a single text column. Making it editable would have
// been the smaller change and it fails the actual requirement in two ways:
//
//   1. The second person to write in it erases the first, with no trace. On a photo two people are
//      looking at *because they disagree about it*, that is the worst possible behaviour.
//   2. "review at a later time" means a month from now, when what matters is who said it and when.
//      A box has no author and no date.
//
// So `description` keeps being the file's own one-line summary, and this is the conversation. Flat,
// not nested — a thread on one photo is a handful of remarks in order, and reply trees turn that
// into navigation.
//
// Pure. No I/O. Tested in `__tests__/files/comments.test.ts`.

/**
 * The tables a comment can be about.
 *
 * `job_files` is everything attached to a job or project. `field_media` is what Work Mode captures
 * on a phone — a different table the owner calls by the same words ("files and videos and
 * pictures"), so the thread was built to reach both rather than be rebuilt for the second one.
 */
export const COMMENT_SUBJECT_TYPES = ['job_file', 'field_media'] as const;
export type CommentSubjectType = (typeof COMMENT_SUBJECT_TYPES)[number];

export function isCommentSubjectType(raw: unknown): raw is CommentSubjectType {
  return typeof raw === 'string' && (COMMENT_SUBJECT_TYPES as readonly string[]).includes(raw);
}

/**
 * Long enough for a paragraph explaining what the crew found; short enough that the column is not a
 * document store. Anything longer belongs in the job's notes, which is a different surface.
 */
export const MAX_COMMENT_LENGTH = 4000;

const CONTROL_CHARS_KEEP_NEWLINES = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

export interface CommentCheck {
  ok: boolean;
  value?: string;
  error?: string;
}

/**
 * Validate and tidy a comment body.
 *
 * Newlines are KEPT — unlike a label, where they would break the line. Somebody describing three
 * monuments writes three lines and re-flowing that into one paragraph loses their structure. Tabs
 * and other control characters go, and runs of blank lines collapse to one so a paste from Word
 * cannot push the next comment off the screen.
 */
export function checkCommentBody(raw: unknown): CommentCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'A note must be text.' };

  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS_KEEP_NEWLINES, ' ')
    // Trailing spaces on each line, then three-or-more blank lines down to one blank line.
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned) return { ok: false, error: 'Write something first.' };
  if (cleaned.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `A note must be ${MAX_COMMENT_LENGTH} characters or fewer.` };
  }
  return { ok: true, value: cleaned };
}

export interface CommentRow {
  id: string;
  author_email: string;
  deleted_at?: string | null;
}

export interface CommentUser {
  email: string;
  isAdmin: boolean;
}

/**
 * May this person edit this comment?
 *
 * Only its author, and NOT an admin.
 *
 * That is deliberate and it is the one place this differs from the rest of the platform, where an
 * admin can do anything. Editing somebody else's words while leaving their name on them is
 * misattribution — the thread would say a crew member wrote something they did not. An admin who
 * disagrees has the same remedy as everyone else: add a comment.
 */
export function canEditComment(comment: CommentRow, user: CommentUser): boolean {
  if (comment.deleted_at) return false;
  return sameEmail(comment.author_email, user.email);
}

/**
 * May this person delete this comment?
 *
 * The author, or an admin. Removal is different from editing: taking a remark down does not put
 * words in anybody's mouth, and somebody has to be able to remove a photo of the wrong property or
 * a note with a client's phone number in it.
 */
export function canDeleteComment(comment: CommentRow, user: CommentUser): boolean {
  if (comment.deleted_at) return false;
  return user.isAdmin || sameEmail(comment.author_email, user.email);
}

/** Email identity, compared the way every other check in this codebase compares it. */
function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? '').trim().toLowerCase();
  const right = (b ?? '').trim().toLowerCase();
  return left.length > 0 && left === right;
}

/**
 * What to call the author in the thread.
 *
 * `author_name` is stored alongside the email precisely so this still reads correctly after the
 * person's account is deactivated — the account lookup would come back empty, and a thread that
 * turns into a column of blank names a year later is a thread nobody can act on.
 */
export function authorLabel(comment: { author_name?: string | null; author_email: string }): string {
  const named = (comment.author_name ?? '').trim();
  if (named) return named;
  const email = (comment.author_email ?? '').trim();
  return email ? email.split('@')[0] : 'Someone';
}
