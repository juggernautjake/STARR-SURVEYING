import { chromium } from 'playwright';

const BASE = 'https://starr-surveying.com';
const EMAIL = process.env.STARR_EMAIL;
const PASSWORD = process.env.STARR_PASSWORD;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();

page.on('response', (res) => {
  const url = res.url();
  if (url.includes('/api/auth/') || url.includes('signin') || url.includes('callback')) {
    console.log(`[NET] ${res.status()} ${res.request().method()} ${url.slice(0, 120)}`);
  }
});
page.on('console', (msg) => {
  const text = msg.text();
  if (msg.type() === 'error' || text.toLowerCase().includes('error') || text.toLowerCase().includes('fail')) {
    console.log(`[CONSOLE] ${msg.type()} ${text.slice(0, 200)}`);
  }
});

console.log(`→ navigating to ${BASE}/admin/login`);
await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
console.log(`  current url: ${page.url()}`);

// What buttons exist on the page?
const buttons = await page.locator('button').all();
console.log(`  found ${buttons.length} buttons:`);
for (const b of buttons) {
  const text = (await b.textContent()).trim().slice(0, 60);
  const type = await b.getAttribute('type');
  const inForm = await b.evaluate((el) => !!el.closest('form'));
  console.log(`    - type="${type}" inForm=${inForm} text="${text}"`);
}

// What forms?
const forms = await page.locator('form').all();
console.log(`  found ${forms.length} forms`);

// Try clicking the exact email/password form button
console.log(`→ filling email + password`);
await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);

// Find the button inside the same form as the password input
console.log(`→ submitting via form submit`);
const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
await passwordInput.evaluate((el) => el.form?.requestSubmit?.());

await page.waitForTimeout(5000);
console.log(`  after submit, url: ${page.url()}`);

// Check cookies
const cookies = await ctx.cookies();
console.log(`  ${cookies.length} cookies set:`);
for (const c of cookies) {
  console.log(`    - ${c.name} = ${c.value.slice(0, 40)}... (domain=${c.domain})`);
}

// Try navigating to /admin/me
console.log(`→ navigating to /admin/me`);
await page.goto(`${BASE}/admin/me`, { waitUntil: 'networkidle' });
console.log(`  ended on: ${page.url()}`);
await page.screenshot({ path: '/tmp/auth-debug.png', fullPage: true });
console.log(`  screenshot: /tmp/auth-debug.png`);

await browser.close();
