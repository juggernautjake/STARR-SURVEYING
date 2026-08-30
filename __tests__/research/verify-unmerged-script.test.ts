// `npm run verify:unmerged` — the two properties that make it useful rather than noise.
//
// It exists because three records in this repo were found stale on the same day, all of the same
// shape: a number that was true when written and trusted long after. Writing a fourth record of
// those numbers would inherit the same expiry date, so this measures on demand instead.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const src = fs.readFileSync(path.join(ROOT, 'scripts/verify-unmerged.mjs'), 'utf8');

describe('verify:unmerged', () => {
  it('is wired in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['verify:unmerged']).toContain('scripts/verify-unmerged.mjs');
  });

  it('REPORTS rather than gates — no non-zero exit anywhere', () => {
    // Unmerged work is a normal state. A check that failed on it would be red permanently and
    // therefore ignored, which is worse than not having it: it trains people to skip the output.
    expect(src).not.toMatch(/process\.exit\(\s*1/);
  });

  it('folds branches contained in another, so six names cannot read as six projects', () => {
    // The naive version counts branches. Six D&D branches turned out to be one chain, each an
    // ancestor of the next — reporting six lost projects where there is one is the kind of
    // scary-and-wrong number that gets acted on.
    expect(src).toContain('merge-base --is-ancestor');
    expect(src).toMatch(/kept/);
  });

  it('ranks on files ABSENT from main, not on commit count', () => {
    // A branch's changes can already be in main via a different commit. The commit count says
    // nothing about whether the work is lost; the absent-file count is the real signal, and it is
    // what distinguished genuinely-missing sales-tax work from superseded work.
    expect(src).toMatch(/cat-file -e/);
    expect(src).toMatch(/sort\(\(a, b\) => b\.absent - a\.absent\)/);
  });

  it('enumerates worktrees explicitly, because git ls-files cannot see them', () => {
    // A gitignored worktree held 2,591 lines of finished work for a month, invisible to every
    // scanner here because they all use `git ls-files`.
    expect(src).toContain('git worktree list');
  });
});
