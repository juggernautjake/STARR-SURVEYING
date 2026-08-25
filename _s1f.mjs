import fs from 'node:fs';
const eolOf = (s) => ((s.match(/\r\n/g) || []).length > (s.split('\n').length - 1) / 2 ? '\r\n' : '\n');
const swap = (p, a, b) => {
  let s = fs.readFileSync(p, 'utf8');
  const eol = eolOf(s);
  const f = a.join(eol);
  const t = b.join(eol);
  if (s.split(f).length - 1 !== 1) throw new Error(`${p}: anchor not unique: ${a[0].slice(0, 55)}`);
  fs.writeFileSync(p, s.split(f).join(t));
  console.log('  patched', p);
};

// ── Deriver: keep the rows, not just the routes, and hoist the import ─────────────────────────
swap('scripts/derive-dossiers.mjs',
  [
    `const existing = new Set(((await existingRes.json()).dossiers ?? [])`,
    `  .filter((d) => d.elementCount > 0)`,
    `  .map((d) => d.route));`,
    ``,
    `import { staleRoutes, routesChangedSince } from '../lib/design/staleness.ts';`,
  ],
  [
    `// Kept as ROWS rather than collapsed straight into a Set: \`--stale\` needs \`derivedAt\` off the`,
    `// same fetch, and asking for the list twice to get one more field is how a script ends up with two`,
    `// slightly different pictures of the same table.`,
    `const dossierRows = (await existingRes.json()).dossiers ?? [];`,
    `const existing = new Set(dossierRows.filter((d) => d.elementCount > 0).map((d) => d.route));`,
  ]);

// The import belongs at the top with the others, not halfway down the file.
swap('scripts/derive-dossiers.mjs',
  [`import { waitForPageReady } from './lib/design-observe.mjs';`],
  [
    `import { waitForPageReady } from './lib/design-observe.mjs';`,
    `// The same rule the page list and the tracer use. One definition of "the record is behind the`,
    `// page", so the queue and the tools that empty it cannot disagree.`,
    `import { staleRoutes, routesChangedSince } from '../lib/design/staleness.ts';`,
  ]);

// ── Conformance: it needs the inventory and the rule ──────────────────────────────────────────
swap('scripts/check-design-conformance.mjs',
  [`import { waitForPageReady } from './lib/design-observe.mjs';`],
  [
    `import { waitForPageReady } from './lib/design-observe.mjs';`,
    `import { routesChangedSince } from '../lib/design/staleness.ts';`,
    ``,
    `const PAGES = JSON.parse(fs.readFileSync('lib/design/pages.generated.json', 'utf8'));`,
  ]);

console.log('S1: the references now exist');
