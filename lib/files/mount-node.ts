// lib/files/mount-node.ts — the shape of a node in a read-only `mnt:` mount, shared by the server
// that lists them (lib/files/mounts.ts) and the clients that render them (the File Explorer, the
// FolderExplorer on a job or project). Pure types: nothing here touches a database.

import type { AccessLevel } from './permissions';

/** Which row a mounted FILE is a view of — enough for a client to edit it through that row's own
 *  API (rename / notes / tags on a job file, a research document) without a second resolver. */
export interface MountNodeSource {
  table: 'job_files' | 'research_documents' | 'cad_drawings' | 'receipts' | 'field_media';
  id: string;
  job_id?: string | null;
  project_id?: string | null;
  /** research_documents only: the research project the document belongs to (its PATCH route needs it). */
  research_project_id?: string | null;
  /** job_files only: the section the row is filed under (moving between standard folders edits it). */
  section?: string | null;
}

export interface MountNode {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file';
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  updated_at: string;
  access: AccessLevel;
  /** F1 — where this node's natural "open" action goes, when that is a page rather than a download.
   *
   *  A CAD drawing is the case this exists for. Downloading a `.starr` JSON blob is not what anyone
   *  wants from a drawing; opening it in the editor is. Absent for every ordinary file, where the
   *  viewer and the download already say everything there is to say. */
  open_href?: string;
  /** The row behind a mounted file (2026-09-10), so the shared viewer can rename / annotate it. */
  source?: MountNodeSource;
  /** A person's note and tags on the row (job files: description + tags; research: seed 634). */
  notes?: string | null;
  tags?: string[];
  /** The uploaded filename when the display name is a label — the name a download should carry. */
  original_name?: string;
  /** A standard job folder's one-line description, for the folder tiles. */
  blurb?: string;
  /** The standard-folder key, on the folders under a job (research / cad / photos / …). */
  folder_key?: string;
}

/** What `GET /api/admin/files/tree?node=` returns: every folder under a node, flattened, in
 *  depth-first order, each with its files — the "view all files in this folder and its subfolders"
 *  view (owner, 2026-09-10). */
export interface MountTreeFolder {
  id: string;
  name: string;
  /** Names from the root down to this folder, root excluded — `['24-103 — Smith', 'Photos']`. */
  path: string[];
  depth: number;
  parent_id: string | null;
  folder_key?: string;
  blurb?: string;
  open_href?: string;
  files: MountNode[];
  /** Set when this folder's listing failed; its files are then empty rather than the whole tree lost. */
  error?: string;
}

export interface MountTree {
  root: { id: string; name: string; open_href?: string };
  breadcrumb: Array<{ id: string; name: string }>;
  folders: MountTreeFolder[];
  total_files: number;
  /** True when the walk stopped at its folder cap — what is shown is a prefix, not everything. */
  truncated: boolean;
}
