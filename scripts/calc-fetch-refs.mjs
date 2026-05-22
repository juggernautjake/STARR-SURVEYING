// scripts/calc-fetch-refs.mjs
//
// Fetch reference photos of each approved-list calculator. Strategy:
// land on the Wikipedia article (which grants the page an
// en.wikipedia.org origin), then in-page-fetch the upload.wikimedia.org
// image URL. The image URL accepts requests with a Wikipedia Referer
// even when standalone curl fails.

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const OUT = '/tmp/calc-refs';
await fs.mkdir(OUT, { recursive: true });

const TARGETS = [
  { key: 'ti-36x-pro',        page: 'https://en.wikipedia.org/wiki/TI-36',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/TI-36X_Pro_%282011%292.jpg/640px-TI-36X_Pro_%282011%292.jpg' },
  { key: 'ti-30xa',           page: 'https://en.wikipedia.org/wiki/TI-30',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/TI-30-3682e2.jpg/640px-TI-30-3682e2.jpg' },
  { key: 'ti-30xs-multiview', page: 'https://en.wikipedia.org/wiki/TI-30',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/TI-30-3682e2.jpg/640px-TI-30-3682e2.jpg' },
  { key: 'casio-fx-991',      page: 'https://en.wikipedia.org/wiki/Casio_fx-991ES',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Casio_fx-991ES_PLUS.jpg/480px-Casio_fx-991ES_PLUS.jpg' },
  { key: 'casio-fx-115',      page: 'https://en.wikipedia.org/wiki/Casio_fx-115',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Casio_fx-115ES.jpg/640px-Casio_fx-115ES.jpg' },
  { key: 'hp-35s',            page: 'https://en.wikipedia.org/wiki/HP_35s',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Hp35s_Calculator.jpg/640px-Hp35s_Calculator.jpg' },
  { key: 'hp-33s',            page: 'https://en.wikipedia.org/wiki/HP_33s',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/HP_33s_calculator.jpg/640px-HP_33s_calculator.jpg' },
];

function isJpeg(bytes) {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1600 },
  ignoreHTTPSErrors: true,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
});

for (const t of TARGETS) {
  const page = await ctx.newPage();
  try {
    await page.goto(t.page, { waitUntil: 'domcontentloaded', timeout: 25000 });
    // Small pause to let the page register origin/cookies.
    await page.waitForTimeout(300);
    const arr = await page.evaluate(async (url) => {
      const r = await fetch(url);
      if (!r.ok) return { status: r.status, bytes: [] };
      const ab = await r.arrayBuffer();
      return { status: r.status, bytes: Array.from(new Uint8Array(ab)) };
    }, t.image);
    if (arr.status !== 200 || !isJpeg(arr.bytes)) {
      console.log(`  ✗ ${t.key}: status=${arr.status} bytes=${arr.bytes.length}`);
      continue;
    }
    const file = path.join(OUT, `${t.key}.jpg`);
    await fs.writeFile(file, Buffer.from(arr.bytes));
    console.log(`  ✓ ${t.key}: ${arr.bytes.length} bytes → ${file}`);
  } catch (err) {
    console.log(`  ✗ ${t.key}: ${String(err).split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log('Done. Inspect via the Read tool against /tmp/calc-refs/*.jpg');
