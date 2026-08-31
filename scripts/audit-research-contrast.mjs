#!/usr/bin/env node
// scripts/audit-research-contrast.mjs — WCAG contrast over the research stylesheet, statically.
//
// ── WHY THIS EXISTS ALONGSIDE `check-portal-themes.mjs` ─────────────────────────────────────────
//
// The portal-theme checker is the real instrument: it renders eleven themes across twenty-five
// routes in a browser and reports what a reader actually sees. It also needs a running server, and
// it reported 232 problems repo-wide that are a programme rather than a slice.
//
// This is the cheap half that runs in CI with no server: every rule in the research stylesheet that
// sets a literal `color`, paired with the background it will actually sit on, measured against
// WCAG 2.1 AA. It cannot see cascade, inheritance across components, or anything a theme variable
// resolves to at runtime — so it is a floor, not a ceiling, and a clean run here does NOT mean the
// browser check would be clean.
//
// What it does catch is the thing that keeps happening: a hex typed straight into a rule because it
// looked right on a white card, at 2.5:1.
//
// Usage:  node scripts/audit-research-contrast.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SHEETS = [
  'app/admin/styles/AdminResearch.css',
  'app/admin/research/ResearchPortal.css',
  'app/admin/research/components/ui/primitives.css',
];

// ── Colour maths ────────────────────────────────────────────────────────────────────────────────

export function parseHex(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
export function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// ── Reading the sheet ───────────────────────────────────────────────────────────────────────────

/**
 * Strip CSS comments so prose quoting a hex is not read as a declaration.
 *
 * LENGTH-PRESERVING: newlines are kept and everything else becomes a space. A stripper that
 * collapses a block comment to one character shifts every line number after it, which is how the
 * first inline sweep reported findings against lines that had nothing on them.
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** The same, for TSX — where `//` IS a comment and `stripComments` alone leaves it standing. */
function stripJs(src) {
  return stripComments(src).replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/**
 * Pull the first colour out of a declaration value.
 *
 * `var(--theme-bg-surface, #fff)` resolves to its FALLBACK, which is the honest reading for a
 * static check: the fallback is what renders when the variable is not set, and this repo has
 * shipped sixteen theme tokens that were read by 159 rules and defined nowhere.
 */
export function colourOf(value, vars = new Map()) {
  const fallback = value.match(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/i);
  if (fallback) {
    // A variable defined in these sheets wins; otherwise its fallback; otherwise unknown.
    const defined = vars.get(fallback[1]);
    if (defined) return defined;
    if (fallback[2]) return colourOf(fallback[2], vars);
    return null;
  }
  const bare = value.match(/#[0-9a-f]{3,6}\b/i);
  if (bare) return parseHex(bare[0]);
  if (/\bwhite\b/i.test(value)) return [255, 255, 255];
  if (/\bblack\b/i.test(value)) return [0, 0, 0];
  return null;
}

/**
 * `--token: #hex` declarations from the DEFAULT theme only.
 *
 * ── "FIRST DEFINITION WINS" IS NOT A RULE, IT IS A COIN TOSS ────────────────────────────────────
 *
 * `themes.css` declares every token eleven-plus times, once per palette. Taking whichever came
 * first in the file resolved `--theme-fg-primary` to `#FFFFFF` — a value from a DARK block — and
 * reported white-on-white headings across the whole research portal. The second wrong answer in a
 * row from this function, in the opposite direction to the first.
 *
 * There is no single value for a themed token, so this reads the one context that always applies:
 * bare `:root` / `html`, with no `[data-theme]` attribute on the selector. A token defined only
 * inside theme blocks stays unknown, and unknown means the pair is skipped rather than guessed.
 *
 * The consequence is honest and worth stating: **this checker measures the default theme.** Ten
 * other palettes are exactly what the browser-based `check-portal-themes.mjs` exists to cover.
 */
export function readVars(css) {
  const vars = new Map();
  const src = stripComments(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    // `:root`, `html`, or a list of them. Anything carrying `[data-theme=…]`, a class or a media
    // context describes a palette other than the default and is not what renders by default.
    const parts = selector.split(',').map((s) => s.trim());
    if (!parts.every((p) => p === ':root' || p === 'html' || p === ':root, html')) continue;

    for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/gi)) {
      const rgb = colourOf(d[2], vars);
      if (rgb && !vars.has(d[1])) vars.set(d[1], rgb);
    }
  }
  return vars;
}

/** `{ selector, color, background, line }` for every rule that names a literal colour. */
export function readRules(css, vars = new Map()) {
  const src = stripComments(css);
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    const body = m[2];

    const cm = body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    const bm = body.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);

    out.push({
      selector,
      color: cm ? colourOf(cm[1], vars) : null,
      background: bm ? colourOf(bm[1], vars) : null,
      // A background that is DECLARED but unresolvable is not the page. Assuming white for
      // `background: var(--recon-brand)` reported fifteen white-on-white buttons at 1:1 that
      // are perfectly legible. Unknown means skip, and the skips are counted in the output.
      declaresBackground: Boolean(bm),
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

/**
 * What background does a rule's text sit on?
 *
 * ── THE FIRST VERSION OF THIS WAS THE BUG ──────────────────────────────────────────────────────
 *
 * It took "the longest selector in the same BEM block that declares a background" as the ancestor.
 * In BEM that is almost always a SIBLING, not an ancestor — so it measured `.research-page__title`
 * against `.research-page__status-chip--active`, a blue chip elsewhere on the page, and reported a
 * heading as failing at 2.84:1. Twenty of the first twenty-two findings were that artefact.
 *
 * Only two things can honestly be treated as the background here:
 *
 *   1. the rule's own `background`;
 *   2. the BEM **block root** — `.research-billing` for `.research-billing__price` — which is a
 *      real ancestor by construction.
 *
 * Everything else falls back to the page, which in this light portal is white. An element nested
 * inside a coloured sibling is invisible to this and will read as white-backed; that is a known
 * blind spot, and it is why the browser checker remains the real instrument.
 */
export function backgroundFor(rule, rules) {
  if (rule.background) return { bg: rule.background, from: 'own rule' };
  if (rule.declaresBackground) return null;   // declared, unresolvable — do not guess

  // A state rule sits on the background its BASE rule painted.
  // `.btn--primary:hover { color: #fff }` is white-on-white only if you forget that
  // `.btn--primary` set a dark background two lines above — which this did, and reported it at 1:1.
  const base = rule.selector.replace(/::?[a-z-]+(\([^)]*\))?/gi, '').trim();
  if (base && base !== rule.selector) {
    const baseRule = rules.find((r) => r !== rule && r.selector === base);
    if (baseRule) {
      if (baseRule.background) return { bg: baseRule.background, from: `${base} (base rule)` };
      if (baseRule.declaresBackground) return null;
    }
  }

  const cls = rule.selector.match(/\.([a-z][a-z0-9_-]*)/i);
  if (cls) {
    const block = cls[1].split('__')[0].split('--')[0];
    // The block ROOT only — `.research-billing`, never `.research-billing__anything`.
    const root = rules.find(
      (r) => r !== rule && r.selector === `.${block}` && (r.background || r.declaresBackground),
    );
    if (root) {
      if (!root.background) return null;      // the block root sets one we cannot resolve
      return { bg: root.background, from: root.selector };
    }
  }

  return { bg: [255, 255, 255], from: 'page (white)' };
}

/** Large text (>= 18.66px bold or >= 24px) clears at 3:1; everything else needs 4.5:1. */
export function requiredRatio(body) {
  const size = body.match(/font-size\s*:\s*([\d.]+)rem/i);
  const weight = body.match(/font-weight\s*:\s*(\d+)/i);
  if (!size) return 4.5;
  const px = parseFloat(size[1]) * 16;
  const bold = weight ? parseInt(weight[1], 10) >= 700 : false;
  return px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
}

// ── Inline JSX styles ───────────────────────────────────────────────────────────────────────────
//
// ── THE BLIND SPOT THE CSS PASS LEFT ────────────────────────────────────────────────────────────
//
// F2 measured the stylesheets and reported clean. The research portal also carries **131 inline
// `style={{ color: … }}` declarations** in TSX, which no stylesheet contains and which that pass
// could not see. One of them — `#94A3B8` at 2.56:1 — sits in the Review tab's own empty state.
//
// ── WHY THIS ONLY REPORTS PAIRS ─────────────────────────────────────────────────────────────────
//
// A first sweep assumed white behind every inline colour and produced 64 findings. Most were wrong:
// `style={{ background: '#059669', color: '#fff' }}` is a green button with white text, perfectly
// legible, and it reported at 1:1. An inline colour whose background comes from a className, or from
// an ancestor, is genuinely unknowable from the source.
//
// So this reports **only style objects that declare both** — a real pair, measured, no assumption.
// Everything else is counted as skipped. That leaves inline text on a class-styled background
// unchecked, which is a gap this states rather than papers over: the browser checker sees those.

const PAGE_BACKGROUND = [255, 255, 255];

const STYLE_OBJECT = /style=\{\{([^{}]*)\}\}/g;

/**
 * `{ color, background, declaresBackground }` for one inline style object's body.
 *
 * `declaresBackground` is true whenever a background key is PRESENT, resolvable or not. The same
 * rule as the stylesheet side, and for the same reason: `style={{ background: severity.color,
 * color: '#fff' }}` is a coloured severity pill with white text, and treating its unresolvable
 * background as the page reported it at 1:1 in two components.
 */
export function inlinePair(body, vars = new Map()) {
  const cm = body.match(/(?:^|[,{\s])color\s*:\s*('[^']*'|"[^"]*"|`[^`]*`)/);
  const bLiteral = body.match(/(?:^|[,{\s])(?:background|backgroundColor)\s*:\s*('[^']*'|"[^"]*"|`[^`]*`)/);
  const bAny = /(?:^|[,{\s])(?:background|backgroundColor)\s*:/.test(body);
  const strip = (v) => (v ? v.slice(1, -1) : null);
  return {
    color: cm ? colourOf(strip(cm[1]), vars) : null,
    background: bLiteral ? colourOf(strip(bLiteral[1]), vars) : null,
    declaresBackground: bAny,
  };
}

/**
 * Does this file paint anything dark?
 *
 * An unpaired inline `color` sits on whatever a class or an ancestor painted, which is unknowable
 * from the source — UNLESS the file paints nothing dark anywhere, in which case the page background
 * is the only thing it can be sitting on, and this portal's page is light.
 *
 * That is a real inference, not a guess, and it is what turns most of the skipped inline styles
 * into measured ones. It is also why it is conservative: one dark utility or one dark inline
 * background anywhere in the file and every unpaired colour in it goes back to being skipped.
 */
export function paintsDark(src) {
  // `stripJs`, not `stripComments`: the shared one removes CSS `/* */` only, because in a stylesheet
  // `//` is not a comment. Running it over TSX left every `// … bg-gray-900 …` line intact, so a
  // comment EXPLAINING that a file used to be dark marked it as dark. Ninth time a check in this
  // repository has read its own prose — caught here by its own control rather than in review.
  const code = stripJs(src);
  if (/\bbg-(gray|slate|zinc|neutral|stone)-(7|8|9)\d{2}\b/.test(code)) return true;
  if (/\bbg-(black|gray-950)\b/.test(code)) return true;
  for (const m of code.matchAll(STYLE_OBJECT)) {
    const { background } = inlinePair(m[1]);
    if (background && luminance(background) < 0.25) return true;
  }
  return false;
}

export function auditInline(files, vars = new Map()) {
  const findings = [];
  let checked = 0;
  let skipped = 0;

  for (const { rel, src } of files) {
    // stripJs: an inline colour written inside a COMMENT is not applied to anything.
    const blanked = stripJs(src);
    const dark = paintsDark(src);

    for (const m of blanked.matchAll(STYLE_OBJECT)) {
      const { color, background: paired, declaresBackground } = inlinePair(m[1], vars);
      if (!color) continue;

      // A pair is measured directly. A background that is DECLARED but unresolvable — `background:
      // severity.color` — is not the page either. Without one, the page background is the honest
      // answer only when the file paints nothing dark; otherwise the text may be sitting on a dark
      // surface this cannot see, and assuming white would invent failures. An earlier sweep did
      // exactly that and produced 64 findings of which 61 were wrong.
      const background = paired ?? (declaresBackground || dark ? null : PAGE_BACKGROUND);
      if (!background) { skipped++; continue; }

      checked++;
      const ratio = contrast(color, background);
      const need = requiredRatio(m[1].replace(/fontSize:\s*'([\d.]+)rem'/, 'font-size: $1rem')
        .replace(/fontWeight:\s*'?(\d+)'?/, 'font-weight: $1'));
      if (ratio < need) {
        findings.push({
          file: rel,
          line: blanked.slice(0, m.index).split('\n').length,
          selector: 'inline style',
          fg: `#${color.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
          bg: `#${background.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
          bgFrom: paired ? 'the same style object' : 'the page (this file paints nothing dark)',
          ratio: Number(ratio.toFixed(2)),
          need,
        });
      }
    }
  }
  return { checked, skipped, findings };
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────────

export function audit() {
  const findings = [];
  let checked = 0;
  let skipped = 0;

  // Variables are collected across ALL the sheets first: `--recon-brand` is declared in one and
  // used in another, and a token that resolves nowhere must stay unknown rather than become white.
  const vars = new Map();
  const sources = [];
  for (const rel of SHEETS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const css = fs.readFileSync(abs, 'utf8');
    sources.push({ rel, css });
    for (const [k, v] of readVars(css)) if (!vars.has(k)) vars.set(k, v);
  }
  // Theme tokens live in the global sheets, not in these three.
  //
  // ── LEAVING `themes.css` OUT MADE 58 FALSE POSITIVES ──────────────────────────────────────────
  //
  // `color: var(--theme-fg-muted, #9CA3AF)` appears 45 times in the research stylesheet. Without
  // `themes.css` in this list the token resolves to nothing, the FALLBACK is measured, and every one
  // of those rules reports 2.54:1 — a fifth of the whole run, all wrong. `--theme-fg-muted` is
  // declared on bare `:root`, so it is always set and the fallback never renders.
  //
  // Reading the fallback is the right rule for a token that is NOT defined anywhere; it is the wrong
  // rule for one that is. Both cases exist in this repo, which is why the definitions are gathered
  // first and the fallback is only consulted when the lookup misses.
  for (const g of ['app/styles/globals.css', 'app/styles/themes.css']) {
    const abs = path.join(ROOT, g);
    if (!fs.existsSync(abs)) continue;
    for (const [k, v] of readVars(fs.readFileSync(abs, 'utf8'))) if (!vars.has(k)) vars.set(k, v);
  }

  for (const { rel, css } of sources) {
    const src = stripComments(css);
    const rules = readRules(css, vars);

    for (const rule of rules) {
      if (!rule.color) continue;
      const resolved = backgroundFor(rule, rules);
      if (!resolved) { skipped++; continue; }
      const { bg, from } = resolved;

      // Re-read the body for the size/weight so the threshold matches the rule being measured.
      const bodyMatch = src.match(
        new RegExp(rule.selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^{}]*)\\}'),
      );
      const need = requiredRatio(bodyMatch ? bodyMatch[1] : '');

      checked++;
      const ratio = contrast(rule.color, bg);
      if (ratio < need) {
        findings.push({
          file: rel,
          line: rule.line,
          selector: rule.selector,
          fg: `#${rule.color.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
          bg: `#${bg.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
          bgFrom: from,
          ratio: Number(ratio.toFixed(2)),
          need,
        });
      }
    }
  }

  // The TSX half. `stripComments` is length-preserving — the first version of this sweep collapsed
  // each block comment to a single space, so every line number it reported after one was wrong.
  // That is the offset-misalignment `writes-hit-real-columns` already records in its header; it
  // recurs whenever a probe strips a source and then indexes into it.
  const tsx = [];
  const walkTsx = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const next = `${rel}/${e.name}`;
      if (e.isDirectory()) walkTsx(next);
      else if (e.name.endsWith('.tsx')) {
        tsx.push({ rel: next, src: fs.readFileSync(path.join(ROOT, next), 'utf8') });
      }
    }
  };
  walkTsx('app/admin/research');

  const inline = auditInline(tsx, vars);
  findings.push(...inline.findings);

  return {
    checked: checked + inline.checked,
    skipped: skipped + inline.skipped,
    findings,
  };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
  || process.argv[1]?.endsWith('audit-research-contrast.mjs')) {
  const { checked, skipped, findings } = audit();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ checked, skipped, findings }, null, 2));
  } else {
    console.log(`checked ${checked} colour pairs across ${SHEETS.length} stylesheets`
      + ` (${skipped} skipped — a background this cannot resolve)`);
    if (findings.length === 0) console.log('no contrast failures');
    for (const f of findings) {
      console.log(
        `  ${f.ratio}:1 (need ${f.need}) ${f.selector}\n`
        + `      ${f.fg} on ${f.bg} — background from ${f.bgFrom}\n`
        + `      ${f.file}:${f.line}`,
      );
    }
  }
  process.exit(findings.length > 0 ? 1 : 0);
}
