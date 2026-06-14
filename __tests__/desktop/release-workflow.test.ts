// __tests__/desktop/release-workflow.test.ts
//
// cad-desktop-tauri-and-perf Slice T8 — desktop release workflow.
// Source-locks the CI matrix + tauri.conf.json bundle knobs so a
// future contributor can't silently drop the signing wiring or
// the cross-platform build targets.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('desktop-release.yml — trigger + concurrency', () => {
  const SRC = read('.github/workflows/desktop-release.yml');

  it('fires on every `v*` tag push and on manual dispatch', () => {
    expect(SRC).toMatch(/tags:\s*\n\s*- 'v\*'/);
    expect(SRC).toMatch(/workflow_dispatch:/);
  });

  it('concurrency group is keyed on github.ref so multiple tags don\'t collide', () => {
    expect(SRC).toMatch(/group: desktop-release-\$\{\{ github\.ref \}\}/);
    expect(SRC).toMatch(/cancel-in-progress: false/);
  });
});

describe('desktop-release.yml — build matrix', () => {
  const SRC = read('.github/workflows/desktop-release.yml');

  it('includes all four target platforms (macOS arm64 + intel, Windows, Linux)', () => {
    for (const platform of ['macos-arm64', 'macos-intel', 'windows', 'linux']) {
      expect(SRC).toMatch(new RegExp(`platform: ${platform}`));
    }
  });

  it('matches each platform to the right runner image', () => {
    expect(SRC).toMatch(/platform: macos-arm64\s*\n\s*runner: macos-14/);
    expect(SRC).toMatch(/platform: macos-intel\s*\n\s*runner: macos-13/);
    expect(SRC).toMatch(/platform: windows\s*\n\s*runner: windows-latest/);
    expect(SRC).toMatch(/platform: linux\s*\n\s*runner: ubuntu-22\.04/);
  });

  it('matches each platform to the correct rust target triple', () => {
    expect(SRC).toMatch(/target: aarch64-apple-darwin/);
    expect(SRC).toMatch(/target: x86_64-apple-darwin/);
    expect(SRC).toMatch(/target: x86_64-pc-windows-msvc/);
    expect(SRC).toMatch(/target: x86_64-unknown-linux-gnu/);
  });

  it('uses fail-fast: false so one OS failure doesn\'t kill the others', () => {
    expect(SRC).toMatch(/fail-fast: false/);
  });
});

describe('desktop-release.yml — toolchain + cache', () => {
  const SRC = read('.github/workflows/desktop-release.yml');

  it('installs the Rust stable toolchain via dtolnay/rust-toolchain', () => {
    expect(SRC).toMatch(/uses: dtolnay\/rust-toolchain@stable/);
  });

  it('caches the src-tauri Cargo target via swatinem/rust-cache', () => {
    expect(SRC).toMatch(/uses: swatinem\/rust-cache@v2/);
    expect(SRC).toMatch(/workspaces: 'src-tauri -> target'/);
  });

  it('installs the Linux GTK / WebKit / appindicator deps before bundling', () => {
    expect(SRC).toMatch(/libwebkit2gtk-4\.1-dev/);
    expect(SRC).toMatch(/libgtk-3-dev/);
    expect(SRC).toMatch(/libayatana-appindicator3-dev/);
    expect(SRC).toMatch(/librsvg2-dev/);
  });

  it('passes --legacy-peer-deps to npm ci (matches the rest of the repo\'s CI)', () => {
    expect(SRC).toMatch(/npm ci --legacy-peer-deps/);
  });
});

describe('desktop-release.yml — tauri-action signing env', () => {
  const SRC = read('.github/workflows/desktop-release.yml');

  it('runs tauri-apps/tauri-action@v0', () => {
    expect(SRC).toMatch(/uses: tauri-apps\/tauri-action@v0/);
  });

  it('mirrors STARR_BUILD_TARGET=desktop into the env (belt + suspenders for Slice T1)', () => {
    expect(SRC).toMatch(/STARR_BUILD_TARGET: desktop/);
  });

  it('forwards every macOS notarization secret', () => {
    for (const key of [
      'APPLE_CERTIFICATE',
      'APPLE_CERTIFICATE_PASSWORD',
      'APPLE_SIGNING_IDENTITY',
      'APPLE_ID',
      'APPLE_PASSWORD',
      'APPLE_TEAM_ID',
    ]) {
      expect(SRC).toMatch(new RegExp(`${key}: \\$\\{\\{ secrets\\.${key} \\}\\}`));
    }
  });

  it('forwards Windows .pfx signing secrets', () => {
    expect(SRC).toMatch(/WINDOWS_CERTIFICATE: \$\{\{ secrets\.WINDOWS_CERTIFICATE \}\}/);
    expect(SRC).toMatch(/WINDOWS_CERTIFICATE_PASSWORD: \$\{\{ secrets\.WINDOWS_CERTIFICATE_PASSWORD \}\}/);
  });

  it('forwards Tauri updater-manifest signing secrets', () => {
    expect(SRC).toMatch(/TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/);
    expect(SRC).toMatch(/TAURI_SIGNING_PRIVATE_KEY_PASSWORD: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD \}\}/);
  });

  it('produces a DRAFT release named after the tag', () => {
    expect(SRC).toMatch(/tagName: \$\{\{ github\.ref_name \}\}/);
    expect(SRC).toMatch(/releaseDraft: true/);
  });
});

describe('tauri.conf.json — Slice T8 bundle metadata', () => {
  const CONF = JSON.parse(read('src-tauri/tauri.conf.json'));

  it('declares a minimum macOS version (10.15 = Catalina) for tauri-action', () => {
    expect(CONF.bundle.macOS.minimumSystemVersion).toBe('10.15');
  });

  it('keeps bundle.targets: "all" so each runner picks every applicable format', () => {
    expect(CONF.bundle.targets).toBe('all');
  });
});
