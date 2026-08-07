# Duplicate expense detection and alerting

**Started** 2026-08-07 · **Owner ask:** *"Can you fix the gaps and double count? Can we make it so
that we have systems and checks in place that trigger alerts whenever it seems like
receipt/expenditures are counted multiple times?"*

---

## Why the existing guard is not enough

`findSuspectedDuplicates` (shipped today) catches exactly one shape: a receipt whose vendor looks
like an ad platform, when ad spend was also imported. It is narrow in three ways:

1. **It only knows about advertising.** The commonest duplicate in a small firm has nothing to do
   with ads — it is the same fuel receipt photographed twice, once in the truck and once at the desk.
2. **It only fires when somebody opens the finance overview.** A check nobody runs is not a control.
3. **It has no memory.** It re-reports the same pair every time the page loads, and there is no way
   to say "I looked, they are genuinely two separate charges."

## What counts as a suspected duplicate

Three shapes, in descending confidence. All are *signals*, never verdicts.

| Shape | Rule | Confidence |
|---|---|---|
| **Same charge, twice** | same vendor, identical cents, within 3 days | high |
| **Cross-source** | ad-platform vendor receipt while `ad_spend_daily` covers the period | high |
| **Round-trip re-entry** | same vendor + cents, 4–14 days apart | low |

The 3-day window is deliberate: a receipt photographed today and again tomorrow is one charge, but a
firm that buys fuel at the same station twice in a week for the same amount is normal and must not be
flagged as high confidence.

## Ground rules

- **Detection never deletes.** Every rule here is a heuristic over free text somebody typed on a
  phone. Silently dropping a real expense is worse than showing two numbers, and it is undetectable
  afterwards because the receipt simply stops appearing in any total.
- **A dismissal must stick.** An alert that cannot be resolved becomes noise, and a noisy channel gets
  muted — taking the real alerts with it. The existing `compliance_alerts_sent` ledger already gives
  this for free via `dedupeKey`.
- **The key must be stable and order-free.** `receiptA|receiptB` and `receiptB|receiptA` are the same
  situation. Sorted ids, or the same pair alerts twice.

---

## Slices

### D1 — The detector, pure
`lib/finances/duplicate-expenses.ts`
- `findDuplicateExpenses(receipts, { adSpendCents, adSpendPeriods })` → `DuplicateFinding[]`
- Fields: `kind`, `confidence`, `receipt_ids`, `vendor`, `total_cents`, `dedupe_key`, `explanation`
- Pairs are emitted once, keyed on sorted ids.
- Tests: exact pair, 3-day boundary, different vendors, different amounts, three-way collision,
  cross-source, ordering stability, empty input.

### D2 — A sixth proactive check
`lib/ai/proactive.ts`
- `duplicateExpenses()` joins the five existing checks in `collectProactiveAlerts()`.
- Severity `warn` — money is at stake but nothing is on fire.
- `href` points at the finance overview so the alert has a destination.
- The existing ledger dedupes: a pair alerts once, not every morning.

### D3 — Wire it into the finance overview
- The overview's `suspected_duplicates` switches to the general detector, so the page and the alert
  agree about what a duplicate is. Two definitions is how a dashboard and an email disagree.

### D4 — QA
- `tsc`, full suite, `npm run build`.

## Progress

- [ ] D1 · [ ] D2 · [ ] D3 · [ ] D4

---

## Completion notes — 2026-08-07

**D1 · shipped.** `findDuplicateExpenses` — general, pure, 15 tests. Clusters rather than pairs, so
three prints of one charge are one finding naming three receipts. Counts only the EXTRA copies as at
risk: one of them is a real expense, and overstating the exposure undermines the number the first
time somebody checks it.

Two normalisation bugs found by the tests and worth recording. Apostrophes had to be DELETED rather
than turned into separators — through the general pass `buc-ee's` became `buc ee s` while `BUC-EES`
became `buc ees`, two spellings of one vendor that no longer matched. And store numbers had to be
stripped, because they differ between two prints of the same charge, which is exactly the commonest
duplicate.

**D2 · shipped.** A sixth check in `collectProactiveAlerts()`, so it rides the existing daily cron and
the existing `compliance_alerts_sent` ledger — a pair alerts once, not every morning. 90-day window:
catch it while somebody still remembers the purchase. Only HIGH confidence becomes a notification;
the low-confidence "same vendor, same amount, a week apart" findings stay on the page. A channel that
cries wolf gets muted, and a muted channel takes the real alerts with it.

**D3 · shipped.** The finance overview now calls the same detector, so the page and the notification
cannot disagree about what a duplicate is. The page shows both confidences and labels the weak ones
"(possible)" — something you opened deliberately can afford a maybe.

**D4 · shipped.** `tsc` clean, 96 tests across the affected suites, `npm run build` exit 0.

**Not built, deliberately: auto-removal, and a dismiss button.**

Auto-removal was rejected outright and the reasoning is in the module header — every rule here is a
heuristic over a vendor name typed on a phone, two genuine fuel stops are indistinguishable from one
receipt entered twice, and silently dropping a real expense is both worse and undetectable
afterwards.

A per-finding "not a duplicate" dismissal is genuinely wanted but needs a table to remember the
decision, and the alert ledger already prevents the notification repeating. Deferred as a follow-up
rather than half-built: the current behaviour is correct, just less convenient on the page.

## Progress

- [x] D1 · [x] D2 · [x] D3 · [x] D4
