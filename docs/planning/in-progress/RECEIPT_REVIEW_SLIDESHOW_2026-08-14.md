# Reviewing receipts without clicking each one

**Started 2026-08-14. Active.**

Owner, 2026-08-14:

> *"I want to make it so that we can review receipt entries in a slide show format, so that instead
> of having to go down and individually click each receipt to open it, (which we can also do), we
> will have it where we get a slide show element that shows the receipt image enlarged on the left,
> and then all of the receipt summary and options and results on the right for pc, and then just the
> image on top of the summary and AI results on mobile. But we will have right and left arrows that
> allow us to scroll through them."*

> *"We also need to be able to review receipts based on what job they are assigned to, what day they
> were recorded or the purchase on them was made, and we need to be able to search receipts based on
> type of purchase, location, and the payment method used. We need it so that we can input a card
> number or select from the saved cards on file and see all of the receipts related to that payment
> method."*

> *"Sometimes the AI gets info wrong, so we need to be able to rerun AI analysis for all receipts,
> and we need to be able to manually edit all of the info for each receipt if needed. Please also
> make it so that we can zoom in on the receipts to review the information and pan around on the
> image."*

Three things: a **viewer** (the slideshow, with zoom), a **way to find the set you want to review**
(the filters), and **correction** (edit anything, re-run the AI). The viewer is new. The filters are
mostly a query-building problem over columns that already exist. Correction is half-built already
and the missing half is bulk.

---

## What is actually there today

Measured 2026-08-14 against the live database and the code.

| Thing | State |
|---|---|
| `receipts` table | **Rich.** 59 columns. Everything the review needs is already extracted — see below. |
| Receipt photos | `receipts.photo_url` holds a storage key (`<user_id>/<receipt_id>.png`) in bucket `starr-field-receipts`. |
| List API | `GET /api/admin/receipts` — filters on `status`, `from`/`to`, `email`, `jobId`, `include_deleted`, `limit`. Signs each photo for **15 minutes** and batches in submitter, job name, line items, and the payment card. **No paging** — one `.limit()`, capped at 500. |
| Per-receipt edit | `PATCH /api/admin/receipts/[id]` — accepts status, category, tax flag, notes, `job_id`, `expense_nature`, `expense_nature_note`, `payment_card_id`. **Not** vendor, total, date, or the other extracted fields. |
| Re-run the AI, one receipt | **Already exists.** `POST /api/admin/receipts/[id]/extract` with `{ force: true }`. |
| Re-run the AI, many | Does not exist. `sweepQueuedReceipts` covers the `queued` backlog only, and deliberately never forces. |
| Bookkeeper queue UI | `app/admin/receipts/page.tsx` — **1,823 lines**, one file, inline style objects, several hardcoded hex colours. Rows expand in place; there is no image viewer, no zoom, and no next/previous. |
| Card registry | `payment_cards` (id, last4, brand, label, role, holder_name, retired_at…). One card on file today. |

**Live data (2026-08-14):** 14 receipts, 13 not deleted. All 14 have a photo and all 14 have finished
extraction. Categories in use: supplies, meals, fuel, lodging. Payment methods: card (11), cash (2).
**Zero receipts are assigned to a job**, and one has a `payment_card_id`. The set is small today,
which makes it a good build target and a bad performance test — every list read is paged and capped
at 500 regardless.

### The columns that make this feature cheap

The extractor already writes the fields the owner wants to search on, which is why most of this is a
query and a screen rather than a data project:

- **Type of purchase** → `category` (+ `category_source`: `ai` or `user`)
- **Location** → `vendor_name`, `vendor_address` (a real street address, e.g. *"2210 N Solano Dr,
  Las Cruces, NM 88001"*)
- **Payment method** → `payment_method` (`card` | `cash` | …), `payment_last4`, `payment_card_id`
- **The two dates the owner named separately** → `transaction_at` (when the purchase happened) and
  `created_at` (when it was recorded)
- **Money** → `subtotal_cents`, `tax_cents`, `tip_cents`, `service_charge_cents`, `total_cents`
- **How sure the AI was** → `ai_confidence_per_field` (a JSONB map, per field, 0–1)
- **What went wrong** → `extraction_status`, `extraction_error`, `extraction_cost_cents`

`ai_confidence_per_field` is the one nobody asked for and the one that makes this screen good: the
review can point at the two fields the AI was least sure about instead of asking a person to re-read
all fourteen.

---

## Design decisions taken before building

### D1 — This gets a stylesheet, not inline style objects

The rest of the receipts page is `style={{…}}` objects. That is why it has no responsive behaviour:
**an inline style cannot contain a media query**, and it cannot express `:hover`, `:focus-visible`,
or `:active` either. The owner's requirement is explicitly two layouts — side-by-side on a PC, image
stacked over the summary on a phone — so the media query is not a nicety, it is the requirement.

So the viewer ships with `ReceiptSlideshow.css`. Every colour comes from `app/styles/tokens.css`.

**No hardcoded hex.** The existing page has `#666` and `#ccc` in it, which are invisible in one of
the two themes. And the palette is `--color-error*` — there is **no `--color-danger*`**; a `var()`
naming a token that does not exist is dropped silently and the element renders with no colour at
all. That mistake shipped elsewhere in this repo on 2026-08-14 and is now caught by
`__tests__/admin/css-tokens-exist.test.ts`.

### D2 — One pointer path, not a mouse path and a touch path

Zoom and pan need to work with a mouse, a trackpad, a finger and a stylus. Writing `mousedown` +
`touchstart` separately is how a feature works on the desk and not on the truck. Pointer Events
cover all four, and `setPointerCapture` is what keeps a drag alive when the pointer leaves the
image — without it, panning stops the moment you reach the edge, which feels like the image is
stuck.

### D3 — A signed URL outlives its usefulness in 15 minutes

`SIGNED_URL_TTL_SEC = 60 * 15`. A bookkeeper reviewing forty receipts will still be reviewing them
in twenty minutes, at which point **every remaining image 403s** and the slideshow shows broken
frames for receipts that are perfectly fine.

This is the kind of failure that gets reported as "the images stopped loading" and diagnosed as a
storage problem. The viewer therefore re-signs on demand: an image that fails to load asks for a
fresh URL once and retries, and the list refreshes its URLs when it has been open longer than the
TTL. Cheap, and it removes a whole class of support question.

### D4 — Navigating away from unsaved edits must not lose them

The whole point of the arrows is fast movement. Fast movement plus an edit form is how somebody
types a corrected total, presses →, and loses it. Edits save explicitly, and moving off a dirty
receipt asks first. A "saved" acknowledgement appears where the person is looking, not in a toast
that is already gone.

### D5 — Bulk re-run spends money, so it says how much before it runs

Each extraction is a vision call against a photo and writes `extraction_cost_cents`. "Re-run the AI
for all receipts" over a filtered set of 400 is a real bill. The control names the **count** it is
about to re-read and runs against the **current filter**, not the whole table. It runs in bounded
batches so one click cannot start four hundred concurrent model calls.

### D5b — Three things the audit found that change the build

**The date filter does not filter the date it says it does.** `from`/`to` bound **`created_at`**, not
`transaction_at` — while the route's own header comment says it uses `transaction_at` *"OR (when
null) created_at"*. It does not; there is no COALESCE. So "show me April" today means "recorded in
April", and a receipt photographed in May for an April purchase is filed under May with no way to
ask otherwise. F1's `dateField` is not a nicety on top of a working filter — it is the fix.

**The viewer cannot live inside the row.** `styles.row` carries `overflow: 'hidden'`, and that has
already clipped an expanded panel out of existence once (recorded in the page at lines 678–692).
The slideshow renders as a fixed-position overlay, outside the card's stacking and clipping context.

**Two precedents to combine, neither sufficient alone.** `JobPhotoGallery.tsx` has a working
lightbox — backdrop close, `Esc`, `←`/`→` with wrap, an "N of M" caption — and no zoom.
`SourceDocumentViewer.tsx` has wheel-zoom and drag-pan — and is mouse-only (no pointer events, no
touch, no pinch), is not cursor-anchored, and `console.log`s on every wheel tick. The viewer takes
the shell from the first and rewrites the second properly per D2.

### D6 — The viewer opens over the list, and the list keeps its filters

The slideshow is a view of *the set you already chose*, not a separate page with its own search. It
opens on the row you clicked, arrows move within that filtered set in the order shown, and closing
returns you to the list with the filter intact. The owner asked for the per-receipt path to keep
working — *"which we can also do"* — so the existing expand-in-place row stays exactly as it is.

---

## Group F — find the set you want to review

### F1 — The list API learns the filters the review needs

Today it filters on status, date range, submitter, and job. Add, as query parameters:

- `category` — type of purchase
- `q` — free text, matched against `vendor_name` **and** `vendor_address`, so "Las Cruces" and
  "Desert Sands" both work
- `paymentMethod` — `card` | `cash` | …
- `last4` — a typed card number's last four, which finds receipts whose card is **not** on file
- `cardId` — a saved card from `payment_cards`
- `dateField` — `purchase` (`transaction_at`) or `recorded` (`created_at`), because the owner named
  those as two different questions and today's `from`/`to` conflates them

The rules go in a pure module with tests. The route builds a query; it does not decide policy.

**Done when:** every filter above returns the right rows, `dateField` genuinely changes which column
is bounded, and `last4` finds a receipt whose card is not in the registry.

### F2 — A card-centric view

Pick a saved card, or type four digits. Shows every receipt on that card with a total, so
*"what has gone on the Mastercard ending 4824"* is one action.

**Done when:** selecting a card on file and typing its last four give the same set, and a card with
no `payment_cards` row still finds its receipts by `payment_last4`.

### F3 — The filter bar

Surface F1 in the queue: category, the text search, payment method + card picker, and a date-basis
toggle (*purchased* / *recorded*) next to the existing range. Shows the active filter as removable
chips, because a filtered list that does not say it is filtered is how somebody concludes a receipt
was deleted.

**Done when:** the filters compose, the URL carries them (so a filtered review is linkable), and
clearing is one action.

---

## Group V — the viewer

### V1 — The shell

Opens over the list on the receipt you clicked. Left/right arrows, `←`/`→`, and `Esc` to close.
Shows *"7 of 31"*. Pre-loads the next and previous images so an arrow press is instant rather than a
flash of empty frame. Focus is trapped while it is open and returns to the row that opened it.

**Done when:** a bookkeeper can walk 31 receipts start to finish from the keyboard without touching
the mouse, and every image is already there when they arrive.

### V2 — The image stage: zoom and pan

- Wheel / trackpad pinch to zoom **about the cursor**, not the centre — zooming to a corner and then
  hunting for it is the difference between usable and not.
- Drag to pan, with pointer capture (D2).
- Double-click / double-tap toggles fit ↔ 100%.
- Buttons for zoom in / out / fit / rotate, because a trackpad is not the only input.
- Panning is clamped so the image cannot be flung off screen and lost.
- Zoom resets when you move to the next receipt — inheriting the previous receipt's 4× zoom on a
  differently-sized photo lands you in the middle of nowhere.

**Done when:** the small print on a fuel receipt is readable, and getting back to the whole receipt
is one click.

### V3 — The detail panel

Everything known about the receipt, in the order a person checks it: vendor and address, date,
totals (subtotal / tax / tip / total), category, payment method and card, job, tax treatment,
expense nature, the transcribed line items, and the submitter.

Fields the AI was unsure about are **marked**, using `ai_confidence_per_field`. Extraction failures
show `extraction_error` in words rather than a blank panel.

**Done when:** the panel answers "is this right?" without opening anything else.

### V4 — Edit anything

Every extracted field becomes editable: vendor, address, the money fields, the date, category,
payment method, last four, card, job, tax flag, notes. Save is explicit, dirty state is obvious, and
a save records that a human touched it (`user_reviewed_at`, `category_source = 'user'`) so a later
AI pass does not quietly overwrite a correction.

`PATCH /api/admin/receipts/[id]` accepts a fraction of these today; it needs the rest, with
validation, because a total typed as "12.3.4" must not reach the column.

**Done when:** a wrong total can be corrected in the viewer in under ten seconds and stays corrected
after a re-extraction.

### V5 — Re-run the AI

- **This one** — a button in the viewer, calling the existing `force: true` route, showing progress
  and re-rendering the fields when it lands.
- **All of them in the current filter** — bounded batches, a count and a confirmation first (D5),
  progress as it goes, and a summary of what changed.

**Done when:** a bookkeeper who sees a mis-read vendor can re-read that receipt without leaving the
viewer, and can re-read a whole month after the prompt improves.

### V6 — The phone

Image on top, summary and AI results underneath, arrows reachable with a thumb. Pinch to zoom, drag
to pan. This is a media-query layout switch, not a second component (D1).

**Done when:** the same review is possible on a phone, including zooming into small print.

---

## Group P — it is pleasant and it is correct

### P1 — Styling pass

Tokens only, both themes, focus-visible rings on every control, hit targets that work with a thumb,
and no layout shift as images load.

### P2 — Drive it in a browser

Desktop and phone widths, against real receipts: arrows, keyboard, zoom, pan, an edit, a re-run.
Fix what is broken.

---

## Ledger

| Slice | State |
|---|---|
| F1 List API filters | ✅ SHIPPED 2026-08-14 |
| F2 Card-centric view | ✅ SHIPPED 2026-08-14 — card picker + typed last-four, both in the filter bar |
| F3 Filter bar | ✅ SHIPPED 2026-08-14 |
| V1 Viewer shell + arrows | ✅ SHIPPED 2026-08-14 |
| V2 Zoom + pan | ✅ SHIPPED 2026-08-14 |
| V3 Detail panel | ✅ SHIPPED 2026-08-14 |
| V4 Edit anything | ✅ SHIPPED 2026-08-14 |
| V5 Re-run AI — one | ✅ SHIPPED 2026-08-14 |
| V5b Re-run AI — bulk over the filter | ⬜ |
| V6 Phone layout | ✅ SHIPPED 2026-08-14 |
| P1 Styling pass | ✅ SHIPPED 2026-08-14 |
| P2 Browser QA | 🔶 desktop + phone driven; bulk re-run untested because unbuilt |

### What the build found (2026-08-14)

**The date filter never filtered the date it claimed to.** `from`/`to` bounded `created_at` while the
route's own header said it used `transaction_at` *"OR (when null) created_at"*. There was no COALESCE
and never had been, so "show me April" meant *recorded* in April — a 28 April purchase photographed
on 2 May was filed under May and no query could say otherwise. `dateField` is the fix, defaulting to
`recorded` so no existing caller's results move.

**A `var()` naming a token that does not exist renders as nothing.** Writing the stylesheet, I
reached for `var(--border)` / `var(--surface)` — neither exists; the palette is `--color-*`. The
guard added earlier the same day caught it. `PayerDecision.tsx` records the identical mistake in its
own first draft, and the briefing recorder shipped `--color-danger` hours before. Three times in one
codebase for one confusion.

**An inline style silently defeated the entire mobile layout.** The image stage's wrapper was
`style={{ flex: '1 1 60%' }}`, so the media query's `.rcv__stage { flex: 0 0 46vh }` applied to the
element *inside* the flex child while the wrapper kept growing. The image took 61% of a phone screen
instead of 46% and pushed the summary most of the way off. Measured, not eyeballed — and it is
exactly the failure D1 predicts, committed by the person who wrote D1.

**Zoom-and-pan has three silent failure modes and a NaN.** Zooming about the centre rather than the
cursor (point at the total, scroll, the total slides away); unclamped panning; and a clamp written
only for the zoomed-in case, which flips a small image into a corner. All three are in the existing
`SourceDocumentViewer` precedent. A fourth — `Math.min/max` propagating `NaN` into
`translate(NaNpx)`, which drops the transform and snaps the image to a corner — was found by a
property test and is reachable from a pinch whose two pointers land on the same coordinate.

**A service worker served stale chunks through three dev-server restarts.** `starr-admin-v1-static`
kept handing the browser the previous build, so a fixed layout kept measuring broken. Worth knowing
before diagnosing "my change did not apply" as anything else: unregister the worker and clear
`caches` first.

**Order:** F1 first — every other slice reads the set it returns. Then V1–V3 as one run, because a
shell with no panel is not reviewable and a panel with no shell has nowhere to live. V4 and V5 are
independent of each other and both depend on V3. F2/F3 surface F1 and can land any time after it.
V6 and P1 are the same pass over the finished layout. P2 last.
