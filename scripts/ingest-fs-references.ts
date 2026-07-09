// scripts/ingest-fs-references.ts — bulk-load the curated FS/SIT exam-prep + Texas surveying
// study material into the grounded-tutor reference library (fs_reference_docs/_chunks).
//
// Reuses the SAME extraction + chunking the upload route uses (lib/learn/reference-extract),
// then stores the original file privately in the learn-references bucket and inserts the
// searchable passages. Full-text search (seeds/404) makes them retrievable with no embeddings
// key; if VOYAGE_API_KEY is ever set, embeddings can be backfilled for semantic search.
//
// Run:  npx tsx scripts/ingest-fs-references.ts            # ingest anything not already ready
//       npx tsx scripts/ingest-fs-references.ts --fresh    # re-ingest (delete existing first)
//       npx tsx scripts/ingest-fs-references.ts --dry-run  # list the plan, touch nothing
//
// Connection: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (parsed from .env.local).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { extractReferenceText, chunkText } from '../lib/learn/reference-extract';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUCKET = 'learn-references';

const args = new Set(process.argv.slice(2));
const FRESH = args.has('--fresh');
const DRY = args.has('--dry-run');

// ── env (parse .env.local without a dotenv dependency, like apply-seeds.mjs) ──
function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    if (val && process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── the curated library ──
// Source folders live under two Windows profiles; both are readable from here.
const SIT = 'C:/Users/Jacob Maddux/STARR SURVEYING/SCHOOL/SIT Prep';
const LAW = 'C:/Users/Jacob Maddux/STARR SURVEYING/SCHOOL/NMSU SUR 292 Land Law';
const DL = 'C:/Users/lando/Downloads';

interface Item { file: string; title: string; source: string; notes?: string }

const LIBRARY: Item[] = [
  // ── SIT / FS core references ──
  { file: `${SIT}/fs-handbook-2-5.pdf`, title: 'NCEES FS Reference Handbook (v2.5)', source: 'NCEES — Fundamentals of Surveying Reference Handbook', notes: 'Primary reference supplied at the FS exam.' },
  { file: `${SIT}/10-18-2025  SIT Study Group Exam.pdf`, title: 'SIT Study Group — Practice Exam (2025-10-18)', source: 'SIT Study Group' },
  { file: `${SIT}/10-18-2025 SIT Study Group PP Slides.pdf`, title: 'SIT Study Group — Slides (2025-10-18)', source: 'SIT Study Group' },
  { file: `${SIT}/Surveying - Problem Solving with Theory and Objective Type Questions.pdf`, title: 'Surveying — Problem Solving with Theory & Objective Questions', source: 'Surveying: Problem Solving with Theory and Objective Type Questions' },
  { file: `${SIT}/Guide to Legal Aspects of Surveying (2nd Edition) Andrew L. Harbin, PE.PDF`, title: 'Guide to Legal Aspects of Surveying (2nd ed.)', source: 'Harbin, A. L., PE — Guide to Legal Aspects of Surveying, 2nd ed.' },
  { file: `${SIT}/HP 33S Programs.pdf`, title: 'HP-33S Survey Calculator Programs', source: 'HP-33S survey programs' },
  { file: `${SIT}/HP35S-Survey Programs with corrections.pdf`, title: 'HP-35S Survey Calculator Programs (corrected)', source: 'HP-35S survey programs' },
  { file: `${SIT}/RPLS Calculations _ TI-30X(a)_HP33-HP35_Polar-Rect_Rect-Polar_T.pdf`, title: 'RPLS Calculations — TI-30X / HP-33S / HP-35S (Polar↔Rect)', source: 'RPLS calculator reference' },
  { file: `${SIT}/RPLS Calculations _ pg 1.pdf`, title: 'RPLS Calculations — Reference (pg 1)', source: 'RPLS calculator reference' },
  { file: `${SIT}/Test_Strategies.pdf`, title: 'FS/SIT Exam — Test Strategies', source: 'SIT exam test strategies' },

  // ── NMSU SUR 292 — Land Law / boundary law ──
  { file: `${LAW}/1 Introduction- historical and current common law principles.pdf`, title: 'Land Law 1 — Historical & Current Common-Law Principles', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/2 Sources of Laws and Related Presumptions.pdf`, title: 'Land Law 2 — Sources of Law & Related Presumptions', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/3 Legal Doctrines  Principles in Property Law.pdf`, title: 'Land Law 3 — Legal Doctrines & Principles in Property Law', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/ApportionmentRecord.pdf`, title: 'Apportionment of Record', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/Basic Law of Water Boundaries.pdf`, title: 'Basic Law of Water Boundaries', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/Chapter-07.pdf`, title: 'Boundary Law — Chapter 7', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/Chapter-08.pdf`, title: 'Boundary Law — Chapter 8', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/Locating sequential conveyances.pdf`, title: 'Locating Sequential Conveyances', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/Locating simultaneous conveyances.pdf`, title: 'Locating Simultaneous Conveyances', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/Metes and bounds descriptions.pptx.pdf`, title: 'Metes and Bounds Descriptions', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/PossBoundary.pdf`, title: 'Possession & Boundary', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/Preambles_Examples.pdf`, title: 'Legal Description Preambles — Examples', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/Texas Water Boundaries.pdf`, title: 'Texas Water Boundaries', source: 'NMSU SUR 292 — Land Law (Texas)' },
  { file: `${LAW}/WRITING BOUNDARY DESCRIPTIONS.pdf`, title: 'Writing Boundary Descriptions', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/Water rights.pdf`, title: 'Water Rights', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/reg52908r22200709internet.pdf`, title: 'BLM Manual of Surveying Instructions — Excerpt', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/s4.pdf`, title: 'Land Law — Supplemental Reading (s4)', source: 'NMSU SUR 292 — Land Law' },
  { file: `${LAW}/SUR292 Legal Principles and Boundary Law I.docx`, title: 'Legal Principles and Boundary Law I', source: 'NMSU SUR 292 — Land Law' },

  // ── SRVY 1341 (ACC) — Texas land-surveying course handouts + lectures ──
  { file: `${DL}/-Handout-UnitsofMeasure.pdf`, title: 'Handout — Units of Measure', source: 'SRVY 1341 (ACC) course handout' },
  { file: `${DL}/-Handout-DMS-DEC.pdf`, title: 'Handout — DMS ↔ Decimal Degrees', source: 'SRVY 1341 (ACC) course handout' },
  { file: `${DL}/-Handout-DMS-DEC-Answers.pdf`, title: 'Handout — DMS ↔ Decimal Degrees (Answers)', source: 'SRVY 1341 (ACC) course handout' },
  { file: `${DL}/-Handout-SurveyingTheLand-MiltonDenny-Chains.pdf`, title: 'Handout — Surveying the Land / Chains (Milton Denny)', source: 'SRVY 1341 (ACC) course handout' },
  { file: `${DL}/Handout-LeastSquares.pdf`, title: 'Handout — Least Squares', source: 'SRVY 1341 (ACC) course handout' },
  { file: `${DL}/Handout-MinimumTotalStationInstrumentFieldProcedures.pdf`, title: 'Handout — Minimum Total-Station Field Procedures', source: 'SRVY 1341 (ACC) course handout' },
  { file: `${DL}/Handout-double angles greater than 180.pdf`, title: 'Handout — Doubling Angles (> 180°)', source: 'SRVY 1341 (ACC) course handout' },
  { file: `${DL}/Handout-double angles less than 180.pdf`, title: 'Handout — Doubling Angles (< 180°)', source: 'SRVY 1341 (ACC) course handout' },
  { file: `${DL}/Traverse2Solved.pdf`, title: 'Worked Example — Traverse 2 (Solved)', source: 'SRVY 1341 (ACC) course handout' },
  ...Array.from({ length: 9 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { file: `${DL}/2026-Class${n}-SRVY-1341LandSurveying.pdf`, title: `SRVY 1341 — Lecture ${i + 1}`, source: 'SRVY 1341 (ACC) lecture, Spring 2026' };
  }),
];

function mimeFor(file: string): string {
  const n = file.toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.docx') || n.endsWith('.doc')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  return 'text/plain';
}

async function ensureBucket() {
  const { data } = await db.storage.getBucket(BUCKET);
  if (!data) await db.storage.createBucket(BUCKET, { public: false });
}

async function main() {
  console.log(`\nFS reference ingestion — ${LIBRARY.length} curated files${DRY ? ' (DRY RUN)' : ''}${FRESH ? ' (FRESH: existing rows deleted)' : ''}\n`);

  // Sanity: which source files are actually present?
  const missing = LIBRARY.filter((it) => !fs.existsSync(it.file));
  if (missing.length) {
    console.log(`⚠ ${missing.length} listed file(s) not found on disk (will be skipped):`);
    for (const m of missing) console.log(`    · ${path.basename(m.file)}`);
    console.log('');
  }
  const present = LIBRARY.filter((it) => fs.existsSync(it.file));

  if (DRY) {
    for (const it of present) console.log(`  would ingest: ${it.title}  ←  ${path.basename(it.file)}`);
    console.log(`\n${present.length} file(s) ready to ingest. Re-run without --dry-run to apply.`);
    return;
  }

  await ensureBucket();

  let ok = 0, failed = 0, skipped = 0, totalChunks = 0;
  const flags: string[] = [];

  for (const it of present) {
    const base = path.basename(it.file);
    // Idempotency: skip files already ingested & ready, unless --fresh.
    const { data: existing } = await db
      .from('fs_reference_docs')
      .select('id, status, chunk_count')
      .eq('original_filename', base);
    const existingRows = (existing ?? []) as { id: string; status: string; chunk_count: number | null }[];
    if (existingRows.length) {
      if (!FRESH && existingRows.some((d) => d.status === 'ready' && (d.chunk_count ?? 0) > 0)) {
        console.log(`  ⏭  skip (already ready): ${it.title}`);
        skipped++;
        continue;
      }
      for (const d of existingRows) await db.from('fs_reference_docs').delete().eq('id', d.id);
    }

    process.stdout.write(`  … ${it.title}  `);
    const buffer = fs.readFileSync(it.file);
    const mime = mimeFor(it.file);

    // Store original privately (best-effort).
    let storagePath: string | null = null;
    try {
      const key = `${Date.now()}-${base.replace(/[^\w.\-]+/g, '_')}`.slice(0, 200);
      const { error } = await db.storage.from(BUCKET).upload(key, buffer, { contentType: mime, upsert: true });
      if (!error) storagePath = key;
    } catch { /* storage optional */ }

    const { data: docRow, error: insErr } = await db
      .from('fs_reference_docs')
      .insert({ title: it.title, source: it.source, notes: it.notes ?? null, original_filename: base, storage_path: storagePath, status: 'processing', added_by: 'ingest-script' })
      .select('id')
      .single();
    if (insErr || !docRow) { console.log(`✗ could not create row: ${insErr?.message}`); failed++; continue; }
    const docId = docRow.id as string;

    try {
      const extracted = await extractReferenceText(buffer, mime, base);
      const chunks = chunkText(extracted.text);
      if (chunks.length === 0) throw new Error('no readable text (likely a scan needing OCR)');

      const rows = chunks.map((content, i) => ({ doc_id: docId, ordinal: i, content, token_estimate: Math.ceil(content.length / 4), embedding: null }));
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await db.from('fs_reference_chunks').insert(rows.slice(i, i + 100));
        if (error) throw new Error(`saving passages failed: ${error.message}`);
      }
      await db.from('fs_reference_docs').update({ status: 'ready', kind: extracted.kind, char_count: extracted.text.length, chunk_count: chunks.length, updated_at: new Date().toISOString() }).eq('id', docId);

      // Flag OCR'd docs — Claude OCR can truncate very long scans; worth a manual look.
      const suspiciouslyThin = extracted.method === 'claude-pdf-ocr' && extracted.text.length < 1500;
      console.log(`✓ ${chunks.length} chunks  [${extracted.method}${suspiciouslyThin ? ', THIN — check' : ''}]`);
      if (extracted.method.includes('ocr') || suspiciouslyThin) flags.push(`${it.title} — ${extracted.method}, ${extracted.text.length} chars`);
      ok++; totalChunks += chunks.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'extraction failed';
      await db.from('fs_reference_docs').update({ status: 'failed', error: msg, updated_at: new Date().toISOString() }).eq('id', docId);
      console.log(`✗ ${msg}`);
      flags.push(`${it.title} — FAILED: ${msg}`);
      failed++;
    }
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Done: ${ok} ingested, ${skipped} skipped, ${failed} failed. ${totalChunks} passages total.`);
  if (flags.length) {
    console.log(`\nNeeds a look (OCR / failures):`);
    for (const f of flags) console.log(`  · ${f}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
