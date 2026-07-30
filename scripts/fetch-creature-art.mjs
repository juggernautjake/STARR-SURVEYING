// scripts/fetch-creature-art.mjs — find a licensed picture for each creature (B2-3).
//
//   npm run art:creatures -- --dry-run --limit=20    # search + report, download nothing
//   npm run art:creatures -- --limit=50              # do 50
//   npm run art:creatures                            # everything still missing art
//
// ── WHAT THIS MAY AND MAY NOT DO ─────────────────────────────────────────────────────────────────────
//
// Owner, 2026-07-29: *"You are welcome to use any artwork that is representative of the creature."* Read
// as: it need not be the canonical illustration. Which is what makes this possible, because the canonical
// illustrations are exactly the ones nobody can license.
//
// The decision layer is `lib/dnd/bestiary/art.ts` and it is under test. This script is the I/O around it:
// query Commons, take the first candidate the rules accept, download it, put it in our own bucket, and
// record the licence and the credit. `dnd_creatures` has a CHECK that makes an image without a licence
// unstorable, so the rule is enforced by the database and not by this script remembering it.
//
// NEVER A HOTLINK. An image we do not hold can change or vanish under us, and a bestiary served out of
// someone else's bandwidth is not a bestiary. Every accepted file is copied into `dnd-media`.
//
// ── WHY IT DOES NOT TRY TOO HARD ─────────────────────────────────────────────────────────────────────
//
// A creature with no acceptable hit is NOT a failure: `sigilFor` already draws a deterministic emblem and
// the aura already gives it a fitting atmosphere, so the fallback looks deliberate. That is what lets this
// refuse anything doubtful instead of reaching for a worse licence — the cost of a miss is genuinely low.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { acceptImage, searchTermsFor, speciesQueryFor } from '../lib/dnd/bestiary/art.ts';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry-run');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 0;
const ONLY = (process.argv.find((a) => a.startsWith('--system=')) || '').split('=')[1] || null;
/**
 * Only creatures with a curated species mapping.
 *
 * THE ONLY MODE THAT IS SAFE TO RUN UNATTENDED. A run without it accepted 40 correctly-licensed images of
 * which three of the four inspected were wrong — a pulsar for the Lich, nematodes for the Magma Worm, a
 * calligraphy brush for the Silver Dragon. Querying by scientific name removes the ambiguity that caused
 * all three, and `ANIMAL_SPECIES` is the hand-checked list of creatures for which such a name exists.
 */
const ANIMALS_ONLY = process.argv.includes('--animals-only');

const UA = { 'User-Agent': 'StarrTabletop/1.0 (bestiary art; https://starr-surveying.com; one-off, cached)' };
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const BUCKET = 'dnd-media';
const CACHE = path.join(ROOT, '.cache/commons');

const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const pick = (k) => (env.match(new RegExp(`${k}\\s*=\\s*"?([^"\\n\\r]+)`)) || [])[1];
const SUPABASE_URL = pick('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = pick('SUPABASE_SERVICE_ROLE_KEY');
const DB_URL = pick('SUPABASE_DB_URL');

/** Commons search, cached per term — many creatures share a fallback term ("dragon", "humanoid"). */
async function searchCommons(term) {
  fs.mkdirSync(CACHE, { recursive: true });
  const key = path.join(CACHE, term.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) + '.json');
  if (fs.existsSync(key)) return JSON.parse(fs.readFileSync(key, 'utf8'));

  const url = `${COMMONS}?${new URLSearchParams({
    action: 'query', format: 'json', generator: 'search',
    // `filetype:bitmap` keeps out SVGs and PDFs; the namespace restricts it to File: pages.
    gsrsearch: `filetype:bitmap ${term}`, gsrnamespace: '6', gsrlimit: '6',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '900',
  })}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return [];
  const json = await res.json();
  const pages = Object.values(json.query?.pages ?? {});
  const out = pages.map((p) => {
    const ii = p.imageinfo?.[0] ?? {};
    const em = ii.extmetadata ?? {};
    return {
      title: p.title,
      // The 900px thumbnail, not the 4000px original: this is a stat-block portrait, and a 12 MB TIFF-sized
      // JPEG would be slow for everyone and kinder to nobody.
      url: ii.thumburl || ii.url,
      descriptionUrl: ii.descriptionurl,
      licenceShortName: em.LicenseShortName?.value ?? null,
      artist: em.Artist?.value ?? null,
      width: ii.thumbwidth || ii.width || 0,
      height: ii.thumbheight || ii.height || 0,
      mime: ii.mime || '',
    };
  });
  fs.writeFileSync(key, JSON.stringify(out));
  return out;
}

/** Upload bytes to `dnd-media` and return the public URL. */
async function upload(key, bytes, contentType) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
}

async function main() {
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: creatures } = await client.query(
    `SELECT id, slug, name, type, system FROM dnd_creatures
      WHERE image_url IS NULL ${ONLY ? 'AND system = $1' : ''}
      ORDER BY cr_sort DESC NULLS LAST, name
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}`,
    ONLY ? [ONLY] : [],
  );
  const targets = ANIMALS_ONLY ? creatures.filter((c) => speciesQueryFor(c.name)) : creatures;
  console.log(
    ANIMALS_ONLY
      ? `${targets.length} curated real animal(s) without art (of ${creatures.length} missing overall).\n`
      : `${creatures.length} creature(s) without art.\n`,
  );

  const stats = { accepted: 0, none: 0, failed: 0 };
  const refusals = new Map();
  const noteRefusal = (why) => refusals.set(why, (refusals.get(why) ?? 0) + 1);

  for (const c of targets) {
    let picked = null;
    for (const term of searchTermsFor(c.name, c.type)) {
      let candidates;
      try {
        candidates = await searchCommons(term);
      } catch {
        continue;
      }
      for (const cand of candidates) {
        const verdict = acceptImage(cand);
        if (verdict.ok) { picked = { ...verdict.image, term }; break; }
        noteRefusal(verdict.why.replace(/\(.*?\)/, '').trim());
      }
      if (picked) break;
    }

    if (!picked) {
      stats.none += 1;
      console.log(`  —  ${c.name}: nothing usable (falls back to its sigil)`);
      continue;
    }

    if (DRY) {
      stats.accepted += 1;
      console.log(`  ✓  ${c.name} ← "${picked.term}" · ${picked.licence}`);
      continue;
    }

    try {
      const res = await fetch(picked.url, { headers: UA, signal: AbortSignal.timeout(45_000) });
      if (!res.ok) throw new Error(`download ${res.status}`);
      const type = res.headers.get('content-type') || 'image/jpeg';
      const bytes = Buffer.from(await res.arrayBuffer());
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      const key = `bestiary/${c.slug.replace(/[^a-z0-9]+/gi, '-')}.${ext}`;
      const publicUrl = await upload(key, bytes, type);

      await client.query(
        `UPDATE dnd_creatures
            SET image_url = $2, image_licence = $3, image_attribution = $4,
                image_source_url = $5, image_storage_path = $6, updated_at = now()
          WHERE id = $1`,
        [c.id, publicUrl, picked.licence, picked.attribution, picked.sourceUrl, key],
      );
      stats.accepted += 1;
      console.log(`  ✓  ${c.name} ← "${picked.term}" · ${picked.licence} · ${(bytes.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      stats.failed += 1;
      console.log(`  ✗  ${c.name}: ${e.message}`);
    }
  }

  // G6 — the run says what it did NOT do, and why, rather than reporting a bare success count.
  console.log(`\naccepted ${stats.accepted} · no usable image ${stats.none} · failed ${stats.failed}`);
  if (refusals.size) {
    console.log('\nwhy candidates were refused:');
    [...refusals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .forEach(([why, n]) => console.log(`  ${String(n).padStart(5)}  ${why}`));
  }
  const { rows: [t] } = await client.query(
    'SELECT count(*)::int total, count(image_url)::int with_art FROM dnd_creatures',
  );
  console.log(`\nbestiary art coverage: ${t.with_art} / ${t.total}`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
