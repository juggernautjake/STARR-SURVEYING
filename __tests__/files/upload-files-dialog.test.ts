/**
 * The Upload files pop-up and named job folders (owner, 2026-09-15).
 *
 * "We need a button for uploading/attaching files, that when pressed, opens a pop up kind of modal
 *  that allows the user to drop files into it or open the computer file explorer … the user will be
 *  required to choose which folder in a job the file(s) will upload to … choose from a dropdown list
 *  of available folders in the job, and they should even be able to create and name a new folder."
 *
 *   1. the vocabulary — named folder ids, names, roots (lib/files/job-folders.ts)
 *   2. the dropdown — destinations and new-folder parents from a tree (lib/files/upload-destinations.ts)
 *   3. the listing — named folders and their files through the real mount code, on a fake database
 *   4. the writes — folder routes, folder_id on upload / move / send, seed 639
 *   5. the wiring — the pop-up, and the callers that open it (the job page, the FolderExplorer)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  namedFolderSegment, parseNamedFolderSegment, parseNamedFolderId, parseJobNodeId, namedFolderRoots,
  uploadSpecForRoot, checkFolderName, NAMED_FOLDER_ROOTS, parseJobFolderId,
} from '@/lib/files/job-folders';
import {
  destinationsFromTree, destinationAccepts, suggestDestination, suggestFolderKey, groupDestinations, cleanFolderName, uploadScopeFor, withNewFolder,
} from '@/lib/files/upload-destinations';
import type { MountTree } from '@/lib/files/mount-node';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

const J = '11111111-1111-4111-8111-111111111111';
const J2 = '22222222-2222-4222-8222-222222222222';
const P = '33333333-3333-4333-8333-333333333333';
const F1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const F2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const F3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// ── 1. the vocabulary ────────────────────────────────────────────────────────────────────────────

describe('named folder ids', () => {
  it('round-trip, keeping the same segment count as a standard folder', () => {
    const seg = namedFolderSegment('photos', F1);
    expect(seg).toBe(`photos.${F1}`);
    expect(parseNamedFolderSegment(seg)).toEqual({ root: 'photos', folderId: F1 });
    expect(parseNamedFolderId(`mnt:jobs:${J}:${seg}`)).toEqual({ jobId: J, root: 'photos', folderId: F1 });
    expect(parseNamedFolderId(`mnt:projects:${P}:${J}:top.${F1}`)).toEqual({ jobId: J, root: 'top', folderId: F1 });
  });

  it('are never mistaken for standard folders, and standard folders never for them', () => {
    expect(parseJobFolderId(`mnt:jobs:${J}:photos.${F1}`)).toBeNull();
    expect(parseNamedFolderId(`mnt:jobs:${J}:photos`)).toBeNull();
    expect(parseNamedFolderSegment(`receipts.${F1}`), 'Receipts takes no uploads, so no folders').toBeNull();
    expect(parseNamedFolderSegment('photos.not-a-uuid')).toBeNull();
    expect(parseNamedFolderId(`mnt:jobs:${J}:photos.${F1}:extra`)).toBeNull();
  });

  it('a job node parses under both mounts; project documents is not a job', () => {
    expect(parseJobNodeId(`mnt:jobs:${J}`)).toEqual({ jobId: J, projectId: null });
    expect(parseJobNodeId(`mnt:projects:${P}:${J}`)).toEqual({ jobId: J, projectId: P });
    expect(parseJobNodeId(`mnt:projects:${P}:docs`)).toBeNull();
    expect(parseJobNodeId(`mnt:jobs:${J}:photos`)).toBeNull();
  });

  it('roots are the upload-taking standard folders; a nested folder inherits its top ancestor\'s', () => {
    expect([...NAMED_FOLDER_ROOTS]).toEqual(['research', 'cad', 'photos', 'videos', 'documents']);
    const roots = namedFolderRoots([
      { id: F1, name: 'Corners', parent_key: 'photos', parent_id: null },
      { id: F2, name: 'NE', parent_key: null, parent_id: F1 },
      { id: F3, name: 'Letters', parent_key: null, parent_id: null },
    ]);
    expect(roots.get(F1)).toBe('photos');
    expect(roots.get(F2)).toBe('photos');
    expect(roots.get(F3)).toBe('top');
  });

  it('a loop in bad data resolves instead of hanging', () => {
    const roots = namedFolderRoots([
      { id: F1, name: 'a', parent_key: null, parent_id: F2 },
      { id: F2, name: 'b', parent_key: null, parent_id: F1 },
    ]);
    expect(roots.get(F1)).toBe('top');
  });

  it('an upload into a folder files under its root\'s section; the top level is general', () => {
    expect(uploadSpecForRoot('photos')).toMatchObject({ section: 'photos', fileType: 'photo' });
    expect(uploadSpecForRoot('cad')).toMatchObject({ section: 'drawing' });
    expect(uploadSpecForRoot('top')).toEqual({ section: 'general', fileType: null, accept: null });
  });

  it('folder names: trimmed, required, short, and free of path characters', () => {
    expect(checkFolderName('  Boundary   letters ')).toEqual({ ok: true, value: 'Boundary letters' });
    expect(checkFolderName('').ok).toBe(false);
    expect(checkFolderName('a/b').ok).toBe(false);
    expect(checkFolderName('x'.repeat(81)).ok).toBe(false);
    expect(checkFolderName('..').ok).toBe(false);
  });
});

// ── 2. the dropdown ──────────────────────────────────────────────────────────────────────────────

const jobTree = (folders: MountTree['folders']): MountTree => ({
  root: { id: `mnt:jobs:${J}`, name: '24-103 — Smith' },
  breadcrumb: [],
  folders,
  total_files: 0,
  truncated: false,
});
const folder = (id: string, name: string, parent: string | null, depth: number, extra: Record<string, string> = {}) =>
  ({ id, name, parent_id: parent, depth, path: [], files: [], ...extra });

describe('the destinations a file can be uploaded into', () => {
  const root = `mnt:jobs:${J}`;
  const tree = jobTree([
    folder(root, '24-103 — Smith', null, 0),
    folder(`${root}:research`, 'Research (2)', root, 1, { folder_key: 'research' }),
    folder(`${root}:cad`, 'CAD (0)', root, 1, { folder_key: 'cad' }),
    folder(`${root}:photos`, 'Photos (4)', root, 1, { folder_key: 'photos' }),
    folder(`${root}:photos.${F1}`, 'Corners', `${root}:photos`, 2, { folder_key: 'named' }),
    folder(`${root}:photos.${F2}`, 'NE (1)', `${root}:photos.${F1}`, 3, { folder_key: 'named' }),
    folder(`${root}:videos`, 'Videos (0)', root, 1, { folder_key: 'videos' }),
    folder(`${root}:receipts`, 'Receipts (3)', root, 1, { folder_key: 'receipts' }),
    folder(`${root}:top.${F3}`, 'Boundary letters', root, 1, { folder_key: 'named' }),
  ]);
  const { destinations, parents } = destinationsFromTree(tree);

  it('are the standard folders that take uploads, every named folder, and Documents even while empty', () => {
    expect(destinations.map((d) => d.label)).toEqual([
      'Research', 'CAD', 'Photos', 'Photos › Corners', 'Photos › Corners › NE (1)', 'Videos', 'Documents', 'Boundary letters',
    ]);
    expect(destinations.some((d) => d.id.endsWith(':receipts')), 'Receipts is not an upload destination').toBe(false);
  });

  it('a named folder carries its uuid and files under its root\'s section', () => {
    const ne = destinations.find((d) => d.folderId === F2)!;
    expect(ne).toMatchObject({ section: 'photos', fileType: 'photo', only: 'image', depth: 2, owner: { kind: 'job', jobId: J } });
    const letters = destinations.find((d) => d.folderId === F3)!;
    expect(letters).toMatchObject({ section: 'general', only: null, depth: 0 });
  });

  it('a user-typed "(1)" is kept — only the listing\'s own count suffix on standard folders is cleaned', () => {
    expect(cleanFolderName('Photos (4)')).toBe('Photos');
    expect(destinations.find((d) => d.folderId === F2)!.label.endsWith('NE (1)')).toBe(true);
  });

  it('new folders can go at the top of the job, in any upload-taking standard folder, or in a named folder', () => {
    expect(parents[0]).toMatchObject({ label: 'Top level of the job', parent_key: null, parent_id: null, jobId: J });
    expect(parents.find((p) => p.label === 'Photos')).toMatchObject({ parent_key: 'photos', parent_id: null });
    expect(parents.find((p) => p.parent_id === F1)).toMatchObject({ parent_key: null, label: 'Photos › Corners' });
    expect(parents.find((p) => p.parent_key === 'documents'), 'Documents is offered as a parent while empty').toBeTruthy();
  });

  it('Photos takes images and Videos takes video; the rest take anything', () => {
    const photos = destinations.find((d) => d.label === 'Photos')!;
    const videos = destinations.find((d) => d.label === 'Videos')!;
    const research = destinations.find((d) => d.label === 'Research')!;
    expect(destinationAccepts(photos, { name: 'corner.JPG', type: '' })).toBe(true);
    expect(destinationAccepts(photos, { name: 'deed.pdf', type: 'application/pdf' })).toBe(false);
    expect(destinationAccepts(videos, { name: 'walk.mov', type: 'video/quicktime' })).toBe(true);
    expect(destinationAccepts(research, { name: 'deed.pdf', type: 'application/pdf' })).toBe(true);
  });

  it('suggests — never chooses — a folder from what the file is', () => {
    expect(suggestFolderKey({ name: 'IMG_0001.HEIC' })).toBe('photos');
    expect(suggestFolderKey({ name: 'clip.mp4' })).toBe('videos');
    expect(suggestFolderKey({ name: 'boundary.dwg' })).toBe('cad');
    expect(suggestFolderKey({ name: 'contract.pdf' })).toBe('documents');
    expect(suggestDestination(destinations, { name: 'a.png', type: 'image/png' })?.label).toBe('Photos');
    expect(suggestDestination(destinations, { name: 'contract.pdf' })?.label).toBe('Documents');
  });

  it('on a project, destinations group by job — and no job is guessed', () => {
    const proj = `mnt:projects:${P}`;
    const t: MountTree = {
      root: { id: proj, name: 'P-2026-0001 — Smith tract' }, breadcrumb: [], total_files: 0, truncated: false,
      folders: [
        folder(proj, 'P-2026-0001 — Smith tract', null, 0),
        folder(`${proj}:docs`, 'Project documents (0)', proj, 1, { folder_key: 'docs' }),
        folder(`${proj}:${J}`, '24-103 — Boundary', proj, 1, { folder_key: 'job' }),
        folder(`${proj}:${J}:photos`, 'Photos (0)', `${proj}:${J}`, 2, { folder_key: 'photos' }),
        folder(`${proj}:${J2}`, '24-104 — Topo', proj, 1, { folder_key: 'job' }),
        folder(`${proj}:${J2}:cad`, 'CAD (0)', `${proj}:${J2}`, 2, { folder_key: 'cad' }),
      ],
    };
    const { destinations: d } = destinationsFromTree(t);
    expect(d[0]).toMatchObject({ label: 'Project documents', owner: { kind: 'project', projectId: P }, section: 'project' });
    const groups = groupDestinations(d);
    expect(groups.map((g) => g.group)).toEqual(['P-2026-0001 — Smith tract', '24-103 — Boundary', '24-104 — Topo']);
    expect(groups[1].items.map((x) => x.label)).toEqual(['Photos', 'Documents']);
    expect(suggestDestination(d, { name: 'a.png', type: 'image/png' }), 'which job is a guess').toBeNull();
  });

  it('no tree, nothing offered', () => {
    expect(destinationsFromTree(null)).toEqual({ destinations: [], parents: [] });
  });
});

// ── 3. the listing, through the real mount code ──────────────────────────────────────────────────

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

function fakeQuery(table: string) {
  let rows = [...(db[table] ?? [])];
  let single = false;
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
    neq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] !== v); return q; },
    is: (c: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) === v); return q; },
    in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
    not: (c: string, _op: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) !== v); return q; },
    order: () => q,
    limit: () => q,
    maybeSingle: () => { single = true; return q; },
    then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve),
  };
  return q;
}

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: (t: string) => fakeQuery(t) } }));

describe('named folders in the job listing (lib/files/mounts.ts on a fake database)', () => {
  const admin = { email: 'owner@example.com', roles: ['admin'] };
  const file = (id: string, extra: Row) => ({
    id, job_id: J, project_id: null, file_name: `${id}.bin`, name: `${id}.bin`, storage_path: `x/${id}`, is_deleted: false,
    is_backup: false, uploaded_at: '2026-09-15T00:00:00Z', section: 'general', file_type: 'other', folder_id: null, ...extra,
  });

  beforeEach(() => {
    db.jobs = [{ id: J, job_number: '24-103', name: 'Smith', deleted_at: null }];
    db.job_file_folders = [
      { id: F1, job_id: J, name: 'Corners', parent_key: 'photos', parent_id: null, deleted_at: null },
      { id: F2, job_id: J, name: 'NE', parent_key: 'photos', parent_id: F1, deleted_at: null },
      { id: F3, job_id: J, name: 'Boundary letters', parent_key: null, parent_id: null, deleted_at: null },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', job_id: J, name: 'Gone', parent_key: null, parent_id: null, deleted_at: '2026-09-01' },
    ];
    db.job_files = [
      file('plain-photo', { section: 'photos', file_type: 'photo', file_name: 'a.jpg' }),
      file('in-corners', { section: 'photos', file_type: 'photo', folder_id: F1 }),
      file('in-ne', { section: 'photos', file_type: 'photo', folder_id: F2 }),
      file('letter', { section: 'general', folder_id: F3 }),
      file('orphaned', { section: 'photos', file_type: 'photo', folder_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }),
    ];
    for (const t of ['research_project_jobs', 'research_projects', 'research_documents', 'cad_drawings', 'field_media', 'receipts']) db[t] = [];
  });

  it('the job\'s top level lists its named top-level folder beside the standard ones', async () => {
    const { listMount } = await import('@/lib/files/mounts');
    const res = await listMount(`mnt:jobs:${J}`, admin, true);
    expect(res.ok).toBe(true);
    const names = res.nodes!.map((n) => n.name);
    expect(names).toContain('Boundary letters');
    expect(names).not.toContain('Gone');
    expect(res.nodes!.find((n) => n.name === 'Boundary letters')!.id).toBe(`mnt:jobs:${J}:top.${F3}`);
  });

  it('Photos lists its named folder and only the files filed straight in it (plus orphans of a lost folder)', async () => {
    const { listMount } = await import('@/lib/files/mounts');
    const res = await listMount(`mnt:jobs:${J}:photos`, admin, true);
    const ids = res.nodes!.map((n) => n.id);
    expect(ids).toContain(`mnt:jobs:${J}:photos.${F1}`);
    expect(ids).toContain('mnt:job-files:plain-photo');
    expect(ids, 'a file whose folder is gone falls back to its standard folder').toContain('mnt:job-files:orphaned');
    expect(ids).not.toContain('mnt:job-files:in-corners');
    expect(ids, 'NE is inside Corners, not beside it').not.toContain(`mnt:jobs:${J}:photos.${F2}`);
  });

  it('a named folder lists its subfolder and its files, with a breadcrumb through its standard folder', async () => {
    const { listMount } = await import('@/lib/files/mounts');
    const res = await listMount(`mnt:jobs:${J}:photos.${F1}`, admin, true);
    expect(res.ok).toBe(true);
    expect(res.nodes!.map((n) => n.id)).toEqual([`mnt:jobs:${J}:photos.${F2}`, 'mnt:job-files:in-corners']);
    expect(res.trail!.map((t) => t.name)).toEqual(['Jobs', '24-103 — Smith', 'Photos', 'Corners']);
    const deep = await listMount(`mnt:jobs:${J}:photos.${F2}`, admin, true);
    expect(deep.trail!.map((t) => t.name)).toEqual(['Jobs', '24-103 — Smith', 'Photos', 'Corners', 'NE']);
  });

  it('an id naming the wrong root 404s rather than rendering under the wrong breadcrumb', async () => {
    const { listMount } = await import('@/lib/files/mounts');
    expect((await listMount(`mnt:jobs:${J}:cad.${F1}`, admin, true)).status).toBe(404);
  });

  it('the tree walks named folders depth-first, right after their parents, and counts every file once', async () => {
    const { listMountTree } = await import('@/lib/files/mounts');
    const res = await listMountTree(`mnt:jobs:${J}`, admin, true);
    const ids = res.tree!.folders.map((f) => f.id);
    const at = (id: string) => ids.indexOf(id);
    expect(at(`mnt:jobs:${J}:photos.${F1}`)).toBe(at(`mnt:jobs:${J}:photos`) + 1);
    expect(at(`mnt:jobs:${J}:photos.${F2}`)).toBe(at(`mnt:jobs:${J}:photos.${F1}`) + 1);
    expect(at(`mnt:jobs:${J}:top.${F3}`)).toBe(ids.length - 1);
    expect(res.tree!.total_files).toBe(5);
    const dests = destinationsFromTree(res.tree!).destinations.map((d) => d.label);
    expect(dests).toEqual(expect.arrayContaining(['Photos › Corners', 'Photos › Corners › NE', 'Boundary letters']));
  });
});

// ── 4. the writes ────────────────────────────────────────────────────────────────────────────────

describe('seed 639', () => {
  const sql = read('seeds/639_job_file_folders.sql');
  it('makes the folders table and the folder_id link, idempotently and server-only', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.job_file_folders');
    expect(sql).toContain('ALTER TABLE public.job_files ADD COLUMN IF NOT EXISTS folder_id uuid');
    expect(sql).toContain('REFERENCES public.job_file_folders(id) ON DELETE SET NULL');
    expect(sql).toContain('ALTER TABLE public.job_file_folders ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_job_file_folders_sibling_name/);
  });
});

describe('the folder routes', () => {
  const create = stripJs(read('app/api/admin/jobs/folders/route.ts'));
  const one = stripJs(read('app/api/admin/jobs/folders/[id]/route.ts'));

  it('create: signed in, a real job, a checked name, a parent in the same job, and a duplicate returns the folder', () => {
    expect(create).toContain("if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })");
    expect(create).toContain('checkFolderName(body.name)');
    expect(create).toContain("parent.job_id !== jobId");
    expect(create).toContain('if (same) return NextResponse.json({ folder: same, existed: true })');
    expect(create).toContain("action_type: 'job_folder_created'");
  });

  it('delete never deletes files: they move up to the folder\'s parent BEFORE the folders go', () => {
    const moveAt = one.indexOf(".update({ folder_id: folder.parent_id })");
    const delAt = one.indexOf('.update({ deleted_at: now, updated_at: now })');
    expect(moveAt).toBeGreaterThan(-1);
    expect(delAt).toBeGreaterThan(moveAt);
    expect(one, 'a hard delete of files crept in').not.toMatch(/from\('job_files'\)[\s\S]{0,80}\.delete\(/);
  });

  it('rename refuses a name already beside it', () => {
    expect(one).toContain('status: 409');
  });
});

describe('folder_id on every write that files a job file', () => {
  it('upload, PATCH and send all check it belongs to the job through one helper', () => {
    expect(read('lib/files/job-folders-server.ts')).toContain("data.job_id !== jobId");
    expect(stripJs(read('app/api/admin/jobs/files/route.ts'))).toContain('await checkJobFolderId(folder_id, job_id)');
    expect(stripJs(read('app/api/admin/jobs/files/[id]/route.ts'))).toContain('await checkJobFolderId(body.folder_id, existing.job_id)');
    expect(stripJs(read('app/api/admin/jobs/files/[id]/send/route.ts'))).toContain('await checkJobFolderId(body.folder_id, jobId)');
  });

  it('a move to another job without a folder clears the old job\'s folder', () => {
    expect(stripJs(read('app/api/admin/jobs/files/[id]/send/route.ts'))).toContain('folder_id: folder.folderId,');
  });

  it('the viewer\'s Move sends a named folder, and clears it for a standard one', () => {
    const adapter = stripJs(read('lib/files/adapters/mount.ts'));
    expect(adapter).toContain('folder_id: nf.folderId');
    expect(adapter).toContain('{ section: t.section, folder_id: t.folder_id');
    expect(adapter).toContain('parseNamedFolderId(folder.id) || parseProjectDocsId(folder.id)');
  });
});

describe('background hand-off cannot hang', () => {
  it('asks for a registration instead of waiting on serviceWorker.ready, which never settles without one', () => {
    const code = stripJs(read('lib/jobs/upload-background.ts'));
    expect(code).not.toContain('navigator.serviceWorker.ready');
    expect(code).toContain('await navigator.serviceWorker.getRegistration()');
    expect(code).toContain('if (!reg?.active) return false;');
  });
});

// ── 5. the wiring ────────────────────────────────────────────────────────────────────────────────

describe('the Upload files pop-up', () => {
  const src = read('app/admin/components/files/UploadFilesDialog.tsx');
  const code = stripJs(src);

  it('drop anywhere, or choose files from the computer', () => {
    expect(code).toContain('onDrop={onDrop}');
    expect(src).toContain('<input ref={inputRef} type="file" multiple hidden');
    expect(src).toContain('Choose files…');
    expect(src).toContain('Drag and drop files here');
  });

  it('every file has its own required folder dropdown, built from the job\'s real tree', () => {
    expect(code).toContain('/api/admin/files/tree?node=${encodeURIComponent(scope)}');
    expect(code).toContain('destinationsFromTree(tree)');
    expect(src).toContain('aria-label={`Folder for ${item.file.name}`}');
    expect(code).toContain('const canUpload = !uploading && ready.length > 0 && needFolder.length === 0 && !draft;');
    expect(src).toContain('Choose a folder for {needFolder.length} file');
  });

  it('"New folder…" creates a folder and puts the file in it', () => {
    expect(src).toContain('＋ New folder…');
    expect(code).toContain("fetch('/api/admin/jobs/folders', {");
    expect(code).toContain('withNewFolder(tree, parent, { id: createdRow.id');
  });

  it('uploads the bytes and files the row into the chosen folder', () => {
    expect(code).toContain('uploadJobFileBytes(dest.owner.jobId, item.file, onProgress)');
    expect(code).toContain('...(dest.folderId ? { folder_id: dest.folderId } : {})');
    expect(code).toContain('section: dest.section');
    expect(src).toContain('role="progressbar"');
  });

  it('keeps what the old upload could do: cut an over-cap video, and hand off to the background where that really works', () => {
    expect(code).toContain('async function runSplit(item: Item)');
    expect(code).toContain("support.mode === 'background'");
    expect(code).toContain('startBackgroundUpload({');
  });

  it('every class it renders is styled', () => {
    const css = read('app/admin/components/files/UploadFilesDialog.css');
    const classes = new Set<string>();
    for (const m of src.matchAll(/className=\{?[`"']([^`"'}]+)/g)) {
      for (const part of m[1].split(/[\s${}?:'"]+/)) if (part.startsWith('ufd')) classes.add(part.replace(/--.*$/, ''));
    }
    expect(classes.size).toBeGreaterThan(20);
    for (const cls of classes) expect(css, `.${cls} is rendered but never styled`).toContain(`.${cls}`);
  });
});

describe('the callers open it', () => {
  it('the FolderExplorer: a big Upload files bar, drops anywhere, New folder, rename and remove', () => {
    const src = read('app/admin/components/files/FolderExplorer.tsx');
    const code = stripJs(src);
    expect(src).toContain("import UploadFilesDialog from './UploadFilesDialog'");
    expect(code).toContain('<UploadFilesDialog');
    expect(src).toContain('data-testid="fe-upload-bar"');
    expect(src).toContain('data-testid="fe-upload"');
    expect(code).toContain('openUpload(Array.from(e.dataTransfer.files))');
    expect(src).toContain('data-testid="fe-new-folder"');
    expect(code).toContain('`/api/admin/jobs/folders/${namedHere.folderId}`, { method: \'DELETE\' }');
    expect(code, 'a native confirm() blocks the page').not.toContain('window.confirm(');
  });

  it('the job page: Upload files first in the header, and the quick actions open it', () => {
    const src = read('app/admin/jobs/[id]/page.tsx');
    const code = stripJs(src);
    expect(src).toContain("import UploadFilesDialog from '../../components/files/UploadFilesDialog'");
    expect(code).toMatch(/<UploadFilesDialog[\s\S]{0,200}rootId=\{`mnt:jobs:\$\{jobId\}`\}/);
    const header = code.indexOf('data-testid="job-upload-files"');
    expect(header).toBeGreaterThan(-1);
    expect(header, 'Upload files comes before Files & photos').toBeLessThan(code.indexOf('data-testid="job-files-quick"'));
    expect(code).toContain("setUpload({ open: true, folder: `mnt:jobs:${jobId}:photos` })");
    expect(read('app/admin/styles/AdminJobs.css')).toContain('.job-detail__uploadbtn {');
  });
});

// ── 6. the site-wide Files page (owner, 2026-09-15) ──────────────────────────────────────────────
// "Please make sure it is built and surfaced and available from the default main files page inside
//  of a job, project, or just the website as a whole. Then the user can specifically choose a folder
//  in the current scope for where they want to save it."

describe('the scope the pop-up opens on from a folder on the Files page', () => {
  it('Home and the read-only sources: no scope — the person picks one under "Save into"', () => {
    expect(uploadScopeFor(null)).toEqual({ rootId: null, destinationId: null });
    expect(uploadScopeFor('mnt:receipts')).toEqual({ rootId: null, destinationId: null });
    expect(uploadScopeFor('mnt:research')).toEqual({ rootId: null, destinationId: null });
  });

  it('inside a job: the job, with the folder pre-chosen once one is open', () => {
    expect(uploadScopeFor(`mnt:jobs:${J}`)).toEqual({ rootId: `mnt:jobs:${J}`, destinationId: null });
    expect(uploadScopeFor(`mnt:jobs:${J}:photos.${F1}`)).toEqual({ rootId: `mnt:jobs:${J}`, destinationId: `mnt:jobs:${J}:photos.${F1}` });
    expect(uploadScopeFor(`mnt:projects:${P}:${J}:cad`)).toEqual({ rootId: `mnt:projects:${P}:${J}`, destinationId: `mnt:projects:${P}:${J}:cad` });
  });

  it('inside a project: the project (all its jobs), with Project documents pre-chosen there', () => {
    expect(uploadScopeFor(`mnt:projects:${P}`)).toEqual({ rootId: `mnt:projects:${P}`, destinationId: null });
    expect(uploadScopeFor(`mnt:projects:${P}:docs`)).toEqual({ rootId: `mnt:projects:${P}`, destinationId: `mnt:projects:${P}:docs` });
  });

  it('a File Explorer folder: itself (the pop-up widens it to My files / Shared files)', () => {
    expect(uploadScopeFor(F1)).toEqual({ rootId: F1, destinationId: F1 });
  });
});

describe('File Explorer folders as destinations', () => {
  const tree: MountTree = {
    root: { id: F1, name: 'Jacob' }, breadcrumb: [], total_files: 0, truncated: false,
    folders: [
      { id: F1, name: 'Jacob', parent_id: null, depth: 0, path: [], files: [], access: 'manage' },
      { id: F2, name: 'Deeds', parent_id: F1, depth: 1, path: ['Deeds'], files: [], access: 'edit' },
      { id: F3, name: 'Read only', parent_id: F1, depth: 1, path: ['Read only'], files: [], access: 'view' },
    ],
  };
  const { destinations, parents } = destinationsFromTree(tree);

  it('are the folders the caller can write to, uploaded through the explorer, with paths', () => {
    expect(destinations.map((d) => d.label)).toEqual(['Jacob', 'Jacob › Deeds']);
    expect(destinations[1]).toMatchObject({ owner: { kind: 'explorer', parentId: F2 }, only: null, folderId: null });
  });

  it('new folders are made in them through the explorer, not as job folders', () => {
    expect(parents.map((p) => p.explorerParentId)).toEqual([F1, F2]);
    expect(parents.every((p) => p.jobId === null)).toBe(true);
  });

  it('the tree route says each explorer folder\'s access, so the dropdown can tell', () => {
    const route = stripJs(read('app/api/admin/files/tree/route.ts'));
    expect(route).toContain('rootList.parentAccess');
    expect(route).toContain('depth + 1, id, undefined, f.access');
  });
});

describe('the pop-up on the Files page', () => {
  const dialog = stripJs(read('app/admin/components/files/UploadFilesDialog.tsx'));
  const page = read('app/admin/files/page.tsx');
  const pageCode = stripJs(page);

  it('"Save into": My files, Shared files and every project, and the folders follow the choice', () => {
    expect(dialog).toContain("label: 'My files'");
    expect(dialog).toContain("'Shared files'");
    expect(dialog).toContain("list('mnt:projects')");
    expect(dialog).toContain('function changeScope(next: string)');
    expect(read('app/admin/components/files/UploadFilesDialog.tsx')).toContain('data-testid="ufd-scope-select"');
  });

  it('uploads into an explorer folder through the explorer\'s own sign → PUT → complete', () => {
    expect(dialog).toContain("fetch('/api/admin/files/upload', {");
    expect(dialog).toContain('await putWithProgress(signed_url, item.file, onProgress)');
    expect(dialog).toContain("fetch('/api/admin/files/upload/complete', {");
  });

  it('the Files page opens it from a big Upload files button and from any drop, on the current scope', () => {
    expect(page).toContain("import UploadFilesDialog from '@/app/admin/components/files/UploadFilesDialog'");
    expect(page).toContain('data-testid="fx-upload"');
    expect(pageCode).toMatch(/<UploadFilesDialog[\s\S]{0,300}rootId=\{uploadScope\.rootId\}[\s\S]{0,40}allowScopeChange/);
    expect(pageCode).toContain('openUpload(Array.from(files))');
    expect(pageCode).toContain('initialDestinationId={uploadScope.destinationId}');
    expect(pageCode, 'the old inline upload is back').not.toMatch(/function startUpload|const startUpload|data-testid="fx-upload-input"/);
  });
});

describe('the project page: Upload files first in the header', () => {
  it('opens the pop-up on the project (its documents and every job\'s folders) and refreshes the files after', () => {
    const src = read('app/admin/projects/[id]/page.tsx');
    const code = stripJs(src);
    expect(src).toContain("import UploadFilesDialog from '../../components/files/UploadFilesDialog'");
    expect(code).toMatch(/<UploadFilesDialog[\s\S]{0,200}rootId=\{`mnt:projects:\$\{project\.id\}`\}/);
    const header = code.indexOf('data-testid="project-upload-files"');
    expect(header).toBeGreaterThan(-1);
    expect(header, 'Upload files comes before New job').toBeLessThan(code.indexOf('data-testid="project-new-job"'));
    expect(code).toContain('refreshKey={filesRefresh}');
    expect(read('app/admin/styles/AdminProjects.css')).toContain('.proj-page__btn--upload {');
  });
});

describe('a new folder appears at once, under the id the listing will give it', () => {
  const root = `mnt:jobs:${J}`;
  const t = jobTree([
    folder(root, '24-103 — Smith', null, 0),
    folder(`${root}:photos`, 'Photos (1)', root, 1, { folder_key: 'photos' }),
    folder(`${root}:photos.${F1}`, 'Corners', `${root}:photos`, 2, { folder_key: 'named' }),
    folder(`${root}:videos`, 'Videos (0)', root, 1, { folder_key: 'videos' }),
  ]);
  const { parents } = destinationsFromTree(t);

  it('inside a standard folder: <job>:<root>.<uuid>, placed after the parent subtree', () => {
    const photos = parents.find((p) => p.parent_key === 'photos')!;
    const { tree, folderId } = withNewFolder(t, photos, { id: F2, name: 'Monuments' });
    expect(folderId).toBe(`${root}:photos.${F2}`);
    expect(tree.folders.map((f) => f.id).indexOf(folderId)).toBe(3);
    const d = destinationsFromTree(tree).destinations.find((x) => x.id === folderId)!;
    expect(d).toMatchObject({ label: 'Photos › Monuments', folderId: F2, section: 'photos', only: 'image' });
  });

  it('inside a named folder it keeps the root; at the top it is top', () => {
    const corners = parents.find((p) => p.parent_id === F1)!;
    expect(withNewFolder(t, corners, { id: F3, name: 'NE' }).folderId).toBe(`${root}:photos.${F3}`);
    const top = parents.find((p) => p.label === 'Top level of the job')!;
    expect(withNewFolder(t, top, { id: F3, name: 'Letters' }).folderId).toBe(`${root}:top.${F3}`);
  });

  it('a File Explorer folder is its node id, writable', () => {
    const et: MountTree = { root: { id: F1, name: 'Mine' }, breadcrumb: [], total_files: 0, truncated: false,
      folders: [{ id: F1, name: 'Mine', parent_id: null, depth: 0, path: [], files: [], access: 'manage' }] };
    const p = destinationsFromTree(et).parents[0];
    const { tree, folderId } = withNewFolder(et, p, { id: F2, name: 'Deeds' });
    expect(folderId).toBe(F2);
    expect(destinationsFromTree(tree).destinations.map((d) => d.label)).toEqual(['Mine', 'Mine › Deeds']);
  });
});
