// Throwaway: build a small mockup, export it, and keep the artifacts so I can look at them.
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3217';
const OUT = process.argv[3] ?? '.';
const AS = 'jacobmaddux@starr-surveying.com';
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
const token = await encode({ token: { email: AS, name: 'Export look', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1000 }, acceptDownloads: true });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();

await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="ds-create"]');
await page.fill('.dsx-home__new-row input', 'Jobs list — denser');
await page.locator('.dsx-home__new-row input').nth(1).fill('/admin/jobs');
await page.click('[data-testid="ds-create"]');
await page.waitForSelector('.dsx__artboard');

const place = async (id) => {
  await page.fill('[data-testid="ds-palette-search"]', id);
  await page.waitForTimeout(220);
  const item = page.locator(`[data-testid="ds-palette-item-${id}"]`);
  if (await item.count()) { await item.first().click(); await page.waitForTimeout(140); return true; }
  return false;
};

for (const id of ['text.page-title', 'layout.toolbar', 'layout.table-wrap', 'button.admin', 'tag.stage', 'tag.deadline', 'shape.rectangle', 'shape.sticky']) {
  const ok = await place(id);
  if (!ok) console.log(`  (could not place ${id})`);
}

// Lay them out as a page would be.
await page.evaluate(() => {
  const at = [
    [40, 32, 460, 34],      // title
    [40, 92, 1360, 56],     // toolbar
    [40, 172, 1360, 300],   // table
    [1180, 30, 220, 40],    // primary button
    [520, 36, 110, 28],     // stage badge
    [660, 40, 140, 20],     // deadline
    [40, 500, 320, 150],    // rectangle
    [400, 500, 260, 130],   // sticky
  ];
  document.querySelectorAll('.dsx__el').forEach((el, i) => {
    const [x, y, w, h] = at[i] ?? [40, 700 + i * 60, 200, 40];
    el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.width = `${w}px`; el.style.height = `${h}px`;
  });
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/export-canvas.png` });

// Export everything and keep the files.
const downloads = [];
page.on('download', async (d) => {
  const name = d.suggestedFilename();
  await d.saveAs(`${OUT}/${name}`);
  downloads.push(name);
});
await page.hover('.dsx__export');
await page.waitForTimeout(250);
await page.click('text=Everything');
await page.waitForTimeout(6000);

console.log('  exported:', downloads.join(', '));
await browser.close();
