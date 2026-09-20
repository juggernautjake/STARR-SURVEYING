// scripts/write-test-scripts.mjs — turn the script data into a folder somebody can read.
//
// Owner, 2026-09-21: "Please write out all of the scripts and put them in a folder for test scripts
// with the AI voice agent."
//
// ── WHY THIS IS GENERATED AND NOT HAND-WRITTEN ──────────────────────────────────────────────────
//
// The scripts are data in lib/receptionist/test-scripts.ts, because the test bench steps through
// them and a test asserts they are all still well-formed. If the readable copies were written by
// hand they would drift from the ones actually being run within a month, and the folder would
// quietly become fiction.
//
// So: one source, two outputs. Edit the TypeScript, re-run this, and the folder matches.
//
//   node scripts/write-test-scripts.mjs
//
// Node strips the types and imports the data file directly, so this reads the SAME array the
// test bench steps through.
//
// The first version parsed the TypeScript with a regex, and it was wrong within a minute: it
// required each turn's closing brace to sit on its own line, so every single-line turn was
// invisible and it reported 39 turns where there are 197. It printed a confident tick over a
// folder missing four fifths of its content. Parsing a language with a regex earns exactly that.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'receptionist', 'test-scripts');
const SOURCE = path.join(ROOT, 'lib', 'receptionist', 'test-scripts.ts');

function slugNumber(i) {
  return String(i + 1).padStart(2, '0');
}

function renderScript(s, index) {
  const lines = [];
  lines.push(`# ${slugNumber(index)} · ${s.title}`);
  lines.push('');
  lines.push(`**Who is calling** — ${s.persona}`);
  lines.push('');
  lines.push(`**What this is testing** — ${s.tests}`);
  lines.push('');
  lines.push(`**Roughly** ${s.minutes} minute${s.minutes === 1 ? '' : 's'} · **${s.difficulty}**`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## The call');
  lines.push('');

  let turnNo = 0;
  for (const t of s.turns) {
    turnNo += 1;
    if (t.silenceSeconds) {
      lines.push(`**${turnNo}.** *(say nothing for ${t.silenceSeconds} seconds)*`);
    } else if (t.says) {
      lines.push(`**${turnNo}.** “${t.says}”`);
      if (t.pauseSeconds) {
        lines.push('');
        lines.push(`   *(…then go quiet for ${t.pauseSeconds} seconds before carrying on)*`);
      }
    }
    if (t.watchFor) {
      lines.push('');
      lines.push(`   > 👀 ${t.watchFor}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  if (s.shouldCapture.length) {
    lines.push('## It should end up with');
    lines.push('');
    for (const c of s.shouldCapture) lines.push(`- ${c}`);
    lines.push('');
  }
  if (s.shouldNotAsk.length) {
    lines.push('## It should NEVER have asked about');
    lines.push('');
    for (const c of s.shouldNotAsk) lines.push(`- ${c}`);
    lines.push('');
    lines.push('*This is the list that matters. An agent that gathers everything by asking about');
    lines.push('everything has failed at the only thing separating it from a form.*');
    lines.push('');
  }
  if (s.notes) {
    lines.push('## Notes');
    lines.push('');
    lines.push(s.notes);
    lines.push('');
  }
  return lines.join('\n');
}

function renderIndex(scripts) {
  const lines = [];
  lines.push('# Voice agent test scripts');
  lines.push('');
  lines.push(`${scripts.length} callers to rehearse the receptionist against.`);
  lines.push('');
  lines.push('**These are generated.** The source is `lib/receptionist/test-scripts.ts`; edit that');
  lines.push('and run `node scripts/write-test-scripts.mjs`. The test bench at');
  lines.push('`/admin/dev/receptionist` steps through the same data, so the folder and the thing');
  lines.push('being run cannot drift apart.');
  lines.push('');
  lines.push('## How to use one');
  lines.push('');
  lines.push('Open the bench, pick the script in the text chat, and read the caller lines out loud');
  lines.push('(or load them one at a time). After the call, check the two lists at the bottom:');
  lines.push('what the agent should have ended up with, and — more importantly — what it should');
  lines.push('never have asked about.');
  lines.push('');
  lines.push('## The scripts');
  lines.push('');
  lines.push('| # | Script | Who | Minutes | Difficulty |');
  lines.push('|---|---|---|---|---|');
  scripts.forEach((s, i) => {
    const file = `${slugNumber(i)}-${s.id}.md`;
    const who = s.persona.split(',')[0];
    lines.push(`| ${slugNumber(i)} | [${s.title}](./${file}) | ${who} | ${s.minutes} | ${s.difficulty} |`);
  });
  lines.push('');
  lines.push('## Where to start');
  lines.push('');
  lines.push('1. **Start easy** — the two straightforward ones. If the agent asks about structures on');
  lines.push('   a lot somebody has already described as having a house, stop and fix that first.');
  lines.push('2. **Then the hard speech** — the stutterer is the single most valuable script here.');
  lines.push('   It has a twenty-two second silence in the middle. An agent that survives it will');
  lines.push('   survive most real callers.');
  lines.push('3. **Then the seven-minute one** — the only script that should reach the cap, and the');
  lines.push('   only way to rehearse the wind-down.');
  lines.push('');
  return lines.join('\n');
}

// ── write ───────────────────────────────────────────────────────────────────────────────────────
const { TEST_SCRIPTS } = await import(pathToFileURL(SOURCE).href);
const scripts = TEST_SCRIPTS.map((s) => ({
  ...s,
  shouldNotAsk: s.shouldNotAsk ?? [],
  notes: s.notes ?? null,
}));

if (scripts.length === 0) {
  console.error('✗ lib/receptionist/test-scripts.ts exported no scripts.');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Old files are removed first, so a renamed script does not leave its previous copy behind looking
// current.
//
// `~$…` is skipped: Word writes a lock file beside any document somebody has OPEN, and this script
// crashed on it — the whole generator died with an EPERM from unlink because a person was reading
// the documentation it was regenerating. A file we did not write is not ours to delete.
for (const f of fs.readdirSync(OUT_DIR)) {
  if (!f.endsWith('.md') || f.startsWith('~$') || f.startsWith('.')) continue;
  try {
    fs.unlinkSync(path.join(OUT_DIR, f));
  } catch (err) {
    // Locked by an editor. Say so and carry on; the write below will fail loudly if it matters.
    console.log(`note: could not remove ${f} (${err.code ?? 'error'}) — leaving it`);
  }
}

// A file somebody has OPEN cannot be rewritten, and that is not a reason to abandon the other
// twenty. Each one is attempted, the locked ones are named, and the exit code says whether the
// folder is fully current — so "it worked" and "it worked except for the one you are reading" are
// different outcomes rather than the same tick.
const locked = [];
const writeOr = (file, text) => {
  try { fs.writeFileSync(file, text, 'utf8'); } catch (err) {
    locked.push(`${path.basename(file)} (${err.code ?? 'error'})`);
  }
};

scripts.forEach((s, i) => writeOr(path.join(OUT_DIR, `${slugNumber(i)}-${s.id}.md`), renderScript(s, i)));
writeOr(path.join(OUT_DIR, 'README.md'), renderIndex(scripts));

const turns = scripts.reduce((n, s) => n + s.turns.length, 0);
const attempted = scripts.length + 1;
console.log(`✓ ${attempted - locked.length} of ${attempted} files written, ${turns} turns → ${path.relative(ROOT, OUT_DIR)}`);
if (locked.length) {
  console.log(`✗ could not write (open in an editor?): ${locked.join(', ')}`);
}
for (const s of scripts) {
  console.log(`   ${String(s.minutes).padStart(2)}m  ${s.difficulty.padEnd(15)} ${s.title}`);
}
if (locked.length) process.exit(1);
