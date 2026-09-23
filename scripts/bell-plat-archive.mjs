#!/usr/bin/env node
// scripts/bell-plat-archive.mjs — a patient, resumable crawl of Bell County's free plat archive.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// Bell County publishes every recorded subdivision plat as a free PDF: 27 index pages
// (a.php … z.php plus 0-9.php) listing 8,076 files, roughly 8 MB each — about 61 GB in total.
// They are public records, and the run pipeline already uses them one at a time.
//
// ── WHY IT IS NOT PART OF THE RESEARCH PIPELINE ─────────────────────────────────────────────────
//
// A research run answers a question about one property in minutes. This is a bulk job measured in
// days, and the two want opposite things from a rate limiter. It is a standalone script with its
// own state file so it can be stopped at any moment and resumed later without re-fetching.
//
// ── THE TWO HOSTS, AND WHY THE WORKER CANNOT DO THIS ────────────────────────────────────────────
//
//   www.bellcountytx.com   the index pages. 403s the worker's datacentre IP; opens fine from a
//                          normal network. Plain HTML, ordinary <a href> links, no JavaScript.
//   cms3.revize.com        the PDFs, behind Cloudflare. 403s datacentre IPs outright.
//
// ── THE 403 THAT LOOKED LIKE A RATE LIMIT AND WAS NOT ───────────────────────────────────────────
//
// From a normal network the CDN refused most requests, and the refusals had every appearance of
// throttling: the first file came back, the next five 403'd, and spacing requests further apart
// seemed to help (2/4 at 20s, 1/4 at 45s, 4/4 at 90s). On that reading the archive was a five-day
// crawl.
//
// It was not throttling. Every success had a lowercase `.pdf` extension and every refusal an
// uppercase `.PDF` — the index links both, and the apparent rate correlation was an accident of
// which files happened to fall in which sample. Requesting the SAME file with the extension
// lowercased returns 200 and the PDF, every time (measured across the uppercase entries on u.php,
// 2026-09-22: 4 of 4 went 403 -> 200).
//
// It is a WAF rule matching the uppercase pattern, on a case-insensitive filesystem. So
// `platUrl()` lowercases the extension and the archive is an hour's work rather than a week's.
//
// The lesson worth keeping: a 403 is a refusal, not an explanation. Reading the intent off the
// timing produced a confident wrong answer that would have cost days.
//
// ── ON PACE AND MANNERS ─────────────────────────────────────────────────────────────────────────
//
// This is a small county's CDN, not a hyperscaler, and nothing here is urgent. One file at a time,
// never in parallel, a floor of FLOOR_MS between requests, and an exponential back-off that gives
// ground quickly if the server ever does push back. It reports a browser user-agent because
// Cloudflare refuses anything else — worth stating plainly rather than hiding, and a reason to
// keep the rate gentle rather than find out what the real ceiling is.
//
// Usage:
//   node scripts/bell-plat-archive.mjs --letters a,b,c        # crawl those index pages
//   node scripts/bell-plat-archive.mjs --letters a,b,c --index-only
//   node scripts/bell-plat-archive.mjs --status               # what is done, what is left
//   node scripts/bell-plat-archive.mjs --letters a --limit 20 # stop after 20 files

import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = process.env.BELL_PLAT_DIR || 'C:/Users/Jacob Maddux/BellCountyPlats';
const STATE = path.join(ROOT, '_state.json');
const BASE = 'https://www.bellcountytx.com/county_government/county_clerk/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Never faster than this, however well it is going. */
const FLOOR_MS = 1_500;
/** Where a fresh crawl starts. */
const START_MS = 2_000;
/** A single request never waits longer than this before being tried again. */
const CEILING_MS = 10 * 60_000;
/** Consecutive refusals before standing down entirely for a while. */
const COOLDOWN_AFTER = 10;
const COOLDOWN_MS = 15 * 60_000;
/** How many times one file may be refused before it is parked for a later run. */
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const gb = (n) => `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

function loadState() {
  if (!fs.existsSync(STATE)) {
    return { version: 1, startedAt: new Date().toISOString(), letters: {}, files: {}, stats: { downloaded: 0, bytes: 0, refused: 0 } };
  }
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}

let saveTimer = null;

/**
 * Write the state file.
 *
 * ── WHY THE RETRIES, AND WHY THIS NEVER THROWS ────────────────────────────────────────────────
 *
 * `renameSync` over an existing file is atomic on POSIX and *usually* atomic on Windows — but it
 * fails with EPERM whenever anything else holds the destination open for even a moment, which on a
 * Windows box means Defender scanning the file we just wrote. Measured 2026-09-22: the D-F crawl
 * died at file 1,847 of 2,377 with exactly that.
 *
 * Two separate faults made one transient lock fatal:
 *
 *   1. the rename was not retried, though the lock clears in milliseconds;
 *   2. the write ran inside a `setTimeout`, so the throw had no catch above it — an unhandled
 *      rejection in a debounce timer, which takes the process down with it.
 *
 * A bookkeeping hiccup must never kill a multi-hour download. So: retry the rename a few times,
 * fall back to writing the destination directly if it still will not budge (losing atomicity is
 * better than losing the crawl — and the very next save restores it), and swallow whatever is
 * left. The worst case is a state file one file out of date, which the resume path corrects by
 * finding the file already on disk.
 */
function writeState(s) {
  fs.mkdirSync(ROOT, { recursive: true });
  const tmp = `${STATE}.tmp`;
  const json = JSON.stringify(s, null, 2);
  try {
    fs.writeFileSync(tmp, json);
  } catch (e) {
    console.error(`   [state] could not write the temp file — ${e.code ?? e.message}`);
    return;
  }
  for (let attempt = 1; attempt <= 5; attempt++) {
    try { fs.renameSync(tmp, STATE); return; }
    catch (e) {
      if (attempt === 5) {
        // Still locked. Write in place rather than give up the run.
        try {
          fs.writeFileSync(STATE, json);
          try { fs.unlinkSync(tmp); } catch { /* leave it; the next save overwrites */ }
        } catch (e2) {
          console.error(`   [state] save failed (${e2.code ?? e2.message}) — continuing; progress is recovered from disk on resume`);
        }
        return;
      }
      // Busy-wait briefly. A lock of this kind clears in single-digit milliseconds, and the
      // alternative is making every caller async for the sake of an error that rarely happens.
      const until = Date.now() + attempt * 20;
      while (Date.now() < until) { /* spin */ }
    }
  }
}

function saveState(s, immediate = false) {
  s.updatedAt = new Date().toISOString();
  if (immediate) { clearTimeout(saveTimer); saveTimer = null; writeState(s); return; }
  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      // Belt and braces: writeState already contains its own failures, but a timer callback is
      // exactly where an unhandled throw becomes a dead process.
      try { writeState(s); } catch (e) { console.error(`   [state] ${e.message}`); }
    }, 1000);
  }
}

/** Turn the index's HTML back into the characters it stands for.
 *
 *  The link text is HTML, so `B & C ESTATES` arrives as `B &amp; C ESTATES`. Stored raw, every
 *  ampersand name in the archive carried a literal "&amp;" — harmless while the name was only
 *  displayed, and not harmless at all once the name started being used as a FILENAME. */
function decodeEntities(str) {
  return str
    .replace(/&(?:amp|AMP);/g, '&')
    .replace(/&(?:lt|LT);/g, '<')
    .replace(/&(?:gt|GT);/g, '>')
    .replace(/&(?:quot|QUOT);/g, '"')
    .replace(/&(?:apos|#0?39);/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** The plats listed on one index page, as {url, name, letter}. */
async function readIndex(letter) {
  const res = await fetch(`${BASE}${letter}.php`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`index ${letter}.php -> HTTP ${res.status}`);
  const html = await res.text();
  // ── MATCH THE HREF TO ITS OWN CLOSING QUOTE ────────────────────────────────────────────────
  //
  // This used a `["']` pair with `[^"']*` between, which stops at the FIRST quote of either kind.
  // Plat names contain apostrophes — ALARDIN'S LANDING, AMY'S ATTIC MARLANDWOOD, CHIEF'S PLACE —
  // so their hrefs were cut at the apostrophe and the crawler asked for `.../plats/A/ALARDIN`,
  // which 404s. Six files in A-C alone, and they would have looked like dead links rather than a
  // parser bug. The backreference \1 closes on the same quote character that opened.
  const re = /<a\s+href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const out = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!/docs\/plats\//i.test(m[2])) continue;
    const href = m[2].replace(/&amp;/g, '&');
    const abs = href.startsWith('http') ? href : `https://www.bellcountytx.com/${href.replace(/^\//, '')}`;
    // The county links some plats over http:// and some over https://, which would otherwise be
    // two identities for one file — and would have us fetching public records in the clear.
    const clean = abs.split('?')[0].replace(/^http:\/\//, 'https://');
    const name = decodeEntities(m[3].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (!out.has(clean)) out.set(clean, { url: clean, name, letter });
  }
  return [...out.values()];
}

/** A server filename that tells you nothing.
 *
 *  Every pattern here was found in the archive and checked against the whole index for false
 *  positives before being added — no real subdivision name matches any of them:
 *
 *    DOC, DOC000            a scanner's default
 *    Acrobat Document       the software's default
 *    1943003481, 1891002182 a scan id (EDNEY ADDITION, FREEMAN HEIGHTS ADDITION)
 *    A-201A                 the county's own sheet reference (ELM CREEK ADN)
 *
 *  Each was a real plat filed under a name nobody could ever search for, which in an archive is
 *  the same as not having it. */
const MEANINGLESS = new RegExp(
  '^(?:'
  + 'doc|scan|img|image|untitled|page|document'          // bare words
  + '|(?:new[-_ ]?)?doc(?:ument)?'                        // "new document"
  + '|acrobat[-_ ]?document'                              // Acrobat's default
  + ')[-_ ]?\\d*$'
  + '|^\\d{1,12}$'                                          // a bare number of any length
  + '|^[A-Za-z]{1,2}-?\\d{1,4}[A-Za-z]?$',                  // a sheet reference like A-201A
  'i',
);

/** Strip what Windows forbids, without otherwise touching the county's spelling. */
function safeName(s) {
  return s.replace(/[<>:"|?*\\/]/g, '_').replace(/\s+/g, ' ').trim();
}

/**
 * Where a plat lands on disk.
 *
 * Normally the county's own filename, which is how every other file here is named and how the
 * index cross-references them.
 *
 * ── WHEN THE SERVER FILENAME IS A SCANNER'S DEFAULT ───────────────────────────────────────────
 *
 * Two files in the G index are published as `DOC.pdf` and `DOC000.pdf` — whatever the scanner
 * called them on the day. Both are real plats: rendered, they read "AMENDED PLAT OF GLENDALE
 * ADDITION TO THE CITY OF TEMPLE, TEXAS, AUG. 14, 1930" and a second scan of the same addition.
 * Filed as `DOC000.pdf` they are unfindable by anyone looking for Glendale, which for an archive
 * is the same as not having them.
 *
 * The index's own link text is the answer and it was already being stored: `GLENDALE ADDITION
 * AMENDED`. So when the server filename carries no information, the county's display name is used
 * instead. Only for that case — a good filename is never second-guessed.
 */
function targetFor(file) {
  const raw = decodeURIComponent(file.url.split('/').pop() || 'plat.pdf');
  const ext = (raw.match(/\.[A-Za-z0-9]+$/) || ['.pdf'])[0];
  const stem = raw.slice(0, raw.length - ext.length);
  const display = (file.name || '').trim();
  const useDisplay = MEANINGLESS.test(stem) && display.length > 2;
  return path.join(ROOT, file.letter.toUpperCase(), safeName(useDisplay ? display + ext : raw));
}

/** What `targetFor` would have returned before the rule above — so an archive built by an earlier
 *  run is migrated rather than downloaded again. */
function legacyTargetFor(file) {
  const raw = decodeURIComponent(file.url.split('/').pop() || 'plat.pdf');
  return path.join(ROOT, file.letter.toUpperCase(), safeName(raw));
}

/**
 * The URL to actually request.
 *
 * The index links some plats as `.PDF` and some as `.pdf`. The CDN's WAF refuses the uppercase
 * form with a 403 while serving the identical file happily under the lowercase one. The stored
 * identity stays exactly as the county published it — only the request is lowercased — so the
 * state file still matches the index on a later run.
 */
export function platUrl(url) {
  return url.replace(/\.PDF$/, '.pdf');
}

/**
 * Fetch one plat straight to disk.
 *
 * ── WHY STREAMED, AND WHY VIA `.part` ─────────────────────────────────────────────────────────
 *
 * This used to buffer the whole response with `arrayBuffer()` and then write it. Plats run 8-12 MB
 * and the crawl was killed mid-run by the OS for memory pressure on 2026-09-22; the crawler was a
 * casualty rather than the cause, but a bulk downloader has no business holding a whole file in
 * memory when it is only going to put it on disk.
 *
 * The `.part` rename matters more than the memory. A file is only given its real name once it has
 * arrived complete and been checked, so a kill at any moment leaves either nothing or a finished
 * file — never a truncated PDF. The resume path trusts any file on disk over 1 KB, and without
 * this it would have accepted a half-written plat as done and moved on.
 */
async function fetchPlatToFile(file, dest) {
  const res = await fetch(encodeURI(platUrl(file.url)), {
    headers: { 'user-agent': UA, referer: `${BASE}${file.letter}.php`, accept: 'application/pdf,*/*' },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok || !res.body) return { status: res.status, bytes: 0, isPdf: false };

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part));
  } catch (e) {
    try { fs.unlinkSync(part); } catch { /* nothing to clean */ }
    throw e;
  }

  const bytes = fs.statSync(part).size;
  let head = Buffer.alloc(5);
  const fd = fs.openSync(part, 'r');
  try { fs.readSync(fd, head, 0, 5, 0); } finally { fs.closeSync(fd); }
  const isPdf = head.toString('latin1') === '%PDF-';

  if (isPdf && bytes > 1024) {
    fs.renameSync(part, dest);
    return { status: res.status, bytes, isPdf: true };
  }
  fs.unlinkSync(part);
  return { status: res.status, bytes, isPdf: false };
}

function summarise(s) {
  const all = Object.values(s.files);
  const done = all.filter((f) => f.status === 'done');
  const parked = all.filter((f) => f.status === 'parked');
  const missing = all.filter((f) => f.status === 'missing');
  const pending = all.filter((f) => !['done', 'parked', 'missing'].includes(f.status));
  const bytes = done.reduce((n, f) => n + (f.bytes || 0), 0);
  return { total: all.length, done: done.length, parked: parked.length, missing: missing.length, pending: pending.length, bytes };
}

function printStatus(s) {
  const t = summarise(s);
  console.log(`\nBell County plat archive — ${ROOT}`);
  console.log(`  indexed : ${t.total} files across ${Object.keys(s.letters).length} letters`);
  console.log(`  done    : ${t.done}  (${gb(t.bytes)})`);
  console.log(`  pending : ${t.pending}`);
  console.log(`  parked  : ${t.parked}  (refused ${MAX_ATTEMPTS}x — retried on a later run)`);
  console.log(`  missing : ${t.missing}  (404 — the county's index links a file its server does not have)`);
  const byLetter = {};
  for (const f of Object.values(s.files)) {
    const L = f.letter.toUpperCase();
    byLetter[L] ??= { done: 0, total: 0 };
    byLetter[L].total++;
    if (f.status === 'done') byLetter[L].done++;
  }
  const letters = Object.keys(byLetter).sort();
  if (letters.length) {
    console.log('  by letter:');
    for (const L of letters) console.log(`     ${L}: ${byLetter[L].done}/${byLetter[L].total}`);
  }
}

async function main() {
  const state = loadState();

  if (arg('status')) { printStatus(state); return; }

  const letters = String(arg('letters', 'a')).toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  const limit = Number(arg('limit', 0)) || Infinity;

  // ── 1. Index ────────────────────────────────────────────────────────────────────────────────
  for (const L of letters) {
    process.stdout.write(`index ${L}.php ... `);
    try {
      const found = await readIndex(L);
      let added = 0, renamedName = 0;
      for (const f of found) {
        const existing = state.files[f.url];
        if (!existing) { state.files[f.url] = { ...f, status: 'pending', attempts: 0 }; added++; continue; }
        // The index is the authority on what a plat is called. Refreshing it on every pass is what
        // let a fix to the name parsing reach the 3,000 rows already stored — the first version only
        // ever set `name` on insert, so corrected names never arrived anywhere they mattered.
        if (f.name && existing.name !== f.name) { existing.name = f.name; renamedName++; }
      }
      state.letters[L] = { count: found.length, indexedAt: new Date().toISOString() };
      console.log(`${found.length} plats (${added} new${renamedName ? `, ${renamedName} name(s) corrected` : ''})`);
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
    }
    saveState(state, true);
    await sleep(2000);
  }

  if (arg('index-only')) { printStatus(state); return; }

  // ── 1b. Reconcile names ─────────────────────────────────────────────────────────────────────
  //
  // Bring what is on disk into line with what `targetFor` says the name should be, for EVERY file
  // of the requested letters — not just the ones still to download.
  //
  // The first version of this ran inside the download loop, which filters out anything already
  // `done`. So the two Glendale plats renamed off `DOC.pdf` and `DOC000.pdf` kept their old
  // recorded paths through a full re-run: the files were right, the state pointed at names that no
  // longer existed, and nothing said so. A migration that only reaches the files it is not needed
  // for is not a migration.
  {
    let renamed = 0, repointed = 0;
    for (const file of Object.values(state.files)) {
      if (!letters.includes(file.letter)) continue;
      const dest = targetFor(file);
      const legacy = legacyTargetFor(file);
      if (legacy !== dest && !fs.existsSync(dest) && fs.existsSync(legacy)) {
        try {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.renameSync(legacy, dest);
          renamed++;
          console.log(`   renamed ${path.basename(legacy)} -> ${path.basename(dest)}`);
        } catch (e) {
          console.error(`   could not rename ${path.basename(legacy)}: ${e.code ?? e.message}`);
        }
      }
      // The record must name a file that is actually there, whoever moved it.
      if (fs.existsSync(dest) && file.path !== dest) {
        file.path = dest;
        file.bytes = fs.statSync(dest).size;
        if (file.status !== 'done') file.status = 'done';
        repointed++;
      }
    }
    if (renamed || repointed) {
      console.log(`   reconciled: ${renamed} renamed, ${repointed} record(s) repointed\n`);
      saveState(state, true);
    }
  }

  // ── 2. Download ─────────────────────────────────────────────────────────────────────────────
  const queue = Object.values(state.files)
    .filter((f) => letters.includes(f.letter))
    .filter((f) => f.status !== 'done' && f.status !== 'parked')
    // Letter first, then name. Sorting on the raw URL interleaved the letters, because the http://
    // entries sorted ahead of every https:// one — so "where we left off" was not a place.
    .sort((a, b) => (a.letter === b.letter
      ? (a.url.split('/').pop() || '').localeCompare(b.url.split('/').pop() || '')
      : a.letter.localeCompare(b.letter)));

  const t0 = summarise(state);
  console.log(`\n${queue.length} to fetch for [${letters.join(', ')}] — ${t0.done} already held.`);
  console.log(`Pace starts at ${START_MS / 1000}s and adapts. Ctrl-C is safe; progress is saved after every file.\n`);

  let delay = START_MS;
  let consecutiveRefusals = 0;
  let got = 0;

  let stopping = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log('\n\nStopping — saving state…');
  });

  for (const file of queue) {
    if (stopping || got >= limit) break;

    const dest = targetFor(file);
    // A `.part` is a download that did not finish. Clear it rather than leave litter that grows
    // by one file per interrupted run.
    try { if (fs.existsSync(`${dest}.part`)) fs.unlinkSync(`${dest}.part`); } catch { /* fine */ }
    // Already on disk from an earlier run that did not get to record it.
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
      const size = fs.statSync(dest).size;
      state.files[file.url] = { ...file, status: 'done', bytes: size, path: dest, at: new Date().toISOString() };
      saveState(state);
      continue;
    }

    let res;
    try {
      res = await fetchPlatToFile(file, dest);
    } catch (e) {
      res = { status: 0, bytes: 0, isPdf: false, err: e.message };
    }

    const rec = state.files[file.url];
    rec.attempts = (rec.attempts || 0) + 1;

    if (res.isPdf) {
      rec.status = 'done';
      rec.bytes = res.bytes;
      rec.path = dest;
      rec.at = new Date().toISOString();
      state.stats.downloaded++;
      state.stats.bytes += res.bytes;
      got++;
      consecutiveRefusals = 0;
      delay = Math.max(FLOOR_MS, Math.round(delay * 0.9));   // earn speed back slowly
      const t = summarise(state);
      console.log(`[${String(t.done).padStart(4)}/${t.total}] ${mb(res.bytes).padStart(9)}  ${path.basename(dest).slice(0, 46).padEnd(46)}  next in ${(delay / 1000).toFixed(0)}s`);
    } else if (res.status === 404) {
      // ── MISSING IS NOT REFUSED ───────────────────────────────────────────────────────────────
      //
      // A 404 is the server answering plainly: this file is not here. Backing off for it slows the
      // whole crawl to apologise for a link the county published wrong, and a run of them would
      // trip the consecutive-refusal cooldown and stand the crawler down for fifteen minutes over
      // nothing. Recorded and passed over at full pace.
      rec.status = 'missing';
      rec.lastStatus = 404;
      rec.at = new Date().toISOString();
      console.log(`   missing (404, not on the server)  ${rec.name?.slice(0, 44) ?? path.basename(dest)}`);
    } else {
      rec.status = rec.attempts >= MAX_ATTEMPTS ? 'parked' : 'pending';
      rec.lastStatus = res.status;
      rec.lastError = res.err ?? null;
      state.stats.refused++;
      consecutiveRefusals++;
      delay = Math.min(CEILING_MS, Math.round(delay * 1.8));  // give ground fast
      console.log(`   refused HTTP ${res.status}${rec.status === 'parked' ? ' — parked for a later run' : ''}  ${path.basename(dest).slice(0, 40)}  backing off to ${(delay / 1000).toFixed(0)}s`);
    }

    saveState(state);

    if (consecutiveRefusals >= COOLDOWN_AFTER) {
      console.log(`\n   ${consecutiveRefusals} refusals in a row — standing down for ${COOLDOWN_MS / 60000} minutes.\n`);
      saveState(state, true);
      await sleep(COOLDOWN_MS);
      consecutiveRefusals = 0;
      delay = START_MS;
    } else {
      await sleep(delay);
    }
  }

  saveState(state, true);
  printStatus(state);
  console.log(`\nThis session: ${got} files.`);
  console.log('Resume with the same command — everything already held is skipped.');
}

// Nothing in the bookkeeping is worth losing hours of downloading over. A genuine fault in the
// download loop still ends the run; a stray rejection from a timer does not.
process.on('unhandledRejection', (e) => {
  console.error(`   [warn] unhandled rejection: ${e instanceof Error ? e.message : String(e)}`);
});

main().catch((e) => { console.error(e); process.exit(1); });
