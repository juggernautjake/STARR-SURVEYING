// __tests__/files/jobs-mount.test.ts
//
// The Jobs mount — one folder per job, holding that job's files, photos, receipts, drawings and
// field media.
//
// These are SOURCE-LEVEL guards on the two properties that cannot be checked by looking at a screen
// and that would each be a real hole if they broke:
//
//   1. the items inside a job folder carry their OWN source's id, so there is still exactly one
//      resolver per source and no second place to get permissions wrong;
//   2. every kind re-applies its own source's role gate, so a job folder cannot become a way to
//      read receipts you are not allowed to see.
//
// The behaviour that CAN be driven — that the folders appear, hold the right things, and open — is
// covered by `scripts/check-jobs-files-fabric.mjs` against a real job.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
/** Strip comments, so prose describing the rule cannot satisfy a check about the rule. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const MOUNTS = 'lib/files/mounts.ts';

describe('the Jobs mount exists and is a mount like the others', () => {
  const src = () => code(read(MOUNTS));

  it('is a source, so it appears at the top level and is searched with the rest', () => {
    // `mountRootNodes` and the search route both iterate SOURCES. Adding it anywhere else would
    // produce a folder that lists but cannot be searched.
    expect(src()).toMatch(/key: 'jobs', label: 'Jobs'/);
  });

  it('its items carry their own source id, never a new mnt:jobs file id', () => {
    // The load-bearing decision. `mnt:receipts:<id>` inside a job folder is the SAME node the
    // Receipts folder emits, so download, preview and search need no second code path — and there
    // stays exactly one place that knows how to turn a receipt into bytes.
    const s = src();
    expect(s).toContain('${MOUNT_PREFIX}receipts:${r.id}');
    expect(s).toContain('${MOUNT_PREFIX}job-files:${r.id}');
    expect(s).toContain('${MOUNT_PREFIX}drawings:${r.id}');
    expect(s).toContain('${MOUNT_PREFIX}field-media:${r.id}');
  });

  it('resolving a jobs or projects id is refused — they are all folders', () => {
    // Without this the id falls through the source chain and is read as a row id in whichever table
    // is last, which 404s for entirely the wrong reason.
    //
    // 2026-08-19: `projects` joined `jobs` here when the Projects mount landed. Every id under
    // either one names a FOLDER — the items inside carry their own source's id (`mnt:job-files:…`),
    // which is what makes them resolvable at all.
    expect(src()).toMatch(/key === 'jobs' \|\| key === 'projects'\) return \{ ok: false, status: 400/);
  });

  it('a file id passed where a folder is expected is refused, not silently widened', () => {
    // `mnt:receipts:<id>` used to slice to the key alone, so listing it would have answered with
    // the whole Receipts folder — a different question than the one asked.
    expect(src()).toContain('That is a file, not a folder.');
  });
});

describe('a job folder cannot leak what its source would not', () => {
  const src = () => code(read(MOUNTS));

  it('each standard folder names the SOURCES whose gates apply, rather than its own role list', () => {
    // A second role list is a second thing to forget to update. Receipts are admin/developer only;
    // job files are also field_crew. If a folder could declare its own gate, the Jobs mount would
    // drift into being more permissive than the flat mounts it rearranges. Since 2026-09-10 the
    // table is lib/files/job-folders.ts (shared with the explorer that uploads into the folders).
    const folders = code(read('lib/files/job-folders.ts'));
    const spec = (key: string) => {
      const at = folders.indexOf(`key: '${key}'`);
      expect(at, `no ${key} folder`).toBeGreaterThan(-1);
      return folders.slice(at, folders.indexOf('},', at));
    };
    expect(spec('research')).toContain("sources: ['research', 'job-files']");
    expect(spec('cad')).toContain("sources: ['drawings', 'job-files']");
    expect(spec('photos')).toContain("sources: ['job-files', 'field-media']");
    expect(spec('videos')).toContain("sources: ['job-files', 'field-media']");
    expect(spec('receipts')).toContain("sources: ['receipts']");
    expect(folders, 'a folder declares roles of its own').not.toMatch(/roles:/);
  });

  it('every source fetch inside a job folder re-checks that source\'s gate', () => {
    // The folder is only the door. Each table is read behind canSeeKey(<its source>), so a field
    // crew member opening a job folder gets the photos and not the receipts.
    const s = src();
    expect(s).toMatch(/function foldersVisibleTo[\s\S]{0,300}canSeeKey\(key, user, isAdmin\)/);
    for (const key of ['job-files', 'research', 'drawings', 'field-media', 'receipts']) {
      expect(s, `${key} is read without its gate`).toContain(`if (canSeeKey('${key}', user, isAdmin))`);
    }
  });

  it('the standard four are always listed; the catch-alls only when they hold something', () => {
    const s = src();
    expect(s).toMatch(/\.filter\(\(f\) => f\.standard \|\| \(byFolder\.get\(f\.key\)\?\.length \?\? 0\) > 0\)/);
  });

  it('level 3 resolves the folder out of the VISIBLE list, so a forbidden slug 404s', () => {
    // Reading from JOB_FOLDERS instead would list receipts to somebody who cannot see the Receipts
    // folder — the permissions hole this mount is most likely to grow.
    const s = src();
    expect(s).toMatch(/const kind = folders\.find\(\(k\) => k\.key === kindSeg\)/);
    expect(s).toContain('That folder is not here.');
  });

  it('research documents reach a job through BOTH links: the join table and the older column', () => {
    const s = src();
    expect(s).toContain(".from('research_project_jobs').select('research_project_id').eq('job_id', jobId)");
    expect(s).toContain(".from('research_projects').select('id').eq('job_id', jobId)");
  });

  it('the jobs source is gated by the union of the folders\' sources, not left open', () => {
    const s = src();
    const line = s.split('\n').find((l) => l.includes("key: 'jobs'")) ?? '';
    expect(line).toContain("'admin'");
    expect(line).toContain("'field_crew'");
    // Research became job-scoped (seed 633), so a researcher is in the union now — and inside a
    // job folder they see the Research folder and nothing else, by the per-source gates above.
    expect(line).toContain("'researcher'");
  });
});

describe('the file explorer can get back out of a nested folder', () => {
  it('the list route uses the mount trail as the breadcrumb when there is one', () => {
    // A single crumb three levels deep is a dead end: the only way back is the browser button.
    expect(code(read('app/api/admin/files/route.ts'))).toContain('m.trail ??');
  });

  it('a job folder offers its job page separately from opening the folder', () => {
    // Clicking a folder's NAME must open the folder — that is what a folder is. So the job page is
    // its own control; hijacking the click would make the folder unopenable.
    expect(code(read('app/api/admin/files/route.ts'))).toContain('m.openHref');
    expect(code(read(MOUNTS))).toContain('openHref: `/admin/jobs/${job.id}`');
  });
});

describe('the Job Files folder shows what the job page shows', () => {
  const src = () => code(read(MOUNTS));

  it('it no longer filters on the mobile-only columns alone', () => {
    // It required `upload_state = 'done'` AND a non-null `storage_path`, which no file uploaded from
    // the job page has ever had — the folder was structurally empty for every file the product
    // actually made. Measured against the live database, where the one row is a `data:` URI.
    const s = src();
    expect(s.includes(".eq('upload_state', 'done')\n      .not('storage_path', 'is', null)")).toBe(false);
  });

  it('and it decides each row through the one shape module', () => {
    expect(src()).toContain('shapeOf(r)');
    expect(read(MOUNTS)).toContain("from '@/lib/jobs/file-storage'");
  });

  it('a row with no bytes anywhere is left out rather than listed as a dead name', () => {
    expect(src()).toContain("shapeOf(r) !== 'missing'");
  });

  it('backups are not listed — the same bytes under a louder name', () => {
    expect(src()).toMatch(/is_backup', false\)/);
  });
});
