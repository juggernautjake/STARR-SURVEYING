// scripts/lib/css-conflicts.mjs — one implementation of "where do the stylesheets argue".
//
// Shared by scripts/design-conflict-report.mjs (the human-readable report) and
// __tests__/admin-styling/one-design-system.test.ts (the gate). Deliberately ONE copy: this whole
// module exists because two copies of the same CSS drifted apart without anybody noticing, and a
// second copy of the detector would fail the same way — the report and the gate would disagree
// about what counts, and the disagreement would be invisible until somebody dug.

import fs from 'node:fs';
import path from 'node:path';

export function walk(dir, test, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, test, out);
    else if (test(e.name)) out.push(full);
  }
  return out;
}

// A '*.module.css' class is scoped to its own file by the bundler: '.panel' in two modules compiles
// to two different names and can never collide. Reporting them was seven of the first twenty-four
// findings — noise that trains a reader to skim, which is how a report stops being read.
export const isPlainCss = (n) => n.endsWith('.css') && !n.endsWith('.module.css');

// Markers of "newer than the first value". If the second declaration of a property contains one and
// the first does not, the pair is a progressive-enhancement fallback rather than a mistake:
//
//     height: 100vh;      <- a browser that cannot parse dvh keeps this
//     height: 100dvh;     <- one that can, takes this
//
// Nineteen of the first twenty-one "contradictions" were exactly this.
const NEWER = ['dvh', 'dvw', 'dvi', 'dvb', 'svh', 'lvh', '-webkit-', '-moz-', '-ms-',
               'color-mix(', 'oklch(', 'lab(', 'lch(', 'env('];
export function isFallbackPair(first, second) {
  const newer = (v) => NEWER.some((marker) => v.includes(marker));
  return newer(second) && !newer(first);
}

/**
 * Parse one stylesheet into its TOP-LEVEL single-class rules.
 *
 * Rules inside `@media` / `@supports` / `@container` are excluded, and that is the difference
 * between a useful report and a useless one: the first version compared them too and reported 749
 * conflicts, almost all of which were responsive CSS working exactly as intended.
 *
 * Comments are BLANKED rather than removed, so every line number stays true. A citation forty lines
 * out sends somebody to read the wrong rule and conclude the report is broken.
 */
export function parseSheet(file, rootRel) {
  const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const rules = [];
  let depth = 0, atDepth = null, buffer = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      const head = buffer.trim();
      depth += 1;
      if (head.startsWith('@') && atDepth === null) atDepth = depth;
      else if (!head.startsWith('@')) {
        let bodyEnd = i + 1, inner = 0;
        while (bodyEnd < source.length) {
          if (source[bodyEnd] === '{') inner += 1;
          else if (source[bodyEnd] === '}') { if (inner === 0) break; inner -= 1; }
          bodyEnd += 1;
        }
        rules.push({
          selector: head,
          body: source.slice(i + 1, bodyEnd).trim(),
          line: source.slice(0, i).split('\n').length,
          topLevel: atDepth === null,
        });
      }
      buffer = '';
    } else if (ch === '}') {
      if (atDepth !== null && depth === atDepth) atDepth = null;
      depth = Math.max(0, depth - 1);
      buffer = '';
    } else buffer += ch;
  }
  return rules.map((r) => ({ ...r, file: rootRel }));
}

/** Every top-level single-class declaration across `roots`, keyed by class name. */
export function collectDeclarations(roots, ROOT) {
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  const declarations = new Map();
  const duplicateProps = [];

  for (const root of roots) {
    for (const file of walk(root, isPlainCss)) {
      for (const rule of parseSheet(file, rel(file))) {
        if (!rule.selector || rule.selector.startsWith('@')) continue;

        const props = new Map();
        for (const decl of rule.body.split(';')) {
          const [rawProp, ...rest] = decl.split(':');
          const prop = rawProp?.trim();
          const value = rest.join(':').trim();
          if (!prop || !value) continue;
          if (prop.startsWith('--')) continue;   // a token redefined is legitimate
          const first = props.get(prop);
          if (first !== undefined && first !== value && !isFallbackPair(first, value)) {
            duplicateProps.push({ file: rule.file, line: rule.line, selector: rule.selector, prop, first, second: value });
          }
          props.set(prop, value);
        }

        // Only simple single-class selectors are compared: `.a .b` and `.a:hover` scope a class,
        // they do not declare it.
        const simple = /^\.([a-zA-Z][\w-]*)$/.exec(rule.selector);
        if (!simple || !rule.topLevel) continue;
        const list = declarations.get(simple[1]) ?? [];
        list.push({ file: rule.file, line: rule.line, body: rule.body.replace(/\s+/g, ' ').trim() });
        declarations.set(simple[1], list);
      }
    }
  }
  return { declarations, duplicateProps };
}

/** Classes declared in more than one FILE with DIFFERENT bodies. Identical duplication is harmless. */
export function findRedefined(declarations) {
  const out = [];
  for (const [cls, places] of declarations) {
    if (new Set(places.map((p) => p.file)).size < 2) continue;
    if (new Set(places.map((p) => p.body)).size < 2) continue;
    out.push({ cls, places });
  }
  return out.sort((a, b) => b.places.length - a.places.length || a.cls.localeCompare(b.cls));
}
