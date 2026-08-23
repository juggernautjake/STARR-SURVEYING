// __tests__/mobile-runbook/check-eas-config.test.ts
//
// mobile-and-customer-query-gap Slice M0 — pre-flight validator for
// `mobile/eas.json`. Locks the placeholder-detection helper + the
// package.json script wiring so `npm run build:ios` can't quietly
// dispatch a build against a REPLACE_WITH_ Apple ID.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('mobile/scripts/check-eas-config.mjs — placeholder walker', () => {
  it('flags every REPLACE_WITH_ leaf with its dotted path', async () => {
    const mod = await import(
      pathToFileURL(path.join(repoRoot, 'mobile/scripts/check-eas-config.mjs')).href
    );
    const result = mod.findPlaceholders({
      submit: {
        production: {
          ios: {
            appleId: 'REPLACE_WITH_APPLE_ID',
            ascAppId: 'REPLACE_WITH_APP_STORE_CONNECT_APP_ID',
            appleTeamId: 'REPLACE_WITH_APPLE_TEAM_ID',
          },
        },
      },
    });
    expect(result).toEqual([
      { path: 'submit.production.ios.appleId', value: 'REPLACE_WITH_APPLE_ID' },
      { path: 'submit.production.ios.ascAppId', value: 'REPLACE_WITH_APP_STORE_CONNECT_APP_ID' },
      { path: 'submit.production.ios.appleTeamId', value: 'REPLACE_WITH_APPLE_TEAM_ID' },
    ]);
  });

  it('returns [] when every placeholder has been filled', async () => {
    const mod = await import(
      pathToFileURL(path.join(repoRoot, 'mobile/scripts/check-eas-config.mjs')).href
    );
    const result = mod.findPlaceholders({
      submit: {
        production: {
          ios: {
            appleId: 'henry@example.com',
            ascAppId: '6483019272',
            appleTeamId: 'A1B2C3D4E5',
          },
        },
      },
    });
    expect(result).toEqual([]);
  });

  it('walks arrays + nested objects without losing the path context', async () => {
    const mod = await import(
      pathToFileURL(path.join(repoRoot, 'mobile/scripts/check-eas-config.mjs')).href
    );
    const result = mod.findPlaceholders({
      profiles: [
        { name: 'prod', appleId: 'REPLACE_WITH_APPLE_ID' },
        { name: 'beta', appleId: 'beta@example.com' },
      ],
    });
    expect(result).toEqual([
      { path: 'profiles[0].appleId', value: 'REPLACE_WITH_APPLE_ID' },
    ]);
  });

  it('treats null + undefined as harmless (no false positive)', async () => {
    const mod = await import(
      pathToFileURL(path.join(repoRoot, 'mobile/scripts/check-eas-config.mjs')).href
    );
    expect(mod.findPlaceholders(null)).toEqual([]);
    expect(mod.findPlaceholders(undefined)).toEqual([]);
  });
});

describe('mobile/eas.json — fresh-checkout state', () => {
  // Source-lock the placeholder still-present state so a future
  // refactor of `eas.json` doesn't accidentally land real credentials
  // into git. The placeholders are the safe shape; real values get
  // edited locally by the operator following the runbook.
  it('still has placeholders so credentials are NOT committed', () => {
    const easSrc = read('mobile/eas.json');
    expect(easSrc).toMatch(/"REPLACE_WITH_APPLE_ID"/);
    expect(easSrc).toMatch(/"REPLACE_WITH_APP_STORE_CONNECT_APP_ID"/);
    expect(easSrc).toMatch(/"REPLACE_WITH_APPLE_TEAM_ID"/);
  });
});

describe('mobile/package.json — Slice M0 script wiring', () => {
  const pkg = JSON.parse(read('mobile/package.json')) as { scripts: Record<string, string> };

  it('exposes a `check-eas` script that runs the validator', () => {
    expect(pkg.scripts['check-eas']).toBe('node scripts/check-eas-config.mjs');
  });

  it('gates the iOS + Android build scripts behind the validator', () => {
    expect(pkg.scripts['build:ios']).toMatch(/^npm run check-eas && eas build/);
    expect(pkg.scripts['build:android']).toMatch(/^npm run check-eas && eas build/);
  });

  it('gates the submit scripts behind the validator', () => {
    expect(pkg.scripts['submit:ios']).toMatch(/^npm run check-eas && eas submit/);
    expect(pkg.scripts['submit:android']).toMatch(/^npm run check-eas && eas submit/);
  });
});

describe('mobile/README_TESTFLIGHT.md — runbook present', () => {
  const README = read('mobile/README_TESTFLIGHT.md');

  it('calls out the bundle id that must match app.json', () => {
    expect(README).toContain('com.starrsoftware.starrfield');
  });

  it('documents the three credentials the operator needs', () => {
    expect(README).toMatch(/Apple ID/);
    expect(README).toMatch(/Team ID/);
    expect(README).toMatch(/App Store Connect App ID/);
  });

  it('points at the validator script', () => {
    expect(README).toContain('check-eas');
  });
});

// ── THE PART THAT WAS NEVER TESTED, AND SO WAS BROKEN FOR MONTHS (2026-08-22) ───────────────────
//
// Every test above imports the helpers. Not one of them RAN the script, and the script's CLI guard
// compared `import.meta.url` with 'file://' + process.argv[1] — true on macOS and Linux, and never
// true on Windows, which is the platform this project is developed on. `npm run check-eas` printed
// nothing, exited 0, and `npm run build:ios` would dispatch a build against placeholder config.
//
// So these spawn the real thing. A guard is only proven by running it.
describe('the validator as a CLI, not as a module', () => {
  const script = path.join(repoRoot, 'mobile', 'scripts', 'check-eas-config.mjs');

  it('exits non-zero and prints a punch list while placeholders remain', () => {
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('refusing to invoke EAS');
    // It must name the file as well as the key — two files are checked now.
    expect(run.stderr).toMatch(/eas\.json: submit\.production\.ios\.appleId/);
  });

  it('checks app.json too, where a build actually dies', () => {
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    // A placeholder OTA url ships an app that can never be updated; a missing projectId means the
    // build has nowhere to go. Neither is visible in eas.json.
    expect(run.stderr).toMatch(/expo\.updates\.url|projectId/);
  });

  it('says something at all — the original bug was silence', () => {
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(`${run.stdout}${run.stderr}`.trim().length).toBeGreaterThan(0);
  });
});

describe('mobile/eas.json — no credentials, because the repo is public', () => {
  it('does not carry the Supabase url or key, even as placeholders', () => {
    // They live in EAS environment variables now. A placeholder here is an invitation to fill it
    // in, and filling it in on a public repo is permanent.
    const eas = JSON.parse(read('mobile/eas.json')) as Record<string, unknown>;
    const serialised = JSON.stringify(eas);
    expect(serialised).not.toMatch(/REPLACE_WITH_SUPABASE/);
    expect(serialised).not.toMatch(/supabase\.co/);
  });
});
