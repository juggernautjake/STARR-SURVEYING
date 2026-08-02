// Two things that only `npm run build` can see, pinned so a green suite stops implying a green deploy.
//
// Both of these shipped on this branch, passed tsc, passed 21,000 tests, and made the production
// build fail outright. Neither is a type error; both are constraints webpack and Next apply at build
// time, which is a step nobody had run since the commits that broke it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(e.name)) walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const APP_FILES = walk(path.join(ROOT, 'app'));

describe('a client component may not reach a server-only module', () => {
  it('no "use client" file imports @/lib/auth', () => {
    // `lib/auth.ts` is the NextAuth config; since audit item 8g it imports the AsyncLocalStorage in
    // lib/saas/org-scope-context, i.e. node:async_hooks. Webpack follows the chain into the browser
    // bundle and refuses:
    //     UnhandledSchemeError: Reading from "node:async_hooks" is not handled by plugins
    // The role vocabulary a client component actually wants lives in @/lib/auth-roles, which imports
    // nothing at all.
    const offenders: string[] = [];
    for (const file of [...APP_FILES, ...walk(path.join(ROOT, 'lib'))]) {
      const src = fs.readFileSync(file, 'utf8');
      if (!/^\s*['"]use client['"]/m.test(src.slice(0, 400))) continue;
      if (/from\s+'@\/lib\/auth'/.test(src)) offenders.push(path.relative(ROOT, file));
    }
    expect(
      offenders,
      `These client components import @/lib/auth, which drags node:async_hooks into the browser
bundle and fails the production build. Import roles from '@/lib/auth-roles':\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the role module it points at stays free of imports', () => {
    // The whole guarantee is that this file pulls nothing in. One convenience import from something
    // that later grows a server dependency puts the problem back, silently.
    const src = fs.readFileSync(path.join(ROOT, 'lib/auth-roles.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});

describe('a route file exports only its handlers', () => {
  it('no app/api route exports a value Next does not allow', () => {
    // Next type-checks generated route types against a "nothing else" constraint. A stray
    // `export const BUCKETS` fails the build with "Property 'BUCKETS' is incompatible with index
    // signature" — a message that names the symbol but not the rule. Types are fine (erased);
    // runtime values are not.
    const ALLOWED = new Set([
      'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
      'dynamic', 'dynamicParams', 'revalidate', 'fetchCache', 'runtime', 'preferredRegion',
      'maxDuration', 'config', 'generateStaticParams', 'metadata', 'generateMetadata',
    ]);
    const offenders: string[] = [];
    for (const file of APP_FILES) {
      if (!/[\\/]route\.tsx?$/.test(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^export\s+(?:const|let|var|function|async function|class)\s+([A-Za-z0-9_$]+)/gm)) {
        if (!ALLOWED.has(m[1]!)) offenders.push(`${path.relative(ROOT, file)} → ${m[1]}`);
      }
    }
    expect(
      offenders,
      `Route files may export only handlers and Next's config keys. Move these into lib/:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
