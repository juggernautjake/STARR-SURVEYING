/**
 * The standard project file structure (owner, 2026-09-10).
 *
 * "We will have the project folder … within the project folder, the individual job folders. Inside
 * of the individual job folders, we will have a research folder … a cad folder … a photos folder,
 * and a videos folder. … an option to 'view all files in this folder and its subfolders' …
 * Instead we will just have the project and job file explorer … a Job Projects folder that
 * contains all of the project folders."
 *
 * The vocabulary is lib/files/job-folders.ts (unit-tested here); the server lists it through
 * lib/files/mounts.ts; the FolderExplorer browses it on the job and project pages; the tree route
 * flattens it. The wiring pins check the CALLERS.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  JOB_FOLDERS, JOB_FOLDER_KEYS, jobFolder, isJobFolderKey, folderForJobFile, folderForFieldMedia,
  parseJobFolderId, parseProjectDocsId, detectJobFileType,
} from '@/lib/files/job-folders';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

const EXPLORER = 'app/admin/components/files/FolderExplorer.tsx';
const MOUNTS = 'lib/files/mounts.ts';
const JOBPAGE = 'app/admin/jobs/[id]/page.tsx';
const PROJECTPAGE = 'app/admin/projects/[id]/page.tsx';

// ── the vocabulary ───────────────────────────────────────────────────────────────────────────────

describe('the standard folders of a job', () => {
  it('are Research, CAD, Photos, Videos — always — with Documents and Receipts as catch-alls', () => {
    expect(JOB_FOLDER_KEYS).toEqual(['research', 'cad', 'photos', 'videos', 'documents', 'receipts']);
    expect(JOB_FOLDERS.filter((f) => f.standard).map((f) => f.key)).toEqual(['research', 'cad', 'photos', 'videos']);
  });

  it('each takes uploads into a section the job page always used, except Receipts', () => {
    expect(jobFolder('photos')?.uploadSection).toBe('photos');
    expect(jobFolder('videos')?.uploadSection).toBe('videos');
    expect(jobFolder('research')?.uploadSection).toBe('research');
    expect(jobFolder('cad')?.uploadSection).toBe('drawing');
    expect(jobFolder('documents')?.uploadSection).toBe('general');
    expect(jobFolder('receipts')?.uploadSection).toBeNull();
  });

  it('every folder explains itself in one line', () => {
    for (const f of JOB_FOLDERS) expect(f.blurb.length, `${f.key} has no blurb`).toBeGreaterThan(20);
  });

  it('isJobFolderKey is exact', () => {
    expect(isJobFolderKey('photos')).toBe(true);
    expect(isJobFolderKey('files')).toBe(false);
    expect(isJobFolderKey(null)).toBe(false);
  });
});

describe('folderForJobFile: where an existing row lands', () => {
  it('the section decides first — the job page\'s own split', () => {
    expect(folderForJobFile({ section: 'photos', file_type: 'document' })).toBe('photos');
    expect(folderForJobFile({ section: 'videos', file_type: 'other' })).toBe('videos');
    expect(folderForJobFile({ section: 'research', file_type: 'document' })).toBe('research');
    expect(folderForJobFile({ section: 'drawing', file_type: 'document' })).toBe('cad');
  });
  it('then the file type', () => {
    expect(folderForJobFile({ section: 'general', file_type: 'cad' })).toBe('cad');
    expect(folderForJobFile({ section: 'general', file_type: 'trimble' })).toBe('cad');
    expect(folderForJobFile({ section: 'general', file_type: 'field_data' })).toBe('cad');
    expect(folderForJobFile({ section: 'legal', file_type: 'deed' })).toBe('research');
    expect(folderForJobFile({ section: 'general', file_type: 'plat' })).toBe('research');
  });
  it('then the bytes — a photo is a photo wherever it was filed', () => {
    expect(folderForJobFile({ section: 'general', file_type: 'image' })).toBe('photos');
    expect(folderForJobFile({ section: 'general', file_type: 'other', mime_type: 'image/jpeg' })).toBe('photos');
    expect(folderForJobFile({ section: 'general', file_type: 'other', file_name: 'IMG_0001.HEIC' })).toBe('photos');
    expect(folderForJobFile({ section: 'general', file_type: 'other', file_name: 'walk.MOV' })).toBe('videos');
  });
  it('and everything else is a document', () => {
    expect(folderForJobFile({ section: 'general', file_type: 'document' })).toBe('documents');
    expect(folderForJobFile({ section: 'delivery', file_type: 'other', file_name: 'x.trv' })).toBe('documents');
    expect(folderForJobFile({})).toBe('documents');
  });
  it('field media: photo → Photos, video → Videos, voice → Documents', () => {
    expect(folderForFieldMedia('photo')).toBe('photos');
    expect(folderForFieldMedia('video')).toBe('videos');
    expect(folderForFieldMedia('voice')).toBe('documents');
  });
});

describe('folder ids under the Jobs and Job Projects mounts', () => {
  it('parse to the job and the folder, on both mounts', () => {
    expect(parseJobFolderId('mnt:jobs:J1:photos')).toEqual({ jobId: 'J1', folder: 'photos' });
    expect(parseJobFolderId('mnt:projects:P1:J1:cad')).toEqual({ jobId: 'J1', folder: 'cad' });
  });
  it('reject a job node, a bad slug, and the old kinds', () => {
    expect(parseJobFolderId('mnt:jobs:J1')).toBeNull();
    expect(parseJobFolderId('mnt:jobs:J1:files')).toBeNull();
    expect(parseJobFolderId('mnt:jobs:J1:drawings')).toBeNull();
    expect(parseJobFolderId('abc')).toBeNull();
  });
  it('the project-documents folder is its own thing', () => {
    expect(parseProjectDocsId('mnt:projects:P1:docs')).toEqual({ projectId: 'P1' });
    expect(parseProjectDocsId('mnt:projects:P1:J1:docs')).toBeNull();
    expect(parseJobFolderId('mnt:projects:P1:docs')).toBeNull();
  });
});

describe('detectJobFileType: the upload vocabulary the job page always used', () => {
  it('by extension', () => {
    expect(detectJobFileType('site.dwg')).toBe('cad');
    expect(detectJobFileType('points.jxl')).toBe('trimble');
    expect(detectJobFileType('deed.PDF')).toBe('document');
    expect(detectJobFileType('coords.csv')).toBe('field_data');
    expect(detectJobFileType('IMG_1.jpeg')).toBe('image');
    expect(detectJobFileType('walk.mov')).toBe('video');
    expect(detectJobFileType('memo.m4a')).toBe('voice_memo');
    expect(detectJobFileType('README')).toBe('other');
  });
});

// ── the server: the mounts ───────────────────────────────────────────────────────────────────────

describe('the mounts list the standard structure', () => {
  const src = stripJs(read(MOUNTS));

  it('the root folder is called Job Projects', () => {
    expect(src).toMatch(/key: 'projects', label: 'Job Projects'/);
    expect(src).toContain("const PROJECTS_LABEL = 'Job Projects';");
  });

  it('a job lists its folders from ONE listing, shared by the Jobs and Job Projects mounts', () => {
    expect(src).toContain('async function jobFolderListing(');
    expect(src).toContain('function jobFolderNodes(');
    expect(src).toContain('async function listJobLevels(');
    // both mounts delegate rather than each keeping a copy of the levels
    expect((src.match(/return listJobLevels\(job, jobNode, /g) ?? []).length).toBe(2);
  });

  it('the folders come from the shared vocabulary, not a second table', () => {
    expect(read(MOUNTS)).toContain("from './job-folders'");
    expect(src).toContain('JOB_FOLDERS.map((f) => [f.key, [] as MountNode[]])');
    expect(src).toContain('const key = folderForJobFile(r);');
    expect(src).toContain('folderForFieldMedia(r.media_type)');
    expect(src, 'the old per-table kinds are back').not.toContain('JOB_KINDS');
  });

  it('every mounted file carries the row behind it, so the viewer can edit it', () => {
    for (const table of ['job_files', 'research_documents', 'cad_drawings', 'field_media', 'receipts']) {
      expect(src, `${table} rows carry no source`).toContain(`source: { table: '${table}'`);
    }
    expect(src).toContain("source: { table: 'research_documents', id: r.id, research_project_id: r.research_project_id, job_id: jobId }");
  });

  it('research documents are the job\'s through both links', () => {
    expect(src).toContain(".from('research_project_jobs').select('research_project_id').eq('job_id', jobId)");
    expect(src).toContain(".from('research_projects').select('id').eq('job_id', jobId)");
    expect(src).toContain(".in('research_project_id', [...ids])");
  });

  it('project documents are always a folder beside the jobs, so there is somewhere to put the first one', () => {
    const at = src.indexOf("const seesDocs = canSeeKey('job-files', user, isAdmin);");
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf("if (jobId === 'docs') {", at));
    expect(block).toContain('nodes.unshift({');
    expect(block, 'the docs folder is hidden when empty').not.toMatch(/docs\.nodes\.length > 0\)\s*\{/);
  });

  it('the tree walks a job through one listing and stops at its caps', () => {
    expect(src).toContain('export async function listMountTree(');
    expect(src).toContain('const jobId = jobNodeOf(p.id);');
    expect(src).toContain('if (folders.length >= maxFolders) { truncated = true; return; }');
    expect(src).toContain('if (p.depth >= maxDepth) return;');
  });

  it('the tree endpoint refuses the whole file system and serves both kinds of folder', () => {
    const route = stripJs(read('app/api/admin/files/tree/route.ts'));
    expect(route).toContain("if (!rootId) return NextResponse.json({ error:");
    expect(route).toContain('listMountTree(rootId, user, admin');
    expect(route).toContain('listChildren(rootId, user, admin)');
    expect(route).toContain('const MAX_FOLDERS = 200;');
  });
});

// ── the client: the explorer, and the pages that mount it ───────────────────────────────────────

describe('the FolderExplorer', () => {
  const src = read(EXPLORER);
  const code = stripJs(src);

  it('control: the file is the explorer and is substantial', () => {
    expect(src).toContain('export default function FolderExplorer');
    expect(src.length).toBeGreaterThan(15000);
    expect(src).toContain("import './FolderExplorer.css'");
  });

  it('reads the tree once and navigates from it', () => {
    expect(code).toContain('/api/admin/files/tree?node=${encodeURIComponent(rootId)}');
    expect(code).toContain('const childFolders = useMemo(');
    expect(code).toContain('const subtreeOf = useCallback(');
  });

  it('offers "All files" — this folder and its subfolders, grouped, searchable', () => {
    expect(src).toContain('data-testid="fe-all-files"');
    expect(src).toContain('title="View all files in this folder and its subfolders"');
    expect(src).toContain('data-testid="fe-all-view"');
    expect(code).toContain("mode === 'all' ? groups.flatMap((g) => g.files) : folderFiles");
    expect(src).toContain("placeholder={mode === 'all' ? 'Search every file below…' : 'Search this folder…'}");
  });

  it('opens files in the ONE shared viewer, with the mount adapter\'s capabilities', () => {
    expect(src).toContain("import SharedFileViewer from './FileViewer'");
    expect(src).toContain("from '@/lib/files/adapters/mount'");
    expect(code).toContain('capabilities={viewerCapabilities}');
    expect(code).toContain('const viewerCapabilities = useMemo(() => mountCapabilities({');
  });

  it('uploads INTO a standard folder, through the folder\'s own section and type', () => {
    expect(code).toContain('function uploadTargetFor(');
    expect(code).toContain('section: spec.uploadSection, fileType: spec.uploadFileType');
    expect(code).toContain("file_type: target.fileType ?? detectJobFileType(file.name)");
    expect(src).toContain('data-testid="fe-upload"');
    expect(code).toContain('onDrop={target ?');
  });

  it('keeps what the retired panels could do: attach from Files, cut an over-cap video, background uploads', () => {
    expect(code).toContain('async function attachFromExplorer(');
    expect(code).toContain('async function runSplit()');
    expect(code).toContain("backgroundUploadSupport().mode === 'background'");
    expect(code).toContain('startBackgroundUpload({');
  });

  it('saves through the OS dialog and zips the folder — or the subtree with its paths', () => {
    expect(code).toContain('await downloadFile(entry.url, n.original_name ?? entry.name ?? n.name, entry.mime ?? n.mime_type)');
    expect(code).toContain('<DownloadAllButton');
    expect(code).toContain("g.folder.path.slice(current?.depth ?? 0).join('/')");
    expect(code, 'an anchor download is back').not.toMatch(/<a[^>]*\sdownload=/);
  });

  it('hands a page its panels under the right folder', () => {
    expect(code).toContain('const extra = extraKey ? folderExtras?.[extraKey] : null;');
    expect(code).toContain('{extra ? <div className="fe__extra">{extra}</div> : null}');
  });

  it('every class it renders is styled', () => {
    const css = read('app/admin/components/files/FolderExplorer.css');
    const classes = new Set<string>();
    for (const m of src.matchAll(/className=\{?[`"']([^`"'}]+)/g)) {
      for (const part of m[1].split(/[\s${}?:'"]+/)) if (part.startsWith('fe__') || part === 'fe') classes.add(part.replace(/--.*$/, ''));
    }
    for (const cls of classes) expect(css, `.${cls} is rendered but never styled`).toContain(`.${cls}`);
  });
});

describe('the job page: one Files tab instead of five bubbles', () => {
  const src = read(JOBPAGE);
  const code = stripJs(src);

  it('the tabs are Overview, Schedule, Files, Field Work, Financial, Activity, Messages', () => {
    const keys = [...code.matchAll(/\{ key: '([a-z]+)', label: '/g)].map((m) => m[1]);
    expect(keys).toEqual(['overview', 'schedule', 'files', 'fieldwork', 'financial', 'activity', 'messages']);
  });

  it('mounts the explorer on the job\'s own mount and reads the badge from it', () => {
    expect(code).toMatch(/<FolderExplorer[\s\S]{0,120}rootId=\{`mnt:jobs:\$\{jobId\}`\}/);
    expect(code).toContain('onTotalChange={setFilesTotal}');
    expect(code).toContain('...(filesTotal !== null ? { files: filesTotal } : {})');
  });

  it('the research records and the research start live under Research; New Drawing under CAD', () => {
    const at = code.indexOf('folderExtras={{');
    const extras = code.slice(at, code.indexOf('\n          />', at));
    expect(extras).toMatch(/research: \([\s\S]*?job-research-start[\s\S]*?<JobResearchPanel/);
    expect(extras).toMatch(/cad: \([\s\S]*?data-testid="job-new-drawing"/);
    expect(extras).toMatch(/root: \([\s\S]*?data-testid="job-all-files-link"/);
  });

  it('the old tab keys still land somewhere: the stage timeline and the quick actions go through openTab', () => {
    expect(code).toContain("if (tab === 'research' || tab === 'cad' || tab === 'photos' || tab === 'videos') {");
    expect(code).toContain('onOpen={openTab}');
    expect(code).toContain("onClick={() => openTab('research')}");
    expect(code).toContain("onClick={() => openTab('cad')}");
    expect(code).toContain("onClick={() => openTab('photos')}");
    expect(code, 'a quick action still targets a tab that no longer exists').not.toMatch(/setActiveTab\('(research|cad|photos|videos)'\)/);
  });

  it('the retired components are gone, and nothing imports them', () => {
    for (const p of [
      'app/admin/components/jobs/JobFileManager.tsx',
      'app/admin/components/jobs/JobPhotoGallery.tsx',
      'app/admin/components/jobs/JobCadPanel.tsx',
      'app/admin/components/projects/ProjectFilesPanel.tsx',
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), p)), `${p} is back`).toBe(false);
    }
    expect(src).not.toMatch(/JobFileManager|JobPhotoGallery|JobCadPanel/);
    expect(read(PROJECTPAGE)).not.toContain('ProjectFilesPanel');
  });
});

describe('the project page mounts the explorer on the project', () => {
  const code = stripJs(read(PROJECTPAGE));
  it('rooted at Job Projects / this project, full width under the jobs', () => {
    expect(code).toMatch(/<FolderExplorer[\s\S]{0,120}rootId=\{`mnt:projects:\$\{project\.id\}`\}/);
    expect(code).toContain('data-testid="project-files"');
  });
});

describe('the mount adapter routes each edit to the row behind the file', () => {
  const code = stripJs(read('lib/files/adapters/mount.ts'));
  it('job files: label / description / tags / section through the job-file PATCH; send; delete', () => {
    expect(code).toContain('/api/admin/jobs/files/${s.id}`, { label:');
    expect(code).toContain('{ description: notes.trim() || null }');
    expect(code).toContain('{ section: t.section');
    expect(code).toContain('/api/admin/jobs/files/${id}/send');
    expect(code).toContain('/api/admin/jobs/files?id=${encodeURIComponent(s.id)}`, { method: \'DELETE\' }');
  });
  it('research documents: label / notes / tags through their own PATCH', () => {
    expect(code).toContain('/api/admin/research/${s.research_project_id}/documents/${s.id}`, { document_label: newName }');
    expect(code).toContain('/api/admin/research/${s.research_project_id}/documents/${s.id}`, { notes }');
  });
  it('drawings, receipts and field media are read-only here, with a message that says where', () => {
    expect(code).toContain("throw new Error('This file is renamed where it lives");
    expect(code).toContain("throw new Error('Only job files can be moved from here.')");
  });
  it('a move within the job is a section edit; a folder the pop-up names resolves to a job + section', () => {
    // 2026-09-10: destinations come from the file explorer pop-up (mnt:… folder ids), not a list.
    expect(code).toContain('function jobFileTarget(destination: Destination)');
    expect(code).toContain('const canReceiveJobFile = (folder: { id: string }): boolean');
    expect(code).toContain('if (t.job_id && t.job_id === s.job_id) {');
  });
});
