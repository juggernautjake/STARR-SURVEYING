// scripts/backfill-identity-keys.mjs — turn a catalogued citation into a matchable identity.
//
// Owner, 2026-09-23: "go ahead and do that now if you think it will work".
//
// ── WHAT THIS BUYS ──────────────────────────────────────────────────────────────────────────────
//
// `identity_key` is NULL on every one of the 8,077 Bell plats, because the import only ever knew a
// filename. So the library can be asked "do you have a plat whose LABEL looks like GLENDALE?" and
// never "do you have the plat recorded at Cabinet D, Slide 19-B?". The second question is the one
// worth answering: a fuzzy subdivision name matches "MARTIN SUB" to "MATKIN SUBDIVISION", and a
// recording reference matches one document.
//
// The catalogue now reads a recording reference off 98% of sheets, so the citation exists — it just
// has to be parsed into the shape `identityKey` wants.
//
//   node scripts/backfill-identity-keys.mjs --dry-run     # show what would be written
//   node scripts/backfill-identity-keys.mjs --apply
//
// ── WHY COVERAGE IS ABOUT HALF, AND WHY THAT IS FINE ────────────────────────────────────────────
//
// Measured on the first 198 catalogued sheets: 98% carry a citation, but only 55% carry one the
// reader was SURE of, and `identityKey` refuses a book/page citation without a recording date —
// deliberately, because an instrument number can repeat across years and two documents with
// unreadable dates would otherwise look identical. Year-stamped instrument numbers (2015-16512,
// 2020067808) carry their year inside the number and need no date, which rescues a good part of it.
//
// A missing key is the status quo. A WRONG key would be new damage, so nothing is written unless
// the catalogue was confident: `mayMatchAutomatically` already says a recording reference must be
// "high" to be matched on, and this honours the same rule rather than inventing a looser one.

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── THE PARSE ───────────────────────────────────────────────────────────────────────────────────
//
// Exported so `__tests__/research/identity-backfill.test.ts` can check these produce the SAME key
// as the worker's `identityKey` for real citations. The script and the worker cannot import each
// other — separate builds — so agreement is asserted rather than assumed.

/** Pull an instrument/document number out of a citation, ignoring plat numbers and page numbers. */
export function instrumentFrom(citation) {
  if (!citation) return undefined;
  // "Plat # 46; Instrument No. 2015-16512" must yield 2015-16512, not 46 — so the label is
  // required, and a bare "#46" is never treated as an instrument number.
  const m = /(?:inst(?:rument)?|doc(?:ument)?|file)\s*(?:no\.?|number|#)?\s*[:#]?\s*([0-9][0-9\-]{3,})/i.exec(citation);
  if (m) return m[1];
  // A citation that is nothing but a year-stamped number: "2020067808", "2015-16512".
  const bare = /^\s*((?:19|20)\d{2}-?\d{4,})\s*$/.exec(citation);
  return bare ? bare[1] : undefined;
}

/** Cabinet/slide or volume/page, as book and page. */
export function bookPageFrom(citation) {
  if (!citation) return {};
  const cab = /cab(?:inet)?\.?\s*([A-Z0-9]+)/i.exec(citation);
  const slide = /slide\s*\.?\s*([A-Z0-9][A-Z0-9\-]*)/i.exec(citation);
  // A plat's cabinet and slide ARE its book and page — the clerk's plat records are a separate
  // series from the deed volumes, and `normaliseBookPage` keeps letters, which is what makes
  // "Cabinet D, Slide 19-B" survive as D-19B rather than collapsing to NaN.
  if (cab && slide) return { book: cab[1], page: slide[1] };
  const vol = /(?:vol(?:ume)?|book)\.?\s*([A-Z0-9]+)/i.exec(citation);
  const pg = /(?:pg|page)s?\.?\s*([A-Z0-9][A-Z0-9\-]*)/i.exec(citation);
  if (vol && pg) return { book: vol[1], page: pg[1] };
  return {};
}

/** A catalogue entry → the reference `identityKey` wants, or null when it cannot be trusted. */
export function refFromCatalogue(catalogue, county) {
  const ref = catalogue?.recording_reference;
  const dt = catalogue?.recorded_date;
  if (!ref?.value) return null;
  // The rule from lib/research/catalogue-schema.ts, not a looser local one: a recording reference
  // may only be matched on when the reader was sure of it.
  if (ref.confidence !== 'high') return null;

  const citation = String(ref.value);
  const instrumentNumber = instrumentFrom(citation);
  const { book, page } = bookPageFrom(citation);
  // A date is only used when the reader was sure of it too — a guessed year in a key is a key that
  // matches the wrong document, which is worse than no key at all.
  const recordingDate = dt?.value && dt.confidence === 'high' ? String(dt.value) : undefined;
  if (!instrumentNumber && !(book && page)) return null;
  return { county, instrumentNumber, book, page, recordingDate };
}

// ── THE SAME NORMALISERS THE WORKER USES ────────────────────────────────────────────────────────
// Copied from worker/src/research/document-identity.ts, which this script cannot import. The test
// asserts they never disagree; a key built differently here would simply never match, silently.

export function normaliseInstrument(raw) {
  if (!raw) return '';
  const segments = String(raw).toUpperCase().split(/[\s.\-#/\\]+/).filter(Boolean);
  if (segments.length === 0) return '';
  return segments.map((s) => s.replace(/^0+(?=.)/, '')).join('');
}
export function yearStamped(instrument) {
  return /^(19|20)\d{2}\d{5,}$/.test(instrument);
}
export function normaliseBookPage(book, page) {
  const b = (book ?? '').toUpperCase().replace(/[\s.\-#/\\]+/g, '').replace(/^0+(?=.)/, '');
  const p = (page ?? '').toUpperCase().replace(/[\s.\-#/\\]+/g, '').replace(/^0+(?=.)/, '');
  if (!b || !p) return '';
  return `${b}-${p}`;
}
export function normaliseDate(raw) {
  if (!raw) return '';
  const t = String(raw).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return '';
}
export function normaliseCounty(raw) {
  return (raw ?? '').replace(/\s+county$/i, '').trim().toUpperCase();
}

export function identityKey(ref) {
  const county = normaliseCounty(ref.county);
  if (!county) return null;
  const instrument = normaliseInstrument(ref.instrumentNumber);
  const citation = normaliseBookPage(ref.book, ref.page);
  const date = normaliseDate(ref.recordingDate);
  if (instrument && yearStamped(instrument)) return `${county}|I:${instrument}`;
  if (instrument && date) return `${county}|I:${instrument}|${date}`;
  if (citation && date) return `${county}|B:${citation}|${date}`;
  return null;
}

// ── THE RUN ─────────────────────────────────────────────────────────────────────────────────────
// Guarded so the test can import the functions above without the script doing anything.
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('backfill-identity-keys.mjs');
if (isMain) {
  const APPLY = process.argv.includes('--apply');
  for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue;
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      const i = l.indexOf('='); if (i < 1 || l.trim().startsWith('#')) continue;
      const k = l.slice(0, i).trim(); if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('research_documents')
      .select('id, document_label, county_fips, catalogue, identity_key')
      .not('catalogued_at', 'is', null).is('identity_key', null).range(from, from + 999);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`${rows.length} catalogued document(s) without an identity key${APPLY ? '' : ' (dry run)'}\n`);

  const seen = new Map();
  const updates = [];
  let noCitation = 0, notConfident = 0, noDate = 0;

  for (const r of rows) {
    const ref = refFromCatalogue(r.catalogue, r.county_fips ?? 'bell');
    if (!ref) {
      if (!r.catalogue?.recording_reference?.value) noCitation += 1;
      else notConfident += 1;
      continue;
    }
    const key = identityKey(ref);
    if (!key) { noDate += 1; continue; }
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(r.document_label);
    updates.push({ id: r.id, key, label: r.document_label });
  }

  console.log(`  ${updates.length} would get a key`);
  console.log(`  ${notConfident} skipped — the reader was not sure of the citation`);
  console.log(`  ${noDate} skipped — a book/page citation with no confident date (identityKey refuses it)`);
  console.log(`  ${noCitation} skipped — no citation on the sheet at all\n`);

  const dupes = [...seen].filter(([, v]) => v.length > 1);
  if (dupes.length) {
    console.log(`── ${dupes.length} key(s) shared by more than one document — the same plat filed twice ──`);
    for (const [k, labels] of dupes.slice(0, 6)) console.log(`  ${k}\n    ${labels.join('\n    ')}`);
    console.log('');
  }

  console.log('── a sample of what would be written ──');
  for (const u of updates.slice(0, 10)) console.log(`  ${String(u.label).slice(0, 44).padEnd(46)} ${u.key}`);

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write these.'); process.exit(0); }

  let done = 0;
  for (const u of updates) {
    const { error } = await db.from('research_documents').update({ identity_key: u.key }).eq('id', u.id);
    if (error) console.log(`  ✗ ${u.label}: ${error.message}`);
    else done += 1;
    if (done % 50 === 0) console.log(`  written ${done}/${updates.length}`);
  }
  console.log(`\n${done} identity key(s) written.`);
}
