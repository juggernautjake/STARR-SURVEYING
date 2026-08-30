// scripts/verify-unmerged.mjs — what work exists that `main` does not have?
//
//   npm run verify:unmerged
//
// Exit 0 always. This reports; it does not gate. Unmerged work is a normal state, and a check that
// failed on it would be red permanently and therefore ignored.
//
// ── WHY THIS IS A SCRIPT AND NOT A DOCUMENT ─────────────────────────────────────────────────────
//
// On 2026-08-29 three separate records in this repo were found stale, all the same shape:
//
//   the phone project     recorded as "all 5 commits"   → 17 commits, 73 files absent from main
//   SRD magic items       recorded as shipped, 237      → not in main, no table in the live DB
//   unmerged branches     would read as 12 lost things  → 3 actual bodies of work
//
// Every one was TRUE WHEN WRITTEN. Every one had been trusted since. Writing a fourth record of the
// same numbers would inherit the same expiry date, so this measures instead.
//
// ── THE THREE THINGS THAT MAKE THE NAIVE VERSION WRONG ──────────────────────────────────────────
//
// 1. **Branch count is not project count.** Six D&D branches turned out to be one chain — each
//    contained in the next. Counting branches reports six lost projects where there is one. So
//    branches fully contained in another branch are folded into it.
//
// 2. **Unmerged is not lost.** A branch's changes can already be in `main` via a different commit.
//    The commit count says nothing; the count of FILES ABSENT FROM MAIN is the real signal.
//
// 3. **`git ls-files` cannot see everything.** A gitignored worktree held 2,591 lines of finished
//    work for a month, invisible to every scanner in this repo because they all use `git ls-files`.
//    Worktrees are enumerated explicitly.

import { execSync } from 'node:child_process';

const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch { return ''; } };

const BASE = 'main';

/** Every local and remote branch, plus any branch checked out in a worktree. */
function candidates() {
  const refs = sh(`git for-each-ref --format=%(refname:short) refs/heads refs/remotes/origin`)
    .split('\n').filter(Boolean)
    .filter((b) => b !== BASE && b !== `origin/${BASE}` && !b.endsWith('/HEAD'));

  // Worktree branches may not appear above if the worktree path is gitignored.
  const wt = sh('git worktree list --porcelain').split('\n')
    .filter((l) => l.startsWith('branch '))
    .map((l) => l.replace('branch refs/heads/', '').trim());

  // Prefer the local name when a local and origin/ pair carry the same tip.
  const byTip = new Map();
  for (const b of [...refs, ...wt]) {
    const tip = sh(`git rev-parse ${b}`);
    if (!tip) continue;
    const seen = byTip.get(tip);
    if (!seen || (seen.startsWith('origin/') && !b.startsWith('origin/'))) byTip.set(tip, b);
  }
  return [...byTip.values()];
}

const rows = [];
for (const b of candidates()) {
  const commits = Number(sh(`git rev-list --count ${BASE}..${b}`) || 0);
  if (commits === 0) continue;
  const files = sh(`git diff --name-only ${BASE}...${b}`).split('\n').filter(Boolean);
  const absent = files.filter((f) => !sh(`git cat-file -e ${BASE}:"${f}" 2>/dev/null && echo ok`));
  rows.push({ branch: b, commits, files: files.length, absent: absent.length });
}

// Fold branches that are fully contained in another — six names, one chain.
const kept = rows.filter((r) => !rows.some((o) =>
  o.branch !== r.branch && sh(`git merge-base --is-ancestor ${r.branch} ${o.branch} && echo yes`) === 'yes'));

kept.sort((a, b) => b.absent - a.absent);

console.log(`\nWork not in \`${BASE}\` — ${kept.length} distinct bodies (${rows.length} branch names).\n`);
if (kept.length === 0) {
  console.log('  Nothing. Every branch is an ancestor of main.\n');
} else {
  console.log(`  ${'branch'.padEnd(52)} ${'commits'.padStart(7)} ${'files'.padStart(6)} ${'ABSENT'.padStart(7)}`);
  console.log('  ' + '─'.repeat(76));
  for (const r of kept) {
    console.log(`  ${r.branch.padEnd(52)} ${String(r.commits).padStart(7)} ${String(r.files).padStart(6)} ${String(r.absent).padStart(7)}`);
  }
  console.log('\n  ABSENT is the column that matters: files this branch has that `main` does not.');
  console.log('  A high commit count with zero absent files is work that landed another way.');
  console.log('  Folded branches are those fully contained in another — six names can be one chain.\n');
}
