// scripts/ui-audit.mjs
//
// Capture screenshots of starr-surveying.com pages at three viewport
// sizes so we can analyse UI issues across mobile / tablet / desktop.
// Public-only routes — auth-gated pages need a separate flow.

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const BASE = process.env.BASE_URL || 'https://starr-surveying.com';
const OUT = '/tmp/ui-audit';

const VIEWPORTS = [
  { name: 'mobile',  width: 390,  height: 844  },   // iPhone 14
  { name: 'tablet',  width: 768,  height: 1024 },   // iPad portrait
  { name: 'desktop', width: 1440, height: 900  },   // standard laptop
];

const PAGES = [
  { name: 'home',          path: '/' },
  { name: 'pricing',       path: '/pricing' },
  { name: 'services',      path: '/services' },
  { name: 'contact',       path: '/contact' },
  { name: 'about',         path: '/about' },
  { name: 'signup',        path: '/signup' },
  { name: 'admin-login',   path: '/admin/login' },
];

await fs.mkdir(OUT, { recursive: true });

console.log(`Capturing ${PAGES.length} pages × ${VIEWPORTS.length} viewports = ${PAGES.length * VIEWPORTS.length} shots`);
console.log(`Output dir: ${OUT}`);

const browser = await chromium.launch({ headless: true });

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ignoreHTTPSErrors: true,
  });
  for (const p of PAGES) {
    const url = `${BASE}${p.path}`;
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      // Wait a beat for any client-side hydration
      await page.waitForTimeout(800);
      const file = path.join(OUT, `${vp.name}--${p.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  ✓ ${vp.name.padEnd(7)} ${p.name.padEnd(15)} → ${file}`);
    } catch (err) {
      console.error(`  ✗ ${vp.name.padEnd(7)} ${p.name.padEnd(15)} ${err.message}`);
    } finally {
      await page.close();
    }
  }
  await ctx.close();
}

await browser.close();
console.log('Done.');
