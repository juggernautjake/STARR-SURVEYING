// scripts/verify-fs-retrieval.ts — prove the grounded tutor can retrieve real passages from
// the ingested reference library via the full-text path (seeds/404), no embeddings key needed.
// Run: npx tsx scripts/verify-fs-retrieval.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const QUERIES = [
  'How many inches are in a Texas vara?',
  'curvature and refraction correction in leveling',
  'balancing a closed traverse with the compass rule',
  'riparian and littoral water boundary rights',
  'difference between accuracy and precision',
  'how to double an angle greater than 180 degrees',
];

async function main() {
  const { count: docCount } = await db.from('fs_reference_docs').select('*', { count: 'exact', head: true }).eq('status', 'ready');
  const { count: chunkCount } = await db.from('fs_reference_chunks').select('*', { count: 'exact', head: true });
  console.log(`\nLibrary: ${docCount} ready documents, ${chunkCount} passages.\n`);

  for (const q of QUERIES) {
    const { data, error } = await db.rpc('search_fs_reference_chunks_fts', { query_text: q, match_count: 3 });
    console.log(`❓ ${q}`);
    if (error) { console.log(`   ERROR: ${error.message}\n`); continue; }
    const rows = (data ?? []) as { content: string; similarity: number; doc_title: string }[];
    if (!rows.length) { console.log('   (no match)\n'); continue; }
    for (const r of rows) {
      const snippet = r.content.replace(/\s+/g, ' ').slice(0, 150);
      console.log(`   • [${r.similarity.toFixed(3)}] ${r.doc_title}\n     "${snippet}…"`);
    }
    console.log('');
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
