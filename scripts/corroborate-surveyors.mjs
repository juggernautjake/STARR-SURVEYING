// scripts/corroborate-surveyors.mjs — weigh the reading, the archive and the register together.
//
//   node scripts/corroborate-surveyors.mjs            # report
//   node scripts/corroborate-surveyors.mjs --apply    # store the certainty on each document
//
// Owner, 2026-09-24: "check with other documents for the same rpls number and seal and name and
// compare that to the registry of RPLSs to get more confidence."
//
// The whole archive is loaded at once because the second witness IS the whole archive: consensus on
// a licence number cannot be computed one document at a time.

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
// The logic lives in lib/research/surveyor-corroboration.ts, which is TypeScript the app imports
// extensionless — a shape Node's ESM loader cannot resolve from a .mjs. So it is re-declared here,
// as the roster sync and the identity backfill already do, and
// __tests__/research/surveyor-corroboration.test.ts exercises the LIBRARY copy against the same
// fixtures. A drifted copy here changes a report; a drifted library changes the product.
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
function sameReading(a, b) {
  if (a === b) return true;
  const pa = a.split(' ').filter(Boolean), pb = b.split(' ').filter(Boolean);
  if (!pa.length || !pb.length) return false;
  return editDistance(pa[pa.length - 1], pb[pb.length - 1]) <= 1 && pa[0] === pb[0];
}
const CORROBORATION_THRESHOLD = 3;
const CERTAINTY_LABEL = {
  verified: 'Verified — the register and the archive agree',
  register_only: 'Confirmed against the State register',
  archive_only: 'Corroborated across the archive, not on the register',
  disputed: 'Disputed — the witnesses disagree',
  uncorroborated: 'Uncorroborated — one sheet, unconfirmed',
};
function buildConsensus(readings) {
  const byLicence = new Map();
  for (const r of readings) {
    const licence = normLicence(r.licence), name = normName(r.name);
    if (!licence || !name) continue;
    if (!byLicence.has(licence)) byLicence.set(licence, []);
    byLicence.get(licence).push(name);
  }
  const out = new Map();
  for (const [licence, names] of byLicence) {
    const clusters = [];
    for (const n of names) {
      const hit = clusters.find((c) => sameReading(c.name, n));
      if (hit) hit.count += 1; else clusters.push({ name: n, count: 1 });
    }
    clusters.sort((a, b) => b.count - a.count);
    const top = clusters[0];
    out.set(licence, { licence, consensusName: top?.name ?? null, agreeing: top?.count ?? 0,
      dissenting: clusters.slice(1).reduce((s, c) => s + c.count, 0), readings: clusters });
  }
  return out;
}
function corroborate(reading, consensus) {
  const licence = normLicence(reading.licence), name = normName(reading.name);
  const arch = licence ? consensus.get(licence) ?? null : null;
  const v = reading.verification ?? null;
  const registerAgrees = v?.verdict === 'confirmed';
  const registerCorrected = v?.verdict === 'corrected';
  const registerObjects = v?.verdict === 'unmatched' || v?.verdict === 'not_a_licence';
  const archiveAgrees = Boolean(arch && arch.consensusName && name && sameReading(arch.consensusName, name));
  const archiveIsStrong = Boolean(arch && arch.agreeing >= CORROBORATION_THRESHOLD);
  const minority = Boolean(arch && archiveIsStrong && !archiveAgrees);
  if (minority && !registerAgrees) return { reading, consensus: arch, certainty: 'disputed',
    why: `${arch.agreeing} other sheet(s) read RPLS ${licence} as ${arch.consensusName}; this one reads ${name}. The archive does not support this reading.` };
  if (registerObjects && archiveIsStrong && archiveAgrees) return { reading, consensus: arch, certainty: 'disputed',
    why: `${arch.agreeing} sheets agree on ${arch.consensusName} at RPLS ${licence}, but the State register does not: ${v?.note ?? 'no match'}` };
  if (registerObjects) return { reading, consensus: arch, certainty: 'uncorroborated', why: v?.note ?? 'The State register does not confirm this licence, and no other sheet corroborates it.' };
  if (registerAgrees && archiveIsStrong && archiveAgrees) return { reading, consensus: arch, certainty: 'verified',
    why: `The State register lists ${v?.rosterName} at RPLS ${v?.rosterLicence}, and ${arch.agreeing} sheets in the archive read the same name at that number.` };
  if (registerAgrees || registerCorrected) return { reading, consensus: arch, certainty: 'register_only', why: v?.note ?? 'Confirmed against the State register.' };
  if (archiveIsStrong && archiveAgrees) return { reading, consensus: arch, certainty: 'archive_only',
    why: `${arch.agreeing} sheets read RPLS ${licence} as ${arch.consensusName}, but the State register does not confirm it. Common for work predating the register, and worth one look.` };
  return { reading, consensus: arch, certainty: 'uncorroborated', why: 'One sheet only: no other document carries this licence, and the register does not confirm it.' };
}
const certainEnoughToCite = (c) => c === 'verified' || c === 'register_only';

const APPLY = process.argv.includes('--apply');

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const i = l.indexOf('='); if (i < 1 || l.trim().startsWith('#')) continue;
    const k = l.slice(0, i).trim(); if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const docs = [];
for (let from = 0; ; from += 1000) {
  const { data } = await db.from('research_documents')
    .select('id, document_label, catalogue, surveyor_verification')
    .not('catalogued_at', 'is', null).range(from, from + 999);
  if (!data?.length) break; docs.push(...data); if (data.length < 1000) break;
}

// One reading per surveyor per sheet, carrying whatever the register already said about it.
const readings = [];
for (const d of docs) {
  const surveyors = d.catalogue?.surveyors ?? [];
  const verifications = d.surveyor_verification ?? [];
  surveyors.forEach((s, i) => {
    readings.push({
      documentId: d.id,
      documentLabel: d.document_label,
      name: s?.name?.value ?? null,
      licence: s?.rpls_number?.value ?? null,
      confidence: s?.rpls_number?.confidence ?? null,
      verification: verifications[i] ?? null,
    });
  });
}

const consensus = buildConsensus(readings);
console.log(`${docs.length} catalogued sheets, ${readings.length} surveyor reading(s)`);
console.log(`${consensus.size} distinct licence number(s) seen\n`);

const tally = {};
const byDoc = new Map();
const examples = {};
for (const r of readings) {
  const c = corroborate(r, consensus);
  tally[c.certainty] = (tally[c.certainty] ?? 0) + 1;
  if (!byDoc.has(r.documentId)) byDoc.set(r.documentId, []);
  byDoc.get(r.documentId).push({
    name: r.name, licence: r.licence, certainty: c.certainty, why: c.why,
    citable: certainEnoughToCite(c.certainty),
  });
  if (!examples[c.certainty]) examples[c.certainty] = [];
  if (examples[c.certainty].length < 5) examples[c.certainty].push({ doc: r.documentLabel, ...c });
}

const total = readings.length;
const pct = (n) => `${((100 * n) / Math.max(1, total)).toFixed(0)}%`;
console.log('── certainty, weighing all three witnesses ──');
for (const k of ['verified', 'register_only', 'archive_only', 'disputed', 'uncorroborated']) {
  console.log(`  ${k.padEnd(16)} ${String(tally[k] ?? 0).padStart(4)}  ${pct(tally[k] ?? 0)}   ${CERTAINTY_LABEL[k]}`);
}
const citable = (tally.verified ?? 0) + (tally.register_only ?? 0);
console.log(`\n  ${citable} of ${total} (${pct(citable)}) may be relied on without opening the sheet.`);

console.log(`\n── licence numbers the archive has seen ${CORROBORATION_THRESHOLD}+ times ──`);
const strong = [...consensus.values()].filter((c) => c.agreeing >= CORROBORATION_THRESHOLD)
  .sort((a, b) => b.agreeing - a.agreeing);
for (const c of strong.slice(0, 10)) {
  const alt = c.readings.slice(1).map((r) => `${r.name}×${r.count}`).join(', ');
  console.log(`  RPLS ${c.licence.padEnd(6)} ${String(c.consensusName).padEnd(24)} ${c.agreeing} agree${c.dissenting ? `, ${c.dissenting} differ: ${alt}`.slice(0, 90) : ''}`);
}

for (const k of ['disputed', 'archive_only']) {
  if (!examples[k]?.length) continue;
  console.log(`\n── ${CERTAINTY_LABEL[k]} ──`);
  for (const e of examples[k]) console.log(`  ${String(e.doc).slice(0, 32).padEnd(34)} ${e.why.slice(0, 140)}`);
}

if (!APPLY) { console.log('\nReport only. Re-run with --apply to store the certainty on each document.'); process.exit(0); }

let written = 0;
for (const [id, entries] of byDoc) {
  const { error } = await db.from('research_documents')
    .update({ surveyor_certainty: entries, surveyor_verified_at: new Date().toISOString() }).eq('id', id);
  if (error) console.log(`  ✗ ${id}: ${error.message}`);
  else written += 1;
  if (written % 50 === 0) console.log(`  ${written}/${byDoc.size}`);
}
console.log(`\n${written} document(s) carry a corroborated certainty.`);
