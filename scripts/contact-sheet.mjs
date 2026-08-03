// scripts/contact-sheet.mjs — render the sheet matrix so the LOOK can be judged (P11-1b).
//
// P11-1 made overflow machine-checkable. "Does this theme look good on this skin, in this format" is not
// machine-checkable, and P11-2/3/4 — make the formats structurally distinct, the skins distinct, the themes
// safe everywhere — all need something to actually look at. 5 skins × 4 formats × 5 themes is 100 cells per
// system, which nobody is going to click through by hand even once, let alone after every change.
//
// So: drive the sheet's own pickers, screenshot each cell, and write a browsable HTML index.
//
// THE MATRIX IS NOT RECTANGULAR. Each skin brings its own theme list — Hextech has five (Hextech Gold …
// Void Prophet), Magical Streamer has two (Bubblegum, Aqua) — so "5 skins × 5 themes" is not a shape that
// exists. Themes are re-read after each skin is applied.
//
// IT DRIVES THE REAL PICKERS rather than writing `sheet_type` / `sheetLayout` / `skinVariant` into the
// database. Two reasons. The pickers are the path a player takes, so anything broken about *applying* a
// choice shows up here too; and a script that mutates characters to take pictures of them is a script that
// eventually mutates the wrong one.
//
// Usage:
//   node scripts/contact-sheet.mjs --character <id>
//   node scripts/contact-sheet.mjs --character <id> --axis themes --width 390
//
//   --axis formats  (default) every skin × every format, at the character's current theme
//   --axis themes             every skin × every theme, in Classic
//   --axis all                every skin × format × theme — 100 cells, slow, for a full review
//   --axis rollers            every skin × theme × ROLLER TEMPLATE (P14-9) — opens the dock, picks each
//                             of the four rollers, photographs the DOCK, and measures contrast scoped to
//                             it. This is the axis for "the rollers are hard to read".
//
// Output: .audit/contact/<axis>-<width>/index.html
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { detectOverflow } from './lib/overflow.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const BASE = arg('base', 'http://localhost:3001');
const CHARACTER = arg('character', '');
const AXIS = arg('axis', 'formats');
const WIDTH = Number(arg('width', '1280'));
const HEIGHT = Number(arg('height', '900'));

if (!CHARACTER) {
  console.error('Need --character <id>. Pick one from /dnd/characters.');
  process.exit(2);
}

const OUT = path.join('.audit', 'contact', `${AXIS}-${WIDTH}`);
fs.mkdirSync(OUT, { recursive: true });

// ── THE ROLLER AXIS (P14-9) ──────────────────────────────────────────────────────────────────────────
//
// Owner: *"some of the styling for the rollers … is hard to read and understand. And some of the
// animations and roller templates look bad."* A screen recording was supplied that could not be opened,
// and the slice's own instruction is **do not guess from the description** — so this measures instead.
//
// The roller is a FOURTH axis, chosen independently of the sheet template, and it had no coverage here at
// all: every existing cell screenshots a sheet with the dock CLOSED. Four templates × five skins × their
// themes is exactly the sort of matrix this file already exists to make judgeable.
//
// Two things make the roller different from a sheet cell, and both are why this is a mode rather than one
// more value in the `formats` loop:
//   · The dock has to be OPENED, and each template picked on the roller's own picker, not the page's.
//   · Contrast must be scoped to the dock. Measured across the whole page, a dozen unreadable labels
//     inside a floating panel vanish into a denominator of several hundred — which is very likely why a
//     defect the owner can see on a video has never appeared in this tool's output.
const ROLLER_NAMES = ['Dice Core', 'Sigil Stack', 'Roll Board', 'Impact'];
/** The dock's own element. `.fld` is the floating-roller container (see `floatingRoller.css`); the
 *  `roller-tab-contrast` test's whole history is about this element resolving a near-WHITE gradient on a
 *  light skin, so it is the right thing to both photograph and measure. */
const ROLLER_ROOT = '.fld';
const CONTRAST_ROOT = AXIS === 'rollers' ? ROLLER_ROOT : null;

/**
 * Click a picker chip and CONFIRM it took, by polling its own `aria-pressed`.
 *
 * The first version clicked and waited 500ms. That is a race, and it did not merely make the run flaky —
 * it made the OUTPUT LIE: a cell written to `candy-bazaar__classic.jpeg` actually showed Magical Streamer
 * selected, because choosing a skin re-renders the picker (each skin has its own theme list, see below)
 * and the click landed on a stale node. A contact sheet whose filenames do not match its pictures is worse
 * than no contact sheet, because every judgement made from it is attached to the wrong cell.
 */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Is `label`'s chip currently the selected one? Tolerates being asked mid-navigation. */
async function isSelected(page, label) {
  try {
    return await page.evaluate(
      (text) => [...document.querySelectorAll('button')]
        .some((b) => (b.textContent || '').trim() === text && b.getAttribute('aria-pressed') === 'true'),
      label,
    );
  } catch {
    // "Execution context was destroyed" — a theme click refreshes the route. Not an answer, so poll again.
    return false;
  }
}

async function pick(page, label) {
  // `hasText` matches the element's whole textContent. `button:text-is(…)` — the obvious choice — does
  // NOT: it only considers text held directly by the element, and the TEMPLATE chips wrap their label in
  // a child node. It silently matched ZERO buttons for "Classic" while matching "Hextech" fine, because
  // the STYLE chips do hold their text directly. A selector that finds four of five pickers is worse than
  // one that finds none.
  const btn = page.locator('button').filter({ hasText: new RegExp(`^\\s*${escapeRe(label)}\\s*$`) }).first();
  if (await btn.count() === 0) return false;
  if (await isSelected(page, label)) return true;

  try {
    await btn.click({ timeout: 5000 });
  } catch {
    return false;
  }

  // Polled rather than waited on with `waitForFunction`, because CHOOSING A THEME REFRESHES THE ROUTE and
  // a single long-lived evaluation dies with "Execution context was destroyed" at exactly the moment the
  // choice is being applied. Re-asking is cheap; a false negative here throws away a good cell.
  for (let i = 0; i < 40; i += 1) {
    if (await isSelected(page, label)) {
      await page.waitForTimeout(250); // tokens cascade on the next paint; a shell swap is a remount
      return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

/** The picker's current options, read live. THEMES ARE PER-SKIN — Hextech offers five (Hextech Gold …
 *  Void Prophet), Magical Streamer offers two (Bubblegum, Aqua) — so the theme list must be re-read after
 *  each skin rather than collected once. The plan's "N skins × M themes" was the wrong shape. */
const readAxes = (page) => page.evaluate(() => {
  const group = (label) => {
    const head = [...document.querySelectorAll('*')]
      .find((e) => (e.textContent || '').trim().startsWith(`${label} //`) && e.children.length === 0);
    return head ? [...head.parentElement.querySelectorAll('button')].map((b) => (b.textContent || '').trim()) : [];
  };
  return { skins: group('STYLE'), formats: group('TEMPLATE'), themes: group('THEME') };
});

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });

// The pickers only render for someone who can WRITE the sheet, so a fresh context sees a read-only page
// with no controls to drive. Pass the session cookie in (`--cookie "$(…)"`, or DND_SESSION in the env);
// it is read from a signed-in browser's `document.cookie`.
const SESSION = arg('cookie', process.env.DND_SESSION || '');
if (SESSION) {
  const url = new URL(BASE);
  await context.addCookies([{ name: 'dnd_session', value: SESSION, domain: url.hostname, path: '/' }]);
}

const page = await context.newPage();
// NOT `networkidle`: the sheet holds a realtime channel open, so the network never goes idle and the
// navigation times out at 60s having actually loaded fine. Wait for the picker itself — the thing this
// script needs — which is both faster and a real readiness signal.
await page.goto(`${BASE}/dnd/characters/${CHARACTER}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
try {
  await page.getByText('STYLE //').first().waitFor({ timeout: 20000 });
} catch {
  console.error('No STYLE picker after 20s — not signed in, or not a sheet you can edit. Pass --cookie.');
  await browser.close();
  process.exit(1);
}

const axes = await readAxes(page);
if (!axes.skins.length || !axes.formats.length) {
  console.error('Could not find the STYLE/TEMPLATE pickers — is this a sheet you can edit?');
  process.exit(1);
}
console.log(`skins: ${axes.skins.length}  formats: ${axes.formats.length}`);

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const shots = [];
const skipped = [];

// Skin is the OUTER loop and its themes are read after it is applied, because the theme list belongs to
// the skin: Hextech offers five, Magical Streamer offers two. Collecting themes once from the starting
// skin and replaying them everywhere would ask four skins for options they do not have.
/**
 * Open the floating roller dock, and wait for its TEMPLATE BAR to be visible.
 *
 * THE TEST IS VISIBILITY OF THE BAR, NOT EXISTENCE OF `.fld`, and that distinction is the whole bug this
 * function was written wrong around twice. A MINIMIZED dock collapses to a corner dice FAB (`floatingRoller.css`,
 * "minimized: the bottom-right dice FAB") but **`.fld` still exists in the DOM** — so an existence check
 * returns "already open", the opener is never clicked, and every subsequent chip click fails with
 * "element is not visible". That is what skipped all 100 cells on three consecutive runs while reporting
 * a picker problem, which is a confident wrong answer about the wrong component.
 */
async function openRollerDock(page) {
  const bar = page.locator('[aria-label="Roller style"]').first();
  if (await bar.isVisible().catch(() => false)) return true;
  const opener = page.locator('[aria-label^="Open "]').first();
  if (await opener.count()) await opener.click({ timeout: 4000 }).catch(() => {});
  return bar.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
}

/** Pick a roller template on the roller's OWN picker (`aria-label="Roller style"`), confirming it took.
 *  Scoped to that bar rather than to the page, because the sheet's format chips are also `aria-pressed`
 *  buttons and a page-wide text match would happily press the wrong one. */
async function pickRoller(page, label) {
  const bar = page.locator('[aria-label="Roller style"]');
  if (!(await bar.count())) return false;
  // MATCHED ON `title`, not on the accessible name, and that is the third selector this needed. The
  // chips render "⬡ Dice Core" on a freshly-loaded sheet — but after a skin or format switch they come
  // back ICON-ONLY, with empty `innerText`, so every name-based match found nothing and all 40 cells
  // skipped with "would not apply". `title={`${label} — ${blurb}`}` is set unconditionally in
  // `RollerTemplateBar.tsx` and survives that collapse, so it is the one stable hook.
  const chip = bar.locator(`button[title^="${label}"]`).first();
  if (!(await chip.count())) return false;
  await chip.click({ timeout: 4000 }).catch(() => {});
  // POLLED, exactly like `pick()` above and for the same reason: the click lands before React commits, so
  // reading `aria-pressed` once immediately after it returns `false` for a chip that is about to be
  // pressed. Reading it once is what made the second run of this axis skip all 40 cells.
  for (let i = 0; i < 20; i += 1) {
    const on = await chip.getAttribute('aria-pressed').catch(() => null);
    if (on === 'true') return true;
    await page.waitForTimeout(150);
  }
  return false;
}

for (const skin of axes.skins) {
  if (!(await pick(page, skin))) { skipped.push(`${skin} (skin would not apply)`); continue; }
  const themes = AXIS === 'formats' ? [null] : (await readAxes(page)).themes;
  const formats = AXIS === 'themes' || AXIS === 'rollers' ? [axes.formats[0]] : axes.formats;
  if (AXIS !== 'formats') console.log(`  ${skin}: ${themes.length} theme(s) — ${themes.join(', ')}`);

  const rollers = AXIS === 'rollers' ? ROLLER_NAMES : [null];
  for (const format of formats) for (const theme of themes) for (const roller of rollers) {
  const cell = { skin, format, theme, roller };
  const name = [slug(skin), slug(format), theme ? slug(theme) : '', roller ? slug(roller) : ''].filter(Boolean).join('__');
  process.stdout.write(`  ${name} … `);
  try {
    // Re-asserted every cell: switching format or theme can remount the picker and drop the skin.
    if (!(await pick(page, skin)) || !(await pick(page, format)) || (theme && !(await pick(page, theme)))) {
      // NOT screenshotted. A cell whose pickers did not take is a picture of some other cell, and a
      // mislabelled picture in a contact sheet is worse than a gap — every judgement drawn from it lands
      // on the wrong combination. This is exactly how the first run produced a "Candy Bazaar" cell
      // showing Magical Streamer.
      skipped.push(name);
      console.log('SKIPPED — picker did not take');
      continue;
    }
    // Belt and braces: read back what the page says is selected, and record THAT. `pick` already waited
    // for each chip, but the three interact — and the whole failure this rewrite exists to prevent was a
    // filename asserting something the picture contradicted.
    const live = await page.evaluate(() => {
      const on = [...document.querySelectorAll('button')]
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => (b.textContent || '').trim());
      return on;
    });
    for (const want of [skin, format, theme].filter(Boolean)) {
      if (!live.includes(want)) throw new Error(`page shows [${live.join(', ')}], not "${want}"`);
    }

    // P14-9 — on the roller axis, open the dock and select this cell's template BEFORE the shot, and
    // photograph the DOCK rather than the page. A full-page screenshot of a sheet with a small panel
    // floating over it is not a picture anyone can judge a roller from.
    let rollerShot = null;
    if (AXIS === 'rollers') {
      if (!(await openRollerDock(page))) { skipped.push(`${name} — roller dock would not open`); console.log('SKIPPED — no dock'); continue; }
      if (!(await pickRoller(page, cell.roller))) { skipped.push(`${name} — roller "${cell.roller}" would not apply`); console.log('SKIPPED — roller did not take'); continue; }
      // The templates animate in. Without a settle the shot catches a half-played tumble and every cell
      // looks "bad" for a reason that is the harness's fault rather than the design's.
      await page.waitForTimeout(700);
      rollerShot = page.locator(ROLLER_ROOT).first();
    }

    const file = path.join(OUT, `${name}.jpeg`);
    await (rollerShot ?? page).screenshot({ path: file, type: 'jpeg', quality: 78 });

    // THE FINGERPRINT IS WHAT MAKES P11-3/P11-4 CHECKABLE. "Are my five skins actually different" and
    // "does this theme change anything" are questions about resolved colour, and reading them off the
    // page beats squinting at a hundred JPEGs — two cells that resolve to identical tokens ARE identical,
    // whatever the picker claims. Collisions are reported at the end.
    const tokens = await page.evaluate((rollerSel) => {
      // `[class*="skin-"]` is where the tokens are actually DEFINED. The first version probed
      // `.sheet-shell`, which does not exist on this page, so every cell fell back to `document.body` —
      // and body inherits nothing, so all 22 cells fingerprinted identically and the tool cheerfully
      // reported that five visibly different skins were the same. A probe that misses is not a null
      // result, it is a confident wrong answer.
      // ON THE ROLLER AXIS, FINGERPRINT THE DOCK. The four rollers share one sheet, so a skin-rooted
      // fingerprint is byte-identical across all four of them and the collision report screams that 20
      // visibly different cells "resolve IDENTICALLY" — a confident wrong answer of exactly the kind the
      // note below was written about, just from the other direction. Rooted at the dock it answers the
      // question the roller axis is actually for: *do the four templates resolve differently at all?*
      const root = (rollerSel ? document.querySelector(rollerSel) : null)
        ?? document.querySelector('[class*="skin-"]') ?? document.querySelector('.sheet-shell') ?? document.body;
      const cs = getComputedStyle(root);
      const vars = ['--hx-gold-1', '--hx-gold-2', '--hx-teal-1', '--hx-text', '--hx-muted', '--hx-line', '--hx-bg-0', '--hx-font-display'];
      const out = {
        // The skin class itself: if two cells share it, the skin never changed, whatever the chip says.
        skinClass: (String(root.className).match(/skin-[\w-]+/) ?? ['(none)'])[0],
        bg: cs.backgroundColor,
        fg: cs.color,
      };
      for (const v of vars) { const got = cs.getPropertyValue(v).trim(); if (got) out[v] = got; }
      return out;
    }, AXIS === 'rollers' ? ROLLER_ROOT : null);

    // THE LAYOUT FINGERPRINT (P11-2) — the structural twin of the token fingerprint above. "Do Classic,
    // Codex, Dashboard and Play actually differ in LAYOUT, or only in decoration" is answerable the same
    // way: measure the arrangement rather than squinting at it. Two formats that put the same panels in
    // the same number of columns at the same page height ARE the same format wearing two names.
    const layout = await page.evaluate(() => {
      const root = document.querySelector('[class*="skin-"]') ?? document.body;
      const tracks = (el) => {
        const t = getComputedStyle(el).gridTemplateColumns;
        return t && t !== 'none' ? t.split(' ').length : 0;
      };
      // The widest multi-column grid anywhere in the sheet: a card grid and a two-pane rail differ here
      // even when the outermost wrapper is a single column in both.
      let maxCols = 0;
      let grids = 0;
      root.querySelectorAll('*').forEach((el) => {
        const n = tracks(el);
        if (n > 1) { grids += 1; maxCols = Math.max(maxCols, n); }
      });
      const vis = (el) => el.getBoundingClientRect().height > 0;
      const sections = [...root.querySelectorAll('section')];
      return {
        rootCols: tracks(root),
        maxCols,
        multiColGrids: grids,
        sections: sections.length,
        // How many panels are on screen AT ONCE. This is the real difference between a tabbed format
        // (one at a time) and a dashboard (all of them) — and it is invisible to a colour fingerprint.
        visibleSections: sections.filter(vis).length,
        // Page height stands in for density: stacking everything is tall, tiling it is short.
        height: document.documentElement.scrollHeight,
      };
    });

    // CONTRAST (P11-4). Lifted from `docs/planning/qa-evidence/contrast-sweep.md`, which is the repo's
    // hard-won method — fourteen documented ways a browser colour measurement lies, most of them found by
    // acting on a wrong number. Reused rather than rewritten precisely because a naive `color` vs
    // `background-color` probe is one of the fourteen: it read `rgba(0,0,0,0.08)` as pure black and
    // flagged 42 healthy samples.
    //
    // Per cell rather than per skin, because P11-3 changed what a theme does: the accents are now clamped
    // against each SKIN's ground, so the pairing that has to hold is (skin × theme × format), and only a
    // sweep of the whole matrix can show it does.
    const contrast = await page.evaluate((rootSel) => {
      const parse = (c) => { const m = (c || '').match(/[\d.]+/g); if (!m || m.length < 3) return null;
        return { r: +m[0], g: +m[1], b: +m[2], a: m[3] != null ? +m[3] : 1 }; };
      const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
      // (1) `background-image` counts — a gradient surface is opaque, and skipping it composites text onto
      // whatever sits behind the panel, inventing failures.
      const fromImage = (bi) => {
        if (!bi || bi === 'none') return null;
        const stops = (bi.match(/rgba?\([^)]+\)/g) || []).map(parse).filter((s) => s && s.a > 0.5);
        return stops.length ? stops[0] : null;
      };
      const bgOf = (el) => {
        const stack = []; let n = el;
        while (n && n !== document.documentElement) {
          const s = getComputedStyle(n);
          const img = fromImage(s.backgroundImage);
          if (img) { stack.push(img); if (img.a >= 1) break; }
          const c = parse(s.backgroundColor);
          if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
          n = n.parentElement;
        }
        let out = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = stack.length - 1; i >= 0; i -= 1) out = over(stack[i], out); // (2) composite the STACK
        return out;
      };
      const lum = (c) => { const f = [c.r, c.g, c.b].map((v) => { const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
      const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg);
        return +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)); };
      // (3) rendered means rendered — ancestors, content-visibility and zero-size boxes included. 26–34%
      // of leaf text nodes on these sheets are NOT on screen; every count taken without this is inflated.
      const isRendered = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true)
        && el.getClientRects().length > 0;
      // (6) a CLOSED <details> still yields layout boxes; its contents are on nobody's screen.
      const inClosedDetails = (el) => {
        let n = el.parentElement;
        while (n && n !== document.documentElement) {
          if (n.tagName === 'DETAILS' && !n.hasAttribute('open') && !el.closest('summary')) return true;
          n = n.parentElement;
        }
        return false;
      };
      // SCOPED, since P14-9. The sweep measured the whole page, which is right for a sheet cell and wrong
      // for a roller: the dock is a few dozen elements floating over a page of hundreds, so its failures
      // were a rounding error in the denominator and never surfaced. Rooting the probe at the dock is what
      // makes "the roller is hard to read" answerable at all. `?? document` rather than an empty result —
      // a probe that misses is a confident wrong answer, which is note (3) of this file's own method.
      const scope = rootSel ? (document.querySelector(rootSel) ?? document) : document;
      const rows = [...scope.querySelectorAll('*')]
        .filter((e) => e.children.length === 0 && (e.innerText || '').trim().length > 1)
        .filter((e) => isRendered(e) && !inClosedDetails(e))
        .map((e) => { const cs = getComputedStyle(e);
          // (5) gradient-clipped text: the glyphs are painted by the background, not by `color`.
          if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') return null;
          const fg = parse(cs.color); if (!fg) return null;
          const bg = bgOf(e);
          const eff = fg.a < 1 ? over(fg, bg) : fg;
          const size = parseFloat(cs.fontSize) || 16;
          const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
          // WCAG AA is 4.5 for body but 3 for large (>=24px, or >=18.66px bold) — a 23px headline at 3.85
          // is a real miss while the same colour at 24px is fine.
          const need = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
          const r = ratio(eff, bg);
          return { r, need, pass: r >= need, size: Math.round(size), text: (e.innerText || '').trim().slice(0, 28) };
        })
        .filter(Boolean)
        .sort((a, b) => a.r - b.r);
      const fails = rows.filter((x) => !x.pass);
      // The denominator ships with the verdict: "0 failing" is meaningless if it sampled 0 elements.
      return { sampled: rows.length, failing: fails.length, worst: fails.slice(0, 4) };
    }, CONTRAST_ROOT);

    // Overflow is measured per cell too: a format can be fine at one skin and broken at another, and this
    // is the cheapest place to notice. Uses the SHARED detector — this file's own copy knew about scroll
    // containers and `position: fixed` but not about closed `<details>` or inline union rects, so the two
    // scripts disagreed about the same page.
    const { count: overflow } = await page.evaluate(detectOverflow);
    shots.push({ ...cell, file: path.basename(file), overflow, tokens, layout, contrast });
    const notes = [
      overflow ? `OVERFLOW ${overflow}` : '',
      contrast?.failing ? `contrast ${contrast.failing}/${contrast.sampled}` : '',
    ].filter(Boolean);
    console.log(notes.length ? notes.join(' · ') : `ok (${contrast?.sampled ?? 0} sampled)`);
  } catch (e) {
    skipped.push(`${name} — ${e.message.split('\n')[0]}`);
    console.log(`error: ${e.message.split('\n')[0]}`);
  }
  }
}

await browser.close();

// A browsable index. Grouped by skin so the question "do my five skins actually look different" is one
// glance down a column rather than a hundred file names.
const bySkin = new Map();
for (const s of shots) bySkin.set(s.skin, [...(bySkin.get(s.skin) ?? []), s]);
const html = `<!doctype html><meta charset="utf-8"><title>Sheet contact sheet — ${AXIS} @ ${WIDTH}px</title>
<style>
 body{background:#0b0a14;color:#eee;font:14px/1.5 system-ui,sans-serif;margin:24px}
 h1{font-size:18px} h2{font-size:15px;color:#d4af37;margin:28px 0 8px;border-bottom:1px solid #333;padding-bottom:4px}
 .row{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
 figure{margin:0} img{width:100%;border:1px solid #333;border-radius:6px;display:block}
 figcaption{font-size:12px;color:#aaa;margin-top:5px}
 .bad{color:#ff6b6b;font-weight:700}
 .sw{display:flex;gap:3px;margin-top:4px} .sw i{width:16px;height:10px;border-radius:2px;border:1px solid #0006}
</style>
<h1>Sheet contact sheet — axis <b>${AXIS}</b> at <b>${WIDTH}px</b> · ${shots.length} cells</h1>
<p style="color:#aaa">Overflow counts use the P11-1 detector: viewport escapes that are <em>not</em> inside a scroll container.</p>
${[...bySkin.entries()].map(([skin, list]) => `<h2>${skin}</h2><div class="row">${list.map((s) => `
  <figure><img loading="lazy" src="${s.file}" alt="${skin} ${s.format} ${s.theme ?? ''}">
  <figcaption>${s.format}${s.theme ? ` · ${s.theme}` : ''} ${s.overflow ? `<span class="bad">· ${s.overflow} overflowing</span>` : ''}
  <span class="sw">${Object.values(s.tokens ?? {}).filter((v) => /^(#|rgb)/.test(v)).map((v) => `<i style="background:${v}" title="${v}"></i>`).join('')}</span>
  </figcaption></figure>`).join('')}</div>`).join('')}
`;
fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');

const broken = shots.filter((s) => s.overflow);
console.log(`\nWrote ${shots.length} cells → ${path.join(OUT, 'index.html')}`);
if (broken.length) {
  console.log(`${broken.length} cell(s) overflow:`);
  for (const b of broken) console.log(`  ${b.skin} · ${b.format}${b.theme ? ` · ${b.theme}` : ''} — ${b.overflow}`);
}
// Printed loudly rather than swallowed: a short run that looks clean because it silently shot fewer cells
// is the failure mode this script is meant to be trusted against.
if (skipped.length) {
  console.log(`\n${skipped.length} cell(s) NOT captured:`);
  for (const s of skipped) console.log(`  ${s}`);
}

// --- Contrast (P11-4) ---------------------------------------------------------------------------------
const sampled = shots.reduce((n, s) => n + (s.contrast?.sampled ?? 0), 0);
const failingCells = shots.filter((s) => s.contrast?.failing);
console.log(`\nContrast: ${sampled} text elements sampled across ${shots.length} cells.`);
if (failingCells.length) {
  console.log(`  ${failingCells.length} cell(s) with at least one element under its WCAG AA threshold:`);
  for (const s of failingCells) {
    console.log(`    ${s.skin} · ${s.format}${s.theme ? ` · ${s.theme}` : ''} — ${s.contrast.failing}/${s.contrast.sampled}`);
    for (const w of s.contrast.worst) console.log(`        ${w.r} (needs ${w.need}, ${w.size}px) "${w.text}"`);
  }
  // The signal is the SAME element failing everywhere — that is a token problem, not a theme problem.
  const byText = new Map();
  for (const s of failingCells) for (const w of s.contrast.worst) byText.set(w.text, (byText.get(w.text) ?? 0) + 1);
  const everywhere = [...byText.entries()].filter(([, n]) => n >= Math.max(2, failingCells.length * 0.6));
  if (everywhere.length) {
    console.log('  failing across most cells (suspect a TOKEN, not a pairing):');
    for (const [t, n] of everywhere) console.log(`    "${t}" — ${n} cells`);
  }
} else {
  console.log('  no element below its threshold in any cell.');
}

// --- What the fingerprints say (P11-3 / P11-4) --------------------------------------------------------
// Reported, never enforced. Identical tokens across two cells is strong evidence of a gap, but a theme is
// allowed to differ in ways these seven variables do not capture, so this prints and the human decides.
// APPEARANCE ONLY — `skinClass` is deliberately excluded. Including it was a self-deception: it made five
// skins fingerprint as five distinct cells while four of them resolved to byte-identical colour and type,
// because the *identifier* differed even though nothing a player can see did. Identity is reported
// separately below; a fingerprint that answers "is this a different skin" when you asked "does this look
// different" is the same mistake as probing the wrong element.
const fp = (s) => { const { skinClass, ...look } = s.tokens ?? {}; return JSON.stringify(look); };
const byFingerprint = new Map();
for (const s of shots) byFingerprint.set(fp(s), [...(byFingerprint.get(fp(s)) ?? []), s]);
const collisions = [...byFingerprint.values()].filter((g) => g.length > 1);

// Written out so a later run can be diffed against this one, and so "did my restyle actually change
// anything" is a `git diff` rather than a memory of what the screenshots looked like.
fs.writeFileSync(
  path.join(OUT, 'tokens.json'),
  `${JSON.stringify(shots.map(({ skin, format, theme, tokens, layout, contrast, overflow }) => ({
    skin, format, theme, overflow, layout, contrast, ...tokens,
  })), null, 2)}\n`,
  'utf8',
);

console.log('\nToken fingerprints:');
console.log(`  ${byFingerprint.size} distinct across ${shots.length} cells`);

// P11-2: HOLDING THE SKIN FIXED, do the formats differ STRUCTURALLY? Reported per skin because a format
// is allowed to collapse to one column on a narrow viewport — at 1280px it should not.
const skinsSeen = [...new Set(shots.map((s) => s.skin))];
if (shots.some((s) => s.layout)) {
  console.log('\nLayout (P11-2) — per skin, one line per format:');
  for (const sk of skinsSeen) {
    const group = shots.filter((s) => s.skin === sk && s.layout);
    if (group.length < 2) continue;
    console.log(`  ${sk}`);
    for (const s of group) {
      const l = s.layout;
      console.log(`    ${String(s.format).padEnd(11)} cols=${l.maxCols} grids=${l.multiColGrids} sections=${l.visibleSections}/${l.sections} height=${l.height}`);
    }
    const shapes = new Map();
    for (const s of group) {
      // Height is excluded: it varies with content, and two formats differing only in page length are
      // the same arrangement. Arrangement is columns × grid count × how many panels are on screen.
      const k = `${s.layout.maxCols}|${s.layout.multiColGrids}|${s.layout.visibleSections}`;
      shapes.set(k, [...(shapes.get(k) ?? []), s.format]);
    }
    for (const g of [...shapes.values()].filter((x) => x.length > 1)) {
      console.log(`      SAME SHAPE: ${g.join(', ')}`);
    }
  }
}

// The sharper question than "are all cells distinct": HOLDING THE THEME FIXED, do the skins differ? A
// skin that only moves when the theme moves is not a skin.
const themes = [...new Set(shots.map((s) => s.theme))];
for (const t of themes) {
  const group = shots.filter((s) => s.theme === t);
  if (group.length < 2) continue;
  const classes = new Set(group.map((s) => s.tokens?.skinClass));
  const palettes = new Map();
  for (const s of group) palettes.set(fp(s), [...(palettes.get(fp(s)) ?? []), s.skin]);
  const twins = [...palettes.values()].filter((g) => g.length > 1);
  console.log(`  theme "${t}": ${group.length} skins, ${classes.size} skin class(es) → ${palettes.size} distinct palette(s)`);
  for (const g of twins) console.log(`      identical: ${g.join(', ')}`);
}
if (collisions.length) {
  console.log(`  ${collisions.length} group(s) of cells that resolve IDENTICALLY:`);
  for (const g of collisions) {
    console.log(`    · ${g.map((s) => `${s.skin}/${s.format}${s.theme ? `/${s.theme}` : ''}`).join('  ==  ')}`);
  }
} else {
  console.log('  no two cells resolve identically.');
}

process.exitCode = broken.length || skipped.length || failingCells.length ? 1 : 0;
