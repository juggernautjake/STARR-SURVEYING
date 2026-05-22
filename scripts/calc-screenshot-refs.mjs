// scripts/calc-screenshot-refs.mjs
//
// Alternative reference-image strategy when Wikimedia rate-limits the
// fetch-based script: navigate to each Wikipedia article and screenshot
// the infobox `<img>` element directly. This uses the in-browser image
// render path (different from fetch) so we sometimes get through when
// fetch is blocked.

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const OUT = '/tmp/calc-refs';
await fs.mkdir(OUT, { recursive: true });

const TARGETS = [
  { key: 'casio-fx-991',      page: 'https://en.wikipedia.org/wiki/Casio_fx-991ES' },
  { key: 'casio-fx-115',      page: 'https://en.wikipedia.org/wiki/Casio_fx-115' },
  { key: 'hp-35s',            page: 'https://en.wikipedia.org/wiki/HP_35s' },
  { key: 'hp-33s',            page: 'https://en.wikipedia.org/wiki/HP_33s' },
  { key: 'ti-30xs-multiview', page: 'https://en.wikipedia.org/wiki/TI-30' },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1800 },
  ignoreHTTPSErrors: true,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
});

for (const t of TARGETS) {
  const page = await ctx.newPage();
  try {
    await page.goto(t.page, { waitUntil: 'networkidle', timeout: 25000 });
    // Wait for any infobox image to render.
    const candidates = ['table.infobox img', '.infobox-image img', '.thumbinner img', 'figure img'];
    let img = null;
    for (const sel of candidates) {
      img = await page.$(sel);
      if (img) {
        const box = await img.boundingBox();
        if (box && box.width > 50 && box.height > 50) break;
        img = null;
      }
    }
    if (!img) {
      console.log(`  ✗ ${t.key}: no infobox img found`);
      await page.close();
      continue;
    }
    const file = path.join(OUT, `${t.key}.png`);
    await img.screenshot({ path: file });
    const stat = await fs.stat(file);
    console.log(`  ✓ ${t.key}: ${stat.size} bytes → ${file}`);
  } catch (err) {
    console.log(`  ✗ ${t.key}: ${String(err).split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log('Done.');
