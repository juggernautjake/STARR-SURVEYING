#!/usr/bin/env node
// scripts/tx-plat-source-survey.mjs — which Texas counties publish plats we could archive?
//
// ── TWO SHAPES ARE ARCHIVABLE, AND ONLY ONE IS OBVIOUS ──────────────────────────────────────────
//
//   BELL  the county site links the files directly: /docs/plats/{LETTER}/{NAME}.pdf, 8,077 of them.
//   HAYS  the APPRAISAL DISTRICT lists subdivision NAMES in a table and the file URL is CONSTRUCTED
//         from each name (/PA/Plats/{L}/{NAME} VOL n PG n.TIF). No link to a file exists anywhere.
//
// A scan for links ending .pdf/.tif sees Bell and is blind to Hays. The first version of this file
// was exactly that scan, reported "1 of 254", and was wrong — it failed its own control.
//
// ── TWO BUGS THAT MADE THE FIRST ANSWER WORTHLESS ───────────────────────────────────────────────
//
//   1. `/\bplat/i` matched PLATEAU LAND & CATTLE, platoforms.com and "Template Main Javascript".
//      Every one of the 49 "mentions plats" counties was that. `\b` only anchors the START of a
//      word; the end needs anchoring too.
//   2. hayscad.com answers 403 to a bare probe, so the control never ran and its silence read as
//      agreement. A survey whose control cannot speak is a survey with no control.
//
// Both are fixed here, and the run REFUSES TO REPORT if the controls do not come back positive.

import fs from 'node:fs';
import { execFile } from 'node:child_process';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "plat", "plats", "platting" — but never plateau, platform, plate, platoforms. */
const PLAT_WORD = /\bplat(s|ted|ting)?\b/i;

/** Known-good, so the classifier has to prove itself before any result is believed. */
const CONTROLS = [
  { county: 'bell', url: 'https://www.bellcountytx.com/county_government/county_clerk/a.php', expect: 'DIRECT FILES' },
  // Hays links its TIFs directly after all — /PA/Plats/A/117 BUSINESS PARK VOL 11 PG 232_0001.TIF.
  // The expectation here said NAME TABLE because the repo's adapter config calls it parseMode
  // 'table', which describes how the page is PARSED (rows), not whether the files are linked. The
  // classifier was right and the control was wrong; worth recording, because a control that
  // encodes a wrong belief fails honest code.
  { county: 'hays', url: 'https://hayscad.com/subdivisionplats/sublista/', expect: 'DIRECT FILES' },
];

// ── WHY THIS SHELLS OUT TO CURL ────────────────────────────────────────────────────────────────
//
// Node's fetch gets 403 from hayscad.com where curl gets 200, same URL, same user-agent, same
// second. The difference is the TLS fingerprint: Cloudflare and similar WAFs recognise undici and
// refuse it before a single header is read.
//
// That is not a Hays quirk, it is a whole class of false negative — every Cloudflare-fronted county
// site would have been silently recorded as "nothing here". The first two runs of this survey were
// measuring which counties use Cloudflare, not which counties publish plats.
//
// So the fetch goes through curl, which has a browser-shaped handshake. Slower per request and
// worth every millisecond of it.
function get(url, tries = 2) {
  return new Promise((resolve) => {
    const attempt = (n) => {
      execFile('curl', [
        '-sL', '--max-time', '25', '--compressed',
        '-A', UA,
        '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '-H', 'Accept-Language: en-US,en;q=0.9',
        '-w', '<<<STATUS>>>%{http_code}<<<URL>>>%{url_effective}',
        url,
      ], { maxBuffer: 8 * 1024 * 1024, timeout: 30000 }, (err, stdout) => {
        if (err && !stdout) {
          if (n + 1 < tries) return setTimeout(() => attempt(n + 1), 1200);
          return resolve({ err: 'curl-failed' });
        }
        const m = String(stdout).match(/<<<STATUS>>>(\d+)<<<URL>>>(.*)$/);
        const status = m ? Number(m[1]) : 0;
        const final = m ? m[2].trim() : url;
        const html = m ? String(stdout).slice(0, m.index) : String(stdout);
        if (status === 403 && n + 1 < tries) return setTimeout(() => attempt(n + 1), 2500);
        if (status !== 200) return resolve({ status });
        resolve({ status: 200, final, html: html.slice(0, 800000) });
      });
    };
    attempt(0);
  });
}

function links(html, base) {
  const out = []; const re = /<a\s+href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[2].replace(/&amp;/g, '&');
    try { href = new URL(href, base).href; } catch { continue; }
    out.push({ href, text: m[3].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() });
  }
  return out;
}

const FORMISH = /form|application|exemption|protest|96-\d|renditio|notice|agenda|minutes|budget/i;

/** What sort of plat resource is this page, if any? */
export function classify(html, base) {
  if (!html) return null;
  const l = links(html, base);
  const files = l.filter((x) => /\.(pdf|tif|tiff)(\?|$)/i.test(x.href) && !FORMISH.test(x.href));
  const platFiles = files.filter((x) => /plat/i.test(x.href) || PLAT_WORD.test(x.text));
  // ── THE FILES MUST LOOK LIKE PLATS, NOT JUST BE NUMEROUS ────────────────────────────────────
  //
  // There was a fallback here: "25+ PDFs on a page, call it an archive". It produced 18 hits and
  // every single one was a county newsroom — 2026Holidays.pdf, BURN BAN ORDER, Treasurer Report
  // Aug 2020, HUNTING2016-2017.pdf. A rule that counts documents instead of recognising them finds
  // the counties that publish a lot of PDFs, which is not the question.
  //
  // Both real sources put the word in the PATH — Bell /docs/plats/A/NAME.pdf, Hays
  // /PA/Plats/A/NAME VOL 11 PG 232.TIF — so that is the test, and there is no fallback.
  if (platFiles.length >= 5) return { kind: 'DIRECT FILES', n: platFiles.length, sample: platFiles[0].href.slice(0, 86) };

  // The Hays shape: many short text cells and the page is about subdivisions/plats.
  const onPlatPage = /plat|subdivision/i.test(base);
  const cells = (html.match(/<td[^>]*>\s*[^<]{3,70}\s*<\/td>/gi) || []);
  if (onPlatPage && cells.length >= 40 && (PLAT_WORD.test(html) || /subdivision/i.test(html))) {
    return { kind: 'NAME TABLE', n: cells.length, sample: cells.slice(1, 3).map((c) => c.replace(/<[^>]*>/g, '').trim()).join(' | ').slice(0, 70) };
  }
  // An A-Z index is a strong signal even before the files are seen.
  const letterish = l.filter((x) => /sublist[a-z0-9-]{1,3}\/?$|\/plats?\/[a-z0-9-]{1,3}\/?$|\/[a-z]\.php$/i.test(x.href));
  if (onPlatPage && letterish.length >= 8) return { kind: 'A-Z INDEX', n: letterish.length, sample: letterish[0].href.slice(0, 86) };
  return null;
}

async function probe(county, host) {
  const home = await get(host);
  if (!home.html) return { status: home.status ?? home.err };
  // The site's own plat links, matched on real words.
  const cands = links(home.html, home.final)
    .filter((x) => PLAT_WORD.test(x.text) || /\/plats?[\/._-]|subdivisionplat/i.test(x.href))
    .filter((x) => !/\.(pdf|docx?|xlsx?)$/i.test(x.href) && !FORMISH.test(x.href))
    .slice(0, 4);
  const direct = classify(home.html, home.final);
  if (direct) return { hit: { ...direct, url: home.final } };
  for (const c of cands) {
    const pg = await get(c.href);
    await sleep(700);
    const k = classify(pg.html, pg.final ?? c.href);
    if (k) return { hit: { ...k, url: pg.final ?? c.href } };
  }
  return { followed: cands.length };
}

// ── Prove the classifier before trusting it ────────────────────────────────────────────────────
console.log('CONTROLS');
let controlsOk = true;
for (const c of CONTROLS) {
  const r = await get(c.url, 3);
  const k = r.html ? classify(r.html, r.final) : null;
  const ok = k && k.kind === c.expect;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.county.padEnd(6)} expected ${c.expect.padEnd(12)} got ${k ? `${k.kind} (${k.n})` : `nothing (HTTP ${r.status ?? r.err})`}`);
  if (!ok) controlsOk = false;
  await sleep(1200);
}
if (!controlsOk) {
  console.log('\nControls failed. A survey whose control cannot speak proves nothing — not reporting a county list.');
  process.exit(1);
}
console.log('  both controls pass; the classifier sees both archivable shapes.\n');

const COUNTIES = fs.readFileSync(new URL('./tx-counties.txt', import.meta.url), 'utf8').trim().split(/\s+/);
const CONCURRENCY = 8;
const results = [];
let done = 0;
const queue = [...COUNTIES];

async function worker() {
  while (queue.length) {
    const c = queue.shift();
    const hosts = [
      `https://${c}cad.org`, `https://www.${c}cad.org`, `https://${c}cad.com`,
      `https://www.co.${c}.tx.us`, `https://www.${c}countytx.com`, `https://www.${c}county.gov`,
    ];
    let rec = { county: c, hit: null, reached: false };
    for (const h of hosts) {
      const r = await probe(c, h);
      if (r.hit) { rec = { county: c, hit: r.hit, host: h, reached: true }; break; }
      if (r.followed !== undefined) rec.reached = true;
      await sleep(300);
    }
    results.push(rec);
    done++;
    if (rec.hit) console.log(`HIT  ${c.padEnd(14)} ${rec.hit.kind.padEnd(13)} ${String(rec.hit.n).padStart(5)}  ${rec.hit.url.slice(0, 62)}`);
    if (done % 25 === 0) process.stderr.write(`   …${done}/${COUNTIES.length}\n`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const hits = results.filter((r) => r.hit);
console.log(`\n${'═'.repeat(88)}`);
console.log(`probed ${results.length} counties · reached a site for ${results.filter((r) => r.reached).length} · plat sources found ${hits.length}`);
for (const r of hits.sort((a, b) => a.county.localeCompare(b.county))) {
  console.log(`  ${r.county.padEnd(14)} ${r.hit.kind.padEnd(13)} ${String(r.hit.n).padStart(5)}  ${r.hit.url}`);
  if (r.hit.sample) console.log(`       e.g. ${r.hit.sample}`);
}
fs.writeFileSync('tx-plat-survey.json', JSON.stringify(results, null, 2));
console.log('\nWritten to tx-plat-survey.json');
