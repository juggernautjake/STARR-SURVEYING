// scripts/design-catalogue-scan.mjs — what elements does the employee portal actually contain?
//
// Slice C1 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.
//
// ── WHY A SCANNER AND NOT A LIST ────────────────────────────────────────────────────────────────
//
// The Design Studio's palette is supposed to hold "a version of every element on the current
// backend employee portal from every page". Counted on 2026-08-23, that surface is:
//
//     55 stylesheets · 49,722 lines · 6,827 class names · 600 BEM blocks
//     558 .tsx files · 37 <style jsx> blocks · 3,255 inline style={{ … }} sites
//
// Nobody is hand-listing that, and a hand-written palette would be wrong the week after it was
// written. So the palette is DERIVED: this script records what is there, with provenance, and a
// person curates the result into categories (slices C4–C8).
//
// ── FOUR SOURCES, BECAUSE THERE ARE FOUR ────────────────────────────────────────────────────────
//
//   1. CSS rule sets            — the shape, colour and size of everything with a class name.
//   2. JSX className usage      — which classes are REAL (used) and where, and what markup they
//                                 wear. A catalogue entry's HTML should come from the most common
//                                 real usage, not from someone's idea of the markup.
//   3. Inline style={{ … }}     — 3,255 of them. A third of what the app looks like is not in any
//                                 stylesheet. A CSS-only scan would be confidently incomplete, and
//                                 would miss exactly the elements that look wrong — because ad-hoc
//                                 inline styling is what makes an element inconsistent.
//   4. <style jsx> blocks       — CSS that a stylesheet walker cannot see.
//
// This script is deliberately DUMB AND COMPLETE. It does not decide what counts as an "element";
// it records everything with a file and a line. Deciding is curation, and curation is a person.
//
// Usage:
//   node scripts/design-catalogue-scan.mjs            # scan, write lib/design/catalogue/raw/*.json
//   node scripts/design-catalogue-scan.mjs --summary  # scan, print the summary, write nothing

import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// ── SCOPE: THE WHOLE SITE, TAGGED BY AREA ───────────────────────────────────────────────────────
//
// Owner, 2026-08-23: *"meticulously scan each and every page and fully scrub everything so that we
// can get and categorize every element on the website, both for the frontend and the backend."*
//
// So this walks all of `app/`, not just the admin portal, and tags every finding with the AREA it
// came from. Area is not cosmetic: the marketing site and the employee portal have deliberately
// different vocabularies (see `tokens.css` on the customer-facing document surfaces — "a proposal
// reads as a document rather than as a screen from somebody's internal tool"), and a palette that
// mixed them would offer a marketing hero button for an admin toolbar.
const ROOTS = ['app'];
const SKIP_DIRS = new Set(['api']);   // route handlers render no elements
const SHARED_CSS = [
  'app/styles/tokens.css',
  'app/styles/forms.css',
  'app/styles/density.css',
  'app/styles/themes.css',
];
const OUT_DIR = 'lib/design/catalogue/raw';
const SUMMARY_ONLY = process.argv.includes('--summary');

// ── FILE WALK ───────────────────────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const all = ROOTS.flatMap((r) => walk(r));
const cssFiles = [...new Set([...all.filter((f) => f.endsWith('.css')), ...SHARED_CSS])];
const tsxFiles = all.filter((f) => f.endsWith('.tsx'));

/** A file path → the admin route it belongs to, or null for a shared component.
 *
 *  `app/admin/jobs/[id]/page.tsx` → `/admin/jobs/[id]`. Components under `components/` belong to no
 *  single route, and saying so is more useful than guessing one. */
/** Which surface a file belongs to. The palette filters on this, and the catalogue records it so an
 *  entry can never be offered on a surface it does not belong to. */
export function areaOf(file) {
  const p = file.split(sep).join('/');
  if (p.startsWith('app/admin/cad')) return 'cad';
  if (p.startsWith('app/admin/research')) return 'research';
  if (p.startsWith('app/admin')) return 'admin';
  if (p.startsWith('app/dnd')) return 'dnd';
  if (p.startsWith('app/AndrewAsh')) return 'andrew-ash';
  if (/^app\/(portal|pay|proposal|change-order|share)\b/.test(p)) return 'customer';
  if (/^app\/(register|signup|credentials)\b/.test(p)) return 'auth';
  if (p.startsWith('app/styles/')) return 'shared';
  if (p.startsWith('app/components/')) return 'shared';
  if (/^app\/(ux-harness|cad-harness|\(dev\))/.test(p)) return 'harness';
  return 'marketing';
}

function routeOf(file) {
  const parts = relative('.', file).split(sep);
  if (parts.includes('components')) return null;
  const last = parts[parts.length - 1];
  if (!/^(page|layout|template)\.tsx$/.test(last)) return null;
  // Route groups — `app/(dev)/foo/page.tsx` is `/foo` — are URL-invisible by design, so they must
  // not appear in the route a catalogue entry cites.
  const cleaned = parts.filter((s) => !/^\(.+\)$/.test(s));
  return '/' + cleaned.slice(1, -1).join('/');
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// ── 1 + 4. CSS ──────────────────────────────────────────────────────────────────────────────────

/**
 * Parse a stylesheet into rule sets.
 *
 * Hand-rolled rather than a PostCSS dependency: this needs four things (selector, declarations,
 * line, enclosing @media) and adding a parser dependency to read our own CSS is not a trade worth
 * making. Comments are stripped first so a `{` inside one cannot open a phantom block — the same
 * brace-matching lesson `scripts/scan-inline-style-hex.ts` learned the hard way.
 */
export function parseCss(css, file) {
  const rules = [];
  // Blank out comments, preserving length and newlines so every reported line number stays true.
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

  let i = 0;
  const atStack = [];   // enclosing @media / @supports conditions

  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) break;

    let prelude = src.slice(i, open).trim();
    // A closing brace inside the prelude means we just left a block; pop the at-rule stack.
    const closes = prelude.split('}').length - 1;
    for (let c = 0; c < closes; c += 1) atStack.pop();
    prelude = prelude.slice(prelude.lastIndexOf('}') + 1).trim();

    if (prelude.startsWith('@')) {
      atStack.push(prelude);
      i = open + 1;
      continue;
    }

    // Find the matching close for this declaration block.
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') depth -= 1;
      j += 1;
    }
    const body = src.slice(open + 1, j - 1);

    if (prelude) {
      const declarations = {};
      for (const decl of body.split(';')) {
        const colon = decl.indexOf(':');
        if (colon === -1) continue;
        const prop = decl.slice(0, colon).trim();
        const value = decl.slice(colon + 1).trim();
        if (prop && value && !prop.includes('{')) declarations[prop] = value;
      }
      for (const selector of prelude.split(',').map((s) => s.trim()).filter(Boolean)) {
        rules.push({
          file,
          line: lineOf(src, open),
          selector,
          media: atStack.filter((a) => a.startsWith('@media')).join(' and ') || null,
          classes: [...selector.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1]),
          declarations,
        });
      }
    }
    i = j;
  }
  return rules;
}

// ── 2 + 3. JSX ──────────────────────────────────────────────────────────────────────────────────

/** The opening tag an attribute belongs to — searched backwards from the attribute's index. */
function tagAt(src, index) {
  const open = src.lastIndexOf('<', index);
  if (open === -1) return null;
  const m = /^<\s*([A-Za-z][A-Za-z0-9.]*)/.exec(src.slice(open, index));
  return m ? m[1] : null;
}

/**
 * Every class name this file mentions, with the tag it sits on.
 *
 * Handles the four forms this codebase actually writes:
 *   className="a b"                     · a plain string
 *   className={`a ${x ? 'b' : ''}`}     · a template literal — literal parts only
 *   className={cond ? 'a' : 'b'}        · a conditional — both branches
 *   className={styles.foo}              · a reference — nothing to extract, skipped honestly
 */
export function parseClassUsage(src, file) {
  const out = [];
  for (const m of src.matchAll(/className=(?:"([^"]*)"|'([^']*)'|\{([\s\S]{0,400}?)\})/g)) {
    const [, dq, sq, expr] = m;
    const literals = [];
    if (dq !== undefined) literals.push(dq);
    if (sq !== undefined) literals.push(sq);
    if (expr !== undefined) {
      for (const s of expr.matchAll(/['"`]([^'"`]*)['"`]/g)) literals.push(s[1]);
    }
    const classes = literals
      .join(' ')
      .split(/\s+/)
      .map((c) => c.trim())
      .filter((c) => c && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c));
    if (!classes.length) continue;
    out.push({ file, line: lineOf(src, m.index), tag: tagAt(src, m.index), classes });
  }
  return out;
}

/**
 * Inline `style={{ … }}` objects, with the tag and the classes on the same element.
 *
 * The pairing is the point. An element that wears `.jobs-page__btn` AND carries an inline
 * `height: 36` is telling you the class did not do what its author needed — which is either a gap
 * in the design system or a drift away from it. Those are the divergences §14 reports on.
 */
export function parseInlineStyles(src, file) {
  const out = [];
  for (const m of src.matchAll(/style=\{\{/g)) {
    const start = m.index + m[0].length;
    let depth = 2;      // the two braces just consumed
    let i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
      i += 1;
    }
    const body = src.slice(start, i - 2);
    if (body.length > 2000) continue;   // a computed monster, not a style declaration

    const declarations = {};
    for (const d of body.matchAll(/([a-zA-Z][a-zA-Z0-9]*)\s*:\s*([^,]+?)(?=,\s*[a-zA-Z]+\s*:|,?\s*$)/g)) {
      declarations[d[1]] = d[2].trim().replace(/\s+/g, ' ');
    }
    if (!Object.keys(declarations).length) continue;

    // Which element is this on, and what classes does it already wear?
    const tagOpen = src.lastIndexOf('<', m.index);
    const tagText = tagOpen === -1 ? '' : src.slice(tagOpen, m.index);
    const classes = [...tagText.matchAll(/className=(?:"([^"]*)"|\{[^}]*['"`]([^'"`]*)['"`])/g)]
      .flatMap((c) => (c[1] ?? c[2] ?? '').split(/\s+/))
      .filter((c) => c && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c));

    out.push({
      file,
      area: areaOf(file),
      line: lineOf(src, m.index),
      tag: tagAt(src, m.index),
      classes,
      declarations,
    });
  }
  return out;
}

/** `<style jsx>` bodies — CSS that lives in a component and no stylesheet walker would ever see. */
export function parseStyledJsx(src, file) {
  const blocks = [];
  for (const m of src.matchAll(/<style\s+jsx[^>]*>\{`([\s\S]*?)`\}<\/style>/g)) {
    blocks.push({ line: lineOf(src, m.index), css: m[1] });
  }
  return blocks;
}

// ── RUN ─────────────────────────────────────────────────────────────────────────────────────────

const cssRules = [];
for (const file of cssFiles) {
  try {
    cssRules.push(...parseCss(readFileSync(file, 'utf8'), file.split(sep).join('/')));
  } catch (err) {
    console.error(`  ! could not read ${file}: ${err.message}`);
  }
}

const usage = [];
const inline = [];
const styledJsxRules = [];
const routeByFile = new Map();

for (const file of tsxFiles) {
  const src = readFileSync(file, 'utf8');
  const rel = file.split(sep).join('/');
  routeByFile.set(rel, routeOf(file));
  usage.push(...parseClassUsage(src, rel));
  inline.push(...parseInlineStyles(src, rel));
  for (const block of parseStyledJsx(src, rel)) {
    styledJsxRules.push(...parseCss(block.css, `${rel}:<style jsx>@${block.line}`));
  }
}

// ── AGGREGATE: one record per class name ────────────────────────────────────────────────────────
//
// This is the join that makes the raw scan usable: a class name, everything CSS says about it,
// everywhere JSX uses it, and which tags it lands on.

const byClass = new Map();
const touch = (name) => {
  if (!byClass.has(name)) {
    byClass.set(name, {
      name,
      block: name.split(/__|--/)[0],
      modifier: name.includes('--') ? name.slice(name.indexOf('--') + 2) : null,
      element: name.includes('__') ? name.slice(name.indexOf('__') + 2).split('--')[0] : null,
      rules: [],
      usageCount: 0,
      tags: {},
      routes: {},
      areas: {},
      files: new Set(),
    });
  }
  return byClass.get(name);
};

for (const rule of [...cssRules, ...styledJsxRules]) {
  for (const name of rule.classes) {
    touch(name).rules.push({
      file: rule.file, line: rule.line, selector: rule.selector, media: rule.media,
      declarations: rule.declarations,
    });
  }
}

for (const u of usage) {
  for (const name of u.classes) {
    const rec = touch(name);
    rec.usageCount += 1;
    if (u.tag) rec.tags[u.tag] = (rec.tags[u.tag] ?? 0) + 1;
    const route = routeByFile.get(u.file);
    if (route) rec.routes[route] = (rec.routes[route] ?? 0) + 1;
    const area = areaOf(u.file);
    rec.areas[area] = (rec.areas[area] ?? 0) + 1;
    rec.files.add(u.file);
  }
}

const classes = [...byClass.values()]
  .map((c) => ({ ...c, files: [...c.files].sort(), styled: c.rules.length > 0 }))
  .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));

const areaTotals = {};
for (const c of classes) for (const [a, n] of Object.entries(c.areas)) areaTotals[a] = (areaTotals[a] ?? 0) + n;

const summary = {
  scannedAt: null,          // stamped by the caller; this script stays deterministic
  cssFiles: cssFiles.length,
  tsxFiles: tsxFiles.length,
  cssRules: cssRules.length,
  styledJsxRules: styledJsxRules.length,
  classUsageSites: usage.length,
  inlineStyleSites: inline.length,
  distinctClasses: classes.length,
  distinctBlocks: new Set(classes.map((c) => c.block)).size,
  stylesButUnused: classes.filter((c) => c.styled && c.usageCount === 0).length,
  usedButUnstyled: classes.filter((c) => !c.styled && c.usageCount > 0).length,
  byArea: areaTotals,
};

console.log('\n  Design catalogue scan\n');
for (const [k, v] of Object.entries(summary)) {
  if (v === null || k === 'byArea') continue;
  console.log(`  ${k.padEnd(20)} ${v}`);
}
console.log('\n  class usages by area:');
for (const [a, n] of Object.entries(summary.byArea).sort((x, y) => y[1] - x[1])) {
  console.log(`    ${String(n).padStart(6)}  ${a}`);
}

console.log('\n  Most-used classes (the palette starts here):');
for (const c of classes.slice(0, 25)) {
  const tag = Object.entries(c.tags).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  console.log(`    ${String(c.usageCount).padStart(4)}×  <${tag}> .${c.name}${c.styled ? '' : '   (no CSS rule)'}`);
}

if (!SUMMARY_ONLY) {
  mkdirSync(OUT_DIR, { recursive: true });
  const write = (name, data) => {
    writeFileSync(join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
    const kb = Math.round(statSync(join(OUT_DIR, name)).size / 1024);
    console.log(`    wrote ${OUT_DIR}/${name} (${kb} KB)`);
  };
  console.log('');
  write('summary.json', summary);
  write('classes.json', classes);
  write('inline-styles.json', inline);
}

console.log('');
