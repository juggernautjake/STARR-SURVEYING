// scripts/verify-card-roundtrip.ts — prove the owner's acceptance test, in the real UI.
//
// Owner, 2026-08-13: *"if I register a card payment method that relates to the payment method on the
// receipt, the flagged issue should go away and it should just show what card was used to pay for
// that receipt."*
//
// That sentence spans a form, an API, a sweep and a queue, so no unit test can answer it. This drives
// the actual screens: it reads the flag on a real receipt, registers the matching card through the
// form a person would use, and reads the same receipt back.
//
// It CLEANS UP after itself — the card it registers is deleted and the sweep re-run — so production
// is left exactly as it was found. The point is to prove the mechanism, not to populate the registry;
// the owner registers the real cards themselves.
//
// Usage: npx tsx --env-file=.env.local scripts/verify-card-roundtrip.ts

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import { supabaseAdmin } from '../lib/supabase';
import { rematchOpenReceipts } from '../lib/receipts/rematch-cards';

const BASE = 'http://127.0.0.1:3100';
const ADMIN = 'jacobmaddux@starr-surveying.com';

/** The receipt this test is about: CEFCO, $3.24, paid on a card ending 9858 that is not on file. */
const TARGET_LAST4 = '9858';
const TEST_LABEL = 'QA round-trip card (deleted automatically)';

async function statusOf(last4: string): Promise<{ status: string | null; cardId: string | null }> {
  const { data } = await supabaseAdmin
    .from('receipts')
    .select('card_match_status, payment_card_id')
    .eq('payment_last4', last4)
    .is('deleted_at', null)
    .limit(1);
  const row = data?.[0] as { card_match_status: string | null; payment_card_id: string | null } | undefined;
  return { status: row?.card_match_status ?? null, cardId: row?.payment_card_id ?? null };
}

const step = (n: number, s: string) => console.log(`\n[${n}] ${s}`);

async function main(): Promise<void> {
  const secret = (process.env.AUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
  const token = await encode({
    token: { email: ADMIN, name: 'QA', sub: ADMIN }, secret, salt: 'authjs.session-token', maxAge: 3600,
  });

  const before = await statusOf(TARGET_LAST4);
  step(1, `Receipt ending ${TARGET_LAST4} before: ${before.status} (card ${before.cardId ?? 'none'})`);
  if (before.status !== 'not_on_file') {
    console.log(`  ! expected 'not_on_file' to start from. Aborting rather than testing the wrong thing.`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  let createdCardId: string | null = null;

  try {
    step(2, 'Open /admin/cards as an admin');
    await page.goto(`${BASE}/admin/cards`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const heading = await page.locator('h1').first().innerText().catch(() => '(none)');
    console.log(`  page heading: "${heading}"`);
    if (!/payment cards/i.test(heading)) throw new Error('not signed in, or the page did not render');

    step(3, 'Register the card through the form a person would use');
    await page.getByRole('button', { name: /add a card/i }).click();
    await page.waitForTimeout(400);
    await page.locator('#card-last4').fill(TARGET_LAST4);
    await page.locator('#card-label').fill(TEST_LABEL);
    await page.locator('#card-brand').fill('Visa');
    await page.locator('#card-role').selectOption('COMPANY');
    await page.getByRole('button', { name: /^save card$/i }).click();
    await page.waitForTimeout(3500);

    // The notice is the product telling the user what the save did to the waiting receipts. If it is
    // silent, the feature "works" only for somebody who thinks to go and look.
    const notice = await page.locator('body').innerText();
    const line = notice.split('\n').find((l) => /card added/i.test(l)) ?? '(no notice found)';
    console.log(`  notice: "${line.trim()}"`);

    const { data: created } = await supabaseAdmin.from('payment_cards').select('id').eq('label', TEST_LABEL).limit(1);
    createdCardId = (created?.[0] as { id: string } | undefined)?.id ?? null;
    console.log(`  card row created: ${createdCardId ?? 'NONE'}`);

    step(4, 'Read the same receipt back');
    const after = await statusOf(TARGET_LAST4);
    console.log(`  Receipt ending ${TARGET_LAST4} after: ${after.status} (card ${after.cardId ?? 'none'})`);
    const passed = after.status === 'on_file' && after.cardId === createdCardId;
    console.log(`  ${passed ? 'PASS' : 'FAIL'} — the flag ${passed ? 'cleared and the receipt names the card' : 'did NOT clear'}`);

    step(5, 'Confirm the receipts queue shows the card rather than the flag');
    await page.goto(`${BASE}/admin/receipts`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const queue = await page.locator('body').innerText();
    const stillFlagged = /CEFCO[\s\S]{0,400}?is NOT on file/i.test(queue);
    console.log(`  "NOT on file" still shown against CEFCO: ${stillFlagged ? 'YES (bug)' : 'no'}`);
  } finally {
    step(6, 'Clean up — remove the test card and restore the receipt');
    if (createdCardId) {
      await supabaseAdmin.from('receipts').update({ payment_card_id: null, card_match_status: null }).eq('payment_card_id', createdCardId);
      await supabaseAdmin.from('payment_cards').delete().eq('id', createdCardId);
    }
    const restored = await rematchOpenReceipts();
    const end = await statusOf(TARGET_LAST4);
    console.log(`  sweep re-run (${restored.updated} updated); receipt ending ${TARGET_LAST4} is back to: ${end.status}`);
    const { data: cards } = await supabaseAdmin.from('payment_cards').select('id');
    console.log(`  cards on file now: ${cards?.length ?? 0}`);
    await browser.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
