// lib/notifications/branch.ts
//
// cad-branching — pure builders for branch/review notifications:
//   - submitted: author sends a branch to the parent owner for review.
//   - accepted:  owner promotes the branch onto the main drawing.
//   - rejected:  owner declines; the main drawing is unchanged.
//
// Every payload deep-links into the CAD editor. Dependency-free → unit-tested
// in node. Shape matches NotifyOptions (lib/notifications.ts) so the result
// can be passed straight to notify().

export interface BranchNotification {
  user_email: string;
  type: 'drawing';
  source_type: 'drawing_branch_submitted' | 'drawing_branch_accepted' | 'drawing_branch_rejected';
  source_id: string;
  title: string;
  body: string;
  icon: string;
  link: string;
}

/** Editor link that opens a drawing and pops the Reviews inbox. */
export function reviewInboxHref(parentId: string): string {
  return `/admin/cad?drawing=${parentId}&reviews=1`;
}

/** Notify the parent-drawing owner that a branch awaits their review. */
export function buildBranchSubmittedNotification(input: {
  owner_email: string;
  author_email: string;
  parent_id: string;
  branch_id: string;
  drawing_name?: string | null;
  note?: string | null;
}): BranchNotification | null {
  const owner = input.owner_email?.trim().toLowerCase();
  const author = input.author_email?.trim();
  const parentId = input.parent_id?.trim();
  if (!owner || !parentId) return null;
  const label = input.drawing_name?.trim() || 'a drawing';
  const who = author || 'Someone';
  const note = input.note?.trim();
  return {
    user_email: owner,
    type: 'drawing',
    source_type: 'drawing_branch_submitted',
    source_id: input.branch_id?.trim() || parentId,
    title: `🔀 ${who} submitted a branch of ${label}`,
    body: note
      ? `"${note.length > 120 ? `${note.slice(0, 119)}…` : note}" — review and accept or reject it.`
      : `${who} wants you to review their changes. Accept to make it the main drawing, or reject to keep yours.`,
    icon: '🔀',
    link: reviewInboxHref(parentId),
  };
}

/** Notify the branch author that their branch was accepted (now main). */
export function buildBranchAcceptedNotification(input: {
  author_email: string;
  reviewer_email?: string | null;
  parent_id: string;
  branch_id: string;
  drawing_name?: string | null;
}): BranchNotification | null {
  const author = input.author_email?.trim().toLowerCase();
  const parentId = input.parent_id?.trim();
  if (!author || !parentId) return null;
  const label = input.drawing_name?.trim() || 'the drawing';
  const by = input.reviewer_email?.trim();
  return {
    user_email: author,
    type: 'drawing',
    source_type: 'drawing_branch_accepted',
    source_id: input.branch_id?.trim() || parentId,
    title: `✅ Your branch of ${label} was accepted`,
    body: by
      ? `${by} accepted your changes — they're now the main drawing.`
      : `Your changes are now the main drawing.`,
    icon: '✅',
    link: `/admin/cad?drawing=${parentId}`,
  };
}

/** Notify the branch author that their branch was rejected (main unchanged). */
export function buildBranchRejectedNotification(input: {
  author_email: string;
  reviewer_email?: string | null;
  parent_id: string;
  branch_id: string;
  drawing_name?: string | null;
  note?: string | null;
}): BranchNotification | null {
  const author = input.author_email?.trim().toLowerCase();
  const branchId = input.branch_id?.trim();
  if (!author || !branchId) return null;
  const label = input.drawing_name?.trim() || 'the drawing';
  const by = input.reviewer_email?.trim();
  const note = input.note?.trim();
  return {
    user_email: author,
    type: 'drawing',
    source_type: 'drawing_branch_rejected',
    source_id: branchId,
    title: `🚫 Your branch of ${label} was not accepted`,
    body: note
      ? `"${note.length > 120 ? `${note.slice(0, 119)}…` : note}" — your branch is untouched; you can revise and resubmit.`
      : by
        ? `${by} kept the current main drawing. Your branch is untouched — revise and resubmit if you like.`
        : `The main drawing is unchanged. Your branch is untouched — revise and resubmit if you like.`,
    icon: '🚫',
    link: `/admin/cad?drawing=${branchId}`,
  };
}
