// scripts/widget-settings-audit.mjs — does every widget's settings form expose everything its
// content model holds?
//
// C0l of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Owner: *"Please make sure the widget editing and control is fully fleshed out and complete on
// both pc and mobile."*
//
// ── WHY A SCRIPT RATHER THAN OPENING 55 PANELS ──────────────────────────────────────────────────
//
// There are 55 registered widgets. Opening each one's settings and comparing it against the fields
// that widget actually reads is exactly the kind of judgement that degrades after the fifteenth
// screen — the same argument `ui-align-audit.mjs` makes for measuring alignment instead of eyeing
// it. The comparison here reduces to set difference: the keys in a widget's `DEFAULTS` are its
// content model, and a key the settings form never mentions is a setting the user cannot reach.
//
// ── WHAT THIS CAN AND CANNOT SEE ────────────────────────────────────────────────────────────────
//
// It is a source scan, so it proves a key is NAMED in the form, not that the control works, is
// reachable, or is labelled comprehensibly. A key it reports as covered may still be behind a
// broken control — driving the panels is C0o's job and this does not replace it.
//
// What it is reliable for is the opposite direction: a key that appears NOWHERE in the settings
// form is unreachable with certainty. That is the gap list this slice exists to produce, and
// false negatives (a covered key that is still broken) are C0o's to catch.
//
// Usage:  node scripts/widget-settings-audit.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';

const WIDGET_DIR = 'lib/hub/widgets';
const AS_JSON = process.argv.includes('--json');

/** Strip comments so a key mentioned only in prose is not counted as exposed. This codebase
 *  comments heavily, and a check that reads source must strip comments first — the lesson recorded
 *  in `__tests__/pwa/hub-greeting-fits-a-phone.test.ts`. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The keys of the `const DEFAULTS: … = { … }` object literal — a widget's content model. */
function contentKeys(src) {
  const m = src.match(/const DEFAULTS[^=]*=\s*\{([\s\S]*?)\n?\};/);
  if (!m) return null;
  const body = m[1];
  // Top-level keys only: nested object values are one setting, not several.
  const keys = [];
  let depth = 0;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (depth === 0) {
      const k = trimmed.match(/^([A-Za-z_$][\w$]*)\s*:/);
      if (k) keys.push(k[1]);
    }
    depth += (line.match(/[[{(]/g) || []).length - (line.match(/[\]})]/g) || []).length;
    if (depth < 0) depth = 0;
  }
  return keys;
}

/** The body of the widget's SettingsForm component, if it ships one. */
function settingsFormBody(src) {
  const nameMatch = src.match(/SettingsForm:\s*([A-Za-z_$][\w$]*)/);
  if (!nameMatch) return null;
  const fnName = nameMatch[1];
  const start = src.search(new RegExp(`function\\s+${fnName}\\s*\\(`));
  if (start < 0) return null;

  // Walk the PARAMETER LIST to its closing paren first, then take the body brace.
  //
  // The first `{` after the signature is almost never the body: every settings form in this
  // codebase is written `function X({ value, onChange }: WidgetSettingsFormProps<…>)`, so the
  // first brace opens the parameter DESTRUCTURING. Starting there returned `{ value, onChange }`
  // as the whole form and reported all 55 widgets as missing every key — including ones whose
  // panels are demonstrably complete. Read the findings before believing them.
  let i = src.indexOf('(', start);
  let parens = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') parens++;
    else if (src[i] === ')') { parens--; if (parens === 0) { i++; break; } }
  }
  const from = src.indexOf('{', i);
  if (from < 0) return null;
  let depth = 0;
  let j = from;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(from, j + 1);
}

/**
 * How each widget's options are meant to reach the user, from `lib/hub/widget-options.ts`.
 *
 * ── WHY THIS HALF IS NOT OPTIONAL ───────────────────────────────────────────────────────────────
 *
 * A widget shipping no `SettingsForm` is NOT automatically unreachable. The options panel has three
 * sources: the widget's own form, a DECLARATIVE SCHEMA rendered generically, or `none` for a
 * widget with nothing worth editing. Judging on the form alone reported 19 widgets as having
 * unreachable settings when most of them are served by a schema — a false gap list, and one that
 * would have sent the next slice rewriting forms that already work.
 */
function optionsRegistry() {
  const src = stripComments(fs.readFileSync('lib/hub/widget-options.ts', 'utf8'));
  const out = new Map();

  // Brace-MATCHED, not regex-delimited. A schema entry's `fields: [ { … }, { … } ]` contains
  // `\n    },` lines of its own, so a non-greedy `\{([\s\S]*?)\n\s*\},?\n` ends at the first nested
  // field object and reports the entry as having no `source`. That made `daily-briefing` — which
  // has a perfectly good schema entry — look absent from the registry entirely.
  const head = /'([\w-]+)':\s*\{/g;
  let m;
  while ((m = head.exec(src)) !== null) {
    const id = m[1];
    let i = m.index + m[0].length - 1; // at the opening brace
    let depth = 0;
    const from = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(from, i + 1);
    const source = body.match(/source:\s*'([\w-]+)'/)?.[1];
    if (!source) continue;
    // For a schema entry, the reachable settings are its declared field keys.
    const fields = [...body.matchAll(/key:\s*'([\w$]+)'/g)].map((f) => f[1]);
    out.set(id, { source, fields });
  }
  return out;
}

const OPTIONS = optionsRegistry();

const dirs = fs.readdirSync(WIDGET_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)
  .sort();

const rows = [];
for (const name of dirs) {
  const file = path.join(WIDGET_DIR, name, 'index.tsx');
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  const src = stripComments(raw);

  // The registry is keyed by the widget's declared ID, which is NOT always its directory name —
  // `equipment-out/` registers as `equipment-out-today`, for one. Keying on the folder reported
  // two widgets as absent from a registry they are in, and the repo's own
  // `widget-options-schema.test.ts` would have caught that claim immediately.
  const id = src.match(/defineWidget<[^>]*>\(\{\s*[\s\S]*?\bid:\s*'([\w-]+)'/)?.[1]
    ?? src.match(/\bid:\s*'([\w-]+)'/)?.[1]
    ?? name;

  const keys = contentKeys(src);
  const form = settingsFormBody(src);

  if (keys === null) { rows.push({ widget: id, state: 'no-defaults' }); continue; }
  if (keys.length === 0) { rows.push({ widget: id, state: 'no-settings', keys: [] }); continue; }

  const opt = OPTIONS.get(id);
  if (!opt) {
    // Not in the registry at all — `getWidgetOptionsEntry` falls back to `none`, so every key is
    // silently unreachable and nothing says so.
    rows.push({ widget: id, state: 'unregistered', keys, missing: keys });
    continue;
  }

  if (opt.source === 'schema') {
    const missing = keys.filter((k) => !opt.fields.includes(k));
    rows.push({ widget: id, state: missing.length ? 'gap' : 'complete', via: 'schema', keys, missing });
    continue;
  }

  if (opt.source === 'none') {
    // A deliberate declaration that there is nothing to edit. Worth surfacing when the content
    // model says otherwise — that is a claim the code contradicts, not a gap in a form.
    rows.push({ widget: id, state: 'declared-none', keys, missing: keys });
    continue;
  }

  // source === 'settings-form'
  if (form === null) {
    rows.push({ widget: id, state: 'no-form', keys, missing: keys });
    continue;
  }
  const missing = keys.filter((k) => !new RegExp(`\\b${k}\\b`).test(form));
  rows.push({ widget: id, state: missing.length ? 'gap' : 'complete', via: 'form', keys, missing });
}

if (AS_JSON) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const by = (s) => rows.filter((r) => r.state === s);
  const gaps = by('gap');
  const noForm = by('no-form');
  const declaredNone = by('declared-none');
  const unregistered = by('unregistered');
  const complete = by('complete');
  const none = [...by('no-settings'), ...by('no-defaults')];

  console.log(`\n  ${rows.length} widgets scanned\n`);
  console.log(`  complete         ${complete.length}   (every content key reachable)`);
  console.log(`  no settings      ${none.length}`);
  console.log(`  declared 'none'  ${declaredNone.length}   (registry says nothing to edit — check the model agrees)`);
  console.log(`  unregistered     ${unregistered.length}   (falls back to 'none'; every key silently unreachable)`);
  console.log(`  NO FORM          ${noForm.length}   (registry promises a form the widget does not ship)`);
  console.log(`  GAPS             ${gaps.length}   (form/schema exists but misses a key)\n`);

  const section = (title, list) => {
    if (!list.length) return;
    console.log(`  ── ${title} ──`);
    for (const r of list) console.log(`     ${r.widget.padEnd(24)} ${(r.missing ?? []).join(', ')}`);
    console.log('');
  };
  section('registry promises a form that does not exist', noForm);
  section('not in the options registry at all', unregistered);
  section("declared 'none' but the content model has keys", declaredNone);
  section('unreachable keys', gaps);
}
