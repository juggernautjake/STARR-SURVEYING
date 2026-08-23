// Throwaway: what does the studio SAY when the PNG export fails?
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3216';
const AS = 'jacobmaddux@starr-surveying.com';
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
const token = await encode({ token: { email: AS, name: 'probe', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('console', (m) => console.log(`  [${m.type()}] ${m.text().slice(0, 240)}`));

await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="ds-create"]');
await page.fill('.dsx-home__new-row input', 'png probe');
await page.click('[data-testid="ds-create"]');
await page.waitForSelector('.dsx__artboard');
await page.click('[data-testid="ds-palette-item-button.admin"]').catch(() => {});
await page.waitForTimeout(400);

const downloads=[];
page.on('download',(d)=>downloads.push(d.suggestedFilename()));
const t0=Date.now();
await page.hover('.dsx__export');
await page.waitForTimeout(200);
await page.click('text=Image (PNG) of this view');
for (let i=0;i<30 && downloads.length===0;i++) await page.waitForTimeout(1000);
console.log(`  downloads after ${Math.round((Date.now()-t0)/1000)}s: ${JSON.stringify(downloads)}`);

const status = await page.locator('.dsx__status').textContent().catch(() => null);
console.log('\n  STATUS:', status);

// Also count how many font faces the page has, and whether any remote url survives the embed.
const detail = await page.evaluate(async () => {
  const chunks = [];
  let blocked = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules ?? [])) chunks.push(rule.cssText);
    } catch { blocked += 1; }
  }
  const css = chunks.join('\n');
  const faces = css.match(/@font-face\s*\{[^}]*\}/gi) ?? [];
  const remote = css.match(/url\((['"]?)https?:\/\/[^)'"]+\1\)/gi) ?? [];
  return {
    blocked,
    faceCount: faces.length,
    remoteUrlCount: remote.length,
    remoteSample: remote.slice(0, 4),
    faceSample: faces.slice(0, 1),
  };
});
console.log('  DETAIL:', JSON.stringify(detail, null, 2));

await browser.close();
