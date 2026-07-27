# D&D — everything waiting on Jack, in one place

**Written 2026-07-27.** Three docs sit in `in-progress/` and between them hold a long QA log. Everything
still open in all three needs a decision or data **from you** — none of it is blocked on effort. Finding
that out means reading three documents end to end, so this is the index.

> *No slice count here on purpose.* The first version of this line carried one and it was stale within six
> slices — the third time in this project a hand-maintained number in a header drifted from its body
> (slices 73 and 109 were the others, both of which I fixed by updating the number, which is what set up
> the next drift). **A figure that has to be maintained by hand will go stale; the fix is to not assert
> it.** What matters below is which items are open, and those change only when you decide one.

**It is an index, not a plan.** Each row points at the doc that holds the detail and the evidence; nothing
here is new. Deliberately filed at `docs/planning/` root rather than `in-progress/`, because it is not
itself a piece of work to be done.

---

## 1. Merge `6a014d6b` — the only item with real-world consequence

A public character's **full edit history, editor names included**, was readable by anyone who could open
the character. Confirmed against live data: **72 audit rows, 5 public characters**. Fixed in `6a014d6b`
(`edits/route.ts` now requires `canWrite`), and that commit is sitting unmerged on
`fix/variant-ux-2026-07-25` behind ~250 others.

**Nothing else on this page is a live exposure. This one is.**

---

## 2. Decisions — cost and severity are both known

| # | Decision | Cost | Severity | Detail in |
|---|---|---|---|---|
| 2.1 | **The blank-character flash.** Every 5e sheet renders `HP 1/1`, `LEVEL 1`, `AC 10` and all abilities `10/+0` until the client fetch lands — no skeleton, nothing marking it provisional. **It also fails a Core Web Vital**: CLS **median 0.194 over 5 runs (range 0.138–0.888)**, never once under the 0.1 "good" threshold, with the largest shift landing on `div.hero` at ~1560ms — exactly when the real data arrives. LCP median **1236ms** against **680ms** for the prop-driven IG sheet, which measured **0 CLS in 12 of 13 runs**. | **A:** expose `dbPhase` (~3 lines, `offline` is the template) + one render change → shows a loading state. **B:** pass the character in as a prop, as `IGSheet`/`PF2Sheet` already do → 4 touch points, flash gone. **B also fixes the CLS inherently; A only does if the loading state reserves exactly the real content's height** — the current blank hero is shorter, which is what jumps. | **456–764ms localhost, 2,522ms on slow 3G**, and that is a floor. `HP 1/1` is the same wrong number this doc already fixed once in its persistent form. Plus the page moves under the reader at ~1.5s. | `DND_FINAL_QA_WALKTHROUGH` slices 97–103, 115 |
| 2.2 | **`--danger` is a regression.** Base `#ff5252` cleared AA everywhere (5.69/5.28/4.70); `HEXTECH_GROUNDS` overrides it to `#c8413f`, failing everywhere (3.71/3.44/3.06). | One value. Set once in the shared grounds, so it fixes **all five themes**. | 12 text sites incl. `.tp-err` at 12px — **error text**. A red meaning *error* is semantically fixed; no brand identity rides on the shade. | slice 72 |
| 2.3 | **The accent as section-heading text.** `.sec-num` is the base rule for every section head (~15 shared components). | A token swap. Each failing theme already carries a lighter sibling that reads — **no new colour to pick**. | Noxus **3.45/3.19**, Void Prophet **3.95/3.66** where labels actually sit. | slice 71 |
| 2.4 | **5e heading level skip** (`h1 → h3` at "Dossier"). | Not one line: the `h3` is styled **by tag** (`theme.css:862/873` + skin overrides), so promoting it drops its styling. Decouple the CSS, or use `aria-level="2"` and accept a workaround. Renders in two places. | WCAG 1.3.1, minor. | slice 105 |
| 2.5 | **IG sheet has no `<h1>`** — eleven headings, no top-level one. | The name renders through `SheetPortrait`; choosing which element becomes the `h1` is structural. | WCAG 1.3.1. A screen-reader user has no anchor for "what is this page". | slice 105 |
| 2.6 | **The PF2 prepared cap** (S7c). Everything needed is built — `pf2SpellCountsFor`, `kind`, `modelled`, and both budget displays already show the number. | Enforcement only. | It cuts against S15's recorded *"only ACQUISITION is gated"* boundary, and a refused prepare is a rules change a player feels. | `SLOT_DRIVEN_CHARACTER_BUILDING` S7c |
| 2.7 | **Homebrew feats on non-2024 characters.** A `general` feat saves successfully and no picker ever offers it. | Depends on 2.6-style judgement: 2014 feats are an **optional** rule in that edition, so "should 2014 offer feats at an ASI slot" is the actual question. | Silent — the designer validates, saves, and says it is flagged for DM review. | slices 76–79 |
| 2.8 | **Rangor / Pugilist** — do they become a real custom class + subclass through the Slice-5 builder? | One sentence. | **Answering this closes `DND_RULES_PLATFORM` entirely** — it is the doc's only open item. | `DND_RULES_PLATFORM` line 947 |
| 2.9 | **Per-system dice rollers** (S9 / Q4). The bug half is closed; what remains is a feature question. | — | — | `SLOT_DRIVEN_CHARACTER_BUILDING` |

---

## 3. Blocked on data only — no decision available

| Item | Needs |
|---|---|
| **S10 — IG Champion** | Champion's powers/specializations. The catalogue is scraped from intuitivegames.net and Champion is not in it; inventing the list is the one thing we must not do. |
| **Q6 — IG level-1 feat count** | The only number in that plan not source-verified. |
| **Magus / Summoner spell tables** | The published reduced-caster tables (Ground Rule 3). Every *full* caster is already handled. |

Each is pinned by a test that **flips when the data arrives**, so none of them can be quietly forgotten.

---

## 4. What is already done, so it is not re-litigated

Every user-facing `/dnd` route has been swept on: contrast (both bespoke sheets measure **0** failures
across 354 rendered nodes), viewport overflow, WCAG 2.5.8 target size, a 10px thin-target floor, keyboard
focus visibility, accessible names (**210** controls, 0 unnamed), landmarks / `lang` / duplicate IDs /
image `alt`, `prefers-reduced-motion` (**19** infinite animations, 1 exempt on purpose), network + broken
images across 11 routes, console errors on load **and** during interaction, and ability-modifier arithmetic
on every sheet. **126 API write handlers** were checked for gates that are called but not acted on: zero.

Twelve ways a browser measurement lies are indexed at the top of
`docs/planning/qa-evidence/contrast-sweep.md` — read that before running any sweep, not just a contrast one.

---

## 5. Which test to delete when you decide

The suite reports **11 expected-fail** entries. That is not a warning — each is a *pin*: a deliberate
`it.fails` recording a defect that is real today, keeping the suite green while making the finding
impossible to lose. **Fixing any of them turns the pin red** with *"expected to fail but passed"*, which is
the signal to delete it.

| Decision | Artefact | Pins |
|---|---|---|
| 2.1 flash | `__tests__/dnd/sheet-initial-state.test.ts` | **1** |
| 2.2 `--danger` · 2.3 accent-as-heading | `__tests__/dnd/colour-theme-accent-text.test.ts` | **8** (theme × panel-stop) |
| 2.4 5e heading skip · 2.5 IG has no `h1` | `__tests__/dnd/sheet-heading-outline.test.ts` | **2** |
| 2.7 homebrew feats on non-2024 | `__tests__/dnd/homebrew-feat-reachability.test.ts` | 0 — asserts the reachability matrix as it stands, both sides of the gap |
| 2.9 dice rollers · §3 data blocks | `__tests__/dnd/slot-plan-blockers.test.ts` | 0 — assertions flip when the data arrives |
| 2.6 prepared cap · 2.8 Rangor/Pugilist | — | Product/rules calls with nothing to pin; the detail is in `SLOT_DRIVEN_CHARACTER_BUILDING` S7c and `DND_RULES_PLATFORM` line 947 |

**Each pin also carries the constraint on its own fix**, which is the part that saves time: the store's
*"so no other character's content ever flashes"* comment is asserted next to the flash pin, and
`.dnd-sheet .card h3` next to the heading pin — so the reason the obvious one-line change is wrong is
visible at the point you would attempt it.
