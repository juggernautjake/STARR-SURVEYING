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
export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** The same, for TSX — where `//` IS a comment and `stripComments` alone leaves it standing. */
export function stripJs(src) {
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
  // ── A MIX IS NOT ITS FIRST INGREDIENT ─────────────────────────────────────────────────────
  //
  // `color-mix(in srgb, var(--theme-warning) 38%, var(--theme-fg-primary))` used to resolve to
  // #f59e0b, because the var() match below is not anchored and simply found the first variable in
  // the string. The auditor then measured pure amber against white and reported 2.15:1 on a rule
  // the browser measures at 4.55:1 on its worst palette.
  //
  // That is the shape this file's own header warns about four times over: a probe that resolves a
  // value WRONG produces a confident list of findings, and "a check that sends somebody to fix
  // working code is worse than no check". Computing the mix properly would mean resolving two
  // themed variables per palette, which is what the BROWSER sweep already does correctly.
  //
  // So it is skipped, and lands in the count this script already prints as "skipped — a background
  // this cannot resolve". Unresolved and honest beats resolved and wrong.
  if (/color-mix\s*\(/i.test(value)) return null;

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

/**
 * Every `style={{ … }}` in the source: `{ at, body }`, where `at` is the offset of `style=`.
 *
 * ── `[^{}]*` STOPS AT THE FIRST NESTED BRACE, AND THAT IS NOT A CORNER CASE ─────────────────────
 *
 * `SurveyPlanPanel.tsx:88` is a done/not-done checkbox:
 *
 *     <div style={{ border: `2px solid ${item.done ? '#059669' : '#D1D5DB'}`,
 *                   background: item.done ? '#059669' : '#fff' }}>
 *       <span style={{ color: '#fff' }}>✓</span>
 *
 * The `${…}` in the template literal put a brace inside the object, so the regex matched nothing at
 * all — the whole style object was invisible. The ancestor walk then found no background for the
 * tick, fell through to the page, and reported white-on-white. The finding was real (white on
 * `#059669` is 3.77:1) but the surface it named was wrong, and a checker that names the wrong
 * surface gets argued with rather than fixed.
 *
 * Brace-matched, quote-aware. Same lesson the inline-hex ratchet learned in its own words: a lazy
 * `[^}]*` reports an improvement that never happened.
 */
export function styleObjects(src) {
  const out = [];
  const re = /style=\{\{/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    let depth = 2;
    let quote = null;
    let i = start;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === '\\') { i++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    if (depth !== 0) continue;
    out.push({ at: m.index, body: src.slice(start, i - 1) });
    re.lastIndex = i;
  }
  return out;
}

/**
 * `{ color, background, declaresBackground }` for one inline style object's body.
 *
 * `declaresBackground` is true whenever a background key is PRESENT, resolvable or not. The same
 * rule as the stylesheet side, and for the same reason: `style={{ background: severity.color,
 * color: '#fff' }}` is a coloured severity pill with white text, and treating its unresolvable
 * background as the page reported it at 1:1 in two components.
 */
/**
 * The raw source of one key's value — from `key:` up to the comma that ends it.
 *
 * Needed because the value is not always a literal. `background: isVerifying ? '#6B7280' : '#047857'`
 * is two colours, and matching only `key: '…'` sees neither.
 */
export function valueSourceOf(body, keys) {
  const m = new RegExp(`(?:^|[,{\\s])(?:${keys.join('|')})\\s*:\\s*`).exec(body);
  if (!m) return null;
  let quote = null;
  let depth = 0;
  let out = '';
  for (let i = m.index + m[0].length; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      // A comma inside `'rgba(0,0,0,.4)'` does not end the value, and neither does one inside a
      // font stack. Quote state first, before anything else looks at the character.
      if (c === quote && body[i - 1] !== '\\') quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) break;
    out += c;
  }
  return out.trim();
}

/**
 * Every colour a value expression can evaluate to.
 *
 * ── A TERNARY IS TWO COLOURS, AND ONLY ONE OF THEM WAS EVER MEASURED ───────────────────────────
 *
 * Found 2026-08-31, by the coherence extraction's own colour test rather than by this script.
 * `style={{ background: isVerifying ? '#6B7280' : '#059669', color: '#fff' }}` on the research
 * project page's Run Verification button: white on `#059669` is **3.77:1** at 0.82rem, and the
 * button has rendered that way for its whole life.
 *
 * The reason it survived a pass that reported "no contrast failures" is exact and worth keeping:
 * `background` was PRESENT, so `declaresBackground` was true and the pair was counted as *skipped*
 * — deliberately, because an unresolvable background used to be assumed white and invented 61 false
 * findings. The conservative rule was right; it was just too coarse. A ternary between two literals
 * is not unresolvable. It is two known answers, and the honest reading is the worse of them.
 */
export function literalColoursIn(source, vars = new Map()) {
  if (!source) return [];
  const out = [];
  for (const m of source.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
    const c = colourOf(m[1] ?? m[2] ?? m[3] ?? '', vars);
    if (c) out.push(c);
  }
  // `background: var(--x, #fff)` is not quoted at all, and neither is a bare `background: white`.
  if (!out.length) {
    const c = colourOf(source, vars);
    if (c) out.push(c);
  }
  return out;
}

export function inlinePair(body, vars = new Map()) {
  const cSrc = valueSourceOf(body, ['color']);
  const bSrc = valueSourceOf(body, ['background', 'backgroundColor']);
  const colors = literalColoursIn(cSrc, vars);
  const backgrounds = literalColoursIn(bSrc, vars);
  const bAny = /(?:^|[,{\s])(?:background|backgroundColor)\s*:/.test(body);
  return {
    // `color` / `background` stay single-valued: every existing caller reads them, and for the
    // overwhelmingly common single-literal case they are unchanged.
    color: colors[0] ?? null,
    background: backgrounds[0] ?? null,
    /** Every branch of a ternary, so the audit can measure the worst one rather than the first. */
    colors,
    backgrounds,
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
  for (const { body } of styleObjects(code)) {
    // Every branch, not just the first: `background: dark ? '#111' : '#fff'` paints dark half the
    // time, and half the time is enough to make an unpaired colour elsewhere unknowable.
    for (const background of inlinePair(body).backgrounds) {
      if (luminance(background) < 0.25) return true;
    }
  }
  return false;
}

// ── JSX ancestry ────────────────────────────────────────────────────────────────────────────────
//
// ── THE COLOUR AND THE SURFACE ARE ALMOST NEVER ON THE SAME ELEMENT ─────────────────────────────
//
// Everything above measures a `color` against a `background` written in the SAME style object. That
// is not how these screens are built. A card sets the background; its children set the text. So the
// common shape was unmeasurable, and the fallback — "the page, if the file paints nothing dark" —
// blinded a whole FILE the moment one card in it was dark.
//
// `page.tsx` has dark `#0f172a` cards on two tabs. That single fact caused every unpaired inline
// colour in its 3,200 lines to be skipped, including this, on the Survey Data tab:
//
//     <table className="review-table">                          ← no background of its own
//       <td style={{ color: '#e2e8f0' }}>{link.instrumentNumber}</td>
//
// `.review-table` is not defined in any stylesheet — it is one of the 534 in the unstyled-class
// baseline — so the surface is `.review-summary-panel`, which is `#fff`. **1.23:1.** The chain of
// title — dates, grantors, grantees, instrument numbers — has been rendering white on white.
//
// The fix is to answer the question that was actually being asked: not "does this FILE paint
// something dark", but "what does the nearest ANCESTOR paint". Tags are walked, backgrounds are
// pushed onto a stack, and a colour is measured against the surface it is really on.

/**
 * Every JSX tag in source order: `{ kind, name, attrs, index }`.
 *
 * Deliberately tolerant. `useState<AnnotationHistoryState>` parses as an opening `<AnnotationHistoryState>`
 * that never closes, and there is no way to tell it from a component without a type checker. It is
 * harmless: a bogus entry declares no background, so it is transparent to the lookup, and the
 * pop-until-name-matches rule below clears it at the next real close tag.
 */
export function jsxTags(src) {
  const tags = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '<') continue;
    const closing = src[i + 1] === '/';
    const nameStart = i + (closing ? 2 : 1);
    if (!/[A-Za-z]/.test(src[nameStart] ?? '')) continue;   // `<>`, `< 3`, `<'a'`

    // Consume to the `>` that ends the tag, ignoring any inside strings or braces.
    let j = nameStart;
    let depth = 0;
    let quote = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === quote && src[j - 1] !== '\\') quote = null; continue; }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
      else if (c === '<' && depth === 0) { j = -1; break; }   // never closed — not a tag
    }
    if (j < 0 || j >= src.length) continue;

    const body = src.slice(nameStart, j);
    const name = /^[\w.]+/.exec(body)?.[0] ?? '';
    const selfClosing = src[j - 1] === '/';
    tags.push({
      kind: closing ? 'close' : selfClosing ? 'self' : 'open',
      name,
      attrs: body.slice(name.length),
      index: i,
    });
    i = j;
  }
  return tags;
}

/** Tailwind background utilities dark enough that text on them cannot be the page's. */
const DARK_BG_CLASS = /\bbg-(?:black|gray-950|(?:gray|slate|zinc|neutral|stone)-(?:7|8|9)\d{2})\b/;

/**
 * One mark per inline `style={{` in the file: where it starts, and the surface ENCLOSING it.
 *
 *   `surface` is a colour  → an ancestor paints that, measure against it
 *   `surface` is `null`    → an ancestor declares a background this cannot read — skip, do not guess
 *   `surface` is undefined → nothing encloses it; the caller falls back to the page
 *
 * The offset is the position of the `style={{` itself, so the caller can look up the match it
 * already has rather than trying to re-derive which tag a match belongs to.
 */
export function ancestorSurfaces(src, vars = new Map()) {
  const marks = [];
  const stack = [];
  const OPAQUE_STYLE = /style=\{(?!\{)/;
  // The style objects, by the offset of their `style=`, so a tag can find its own without
  // re-parsing it — and so the offsets here are the same ones `auditInline` looks up.
  const objects = new Map(styleObjects(src).map((o) => [o.at, o.body]));

  for (const tag of jsxTags(src)) {
    if (tag.kind === 'close') {
      const at = stack.map((e) => e.name).lastIndexOf(tag.name);
      if (at >= 0) stack.length = at;
      continue;
    }

    const inherited = stack.length ? stack[stack.length - 1].bg : undefined;
    // `<div` is 1 + the name's length; the attributes follow, and the style object is somewhere in
    // them. Its absolute offset is what both this map and the caller key on.
    const attrsAt = tag.index + 1 + tag.name.length;
    let body;
    let bodyAt = -1;
    for (const [at, b] of objects) {
      if (at >= attrsAt && at < attrsAt + tag.attrs.length) { body = b; bodyAt = at; break; }
    }

    let own;
    if (body !== undefined) {
      const { backgrounds, declaresBackground } = inlinePair(body, vars);
      if (backgrounds.length) own = backgrounds[0];
      else if (declaresBackground) own = null;
      marks.push({ at: bodyAt, surface: inherited });
    } else if (OPAQUE_STYLE.test(tag.attrs)) {
      own = null;
    }
    if (own === undefined && DARK_BG_CLASS.test(tag.attrs)) own = null;

    if (tag.kind === 'open') stack.push({ name: tag.name, bg: own !== undefined ? own : inherited });
  }
  return marks;
}

export function auditInline(files, vars = new Map()) {
  const findings = [];
  let checked = 0;
  let skipped = 0;

  for (const { rel, src } of files) {
    // stripJs: an inline colour written inside a COMMENT is not applied to anything.
    const blanked = stripJs(src);
    // Only CLASS-painted darkness is a file-level fact now. Inline dark backgrounds are handled by
    // the ancestor walk below, exactly where they apply, instead of blinding the whole file.
    const dark = DARK_BG_CLASS.test(blanked);
    const enclosing = new Map(ancestorSurfaces(blanked, vars).map((k) => [k.at, k.surface]));

    for (const { at, body } of styleObjects(blanked)) {
      const { colors, backgrounds, declaresBackground } = inlinePair(body, vars);
      if (!colors.length) continue;

      // A pair is measured directly. A background that is DECLARED but unresolvable — `background:
      // severity.color` — is not the page either. Without one, the page background is the honest
      // answer only when the file paints nothing dark; otherwise the text may be sitting on a dark
      // surface this cannot see, and assuming white would invent failures. An earlier sweep did
      // exactly that and produced 64 findings of which 61 were wrong.
      //
      // A ternary is neither case: both branches are known, so BOTH are measured and the worst one
      // is what the button actually renders half the time.
      const paired = backgrounds.length > 0;

      // What this text is actually on, in order of how much it is really known:
      //   1. a literal background in its OWN style object;
      //   2. the nearest ANCESTOR element whose inline style declares a literal background;
      //   3. the page — only when nothing enclosing it declares an unreadable background and the
      //      file paints nothing dark by class.
      // `null` from the ancestor walk means "something encloses this and cannot be read", which is
      // a skip and never a guess.
      const ancestor = enclosing.get(at);
      let surfaces;
      let bgFrom;
      if (paired) {
        surfaces = backgrounds;
        bgFrom = 'the same style object';
      } else if (declaresBackground) {
        surfaces = [];
      } else if (ancestor) {
        surfaces = [ancestor];
        bgFrom = 'the nearest ancestor that paints one';
      } else if (ancestor === null || dark) {
        surfaces = [];
      } else {
        surfaces = [PAGE_BACKGROUND];
        bgFrom = 'the page (nothing enclosing it paints a background)';
      }
      if (!surfaces.length) { skipped++; continue; }

      checked++;
      const need = requiredRatio(body.replace(/fontSize:\s*'([\d.]+)rem'/, 'font-size: $1rem')
        .replace(/fontWeight:\s*'?(\d+)'?/, 'font-weight: $1'));

      // The worst combination any branch can produce. One finding per style object, not one per
      // pair: a button that fails in its disabled state and passes enabled is one thing to fix.
      let worst = null;
      for (const color of colors) {
        for (const background of surfaces) {
          const ratio = contrast(color, background);
          if (!worst || ratio < worst.ratio) worst = { color, background, ratio };
        }
      }

      if (worst.ratio < need) {
        const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        const branches = colors.length * surfaces.length;
        findings.push({
          file: rel,
          line: blanked.slice(0, at).split('\n').length,
          selector: 'inline style',
          fg: hex(worst.color),
          bg: hex(worst.background),
          bgFrom: branches > 1 ? `${bgFrom} (worst of ${branches} branches)` : bgFrom,
          ratio: Number(worst.ratio.toFixed(2)),
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
