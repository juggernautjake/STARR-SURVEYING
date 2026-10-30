#!/usr/bin/env node
// Runs from .githooks/pre-push. Checks the code on this computer before it is pushed, so a
// broken build fails here (free) instead of in CI or on Vercel.
//
//   any branch  → npm run type-check
//   main        → npm run type-check, npm run lint, npm run build  (the same build Vercel runs for main)
//
// Skip once:  git push --no-verify     or     SKIP_PREPUSH=1 git push
// Hooks are switched on by `npm install` (scripts/install-git-hooks.mjs).

import { spawnSync, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import net from 'node:net';

if (process.env.SKIP_PREPUSH === '1') {
  console.log('[pre-push] SKIP_PREPUSH=1, skipping checks.');
  process.exit(0);
}

// git passes one line per ref: <local ref> <local sha> <remote ref> <remote sha>
let input = '';
try { input = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
const ZERO = /^0+$/;
const refs = input.trim().split('\n').filter(Boolean).map((l) => {
  const [localRef, localSha, remoteRef] = l.split(' ');
  return { localRef, localSha, remoteRef };
}).filter((r) => r.localSha && !ZERO.test(r.localSha)); // ignore branch deletions
if (!refs.length) process.exit(0);

const toMain = refs.some((r) => r.remoteRef === 'refs/heads/main');
const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
if (!refs.some((r) => r.localSha === head)) {
  console.log('[pre-push] Note: the commit being pushed is not the one checked out; the checks run on the checked-out files.');
}
if (execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim()) {
  console.log('[pre-push] Note: you have uncommitted changes; the checks include them.');
}

if (!existsSync('node_modules/.bin/next') && !existsSync('node_modules/.bin/next.cmd')) {
  console.error('[pre-push] The packages aren\'t installed, so the code can\'t be checked. Run `npm install` once, then push again (or git push --no-verify to skip).');
  process.exit(1);
}

const steps = ['type-check'];
if (toMain) steps.push('lint', 'build');

if (toMain && await portInUse(3000)) {
  console.log('[pre-push] A dev server looks to be running on :3000. The build shares its .next folder, so restart `npm run dev` afterwards.');
}

console.log(`[pre-push] Checking before push${toMain ? ' to main' : ''}: ${steps.join(', ')}`);
for (const s of steps) {
  const t = Date.now();
  const r = spawnSync(`npm run ${s}`, { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\n[pre-push] "npm run ${s}" failed, so nothing was pushed. Fix it and push again (or git push --no-verify to skip).`);
    process.exit(1);
  }
  console.log(`[pre-push] ${s} passed (${Math.round((Date.now() - t) / 1000)}s)`);
}

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(500, () => { s.destroy(); resolve(false); });
  });
}
