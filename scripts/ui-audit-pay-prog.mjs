import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const BASE = process.env.BASE_URL || 'https://starr-surveying.com';
const OUT = process.env.OUT_DIR || '/tmp/pay-prog-v1';
const EMAIL = process.env.STARR_EMAIL;
const PASSWORD = process.env.STARR_PASSWORD;

const VIEWPORTS = [
  { name: 'mobile',  width: 390,  height: 844  },
  { name: 'desktop', width: 1440, height: 900  },
];

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function signIn(page) {
  if (!EMAIL || !PASSWORD) return false;
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  const pw = page.locator('input[type="password"], input[name="password"]').first();
  await pw.fill(PASSWORD);
  await pw.press('Enter');
  try {
    await page.waitForURL(u => !u.toString().includes('/admin/login'), { timeout: 15000 });
    return true;
  } catch { return false; }
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ignoreHTTPSErrors: true });
  const signinPage = await ctx.newPage();
  const ok = await signIn(signinPage);
  console.log(`  ${vp.name}: signed in: ${ok}`);
  await signinPage.close();
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/admin/pay-progression`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    const file = path.join(OUT, `${vp.name}--pay-progression.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ✓ ${vp.name} pay-progression`);
  } catch (err) {
    console.error(`  ✗ ${vp.name}: ${err.message.split('\n')[0]}`);
  } finally { await page.close(); }
  await ctx.close();
}
await browser.close();
console.log('Done.');
