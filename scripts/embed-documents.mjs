// scripts/embed-documents.mjs — build the semantic index over business documents (§3b, item 8d).
//
//   node scripts/embed-documents.mjs                 # embed anything new or changed
//   node scripts/embed-documents.mjs --dry-run       # show the plan, call no API, write nothing
//   node scripts/embed-documents.mjs --source research_documents
//   node scripts/embed-documents.mjs --limit 50      # stop after N rows (cost control)
//
// ── THIS SCRIPT COSTS MONEY, SO IT REFUSES TO REDO WORK ─────────────────────────────────────────
//
// Every chunk stores a hash of the text it was built from. A row whose text has not changed is
// skipped without an API call. Re-running after adding ten documents embeds ten documents, not 664.
// Without that, the only safe way to know what changed would be to re-embed everything and compare —
// which is the expensive thing this is avoiding.
//
// ── AND IT NEVER LEAVES A HALF-BUILT INDEX ─────────────────────────────────────────────────────
//
// Chunks are UPSERTed on (source_table, source_id, ordinal), never deleted-then-inserted. A crash or
// a rate-limit halfway through leaves the previous chunks in place and searchable. Delete-first would
// mean an interrupted run silently removes documents from search — the worst failure available here,
// because search would still work and simply stop finding things.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const ROOT = process.cwd();
for (const f of ['.env.local', '.env']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const ONLY_SOURCE = opt('--source');
const LIMIT = opt('--limit') ? Number(opt('--limit')) : Infinity;

// Must match seeds/516 `vector(1024)` and lib/learn/embeddings.ts. Three places, one number — the
// mismatch failure is a Postgres cast error at insert time, which is at least loud.
const EMBED_DIM = 1024;
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const MODEL = process.env.VOYAGE_EMBED_MODEL || 'voyage-3.5';
const BATCH = 96;

/** Same corpora as lib/search/semantic.ts EMBEDDABLE. */
const SOURCES = [
  {
    table: 'research_documents',
    textColumn: 'extracted_text',
    titleSql: `coalesce(nullif(document_label,''), original_filename, '')`,
  },
  { table: 'field_media', textColumn: 'transcription', titleSql: `coalesce(point_name,'')` },
];

/** Word-bounded chunks with overlap, mirroring lib/learn/reference-extract.ts.
 *
 *  The overlap is not padding: without it a concept that straddles a boundary — "a forty (40) foot
 *  access easement along the / North line of said tract" — is in neither chunk as a whole thought,
 *  and is the one query that will never match. */
function chunkText(text, { maxWords = 320, overlapWords = 60 } = {}) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= maxWords) return [words.join(' ')];

  const out = [];
  const step = Math.max(1, maxWords - overlapWords);
  for (let i = 0; i < words.length; i += step) {
    out.push(words.slice(i, i + maxWords).join(' '));
    if (i + maxWords >= words.length) break;
  }
  return out;
}

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function embedBatch(texts) {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error('VOYAGE_API_KEY is not set.');
  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: 'document', output_dimension: EMBED_DIM }),
  });
  if (!res.ok) throw new Error(`Voyage failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return (json.data ?? []).slice().sort((a, b) => a.index - b.index).map((r) => r.embedding);
}

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) { console.error('✗ SUPABASE_DB_URL not set.'); process.exit(2); }

  const hasKey = !!process.env.VOYAGE_API_KEY;
  if (!hasKey && !DRY) {
    // Not a crash, and not silent. Keyword search already works; this is the upgrade that has not
    // been switched on yet, and saying so is more useful than a stack trace.
    console.error('✗ VOYAGE_API_KEY is not set, so nothing can be embedded.');
    console.error('  Keyword and fuzzy search work without it — semantic search is the upgrade.');
    console.error('  Set VOYAGE_API_KEY (the FS tutor already uses the same key) and re-run.');
    console.error('  Use --dry-run to see what WOULD be embedded.');
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let totalChunks = 0, totalRows = 0, skipped = 0, embedded = 0;

  try {
    for (const src of SOURCES) {
      if (ONLY_SOURCE && src.table !== ONLY_SOURCE) continue;

      const { rows } = await client.query(
        `SELECT id, ${src.titleSql} AS title, ${src.textColumn} AS body
           FROM ${src.table}
          WHERE ${src.textColumn} IS NOT NULL AND length(${src.textColumn}) > 40
          ORDER BY id`,
      );
      console.log(`\n${src.table}: ${rows.length} row(s) with text`);

      for (const row of rows) {
        if (totalRows >= LIMIT) break;

        // The title is prepended to every chunk. A passage from the middle of a deed otherwise has no
        // idea which property it belongs to, and retrieval on "Waggoner easement" would miss the very
        // paragraph that answers it.
        const chunks = chunkText(row.body).map((c) =>
          row.title ? `${row.title}\n\n${c}` : c,
        );
        if (chunks.length === 0) continue;
        totalRows++;

        const existing = await client.query(
          `SELECT ordinal, content_hash FROM document_embeddings
            WHERE source_table = $1 AND source_id = $2`,
          [src.table, row.id],
        );
        const have = new Map(existing.rows.map((r) => [r.ordinal, r.content_hash]));

        const todo = [];
        chunks.forEach((content, ordinal) => {
          const h = hash(content);
          if (have.get(ordinal) === h) { skipped++; return; }
          todo.push({ ordinal, content, h });
        });
        totalChunks += chunks.length;
        if (todo.length === 0) continue;

        if (DRY) {
          console.log(`  · ${String(row.title).slice(0, 50)} — ${todo.length}/${chunks.length} chunk(s) would be embedded`);
          continue;
        }

        for (let i = 0; i < todo.length; i += BATCH) {
          const slice = todo.slice(i, i + BATCH);
          const vectors = await embedBatch(slice.map((c) => c.content));
          for (let k = 0; k < slice.length; k++) {
            await client.query(
              `INSERT INTO document_embeddings (source_table, source_id, ordinal, content, embedding, content_hash)
               VALUES ($1,$2,$3,$4,$5::vector,$6)
               ON CONFLICT (source_table, source_id, ordinal)
               DO UPDATE SET content = EXCLUDED.content,
                             embedding = EXCLUDED.embedding,
                             content_hash = EXCLUDED.content_hash`,
              [src.table, row.id, slice[k].ordinal, slice[k].content,
               JSON.stringify(vectors[k]), slice[k].h],
            );
            embedded++;
          }
          process.stdout.write(`\r  embedded ${embedded} chunk(s)…`);
        }
      }
    }

    console.log(`\n\n${DRY ? 'DRY RUN — ' : ''}rows: ${totalRows}, chunks seen: ${totalChunks}, unchanged (skipped): ${skipped}, embedded: ${embedded}`);
    if (!DRY) {
      const n = await client.query(`SELECT count(*)::int n FROM document_embeddings WHERE embedding IS NOT NULL`);
      console.log(`index now holds ${n.rows[0].n} searchable passage(s).`);
    }
  } finally {
    await client.end();
  }
}

await main();
