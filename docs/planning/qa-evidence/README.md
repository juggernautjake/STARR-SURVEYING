# D&D final-QA walkthrough — evidence

Screenshots captured during the browser passes logged in
[`../in-progress/DND_FINAL_QA_WALKTHROUGH.md`](../in-progress/DND_FINAL_QA_WALKTHROUGH.md). Each was taken
against a real dev server with a real authenticated session, not a mock.

| File | What it shows |
|---|---|
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
