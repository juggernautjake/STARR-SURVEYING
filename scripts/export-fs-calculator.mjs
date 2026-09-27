#!/usr/bin/env node
// scripts/export-fs-calculator.mjs
//
// Exports the calculator manual and the calculator engine out of lib/calculators
// and into the Lantern FS course.
//
// Two different things, handled two different ways:
//   • DATA  (the approved list, the key catalogue, the guided routines, the
//     keypad layouts) is transpiled, evaluated and written as JSON.
//   • CODE  (the maths and the TI-30Xa engine) is transpiled to plain JS and
//     shipped as a module the course loads, because a calculator that only had
//     its manual would be a book, not a calculator.
//
//   node scripts/export-fs-calculator.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '..', '..', '02-projects', 'lantern', 'app', 'fs');

// ── a tiny TypeScript module loader ─────────────────────────────────────────
// Enough to run the handful of data modules: it strips the types, resolves the
// "@/lib/…" alias the app uses, and caches by path.
const cache = new Map();

function loadTs(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);
  const file = absPath.endsWith('.ts') ? absPath : absPath + '.ts';
  const source = readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;

  const module = { exports: {} };
  cache.set(absPath, module.exports);

  const localRequire = (spec) => {
    if (spec.startsWith('@/')) return loadTs(join(ROOT, spec.slice(2)));
    if (spec.startsWith('.')) return loadTs(resolve(dirname(file), spec));
    return require(spec);
  };

  vm.runInNewContext(js, {
    module, exports: module.exports, require: localRequire,
    console, Math, Number, String, Object, Array, JSON, Date, isFinite, isNaN, parseFloat, parseInt,
  }, { filename: file });

  cache.set(absPath, module.exports);
  return module.exports;
}

const L = (p) => loadTs(join(ROOT, 'lib', 'calculators', p));

// ── data ────────────────────────────────────────────────────────────────────
const approved = L('approved.ts');
const catalogue = L('models/ti-30xa/catalogue.ts');
const guided = L('models/ti-30xa/guided.ts');

const keypads = {};
for (const model of ['ti-30xa', 'ti-36x-pro', 'ti-30xs-multiview', 'casio-fx-115', 'casio-fx-991', 'hp-33s', 'hp-35s']) {
  try {
    const mod = L(`models/${model}/keypad-data.ts`);
    // Each keypad module exports its layout under a model-specific name.
    const layout = Object.entries(mod).find(([k, v]) => Array.isArray(v) && v.length > 10);
    const meta = Object.entries(mod).find(([k, v]) => v && !Array.isArray(v) && typeof v === 'object');
    if (layout) keypads[model] = { keys: layout[1], meta: meta ? meta[1] : null };
  } catch (e) {
    console.warn(`  (no keypad for ${model}: ${e.message})`);
  }
}

const pick = (obj, test) => {
  const hit = Object.entries(obj).find(([k, v]) => test(k, v));
  return hit ? hit[1] : null;
};

const DATA = {
  approved: {
    listReviewed: approved.NCEES_LIST_REVIEWED || null,
    calculators: approved.APPROVED_CALCULATORS || [],
    entryModels: approved.ENTRY_MODELS || {},
  },
  // The catalogue and drills are exported under TI_30XA_* names.
  keys: pick(catalogue, (k, v) => /CATALOGUE$/.test(k) && Array.isArray(v)) || [],
  groups: catalogue.CATALOGUE_GROUPS || [],
  drills: pick(catalogue, (k, v) => /DRILL/.test(k) && Array.isArray(v)) || [],
  routines: pick(guided, (k, v) => /GUIDED$/.test(k) && Array.isArray(v)) || [],
  keypads,
};

mkdirSync(join(OUT, 'data'), { recursive: true });
writeFileSync(join(OUT, 'data', 'calculator.json'), JSON.stringify(DATA, null, 1) + '\n');

// ── code ────────────────────────────────────────────────────────────────────
// The maths module is pure and self-contained; transpiled to an IIFE it becomes
// the course's calculator engine with no build step of its own.
function toBrowser(tsPath, globalName) {
  const src = readFileSync(join(ROOT, 'lib', 'calculators', tsPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
  }).outputText;
  return `// Generated from lib/calculators/${tsPath} by scripts/export-fs-calculator.mjs.
// Do not edit here — edit the source and re-export.
(function (FS) {
  'use strict';
  var exports = {}, module = { exports: exports };
${js.split('\n').map((l) => '  ' + l).join('\n')}
  FS.${globalName} = module.exports;
})(globalThis.FS = globalThis.FS || {});
`;
}

writeFileSync(join(OUT, 'calc-math.js'), toBrowser('math.ts', 'calcMath'));
// The TI-30Xa itself: a pure state machine, press(state, key) -> state. It is
// what makes the course's calculator the same machine the exam allows rather
// than a generic one with different habits.
writeFileSync(join(OUT, 'calc-ti30xa.js'), toBrowser('models/ti-30xa/engine.ts', 'ti30xa'));

const n = (x) => (Array.isArray(x) ? x.length : Object.keys(x || {}).length);
console.log(`Exported to ${OUT}`);
console.log(`  data/calculator.json`);
console.log(`    approved calculators  ${n(DATA.approved.calculators)}`);
console.log(`    entry models          ${n(DATA.approved.entryModels)}`);
console.log(`    documented keys       ${n(DATA.keys)}`);
console.log(`    guided routines       ${n(DATA.routines)}`);
console.log(`    drills                ${n(DATA.drills)}`);
console.log(`    keypad layouts        ${n(DATA.keypads)}  (${Object.keys(DATA.keypads).join(', ')})`);
console.log(`  calc-math.js, calc-ti30xa.js`);
