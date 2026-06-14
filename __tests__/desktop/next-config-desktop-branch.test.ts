// __tests__/desktop/next-config-desktop-branch.test.ts
//
// cad-desktop-tauri-and-perf Slice T1 — `STARR_BUILD_TARGET=desktop`
// flips the Next.js config into static-export mode. The default
// (web) build is unchanged — same routes, same server actions, same
// distDir. The two builds output to distinct directories so they can
// coexist locally.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const CONFIG_PATH = path.join(repoRoot, 'next.config.js');

function loadConfig(envOverrides: Record<string, string | undefined> = {}) {
  // Clear the require cache + apply env overrides so we can re-load
  // the config module fresh for each scenario.
  delete require.cache[require.resolve(CONFIG_PATH)];
  const prev = { ...process.env };
  try {
    for (const [k, v] of Object.entries(envOverrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(CONFIG_PATH);
  } finally {
    process.env = prev;
  }
}

describe('next.config — desktop branch', () => {
  let savedEnv: NodeJS.ProcessEnv;
  beforeEach(() => { savedEnv = { ...process.env }; });
  afterEach(() => { process.env = savedEnv; });

  it('the default (web) build does NOT set `output: export`', () => {
    const cfg = loadConfig({ STARR_BUILD_TARGET: undefined });
    expect(cfg.output).toBeUndefined();
    expect(cfg.distDir).toBeUndefined();
    expect(cfg.assetPrefix).toBeUndefined();
  });

  it('STARR_BUILD_TARGET=desktop flips `output: export` + `distDir: out-desktop`', () => {
    const cfg = loadConfig({ STARR_BUILD_TARGET: 'desktop' });
    expect(cfg.output).toBe('export');
    expect(cfg.distDir).toBe('out-desktop');
    expect(cfg.assetPrefix).toBe('');
    expect(cfg.trailingSlash).toBe(true);
  });

  it('desktop build sets `images.unoptimized: true` (Next image optim needs a server)', () => {
    const cfg = loadConfig({ STARR_BUILD_TARGET: 'desktop' });
    expect(cfg.images.unoptimized).toBe(true);
  });

  it('web build keeps `images.unoptimized: false` so Vercel image optim runs', () => {
    const cfg = loadConfig({ STARR_BUILD_TARGET: undefined });
    expect(cfg.images.unoptimized).toBe(false);
  });

  it('serverComponentsExternalPackages is preserved on both builds (audit guard)', () => {
    // Server-only packages stay declared even in the desktop config —
    // they're harmless during static export and removing them would
    // silently affect the web build sharing this file.
    const web = loadConfig({ STARR_BUILD_TARGET: undefined });
    const desktop = loadConfig({ STARR_BUILD_TARGET: 'desktop' });
    expect(web.experimental.serverComponentsExternalPackages).toContain('playwright');
    expect(desktop.experimental.serverComponentsExternalPackages).toContain('playwright');
  });
});

describe('package.json — desktop build scripts', () => {
  const PKG = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  it('exposes `build:desktop` that runs the prep + next build with the env flag', () => {
    expect(PKG.scripts['build:desktop']).toMatch(
      /prepare-desktop-build\.mjs run -- next build/,
    );
  });
  it('exposes `build:desktop:stash` and `build:desktop:restore` for manual control', () => {
    expect(PKG.scripts['build:desktop:stash']).toMatch(/prepare-desktop-build\.mjs stash/);
    expect(PKG.scripts['build:desktop:restore']).toMatch(/prepare-desktop-build\.mjs restore/);
  });
});

describe('scripts/prepare-desktop-build.mjs — source-locks', () => {
  const SRC = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'prepare-desktop-build.mjs'),
    'utf8',
  );

  it('keeps `app/admin/cad` and the root shells; stashes everything else', () => {
    expect(SRC).toMatch(/const KEEP = new Set\(\[\s*\n\s*'admin',[\s\S]*?'components',[\s\S]*?'styles',/);
    expect(SRC).toMatch(/const KEEP_UNDER_ADMIN = new Set\(\['cad'\]\)/);
  });

  it('uses renames (not copies) so the stash is instant', () => {
    expect(SRC).toMatch(/renameSync\(src, dst\)/);
    // No fs.cpSync / fs.copyFile.
    expect(SRC).not.toMatch(/copyFile|cpSync/);
  });

  it('the `run` mode restores even when the inner command fails', () => {
    // Try / finally restore: the restore() call sits inside a finally
    // block so a non-zero exit from `next build` still puts the tree
    // back the way it was.
    expect(SRC).toMatch(/try \{[\s\S]*?spawnSync[\s\S]*?\} finally \{\s*\n\s*restore\(\);/);
  });

  it('passes STARR_BUILD_TARGET=desktop through to the inner build command', () => {
    expect(SRC).toMatch(/env: \{ \.\.\.process\.env, STARR_BUILD_TARGET: 'desktop' \}/);
  });

  it('exits with the inner command\'s status code', () => {
    expect(SRC).toMatch(/process\.exit\(code\)/);
  });

  it('round-trips the `admin__<name>` stash key back to `app/admin/<name>`', () => {
    expect(SRC).toMatch(/entry\.name\.startsWith\('admin__'\)/);
    expect(SRC).toMatch(/admin', entry\.name\.slice\('admin__'\.length\)/);
  });
});
