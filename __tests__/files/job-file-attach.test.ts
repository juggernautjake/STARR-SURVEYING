// __tests__/files/job-file-attach.test.ts — F5 adoption: attach a File Explorer document to a job.
//
// The three things worth pinning, in order of how much damage each would do if it regressed:
//
//   1. **The permission boundary.** Attaching is a read of someone else's document if it is not
//      checked. A job page must never become a side door into the File Explorer, so the route resolves
//      the attacher's own effective access with the SAME helper `/api/admin/files/[id]/download` uses,
//      and requires `download` — not `view`.
//   2. **A link is not a copy.** No bytes are duplicated, and the auto-backup that exists for uploads
//      must not fire for a reference (it would produce a second row pointing at the same document,
//      which backs up nothing and shows the user two attachments where they made one).
//   3. **A dead link is labelled, not hidden.** `ON DELETE SET NULL` plus a permission change both
//      leave a row whose document cannot be resolved; dropping it would look like the attach never
//      happened.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** Source with comments stripped. Learned the hard way twice now: an assertion like "this block must
 *  not mention `is_deleted`" matches the COMMENT explaining why it must not, so the check fails on its
 *  own justification. Strip first, then assert on code. */
const src = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*(\/\/|--)[^\n]*$/gm, '');

/** Raw source, comments included — for the one assertion that is ABOUT the comments. */
const raw = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const ROUTE = 'app/api/admin/jobs/files/route.ts';
// 2026-09-10: the job page's file manager was retired for the FolderExplorer (the standard
// folders); the attach flow lives there now, and these guards followed it.
const MANAGER = 'app/admin/components/files/FolderExplorer.tsx';
const JOBPAGE = 'app/admin/jobs/[id]/page.tsx';
const SEED = 'seeds/583_job_files_file_node_link.sql';

describe('F5 — the permission boundary on attach', () => {
  it('resolves the attacher’s own access rather than trusting the client', () => {
    const s = src(ROUTE);
    expect(s, 'the route must resolve access server-side').toMatch(/accessForNode\(\s*file_node_id/);
    expect(s, 'roles must come from the session, never the request body').toMatch(/session\.user\.roles/);
  });

  it('requires download, not view', () => {
    // `view` would be wrong: attaching puts the document in front of everyone who can see the job, so
    // the attacher must themselves be entitled to hand the bytes over.
    const s = src(ROUTE);
    expect(s).toMatch(/canDownload\(\s*access\s*\)/);
    expect(s, 'a view-level check would under-protect the attach').not.toMatch(/canView\(\s*access\s*\)/);
  });

  it('403s a forbidden node and 404s a missing one, distinguishably', () => {
    // Different causes need different messages: "you cannot see this" is actionable, "this is gone" is
    // not, and collapsing them into one status makes the UI unable to say which happened.
    const s = src(ROUTE);
    expect(s).toMatch(/file_node_forbidden/);
    expect(s).toMatch(/file_node_missing/);
    expect(s).toMatch(/status:\s*403/);
  });

  it('uses the same access helper as the download route, so the two cannot drift', () => {
    const attach = src(ROUTE);
    const download = src('app/api/admin/files/[id]/download/route.ts');
    for (const s of [attach, download]) {
      expect(s).toMatch(/from '@\/lib\/files\/server'/);
      expect(s).toMatch(/accessForNode\(/);
    }
  });
});

describe('F5 — a link, not a copy', () => {
  it('persists file_node_id on the row', () => {
    expect(src(ROUTE)).toMatch(/file_node_id:\s*file_node_id\s*\?\?\s*null/);
  });

  it('does not auto-create a backup for a linked file', () => {
    // The backup exists because `file_url` holds the only copy of an uploaded file's bytes. A
    // reference has no bytes, so a "backup" would be a second pointer at the same document.
    //
    // The RULE outlived the inline condition that used to state it. Job files moved to storage on
    // 2026-08-19, which added a third case with the same property — a storage row's twin would
    // point at the same key — so the decision moved into `wantsBackupRow` and this guard follows
    // it there. Deleting the guard because its old spelling vanished is how a guarantee gets lost
    // during a refactor that never intended to drop it.
    expect(src(ROUTE)).toMatch(/wantsBackupRow\(/);
    expect(src('lib/jobs/file-storage.ts')).toMatch(/shapeOf\(row\) === 'legacy-inline'/);
  });

  it('never writes bytes for an attach — the client sends no file_url', () => {
    const s = src(MANAGER);
    const attach = s.slice(s.indexOf('async function attachFromExplorer'), s.indexOf('// ── which page-owned panel'));
    expect(attach, 'the attach must not send a file_url').not.toMatch(/file_url/);
    expect(attach).toMatch(/file_node_id:\s*node\.id/);
    expect(s).toMatch(/onPick=\{\(p\) => void attachFromExplorer\(\{ id: p\.id, name: p\.name \}\)\}/);
  });

  it('downloads a linked file through the explorer route, not from the job row', () => {
    // Routing the download through the explorer means the VIEWER's access is re-checked, not just the
    // attacher's — otherwise a job page would leak documents to everyone who can see the job.
    //
    // The manager used to spell this URL inline, in one of TWO download controls — which is how a
    // storage-backed upload ended up with no download button at all. There is one control now, and
    // the href comes from `downloadHref`, so this asserts the rule where it now lives.
    expect(src('lib/jobs/file-storage.ts')).toMatch(/case 'linked':[\s\S]{0,400}\/api\/admin\/files\/\$\{row\.file_node_id\}\/download/);
    // The explorer lists a linked row AS its explorer document, so every open and download of it
    // goes through /api/admin/files/<node>/download with the viewer's own access.
    expect(src('lib/files/mounts.ts')).toMatch(/shape === 'linked' && r\.file_node_id \? r\.file_node_id/);
    expect(src(MANAGER)).toMatch(/\/api\/admin\/files\/\$\{id\}\/download/);
  });

  it('and a job attachment never serves a linked document itself', () => {
    // The other half of the same rule, on the route added with storage: asked for a linked row's
    // bytes, the job download must hand the caller to the explorer rather than answering.
    const s = src('app/api/admin/jobs/files/[id]/download/route.ts');
    expect(s).toMatch(/shape === 'linked'/);
    expect(s).toMatch(/\/api\/admin\/files\/\$\{row\.file_node_id\}\/download/);
  });
});

describe('F5 — a dead link is labelled, not hidden', () => {
  it('the API annotates availability instead of filtering the row out', () => {
    const s = src(ROUTE);
    expect(s).toMatch(/available:\s*true/);
    expect(s).toMatch(/available:\s*false/);
  });

  it('the listing says a linked row has no copy of its own, and a gone document opens to "not here"', () => {
    // The listing swaps in the explorer id; the job download route refuses to serve a linked row's
    // bytes itself and points at Files; a document that is gone answers 404 from the explorer route.
    expect(src('lib/files/mounts.ts')).toMatch(/shape === 'linked' && r\.file_node_id/);
    expect(src('lib/files/mounts.ts')).toMatch(/a link to a document in Files — open it there/);
  });

  it('resolves node metadata in ONE batched query, not per row', () => {
    // Twenty attachments must cost one extra query, not twenty.
    const s = src(ROUTE);
    expect(s).toMatch(/\.in\('id',\s*nodeIds\)/);
  });

  it('filters deleted nodes with deleted_at, the column file_nodes actually has', () => {
    // `job_files` uses an `is_deleted` boolean and `file_nodes` uses a `deleted_at` timestamp. Getting
    // this wrong fails the whole query rather than just the filter, so it is worth locking.
    const s = src(ROUTE);
    expect(s).toMatch(/\.is\('deleted_at',\s*null\)/);
    const nodeBlock = s.slice(s.indexOf("from('file_nodes')"), s.indexOf("from('file_nodes')") + 400);
    expect(nodeBlock, 'file_nodes has no is_deleted column').not.toMatch(/is_deleted/);
  });
});

describe('F5 — the schema change', () => {
  const seed = src(SEED);

  it('adds a NULLABLE column with a FK that degrades rather than deletes', () => {
    expect(seed).toMatch(/ADD COLUMN IF NOT EXISTS file_node_id UUID REFERENCES file_nodes\(id\)/i);
    // SET NULL, not CASCADE: deleting a document must not silently remove the job's attachment row,
    // because that is indistinguishable from the attach never happening.
    expect(seed).toMatch(/ON DELETE SET NULL/i);
    expect(seed, 'a CASCADE here would erase the evidence of the attachment').not.toMatch(/ON DELETE CASCADE/i);
  });

  it('is idempotent, so re-running it is a no-op', () => {
    expect(seed).toMatch(/ADD COLUMN IF NOT EXISTS/i);
    expect(seed).toMatch(/CREATE INDEX IF NOT EXISTS/i);
  });

  it('indexes only the referencing rows', () => {
    // The column is null for every ordinary upload, so a full index would be mostly empty.
    expect(seed).toMatch(/WHERE file_node_id IS NOT NULL/i);
  });

  it('records that the deferral’s premise was checked and wrong', () => {
    // F5 deferred this on the claim that `job_files.storage_path` is NOT NULL. It is nullable, and the
    // table was empty. Keeping that correction next to the change is the point — the next person to
    // read the deferral should find out immediately that its central fact did not hold.
    //
    // Reads the RAW file: the correction lives in the seed's own `--` comments, which is exactly where
    // it belongs, so this is the one assertion that must not strip them.
    const withComments = raw(SEED);
    expect(withComments).toMatch(/NULLABLE/);
    expect(withComments).toMatch(/ZERO rows/i);
  });
});

describe('F5 — wired, not merely authored', () => {
  it('the job page mounts the explorer on the job, so the button actually appears', () => {
    // This repo's signature defect is a component built and never connected. The explorer is the
    // Files tab, rooted at the job's own mount, so the wiring IS the feature.
    expect(src(JOBPAGE)).toMatch(/<FolderExplorer[\s\S]{0,120}rootId=\{`mnt:jobs:\$\{jobId\}`\}/);
  });

  it('the handler posts file_node_id to the job-files endpoint', () => {
    const s = src(MANAGER);
    const fn = s.slice(s.indexOf('async function attachFromExplorer'));
    expect(fn.slice(0, 900)).toMatch(/\/api\/admin\/jobs\/files/);
    expect(fn.slice(0, 900)).toMatch(/file_node_id/);
  });

  it('the handler surfaces the server’s error rather than inventing one', () => {
    const s = src(MANAGER);
    const fn = s.slice(s.indexOf('async function attachFromExplorer'));
    expect(fn.slice(0, 900)).toMatch(/b\.error/);
  });

  it('the explorer only renders the button where an attach can land — a job folder', () => {
    const s = src(MANAGER);
    expect(s).toMatch(/\{target\.kind === 'job' && \(/);
  });

  it('reuses the ONE file explorer pop-up in file mode instead of a second browser', () => {
    // 2026-09-10: FilePicker retired for FileExplorerDialog — the same pop-up the viewer's SEND TO
    // and the explorer's Move open.
    const s = src(MANAGER);
    expect(s).toMatch(/from '(\.\/|@\/app\/admin\/components\/files\/)FileExplorerDialog'/);
    expect(s).toMatch(/mode="file"/);
    expect(fs.existsSync(path.join(process.cwd(), 'app/admin/components/files/FilePicker.tsx')), 'the old picker is back').toBe(false);
  });
});
