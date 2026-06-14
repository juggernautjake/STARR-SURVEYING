#!/usr/bin/env node
// cad-desktop-tauri-and-perf Slice T1 — desktop build prep.
//
// The standalone Tauri binary only needs the CAD surface
// (`app/admin/cad/**`) + the root layout. Everything else — the
// /api/* route handlers (server-only), the admin job-management UI,
// the marketing pages, the share / register / credentials flows —
// can't go in a static export AND isn't part of the standalone
// program the user is asking for. This script stages a temporary
// build by RENAMING the excluded directories to a `.desktop-stash/`
// sibling, runs the caller's command (typically `next build` under
// STARR_BUILD_TARGET=desktop), and restores them on exit.
//
// Usage:
//   node scripts/prepare-desktop-build.mjs stash
//   STARR_BUILD_TARGET=desktop next build
//   node scripts/prepare-desktop-build.mjs restore
//
// Or, in a single call (preferred — restores even on failure):
//   node scripts/prepare-desktop-build.mjs run -- next build
//
// The stash uses RENAMES (not copies) so the operation is instant
// regardless of repo size.

import { existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const APP_DIR = join(REPO_ROOT, 'app');
const STASH_DIR = join(REPO_ROOT, '.desktop-stash');

/** Directories under `app/` that the desktop build KEEPS. Anything
 *  not in this list (other than files) gets stashed. Adjust here if
 *  the desktop scope changes. */
const KEEP = new Set([
  'admin',        // narrows further below — only `admin/cad` stays
  'components',   // app-shell components used by the CAD layout
  'styles',       // global styles
]);

/** Sub-directories of `app/admin` that the desktop build KEEPS.
 *  Everything else under admin/ is the job-management web UI, which
 *  isn't part of the standalone CAD program. */
const KEEP_UNDER_ADMIN = new Set(['cad']);

function stash() {
  if (!existsSync(STASH_DIR)) mkdirSync(STASH_DIR, { recursive: true });
  let moved = 0;
  // Stash top-level `app/<dir>` siblings that aren't on the keep list.
  for (const entry of readdirSync(APP_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (KEEP.has(entry.name)) continue;
    const src = join(APP_DIR, entry.name);
    const dst = join(STASH_DIR, entry.name);
    renameSync(src, dst);
    moved += 1;
  }
  // Stash `app/admin/<dir>` siblings outside the CAD subtree.
  const adminDir = join(APP_DIR, 'admin');
  if (existsSync(adminDir)) {
    for (const entry of readdirSync(adminDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (KEEP_UNDER_ADMIN.has(entry.name)) continue;
      const src = join(adminDir, entry.name);
      const dst = join(STASH_DIR, `admin__${entry.name}`);
      renameSync(src, dst);
      moved += 1;
    }
  }
  console.log(`[prepare-desktop-build] Stashed ${moved} dirs into ${STASH_DIR}`);
}

function restore() {
  if (!existsSync(STASH_DIR)) {
    console.log('[prepare-desktop-build] No stash to restore.');
    return;
  }
  let moved = 0;
  for (const entry of readdirSync(STASH_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = join(STASH_DIR, entry.name);
    let dst;
    if (entry.name.startsWith('admin__')) {
      dst = join(APP_DIR, 'admin', entry.name.slice('admin__'.length));
    } else {
      dst = join(APP_DIR, entry.name);
    }
    renameSync(src, dst);
    moved += 1;
  }
  console.log(`[prepare-desktop-build] Restored ${moved} dirs to app/`);
}

function run(argv) {
  if (argv.length === 0) {
    console.error('[prepare-desktop-build] `run` requires a command after `--`.');
    process.exit(2);
  }
  stash();
  let code = 0;
  try {
    const result = spawnSync(argv[0], argv.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, STARR_BUILD_TARGET: 'desktop' },
    });
    code = result.status ?? 1;
  } finally {
    restore();
  }
  process.exit(code);
}

const mode = process.argv[2];
switch (mode) {
  case 'stash': stash(); break;
  case 'restore': restore(); break;
  case 'run': {
    const dashdash = process.argv.indexOf('--');
    const rest = dashdash >= 0 ? process.argv.slice(dashdash + 1) : [];
    run(rest);
    break;
  }
  default:
    console.error('Usage: prepare-desktop-build.mjs <stash|restore|run -- <cmd...>>');
    process.exit(2);
}
