// scripts/audit-voice-contrast.mjs — every visible word on Andrew's site, measured.
//
// Written after a real bug: the host repo's `globals.css` styles bare elements site-wide, so every
// <h2> on /AndrewAsh inherited a dark navy and rendered nearly invisible on the ink background. It
// was the right typeface and the right size and the wrong colour — invisible to a code review,
// obvious in a browser, and caught by the owner rather than by me.
//
// Reading the CSS cannot find that class of bug, because the colour that renders is the product of a
// cascade from several stylesheets plus inheritance. Only the browser knows. So this walks the real
// rendered page and asks the browser what colour each piece of text actually IS.
//
// ── HOW THE BACKGROUND IS DETERMINED ────────────────────────────────────────────────────────────
//
// The hard part is not the foreground — `getComputedStyle().color` is exact. It is that the element
// behind the text is almost never the text's own element: a <p> is usually `background: transparent`
// over a section over the page. So this walks up the ancestor chain to the first non-transparent
// background and composites any semi-transparent layers it passed on the way.
//
// Text over a PHOTOGRAPH is reported separately rather than failed. There is no single background
// colour there — the hero headline sits over a chapel, and the honest answer is "a human has to look
// at this", not a number. Those elements are listed so they get looked at.
//
// Run:  node scripts/audit-voice-contrast.mjs [--base http://localhost:3211] [--json out.json]

import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = argValue('--base', 'http://localhost:3211');
const JSON_OUT = argValue('--json', null);

const ROUTES = [
  '/AndrewAsh',
  '/AndrewAsh/voice-over',
  '/AndrewAsh/coaching',
  '/AndrewAsh/work',
  '/AndrewAsh/about',
  '/AndrewAsh/contact',
  '/AndrewAsh/login',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

// The function below runs INSIDE the page. It is written as a single self-contained string-able
// function because it cannot close over anything in this module.
function collectContrast() {
  const parseColor = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value || '');
    if (!m) return null;
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };

  // Standard source-over compositing of a translucent layer onto an opaque one.
  const composite = (top, bottom) => ({
    r: Math.round(top.r * top.a + bottom.r * (1 - top.a)),
    g: Math.round(top.g * top.a + bottom.g * (1 - top.a)),
    b: Math.round(top.b * top.a + bottom.b * (1 - top.a)),
    a: 1,
  });

  const luminance = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const ratio = (fg, bg) => {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  const toHex = ({ r, g, b }) =>
    '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');

  /** Walks up for the effective background, compositing translucent layers.
   *  Returns { color, overImage } — overImage means "there is a photo behind this". */
  const effectiveBackground = (el) => {
    const layers = [];
    let node = el;
    let overImage = false;

    while (node && node !== document.documentElement.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        // A gradient scrim is a colour we can approximate; a url() is a photograph we cannot.
        if (cs.backgroundImage.includes('url(')) overImage = true;
      }
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 0.999) break;
      }
      node = node.parentElement;
    }

    // An <img> positioned behind the text (the hero) is a photograph the CSS walk cannot see.
    const rect = el.getBoundingClientRect();
    if (!overImage && rect.width > 0 && rect.height > 0) {
      const behind = document.elementsFromPoint(
        Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2)),
        Math.min(window.innerHeight - 1, Math.max(0, rect.top + Math.min(rect.height / 2, 20))),
      );
      if (behind.some((n) => n.tagName === 'IMG' || n.tagName === 'VIDEO' || n.tagName === 'PICTURE')) {
        overImage = true;
      }
    }

    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      result = layers[i].a >= 0.999 ? layers[i] : composite(layers[i], result);
    }
    return { color: result, overImage };
  };

  const results = [];
  const root = document.querySelector('.vaRoot') || document.body;

  for (const el of root.querySelectorAll('*')) {
    // Only elements with their own visible text — not wrappers, whose textContent is their children's.
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (!own) continue;

    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // Skip the honeypot and anything intentionally transparent (mid-reveal elements read as 0).
    if (parseFloat(cs.opacity) < 0.9) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    // Off-screen-positioned things: the skip link, the spam honeypot.
    if (rect.right < 0 || rect.bottom < 0) continue;

    const fg = parseColor(cs.color);
    if (!fg) continue;

    const { color: bg, overImage } = effectiveBackground(el);

    const sizePx = parseFloat(cs.fontSize) || 16;
    const weight = parseInt(cs.fontWeight, 10) || 400;
    // WCAG "large text": >=24px, or >=18.66px when bold.
    const isLarge = sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);
    const required = isLarge ? 3 : 4.5;

    const value = ratio(fg, bg);

    results.push({
      text: own.slice(0, 70),
      tag: el.tagName.toLowerCase(),
      className: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
      fg: toHex(fg),
      bg: toHex(bg),
      sizePx: Math.round(sizePx * 10) / 10,
      weight,
      isLarge,
      required,
      ratio: Math.round(value * 100) / 100,
      overImage,
      passes: value >= required,
    });
  }

  return results;
}

async function main() {
  const browser = await chromium.launch();
  const failures = [];
  const overImage = [];
  let checked = 0;

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      // Motion off, so nothing is measured mid-fade at an opacity that is not its resting state.
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    for (const route of ROUTES) {
      const url = `${BASE}${route}`;
      let status = 0;
      try {
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        status = response?.status() ?? 0;
      } catch (err) {
        console.error(`  ✗ ${viewport.name} ${route} — navigation failed: ${err.message}`);
        continue;
      }
      if (status >= 400) {
        console.error(`  ✗ ${viewport.name} ${route} — HTTP ${status}`);
        continue;
      }

      // Reveal-on-scroll hides content until it enters the viewport, so an unscrolled page has
      // elements at opacity 0 that the collector would skip. Force them all visible first.
      await page.evaluate(() => {
        document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('vaRevealed'));
      });
      await page.waitForTimeout(250);

      const rows = await page.evaluate(collectContrast);
      checked += rows.length;

      for (const row of rows) {
        if (row.overImage) {
          overImage.push({ route, viewport: viewport.name, ...row });
        } else if (!row.passes) {
          failures.push({ route, viewport: viewport.name, ...row });
        }
      }

      const bad = rows.filter((r) => !r.passes && !r.overImage).length;
      console.log(
        `  ${bad === 0 ? '✓' : '✗'} ${viewport.name.padEnd(7)} ${route.padEnd(26)} ${String(rows.length).padStart(4)} text nodes` +
          (bad ? `  — ${bad} FAIL` : ''),
      );
    }

    await context.close();
  }

  await browser.close();

  console.log(`\n${checked} text nodes measured across ${ROUTES.length} routes × ${VIEWPORTS.length} viewports.\n`);

  if (failures.length) {
    console.log(`── ${failures.length} CONTRAST FAILURES ─────────────────────────────────────────\n`);
    for (const f of failures) {
      console.log(
        `  ${f.ratio.toFixed(2)}:1 (needs ${f.required}) — ${f.route} [${f.viewport}]\n` +
          `      <${f.tag} class="${f.className}"> ${f.fg} on ${f.bg} @ ${f.sizePx}px/${f.weight}\n` +
          `      "${f.text}"\n`,
      );
    }
  } else {
    console.log('✓ Every measurable text node clears WCAG AA.\n');
  }

  if (overImage.length) {
    console.log(
      `── ${overImage.length} text nodes sit over a photograph or gradient ────────────────────\n` +
        '   Contrast cannot be computed against an image. These need a human eye (they are the hero\n' +
        '   headlines and captions, all of which carry a scrim + text-shadow by design):\n',
    );
    const seen = new Set();
    for (const o of overImage) {
      const key = `${o.route}|${o.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`   · ${o.route.padEnd(26)} <${o.tag}> "${o.text}"`);
    }
    console.log('');
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ failures, overImage, checked }, null, 2));
    console.log(`Wrote ${JSON_OUT}`);
  }

  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
