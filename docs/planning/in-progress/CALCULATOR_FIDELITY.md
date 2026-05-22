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
| **F-1** | **TI-36X Pro** — audit primary + shift labels, check trig/log row position, confirm `math` / `apps` / `data` keys map correctly. Fix any clear inaccuracies. | 2 hours |
| **F-2** | **Casio fx-991ES PLUS** — audit replay-pad position, STO/RCL row, the `S↔D` (fraction-decimal toggle) key, and the natural-display `□/□` fraction-builder. Fix any inaccuracies. | 2 hours |
| **F-3** | **HP 35s** — audit the 7-column layout (current emulator uses 6); confirm orange/blue dual-shift labels (currently only orange via `shiftLabel`); check ENTER spans + R↓ position. Fix layout. | 3 hours |
| **F-4** | **TI-30Xa** — verify the layout shipped today matches the real device; spot-check function-row order. | 1 hour |
| **F-5** | **TI-30XS MultiView** — split its keypad off from the 36X Pro reuse. Real MultiView has fewer keys (no matrix/vector menu, narrower stat) and a different `frac` key position. | 3 hours |
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
