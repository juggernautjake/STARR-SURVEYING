#!/usr/bin/env node
// mobile/scripts/check-eas-config.mjs
//
// mobile-and-customer-query-gap Slice M0 — pre-flight for `eas build` / `eas submit`. Refuses to
// invoke EAS while the config still has a `REPLACE_WITH_*` placeholder, so nobody burns fifteen
// minutes of build queue producing an app that points at nothing.
//
// Exits 0 when the config is operator-ready, 1 with a printed punch list otherwise. Wired into
// package.json as `check-eas`, and called by every `build:*` / `submit:*` script.
//
// ── TWO THINGS IT GOT WRONG, FOUND 2026-08-22 ───────────────────────────────────────────────────
//
//  1. It never ran on Windows. See the guard at the bottom — the reason is worth reading, because a
//     check that silently passes is worse than no check.
//  2. It only looked at eas.json, and eas.json is not where a build actually dies: `app.json`
//     carried `updates.url = "REPLACE_WITH_EAS_UPDATE_URL"` and no `extra.eas.projectId`, either of
//     which is fatal — one loudly, one as a silence months later when no OTA update ever arrives.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EAS_PATH = resolve(__dirname, '..', 'eas.json');
const APP_PATH = resolve(__dirname, '..', 'app.json');

/** Returns the array of placeholder string occurrences inside
 *  `obj`. Each entry is `{ path, value }` keyed by the dotted
 *  path to the offending leaf so the printout points exactly
 *  where to edit. */
export function findPlaceholders(obj, path = '') {
  const out = [];
  if (obj == null) return out;
  if (typeof obj === 'string') {
    if (obj.startsWith('REPLACE_WITH_')) {
      out.push({ path, value: obj });
    }
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      out.push(...findPlaceholders(item, `${path}[${i}]`));
    });
    return out;
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const nextPath = path ? `${path}.${key}` : key;
      out.push(...findPlaceholders(value, nextPath));
    }
    return out;
  }
  return out;
}

/**
 * What is wrong with `app.json`, in terms an operator can act on.
 *
 * Separate from the placeholder walk because these are not all placeholders: a MISSING
 * `extra.eas.projectId` is just as fatal as a placeholder one, and nothing about an absent key
 * looks wrong when you read the file.
 */
export function findAppConfigProblems(app) {
  const problems = [];
  const expo = app?.expo ?? {};
  const updatesUrl = expo.updates?.url;

  if (typeof updatesUrl === 'string' && updatesUrl.startsWith('REPLACE_WITH_')) {
    problems.push({
      what: 'expo.updates.url is still a placeholder',
      why: 'the app builds and installs perfectly, then never receives an OTA update',
      fix: 'run `eas update:configure` — it writes the real https://u.expo.dev/<projectId>',
    });
  }
  if (expo.updates?.enabled && !updatesUrl) {
    problems.push({
      what: 'expo.updates.enabled is true but there is no updates.url',
      why: 'the client has nowhere to ask for an update',
      fix: 'run `eas update:configure`',
    });
  }
  if (!expo.extra?.eas?.projectId) {
    problems.push({
      what: 'expo.extra.eas.projectId is missing',
      why: 'EAS cannot tell which project this is, so a build has nowhere to go',
      fix: 'run `eas init` while signed in — it writes the id into app.json',
    });
  }
  return problems;
}

/**
 * The two values the app cannot run without.
 *
 * They are deliberately NOT in eas.json: this repository is PUBLIC, and a URL and key committed
 * here would be committed forever. EAS holds them (`eas env:create`), which is also the only place
 * a cloud build can read them from.
 *
 * Reported, never enforced — this machine is not the build machine, so their absence here proves
 * nothing about the EAS project. `mobile/lib/supabase.ts` throws by name if they are missing at
 * runtime, so being wrong about this is loud rather than silent.
 */
const REQUIRED_BUILD_ENV = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];

function readJson(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    console.error(`check-eas: couldn't read ${path}:`, err.message);
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`check-eas: ${path} is not valid JSON:`, err.message);
    process.exit(1);
  }
}

function main() {
  const easConfig = readJson(EAS_PATH);
  const appConfig = readJson(APP_PATH);

  const placeholders = [
    ...findPlaceholders(easConfig).map((x) => ({ ...x, file: 'eas.json' })),
    ...findPlaceholders(appConfig).map((x) => ({ ...x, file: 'app.json' })),
  ];
  const appProblems = findAppConfigProblems(appConfig);

  if (placeholders.length === 0 && appProblems.length === 0) {
    console.log('check-eas: ok (eas.json and app.json are operator-ready)');
    const unset = REQUIRED_BUILD_ENV.filter((key) => !process.env[key]);
    if (unset.length) {
      console.log('');
      console.log('check-eas: note — these are not set in THIS shell. EAS holds them for the build:');
      for (const key of unset) {
        console.log(`  eas env:create --name ${key} --value <value> --environment production`);
      }
    }
    process.exit(0);
  }

  console.error('check-eas: refusing to invoke EAS.');
  if (placeholders.length) {
    console.error('');
    console.error('  Placeholders still in place:');
    for (const { file, path, value } of placeholders) {
      console.error(`    ${file}: ${path} = "${value}"`);
    }
  }
  if (appProblems.length) {
    console.error('');
    console.error('  app.json:');
    for (const { what, why, fix } of appProblems) {
      console.error(`    ${what}`);
      console.error(`      → ${why}`);
      console.error(`      → ${fix}`);
    }
  }
  console.error('');
  console.error('Fill these in following mobile/SETUP_GUIDE_IPHONE_ANDROID.md, then re-run.');
  process.exit(1);
}

// ── RUN WHEN INVOKED AS A CLI, ON EVERY PLATFORM (fixed 2026-08-22) ─────────────────────────────
//
// This used to compare `import.meta.url` against 'file://' + process.argv[1]. That is true on macOS
// and Linux, and can NEVER be true on Windows: argv[1] is a backslashed drive path (C:\dev\…) while
// `import.meta.url` is file:///C:/dev/…. So on the machine this project is actually developed on,
// the pre-flight exited 0 having checked nothing, and `npm run build:ios` would cheerfully dispatch
// a build against placeholder config — the precise thing it exists to prevent.
//
// `pathToFileURL` is the platform-correct conversion. The helpers stay exported for the tests, which
// passed throughout: they import the functions and never ran the CLI, which is exactly how a guard
// like this stays broken.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
