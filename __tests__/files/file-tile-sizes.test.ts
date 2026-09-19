// Preview tiles in the filing system, and the sizes you can put them at.
//
// Owner, 2026-09-19: "Please make sure that in our filing system for the jobs we have a way to
// choose different tiles sizes for each file preview so that we can see a thumbnail of each
// document/pdf/photo/video easily."
//
// A survey job's folder is mostly PDFs — deeds, plats, tax statements, field notes — and a list of
// identical document icons answers no question anybody has. Most of what follows is about the two
// things that make previews expensive rather than free: they cost the whole file to MAKE, and they
// cost a round trip each to SIGN.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { imageIsItsOwnThumb } from '@/lib/jobs/file-thumbnails';

const read = (p: string) => readFileSync(p, 'utf8');

const EXPLORER = 'app/admin/components/files/FolderExplorer.tsx';
const CSS = 'app/admin/components/files/FolderExplorer.css';
const HOOK = 'app/admin/components/files/useFileThumbnails.ts';
const ROUTE = 'app/api/admin/files/thumbnail/route.ts';
const TREE = 'app/api/admin/files/tree/route.ts';

describe('choosing a tile size', () => {
  const src = read(EXPLORER);
  const css = read(CSS);

  it('offers four sizes and keeps the list as the default', () => {
    expect(src).toContain("type View = 'list' | 'small' | 'medium' | 'large';");
    // The list is the only view that shows the size and the date, and changing what everybody's
    // Files tab looks like on upgrade is not a thing to do by fiat.
    expect(src).toContain("useState<View>('list')");
  });

  it('remembers the choice for the person, across every folder', () => {
    expect(src).toContain("const VIEW_KEY = 'fe-view';");
    expect(src).toContain('localStorage.setItem(VIEW_KEY, v)');
    // Read in an effect, never in the useState initialiser: this component renders on the server
    // too, and reading storage during the first render is a hydration mismatch.
    expect(src).toMatch(/useEffect\(\(\) => \{\s*try \{\s*const saved = localStorage\.getItem\(VIEW_KEY\)/);
  });

  it('survives a browser that refuses storage', () => {
    // A private window throws on access rather than returning null.
    const around = src.slice(src.indexOf('const VIEW_KEY'), src.indexOf('const [madeThumbs'));
    expect((around.match(/catch/g) ?? []).length, 'both the read and the write are guarded').toBeGreaterThanOrEqual(2);
  });

  it('one renderer decides what a size means, so both file lists agree', () => {
    expect(src).toContain('const renderFiles = (files: MountNode[]) =>');
    expect(src, 'the folder view goes through it').toContain('renderFiles(folderFiles)');
    expect(src, 'and so do the all-files groups').toContain('renderFiles(g.files)');
  });

  it('every size has a grid, and Large stops before it upscales', () => {
    for (const v of ['small', 'medium', 'large']) {
      expect(css, `${v} needs a column rule`).toContain(`.fe__grid--${v} { grid-template-columns:`);
    }
    // A stored preview is 400 px on its long edge (THUMB_MAX_PX). A tile wider than that is showing
    // a softer picture for more space, so Large is capped rather than "as big as it fits".
    expect(css).toContain('.fe__grid--large { grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); }');
  });

  it('a plat is shown whole, not cropped to fill the box', () => {
    // `cover` would crop away the corner somebody opened the folder to find.
    expect(css).toContain('.fe__card-img { width: 100%; height: 100%; object-fit: contain; display: block; }');
  });

  it('the tile actions stay reachable without a hover', () => {
    expect(css).toMatch(/@media \(hover: none\) \{\s*\.fe__card-actions \{ opacity: 1; \}/);
  });
});

describe('making the previews that are missing', () => {
  const hook = read(HOOK);
  const src = read(EXPLORER);

  it('generates nothing until a tile is on screen', () => {
    // Making a preview costs the WHOLE file: to draw a PDF's first page you download the PDF. A
    // folder of a thousand documents must not fetch a thousand files to fill a grid.
    expect(src).toContain('new IntersectionObserver');
    expect(src).toContain('requestThumbs(arrived.map(');
  });

  it('is switched off entirely in the list view', () => {
    expect(src).toContain("enabled: view !== 'list'");
  });

  it('fetches the signed URL when the turn comes, not when queued', () => {
    // A file scrolled past before a worker reaches it should cost nothing at all.
    const run = hook.slice(hook.indexOf('const run = useCallback'));
    expect(run.slice(0, 400)).toContain('await resolveRef.current(t.id)');
  });

  it('two at a time, and one attempt per file per session', () => {
    expect(hook).toContain('workersRef.current < THUMB_WORKERS');
    expect(hook).toContain('if (triedRef.current.has(t.id)) continue;');
  });

  it('records a failure so nobody retries it forever', () => {
    expect(hook).toContain("{ state: 'failed' }");
  });

  it('does not make a preview of a small photograph', () => {
    // It is already being shown as its own tile; a 40 KB copy of a 60 KB photo saves nobody
    // anything. Same threshold as the map panel, and it lives with the rest of the policy.
    expect(hook).toContain('imageIsItsOwnThumb(t.kind, t.sizeBytes)');
    expect(imageIsItsOwnThumb('image', 50 * 1024)).toBe(true);
    expect(imageIsItsOwnThumb('image', 9 * 1024 * 1024)).toBe(false);
  });

  it('never fetches a full-size original just to fill a tile', () => {
    // The mistake that made the map panel download a gigabyte to draw a contact sheet: an image is
    // used as its own tile ONLY when a signed URL is already to hand.
    expect(src).toContain('return urls[n.id] ?? null;');
  });
});

describe('storing a preview', () => {
  const route = read(ROUTE);

  it('writes to whichever table the node actually lives in', () => {
    expect(route).toContain("if (key === 'job-files' && rowId) return { table: 'job_files', rowId };");
    expect(route).toContain("if (!nodeId.startsWith(MOUNT_PREFIX)) return { table: 'file_nodes', rowId: nodeId };");
  });

  it('gates on being able to READ the file, not on being an admin', () => {
    // A preview is a picture of the file. Gating on `isAdmin` would let any admin overwrite the
    // preview of a document they cannot open, and would stop the field crew — who are the people
    // actually looking at these folders — ever generating one.
    expect(route).toContain('await accessForNode(nodeId, user, admin)');
    expect(route).toContain('await resolveMountFile(nodeId, user, admin)');
    expect(route).toContain('if (!canView(access)) {');
  });

  it('checks the posted picture in the tested module, not inline', () => {
    expect(route).toContain('decodeThumbDataUrl(body.data_url)');
  });

  it('never writes a preview into the video bucket', () => {
    // `starr-field-videos` has a video-only MIME allowlist and refuses every WebP poster written to
    // it — measured against live storage on 2026-09-17.
    expect(route).toContain('const bucket = JOB_FILES_BUCKET;');
  });

  it('keeps the two tables’ previews apart', () => {
    // A job file and an Explorer document that happen to share an id must not overwrite one
    // another's picture.
    expect(route).toContain("`thumbs/${where.table}/`");
  });

  it('tells a browser to stop asking about a source that cannot keep one', () => {
    // A receipt or a CAD drawing has no preview column. That is an answer, not a failure.
    expect(route).toContain("return NextResponse.json({ ok: true, thumb_state: 'unsupported' });");
  });
});

describe('serving the previews', () => {
  const tree = read(TREE);
  const signer = read('lib/files/thumb-urls.ts');

  it('signs a whole tree in one call per bucket', () => {
    // Two hundred previews signed one at a time is two hundred round trips before the page paints —
    // the same shape of problem that froze the map panel.
    expect(signer).toContain('createSignedUrls(list, THUMB_URL_SECONDS)');
    expect(signer, 'the plural; the singular in a loop is the bug').not.toContain('createSignedUrl(');
    expect(tree, 'the mount branch').toContain('await signTreeThumbs(result.tree);');
    expect(tree, 'and the file_nodes branch').toContain('await signTreeThumbs(tree);');
  });

  it('never sends the raw storage path to the browser', () => {
    expect(signer).toContain('delete n.thumb_ref;');
  });

  it('a folder still lists when its previews cannot be signed', () => {
    // A deleted object or a storage hiccup costs the pictures, not the folder.
    expect(signer).toContain('} catch {');
    expect(signer).toContain('?? null;');
  });

  it('a row marked ok with nothing behind it goes back to pending', () => {
    // Otherwise a lost object is a permanently empty square that nothing ever repairs.
    const mounts = read('lib/files/mounts.ts');
    expect(mounts).toContain("thumb_state: ref ? state : (state === 'ok' ? 'pending' : state)");
  });

  it('job files carry the previews the map panel already made', () => {
    // seeds/644 put these columns on job_files for the property map. The Explorer mounts the same
    // rows, so a job's PDFs have previews before anybody opens the Files tab.
    const mounts = read('lib/files/mounts.ts');
    expect((mounts.match(/thumb_path, thumb_bucket, thumb_state/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
