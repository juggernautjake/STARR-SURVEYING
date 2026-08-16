// scripts/cad-panels-at-390.mjs — C45, drive every CAD panel on a phone.
//
// D5b of the previous doc: **the alignment audit cannot see a Save button under a dock, or an
// Escape that does nothing.** It measures geometry on a page as loaded; a panel that only exists
// after a menu click is invisible to it, and "this control is 4px out" is not the question anyway.
// The question here is whether the thing can be USED at 390px.
//
// So this opens each panel the way the product opens it — by dispatching the `cad:open…` event the
// menu bar dispatches — and asks four things a person would notice immediately:
//
//   OPENS         did anything appear at all?
//   FITS          does it stay inside 390px, or does the phone scroll sideways?
//   ACTIONABLE    is its primary action reachable — on screen, or scrollable to?
//   ESCAPES       does Escape close it, or is the surveyor trapped?
//
// ── WHY THESE FOUR AND NOT A SCREENSHOT DIFF ────────────────────────────────────────────────────
//
// A screenshot tells you something changed, not whether anybody can finish the job. Each check
// below is a sentence a surveyor would say out loud: "it opened off the side of the screen", "I
// can't reach Save", "I can't get out of this". C13's click-order contract reduced "intuitive" to
// four answerable questions for the same reason.
//
// ── THE ACTIONABLE CHECK IS DELIBERATELY GENEROUS ───────────────────────────────────────────────
//
// A button below the fold inside a scrollable panel is fine — phones scroll. It is only a defect
// when it cannot be reached AT ALL: outside the viewport with no scrollable ancestor between it and
// the panel. Being strict here would flag every long form on every phone and train a reader to
// ignore the result, which is the failure mode C27's instrument hit four times.
//
// Usage: node --env-file=.env.local scripts/cad-panels-at-390.mjs [--width 390] [--json]

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = argValue('--base') ?? 'http://127.0.0.1:3040';
const WIDTH = Number(argValue('--width') ?? '390');
const HEIGHT = Number(argValue('--height') ?? '844');
const OUT = argValue('--out') ?? 'docs/planning/qa-evidence';
const TAG = argValue('--tag') ?? 'c45';
const SHOTS = process.argv.includes('--shot');
const ADMIN_EMAIL = argValue('--as') ?? 'jacobmaddux@starr-surveying.com';

/** Every panel `CADLayout` listens for, read from the layout so this cannot drift from the product. */
function openEvents() {
  const src = fs.readFileSync('app/admin/cad/CADLayout.tsx', 'utf8');
  return [...new Set([...src.matchAll(/addEventListener\(\s*'(cad:open[A-Za-z]*)'/g)].map((m) => m[1]))].sort();
}

/**
 * Some panels need a subject. Opening a feature dialog with no feature is not a phone defect, it is
 * a test that did not set the scene — so those get a detail payload built from whatever the drawing
 * holds. Where nothing sensible exists, the panel is reported as SKIPPED with the reason rather
 * than passed silently.
 */
const NEEDS_SUBJECT = {
  'cad:openFeatureDialog': 'a feature id',
  'cad:openFeatureLabelPrefs': 'a feature id',
  'cad:openLayerPrefs': 'a layer id',
  'cad:openBranchDialog': 'a drawing to branch from',
};

/** Selector for anything that could be a panel. Deliberately wide; the diff below does the work. */
const PANEL_SEL = '[role="dialog"], .cad-modal, .cad-panel, [class*="Modal"], [class*="modal"], [class*="dialog"]';

/**
 * Mark every panel that is ALREADY on screen, so the measurement afterwards can tell what this
 * dispatch actually opened.
 *
 * **This is the second version of the probe and the first one that measures the right element.**
 * Version one took "the innermost visible panel" and reported `"Suggest as ghost"` as the primary
 * action of three unrelated dialogs — because the first panel to stay open was measured again for
 * every dispatch that followed, and every subsequent "Escape did not close it" was that same stale
 * panel refusing to disappear. Seven dialogs were called defective by a probe reading one of them.
 *
 * A set difference cannot make that mistake: whatever has no mark is what just appeared.
 */
const MARK_EXISTING = (sel) => {
  document.querySelectorAll(sel).forEach((el) => el.setAttribute('data-c45-pre', '1'));
  return document.querySelectorAll(sel).length;
};

const MEASURE = ([viewportW, viewportH, sel]) => {
  const isShown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 40 && r.height > 40 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  // Only what appeared since MARK_EXISTING ran.
  const fresh = [...document.querySelectorAll(sel)].filter((el) => !el.hasAttribute('data-c45-pre') && isShown(el));
  if (fresh.length === 0) return { opened: false };

  // Among the new elements, take the innermost — a backdrop wraps the panel, and measuring the
  // backdrop reports "fits perfectly" for every dialog ever written.
  let panel = fresh[0];
  for (const el of fresh) if (panel.contains(el) && el !== panel) panel = el;
  const r = panel.getBoundingClientRect();

  const scrollableAncestor = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflow) && n.scrollHeight > n.clientHeight + 4) return true;
      n = n.parentElement;
    }
    return false;
  };

  const buttons = [...panel.querySelectorAll('button, [role="button"], input[type=submit]')]
    .filter((b) => {
      const br = b.getBoundingClientRect();
      return br.width > 1 && br.height > 1;
    });

  // Primary action = the last button that is not obviously a dismiss. Dialogs in this codebase put
  // the confirm on the right/bottom of the footer, so the last one is the right guess far more
  // often than the first.
  const isDismiss = (b) => /close|cancel|dismiss|×|✕/i.test((b.textContent ?? '') + (b.getAttribute('aria-label') ?? ''));
  const actions = buttons.filter((b) => !isDismiss(b));
  const primary = actions[actions.length - 1] ?? buttons[buttons.length - 1] ?? null;

  const reachable = (el) => {
    if (!el) return null;
    const br = el.getBoundingClientRect();
    const onScreen = br.left >= -2 && br.right <= viewportW + 2 && br.top >= -2 && br.bottom <= viewportH + 2;
    return onScreen || scrollableAncestor(el);
  };

  return {
    opened: true,
    panel: panel.className ? `${panel.tagName.toLowerCase()}.${String(panel.className).split(/\s+/)[0]}` : panel.tagName.toLowerCase(),
    rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    overflowRight: +Math.max(0, r.right - viewportW).toFixed(1),
    overflowLeft: +Math.max(0, -r.left).toFixed(1),
    docScrollW: document.documentElement.scrollWidth,
    buttons: buttons.length,
    primaryText: primary ? (primary.textContent ?? '').trim().slice(0, 40) : null,
    primaryReachable: reachable(primary),
  };
};

async function main() {
  const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
  if (!secret) throw new Error('AUTH_SECRET is not set — run with --env-file=.env.local');
  const token = await encode({
    token: {
      email: ADMIN_EMAIL, name: 'CAD Phone QA', roles: ['admin', 'developer'], role: 'admin',
      sub: 'cad-phone-qa', rolesLastChecked: Math.floor(Date.now() / 1000),
    },
    secret, salt: 'authjs.session-token', maxAge: 60 * 60 * 6,
  });

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addCookies([{
    name: 'authjs.session-token', value: token,
    domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: false,
  }]);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/admin/cad`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForTimeout(6000); // the canvas + stores settle before any panel is meaningful

  const events = openEvents();
  const results = [];

  for (const ev of events) {
    const row = { event: ev };
    if (NEEDS_SUBJECT[ev]) {
      // Try to supply one from the live document rather than skipping outright.
      const detail = await page.evaluate(() => {
        const w = window;
        const st = w.__CAD_TEST_STORES__?.drawing?.getState?.();
        const doc = st?.document;
        if (!doc) return null;
        const fid = Object.keys(doc.features ?? {})[0] ?? null;
        const lid = (doc.layerOrder ?? [])[0] ?? Object.keys(doc.layers ?? {})[0] ?? null;
        return { featureId: fid, layerId: lid };
      });
      if (!detail || (!detail.featureId && !detail.layerId)) {
        row.status = 'SKIPPED';
        row.reason = `needs ${NEEDS_SUBJECT[ev]}; the blank drawing has none`;
        results.push(row);
        continue;
      }
      row.detail = detail;
    }

    await page.evaluate(MARK_EXISTING, PANEL_SEL);
    await page.evaluate(
      ([name, detail]) => window.dispatchEvent(new CustomEvent(name, { detail: detail ?? undefined })),
      [ev, row.detail ?? null],
    );
    await page.waitForTimeout(900);

    const m = await page.evaluate(MEASURE, [WIDTH, HEIGHT, PANEL_SEL]).catch(() => ({ opened: false }));
    Object.assign(row, m);

    if (!m.opened) {
      row.status = 'DID-NOT-OPEN';
    } else {
      const problems = [];
      if (m.overflowRight > 2 || m.overflowLeft > 2) {
        problems.push(`spills ${Math.max(m.overflowRight, m.overflowLeft)}px outside 390`);
      }
      if (m.docScrollW > WIDTH + 2) problems.push(`page scrolls sideways to ${m.docScrollW}px`);
      if (m.primaryReachable === false) problems.push(`primary action "${m.primaryText}" cannot be reached`);
      row.problems = problems;
      row.status = problems.length === 0 ? 'OK' : 'DEFECT';
    }

    if (SHOTS && m.opened) {
      await page.screenshot({ path: path.join(OUT, `c45-${ev.replace(/[:]/g, '_')}.png`) }).catch(() => {});
    }

    // ESCAPES — the one check that is about being able to leave.
    if (m.opened) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      const still = await page.evaluate(MEASURE, [WIDTH, HEIGHT, PANEL_SEL]).catch(() => ({ opened: false }));
      row.escapes = !still.opened;
      if (!row.escapes) {
        // Not necessarily a defect — some dialogs deliberately require an explicit choice — but it
        // is always worth knowing, so it is recorded either way and judged by a human.
        row.problems = [...(row.problems ?? []), 'Escape did not close it'];
        if (row.status === 'OK') row.status = 'REVIEW';
      }
    }

    // Whatever happened, the next panel must be measured on a clean page. A dialog left open is how
    // version one of this probe measured the same element seven times.
    const leftOpen = await page.evaluate(
      (sel) => [...document.querySelectorAll(sel)].filter((el) => {
        const r = el.getBoundingClientRect();
        return !el.hasAttribute('data-c45-pre') && r.width > 40 && r.height > 40;
      }).length,
      PANEL_SEL,
    );
    if (leftOpen > 0) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
      await page.waitForTimeout(7000);
    }

    results.push(row);
    console.log(
      `${(row.status ?? '?').padEnd(12)} ${ev.padEnd(32)} ` +
      (row.problems?.length ? row.problems.join('; ') : (row.reason ?? '')),
    );
  }

  const jsonPath = path.join(OUT, `cad-panels-${WIDTH}w-${TAG}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  const tally = results.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  console.log('\n──────── SUMMARY ────────');
  console.log('panels driven :', results.length);
  console.log('by status     :', JSON.stringify(tally));
  console.log('wrote', jsonPath);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
