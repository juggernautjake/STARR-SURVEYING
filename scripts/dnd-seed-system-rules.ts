// scripts/dnd-seed-system-rules.ts — populate dnd_system_entries from the authoritative catalog
// (Phase V, system-grounding Slice 4). Projects lib/dnd/system-rules.ts into the store so the browse
// UI and semantic retrieval reflect the same facts grounding injects. Idempotent: only inserts entries
// whose name isn't already present for the system (existing/curated rows are left untouched). Embeddings
// are computed when a Voyage key is configured; otherwise entries are stored text-only (backfill later).
//
// Run with tsx: `npx tsx scripts/dnd-seed-system-rules.ts` (needs SUPABASE service env + optional
// EMBEDDINGS key). Prints a per-system summary.
import { GAME_SYSTEMS } from '../lib/dnd/systems';
import { systemRulesEntries } from '../lib/dnd/system-rules-entries';
import { addSystemEntries, listSystemEntries } from '../lib/dnd/system-store';

async function main() {
  let total = 0;
  for (const sys of GAME_SYSTEMS) {
    const wanted = systemRulesEntries(sys.key);
    if (!wanted.length) { console.log(`- ${sys.key}: no catalog entries (skipped)`); continue; }
    // Idempotency: skip entries whose name already exists for this system.
    let existingNames = new Set<string>();
    try {
      const existing = await listSystemEntries(sys.key, undefined, 1000);
      existingNames = new Set(existing.map((e) => e.name.trim().toLowerCase()));
    } catch {
      /* system row may not exist yet — addSystemEntries will throw a clear error below */
    }
    const fresh = wanted.filter((e) => !existingNames.has(e.name.trim().toLowerCase()));
    if (!fresh.length) { console.log(`- ${sys.key}: already seeded (${wanted.length} entries present)`); continue; }
    try {
      const res = await addSystemEntries(sys.key, fresh);
      total += res.added;
      console.log(`- ${sys.key}: added ${res.added} entries${res.embedded ? ' (embedded)' : ' (text-only)'}`);
    } catch (e) {
      console.error(`- ${sys.key}: FAILED — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`Done. ${total} new system entries inserted.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
