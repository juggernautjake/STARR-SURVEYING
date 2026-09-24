// scripts/verify-surveyors.mjs — check every catalogued surveyor against the State register.
//
//   node scripts/verify-surveyors.mjs --dry-run
//   node scripts/verify-surveyors.mjs --apply
//
// Owner, 2026-09-24: "Is there a way to look up that number and name and make sure they match."
//
// The whole roster is ~5,400 rows, so it is loaded into memory once and every document checked
// against the map — thousands of documents against one table, in one pass, with no per-row query.
//
// The verdicts and the reasoning live in lib/research/surveyor-verification.ts. This script only
// feeds it and stores what comes back.

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = !process.argv.includes('--apply');

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const i = l.indexOf('='); if (i < 1 || l.trim().startsWith('#')) continue;
    const k = l.slice(0, i).trim(); if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── the verification logic, read from the TypeScript module it lives in ─────────────────────────
// The module is TS and this is .mjs, so the functions are re-declared here and
// __tests__/research/surveyor-verification.test.ts asserts the two agree on real cases. Same
// bargain as the identity-key backfill: a drifted copy does not throw, it quietly mis-verifies.
const normLicence = (s) => String(s ?? '').replace(/\D/g, '').replace(/^0+(?=.)/, '');
const normName = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
function editDistance(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur; }
  return prev[n];
}
function samePerson(readName, e) {
  const parts = normName(readName).split(' ').filter(Boolean);
  if (!parts.length) return false;
  const ourLast = parts[parts.length - 1], ourFirst = parts[0];
  const rLast = normName(e.last_name);
  const rFirstAll = normName(e.first_name), rFirst = rFirstAll.split(' ')[0] ?? '';
  const rMiddle = (normName(e.middle_name).split(' ')[0]) ?? '';
  const firstOk = ourFirst === rFirst || editDistance(ourFirst, rFirst) <= 1
    || ourFirst === rMiddle || rFirstAll.split(' ').includes(ourFirst);
  return firstOk && editDistance(ourLast, rLast) <= 2;
}
const display = (e) => [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

function verify(readName, readLicence, byNumber, byName) {
  const name = normName(readName), licence = normLicence(readLicence);
  const base = { readName: name || null, readLicence: licence || null, rosterName: null, rosterLicence: null, rosterStatus: null };
  if (!name || !licence) return { ...base, verdict: 'incomplete', note: 'The sheet gave a name or a licence number, but not both, so there is nothing to cross-check.' };
  if (byNumber && samePerson(name, byNumber)) {
    return { ...base, verdict: 'confirmed', rosterName: display(byNumber), rosterLicence: byNumber.rpls_number, rosterStatus: byNumber.status ?? null,
      note: `The State register lists ${display(byNumber)} at RPLS ${byNumber.rpls_number}${byNumber.status ? ` (${byNumber.status.toLowerCase()})` : ''}, which is the name on the sheet.` };
  }
  const candidates = byName.filter((e) => samePerson(name, e));
  const unique = new Set(candidates.map((e) => e.rpls_number));
  if (unique.size === 1) {
    const e = candidates[0];
    return { ...base, verdict: 'corrected', rosterName: display(e), rosterLicence: e.rpls_number, rosterStatus: e.status ?? null,
      note: `The sheet reads RPLS ${licence}, but the State register has ${display(e)} at RPLS ${e.rpls_number}${e.status ? ` (${e.status.toLowerCase()})` : ''} and no licensee of that name at ${licence}. The number was most likely misread.` };
  }
  if (!byNumber) return { ...base, verdict: 'not_a_licence', note: `RPLS ${licence} is not on the State register, and no licensee matching "${name}" was found. It is probably not a licence number.` };
  return { ...base, verdict: 'unmatched', rosterName: display(byNumber), rosterLicence: byNumber.rpls_number, rosterStatus: byNumber.status ?? null,
    note: `The sheet reads "${name}" at RPLS ${licence}, but the State register lists ${display(byNumber)} at that number. One of the two was misread and the register does not settle which.` };
}

// ── load ────────────────────────────────────────────────────────────────────────────────────────
const roster = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('surveyor_roster')
    .select('rpls_number, status, first_name, middle_name, last_name').range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data?.length) break; roster.push(...data); if (data.length < 1000) break;
}
if (roster.length < 3000) { console.error(`REFUSED: only ${roster.length} licences on file. Run scripts/sync-surveyor-roster.mjs first — verifying against a short roster reports real licences as unregistered.`); process.exit(1); }
const byNumber = new Map(roster.map((e) => [e.rpls_number, e]));
console.log(`${roster.length} licences on the register\n`);

const docs = [];
for (let from = 0; ; from += 1000) {
  const { data } = await db.from('research_documents')
    .select('id, document_label, catalogue').not('catalogued_at', 'is', null).range(from, from + 999);
  if (!data?.length) break; docs.push(...data); if (data.length < 1000) break;
}

// ── verify ──────────────────────────────────────────────────────────────────────────────────────
const tally = { confirmed: 0, corrected: 0, unmatched: 0, not_a_licence: 0, incomplete: 0 };
const updates = [];
const examples = { corrected: [], unmatched: [], not_a_licence: [] };

for (const d of docs) {
  const surveyors = d.catalogue?.surveyors ?? [];
  if (!surveyors.length) continue;
  const results = surveyors.map((s) => {
    const licence = normLicence(s?.rpls_number?.value);
    const name = normName(s?.name?.value);
    const r = verify(name, licence, byNumber.get(licence) ?? null, roster);
    tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;
    if (examples[r.verdict] && examples[r.verdict].length < 6) examples[r.verdict].push({ doc: d.document_label, ...r });
    return { ...r, readConfidence: s?.rpls_number?.confidence ?? null };
  });
  updates.push({ id: d.id, verification: results });
}

const total = Object.values(tally).reduce((a, b) => a + b, 0);
const pct = (n) => `${((100 * n) / Math.max(1, total)).toFixed(0)}%`;
console.log(`${total} surveyor reading(s) across ${updates.length} document(s)\n`);
for (const k of ['confirmed', 'corrected', 'unmatched', 'not_a_licence', 'incomplete']) {
  console.log(`  ${k.padEnd(14)} ${String(tally[k]).padStart(4)}  ${pct(tally[k])}`);
}
const usable = tally.confirmed + tally.corrected;
console.log(`\n  ${usable} of ${total} (${pct(usable)}) are now backed by the State register.`);

for (const [kind, label] of [['corrected', 'the register supplied the right number'], ['unmatched', 'name and number disagree, unresolved'], ['not_a_licence', 'not a licence number']]) {
  if (!examples[kind]?.length) continue;
  console.log(`\n── ${label} ──`);
  for (const e of examples[kind]) console.log(`  ${String(e.doc).slice(0, 36).padEnd(38)} ${e.note.slice(0, 150)}`);
}

if (DRY) { console.log('\nDry run. Re-run with --apply to store these verdicts.'); process.exit(0); }

let written = 0;
for (const u of updates) {
  const { error } = await db.from('research_documents')
    .update({ surveyor_verification: u.verification, surveyor_verified_at: new Date().toISOString() })
    .eq('id', u.id);
  if (error) console.log(`  ✗ ${u.id}: ${error.message}`);
  else written += 1;
  if (written % 50 === 0) console.log(`  ${written}/${updates.length}`);
}
console.log(`\n${written} document(s) carry a verification verdict.`);
