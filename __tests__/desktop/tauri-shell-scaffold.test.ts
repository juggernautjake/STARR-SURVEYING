// __tests__/desktop/tauri-shell-scaffold.test.ts
//
// cad-desktop-tauri-and-perf Slice T2 — Tauri 2 dev shell scaffold.
// Source-locks the bootstrap files so a future contributor refactoring
// the Rust side (or a stray `cargo init` overwriting them) can't
// silently break the desktop build. The slice deliberately keeps the
// shell minimal — one window, one ping IPC, default runtime — so the
// audit boundary stays clear; Slices T4 / T6 / T7 layer plumbing on
// top of it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Tauri shell files exist', () => {
  for (const rel of [
    'src-tauri/Cargo.toml',
    'src-tauri/build.rs',
    'src-tauri/src/main.rs',
    'src-tauri/src/lib.rs',
    'src-tauri/tauri.conf.json',
    'src-tauri/capabilities/default.json',
  ]) {
    it(`${rel} present`, () => {
      expect(fs.existsSync(path.join(repoRoot, rel))).toBe(true);
    });
  }
});

describe('Cargo.toml — Tauri 2 dependencies', () => {
  const SRC = read('src-tauri/Cargo.toml');

  it('targets edition 2021 + rust 1.77', () => {
    expect(SRC).toMatch(/edition = "2021"/);
    expect(SRC).toMatch(/rust-version = "1\.77"/);
  });

  it('depends on tauri 2 + tauri-build 2', () => {
    expect(SRC).toMatch(/tauri = \{ version = "2"/);
    expect(SRC).toMatch(/tauri-build = \{ version = "2"/);
  });

  it('declares the `custom-protocol` feature so `tauri dev` works', () => {
    expect(SRC).toMatch(/custom-protocol = \["tauri\/custom-protocol"\]/);
  });

  it('library crate exposes `starr_cad_lib` (matches main.rs)', () => {
    expect(SRC).toMatch(/name = "starr_cad_lib"/);
    expect(SRC).toMatch(/crate-type = \["staticlib", "cdylib", "rlib"\]/);
  });
});

describe('tauri.conf.json — dev shell configuration', () => {
  const CONF = JSON.parse(read('src-tauri/tauri.conf.json'));

  it('uses the v2 schema + a stable product identifier', () => {
    expect(CONF.$schema).toMatch(/schema\.tauri\.app\/config\/2/);
    expect(CONF.identifier).toBe('com.starrsurveying.starr-cad');
    expect(CONF.productName).toBe('Starr CAD');
  });

  it('dev points at the Next.js localhost server; prod loads the static export', () => {
    expect(CONF.build.beforeDevCommand).toBe('npm run dev');
    expect(CONF.build.devUrl).toBe('http://localhost:3000');
    expect(CONF.build.beforeBuildCommand).toBe('npm run build:desktop');
    expect(CONF.build.frontendDist).toBe('../out-desktop');
  });

  it('opens directly into the CAD canvas at /admin/cad/', () => {
    expect(CONF.app.windows).toHaveLength(1);
    expect(CONF.app.windows[0].url).toBe('/admin/cad/');
    expect(CONF.app.windows[0].title).toBe('Starr CAD');
    expect(CONF.app.windows[0].minWidth).toBe(1024);
    expect(CONF.app.windows[0].minHeight).toBe(720);
  });

  it('bundle.targets is "all" so Slice T8 can fan out to dmg / msi / AppImage', () => {
    expect(CONF.bundle.active).toBe(true);
    expect(CONF.bundle.targets).toBe('all');
  });
});

describe('default capability — Slice T2 baseline', () => {
  const CAP = JSON.parse(read('src-tauri/capabilities/default.json'));

  it('grants the core baseline + targets the main window only', () => {
    // T2 stamped `core:default` as the floor; subsequent slices
    // (T4 dialog+fs, T6 fs path scope, T7 menu) extend the list.
    // Assert presence — NOT exact equality — so this fixture stays
    // green across the layering.
    expect(CAP.permissions).toContain('core:default');
    expect(CAP.windows).toEqual(['main']);
  });
});

describe('lib.rs — bootstrap + ping IPC', () => {
  const SRC = read('src-tauri/src/lib.rs');

  it('builds the Tauri runtime via the standard `tauri::Builder::default()` chain', () => {
    expect(SRC).toMatch(/tauri::Builder::default\(\)[\s\S]*?\.run\(tauri::generate_context!\(\)\)/);
  });

  it('exposes a `ping` IPC that returns `pong:starr-cad`', () => {
    expect(SRC).toMatch(/#\[tauri::command\]\s*\n\s*fn ping\(\) -> &'static str \{\s*\n\s*"pong:starr-cad"\s*\n\s*\}/);
  });

  it('registers the ping handler in the invoke_handler chain', () => {
    expect(SRC).toMatch(/invoke_handler\(tauri::generate_handler!\[ping\]\)/);
  });
});

describe('main.rs — Windows subsystem guard', () => {
  const SRC = read('src-tauri/src/main.rs');

  it('hides the console window on Windows release builds', () => {
    expect(SRC).toMatch(
      /#!\[cfg_attr\(not\(debug_assertions\), windows_subsystem = "windows"\)\]/,
    );
  });

  it('delegates to the library `run()` entry point', () => {
    expect(SRC).toMatch(/starr_cad_lib::run\(\)/);
  });
});

describe('npm scripts — Tauri commands wired', () => {
  const PKG = JSON.parse(read('package.json'));

  it('`tauri:dev` and `tauri:build` shell out to the Tauri CLI', () => {
    expect(PKG.scripts['tauri']).toBe('tauri');
    expect(PKG.scripts['tauri:dev']).toBe('tauri dev');
    expect(PKG.scripts['tauri:build']).toBe('tauri build');
  });

  it('declares @tauri-apps/api as a runtime dep + @tauri-apps/cli as a devDep', () => {
    expect(PKG.dependencies['@tauri-apps/api']).toMatch(/^\^?2\./);
    expect(PKG.devDependencies['@tauri-apps/cli']).toMatch(/^\^?2\./);
  });
});

describe('.gitignore — Tauri artifacts excluded', () => {
  const SRC = read('.gitignore');

  it('ignores src-tauri/target + gen but COMMITS src-tauri/Cargo.lock', () => {
    expect(SRC).toMatch(/\/src-tauri\/target\//);
    expect(SRC).toMatch(/\/src-tauri\/gen\//);
    // Cargo.lock for the app crate is committed (Tauri convention).
    expect(SRC).not.toMatch(/^Cargo\.lock$/m);
  });
});
