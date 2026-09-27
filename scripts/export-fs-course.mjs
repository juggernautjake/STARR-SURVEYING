#!/usr/bin/env node
// scripts/export-fs-course.mjs
//
// Exports the Fundamentals of Surveying (FS) exam-prep course out of the live
// Starr database and into the Lantern repo as plain JSON, so the Lantern course
// pack builds and runs with no database and no network.
//
// Source of truth is the DB, not the seed files: sixty-odd fs_prep_* seeds have
// been layered on top of each other (fixes, reverts, batches), so replaying them
// would reproduce the history rather than the present state.
//
//   node scripts/export-fs-course.mjs [--out <dir>]
//
// Default out: ../../02-projects/lantern/app/fs/data  (relative to this repo)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argOut = process.argv.indexOf('--out');
const OUT = argOut > -1 && process.argv[argOut + 1]
  ? resolve(process.argv[argOut + 1])
  : resolve(ROOT, '..', '..', '02-projects', 'lantern', 'app', 'fs', 'data');

function dbUrl() {
  for (const f of ['.env.local', '.env']) {
    try {
      const m = readFileSync(join(ROOT, f), 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* next */ }
  }
  throw new Error('SUPABASE_DB_URL not found in .env.local or .env');
}

// Drop the columns that describe one tenant's usage rather than the course:
// per-org counters, review workflow, soft-delete tombstones, timestamps.
const DROP = new Set([
  'created_at', 'updated_at', 'deleted_at', 'created_by',
  'times_answered', 'times_correct', 'times_shown', 'report_count',
  'review_status', 'last_reviewed_by', 'last_reviewed_at', 'is_published',
  'is_active', 'org_id',
]);

const clean = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (DROP.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
};

const main = async () => {
  const client = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  // ── modules ───────────────────────────────────────────────────────────────
  const modules = await q(`
    select * from fs_study_modules
    where is_published is not false
    order by module_number`);
  const moduleIds = modules.map((m) => m.id);
  const byId = new Map(modules.map((m) => [m.id, m.module_number]));

  // ── questions ─────────────────────────────────────────────────────────────
  // Two banks, not one. The study bank hangs off fs_study_modules. The mock-exam
  // bank (exam_category FS-MOCK) has no module_id at all — it is tagged by NCEES
  // category and by module instead, and an export keyed only on module_id misses
  // all 270 of them.
  const questions = await q(`
    select *, 'study'::text as bank from question_bank
    where module_id = any($1::uuid[])
      and deleted_at is null
      and is_published is not false
    union all
    select *, 'mock'::text as bank from question_bank
    where exam_category = 'FS-MOCK'
      and deleted_at is null
      and is_published is not false
    order by bank, difficulty, id`, [moduleIds]);

  // ── generators ────────────────────────────────────────────────────────────
  const templates = await q(`
    select * from problem_templates
    where module_id = any($1::uuid[])
      and is_active is not false
    order by module_id, category, name`, [moduleIds]);

  // ── flashcards (categorised "fs:<module uuid>") ────────────────────────────
  const flashcards = await q(`
    select * from flashcards
    where deleted_at is null
      and is_published is not false
      and category = any($1::text[])
    order by category, term`, [moduleIds.map((id) => `fs:${id}`)]);

  // ── glossary ──────────────────────────────────────────────────────────────
  // The curated FS glossary lives in source, not in the database. It is what
  // makes a key term in a lesson clickable, so it travels with the course.
  const glossary = (() => {
    let src;
    try { src = readFileSync(join(ROOT, 'lib', 'learn', 'fsGlossary.ts'), 'utf8'); }
    catch { return { entries: [], aliases: {} }; }

    // Parsed line by line rather than by matching brackets. The definitions
    // contain quotes, semicolons and em-dashes, and a hand-rolled TypeScript
    // scanner trips over them; the file writes one entry per line, so read it
    // the way it is written.
    const unq = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    const section = (from, to) => {
      const a = src.indexOf(from);
      const b = to ? src.indexOf(to, a) : src.length;
      return a < 0 ? '' : src.slice(a, b < 0 ? src.length : b);
    };

    const entries = [];
    const entryRe = /\{\s*term:\s*'((?:[^'\\]|\\.)*)'\s*,\s*definition:\s*'((?:[^'\\]|\\.)*)'\s*\}/g;
    let m;
    const entriesBlock = section('const ENTRIES', 'const ALIASES');
    while ((m = entryRe.exec(entriesBlock)) !== null) {
      entries.push({ term: unq(m[1]), definition: unq(m[2]) });
    }

    const aliases = {};
    const aliasRe = /'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
    const aliasBlock = section('const ALIASES', 'const MAP');
    while ((m = aliasRe.exec(aliasBlock)) !== null) {
      aliases[unq(m[1])] = unq(m[2]);
    }

    return { entries, aliases };
  })();

  // ── tutor reference corpus ────────────────────────────────────────────────
  // Text only: the pgvector embedding and the tsvector are index artefacts of
  // this database, and Lantern builds its own retrieval index from the prose.
  const refDocs = await q(`
    select id, title, source, kind, notes, char_count, chunk_count
    from fs_reference_docs
    where status is null or status <> 'error'
    order by title`);
  const refChunks = await q(`
    select doc_id, ordinal, content
    from fs_reference_chunks
    order by doc_id, ordinal`);

  await client.end();

  // Re-key everything to the stable module_number so Lantern never carries a
  // Starr UUID: the course has to stand on its own once it is published.
  // The oldest mock questions predate the module numbering and carry only a
  // subject tag. Without a module they are unreachable from "practise module 4",
  // so the subject is mapped to the module that teaches it. Every tag in the
  // bank is listed: an unmapped one is reported rather than silently dropped.
  const TAG_MODULE = {
    1: ['fundamentals', 'units', 'precision', 'errors', 'significant-figures', 'statistics',
        'probability', 'error-propagation', 'standard-error', 'weights', 'least-squares',
        'redundancy', 'survey-types', 'computation'],
    2: ['leveling', 'benchmarks', 'curvature-refraction', 'curvature', 'collimation',
        'compensator', 'rod-reading', 'intermediate-foresight', 'elevation', 'NAVD88',
        'vertical-datum', 'closure-standards'],
    3: ['distance', 'angles', 'bearing-azimuth', 'azimuth', 'DMS', 'sag', 'tape-correction',
        'temperature-correction', 'slope-correction', 'slope-reduction', 'prism-constant',
        'direct-reverse', 'declination', 'repetition', 'total-station', 'stadia',
        'instruments', 'field-procedures'],
    4: ['traversing', 'COGO', 'inverse', 'compass-rule', 'transit-rule', 'angular-closure',
        'angular-adjustment', 'lat-dep', 'linear-closure', 'departure', 'radiation',
        'forward-computation', 'interior-angle', 'connecting-traverse', 'closure', 'adjustment',
        'survey-order'],
    5: ['curves', 'horizontal', 'vertical', 'areas', 'volumes', 'coordinate-area',
        'average-end-area', 'degree-of-curve', 'prismoidal-correction', 'high-point',
        'compound', 'deflection', 'tangent', 'stations', 'chord', 'K-value'],
    6: ['GNSS', 'geodesy', 'coordinate-systems', 'satellites', 'signal-speed', 'Galileo',
        'network-RTK', 'frequencies', 'geoid-undulation', 'ionosphere', 'troposphere',
        'combined-factor', 'constellation', 'elevation-factor', 'OPUS', 'post-processing',
        'multipath'],
    7: ['boundary-law', 'PLSS', 'lost-corners', 'corner-types', 'estoppel', 'accretion',
        'aliquot-parts', 'deed-descriptions', 'section-numbering'],
    8: ['GIS', 'photogrammetry', 'construction', 'offset-stakes', 'contours', 'buffer',
        'coverage', 'photo-scale', 'georeferencing', 'LiDAR'],
  };
  const tagToModule = new Map();
  for (const [m, tags] of Object.entries(TAG_MODULE)) for (const t of tags) tagToModule.set(t, Number(m));

  const num = (id) => byId.get(id) ?? null;
  const reModule = (r) => {
    const o = clean(r);
    if (o.module_id) { o.module = num(o.module_id); delete o.module_id; }
    // A mock-bank question carries its module as a tag (fs-m4) rather than a
    // foreign key, so read it from there when the key is absent; failing that,
    // place it by its subject.
    if (o.module == null) {
      const t = (o.tags || []).find((x) => /^fs-m\d+$/.test(x));
      if (t) o.module = Number(t.slice(4));
    }
    if (o.module == null) {
      for (const t of o.tags || []) {
        if (tagToModule.has(t)) { o.module = tagToModule.get(t); break; }
      }
    }
    delete o.module_id; delete o.lesson_id; delete o.topic_id; delete o.article_id;
    return o;
  };

  const out = {
    'modules.json': modules.map((m) => {
      const o = clean(m);
      o.n = o.module_number; delete o.module_number; delete o.id;
      return o;
    }),
    'questions.json': questions.map((r) => {
      const o = reModule(r);
      // template_id -> the generator's stable generator_id, resolved below
      return o;
    }),
    'templates.json': templates.map(reModule),
    'flashcards.json': flashcards.map((r) => {
      const o = clean(r);
      o.module = num(String(o.category || '').slice(3)) ?? null;
      delete o.category; delete o.id; delete o.module_id; delete o.lesson_id;
      return o;
    }),
    'glossary.json': glossary,
    'references.json': (() => {
      // Title -> slug, so a citation in a question survives without the UUID.
      const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      const keyOf = new Map();
      const docs = refDocs.map((d) => {
        const o = clean(d);
        let k = slug(o.title); let i = 2;
        while ([...keyOf.values()].includes(k)) k = `${slug(o.title)}-${i++}`;
        keyOf.set(o.id, k);
        o.key = k; delete o.id;
        return o;
      });
      const chunks = refChunks.map((c2) => ({
        doc: keyOf.get(c2.doc_id) || null,
        n: c2.ordinal,
        content: c2.content,
      })).filter((c2) => c2.doc);
      return { docs, chunks };
    })(),
  };

  // Resolve question.template_id (a UUID) to the generator's own id, and give
  // every template a stable key, so neither side needs the Starr UUID space.
  const tKey = new Map();
  out['templates.json'].forEach((t, i) => {
    const key = t.generator_id || `tpl-${String(i + 1).padStart(3, '0')}`;
    tKey.set(t.id, key);
    t.key = key;
    delete t.id; delete t.generator_id;
  });
  // The same question reached the bank twice from different seed batches. A
  // learner meeting it twice in one practice set reads as a bug, and it skews
  // the weighting of whatever it asks about, so the later copy is dropped.
  const byText = new Map();
  const deduped = [];
  let dropped = 0;
  for (const q2 of out['questions.json']) {
    const t = String(q2.question_text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    // A dynamic question's text is a placeholder — its generator is its identity.
    if (!q2.is_dynamic && t && byText.has(t)) { dropped++; continue; }
    if (!q2.is_dynamic && t) byText.set(t, true);
    deduped.push(q2);
  }
  out['questions.json'] = deduped;
  if (dropped) console.log(`  (dropped ${dropped} duplicate question${dropped === 1 ? '' : 's'})`);

  out['questions.json'].forEach((q2, i) => {
    q2.key = `q-${String(i + 1).padStart(4, '0')}`;
    if (q2.template_id) { q2.template = tKey.get(q2.template_id) || null; delete q2.template_id; }
    delete q2.id;
  });

  mkdirSync(OUT, { recursive: true });
  for (const [name, data] of Object.entries(out)) {
    writeFileSync(join(OUT, name), JSON.stringify(data, null, 1) + '\n');
  }

  const n = (x) => (Array.isArray(x) ? x.length : Object.values(x).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0));
  console.log(`Exported to ${OUT}`);
  for (const [name, data] of Object.entries(out)) console.log(`  ${name.padEnd(20)} ${n(data)}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
