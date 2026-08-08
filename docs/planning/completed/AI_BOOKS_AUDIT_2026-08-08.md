# One-click AI audit of the books

**Started** 2026-08-08 · **Owner ask:** *"We need to be able to run an AI audit of all receipts and
expenditures and invoices for a given period to make sure they are all correct and make sense. Please
make sure this is built in somewhere and easy to use with the click of a button."*

---

## The design decision this whole feature turns on

`lib/ai/proactive.ts` already states the house rule, and it applies exactly here:

> These are rules, not model calls. "You are still clocked in" is a fact, and asking a model to notice
> it costs money, adds latency, and introduces the chance of a hallucinated alert — which is the one
> kind of notification that destroys trust in all the others. The model's job is phrasing and
> judgement, not arithmetic somebody can do in SQL.

So the audit is **two passes, not one**:

1. **Deterministic sweep, in code.** Every check whose answer is a fact — duplicates, unclassified
   rows, amounts that do not reconcile, invoices issued and never paid, receipts dated outside the
   period they were filed against. These findings are *certain*, and they are computed whether or not
   the AI half runs at all.
2. **Model pass, over the findings.** Claude receives the deterministic findings plus compact
   aggregates — never the raw ledger — and does the part that is genuinely judgement: which of these
   matter most, what a plausible innocent explanation is, what to check first, and what pattern spans
   several findings that no single rule could see.

The consequence worth stating plainly: **the model cannot invent a number.** It never sees enough raw
data to compute one, and every figure in its report was calculated in TypeScript first. An audit that
hallucinates a discrepancy is worse than no audit, because somebody will spend an afternoon hunting
for it.

## The second decision: it must work with the AI switched off

If `ANTHROPIC_API_KEY` is missing or the call fails, the endpoint still returns the full deterministic
report and says the narrative is unavailable. A financial control that goes dark when a third-party
API has a bad day is not a control.

---

## Checks in the deterministic sweep

**Receipts**
- Duplicates — reuses `findDuplicateExpenses`, so the audit, the page and the nightly alert share one
  definition of "counted twice".
- Uncategorised, or `tax_deductible_flag = 'review'` and still unreviewed at period end.
- No vendor name — unauditable by construction; nothing can be matched against it.
- Zero or negative totals.
- Amount outliers — more than 5× the median for that category. Not "large": a large survey is normal,
  a fuel receipt at 20× the usual is not.
- Filed long after the transaction date (>45 days), which is how a receipt lands in the wrong period.

**Invoices**
- Issued but never paid, past due.
- Marked paid with no corresponding `payments` row — the shape that makes revenue look real when no
  money arrived.
- Zero-total invoices.
- Paid before issued (timestamps inverted).

**Cross-cutting**
- Advertising counted in both `ad_spend_daily` and a receipt.
- Expense total wildly out of proportion to revenue for the period.

---

## Slices

### A1 — The deterministic auditor, pure
`lib/finances/books-audit.ts` — takes receipts, invoices, payments, ad spend; returns
`AuditFinding[]` with `severity`, `category`, `title`, `detail`, `ids`, `amount_cents`. Pure and
tested with frozen inputs.

### A2 — The audit endpoint
`app/api/admin/finances/audit/route.ts` — `?from=&to=`. Runs A1, then asks Claude for the narrative
over the findings. Degrades to findings-only when the model is unavailable.

### A3 — The button
On `/admin/finances/overview`, beside the range picker that already exists — the period is already
chosen there, so the audit inherits it and the click is genuinely one click.

### A4 — QA
`tsc`, tests, `npm run build`.

## Progress

- [ ] A1 · [ ] A2 · [ ] A3 · [ ] A4

---

## Completion notes — 2026-08-08

**A1 · shipped.** `auditBooks()` — 20 tests. Eleven checks across receipts and invoices, all pure.

The most important test is the one asserting a clean set of books produces **no findings at all**. An
auditor that always finds something is an auditor nobody runs, so several tests assert that ordinary
bookkeeping stays silent: same-day filing, an unpaid invoice before its due date, a large receipt in a
category with too few rows to have a meaningful median.

Two thresholds worth recording. Outliers are measured against the median of their OWN category — a
big survey is normal, fuel at 20× is not, and comparing across categories would flag every large
legitimate expense while missing the small anomalous one. And a category needs 5+ rows before the
check runs, because with two receipts the larger is always "5× the median" and the rule would fire on
every new category the firm starts using.

Duplicates reuse `findDuplicateExpenses`, so the audit, the finance page and the nightly alert share
one definition of "counted twice".

**A2 · shipped.** `/api/admin/finances/audit`. Deterministic sweep first, model second, and the model
receives ONLY the findings and the period totals — never the ledger. It therefore cannot invent a
figure: everything in its narrative was computed in TypeScript.

Payments are fetched without a date filter, deliberately. An invoice raised in June and paid in July
would otherwise be reported as "paid with no payment recorded" purely because the payment fell outside
the audited window — a false alarm on correct books, which is the failure this feature must not have.

Degrades cleanly: no API key, a timeout, or a bad day at the provider returns the full deterministic
report with `narrative_error` explaining which half is missing. A financial control that goes dark
when someone else's service does is not a control.

**A3 · shipped.** The button sits beside the range picker on `/admin/finances/overview`, not on a page
of its own — the period is already chosen there, so the audit inherits it and "one click" is literally
true. Changing the range clears the report rather than leaving July's findings under an August
heading. It does not run on page load: an audit costs a model call and is something you decide to do.

**A4 · shipped.** `tsc` clean, 116 tests across the affected suites, `npm run build` exit 0.

**Deferred: PDF/CSV export of the audit, and a saved history of past audits.** Both are real wants and
neither is needed to answer "do this period's books make sense". Export is a formatting job on a
payload that already exists; history needs a table. Left as follow-ups rather than half-built.

## Progress

- [x] A1 · [x] A2 · [x] A3 · [x] A4
