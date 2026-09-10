/**
 * ONE file explorer pop-up (owner, 2026-09-10).
 *
 * "Instead of the 'Choose a destination…' menu, there will just be a SEND TO button that when
 * clicked will open up the file explorer and they can then choose a folder to send the
 * file/image/document to. They can then choose to copy it there or move it there … a single
 * uniform website-wide version of the file explorer."
 *
 * FileExplorerDialog replaced FilePicker; the viewer's SEND TO, attach-from-Files and the
 * explorer's Move all open it. Which folders qualify is each adapter's `canSendTo`. Source-text
 * pins, checking the callers.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

const DIALOG = 'app/admin/components/files/FileExplorerDialog.tsx';

describe('the pop-up is a file explorer, not a list', () => {
  const src = read(DIALOG);
  const code = stripJs(src);

  it('control: it exists, is substantial, and carries its own stylesheet', () => {
    expect(src).toContain('export default function FileExplorerDialog');
    expect(src.length).toBeGreaterThan(12000);
    expect(src).toContain("import './FileExplorerDialog.css'");
  });

  it('places on the left, the folder on the right, a breadcrumb, search, four views', () => {
    expect(src).toContain('aria-label="Places"');
    expect(src).toContain('aria-label="Folder contents"');
    expect(src).toContain('aria-label="Folder path"');
    expect(code).toContain("fetch(`/api/admin/files/search?q=${encodeURIComponent(term)}`)");
    for (const v of ['large', 'small', 'list', 'details']) expect(code, `no ${v} view`).toContain(`chooseView('${v}')`);
    expect(code).toContain("localStorage.setItem(VIEW_KEY, v)");
  });

  it('previews: image thumbnails in the large view, a few at a time', () => {
    expect(code).toContain("fileKind(n.name, n.mime_type) === 'image'");
    expect(code).toContain('/api/admin/files/${id}/download?inline=1');
    expect(code).toContain('<img src={thumb}');
  });

  it('reads the same tree the explorer page reads — permissions and mounts included', () => {
    expect(code).toContain("fetch(`/api/admin/files?parent=${encodeURIComponent(pid ?? 'root')}`)");
  });

  it('folder mode chooses a folder the caller allows, and the footer offers the caller\'s actions', () => {
    expect(code).toContain('if (canChoose) return canChoose(n);');
    expect(code).toContain("return n.node_type === 'folder' && !n.id.startsWith('mnt:') && rank(n.access) >= rank('edit');");
    expect(code).toContain('onPick({ id: n.id, name: n.name, trail, node: n }, actionKey);');
    expect(code).toContain('data-testid={`fxd-action-${a.key}`}');
  });

  it('every class it renders is styled', () => {
    const css = read('app/admin/components/files/FileExplorerDialog.css');
    const classes = new Set<string>();
    for (const m of src.matchAll(/className=\{?[`"']([^`"'}]+)/g)) {
      for (const part of m[1].split(/[\s${}?:'"]+/)) if (part.startsWith('fxd')) classes.add(part.replace(/--.*$/, ''));
    }
    expect(classes.size).toBeGreaterThan(20);
    for (const cls of classes) expect(css, `.${cls} is rendered but never styled`).toContain(`.${cls}`);
  });
});

describe('the viewer: ONE "Send to…" button that opens the pop-up', () => {
  const code = stripJs(read('app/admin/components/files/FileViewer.tsx'));
  it('no destination list, no select', () => {
    expect(code).not.toContain('capabilities.destinations');
    expect(code).not.toContain('Choose a destination');
    expect(code).not.toContain('<select className="fv-info__select"');
  });
  it('the button opens the dialog in folder mode with Copy here / Move here', () => {
    expect(code).toContain('data-testid="fv-send-to"');
    expect(code).toContain('<FileExplorerDialog');
    expect(code).toContain('mode="folder"');
    expect(code).toContain("{ key: 'copy', label: 'Copy here' }");
    expect(code).toContain("{ key: 'move', label: 'Move here', primary: true }");
    expect(code).toContain('capabilities.canSendTo({ id: n.id, name: n.name, access: n.access })');
  });
});

describe('the callers', () => {
  it('attach-from-Files and the explorer\'s Move open the same pop-up; the old picker is gone', () => {
    expect(read('app/admin/components/files/FolderExplorer.tsx')).toContain("import FileExplorerDialog from './FileExplorerDialog'");
    expect(read('app/admin/files/page.tsx')).toContain("import FileExplorerDialog from '@/app/admin/components/files/FileExplorerDialog'");
    expect(fs.existsSync(path.join(process.cwd(), 'app/admin/components/files/FilePicker.tsx'))).toBe(false);
    expect(read('app/admin/styles/AdminDialog.css')).not.toContain('.fp__row');
  });

  it('each adapter says which folders can receive its files', () => {
    expect(stripJs(read('lib/files/adapters/explorer.ts'))).toContain("canSendTo: (folder) => !isMountId(folder.id) && (folder.access === 'edit' || folder.access === 'manage')");
    expect(stripJs(read('lib/files/adapters/mount.ts'))).toContain('canSendTo: canReceiveJobFile');
    expect(stripJs(read('lib/files/adapters/research-document.ts'))).toContain('canSendTo: (folder) => /^mnt:research:[^:]+$/.test(folder.id)');
    expect(stripJs(read('lib/files/viewer-model.ts'))).toContain('canSendTo?: (folder: { id: string; name: string; access: string }) => boolean;');
    expect(stripJs(read('lib/files/viewer-model.ts'))).not.toContain('destinations?:');
  });

  it('a job file sent to a standard folder lands in that folder (the send route takes the section)', () => {
    const route = stripJs(read('app/api/admin/jobs/files/[id]/send/route.ts'));
    expect(route).toContain("section?: string | null; file_type?: string | null");
    expect(route).toContain('...(section ? { section } : {})');
    expect(route).toContain("section: section ?? row.section ?? 'general'");
    const mount = stripJs(read('lib/files/adapters/mount.ts'));
    expect(mount).toContain('function jobFileTarget(destination: Destination)');
    expect(mount).toContain('if (t.job_id && t.job_id === s.job_id) {');
  });

  it('Research Documents is a folder per research project, so a research document has a destination', () => {
    const mounts = stripJs(read('lib/files/mounts.ts'));
    expect(mounts).toContain("if (key === 'research') return listResearchMount(segments);");
    expect(mounts).toContain('async function listResearchMount(');
    expect(mounts).toContain(".from('research_projects')");
    expect(mounts).toContain(".eq('research_project_id', project.id)");
    expect(mounts).toContain("source: { table: 'research_documents', id: r.id, research_project_id: project.id }");
  });
});
