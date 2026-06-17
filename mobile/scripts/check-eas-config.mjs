#!/usr/bin/env node
// mobile/scripts/check-eas-config.mjs
//
// mobile-and-customer-query-gap Slice M0 — pre-flight for
// `eas build` / `eas submit`. Refuses to invoke EAS while
// `mobile/eas.json` still has a `REPLACE_WITH_*` placeholder.
// Catches the easy operator mistake of running `eas submit
// --profile production --platform ios` against a placeholder
// Apple ID and burning 15 min of build queue.
//
// Exits 0 when the config is operator-ready, 1 with a printed
// punch list otherwise. Wire into package.json as
//   "check-eas": "node scripts/check-eas-config.mjs"
// then call `npm run check-eas` before any build.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EAS_PATH = resolve(__dirname, '..', 'eas.json');

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

function main() {
  let raw;
  try {
    raw = readFileSync(EAS_PATH, 'utf8');
  } catch (err) {
    console.error(`check-eas: couldn't read ${EAS_PATH}:`, err.message);
    process.exit(1);
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    console.error(`check-eas: ${EAS_PATH} is not valid JSON:`, err.message);
    process.exit(1);
  }

  const placeholders = findPlaceholders(config);
  if (placeholders.length === 0) {
    console.log('check-eas: ok (no REPLACE_WITH_* placeholders left)');
    process.exit(0);
  }

  console.error('check-eas: eas.json still has placeholders — refusing to invoke EAS:');
  console.error('');
  for (const { path, value } of placeholders) {
    console.error(`  ${path} = "${value}"`);
  }
  console.error('');
  console.error(
    'Fill these in following mobile/README_TESTFLIGHT.md, then re-run.',
  );
  process.exit(1);
}

// Only run when invoked as a CLI; the module exports
// `findPlaceholders` for unit tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
