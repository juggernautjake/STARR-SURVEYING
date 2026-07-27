# D&D final-QA walkthrough — evidence

Artifacts from the browser passes logged in
[`../in-progress/DND_FINAL_QA_WALKTHROUGH.md`](../in-progress/DND_FINAL_QA_WALKTHROUGH.md). Each screenshot
was taken against a real dev server with a real authenticated session, not a mock.

> **Start with [`contrast-sweep.md`](./contrast-sweep.md) if you are about to run any browser sweep** — not
> only a contrast one. Its name says "contrast" and it is the general method: a working
> paste-into-devtools measurement, plus an index of **twelve ways a browser measurement lies**, over half
> of which have nothing to do with colour (closed `<details>` reporting layout boxes, values sampled before
> hydration, transitions read mid-flight, `rg -r` silently replacing matches). Every one produced a
> confident wrong result before it was written down. This README listed only the screenshots until
> 2026-07-27, so the most reusable thing in the directory was the one thing the index did not point at.

| File | What it shows |
|---|---|
| `contrast-sweep.md` | **The method, and its twelve known lies.** The snippet in it was corrected 2026-07-27 — it had shipped with three of the bugs the file itself documents. It is now verified by paste-and-run: PF2 84 samples / 0 failing, IG 210 / 0. |
| `pf2-sheet-vanilla.png` | **Pathfinder 2e** — Orin Sallowmere, a level-9 Seer Elf Wizard, on the bespoke PF2 sheet. Vanilla numbers: AC 24, Perception +12, Class DC 25. The same character under *proficiency without level* reads AC 15 / Perception +3 / Class DC 16 — every headline number down by exactly the level — which is how the settings slice was verified. |
| `ig-sheet-vanilla.png` | **Intuitive Games** — Vashti Kelln, level 6 Fighter/Freebooter, on the bespoke IG sheet with its stance rail and IG-native vitals. |
| `5e2014-sheet.png` | **D&D 5e (2014)** — Perrin Underbough on the shared 5e engine. |
| `builder-mobile-after.png` | The guided builder at **390px**, after the responsive fix. Single column, step rail stacked and no longer sticky, nothing overflowing. Before the fix this page measured **439px of content in a 375px window** and scrolled sideways. |

## What is deliberately not here

- **A "before" shot of the mobile overflow.** The fix shipped in the same slice it was found, and the
  measurement (439px in a 375px viewport, recorded in the slice log) is the durable evidence — a photo of a
  sideways-scrolled page is less legible than the number.
- **A GIF of a full creation flow.** The doc suggests one as "worth keeping". Skipped for now: the creation
  flow is still changing under these slices (three of its screens were altered in this pass alone), so a
  recording would be stale almost immediately. Worth capturing once the owner decisions listed at the end
  of the walkthrough doc are settled and the flow stops moving.
- **The six under-construction systems.** They have no builder to screenshot by design; their gate is
  covered by `__tests__/dnd/under-construction-gating.test.ts` instead.

## Are these still accurate?

Checked 2026-07-27, after ~90 further slices:

- **`builder-mobile-after.png` still matches the current build**, which is not luck. Slice 89 changed the
  step rail this screenshot shows — a 5px-tall navigation strip got a 25px tap target — but the fix was
  built to be visually identical (`padding` for the hit area, a negative `margin` to cancel its effect on
  the row, `background-clip: content-box` to keep the bar 5px). Same pixels, different target.
- **`pf2-sheet-vanilla.png`'s headline numbers still read true** — `Class DC 25` was re-observed on the
  live sheet during the ability-arithmetic sweep.
- **The GIF is still deliberately absent**, and for the reason originally given: it should wait until the
  owner decisions in
  [`../DND_OWNER_DECISIONS_2026-07-27.md`](../DND_OWNER_DECISIONS_2026-07-27.md) are settled and the
  creation flow stops moving.

A screenshot is evidence of a moment, so going stale is not a defect in itself — but a claim *about* a
screenshot can be, and those are what were re-checked.
