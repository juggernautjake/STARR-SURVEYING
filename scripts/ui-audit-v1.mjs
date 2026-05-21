// scripts/ui-audit-v1.mjs
//
// Focused subset of the full ui-audit — captures only the pages
// Phase 1 of UI_UX_OVERHAUL.md targets, so V-1 verification stays
// fast (~30 sec vs 5 min for the full sweep).

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const BASE = process.env.BASE_URL || 'https://starr-surveying.com';
const OUT = process.env.OUT_DIR || '/tmp/ui-audit-v1';
const EMAIL = process.env.STARR_EMAIL;
const PASSWORD = process.env.STARR_PASSWORD;

const VIEWPORTS = [
  { name: 'mobile',  width: 390,  height: 844  },
  { name: 'desktop', width: 1440, height: 900  },
];

// Phase 1 fix targets only.
const PAGES = [
  { name: 'admin-receipts',  path: '/admin/receipts' },
  { name: 'admin-reports',   path: '/admin/reports' },
  { name: 'admin-work',      path: '/admin/work' },
  { name: 'platform-home',   path: '/platform' },
];

async function signIn(page) {
  if (!EMAIL || !PASSWORD) return false;
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  const pw = page.locator('input[type="password"], input[name="password"]').first();
  await pw.fill(PASSWORD);
  await pw.press('Enter');
  try {
    await page.waitForURL((url) => !url.toString().includes('/admin/login'), { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

await fs.mkdir(OUT, { recursive: true });
console.log(`V-1 audit → ${PAGES.length} pages × ${VIEWPORTS.length} viewports = ${PAGES.length * VIEWPORTS.length} shots`);

const browser = await chromium.launch({ headless: true });

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ignoreHTTPSErrors: true,
  });
  if (EMAIL && PASSWORD) {
    const signinPage = await ctx.newPage();
    const ok = await signIn(signinPage);
    console.log(`  ${vp.name}: signed in: ${ok}`);
    await signinPage.close();
  }
  for (const p of PAGES) {
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);
      const file = path.join(OUT, `${vp.name}--${p.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  ✓ ${vp.name} ${p.name}`);
    } catch (err) {
      console.error(`  ✗ ${vp.name} ${p.name}: ${err.message.split('\n')[0]}`);
    } finally {
      await page.close();
    }
  }
  await ctx.close();
}

await browser.close();
console.log('Done.');
