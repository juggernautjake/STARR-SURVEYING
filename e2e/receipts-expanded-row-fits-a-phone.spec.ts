// e2e/receipts-expanded-row-fits-a-phone.spec.ts — M7.
//
// ── WHY THIS FAKES THE RESPONSE, WHICH IS NORMALLY THE WRONG ANSWER ─────────────────────────────
//
// The expanded receipt row is the one thing in M5–M8 that a portrait audit cannot reach: R4 found the
// `receipts` table holds ZERO rows, so the queue renders "No pending receipts in this date range."
// and the grid under test never mounts. Driving the page against live data proves nothing here, and
// inserting a fake receipt into production to look at a CSS grid is not a trade worth making.
//
// So the route response is intercepted and the REAL component renders a realistic row: the shape
// comes from `AdminReceiptRow`, so if the API's contract changes this spec fails to compile rather
// than quietly testing a shape nobody serves any more.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// `styles.expanded` was `gridTemplateColumns: 'minmax(200px, 320px) 1fr'` — a hard two-column split.
// At 390px the row has ~334px of usable width, so the photo column took 200 and the entire field
// list was left ~110px, and `1fr` refuses to shrink below its content's min-width, so a long vendor
// name pushed the row off the screen. It is an INLINE STYLE, which is why no stylesheet or media
// query ever corrected it, and why the M4 sweep could not have: the row only exists once expanded.

import { test, expect, type Browser } from '@playwright/test';
import { encode } from '@auth/core/jwt';
import fs from 'node:fs';
import path from 'node:path';
import type { AdminReceiptRow } from '../app/admin/receipts/receipt-types';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3016';
const ADMIN = 'jacobmaddux@starr-surveying.com';

test.describe.configure({ timeout: 150_000 });

function secret(): string {
  const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  return env.match(/^AUTH_SECRET\s*=\s*(.+)$/m)![1].replace(/^["']|["']$/g, '').trim();
}

// Deliberately unkind values: the longest vendor name, a note that will not wrap short, line items,
// flags and a low-confidence field — i.e. the receipt most likely to burst the row, not the tidiest.
const ROW: AdminReceiptRow = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-0000000000ff',
  job_id: null,
  job_time_entry_id: null,
  vendor_name: 'Southwest Surveying Supply & Instrument Repair Co.',
  vendor_address: '1401 South Valley Drive, Las Cruces, New Mexico 88005',
  transaction_at: '2026-08-10T16:42:00.000Z',
  subtotal_cents: 18499,
  tax_cents: 1526,
  tip_cents: 0,
  total_cents: 20025,
  payment_method: 'card',
  payment_last4: '4417',
  category: 'equipment',
  category_source: 'ai',
  tax_deductible_flag: 'full',
  notes: 'Replacement tribrach and a spare prism pole tip for the Trimble kit.',
  photo_url: 'receipts/fake.jpg',
  status: 'pending',
  approved_by: null,
  approved_at: null,
  rejected_reason: null,
  deleted_at: null,
  deletion_reason: null,
  extraction_status: 'done',
  extraction_error: null,
  extraction_cost_cents: 3,
  ai_confidence_per_field: { vendor_name: 0.97, total_cents: 0.99, transaction_at: 0.42 },
  created_at: '2026-08-10T16:45:00.000Z',
  updated_at: '2026-08-10T16:45:10.000Z',
  promoted_to_equipment_id: null,
  ai_extras: {
    summary: 'Survey instrument parts purchased at a Las Cruces supplier, paid by card.',
    review_flags: ['date_illegible'],
    vendor_phone: '(575) 555-0142',
    card_brand: 'Visa',
    receipt_number: 'SWS-2026-118844',
    discount_cents: 0,
    currency: 'USD',
  },
  dedup_match_id: null,
  // The unkindest value, in the spirit of this fixture: a card nobody recognises adds another
  // full-width band to the expanded row, which is exactly what this spec measures.
  card_match_status: 'not_on_file',
  submitted_by_email: 'fieldcrew@starr-surveying.com',
  submitted_by_name: 'Field Crew',
  job_name: null,
  job_number: null,
  photo_signed_url: null,
  line_items: [
    { id: 'li-1', description: 'Tribrach, fixed, w/ optical plummet', amount_cents: 14999, quantity: 1, position: 1 },
    { id: 'li-2', description: 'Prism pole replacement tip, 5/8-11', amount_cents: 3500, quantity: 2, position: 2 },
  ],
  linked_maintenance_events: [],
  // Seed 590 — an ordinary receipt, not one half of a pair. The same-purchase band is measured by
  // its own case rather than folded in here; this fixture already carries the widest row.
  superseded_by_receipt_id: null,
  same_purchase_kind: null,
  same_purchase_confidence: null,
  service_charge_cents: null,
  customer_tip_cents: null,
  // Seed 591 — nobody has answered whose card this was, which is the state that renders the payer
  // panel. Consistent with `card_match_status: 'not_on_file'` above, and it is now the widest band
  // on the row: a question, three buttons and a card picker, all of which must fit a phone.
  payment_card_id: null,
  payment_card: null,
  card_confirmed_at: null,
  card_confirmed_by: null,
  expense_nature: null,
  expense_nature_note: null,
  // The thorough read has never run on this fixture, which is the ordinary state for a receipt.
  deep_read_at: null,
  deep_transcript: null,
  deep_discrepancies: null,
  deep_vendor_check: null,
  deep_band_count: null,
  deep_duration_ms: null,
  deep_cost_cents: null,
};

const PAYLOAD = {
  receipts: [ROW],
  counters: { pending: 1, approved: 0, rejected: 0, exported: 0, needs_review: 1, total: 1 },
};

async function openQueue(browser: Browser, width: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
  const token = await encode({
    token: { email: ADMIN, name: 'E2E', sub: 'e2e' },
    secret: secret(), salt: 'authjs.session-token', maxAge: 3600,
  });
  await ctx.addCookies([{
    name: 'authjs.session-token', value: token,
    domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Lax',
  }]);

  const page = await ctx.newPage();
  await page.route('**/api/admin/receipts?**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) }));

  await page.goto(`${BASE}/admin/receipts`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await expect(page.getByText(ROW.vendor_name!)).toBeVisible({ timeout: 90_000 });
  return { ctx, page };
}

// The expanded row is opened by tapping the row itself.
async function expand(page: import('@playwright/test').Page) {
  await page.getByText(ROW.vendor_name!).first().click();
  // The line-items table only exists in the expanded body, so it is the honest signal that the grid
  // under test has actually mounted — waiting on the photo column would pass on a collapsed row.
  await expect(page.getByText('Tribrach, fixed, w/ optical plummet')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
}

for (const width of [390, 320]) {
  test(`the expanded receipt row fits ${width}px and collapses to one column`, async ({ browser }) => {
    const { ctx, page } = await openQueue(browser, width);
    await expand(page);

    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;

      // Find the expanded body. It has no class — it is an inline style object, which is the same
      // reason the bug survived — so it has to be identified structurally.
      //
      // The first version of this did `querySelectorAll('div').find(grid && contains a table)` and
      // silently measured the WRONG BOX: `find` returns the first match in DOCUMENT order, which is
      // the OUTERMOST grid containing the table, not the innermost. That outer wrapper is one column
      // wide at every viewport, so the `columns === 1` assertion passed while the real two-column
      // expanded body sat inside it overflowing. A locator that can match the wrong element makes a
      // green assertion meaningless, so this walks UP from the table and then proves what it landed on.
      const table = document.querySelector('table');
      if (!table) return { found: false, why: 'no line-items table' } as const;

      let grid: HTMLElement | null = null;
      for (let p = table.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).display === 'grid') { grid = p; break; }
      }
      if (!grid) return { found: false, why: 'no grid ancestor above the table' } as const;

      // `styles.expanded` is padding 16 / gap 24 / #fafafa. If we walked up to something else, say so
      // rather than reporting on it as though it were the row.
      const gcs = getComputedStyle(grid);
      const identity = `padding=${gcs.paddingTop} gap=${gcs.rowGap} bg=${gcs.backgroundColor}`;
      if (gcs.paddingTop !== '16px' || gcs.rowGap !== '24px') {
        return { found: false, why: `walked up to the wrong box: ${identity}` } as const;
      }

      const cols = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean);

      // Anything inside the expanded body drawn past the viewport, ignoring what a scroller can reach
      // — the line-items table is DELIBERATELY a horizontal scroller, because amounts are meant to be
      // compared down the column and restacking them into cards would destroy that.
      const reachable = (el: Element) => {
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
        }
        return false;
      };
      const past: string[] = [];
      for (const el of grid.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        const cs = getComputedStyle(el);
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
        if (b.right - vw > 1 && !reachable(el)) {
          past.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 24)} +${Math.round(b.right - vw)}px`);
        }
      }

      // Is the panel BELOW the header, or beside it? This is the question that actually identifies the
      // defect, and it is the only one that is wrong at every viewport: at 1280px the misplaced panel
      // was still on screen, so a width-based check called the desktop fine while it was equally
      // broken. `card` is `styles.row`; its first child is the header.
      const card = grid.parentElement!;
      const header = card.firstElementChild!;
      const hb = header.getBoundingClientRect();
      const gb = grid.getBoundingClientRect();
      const stacked = { panelTop: Math.round(gb.top), headerBottom: Math.round(hb.bottom), panelLeft: Math.round(gb.left), headerLeft: Math.round(hb.left) };

      return {
        found: true as const,
        vw,
        stacked,
        columns: cols.length,
        columnWidths: cols,
        gridWidth: Math.round(grid.getBoundingClientRect().width),
        sideways: document.documentElement.scrollWidth - vw,
        past,
      };
    });

    expect(m.found, `could not locate the expanded row: ${'why' in m ? m.why : ''}`).toBe(true);
    if (!m.found) return;

    // The panel sits under the header, not next to it. `styles.row` was a flex ROW, so the panel was
    // a third item beside a `width: 100%` button, and `overflow: hidden` on the card erased it.
    expect(m.stacked.panelTop, `panel top ${m.stacked.panelTop} vs header bottom ${m.stacked.headerBottom} — the panel is beside the header, not below it`)
      .toBeGreaterThanOrEqual(m.stacked.headerBottom - 1);
    expect(m.stacked.panelLeft, 'the panel starts to the right of the header').toBeLessThanOrEqual(m.stacked.headerLeft + 2);

    // ONE column on a phone. This is the assertion that fails on `minmax(200px, 320px) 1fr`, which
    // always resolves to two however narrow the screen gets.
    expect(m.columns, `columns were ${JSON.stringify(m.columnWidths)}`).toBe(1);
    expect(m.gridWidth).toBeLessThanOrEqual(m.vw);
    expect(m.past, `drawn past the right edge: ${m.past.join(', ')}`).toEqual([]);
    expect(m.sideways, 'the page scrolls sideways with a receipt expanded').toBeLessThanOrEqual(1);

    await ctx.close();
  });
}

test('the same row still gets two columns on a desktop width', async ({ browser }) => {
  // The fix must not have bought the phone by flattening the desktop: `auto-fit` is supposed to come
  // BACK to two columns the moment there is room, and a one-column desktop would be a regression
  // that a phone-only test would happily call a success.
  const { ctx, page } = await openQueue(browser, 1280);
  await expand(page);

  const m = await page.evaluate(() => {
    // Same walk-up-from-the-table rule as above, for the same reason.
    const table = document.querySelector('table');
    for (let p = table?.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === 'grid' && cs.paddingTop === '16px' && cs.rowGap === '24px') {
        const card = p.parentElement!;
        const hb = card.firstElementChild!.getBoundingClientRect();
        const gb = p.getBoundingClientRect();
        return {
          columns: cs.gridTemplateColumns.split(/\s+/).filter(Boolean).length,
          panelTop: Math.round(gb.top), headerBottom: Math.round(hb.bottom),
        };
      }
    }
    return { columns: -1, panelTop: 0, headerBottom: 0 };
  });

  expect(m.columns).toBeGreaterThanOrEqual(2);
  // The desktop was misplaced in exactly the same way and merely stayed on screen, so it gets the
  // stacking assertion too — otherwise "desktop is fine" rests on the viewport being wide enough.
  expect(m.panelTop, `panel top ${m.panelTop} vs header bottom ${m.headerBottom}`)
    .toBeGreaterThanOrEqual(m.headerBottom - 1);
  await ctx.close();
});
