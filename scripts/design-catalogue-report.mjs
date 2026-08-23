// scripts/design-catalogue-report.mjs — the punch list, derived rather than noticed.
//
// Slice C2 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"I still find tons of repetitive elements and poorly formatted elements that need to be
// fixed, or are simply non-functional at all."*
//
// Finding those by looking is how it has been done so far, and it is why they keep turning up: a
// person can only notice the one in front of them. The catalogue scan already holds every rule,
// every usage and every inline style with a file and a line, so the same question can be asked of
// the whole codebase at once. Four reports:
//
//   REPETITION   classes with near-identical declarations, defined separately. Eleven definitions
//                of "a small grey pill" is not eleven decisions; it is one decision made eleven
//                times, and every one of them drifts on its own schedule.
//
//   DIVERGENCE   elements that wear a class AND an inline style that overrides it. This is where
//                "poorly formatted" mostly comes from: the class said 40px, the element said 36,
//                and the row it sits in now has two heights in it.
//
//   ORPHANS      classes with CSS and no usage. Dead style — safe to delete, and until it is, it is
//                a thing that looks like an answer when you search for one.
//
//   HEIGHT SPREAD  every distinct height a control is given anywhere. The design system has two
//                (40px, 32px). Anything else on the list is drift, and the list is the work order.
//
// Usage:
//   node scripts/design-catalogue-scan.mjs        # first — writes the raw scan
//   node scripts/design-catalogue-report.mjs      # then — prints, and writes the markdown report

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const RAW = 'lib/design/catalogue/raw';
const OUT = 'docs/planning/qa-evidence/design-catalogue-report.md';

let classes;
let inline;
try {
  classes = JSON.parse(readFileSync(`${RAW}/classes.json`, 'utf8'));
  inline = JSON.parse(readFileSync(`${RAW}/inline-styles.json`, 'utf8'));
} catch {
  console.error('No raw scan found. Run: node scripts/design-catalogue-scan.mjs');
  process.exit(2);
}

/** Tailwind-ish utility names, which are not this app's own vocabulary. See §0.1 of the plan: they
 *  are 4,500-of-5,072 concentrated in the CAD island and are out of the catalogue's scope. */
const UTILITY = /^(flex|grid|block|inline|hidden|absolute|relative|fixed|sticky|top|right|bottom|left|z|w|h|min|max|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space|text|font|leading|tracking|bg|border|rounded|shadow|opacity|overflow|cursor|select|transition|duration|ease|hover|focus|group|items|justify|self|content|order|col|row|truncate|whitespace|break|uppercase|lowercase|capitalize|underline|italic|shrink|grow|basis|aspect|object|inset|ring|divide|placeholder|animate|scale|rotate|translate|backdrop|pointer|resize|list|table|antialiased|sr)(-|$)/;
const isUtility = (c) => UTILITY.test(c.name) && !c.styled;

/**
 * Which surfaces this report is about.
 *
 * The scan covers the whole site, because the owner asked for every element "both for the frontend
 * and the backend". The PUNCH LIST is narrower on purpose: CAD, research, D&D and AndrewAsh are
 * separate products with their own visual languages, and folding them into a repetition report
 * produces false pairs — two unrelated grey pills from two unrelated apps are not a duplication
 * anybody should consolidate. `--all` includes everything.
 */
const SCOPE = new Set(['admin', 'marketing', 'customer', 'auth', 'shared']);
const ALL = process.argv.includes('--all');
const OUT_OF_SCOPE_FILE = /^app\/(admin\/(cad|research)|dnd|AndrewAsh)\b/;
const fileInScope = (f) => ALL || !OUT_OF_SCOPE_FILE.test(f);

function inScope(c) {
  if (ALL) return true;
  const areas = Object.keys(c.areas ?? {});
  // Used somewhere in scope, or (for a styled-but-unused class) defined in a file in scope.
  if (areas.length) return areas.some((a) => SCOPE.has(a));
  return c.rules.some((r) => fileInScope(r.file));
}

const own = classes.filter((c) => !isUtility(c) && inScope(c));

// ── 1. REPETITION ───────────────────────────────────────────────────────────────────────────────
//
// Two classes are "the same thing said twice" when their declarations agree on the properties that
// decide how a control LOOKS AND SITS: box, type, colour, border. Deliberately not every property —
// two buttons that differ only in `margin` are still the same button.

const SHAPE_PROPS = [
  'display', 'height', 'min-height', 'padding', 'padding-top', 'padding-bottom',
  'padding-left', 'padding-right', 'border', 'border-width', 'border-radius',
  'font-size', 'font-weight', 'line-height', 'background', 'background-color', 'color', 'gap',
];

/** Normalise a value so `#FFF`, `#ffffff` and `white` do not read as three different decisions. */
function normValue(v) {
  let s = v.toLowerCase().trim().replace(/\s+/g, ' ').replace(/;$/, '');
  s = s.replace(/#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3\b/g, '#$1$2$3');
  if (s === '#ffffff' || s === '#fff' || s === 'white') s = '#fff';
  if (s === '#000000' || s === '#000' || s === 'black') s = '#000';
  return s;
}

function shapeKey(rules) {
  const merged = {};
  for (const r of rules) {
    // A rule inside a media query describes a *variation*, not the base shape.
    if (r.media) continue;
    for (const [prop, value] of Object.entries(r.declarations)) {
      if (SHAPE_PROPS.includes(prop)) merged[prop] = normValue(value);
    }
  }
  const keys = Object.keys(merged).sort();
  // Fewer than three shape properties is not a shape; it is a tweak.
  if (keys.length < 3) return null;
  return keys.map((k) => `${k}:${merged[k]}`).join(';');
}

const byShape = new Map();
for (const c of own) {
  if (!c.styled) continue;
  const key = shapeKey(c.rules);
  if (!key) continue;
  if (!byShape.has(key)) byShape.set(key, []);
  byShape.get(key).push(c);
}

const repetition = [...byShape.entries()]
  .filter(([, list]) => list.length > 1)
  .map(([key, list]) => ({
    key,
    count: list.length,
    totalUsage: list.reduce((n, c) => n + c.usageCount, 0),
    members: list.map((c) => ({
      name: c.name,
      usage: c.usageCount,
      where: c.rules.filter((r) => !r.media).map((r) => `${r.file}:${r.line}`)[0] ?? '',
    })),
  }))
  .sort((a, b) => b.count - a.count || b.totalUsage - a.totalUsage);

// ── 2. DIVERGENCE ───────────────────────────────────────────────────────────────────────────────
//
// An element wearing a class and an inline style that sets the SAME property. The inline one wins,
// which means the stylesheet is not telling the truth about that element.

const camelToKebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const declaredProps = new Map();     // class name → Set(props it sets, unmediated)
for (const c of own) {
  if (!c.styled) continue;
  const props = new Set();
  for (const r of c.rules) if (!r.media) for (const p of Object.keys(r.declarations)) props.add(p);
  declaredProps.set(c.name, props);
}

const divergence = [];
for (const site of inline) {
  if (!site.classes?.length) continue;
  const clashes = [];
  for (const [jsProp, value] of Object.entries(site.declarations)) {
    const prop = camelToKebab(jsProp);
    for (const cls of site.classes) {
      if (declaredProps.get(cls)?.has(prop)) {
        clashes.push({ prop, value: String(value).slice(0, 40), cls });
      }
    }
  }
  if (clashes.length) divergence.push({ file: site.file, line: site.line, tag: site.tag, clashes });
}
divergence.sort((a, b) => b.clashes.length - a.clashes.length);

// ── 3. ORPHANS ──────────────────────────────────────────────────────────────────────────────────

const orphans = own
  .filter((c) => c.styled && c.usageCount === 0)
  .map((c) => ({
    name: c.name,
    where: c.rules[0] ? `${c.rules[0].file}:${c.rules[0].line}` : '',
    rules: c.rules.length,
  }))
  .sort((a, b) => a.where.localeCompare(b.where));

const orphansByFile = new Map();
for (const o of orphans) {
  const file = o.where.split(':')[0];
  orphansByFile.set(file, (orphansByFile.get(file) ?? 0) + 1);
}

// ── 4. HEIGHT SPREAD ────────────────────────────────────────────────────────────────────────────

const heights = new Map();          // normalised height value → [{class, where}]
for (const c of own) {
  if (!c.styled) continue;
  for (const r of c.rules) {
    if (r.media) continue;
    for (const prop of ['height', 'min-height']) {
      const v = r.declarations[prop];
      if (!v) continue;
      const n = normValue(v);
      if (!/^\d+(\.\d+)?px$/.test(n)) continue;      // only literals; a var() is on-system by construction
      if (!heights.has(n)) heights.set(n, []);
      heights.get(n).push({ name: c.name, where: `${r.file}:${r.line}` });
    }
  }
}
const heightSpread = [...heights.entries()]
  .map(([value, list]) => ({ value, px: parseFloat(value), count: list.length, sample: list.slice(0, 4) }))
  .sort((a, b) => a.px - b.px);

// ── PRINT ───────────────────────────────────────────────────────────────────────────────────────

const rule = (t) => `\n  ── ${t} ${'─'.repeat(Math.max(0, 72 - t.length))}\n`;

console.log(rule('SCOPE'));
console.log(`  ${own.length} of the app's own classes (utilities and CAD-only classes excluded)`);

console.log(rule('1. REPETITION — the same shape defined more than once'));
console.log(`  ${repetition.length} shapes are defined more than once.`);
for (const g of repetition.slice(0, 12)) {
  console.log(`\n    ${g.count} definitions, ${g.totalUsage} usages:`);
  for (const m of g.members.slice(0, 8)) {
    console.log(`      .${m.name.padEnd(38)} ${String(m.usage).padStart(3)}×  ${m.where}`);
  }
  if (g.members.length > 8) console.log(`      … and ${g.members.length - 8} more`);
}

console.log(rule('2. DIVERGENCE — an inline style overriding the class it wears'));
console.log(`  ${divergence.length} elements. Top offenders:`);
for (const d of divergence.slice(0, 12)) {
  const props = d.clashes.map((c) => `${c.prop}(.${c.cls})`).join(', ');
  console.log(`    ${d.file}:${d.line}  <${d.tag ?? '?'}>  ${props}`);
}

console.log(rule('3. ORPHANS — styled, never used'));
console.log(`  ${orphans.length} classes. By file:`);
for (const [file, n] of [...orphansByFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`    ${String(n).padStart(4)}  ${file}`);
}

console.log(rule('4. HEIGHT SPREAD — every literal control height in the portal'));
console.log(`  ${heightSpread.length} distinct literal heights. The design system has two: 40px and 32px.`);
for (const h of heightSpread) {
  const onSystem = h.px === 40 || h.px === 32 || h.px === 48;
  console.log(`    ${h.value.padStart(8)}  ${String(h.count).padStart(3)}×  ${onSystem ? '(token height)' : h.sample.map((s) => '.' + s.name).slice(0, 3).join(' ')}`);
}

// ── WRITE ───────────────────────────────────────────────────────────────────────────────────────

const md = [];
md.push('# Design catalogue — punch list', '');
md.push('> Generated by `scripts/design-catalogue-report.mjs` from the raw scan.');
md.push('> Regenerate rather than edit. Slice C2 of `DESIGN_STUDIO_2026-08-23.md`.', '');
md.push(`Scope: ${own.length} of the app's own classes. Tailwind utilities and CAD-only classes are`);
md.push('excluded — see §0.1 of the plan for why.', '');

md.push('## 1. Repetition', '');
md.push(`${repetition.length} distinct shapes are defined more than once.`, '');
for (const g of repetition.slice(0, 40)) {
  md.push(`### ${g.count} definitions of the same shape (${g.totalUsage} usages)`, '');
  md.push('| class | usages | defined at |', '|---|---:|---|');
  for (const m of g.members) md.push(`| \`.${m.name}\` | ${m.usage} | \`${m.where}\` |`);
  md.push('', `<sub>${g.key}</sub>`, '');
}

md.push('## 2. Divergence — inline styles overriding their own class', '');
md.push(`${divergence.length} elements.`, '');
md.push('| file:line | tag | overridden |', '|---|---|---|');
for (const d of divergence.slice(0, 200)) {
  md.push(`| \`${d.file}:${d.line}\` | \`<${d.tag ?? '?'}>\` | ${d.clashes.map((c) => `\`${c.prop}\` on \`.${c.cls}\``).join(', ')} |`);
}
md.push('');

md.push('## 3. Orphans — styled, never used', '');
md.push(`${orphans.length} classes have CSS and no usage anywhere.`, '');
md.push('| file | orphan classes |', '|---|---:|');
for (const [file, n] of [...orphansByFile.entries()].sort((a, b) => b[1] - a[1])) {
  md.push(`| \`${file}\` | ${n} |`);
}
md.push('');

md.push('## 4. Height spread', '');
md.push(`${heightSpread.length} distinct literal control heights. The token set has 32 / 40 / 48.`, '');
md.push('| height | occurrences | examples |', '|---:|---:|---|');
for (const h of heightSpread) {
  md.push(`| ${h.value} | ${h.count} | ${h.sample.map((s) => `\`.${s.name}\``).join(', ')} |`);
}
md.push('');

mkdirSync('docs/planning/qa-evidence', { recursive: true });
writeFileSync(OUT, md.join('\n'));
console.log(`\n  Wrote ${OUT}\n`);
