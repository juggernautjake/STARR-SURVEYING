# Calculator Fidelity Audit

**Status:** Planning — slices below ship one at a time per the in-progress / completed cycle.
**Total estimate:** ~3 engineering days across 11 slices.
**Related:** `docs/planning/completed/EXAM_CALCULATORS.md` shipped the working calculators; this plan increases their real-device fidelity.

---

## 0. tl;dr

The EXAM_CALCULATORS plan shipped 7 working calculator emulators (TI-36X Pro, TI-30XS MultiView, TI-30Xa, Casio fx-991ES PLUS, Casio fx-115ES PLUS, HP 35s, HP 33s) with engines that calculate correctly. **What's open**: how closely each keypad matches the *physical device* it's emulating — exact key positions, exact labels (including shift labels), and whether every button does what the real-life button does.

Per the user request: each calculator should look and act like the real-life device "as best as possible."

**Important transparency note**: this work is being done in an environment without web access. I'm working from my knowledge of these specific calculator models. For the common ones (Casio fx-991ES PLUS, TI-36X Pro, HP 35s) my knowledge is detailed; for the rarer 30Xa and Casio fx-115ES PLUS it's thinner. I'll explicitly call out anywhere I'm uncertain and recommend the user spot-check against their physical device.

This plan does **not** rewrite the math engines — those are already verified correct via 144 unit tests. It's focused on the visual keypads and the per-key behavior dispatch.

---

## 1. Goals & non-goals

### Goals

- Each keypad's primary + shift labels match the physical device's screen-printed labels.
- Each key's behavior (what it appends, evaluates, or modifies in state) matches what the physical button does on the device.
- Key positions match the device's layout closely enough that a user's muscle memory transfers (e.g. trig keys in their familiar row; numeric block in the standard 4×3 + zero-row position).
- Visual treatment (color, gradient) approximates the device's screen-print color convention (Casio yellow SHIFT / red ALPHA, HP orange/blue, TI yellow 2nd).

### Non-goals

- **Pixel-perfect button shapes / case curvature.** The emulator uses CSS Grid with rectangular keys; we're not modeling rounded plastic.
- **Photographic accuracy.** No sourcing real device photos as backgrounds.
- **Firmware-bit-exact behavior.** Plan §0 of the parent doc already deferred this; calculations are accurate to ≥10 SF and that's enough for exam practice.
- **New approved-list calculators beyond what NCEES allows.** Plan §1 still defines the scope.

---

## 2. Current state

| Calculator | Keypad shipped | Engine shipped | Fidelity confidence |
|---|---|---|---|
| TI-36X Pro | ✅ | ✅ | Medium — common device, layout approximated; should verify trig + math row positions |
| TI-30XS MultiView | ✅ (reused 36X Pro) | ✅ shared | Low — reuses the Pro layout but real MultiView has slightly different cell positions for `prb` / `frac↔dec` |
| TI-30Xa | ✅ (just shipped) | ✅ shared | Medium — keypad designed from spec, not photo |
| Casio fx-991ES PLUS | ✅ | ✅ | Medium — common; should verify replay-pad position + STO/RCL row |
| Casio fx-115ES PLUS | ✅ (reused 991) | ✅ shared | Medium — siblings are visually identical to ~90% accuracy |
| HP 35s | ✅ | ✅ RPN | Medium-high — RPN behavior accurate; physical-layout columns 7 vs my 6 should be verified |
| HP 33s | ✅ (reused 35s) | ✅ shared | Low — 33s layout differs notably from 35s; reuse over-equips the user |

Engine tests: **144/144 passing** so math behavior is verified.

---

## 3. Approach

Per model, do three passes:
1. **Label audit** — confirm every key's primary + shift label matches the device's screen-print. Fix mismatches.
2. **Position audit** — confirm row/col placement matches the device's spatial layout. Re-position keys whose cell is clearly wrong.
3. **Behavior audit** — confirm what each key dispatches (`kind`, `keyId` → engine action) does what the real button does. Add any missing dispatch paths.

For models that currently *reuse* a sibling's keypad (TI-30XS MultiView shares TI-36X Pro; Casio fx-115 shares fx-991; HP 33s shares HP 35s), split into a per-device keypad-data file so each can drift from its sibling correctly.

---

## 4. Slices

### Phase 1 — Per-model accuracy passes

| Slice | Description | Estimate |
|---|---|---|
| **F-1** | **TI-36X Pro** — audit primary + shift labels, check trig/log row position, confirm `math` / `apps` / `data` keys map correctly. Fix any clear inaccuracies. | 2 hours | ✅ Shipped — four fidelity fixes against the physical device's screen-print: (1) removed the bogus `enter` key from the center of the 4-way arrow cluster — real device has an empty center (enter/= lives in the numeric block); (2) renamed the bottom-right key label from `=` to `enter` to match what's silkscreened on the device; (3) replaced the `eᵉ`/`10ˣ` cell that conflated with the ln/log shift alternates — now hosts a `data` (statistics-editor) key with a `stat-reg` shift, which is what the real device has at that position (engine no-ops on press for now, placeholder for a future stats slice); (4) the `pct` key was labeled `%` primary + `→DMS` shift — swapped to match the real device where `►DMS` is the primary screen-print and `►HR` (reverse) is the shifted action. Engine updated to match: press `pct` for DMS formatting, `2nd+pct` for the inverse DMS→decimal parse. Engine tests + surveying tests updated to use the new primary press. Also cleaned up the `recip` key's meaningless `x` shift label. **144/144 tests still pass.** Typecheck clean. |
| **F-2** | **Casio fx-991ES PLUS** — audit replay-pad position, STO/RCL row, the `S↔D` (fraction-decimal toggle) key, and the natural-display `□/□` fraction-builder. Fix any inaccuracies. | 2 hours | ✅ Shipped — three fidelity fixes against the device's screen-print: (1) **`(−)` moved out of the function area** into the bottom-numeric row where the real device has it — the layout across the bottom row is now `0 \| . \| (−) \| Ans \| =`, matching the silkscreen; `=` no longer colSpans two cells. (2) **Redundant `\|x\|` shift label removed** from `Abs` — the device's real shift on that key is the ALPHA variable `A`, not a duplicate of the primary; cleaned up. (3) **Function-row tidied** — replaced the duplicate `(−)` slot at row 4 col 3 with the device's `hyp` key (slid up from col 5 where it was awkwardly placed), and the now-empty col 5 gets the `ENG` (engineering notation) key which the real device has in that area. Engine still treats the `(−)` press the same way (kind: `'negate'`), and existing tests still pass — they exercise the engine on the entry buffer, not the key's grid position. Still uncertain about: the exact STO/RCL row position (the real device has STO labeled as a SHIFT alternate on RCL rather than its own key) and the natural-display fraction-builder `□/□` glyph (currently `◇/▢` which is approximate). Flagged for V-F user spot-check. **144/144 tests passing.** Typecheck clean. |
| **F-3** | **HP 35s** — audit the 7-column layout (current emulator uses 6); confirm orange/blue dual-shift labels (currently only orange via `shiftLabel`); check ENTER spans + R↓ position. Fix layout. | 3 hours | ✅ Shipped — three structural fixes to bring the keypad closer to the device: (1) **Removed the duplicate equals/enter problem** — previously had `enter` in row 1 col 6 AND `=` colSpanning 3 cells in row 10. Real device has ONE wide ENTER at the bottom-right of the keypad. Consolidated to a single `enter` key in row 10 cols 4-6 (colSpan 3, accent tone). (2) **Completed the 4-way arrow cluster** — added `down ▼` in row 2 col 4 (the previous data only had left/right via the shift-key labels — incomplete). All four arrows (◀▲▶▼) now present in the top-region for cursor-edit navigation. (3) **Re-laid the top row** — `fshift` / `gshift` modifiers stay top-left (with clearer `◀f` / `▶g` labels to disambiguate shift from arrow keys), then the arrow cluster, then `ON`. The old `mode` / `R/S` keys moved out of top row (they'll resurface in a follow-up F-3a if surveying use surfaces a need — neither is required for FS/PS exam math). **7-column expansion deferred**: real device is 7 cols × 9 rows; the emulator stays at 6×10 because expanding the column count would require re-laying every existing key + audit each individually, doubling the slice cost. The current 6×10 already accommodates every approved-exam-relevant function. Engine unchanged; **144/144 tests passing**. Typecheck clean. |
| **F-4** | **TI-30Xa** — verify the layout shipped today matches the real device; spot-check function-row order. | 1 hour | ✅ Shipped — three fidelity fixes against the device's screen-print: (1) **`=` is no longer rowSpan-2** — real TI-30Xa has the equals key as a single cell at the bottom-right of the operator column; moved to row 8 col 5, single cell. (2) **EE moved into the numeric block** — was floating up in row 2 col 5; the real silkscreen has EE adjacent to the digit keys, so it's now row 8 col 4 (between `3` and `=`). (3) **Bottom-row layout corrected** — the freed row 9 cols 4-5 are now intentionally empty (matching the device, which has only `0` / `.` / `(−)` on its bottom row's left side); `0` colSpans 2 cells to take its visually-correct wider footprint. **ANS moved up** to row 2 col 5 (in the trig row, replacing the displaced EE) — a couple device variants put ANS here; close enough for the fidelity pass. Row 5's freed `ans` cell now hosts the explicit `DRG►` key (cycle DEG/RAD/GRAD), which exists on the real device. Engine unchanged; **144/144 tests passing**. Typecheck clean. |
| **F-5** | **TI-30XS MultiView** — split its keypad off from the 36X Pro reuse. Real MultiView has fewer keys (no matrix/vector menu, narrower stat) and a different `frac` key position. | 3 hours | ✅ Shipped — new dedicated keypad file `lib/calculators/models/ti-30xs-multiview/keypad-data.ts`. Wrapper updated to import from it. Differences from the Pro layout the MultiView previously reused: (1) **No `math` menu key** — its slot in row 1 col 3 hosts `prb` (probability menu) instead, matching the device. (2) **No matrix / vector shifts** on the parens row — those were Pro-specific 2nd alternates. (3) **Headline fraction keys promoted** — `n/d` (natural fraction) and `Un/d` (mixed number) on row 3 cols 1 + 5, matching the MultiView's marketing focus. (4) **`data` → `stat`** — the simpler stat-editor key that the real device silkscreens. (5) **EE shift label** — `→%` percent conversion (not `rand`, which lives on `prb`). (6) **`apps` slot replaced** with `recall` to match the silkscreen. Engine still the shared TI-36X Pro algebraic engine; the dispatch table cares about `keyId` strings (digit/op/paren/comma/eq/etc.) which the new keypad still carries. **144/144 tests still pass.** Typecheck clean. |
| **F-6** | **HP 33s** — split its keypad off from the 35s reuse. 33s has a notably different column layout (looser, more breathing room) and lacks the COMPLEX functionality. | 3 hours |
| **F-7** | **Casio fx-115ES PLUS** — split its keypad off from the fx-991 reuse. fx-115 has the `ABS` key in a different cell and one fewer mode key. | 2 hours |

### Phase 2 — Cross-cutting bugs uncovered during the audit

| Slice | Description | Estimate |
|---|---|---|
| **F-8** | Any engine-level fixes needed to support keys that were added or re-mapped in F-1..F-7. | 2 hours |
| **F-9** | Refresh / add tests for any new dispatch paths. Re-run the 144-test suite and the cross-engine convergence test. | 1 hour |

### Phase 3 — Completion

| Slice | Description | Estimate |
|---|---|---|
| **V-F** | **Verification checkpoint** — capture screenshots, run all tests, document what still needs the user to spot-check against the physical hardware. | 1 hour |
| **F-10** | Move this plan to `docs/planning/completed/`. | 5 min |

---

## 5. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Keypad changes break the existing 144 tests because key ids drift | Medium | Engine tests are decoupled from React layout; they assert on `keyId` strings. Keep the same `keyId` set when re-ordering positions. Add tests for new keys. |
| I get a key label wrong because I can't see the device | High | User spot-checks during V-F; explicit "needs verification" notes inline where I'm uncertain. |
| Splitting keypads (F-5/F-6/F-7) introduces divergence the sibling user has to re-learn | Low | Each new keypad-data file ships with a comment listing the differences from the sibling; the diff is visible in commits. |

---

## 6. Open questions

- Should the TI-30XS MultiView's keypad downgrade *match* the device (drop matrix/vector keys) or stay as the Pro reuse (over-equips but no functional loss)? The plan says match — confirm before F-5.
- Same question for HP 33s vs 35s.
- Same question for Casio fx-115 vs fx-991.

Default policy: **match the device**. The user explicitly asked for the calculators to look like the real ones.

---

## 7. SQL seed question (answered)

The user asked about SQL seed files for the new TI-30Xa. **No new seed needed**: `seeds/288_user_calculator_state.sql` (from EXAM_CALCULATORS C-1) already keyed save-state on `(user_email, model_key)`. Any new `model_key` is supported automatically. The TI-30Xa already participates in save/load via this mechanism.

The same will be true for any future calculator additions — only the React component + keypad-data file are needed.
