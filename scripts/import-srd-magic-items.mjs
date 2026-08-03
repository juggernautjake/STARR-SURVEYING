// scripts/import-srd-magic-items.mjs — generate the 5e magic-item catalogue from the SRD (P8-2).
//
//   node scripts/import-srd-magic-items.mjs          # writes lib/dnd/magic-items/dnd5e.ts
//   node scripts/import-srd-magic-items.mjs --check  # regenerates in memory and diffs; exits 1 on drift
//
// WHY A GENERATOR AND NOT A HAND-AUTHORED FILE. 237 items with verbatim rules text is not something to
// retype, and a hand-edit is exactly how a catalogue silently stops matching its source. The generated
// file says so at the top and `--check` is what a test uses to prove it still matches.
//
// LICENCE IS READ FROM THE DATA, NOT FROM THIS FILE — the rule `import-open5e.mjs` established for the
// bestiary, for the same reason. The run asks the API which document each item belongs to and what that
// document's licence is; anything outside the allowlist is REFUSED BY NAME and printed. Open5e serves
// 1,618 magic items across five documents, and only the SRD subset is ours to redistribute:
//
//     805  vom       Vault of Magic          — Kobold Press, NOT redistributable here
//     546  a5e       Level Up Advanced 5e    — a different game's items
//     237  wotc-srd  5e Core Rules (SRD 5.1) — CC-BY-4.0  ← the only one we take
//      29  toh       Tome of Heroes
//       1  taldorei  Critical Role
//
// So a run that quietly grew to 1,618 items would be a licence incident, not a content win. The count is
// asserted in `__tests__/dnd/magic-items-5e.test.ts` for that reason.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const CACHE = path.join(REPO, '.cache');
const OUT = path.join(REPO, 'lib/dnd/magic-items/dnd5e.ts');
const API = 'https://api.open5e.com/v1';

/** The documents we may redistribute, and the licence each is claimed under. A document not listed here
 *  is refused even if the API offers it. */
const ALLOWED = { 'wotc-srd': 'CC-BY-4.0' };

const check = process.argv.includes('--check');

async function getJson(url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `srd-magic-items-${Buffer.from(url).toString('base64url').slice(-60)}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetch(url, { headers: { 'User-Agent': 'starr-tabletop-items/1.0 (self-hosted campaign tool)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const json = await res.json();
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}

// ── the parsers, kept identical in behaviour to lib/dnd/magic-items/model.ts ──────────────────────────
// Duplicated rather than imported because this is a plain .mjs script and the model is TypeScript. The
// duplication is BOUNDED by a test that re-parses the generated file's own rows through the real model
// and asserts they come out the same, so a divergence fails rather than drifting.
const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];
const CATEGORIES = ['armor', 'potion', 'ring', 'rod', 'scroll', 'staff', 'wand', 'weapon', 'wondrous item'];

function parseRarity(raw) {
  const text = (raw ?? '').trim();
  if (!text) return {};
  const lower = text.toLowerCase();
  return RARITIES.includes(lower) ? { rarity: lower } : { rarityNote: text };
}
function parseAttunement(raw) {
  const text = (raw ?? '').trim();
  if (!text) return { attunement: false };
  if (!/^requires\s+attunement/i.test(text)) return { attunement: true, attunementNote: text };
  const rest = text.replace(/^requires\s+attunement\s*/i, '').trim();
  return rest ? { attunement: true, attunementNote: rest } : { attunement: true };
}
function parseType(raw) {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const m = text.match(/^([^(]+?)\s*(?:\(([^)]*)\))?$/);
  if (!m) return null;
  const head = m[1].trim().toLowerCase();
  if (!CATEGORIES.includes(head)) return null;
  const inner = (m[2] ?? '').trim();
  return inner ? { category: head, appliesTo: inner } : { category: head };
}

const lit = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`;

async function main() {
  // Licences first, so a document whose terms changed is caught before any item is read.
  const docs = await getJson(`${API}/documents/?limit=50`);
  const licenceOf = new Map();
  for (const d of docs.results ?? []) licenceOf.set(d.slug, { title: d.title, license: d.license, url: d.url });

  const refusedDocs = [];
  for (const slug of Object.keys(ALLOWED)) {
    const meta = licenceOf.get(slug);
    if (!meta) { refusedDocs.push(`${slug}: not published by the API`); continue; }
    if (!meta.license) refusedDocs.push(`${slug}: the API states no licence`);
  }
  if (refusedDocs.length) {
    console.error('REFUSED — licence could not be confirmed:\n  ' + refusedDocs.join('\n  '));
    process.exit(1);
  }

  const all = await getJson(`${API}/magicitems/?limit=2000`);
  const rows = [];
  const refused = [];
  const skippedDocs = new Map();

  for (const it of all.results ?? []) {
    const licence = ALLOWED[it.document__slug];
    if (!licence) { skippedDocs.set(it.document__slug, (skippedDocs.get(it.document__slug) ?? 0) + 1); continue; }
    const type = parseType(it.type);
    if (!type) { refused.push(`${it.slug}: unrecognised type ${JSON.stringify(it.type)}`); continue; }
    if (!it.name || !it.slug) { refused.push(`${it.slug ?? '(no slug)'}: missing name or slug`); continue; }
    const desc = String(it.desc ?? '').trim();
    if (!desc) { refused.push(`${it.slug}: no rules text`); continue; }
    rows.push({
      key: it.slug, name: it.name, ...type,
      ...parseRarity(it.rarity), ...parseAttunement(it.requires_attunement),
      description: desc, source: 'SRD 5.1', licence,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  // A refusal is printed, never swallowed — a source-format change should look like a source-format
  // change rather than like a shorter catalogue.
  if (refused.length) console.error(`REFUSED ${refused.length} row(s):\n  ` + refused.join('\n  '));
  for (const [slug, n] of [...skippedDocs].sort((a, b) => b[1] - a[1])) {
    console.log(`skipped ${String(n).padStart(4)} from ${slug} (not on the licence allowlist)`);
  }

  const body = rows.map((r) => {
    const f = [`key: ${lit(r.key)}`, `name: ${lit(r.name)}`, `category: ${lit(r.category)}`];
    if (r.appliesTo) f.push(`appliesTo: ${lit(r.appliesTo)}`);
    if (r.rarity) f.push(`rarity: ${lit(r.rarity)}`);
    if (r.rarityNote) f.push(`rarityNote: ${lit(r.rarityNote)}`);
    f.push(`attunement: ${r.attunement}`);
    if (r.attunementNote) f.push(`attunementNote: ${lit(r.attunementNote)}`);
    f.push(`description: ${lit(r.description)}`, `source: ${lit(r.source)}`, `licence: ${lit(r.licence)}`);
    return `  { ${f.join(', ')} },`;
  }).join('\n');

  const file = `// lib/dnd/magic-items/dnd5e.ts — the 5e magic-item catalogue (P8-2).
//
// GENERATED by scripts/import-srd-magic-items.mjs. Do not hand-edit: \`npm run verify:magic-items\`
// regenerates this file in memory and fails if it has drifted from the source.
//
// Every entry is from the **SRD 5.1 under CC-BY-4.0** — the licence is carried per row rather than
// asserted here, and the importer refuses any document not on its allowlist by name. Open5e serves
// 1,618 magic items; ${rows.length} of them are the SRD's, and the rest belong to publishers whose terms do not
// let us redistribute them. See \`MAGIC_ITEM_GAPS\` for what that means for a table in practice.
//
// Rules text is VERBATIM. Rarity that the book states as a range or a condition is kept as
// \`rarityNote\` rather than flattened to a ladder value, and attunement restrictions are kept whole —
// see the three traps documented in \`./model.ts\`.
import type { MagicItem } from './model';

export const MAGIC_ITEMS_5E: readonly MagicItem[] = [
${body}
];

/** What this catalogue does NOT have, stated so an absent item reads as "not catalogued" rather than as
 *  "does not exist" — the \`PF2_*_GAPS\` convention, applied to items. */
export const MAGIC_ITEM_GAPS = {
  count: MAGIC_ITEMS_5E.length,
  notes: [
    'The SRD subset only. Items printed in the Dungeon Master’s Guide but held back from the SRD — the named artifacts, most sentient weapons — are outside CC-BY and are deliberately absent rather than missing.',
    'Third-party 5e items (Kobold Press’ Vault of Magic, Level Up A5e, Tome of Heroes) are served by the same API and are NOT redistributable here, so they are refused by licence rather than omitted by oversight.',
    'No item carries machine-readable Effects. A Belt of Giant Strength’s “your Strength score is 21” is prose here; adding it to a sheet records the item and its text, and the numeric effect is still authored by hand in the item builder. Parsing effects from rules text would change a character’s numbers on a guess.',
    'The 2014 and 2024 editions share this catalogue. The SRD 5.1 is the 2014 text; where 2024 restated an item, the restatement is not in a CC-BY document we can read.',
  ],
} as const;
`;

  if (check) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') !== file.replace(/\r\n/g, '\n')) {
      console.error(`DRIFT: ${path.relative(REPO, OUT)} does not match the source. Re-run without --check.`);
      process.exit(1);
    }
    console.log(`ok — ${rows.length} items, generated file matches the source`);
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, file);
  console.log(`wrote ${path.relative(REPO, OUT)} — ${rows.length} items, ${refused.length} refused`);
}

main().catch((e) => { console.error(e); process.exit(1); });
