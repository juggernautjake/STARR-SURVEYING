// lib/files/upload-destinations.ts — where a file in the Upload pop-up can go (owner, 2026-09-15).
//
// "The user will be required to choose which folder in a job the file(s) will upload to … choose
//  from a dropdown list of available folders in the job, and they should even be able to create
//  and name a new folder to drop the file(s) into."
//
// The pop-up reads the same tree the FolderExplorer reads (`/api/admin/files/tree?node=`), so the
// folders offered in the dropdown are exactly the folders somebody then sees on the job. This module
// turns that tree into two lists, and is pure so both are tested without a browser:
//
//   destinations   folders a FILE can be uploaded into — a job's Research / CAD / Photos / Videos /
//                  Documents, every named folder, and a project's own documents
//   parents        places a NEW FOLDER can be created — a job's top level, its standard folders
//                  that take uploads, and every named folder
//
// Both carry the job they belong to, so on a project (several jobs) the dropdown groups by job.

import type { MountTree, MountTreeFolder } from './mount-node';
import {
  jobFolder, parseJobFolderId, parseJobNodeId, parseNamedFolderId, parseProjectDocsId, uploadSpecForRoot,
  type JobFolderKey, type NamedFolderRoot,
} from './job-folders';
import { fileKind } from './viewer-model';

export type UploadOwner =
  | { kind: 'job'; jobId: string }
  | { kind: 'project'; projectId: string }
  /** A File Explorer folder (My files, Shared files, …) — `file_nodes`, uploaded through /api/admin/files/upload. */
  | { kind: 'explorer'; parentId: string };

export interface UploadDestination {
  /** The folder's mount id — what the explorer navigates to afterwards. */
  id: string;
  /** "Photos" or "Photos › Corner shots" — the path inside its job. */
  label: string;
  /** The job (or project) it belongs to, for grouping: "24-103 — Smith". */
  group: string;
  groupId: string;
  owner: UploadOwner;
  /** `job_files.section` and `file_type` an upload here is filed with. */
  section: string;
  fileType: string | null;
  /** 'image' / 'video' when the folder is for one medium (Photos, Videos and folders inside them). */
  only: 'image' | 'video' | null;
  /** The named folder's uuid (`job_files.folder_id`), or null for a standard folder. */
  folderId: string | null;
  /** How deep inside the job: 0 for a standard folder, 1 for a folder inside it, … */
  depth: number;
}

export interface NewFolderParent {
  id: string;
  label: string;
  group: string;
  groupId: string;
  /** The job a named folder is made in, or null for a File Explorer folder (see `explorerParentId`). */
  jobId: string | null;
  /** A File Explorer folder to make the new folder inside (`POST /api/admin/files`). */
  explorerParentId?: string | null;
  /** What `POST /api/admin/jobs/folders` needs: a standard folder key, or a named folder's uuid. */
  parent_key: JobFolderKey | null;
  parent_id: string | null;
  depth: number;
}

const COUNT_SUFFIX = /\s\(\d+\)$/;
export const cleanFolderName = (name: string): string => name.replace(COUNT_SUFFIX, '');

function onlyFor(root: NamedFolderRoot | JobFolderKey): 'image' | 'video' | null {
  if (root === 'photos') return 'image';
  if (root === 'videos') return 'video';
  return null;
}

/** Destinations and new-folder parents, in the tree's own (depth-first) order. */
export function destinationsFromTree(tree: MountTree | null | undefined): { destinations: UploadDestination[]; parents: NewFolderParent[] } {
  const destinations: UploadDestination[] = [];
  const parents: NewFolderParent[] = [];
  if (!tree) return { destinations, parents };

  const byId = new Map<string, MountTreeFolder>(tree.folders.map((f) => [f.id, f]));

  /** The job node a folder sits under, walking parents (the folder itself when it is one). */
  const jobOf = (f: MountTreeFolder): MountTreeFolder | null => {
    let cur: MountTreeFolder | undefined = f;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (parseJobNodeId(cur.id)) return cur;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return null;
  };
  /** Names from just below the job down to this folder. */
  const pathInJob = (f: MountTreeFolder, job: MountTreeFolder): string[] => {
    const out: string[] = [];
    let cur: MountTreeFolder | undefined = f;
    const seen = new Set<string>();
    while (cur && cur.id !== job.id && !seen.has(cur.id)) {
      seen.add(cur.id);
      // Only the listing's own "(n)" on a standard folder is a count; a named folder's name is as typed.
      out.unshift(parseNamedFolderId(cur.id) ? cur.name : cleanFolderName(cur.name));
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return out;
  };
  const jobName = (job: MountTreeFolder) => cleanFolderName(job.id === tree.root.id ? tree.root.name : job.name);

  const canWrite = (a: string | undefined) => a === 'edit' || a === 'manage';

  for (const f of tree.folders) {
    // ── A File Explorer folder (2026-09-15): offered when the caller can write to it ──
    if (!f.id.startsWith('mnt:')) {
      if (!canWrite(f.access)) continue;
      const trail: string[] = [];
      const seen = new Set<string>();
      for (let cur: MountTreeFolder | undefined = f; cur && !seen.has(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
        seen.add(cur.id);
        trail.unshift(cur.name);
      }
      const label = trail.join(' › ');
      const depth = trail.length - 1;
      destinations.push({
        id: f.id, label, group: tree.root.name, groupId: tree.root.id, owner: { kind: 'explorer', parentId: f.id },
        section: '', fileType: null, only: null, folderId: null, depth,
      });
      parents.push({ id: f.id, label, group: tree.root.name, groupId: tree.root.id, jobId: null, explorerParentId: f.id, parent_key: null, parent_id: null, depth });
      continue;
    }

    const jobNode = parseJobNodeId(f.id);
    if (jobNode) {
      parents.push({ id: f.id, label: 'Top level of the job', group: jobName(f), groupId: f.id, jobId: jobNode.jobId, parent_key: null, parent_id: null, depth: 0 });
      continue;
    }

    const docs = parseProjectDocsId(f.id);
    if (docs) {
      destinations.push({
        id: f.id, label: 'Project documents', group: cleanFolderName(tree.root.name), groupId: tree.root.id,
        owner: { kind: 'project', projectId: docs.projectId }, section: 'project', fileType: null, only: null, folderId: null, depth: 0,
      });
      continue;
    }

    const std = parseJobFolderId(f.id);
    if (std) {
      const spec = jobFolder(std.folder);
      if (!spec?.uploadSection) continue; // Receipts: filed from the receipts flow, not uploaded here
      const job = jobOf(f);
      if (!job) continue;
      destinations.push({
        id: f.id, label: spec.label, group: jobName(job), groupId: job.id, owner: { kind: 'job', jobId: std.jobId },
        section: spec.uploadSection, fileType: spec.uploadFileType, only: onlyFor(spec.key), folderId: null, depth: 0,
      });
      parents.push({ id: f.id, label: spec.label, group: jobName(job), groupId: job.id, jobId: std.jobId, parent_key: spec.key, parent_id: null, depth: 0 });
      continue;
    }

    const named = parseNamedFolderId(f.id);
    if (named) {
      const job = jobOf(f);
      if (!job) continue;
      const trail = pathInJob(f, job);
      const spec = uploadSpecForRoot(named.root);
      const depth = trail.length - 1;
      const label = trail.join(' › ');
      destinations.push({
        id: f.id, label, group: jobName(job), groupId: job.id, owner: { kind: 'job', jobId: named.jobId },
        section: spec.section, fileType: spec.fileType, only: onlyFor(named.root), folderId: named.folderId, depth,
      });
      parents.push({ id: f.id, label, group: jobName(job), groupId: job.id, jobId: named.jobId, parent_key: null, parent_id: named.folderId, depth });
    }
  }

  // ── Documents, even while it is empty ──
  // The server lists the Documents catch-all only once it holds something, which is right for
  // browsing and wrong for uploading: a contract needs somewhere to go before it is the first file
  // there. Offered after the job's last standard folder, under the id the listing will give it.
  const docsSpec = jobFolder('documents');
  for (const f of tree.folders) {
    const jobNode = parseJobNodeId(f.id);
    if (!jobNode || !docsSpec?.uploadSection) continue;
    const docsId = `${f.id}:documents`;
    if (destinations.some((d) => d.id === docsId)) continue;
    const std = (d: { groupId: string; id: string }) => d.groupId === f.id && Boolean(parseJobFolderId(d.id));
    const lastStd = destinations.map(std).lastIndexOf(true);
    const dest: UploadDestination = {
      id: docsId, label: docsSpec.label, group: jobName(f), groupId: f.id, owner: { kind: 'job', jobId: jobNode.jobId },
      section: docsSpec.uploadSection, fileType: docsSpec.uploadFileType, only: null, folderId: null, depth: 0,
    };
    destinations.splice(lastStd >= 0 ? lastStd + 1 : destinations.length, 0, dest);
    const lastParent = parents.map(std).lastIndexOf(true);
    parents.splice(lastParent >= 0 ? lastParent + 1 : parents.length, 0, {
      id: docsId, label: docsSpec.label, group: jobName(f), groupId: f.id, jobId: jobNode.jobId, parent_key: 'documents', parent_id: null, depth: 0,
    });
  }

  return { destinations, parents };
}

/** Whether a folder takes this file. Photos takes images; Videos takes video; the rest take anything. */
export function destinationAccepts(dest: Pick<UploadDestination, 'only'>, file: { name: string; type?: string | null }): boolean {
  if (!dest.only) return true;
  return fileKind(file.name, file.type ?? null) === dest.only;
}

/** Why a folder refuses a file, in words for the dropdown. */
export function refusalFor(dest: Pick<UploadDestination, 'only'>): string {
  return dest.only === 'image' ? 'photos only' : dest.only === 'video' ? 'videos only' : '';
}

/** The standard folder a file most likely belongs in, from what it is. */
export function suggestFolderKey(file: { name: string; type?: string | null }): JobFolderKey {
  const kind = fileKind(file.name, file.type ?? null);
  if (kind === 'image') return 'photos';
  if (kind === 'video') return 'videos';
  if (/\.(dwg|dxf|dgn|jxl|dc|job|vce|starr|crd|rw5|raw|csv|txt)$/i.test(file.name)) return 'cad';
  return 'documents';
}

/**
 * The folder the pop-up offers as a one-click suggestion for a file (never chosen FOR the person).
 * Only within one job: on a project with several jobs, guessing the job would be a guess.
 */
export function suggestDestination(destinations: readonly UploadDestination[], file: { name: string; type?: string | null }): UploadDestination | null {
  const jobs = new Set(destinations.filter((d) => d.owner.kind === 'job').map((d) => d.groupId));
  if (jobs.size !== 1) return null;
  const key = suggestFolderKey(file);
  return destinations.find((d) => d.folderId === null && parseJobFolderId(d.id)?.folder === key) ?? null;
}

/**
 * ── SORT THESE FOR ME (owner, 2026-09-19) ──────────────────────────────────────────────────────
 *
 * "in the upload drop box modal there should be a button that auto sorts the files being uploaded
 * into the correct folder. It will take all video files and auto sort them into the videos folder,
 * and all images (jpg, png, img, etc.) should be auto sorted into the images folder."
 *
 * The rule itself is `suggestFolderKey` above and predates this — every file already offered its
 * own one-click "Put it in Photos" hint. What was missing was doing it to the whole list at once,
 * which is the difference between a hint and a feature when somebody has just dropped forty
 * photographs in.
 *
 * Returns a PLAN rather than applying one, for two reasons: it can be described before it happens
 * ("38 to Photos, 12 to Videos, 2 left for you"), and it can be tested without a browser or a
 * dialog. Nothing here mutates.
 *
 * THREE THINGS IT DELIBERATELY WILL NOT DO:
 *
 *   1. It will not place a file a folder would refuse. Photos and Videos each take one medium, so
 *      a destination that fails `destinationAccepts` is not offered even if the key matched.
 *   2. It will not guess across jobs. `suggestDestination` returns nothing when the destinations
 *      span more than one job, because "the Photos folder" is then ambiguous and a confident wrong
 *      answer is worse than none.
 *   3. It will not invent a folder. A scope with no standard folders — somebody's personal Files,
 *      say — produces an empty plan, and the button that calls this should not be shown at all.
 *
 * Anything it cannot place is returned in `unplaced` rather than dropped, so the caller can say how
 * many are still waiting on a person instead of quietly leaving them at the bottom of the list.
 */
export interface AutoSortPlan<T> {
  moves: Array<{ item: T; destination: UploadDestination }>;
  unplaced: T[];
  /** What it did, in the order the folders appear, for a sentence afterwards. */
  summary: Array<{ label: string; count: number }>;
}

export function planAutoSort<T extends { name: string; type?: string | null }>(
  destinations: readonly UploadDestination[],
  files: readonly T[],
): AutoSortPlan<T> {
  const moves: AutoSortPlan<T>['moves'] = [];
  const unplaced: T[] = [];

  for (const file of files) {
    const dest = suggestDestination(destinations, file);
    // `destinationAccepts` is checked even though the key matched: a folder marked photos-only and
    // a file the kind test reads as something else must not be forced together here, where there
    // is nobody watching, when the upload would refuse it later anyway.
    if (dest && destinationAccepts(dest, file)) moves.push({ item: file, destination: dest });
    else unplaced.push(file);
  }

  const counts = new Map<string, number>();
  for (const m of moves) counts.set(m.destination.label, (counts.get(m.destination.label) ?? 0) + 1);

  return { moves, unplaced, summary: [...counts.entries()].map(([label, count]) => ({ label, count })) };
}

/** Can a "sort these for me" button do anything useful here at all?
 *
 *  Asked before the button is rendered rather than after it is pressed: a control that is visible,
 *  enabled, and does nothing when clicked teaches people to distrust the ones that do work. */
export function canAutoSort(destinations: readonly UploadDestination[]): boolean {
  const jobs = new Set(destinations.filter((d) => d.owner.kind === 'job').map((d) => d.groupId));
  if (jobs.size !== 1) return false;
  return destinations.some((d) => d.folderId === null && parseJobFolderId(d.id) !== null);
}

/** Destinations grouped for `<optgroup>`s, keeping the tree's order. */
export function groupDestinations<T extends { groupId: string; group: string }>(items: readonly T[]): Array<{ groupId: string; group: string; items: T[] }> {
  const out: Array<{ groupId: string; group: string; items: T[] }> = [];
  for (const d of items) {
    let g = out.find((x) => x.groupId === d.groupId);
    if (!g) { g = { groupId: d.groupId, group: d.group, items: [] }; out.push(g); }
    g.items.push(d);
  }
  return out;
}

/**
 * Where the Upload files pop-up opens when it is started from a folder on the site-wide Files page
 * (owner, 2026-09-15: "available from the default main files page … choose a folder in the current
 * scope"). The scope is the job or project being browsed — or the File Explorer folder, which the
 * pop-up widens to its place (My files / Shared files) — and the folder itself is pre-chosen when
 * files can go there. Home, and the read-only sources (Receipts, Research Documents), start with no
 * scope: the person picks one under "Save into".
 */
export function uploadScopeFor(folderId: string | null): { rootId: string | null; destinationId: string | null } {
  if (!folderId) return { rootId: null, destinationId: null };
  if (!folderId.startsWith('mnt:')) return { rootId: folderId, destinationId: folderId };
  const parts = folderId.split(':');
  if (parts[1] === 'jobs' && parts[2]) {
    return { rootId: `mnt:jobs:${parts[2]}`, destinationId: parts.length > 3 ? folderId : null };
  }
  if (parts[1] === 'projects' && parts[2]) {
    if (parts[3] && parts[3] !== 'docs') return { rootId: `mnt:projects:${parts[2]}:${parts[3]}`, destinationId: parts.length > 4 ? folderId : null };
    return { rootId: `mnt:projects:${parts[2]}`, destinationId: parts[3] === 'docs' ? folderId : null };
  }
  return { rootId: null, destinationId: null };
}

/**
 * The tree with a just-created folder added in place, so the pop-up can select it at once instead of
 * waiting seconds for the whole job to be listed again (the listing is refreshed behind it). The id is
 * the one the listing will give it: a File Explorer folder is its node id; a named job folder is
 * `<jobNode>:<root>.<uuid>`, with the root inherited from where it was made.
 */
export function withNewFolder(tree: MountTree, parent: NewFolderParent, created: { id: string; name: string }): { tree: MountTree; folderId: string } {
  let id: string;
  if (parent.explorerParentId) {
    id = created.id;
  } else {
    const job = parseJobNodeId(parent.id);
    const std = parseJobFolderId(parent.id);
    const named = parseNamedFolderId(parent.id);
    const jobNode = job ? parent.id : parent.id.slice(0, parent.id.lastIndexOf(':'));
    const root: NamedFolderRoot = std ? std.folder : named ? named.root : 'top';
    id = `${jobNode}:${root}.${created.id}`;
  }
  if (tree.folders.some((f) => f.id === id)) return { tree, folderId: id };

  const parentFolder = tree.folders.find((f) => f.id === parent.id);
  const depth = (parentFolder?.depth ?? 0) + 1;
  const entry: MountTreeFolder = {
    id, name: created.name, parent_id: parent.id, depth,
    path: [...(parentFolder?.path ?? []), created.name], files: [],
    ...(parent.explorerParentId ? { access: 'manage' as const } : { folder_key: 'named' }),
  };
  // After the parent and everything already under it, so depth-first order holds.
  const folders = [...tree.folders];
  let at = folders.findIndex((f) => f.id === parent.id);
  if (at < 0) at = folders.length - 1;
  else {
    const under = new Set([parent.id]);
    for (let i = at + 1; i < folders.length; i++) {
      if (folders[i].parent_id && under.has(folders[i].parent_id!)) { under.add(folders[i].id); at = i; } else break;
    }
  }
  folders.splice(at + 1, 0, entry);
  return { tree: { ...tree, folders }, folderId: id };
}
