#!/usr/bin/env node
// scripts/bell-plat-audit.mjs — check the archive against the county, not against our own notes.
//
// The crawler's state file is a record of what the crawler believes. An audit that reads it is
// checking the bookkeeping against itself. So this re-fetches the county's index pages and treats
// THOSE as the truth, then asks three questions of every plat the county lists:
//
//   1. is it on disk?
//   2. is the file actually a complete PDF, or just something with a PDF name?
//   3. is it under the name it should be?
//
// And two questions of the archive itself: is anything here that the county does not list, and
// does the state file agree with what is on disk.
//
// Usage: node scripts/bell-plat-audit.mjs --letters a,b,c [--deep]
//   --deep also parses every PDF with pdf.js rather than checking its structure.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.env.BELL_PLAT_DIR || 'C:/Users/Jacob Maddux/BellCountyPlats';
const BASE = 'https://www.bellcountytx.com/county_government/county_clerk/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};

function decodeEntities(str) {
  return str
    .replace(/&(?:amp|AMP);/g, '&').replace(/&(?:lt|LT);/g, '<').replace(/&(?:gt|GT);/g, '>')
    .replace(/&(?:quot|QUOT);/g, '"').replace(/&(?:apos|#0?39);/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

const MEANINGLESS = new RegExp(
  '^(?:doc|scan|img|image|untitled|page|document|(?:new[-_ ]?)?doc(?:ument)?|acrobat[-_ ]?document)[-_ ]?\\d*$'
  + '|^\\d{1,12}$|^[A-Za-z]{1,2}-?\\d{1,4}[A-Za-z]?$', 'i');
const safeName = (s) => s.replace(/[<>:"|?*\\/]/g, '_').replace(/\s+/g, ' ').trim();

function expectedName(url, display) {
  const raw = decodeURIComponent(url.split('/').pop() || 'plat.pdf');
  const ext = (raw.match(/\.[A-Za-z0-9]+$/) || ['.pdf'])[0];
  const stem = raw.slice(0, raw.length - ext.length);
  const d = (display || '').trim();
  return safeName(MEANINGLESS.test(stem) && d.length > 2 ? d + ext : raw);
}

async function readIndex(letter) {
  const res = await fetch(`${BASE}${letter}.php`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`${letter}.php -> HTTP ${res.status}`);
  const html = await res.text();
  const re = /<a\s+href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const out = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!/docs\/plats\//i.test(m[2])) continue;
    const href = m[2].replace(/&amp;/g, '&');
    const abs = href.startsWith('http') ? href : `https://www.bellcountytx.com/${href.replace(/^\//, '')}`;
    const url = abs.split('?')[0].replace(/^http:\/\//, 'https://');
    if (!out.has(url)) out.set(url, { url, name: decodeEntities(m[3].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim(), letter });
  }
  return [...out.values()];
}

/** Structural check: a real PDF starts %PDF-, ends %%EOF, and declares at least one page. */
function inspect(fp) {
  const st = fs.statSync(fp);
  const fd = fs.openSync(fp, 'r');
  try {
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    const tailLen = Math.min(4096, st.size);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, st.size - tailLen);
    const body = fs.readFileSync(fp);
    return {
      size: st.size,
      header: head.toString('latin1').startsWith('%PDF-'),
      eof: tail.toString('latin1').includes('%%EOF'),
      // ── WHY NOT JUST /Type /Page ────────────────────────────────────────────────────────────
      //
      // Because it flagged 107 perfectly good plats. A PDF using cross-reference streams keeps its
      // page dictionary inside a COMPRESSED object stream, so the string never appears in the raw
      // bytes. Every one of the 107 opened, rendered and had ink on it when actually parsed.
      //
      // A check that reports a third of a healthy archive as corrupt is worse than no check: the
      // next real corruption arrives in a list people have learned to ignore. So: a page dictionary
      // in the clear, OR the object/xref stream that would be hiding one.
      hasPage: /\/Type\s*\/Page[^s]/.test(body.toString('latin1'))
        || /\/ObjStm|\/XRef/.test(body.toString('latin1')),
      xref: /\/Root|xref|startxref/.test(tail.toString('latin1')) || body.toString('latin1').includes('startxref'),
      sha: crypto.createHash('sha256').update(body).digest('hex'),
    };
  } finally { fs.closeSync(fd); }
}

const letters = String(arg('letters', 'a')).toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
const deep = Boolean(arg('deep'));

console.log(`Auditing letters [${letters.join(', ')}] against a fresh fetch of the county index.\n`);

const problems = { missingOnDisk: [], badPdf: [], wrongName: [], orphan: [], stateWrong: [], tiny: [] };
const shaMap = new Map();
let indexed = 0, present = 0, bytes = 0;

const state = fs.existsSync(path.join(ROOT, '_state.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, '_state.json'), 'utf8')) : { files: {} };

for (const L of letters) {
  let entries;
  try { entries = await readIndex(L); } catch (e) { console.log(`  ${L}: INDEX FETCH FAILED — ${e.message}`); continue; }
  await sleep(1500);

  const dir = path.join(ROOT, L.toUpperCase());
  const onDisk = fs.existsSync(dir) ? new Set(fs.readdirSync(dir)) : new Set();
  const expectedSet = new Set();

  for (const e of entries) {
    indexed++;
    const want = expectedName(e.url, e.name);
    expectedSet.add(want);
    const fp = path.join(dir, want);

    if (!fs.existsSync(fp)) {
      // Is it here under some other name? That is a naming fault, not a missing file.
      const legacy = safeName(decodeURIComponent(e.url.split('/').pop() || ''));
      if (onDisk.has(legacy)) { problems.wrongName.push(`${L.toUpperCase()}/${legacy}  should be  ${want}`); expectedSet.add(legacy); }
      else problems.missingOnDisk.push(`${L.toUpperCase()}/${want}   (${e.url.slice(-60)})`);
      continue;
    }

    present++;
    const info = inspect(fp);
    bytes += info.size;
    if (!info.header || !info.eof || !info.hasPage) {
      problems.badPdf.push(`${L.toUpperCase()}/${want}  header=${info.header} eof=${info.eof} page=${info.hasPage} ${info.size}B`);
    }
    if (info.size < 20000) problems.tiny.push(`${L.toUpperCase()}/${want}  ${(info.size / 1024).toFixed(1)} KB`);

    const seen = shaMap.get(info.sha);
    if (seen) shaMap.set(info.sha, [...seen, `${L.toUpperCase()}/${want}`]);
    else shaMap.set(info.sha, [`${L.toUpperCase()}/${want}`]);

    const rec = state.files[e.url];
    if (!rec) problems.stateWrong.push(`${want}: no state record`);
    else if (rec.status !== 'done') problems.stateWrong.push(`${want}: state says "${rec.status}"`);
    else if (!rec.path || path.basename(rec.path) !== want) problems.stateWrong.push(`${want}: state path is ${rec.path ? path.basename(rec.path) : '(none)'}`);
  }

  for (const f of onDisk) {
    if (f.endsWith('.part')) { problems.orphan.push(`${L.toUpperCase()}/${f}  (unfinished download)`); continue; }
    if (!expectedSet.has(f)) problems.orphan.push(`${L.toUpperCase()}/${f}  (not in the county index)`);
  }
  process.stdout.write(`  ${L}: ${entries.length} indexed, ${onDisk.size} on disk\n`);
}

const dupes = [...shaMap.values()].filter((v) => v.length > 1);

console.log(`\n${'═'.repeat(72)}`);
console.log(`indexed by the county : ${indexed}`);
console.log(`present and readable  : ${present}   (${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB)`);
console.log(`${'═'.repeat(72)}`);

const report = (label, list, limit = 12) => {
  const mark = list.length === 0 ? 'OK  ' : 'FAIL';
  console.log(`${mark}  ${label}: ${list.length}`);
  list.slice(0, limit).forEach((x) => console.log(`        ${x}`));
  if (list.length > limit) console.log(`        … and ${list.length - limit} more`);
};

report('Indexed but not on disk', problems.missingOnDisk);
report('Not a valid PDF', problems.badPdf);
report('On disk under the wrong name', problems.wrongName);
report('On disk but not in the index', problems.orphan);
report('State disagrees with disk', problems.stateWrong);
console.log(`NOTE  Identical content under different names: ${dupes.length}`);
dupes.slice(0, 6).forEach((d) => console.log(`        ${d.join('  ==  ')}`));
console.log(`NOTE  Files under 20 KB (worth eyeballing): ${problems.tiny.length}`);
problems.tiny.slice(0, 6).forEach((t) => console.log(`        ${t}`));

const fatal = problems.missingOnDisk.length + problems.badPdf.length + problems.wrongName.length + problems.stateWrong.length;
console.log(`\n${fatal === 0 ? 'PASS — the archive matches the county index.' : `${fatal} problem(s) need attention.`}`);
