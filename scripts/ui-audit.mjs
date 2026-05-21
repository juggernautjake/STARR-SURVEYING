// scripts/ui-audit.mjs
//
// Capture screenshots of starr-surveying.com pages at three viewport
// sizes so we can analyse UI issues across mobile / tablet / desktop.
//
// Now supports authenticated routes. Sign-in happens once per
// viewport context via email+password from STARR_EMAIL +
// STARR_PASSWORD env vars; the session is reused across pages.

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const BASE = process.env.BASE_URL || 'https://starr-surveying.com';
const OUT = process.env.OUT_DIR || '/tmp/ui-audit';
const EMAIL = process.env.STARR_EMAIL;
const PASSWORD = process.env.STARR_PASSWORD;

const VIEWPORTS = [
  { name: 'mobile',  width: 390,  height: 844  },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1440, height: 900  },
];

const PUBLIC_PAGES = [
  { name: 'home',          path: '/' },
  { name: 'pricing',       path: '/pricing' },
  { name: 'services',      path: '/services' },
  { name: 'contact',       path: '/contact' },
  { name: 'about',         path: '/about' },
  { name: 'signup',        path: '/signup' },
  { name: 'admin-login',   path: '/admin/login' },
];

const AUTH_PAGES = [
  // Hub + workspace landings
  { name: 'admin-hub',          path: '/admin/me' },
  { name: 'admin-dashboard',    path: '/admin/dashboard' },
  { name: 'admin-work',         path: '/admin/work' },
  { name: 'admin-research-cad', path: '/admin/research-cad' },
  { name: 'admin-office',       path: '/admin/office' },
  { name: 'admin-knowledge',    path: '/admin/knowledge' },
  { name: 'admin-equipment',    path: '/admin/equipment' },
  // Jobs flow
  { name: 'admin-jobs',         path: '/admin/jobs' },
  { name: 'admin-jobs-new',     path: '/admin/jobs/new' },
  { name: 'admin-my-jobs',      path: '/admin/my-jobs' },
  // Time / receipts / mileage
  { name: 'admin-receipts',     path: '/admin/receipts' },
  { name: 'admin-my-hours',     path: '/admin/my-hours' },
  { name: 'admin-mileage',      path: '/admin/mileage' },
  { name: 'admin-assignments',  path: '/admin/assignments' },
  { name: 'admin-schedule',     path: '/admin/schedule' },
  // Payroll / pay
  { name: 'admin-payroll',      path: '/admin/payroll' },
  { name: 'admin-my-pay',       path: '/admin/my-pay' },
  { name: 'admin-payout-log',   path: '/admin/payout-log' },
  // Research / CAD
  { name: 'admin-research',     path: '/admin/research' },
  { name: 'admin-cad',          path: '/admin/cad' },
  // Learning
  { name: 'admin-learn',        path: '/admin/learn' },
  // Equipment subroutes (most useful one)
  { name: 'admin-equipment-inventory', path: '/admin/equipment/inventory' },
  // Communication
  { name: 'admin-messages',     path: '/admin/messages' },
  { name: 'admin-discussions',  path: '/admin/discussions' },
  { name: 'admin-notes',        path: '/admin/notes' },
  // New SaaS surfaces (these only exist if branch is merged or on preview)
  { name: 'admin-billing',           path: '/admin/billing' },
  { name: 'admin-billing-invoices',  path: '/admin/billing/invoices' },
  { name: 'admin-billing-plan-hist', path: '/admin/billing/plan-history' },
  { name: 'admin-reports',           path: '/admin/reports' },
  { name: 'admin-payouts',           path: '/admin/payouts' },
  { name: 'admin-invites',           path: '/admin/invites' },
  { name: 'admin-orgs',              path: '/admin/orgs' },
  { name: 'admin-org-settings',      path: '/admin/org-settings' },
  { name: 'admin-announcements',     path: '/admin/announcements' },
  { name: 'admin-support',           path: '/admin/support' },
  { name: 'admin-audit',             path: '/admin/audit' },
  { name: 'admin-users',             path: '/admin/users' },
  { name: 'admin-employees',         path: '/admin/employees' },
  { name: 'admin-settings',          path: '/admin/settings' },
  { name: 'admin-error-log',         path: '/admin/error-log' },
  { name: 'admin-rewards',           path: '/admin/rewards' },
  // Operator console (only if user is in operator_users)
  { name: 'platform-home',           path: '/platform' },
  { name: 'platform-customers',      path: '/platform/customers' },
  { name: 'platform-audit',          path: '/platform/audit' },
  { name: 'platform-team',           path: '/platform/team' },
  { name: 'platform-releases',       path: '/platform/releases' },
  { name: 'platform-support',        path: '/platform/support' },
];

async function signIn(page) {
  if (!EMAIL || !PASSWORD) return false;
  console.log(`  ↻ Signing in as ${EMAIL}...`);
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 30000 });
  // Fill the email + password fields, then submit by pressing Enter on
  // the password field. Using a button selector here is fragile
  // because the login page has both a "Sign in with Google" and a
  // "Sign In" (email+password) button — submit-via-Enter avoids that.
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  await passwordInput.fill(PASSWORD);
  await passwordInput.press('Enter');
  try {
    await page.waitForURL((url) => !url.toString().includes('/admin/login'), { timeout: 15000 });
    console.log(`  ✓ Signed in, landed on ${page.url()}`);
    return true;
  } catch {
    console.error(`  ✗ Sign-in didn't redirect (still on ${page.url()})`);
    return false;
  }
}

await fs.mkdir(OUT, { recursive: true });
const includeAuth = !!(EMAIL && PASSWORD);
const allPages = includeAuth ? [...PUBLIC_PAGES, ...AUTH_PAGES] : PUBLIC_PAGES;

console.log(`Capturing ${allPages.length} pages × ${VIEWPORTS.length} viewports = ${allPages.length * VIEWPORTS.length} shots`);
console.log(`Auth mode: ${includeAuth ? 'YES (will sign in)' : 'NO (public pages only)'}`);
console.log(`Output dir: ${OUT}`);

const browser = await chromium.launch({ headless: true });

for (const vp of VIEWPORTS) {
  console.log(`\n=== Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ignoreHTTPSErrors: true,
  });

  // Sign in once per context so the session cookie is reused across pages.
  if (includeAuth) {
    const signinPage = await ctx.newPage();
    const ok = await signIn(signinPage);
    await signinPage.close();
    if (!ok) {
      console.warn('  Skipping auth pages for this viewport since sign-in failed');
    }
  }

  for (const p of allPages) {
    const url = `${BASE}${p.path}`;
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);  // settle hydration
      const file = path.join(OUT, `${vp.name}--${p.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  ✓ ${p.name.padEnd(32)} → ${file}`);
    } catch (err) {
      console.error(`  ✗ ${p.name.padEnd(32)} ${err.message.split('\n')[0]}`);
    } finally {
      await page.close();
    }
  }
  await ctx.close();
}

await browser.close();
console.log('\nDone.');
