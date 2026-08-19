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

  it('each kind names the SOURCE whose gate applies, rather than its own role list', () => {
    // A second role list is a second thing to forget to update. Receipts are admin/developer only;
    // job files are also field_crew. If a kind could declare its own gate, the Jobs mount would
    // drift into being more permissive than the folders it mirrors.
    const s = src();
    expect(s).toMatch(/key: 'receipts', label: 'Receipts', gate: 'receipts'/);
    expect(s).toMatch(/key: 'files', label: 'Files', gate: 'job-files'/);
    expect(s).toMatch(/key: 'photos', label: 'Photos', gate: 'job-files'/);
    expect(s).toMatch(/key: 'drawings', label: 'Drawings', gate: 'drawings'/);
    expect(s).toMatch(/key: 'field-media', label: 'Field Media', gate: 'field-media'/);
  });

  it('the visible kinds are filtered through canSee, per caller', () => {
    expect(src()).toMatch(/function kindsVisibleTo[\s\S]{0,400}canSee\(gate, user, isAdmin\)/);
  });

  it('level 3 resolves the kind out of the VISIBLE list, so a forbidden slug 404s', () => {
    // Reading the kind from JOB_KINDS instead would list receipts to somebody who cannot see the
    // Receipts folder — the permissions hole this mount is most likely to grow.
    const s = src();
    expect(s).toMatch(/const kind = kinds\.find\(\(k\) => k\.key === kindSeg\)/);
    expect(s).toContain('That folder is not here.');
  });

  it('the jobs source itself is gated by the union of the kinds, not left open', () => {
    const s = src();
    const line = s.split('\n').find((l) => l.includes("key: 'jobs'")) ?? '';
    expect(line).toContain("'admin'");
    expect(line).toContain("'field_crew'");
    // A researcher sees research documents, which are NOT a job kind — so the Jobs door does not
    // open for them. If research ever becomes job-scoped this list grows with it.
    expect(line.includes("'researcher'")).toBe(false);
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
