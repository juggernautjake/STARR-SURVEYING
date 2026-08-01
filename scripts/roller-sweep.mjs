// scripts/roller-sweep.mjs — the roller window, across every system, template, skin, dice count and
// viewport. Closes BOTH D7-3 (prove no scrollbar exists) and D6-3 (the contact sheet).
//
// ── WHY ONE SCRIPT FOR TWO SLICES ────────────────────────────────────────────────────────────────────
//
// D6-3's contact sheet was deferred on 2026-07-30 with a stated reason: it needs the same Playwright
// harness as D7-3, and D7-3 was blocked behind the D7-1 sizing decision. Building the harness twice —
// once against a window size that might change, once after — is waste. D7-1 shipped 2026-07-31, so both
// unblock together and this is the harness, built once.
//
// The two slices ask different questions of the same cell, which is why they are AXES here rather than
// two scripts:
//
//   --axis fit   (D7-3) Does the window FIT, and does anything inside it scroll? Detectors over
//                system × template × dice count × viewport, including 360px. Screenshots on failure.
//   --axis look  (D6-3) Do the four rollers read as one family? Screenshots over
//                system × template × skin at desktop, plus a browsable index.
//   --axis all   Both, in one run.
//
// ── WHAT COUNTS AS A FAILURE, AND WHY IT IS NOT "A SCROLLBAR IS VISIBLE" ─────────────────────────────
//
// The owner's rule is verbatim: *"there is never a need for a scrolling bar to appear or be used to see
// everything"*. A screenshot cannot answer that — an overlay scrollbar is invisible until you touch it,
// and `overflow: hidden` hides content with no scrollbar at all, which is WORSE and would photograph
// clean. So the judgement comes from `detectClipped` / `detectOversized` (scripts/lib/overflow.mjs),
// which measure `scrollHeight` against `clientHeight` and the window against the viewport. The pictures
// are evidence for the human question (does this look right), never for the mechanical one.
//
// The one permitted scroller is the roll history, which opts in with `data-scrollable="true"` in the
// markup. All four stages already carry it. The detector honours that and reports everything else.
//
// ── THINGS THIS SCRIPT LEARNED THE HARD WAY (kept from contact-sheet.mjs, which learned them first) ──
//
//  · A CELL WHOSE PICKER DID NOT TAKE IS NOT SCREENSHOTTED. A mislabelled picture in a contact sheet is
//    worse than a gap: every judgement drawn from it lands on the wrong combination.
//  · CLICKS ARE CONFIRMED BY POLLING `aria-pressed`, never by waiting a fixed 500ms. Choosing a skin
//    re-renders the picker, so a click can land on a stale node.
//  · NOT `networkidle`: the sheet holds a realtime channel open, so the network never goes idle and the
//    navigation times out at 60s having loaded perfectly.
//  · The roller may be MINIMIZED from a previous visit — the dock persists per character. A run that
//    measures a hidden window reports a clean pass for a window nobody looked at, which is the precise
//    false-green `detectClipped` refuses to produce for a missing root.
//
// Usage:
//   node scripts/roller-sweep.mjs --base http://localhost:3212 --cookie "$DND_SESSION" --axis all
//   node scripts/roller-sweep.mjs --characters "dnd5e-2024=<id>,pathfinder2e=<id>" --axis fit
//
// Output: .audit/roller/<axis>/index.html + report.json
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { detectClipped, detectOversized } from './lib/overflow.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const BASE = arg('base', 'http://localhost:3212');
const AXIS = arg('axis', 'all');
const SESSION = arg('cookie', process.env.DND_SESSION || '');

// One character per system. These are the four the QA notes use; override to sweep others.
const CHARACTERS = Object.fromEntries(
  arg('characters',
    'dnd5e-2014=ca000000-0000-4000-8000-000000000414,'
    + 'dnd5e-2024=1a2200aa-0000-4000-8000-000000000001,'
    + 'pathfinder2e=ca000000-0000-4000-8000-000000000f09,'
    + 'intuitive-games=ca000000-0000-4000-8000-000000000e06',
  ).split(',').map((p) => p.split('=').map((s) => s.trim())),
);

/** The four roller templates, by the label their chip shows. */
const TEMPLATES = ['Dice Core', 'Sigil Stack', 'Roll Board', 'Impact'];

// 360×640 is the phone the owner's rule is really about; 768 is a tablet in portrait; 1280 is the
// desktop the FIXED_W/FIXED_H ideal was drawn for. A window that fits all three fits the middle.
// 1280×660 is here because of an owner report the original list could not have caught: the sweep measured
// 1280×**900** and called the desktop clean, which was true of a 900px-tall viewport and false of a laptop.
// A browser's usable height on a 1366×768 screen is nearer 660 once its own chrome is taken, and the
// roller's height is derived from that. Test the machine people have, not the resolution on the box.
const DEFAULT_VIEWPORTS = [
  { name: '360x640', w: 360, h: 640 },
  { name: '768x1024', w: 768, h: 1024 },
  { name: '1280x660', w: 1280, h: 660 },
  { name: '1280x900', w: 1280, h: 900 },
];

/** `--viewports 1280x660,1440x780` overrides the list, for chasing a specific report. */
const VIEWPORTS = (() => {
  const raw = arg('viewports', '');
  if (!raw) return DEFAULT_VIEWPORTS;
  return raw.split(',').map((s) => {
    const [w, h] = s.trim().toLowerCase().split('x').map(Number);
    return { name: `${w}x${h}`, w, h };
  }).filter((v) => v.w > 0 && v.h > 0);
})();

// One die and twenty. The tray's own maximum is the interesting case: it is the most content the stage
// can ever be asked to hold, so if the window fits at 20 it fits at everything.
const DICE_COUNTS = [1, 20];

const ROOT = '.fld';
const OUT_ROOT = path.join('.audit', 'roller');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// MATCHING IS BY CONTAINMENT, NOT EQUALITY, AND THAT IS NOT LAZINESS.
//
// The first version of this file matched `^\s*Dice Core\s*$` against the button's whole textContent and
// found ZERO chips — 45 of 48 cells skipped with "template chip would not take", which reads as a broken
// picker and is actually a broken selector. A roller chip renders `<span>⬡</span><span>Dice Core</span>`,
// so its textContent is "⬡Dice Core" and no anchored pattern will ever match it. `contact-sheet.mjs`
// recorded the mirror image of this trap (`:text-is()` matching only DIRECTLY-held text, which missed the
// wrapped labels and hit the unwrapped ones) — same bug, opposite selector.
//
// So: strip everything that is not a letter, digit or space from both sides and ask whether the label is
// in there. Scoped to a named group where one exists, so "Impact" cannot collide with some other control
// that happens to contain the word.
/** Is this labelled chip the pressed one? Tolerates being asked mid-navigation. */
async function isSelected(page, label, groupLabel) {
  try {
    return await page.evaluate(
      ({ text, group }) => {
        const clean = (b) => (b.textContent || '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
        const scope = group ? document.querySelector(`[role="group"][aria-label="${group}"]`) : document;
        if (!scope) return false;
        return [...scope.querySelectorAll('button')]
          .some((b) => clean(b).includes(text) && b.getAttribute('aria-pressed') === 'true');
      },
      { text: label, group: groupLabel ?? null },
    );
  } catch {
    return false; // "Execution context was destroyed" is not an answer — poll again.
  }
}

/** Click a chip and CONFIRM it took. Returns false rather than throwing, so a cell can be skipped. */
async function pick(page, label, groupLabel) {
  const scope = groupLabel ? page.locator(`[role="group"][aria-label="${groupLabel}"]`) : page;
  const btn = scope.locator('button').filter({ hasText: new RegExp(escapeRe(label)) }).first();
  if (await btn.count() === 0) return false;
  if (await isSelected(page, label, groupLabel)) return true;
  try { await btn.click({ timeout: 5000 }); } catch { return false; }
  for (let i = 0; i < 40; i += 1) {
    if (await isSelected(page, label, groupLabel)) { await page.waitForTimeout(220); return true; }
    await page.waitForTimeout(200);
  }
  return false;
}

/** Template id ↔ the label its chip shows. */
const TEMPLATE_IDS = { 'Dice Core': 'core', 'Sigil Stack': 'sigil', 'Roll Board': 'board', Impact: 'impact' };

/**
 * Switch the roller template through the SAME endpoint the picker posts to, then reload.
 *
 * THE PICKER ITSELF IS NOT DRIVABLE HERE, AND THAT IS A PROPERTY OF THE PICKER, NOT OF PLAYWRIGHT.
 * `RollerTemplateBar` has two paths: an `onPick` fast path that switches live, and a legacy path that
 * POSTs and then calls `window.location.reload()`. The 5e sheet takes the legacy path — so a click
 * destroys the execution context, the chip node the click resolved against is gone, and polling
 * `aria-pressed` across the reload is a race the sweep loses most of the time. Measured: 35 of 48 cells
 * skipped as "chip would not take", while the three cells that happened to be ALREADY on their template
 * passed. A sweep that can only measure the state it found is not a sweep.
 *
 * Posting the preference is the same write the chip makes, so the page under measurement is the page a
 * player gets. What it does NOT prove is that the chip works, which is why `--axis look` still drives
 * the real skin picker and why `roller-system-parity.test.ts` asserts the bar's shape.
 *
 * This WRITES to the character row, so `main` records each character's original template and restores
 * it at the end — the live database is not a scratchpad.
 */
async function setTemplate(page, characterId, label) {
  const id = TEMPLATE_IDS[label];
  const res = await page.evaluate(async ({ cid, roller }) => {
    const r = await fetch(`/api/dnd/characters/${cid}/roller`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roller }),
    });
    return { status: r.status, body: await r.text() };
  }, { cid: characterId, roller: id });
  if (res.status !== 200) return false;
  // A RELOAD THAT THROWS SKIPS ONE CELL; IT DOES NOT END THE RUN. `net::ERR_ABORTED; maybe frame was
  // detached` killed a 40-minute sweep at cell 100 because the dev server happened to be recompiling —
  // and the run had already produced 100 useful measurements, all of them lost with it. A sweep is a
  // measuring instrument: one unreadable cell is a gap in the data, not a reason to discard the data.
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {
    return false;
  }
  if (!(await ensureRollerOpen(page))) return false;
  // Confirm the page is actually SHOWING that template before anything is measured or photographed.
  return isSelected(page, label, 'Roller style');
}

/** Read the character's current roller template id, so the sweep can put it back. */
async function currentTemplate(page, characterId) {
  return page.evaluate(async (cid) => {
    const r = await fetch(`/api/dnd/characters/${cid}`);
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j?.character?.data?.rollerTemplate ?? j?.data?.rollerTemplate ?? null;
  }, characterId);
}

/**
 * Make sure the roller window is OPEN and laid out.
 *
 * The dock remembers minimized state per character, so a sweep that assumes the window is showing can
 * measure `display: none` and call it a pass. `.fld` is in the DOM either way — what changes is whether
 * it has a box — so this checks for a real one rather than for the element.
 */
async function ensureRollerOpen(page) {
  const fab = page.locator('.fld-fab');
  if (await fab.count() > 0 && await fab.first().isVisible()) {
    await fab.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  try {
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
    }, ROOT, { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

/** Set the dice-pad count by clicking "More dice" — there is no numeric input to type into. */
async function setDiceCount(page, want) {
  const more = page.getByLabel('More dice');
  const fewer = page.getByLabel('Fewer dice');
  if (await more.count() === 0) return false;
  // Reset to 1 first: the pad's count is component state that survives a template switch.
  for (let i = 0; i < 25 && await fewer.isEnabled().catch(() => false); i += 1) {
    await fewer.click({ timeout: 2000 }).catch(() => {});
  }
  for (let i = 1; i < want; i += 1) {
    if (!(await more.isEnabled().catch(() => false))) break;
    await more.click({ timeout: 2000 }).catch(() => {});
  }
  return true;
}

/** Roll, so the stage is showing its BUSIEST state — an idle stage hides the content that overflows. */
async function rollOnce(page, sides = 20) {
  const die = page.locator(`button[title^="Roll "][title$="d${sides}"]`).first();
  if (await die.count() === 0) return false;
  await die.click({ timeout: 4000 }).catch(() => {});
  // Long enough for the throw to settle and the breakdown to paint; the stages animate ~1.2s.
  await page.waitForTimeout(1600);
  return true;
}

/** The skin chips available on this sheet, read live (each skin brings its own theme list — see D6-3). */
const readSkins = (page) => page.evaluate(() => {
  const head = [...document.querySelectorAll('*')]
    .find((e) => (e.textContent || '').trim().startsWith('STYLE //') && e.children.length === 0);
  return head ? [...head.parentElement.querySelectorAll('button')].map((b) => (b.textContent || '').trim()) : [];
});

async function main() {
  if (!SESSION) {
    console.error('Need a session: --cookie "<dnd_session>" or DND_SESSION in the env. The roller\'s');
    console.error('template picker only renders for someone who can WRITE the sheet.');
    process.exit(2);
  }

  const browser = await chromium.launch();
  const results = { fit: [], look: [], skipped: [] };
  const url = new URL(BASE);

  // WHAT THE SWEEP FOUND, SO IT CAN PUT IT BACK. This runs against the live database — the roller
  // template is a stored preference on the character row, and a QA run that leaves four characters on
  // whichever template it happened to measure last is a QA run that edited the owner's data.
  const original = {};
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: 'dnd_session', value: SESSION, domain: url.hostname, path: '/' }]);
    const page = await ctx.newPage();
    for (const [system, id] of Object.entries(CHARACTERS)) {
      await page.goto(`${BASE}/dnd/characters/${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      original[id] = await currentTemplate(page, id).catch(() => null);
      console.log(`  ${system}: was on "${original[id] ?? '(default)'}"`);
    }
    await ctx.close();
  }

  // ── AXIS: FIT (D7-3) ───────────────────────────────────────────────────────────────────────────
  if (AXIS === 'fit' || AXIS === 'all') {
    const outDir = path.join(OUT_ROOT, 'fit');
    fs.mkdirSync(outDir, { recursive: true });

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      await ctx.addCookies([{ name: 'dnd_session', value: SESSION, domain: url.hostname, path: '/' }]);
      const page = await ctx.newPage();

      for (const [system, id] of Object.entries(CHARACTERS)) {
        await page.goto(`${BASE}/dnd/characters/${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (!(await ensureRollerOpen(page))) {
          results.skipped.push(`${system} @ ${vp.name}: roller never showed`);
          console.log(`  ${system} @ ${vp.name} — SKIPPED, roller never showed`);
          continue;
        }

        for (const tpl of TEMPLATES) {
          if (!(await setTemplate(page, id, tpl))) {
            results.skipped.push(`${system}/${tpl} @ ${vp.name}: template would not switch`);
            continue;
          }

          for (const count of DICE_COUNTS) {
            const name = `${slug(system)}__${slug(tpl)}__${count}d__${vp.name}`;
            await setDiceCount(page, count);
            await rollOnce(page, 20);
            // RE-OPENED IMMEDIATELY BEFORE MEASURING, not once per template. The dock starts minimized on
            // a fresh load and a reload puts it back there, so a check that ran before the roll can be
            // stale by the time the detectors run — which is precisely how the first full sweep measured
            // a hidden window 92 times and called it a pass.
            await ensureRollerOpen(page);

            const clipped = await page.evaluate(detectClipped, ROOT);
            const sized = await page.evaluate(detectOversized, ROOT);
            // A root that is not there is NEVER a pass — and neither is a root that is there but paints
            // nothing. `rendered` is the second half of that rule; without it, "the window is hidden"
            // and "the window fits" are the same result.
            const ok = clipped.found && sized.found && sized.rendered && clipped.count === 0
              && !sized.tooWide && !sized.tooTall && !sized.offTop && !sized.offLeft;

            const shot = `${name}.jpeg`;
            if (!ok) {
              await page.locator(ROOT).screenshot({ path: path.join(outDir, shot), type: 'jpeg', quality: 80 }).catch(() => {});
            }
            results.fit.push({ system, template: tpl, count, viewport: vp.name, ok, clipped, sized, shot: ok ? null : shot });
            const why = !sized.rendered ? 'window not rendered (hidden/minimized) — NOT MEASURED'
              : `clipped ${clipped.count}, ${sized.width}×${sized.height} in ${sized.viewportW}×${sized.viewportH}`;
            console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? ` (${sized.width}×${sized.height})` : ` — ${why}`}`);
          }
        }
      }
      await ctx.close();
    }
  }

  // ── AXIS: LOOK (D6-3) ──────────────────────────────────────────────────────────────────────────
  if (AXIS === 'look' || AXIS === 'all') {
    const outDir = path.join(OUT_ROOT, 'look');
    fs.mkdirSync(outDir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: 'dnd_session', value: SESSION, domain: url.hostname, path: '/' }]);
    const page = await ctx.newPage();

    for (const [system, id] of Object.entries(CHARACTERS)) {
      await page.goto(`${BASE}/dnd/characters/${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (!(await ensureRollerOpen(page))) { results.skipped.push(`${system}: roller never showed`); continue; }
      const skins = await readSkins(page);
      if (!skins.length) { results.skipped.push(`${system}: no STYLE picker (bespoke sheet?)`); }

      // TEMPLATE IS THE OUTER LOOP, SKIN THE INNER — the opposite of contact-sheet.mjs, and for a reason
      // that only shows up here. Switching a template RELOADS the page (see `setTemplate`), so doing it
      // inside the skin loop would re-navigate after every skin and leave the sweep re-applying a picker
      // it had just applied. Skins survive the reload because they are stored on the row too, but the
      // ordering that does the least work is template-then-skin.
      for (const tpl of TEMPLATES) {
        if (!(await setTemplate(page, id, tpl))) { results.skipped.push(`${system}/${tpl}: template would not switch`); continue; }
        for (const skin of skins.length ? skins : [null]) {
          if (skin && !(await pick(page, skin))) { results.skipped.push(`${system}/${skin}/${tpl}: skin would not apply`); continue; }
          if (!(await ensureRollerOpen(page))) { results.skipped.push(`${system}/${skin}/${tpl}: roller not showing`); continue; }
          // The skin picker can itself re-render; re-assert the TEMPLATE too before shooting.
          if (!(await isSelected(page, tpl, 'Roller style'))) { results.skipped.push(`${system}/${skin}/${tpl}: template drifted`); continue; }
          await setDiceCount(page, 3);
          await rollOnce(page, 20);
          // Re-assert BOTH before shooting: switching a template remounts the window and can drop the
          // skin, and a cell filed under the wrong skin is the failure this whole guard exists for.
          if (skin && !(await isSelected(page, skin))) { results.skipped.push(`${system}/${skin}/${tpl}: skin drifted`); continue; }
          const name = `${slug(system)}__${slug(skin ?? 'default')}__${slug(tpl)}`;
          const shot = `${name}.jpeg`;
          const clipped = await page.evaluate(detectClipped, ROOT);
          const sized = await page.evaluate(detectOversized, ROOT);
          // MEASURE BEFORE SHOOTING, and do not shoot a window that is not showing. A picture of a hidden
          // window is a blank tile in the contact sheet, and a blank tile is read as "this combination
          // renders as nothing" — a claim about the product made by a bug in the harness. The first run
          // of this axis produced two of them (`0×0` in the log) before the `rendered` flag existed.
          if (!sized.rendered) { results.skipped.push(`${system}/${skin}/${tpl}: window not rendered — not photographed`); continue; }
          await page.locator(ROOT).screenshot({ path: path.join(outDir, shot), type: 'jpeg', quality: 82 }).catch(() => {});
          results.look.push({ system, skin: skin ?? 'default', template: tpl, shot, clipped: clipped.count, w: sized.width, h: sized.height });
          console.log(`  shot ${name} — ${sized.width}×${sized.height}`);
        }
      }
    }
    await ctx.close();
  }

  // Put every character back on the template it was found on. Best-effort and reported either way: a
  // silent restore that failed is worse than a loud one, because the next reader has no way to know.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: 'dnd_session', value: SESSION, domain: url.hostname, path: '/' }]);
    const page = await ctx.newPage();
    for (const [system, id] of Object.entries(CHARACTERS)) {
      const was = original[id];
      if (!was) continue; // never had one stored — leaving it unset is the honest restore.
      const res = await page.goto(`${BASE}/dnd/characters/${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
      if (!res) { console.log(`  RESTORE FAILED (navigation): ${system} should be "${was}"`); continue; }
      const ok = await page.evaluate(async ({ cid, roller }) => {
        const r = await fetch(`/api/dnd/characters/${cid}/roller`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roller }),
        });
        return r.status === 200;
      }, { cid: id, roller: was }).catch(() => false);
      console.log(ok ? `  restored ${system} → ${was}` : `  RESTORE FAILED: ${system} should be "${was}"`);
    }
    await ctx.close();
  }

  await browser.close();

  const failures = results.fit.filter((r) => !r.ok);
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(OUT_ROOT, 'report.json'), JSON.stringify(results, null, 2));
  writeIndex(results);

  console.log(`\n${results.fit.length} fit cells, ${failures.length} failing · ${results.look.length} contact-sheet cells · ${results.skipped.length} skipped`);
  for (const s of results.skipped) console.log(`  skipped: ${s}`);
  // A skipped cell is not a pass. Exiting 0 on a run that measured nothing is how a sweep "passes" on a
  // page where the roller never mounted.
  process.exit(failures.length > 0 || (results.fit.length === 0 && results.look.length === 0) ? 1 : 0);
}

/** A browsable contact sheet: one row per system/skin, the four templates side by side. */
function writeIndex(results) {
  const cell = (r) => `<figure><img src="look/${r.shot}" loading="lazy" alt="${r.system} ${r.skin} ${r.template}">
    <figcaption>${r.template}<br><small>${r.w}×${r.h}${r.clipped ? ` · <b style="color:#e66">${r.clipped} clipped</b>` : ''}</small></figcaption></figure>`;
  const groups = {};
  for (const r of results.look) (groups[`${r.system} · ${r.skin}`] ||= []).push(r);

  const fitRows = results.fit.map((r) => `<tr class="${r.ok ? '' : 'bad'}"><td>${r.system}</td><td>${r.template}</td><td>${r.count}d</td><td>${r.viewport}</td>
    <td>${r.ok ? 'ok' : `${r.clipped.count} clipped`}</td><td>${r.sized.width ?? '—'}×${r.sized.height ?? '—'}</td></tr>`).join('');

  fs.writeFileSync(path.join(OUT_ROOT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Roller sweep</title>
<style>body{background:#0b1220;color:#dfe6f2;font:13px/1.5 system-ui;margin:20px}h2{color:#0ac8b9;margin:24px 0 8px}
.row{display:flex;gap:10px;flex-wrap:wrap}figure{margin:0;background:#111c2e;padding:6px;border:1px solid #22334d}
img{display:block;max-width:320px;height:auto}figcaption{font-size:11px;color:#93a1b5;text-align:center;padding-top:4px}
table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #22334d;padding:3px 8px}tr.bad{background:#3a1420}</style>
<h1>Roller sweep — D7-3 (fit) + D6-3 (look)</h1>
<h2>Fit — ${results.fit.filter((r) => !r.ok).length} failing of ${results.fit.length}</h2>
<table><tr><th>system<th>template<th>dice<th>viewport<th>clipping<th>size</tr>${fitRows}</table>
${Object.entries(groups).map(([k, rs]) => `<h2>${k}</h2><div class="row">${rs.map(cell).join('')}</div>`).join('')}
${results.skipped.length ? `<h2>Skipped (${results.skipped.length}) — NOT passes</h2><ul>${results.skipped.map((s) => `<li>${s}</li>`).join('')}</ul>` : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
