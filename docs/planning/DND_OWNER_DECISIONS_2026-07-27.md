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

## 1. ~~Merge `6a014d6b`~~ — **RESOLVED. It is on `main`.**

> **CORRECTED 2026-07-28.** This section said the fix was *"sitting unmerged on `fix/variant-ux-2026-07-25`
> behind ~250 others"* and that it was a live exposure. **It is neither** — it had already been merged:
> `git merge-base --is-ancestor 6a014d6b main` returns true, the `canWrite` gate is live in
> `edits/route.ts` before any row is read, and `__tests__/dnd/edit-history-access.test.ts` pins it in eight
> assertions including the public-character case.
>
> **The stale claim went on to cause real harm**, which is why it is corrected in place rather than deleted.
> The 2026-07-28 structural audit read this page, restated it verbatim as finding F-4, called it *"the only
> live exposure in the entire audit"*, and ranked it first on a 76-slice roadmap — all without checking git.
> Anyone acting on that would have spent their first action re-fixing a fixed bug.
>
> The irony is on the nose: this document's own header warns twice about exactly this — *"a figure that has
> to be maintained by hand will go stale; the fix is to not assert it"* and, of a sibling doc, *"prose kept
> asserting what the evidence had moved past."* **A status claim is a hand-maintained figure too.** Treat
> any claim on this page about the state of the code as a lead to verify, not a finding to repeat.

**The original text, kept so the correction can be checked against what it corrects:**

> A public character's **full edit history, editor names included**, was readable by anyone who could open
> the character. Confirmed against live data: **72 audit rows, 5 public characters**. Fixed in `6a014d6b`
> (`edits/route.ts` now requires `canWrite`), and that commit is sitting unmerged on
> `fix/variant-ux-2026-07-25` behind ~250 others.
>
> **Nothing else on this page is a live exposure. This one is.**

The *defect* description was accurate and the fix is real — only its merge status was wrong.

---

## 2. Decisions — cost and severity are both known

> **UPDATED 2026-07-27, later the same day.** You answered this page with a mandate ("make the best
> decision… I trust your judgement"), which unblocked five of the nine. **2.1–2.5 are shipped**; they stay
> listed, struck through, because a decisions index that deletes what it resolved cannot be checked against
> what it used to say. The four that remain are the ones your mandate did not settle or that need data.

| # | Decision | Cost | Severity | Detail in |
|---|---|---|---|---|
| ~~2.1~~ | ~~**The blank-character flash.**~~ **SHIPPED `d3670a52`** — took option B (prop-threading), the pattern `IGSheet`/`PF2Sheet` already used. First paint now reads `HP 32/32 · LEVEL 3 · STR 19` at **41ms**, where it read `HP 1/1` through 2049ms. CLS median **0.194 → 0**. | | | slices 97–103, 115, 126 |
| ~~2.2~~ | ~~**`--danger` is a regression.**~~ **SHIPPED `70917238`** — but *not* as "one value". The premise was wrong: the token is read in two directions that pull apart, and every value fixing text-on-panel breaks label-on-fill. Split into `--danger` / `--danger-ink` / `--danger-on`, the latter two **derived per theme**. | | | slice 127 |
| ~~2.3~~ | ~~**The accent as section-heading text.**~~ **SHIPPED `70917238`** — the sibling swap this page costed was *not* taken. It fixes the five themes someone measured; the derivation fixes the skin × theme product, which is the real surface. | | | slice 127 |
| ~~2.4~~ | ~~**5e heading level skip.**~~ **SHIPPED `ca1baf67`** — decoupled the CSS (`.card :is(h2, h3)`) rather than using `aria-level`. Bigger than this row said: **~25 card titles across 12 panels**, not two, because the sheet is tabbed. | | | slices 105, 128 |
| ~~2.5~~ | ~~**IG sheet has no `<h1>`.**~~ **SHIPPED `ca1baf67`** — the masthead `<strong>` became it. **PF2 had the identical defect and is not on this page**, because IG is only where a browser pass happened to look. | | | slices 105, 128 |
| ~~2.6~~ | ~~**The PF2 prepared cap** (S7c).~~ **ANSWERED + SHIPPED** — enforced, because 5e already enforces its own prepared cap and two systems disagreeing about whether a published budget means anything is worse than either answer. **This row's severity note was wrong:** preparing does *not* cut against S15's *"only ACQUISITION is gated"* boundary, because preparing acquires nothing — it assigns spells the character already holds into slots the sheet already publishes. | | | `SLOT_DRIVEN_CHARACTER_BUILDING` S7c |
| ~~2.7~~ | ~~**Homebrew feats on non-2024 characters.**~~ **ANSWERED + SHIPPED for 2014** — a saved homebrew feat is now offered at the ASI slot, uncategorised (2024's tracks do not exist in 2014). **The framing here understated the case:** 2014's OFFICIAL catalogue is *one* feat (Grappler) and can never be more — the rest is PHB-only content outside the CC-BY licence — so homebrew is not an optional extra for that edition, it is its only real feat route. PF2/IG stay excluded on purpose: they have no ASI slot, so a 5e-shaped feat there is a category error. **Now also shipped:** the one *official* 2014 feat reaches the picker too, via the system-keyed dispatcher `dnd5e-2014.ts` prescribed — `FeatChoice` was narrowed from the 2024 catalogue's type to a presentation shape, so neither edition claims the other's structure. | | | slices 76–79 |
| ~~2.8~~ | ~~**Rangor / Pugilist.**~~ **ANSWERED + SHIPPED** — Rangor scoped to every system, Pugilist co-credited to **Andrew & Jacob**, both live in each system's library (browser-verified on PF2). Two corrections to this row: the premise was stale — they were *already* real catalog content, so scope and credit were the actual question — and **it did not close `DND_RULES_PLATFORM`**. That doc's header claimed one open item based on a `- [ ]` count of zero, while Slice 5 ("class + subclass still owed"), Slice 8b and Slice 18 were all open in other notations. (My own follow-up then miscounted "five `[~]` partials" — there are zero; I had grepped a token and matched prose, including my own sentence. Corrected in that doc.) | | | `DND_RULES_PLATFORM`, Slice 7's last item |
| ~~2.9~~ | ~~**Per-system dice rollers** (S9 / Q4).~~ **ANSWERED "NEITHER" + A REAL BUG FIXED** — the owner declined both options and asked instead that the maths be correct per system. The audit found a presentational defect in **both** bespoke rollers: they toned the banner from the natural face *after* `fourStepDegree` had already spent it, so a nat 20 landing on **Failure** rendered as a crit and a nat 1 on a **Success** as a fumble. Arithmetic was never wrong. Fixed as one shared `rollTone`; a test had been pinning the bug as the spec. | | | `SLOT_DRIVEN_CHARACTER_BUILDING` S9 |

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

A *pin* is a deliberate `it.fails` recording a defect that is real today: it keeps the suite green while
making the finding impossible to lose, and **fixing it turns the pin red** with *"expected to fail but
passed"* — which is the signal to delete it. That mechanism has now run its full cycle.

**The suite carries ZERO expected-fail entries, down from 11.** Every pin this page listed was deleted by
the commit that closed the defect it recorded — which is exactly what a pin is for, and is the first time
in this log that the count has gone to nothing.

| Decision | Artefact | Pins |
|---|---|---|
| ~~2.1 flash~~ | `__tests__/dnd/sheet-initial-state.test.ts` | 0 — pin replaced by 9 assertions on the fix, incl. `key={characterId}` on every provider |
| ~~2.2 `--danger` · 2.3 accent-as-heading~~ | `__tests__/dnd/colour-theme-accent-text.test.ts` + `theme-contrast-alternates.test.ts` | 0 — the 8 pins became **183 assertions** over 10 themes × 9 accents |
| ~~2.4 5e heading skip · 2.5 IG has no `h1`~~ | `__tests__/dnd/sheet-heading-outline.test.ts` | 0 — both pins became assertions, plus PF2, which was never pinned |
| 2.7 homebrew feats on non-2024 | `__tests__/dnd/homebrew-feat-reachability.test.ts` | 0 — asserts the reachability matrix as it stands, both sides of the gap |
| 2.9 dice rollers · §3 data blocks | `__tests__/dnd/slot-plan-blockers.test.ts` | 0 — assertions flip when the data arrives |
| 2.6 prepared cap · 2.8 Rangor/Pugilist | — | Product/rules calls with nothing to pin; the detail is in `SLOT_DRIVEN_CHARACTER_BUILDING` S7c and `DND_RULES_PLATFORM`, the item beginning "Jack: decide whether Rangor" |

**Each pin also carried the constraint on its own fix**, and that is the part that paid off. Every one of
the three closed rows was *bigger than this page said*, and in each case the pin's own note is what showed
it: the flash pin carried the store's *"so no other character's content ever flashes"* comment, which is
why the fix keyed the provider on `characterId` instead of just seeding it; the heading pin carried
`.dnd-sheet .card h3`, which is what revealed the promotion touches ~25 titles rather than two. **A pin
that records only the symptom would have produced three under-fixes.**

---

## 6. Why `in-progress/` never empties, and what would empty it

Worth stating once so it is not re-derived: **only you can move these docs.**

`docs/planning/README.md`'s rubric says a doc is IN-PROGRESS if *"it contains action items not yet done"* —
true of all three — and that when unsure, classify as IN-PROGRESS. There is a `pending/` folder whose
definition (*"scoped and parked deliberately… not being worked now"*) arguably fits better now that
everything left is owner-gated. **It is still the wrong move**, because these docs are where they are on
your explicit instruction:

> **REOPENED in `in-progress/` (owner 2026-07-25):** *"put everything into the in progress folder to allow
> the stop hook to work on it."*

So the folder empties when the items in §2 and §3 above are answered — not before, and not by reclassifying
anything. Every remaining item needs a decision or data that only you hold; none is blocked on effort, and
none can be deferred honestly, since the rubric is explicit that deferral is for work whose cost exceeds
its value, which is not the case for any of them.

**The shortest path to a smaller folder:** answering **2.8 (Rangor/Pugilist)** closes
`DND_RULES_PLATFORM` outright — it is that doc's only open item, and one sentence settles it.
