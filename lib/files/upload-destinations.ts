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

export type UploadOwner = { kind: 'job'; jobId: string } | { kind: 'project'; projectId: string };

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
  jobId: string;
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

  for (const f of tree.folders) {
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
