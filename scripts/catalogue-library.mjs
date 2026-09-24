// scripts/catalogue-library.mjs — read the library's documents and record what they say.
//
// Owner, 2026-09-23: "whenever a customer does a search or reviews a document online or in our
// library... our system saves any important information that it finds in the document. If the
// document has specific names and dates and locations and surveying companies/rpls names/numbers
// listed, we catalogue all of that information and save it to the file."
//
//   node scripts/catalogue-library.mjs --limit 200              # the trial run
//   node scripts/catalogue-library.mjs --county bell --all      # the rest, resumable
//   node scripts/catalogue-library.mjs --status                 # what is done, what is left
//   node scripts/catalogue-library.mjs --limit 5 --dry-run      # read, print, write nothing
//   node scripts/catalogue-library.mjs --recatalogue            # rows below CATALOGUE_VERSION
//
// ── MEASURED BEFORE IT WAS BUILT ────────────────────────────────────────────────────────────────
//
// Forty plats sampled off disk: ZERO have an embedded text layer, so there is nothing to index
// without reading the scan, and every one is exactly ONE page — `page_count = 1` turned out to be
// accidentally true. Three sent to the model measured 2,026 input and 662 output tokens each, about
// ten seconds apiece. That is what makes the whole 8,077-document archive affordable in one pass.
//
// The PDF goes to the API directly rather than being rasterised first: poppler is not installed on
// this machine, the sheets are one page, and a step that is not there cannot fail.
//
// ── RESUMABLE, BECAUSE 8,000 OF ANYTHING GETS INTERRUPTED ───────────────────────────────────────
//
// `catalogued_at` on the row is the progress marker — there is no side file to lose. Every run asks
// the database what is still NULL, so stopping is free and restarting costs nothing. A document
// that fails is stamped with `catalogue_error` and NOT retried forever by the same pass; the error
// stays readable so a pattern of failures is visible rather than silently skipped.

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ── ARGUMENTS ───────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const LIMIT = Number(opt('limit', flag('all') ? '100000' : '200'));
const COUNTY = opt('county', null);
const DRY_RUN = flag('dry-run');
const STATUS_ONLY = flag('status');
const RECATALOGUE = flag('recatalogue');
const CONCURRENCY = Math.max(1, Math.min(8, Number(opt('concurrency', '4'))));

// ── ENV ─────────────────────────────────────────────────────────────────────────────────────────
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i < 1 || line.trim().startsWith('#')) continue;
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// The schema module is TypeScript; the prompt and constants are read from it as text so the sweeper
// and the application can never disagree about what a catalogue contains.
const schemaSrc = fs.readFileSync('lib/research/catalogue-schema.ts', 'utf8');
const CATALOGUE_VERSION = Number(schemaSrc.match(/CATALOGUE_VERSION = (\d+)/)?.[1] ?? 1);
const CATALOGUE_PROMPT = schemaSrc.match(/export const CATALOGUE_PROMPT = `([\s\S]*?)`;\s*$/m)?.[1];
if (!CATALOGUE_PROMPT) { console.error('Could not read CATALOGUE_PROMPT from lib/research/catalogue-schema.ts'); process.exit(1); }
const CONFIDENCE_SCORE = { high: 90, medium: 65, low: 35 };
const FIELD_TO_CATEGORY = {
  subdivision_name: 'subdivision_name', rpls_number: 'surveyor_info', name: 'surveyor_info',
  firm: 'surveyor_info', recorded_date: 'date_reference', recording_reference: 'recording_reference',
  original_survey: 'legal_description', abstract_number: 'legal_description', lots: 'lot_block',
  blocks: 'lot_block', acreage: 'area', adjoining_subdivisions: 'adjoiner', owners: 'annotation',
  city: 'annotation', county: 'annotation', state: 'annotation',
};

const MODEL = process.env.AI_MODEL_EXTRACTION || 'claude-sonnet-5';
const BUCKET = 'research-documents';

// ── STATUS ──────────────────────────────────────────────────────────────────────────────────────
async function status() {
  const counts = {};
  for (const [label, q] of [
    ['catalogued', db.from('research_documents').select('*', { count: 'exact', head: true }).not('catalogued_at', 'is', null)],
    ['waiting', db.from('research_documents').select('*', { count: 'exact', head: true }).is('catalogued_at', null).eq('shareable', true).not('storage_path', 'is', null)],
    ['failed', db.from('research_documents').select('*', { count: 'exact', head: true }).not('catalogue_error', 'is', null)],
    ['no file', db.from('research_documents').select('*', { count: 'exact', head: true }).eq('shareable', true).is('storage_path', null)],
  ]) {
    const { count } = await q;
    counts[label] = count ?? 0;
  }
  console.log('catalogue status');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(12)} ${v}`);
  return counts;
}

if (STATUS_ONLY) { await status(); process.exit(0); }

// ── THE QUEUE ───────────────────────────────────────────────────────────────────────────────────
async function queue() {
  let q = db.from('research_documents')
    .select('id, research_project_id, document_label, storage_path, county_fips, catalogue_version')
    .eq('shareable', true)
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: true })
    .limit(LIMIT);
  // `catalogue_error IS NULL` too: a row that already failed is not retried by an ordinary pass, so
  // one broken file cannot stall the sweep by being picked first every time.
  q = RECATALOGUE ? q.lt('catalogue_version', CATALOGUE_VERSION) : q.is('catalogued_at', null).is('catalogue_error', null);
  if (COUNTY) q = q.eq('county_fips', COUNTY);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── READING ONE DOCUMENT ────────────────────────────────────────────────────────────────────────
async function catalogueOne(row) {
  // A storage_path that names a FOLDER rather than a file — `…/artifacts/plat/` — is a real and
  // pre-existing condition on 188 rows, almost all customer work. Supabase answers that with an
  // error object that stringifies to `{}`, so it is named here instead of reported as nothing.
  const looksLikeFolder = row.storage_path.endsWith('/') || !(row.storage_path.split('/').pop() ?? '').includes('.');
  if (looksLikeFolder) return { error: `storage_path names a folder, not a file: ${row.storage_path}` };

  const dl = await db.storage.from(BUCKET).download(row.storage_path);
  if (dl.error) return { error: `download failed: ${dl.error.message || dl.error.name || 'storage did not say why'}` };
  const buf = Buffer.from(await dl.data.arrayBuffer());
  // The API's document limit. A sheet this big is the 50 MB upload-cap population; it is recorded
  // as an error rather than silently skipped, so the gap stays visible.
  if (buf.length > 30 * 1024 * 1024) return { error: `too large to read (${(buf.length / 1048576).toFixed(1)} MB)` };

  const res = await ai.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
        { type: 'text', text: CATALOGUE_PROMPT },
      ],
    }],
  });

  const text = res.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return { error: 'the reader returned no JSON', usage: res.usage };
  let cat;
  try {
    cat = JSON.parse(json);
  } catch (e) {
    // Truncation at max_tokens is the common cause and it is recoverable: the fields already
    // closed are perfectly good. Losing a whole sheet's reading because the last array was cut
    // mid-element would throw away the expensive part over the cheapest part.
    const salvaged = salvage(json);
    if (salvaged) return { catalogue: { ...salvaged, notes: `${salvaged.notes ?? ''} [recovered from a truncated reading]`.trim() }, usage: res.usage, partial: true };
    return { error: `unparseable JSON: ${e.message}`, usage: res.usage };
  }
  return { catalogue: cat, usage: res.usage };
}

/** Close a JSON object that was cut off mid-write, keeping whatever parsed cleanly. */
function salvage(raw) {
  for (let end = raw.length; end > 200; end -= 1) {
    if (!'}]'.includes(raw[end - 1]) && raw[end - 1] !== '"') continue;
    for (const tail of ['', '}', ']}', '"}]}', '}]}', '"}}']) {
      try { return JSON.parse(raw.slice(0, end) + tail); } catch { /* keep shrinking */ }
    }
  }
  return null;
}

/** Flatten the catalogue into `extracted_data_points` rows, keeping every rating and quote. */
function dataPoints(row, cat) {
  const out = [];
  const push = (field, f) => {
    if (!f || f.value === null || f.value === undefined || f.value === '') return;
    const category = FIELD_TO_CATEGORY[field];
    if (!category) return;
    out.push({
      research_project_id: row.research_project_id,
      document_id: row.id,
      data_category: category,
      raw_value: String(f.value),
      display_value: String(f.value),
      normalized_value: { field, value: f.value },
      source_text_excerpt: f.source_text ?? null,
      extraction_confidence: CONFIDENCE_SCORE[f.confidence] ?? 35,
      // The WORD is the authority; the decimal above is a bucket for a column that wanted a number.
      confidence_reasoning: `${f.confidence} confidence (catalogue v${CATALOGUE_VERSION}, ${MODEL})`,
      source_page: 1,
    });
  };
  for (const [k, v] of Object.entries(cat)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'confidence' in v) push(k, v);
  }
  for (const s of cat.surveyors ?? []) { push('name', s.name); push('firm', s.firm); push('rpls_number', s.rpls_number); }
  for (const o of cat.owners ?? []) push('owners', o);
  for (const a of cat.adjoining_subdivisions ?? []) push('adjoining_subdivisions', a);
  return out;
}

// ── RUN ─────────────────────────────────────────────────────────────────────────────────────────
const rows = await queue();
console.log(`${rows.length} document(s) to read${COUNTY ? ` in ${COUNTY}` : ''}${DRY_RUN ? ' (dry run — nothing will be written)' : ''}\n`);
if (!rows.length) { await status(); process.exit(0); }

let done = 0, failed = 0, unreadable = 0, inTok = 0, outTok = 0, lowFields = 0, points = 0;
const started = Date.now();

async function worker(slice) {
  for (const row of slice) {
    try {
      const r = await catalogueOne(row);
      if (r.usage) { inTok += r.usage.input_tokens; outTok += r.usage.output_tokens; }

      if (r.error) {
        failed += 1;
        console.log(`  ✗ ${(row.document_label ?? row.id).slice(0, 52).padEnd(54)} ${r.error}`);
        if (!DRY_RUN) await db.from('research_documents').update({ catalogue_error: r.error, updated_at: new Date().toISOString() }).eq('id', row.id);
        continue;
      }

      const cat = r.catalogue;
      if (cat.unreadable) unreadable += 1;
      const pts = dataPoints(row, cat);
      points += pts.length;
      const lows = pts.filter((p) => p.extraction_confidence <= 35).length;
      lowFields += lows;

      if (!DRY_RUN) {
        const { error: upErr } = await db.from('research_documents').update({
          catalogue: cat,
          catalogued_at: new Date().toISOString(),
          catalogue_model: MODEL,
          catalogue_version: CATALOGUE_VERSION,
          catalogue_error: null,
          // The sheet has been read; the pipeline's own status reflects that.
          processing_status: cat.unreadable ? 'failed' : 'analyzed',
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        if (upErr) { failed += 1; console.log(`  ✗ ${row.id} write failed: ${upErr.message}`); continue; }
        if (pts.length) {
          // Replaced rather than appended, so re-cataloguing does not leave two generations of
          // facts about one sheet sitting side by side disagreeing.
          await db.from('extracted_data_points').delete().eq('document_id', row.id);
          await db.from('extracted_data_points').insert(pts);
        }
      }

      done += 1;
      const sub = cat.subdivision_name?.value ?? row.document_label ?? row.id;
      const surv = cat.surveyors?.[0];
      const who = surv?.name?.value || surv?.firm?.value || '—';
      const rpls = surv?.rpls_number?.value ? `RPLS ${surv.rpls_number.value} (${surv.rpls_number.confidence})` : 'no RPLS';
      console.log(`  ✓ ${String(sub).slice(0, 44).padEnd(46)} ${String(who).slice(0, 24).padEnd(26)} ${rpls}${lows ? `  [${lows} low]` : ''}`);
    } catch (e) {
      failed += 1;
      const msg = e?.message ?? String(e);
      console.log(`  ✗ ${(row.document_label ?? row.id).slice(0, 52).padEnd(54)} ${msg.slice(0, 80)}`);
      if (!DRY_RUN) await db.from('research_documents').update({ catalogue_error: msg.slice(0, 500) }).eq('id', row.id).then(() => {}, () => {});
    }
  }
}

// Round-robin so each worker gets a spread of the alphabet rather than one contiguous block.
const slices = Array.from({ length: CONCURRENCY }, (_, i) => rows.filter((_, j) => j % CONCURRENCY === i));
await Promise.all(slices.map(worker));

const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\n────────────────────────────────────────`);
console.log(`read ${done}, failed ${failed}, illegible ${unreadable} — ${mins} min`);
console.log(`${points} facts recorded, ${lowFields} of them low-confidence (stored, shown, never auto-matched)`);
console.log(`tokens: ${inTok.toLocaleString()} in, ${outTok.toLocaleString()} out`);
if (done) {
  const perDoc = (inTok / done) * 3 / 1e6 + (outTok / done) * 15 / 1e6;
  console.log(`≈ $${perDoc.toFixed(4)}/document at $3/$15 per M — $${(perDoc * 8077).toFixed(0)} for all 8,077`);
}
await status();
