// Every internal /dnd link points at something that exists.
//
// The owner's ask was direct: "IF there are links that are not working correctly, then remove them
// or fix them." Many per-feature reachability tests already exist (campaign-map-reachable,
// library-reachability, homebrew-designer-reachability, and more), but each pins ONE link it was
// written for. Nothing checked the set. A link added tomorrow to a route renamed next month is
// exactly the gap those tests leave open.
//
// The answer today is that the D&D tree is clean — this check found no broken links on the run that
// introduced it. It is here to keep that true, which is the only useful moment to add a ratchet.
//
// TWO FALSE POSITIVES SHAPED THIS CHECK, and both are the reason it resolves the way it does. A
// first pass flagged `/dnd/maps/planet-3d.html` (a real file in `public/dnd/maps/`, served
// statically and never an App Router route) and `/dnd5e-build` (a path inside a JSDoc comment,
// naming an API route, not a link at all). Reporting those as bugs would have been two bug reports
// against working code. So: `public/` counts as a destination, and comments are stripped first.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '.next') walk(p, out);
    } else out.push(p);
  }
  return out;
}

/** Every pathname the App Router serves, with route groups and parallel segments removed. */
const routes: string[] = walk(path.join(ROOT, 'app'))
  .filter((f) => /[\\/](page|route)\.(tsx|ts|jsx|js)$/.test(f))
  .map((f) => {
    const rel = path.relative(path.join(ROOT, 'app'), f).replace(/\\/g, '/')
      .replace(/\/(page|route)\.(tsx|ts|jsx|js)$/, '');
    return '/' + rel.split('/').filter((s) => !/^\(.*\)$/.test(s) && !/^@/.test(s)).join('/');
  });

const routeSet = new Set(routes);

/** Matches a concrete pathname against the route table, honouring [param] and [...catchAll]. */
function routeExists(pathname: string): boolean {
  if (routeSet.has(pathname)) return true;
  const parts = pathname.split('/').filter(Boolean);
  return routes.some((r) => {
    const rp = r.split('/').filter(Boolean);
    let i = 0, j = 0;
    while (i < rp.length) {
      const seg = rp[i];
      if (/^\[\[?\.\.\..*\]\]?$/.test(seg)) return true;   // catch-all swallows the remainder
      if (j >= parts.length) return false;
      if (!/^\[.*\]$/.test(seg) && seg !== parts[j]) return false;
      i++; j++;
    }
    return j === parts.length;
  });
}

/** A static file under public/ is a perfectly good destination — the standalone map tools are
 *  served that way on purpose (see the Stardust Map Studio work). */
function publicFileExists(pathname: string): boolean {
  return fs.existsSync(path.join(ROOT, 'public', pathname.replace(/^\//, '')));
}

/** Comments are stripped before scanning: a path named in prose is documentation, not a link, and
 *  the first version of this test failed on exactly that. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
}

const sourceFiles = [
  ...walk(path.join(ROOT, 'app', 'dnd')),
  ...walk(path.join(ROOT, 'lib', 'dnd')),
].filter((f) => /\.(tsx|ts)$/.test(f) && !/\.test\.[tj]sx?$/.test(f));

const LINK = /["'`](\/dnd[^"'`\n]*)["'`]/g;

type Hit = { link: string; file: string };

function collect(): Hit[] {
  const hits: Hit[] = [];
  for (const f of sourceFiles) {
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    for (const m of src.matchAll(LINK)) {
      const raw = m[1];
      // Anything interpolated cannot be resolved statically. Skipping is honest; guessing is not.
      if (raw.includes('${')) continue;
      const clean = raw.split('?')[0].split('#')[0].replace(/\/$/, '') || '/dnd';
      hits.push({ link: clean, file: path.relative(ROOT, f).replace(/\\/g, '/') });
    }
  }
  return hits;
}

describe('the probe itself is looking at something', () => {
  // A link checker that finds no links passes forever while defending nothing. This is the failure
  // mode that made the FIRST version of this probe report "0 broken" from 13 links — widening it
  // found 22 and two things worth investigating.
  it('discovers the app route table', () => {
    expect(routes.length).toBeGreaterThan(500);
  });

  it('finds a meaningful number of D&D links to check', () => {
    expect(new Set(collect().map((h) => h.link)).size).toBeGreaterThanOrEqual(15);
  });

  it('resolves a route that certainly exists, and rejects one that certainly does not', () => {
    expect(routeExists('/dnd')).toBe(true);
    expect(routeExists('/dnd/definitely-not-a-real-route-xyz')).toBe(false);
  });
});

describe('every static internal /dnd link resolves', () => {
  it('points at an App Router route or a file in public/', () => {
    const broken = collect().filter(
      (h) => !routeExists(h.link) && !publicFileExists(h.link),
    );
    const report = broken
      .map((b) => `  ${b.link}  <- ${b.file}`)
      .join('\n');
    expect(report, `broken /dnd links:\n${report}`).toBe('');
  });
});
