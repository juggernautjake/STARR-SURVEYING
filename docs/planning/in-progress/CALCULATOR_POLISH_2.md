# Calculator Polish (Round 2)

**Status:** Planning — slices ship one at a time per the in-progress / completed cycle.
**Total estimate:** ~1-2 engineering days across 8 slices.
**Related:** `docs/planning/completed/EXAM_CALCULATORS.md`, `docs/planning/completed/CALCULATOR_FIDELITY.md`.

---

## 0. tl;dr

After the first fidelity audit (`CALCULATOR_FIDELITY.md`) and user merge-test, three concrete refinements surfaced:

1. **History strip behavior** — the history rows piled up visually as new calculations arrived; needs a proper fixed-height scroll affordance so the display stays clean.
2. **Modal width** — keypads felt cramped; widths bumped per model.
3. **Image-based per-button audit** — the user explicitly asked to use Playwright + screenshotting to look up real device photos and verify each button's main + secondary functions.

P-1 and P-2 are already shipped in this session (committed alongside this plan). The remaining slices iterate on the image-based audit as Wikimedia rate-limits reset and additional reference photos become reachable.

---

## 1. Goals & non-goals

### Goals

- History strip stays a fixed-height widget no matter how many entries accumulate; vertical scroll bar is always visible; newest entry pinned at top via auto-scroll.
- Modal width increased per model so keypads aren't visually cramped.
- For each calculator, capture a reference photo and re-audit primary + shift labels + cell positions against the photo.
- Engine handlers wired for every key whose label changes during the audit.

### Non-goals

- Pixel-perfect button silhouettes — the emulator stays CSS Grid rectangular keys.
- Photographic backgrounds — no embedding real device imagery into the rendered UI.
- New approved-list calculators — scope stays the 7 already shipped.

---

## 2. Current state (start of this plan)

| Aspect | State |
|---|---|
| History strip | `app/admin/components/calculator/HistoryStrip.tsx` + `.calc-history` CSS — had a soft `max-height: 80px; overflow-y: auto` but no auto-scroll, no scroll-bar styling, no row flex-shrink protection. |
| Modal widths | Set per model in `CALCULATOR_MODELS` catalog. Range 280–340 px. Felt cramped per user. |
| Reference photos | None on disk; user-requested via Playwright + screenshotting. |
| Calculator tests | 151/151 passing. |
| Per-model keypad data | All 7 models own a dedicated `lib/calculators/models/<model>/keypad-data.ts` after the previous audit. |

---

## 3. Slices

### Phase 1 — Immediate user feedback (2 slices, ~30 min)

| Slice | Description | Estimate |
|---|---|---|
| **P-1** | Fix the history strip: fixed 58px height (≈ 3 visible rows), always-visible thin scrollbar (with cross-browser styling), `flex-shrink: 0` on rows so they never compress, auto-scroll-to-top on each new entry (newest pinned). | 15 min | ✅ Shipped — `HistoryStrip.tsx` gained a `useRef` + `useEffect` that resets `scrollTop = 0` on every row-count change so the newest entry stays visible at the top. CSS swapped the soft `max-height: 80px` for a fixed `height: 58px` (hard min/max), thin styled scrollbar (`scrollbar-width: thin` + WebKit overrides), and `flex-shrink: 0` on rows so they keep their full padding even when many entries accumulate. |
| **P-2** | Bump modal width per model so keypads are less cramped. Widths from 280/300/320/340 → 360/380/400 depending on model. Heights bumped proportionally to keep aspect ratio sane. | 10 min | ✅ Shipped — `CALCULATOR_MODELS` catalog updated: TI-36X Pro 320→380, MultiView 320→380, TI-30Xa 300→360, Casio fx-991/115 340→400, HP 35s/33s 280→360. Heights bumped by 20-40px each to preserve aspect ratio. Mobile center-lock breakpoint at ≤480px is unaffected. |
| **P-3** | Add `scripts/calc-fetch-refs.mjs` — Playwright script that navigates to each calculator's Wikipedia article, then in-page-fetches the upload.wikimedia.org thumbnail URL. Saves PNG to `/tmp/calc-refs/<model>.jpg`. | 30 min | ✅ Shipped — script committed. **Caveat documented**: Wikimedia rate-limits the bot quickly; a clean first run gets most models, but back-to-back runs return HTTP 400. Re-run with a several-minute wait between batches. The first run during P-4 captured ti-36x-pro.jpg + casio-fx-991.jpg + ti-30xs-multiview.jpg + smaller files for ti-30xa/hp-35s/hp-33s; the user can re-execute as needed. |
| **P-4** | **TI-36X Pro** photo audit — confirm `apps/data/math/prb` positions, verify `n/d`/`Un/d` natural-fraction keys, confirm `complex`/`num-solv`/`sys-solv` shifts, verify the `convert`/`unit`/`constants` row exists. Apply label fixes. | 1 hour | ✅ Partial — fetched + inspected real device photo. Confirmed: 2nd/mode/clear in top row, arrow cluster, vector/matrix shifts, complex/num-solv/n/d/Un/d/sys-solv row, prb/data row, recall/stat-reg, π/e/EE/(/), convert/unit/constants/func, x⁻¹/x²/x³/^, sin/cos/tan/log/ln, standard numeric block. **Applied this round**: renamed `frac` label from old-style "a b/c" to modern "n/d". **Deferred to a future slice**: adding the convert/unit/constants/func row, splitting `Un/d` into its own key, restructuring `prb` to be its own primary key. Implementation cost (~2 hrs) exceeds value for v1 — current keypad is recognizable + functional, and engine handles every engine-relevant key. |

### Phase 2 — Reference-image audit infrastructure (1 slice)

| Slice | Description | Estimate |
|---|---|---|
| **P-3** | Add `scripts/calc-fetch-refs.mjs` — Playwright script that navigates to each calculator's Wikipedia article, then in-page-fetches the upload.wikimedia.org thumbnail URL (the only path that gets past Wikimedia's CORS guard). Saves PNG to `/tmp/calc-refs/<model>.jpg` for the Read tool to inspect. | 30 min |

### Phase 3 — Per-model audit-from-photo (6 slices)

Each slice: (a) re-run the fetcher (or use a cached image), (b) compare keypad-data labels + positions to the photo, (c) update keypad data and engine handlers, (d) keep tests passing.

**User-provided reference photos in this conversation** (preserved for use across slices):
- **TI-30Xa**: 5 cols × 8 rows; green 2nd; black digits + operators with white labels; numeric block interleaved with function keys per row (NOT a 4×3 block); operator column on the right side spans rows 3-7 (÷ × − + =). Row 1: 2nd | DRG | LOG | LN | OFF. Row 2: HYP | SIN | COS | TAN | yˣ. Row 3: π | 1/x | x² | √x | ÷. Etc.
- **TI-36X Pro**: 5 cols × ~13 rows (lots of function keys above the numeric block). 2nd key has cyan/teal tone (not yellow). Distinct rows visible: `mode | delete` (with quit/insert shifts); `In log | math | data` (with d/dx□, matrix, stat-reg/distr shifts); `∫□dx` (with vector, random, expr-eval); `eᵈ 10ᵈ | EE | nCr/nPr | table | clear`; `complex π e | num-solv sin⁻¹ | poly-solv cos⁻¹ | sys-solv tan⁻¹ | %`; `xᴬ | ⅟□ | constants | op | set op`; `x² | □/□ | convert | base n | (-) operator`; numeric block 7-9 / 4-6 / 1-3 / 0; bottom row has `reset , answer (-) enter` and the `recall sto→` row above it.
- **Casio fx-991ES PLUS (2nd edition)**: 6 cols × ~10 rows. Cluster layout: SHIFT/ALPHA top-left, 4-way arrow REPLAY pad in center top, MODE/ON top-right. Key functional rows: CALC | ∫□ | (nav cluster) | x⁻¹ | log□; then ▫/▫ | √□ | x² | x³ | log | ln; then (-) | °′″ | hyp | sin | cos | tan; then RCL | ENG | ( | ) | S↔D | M+; then **digit rows: 7 8 9 DEL AC (green DEL+AC)**; 4 5 6 × ÷; 1 2 3 + −; 0 . ×10ˣ Ans =. Lots of orange (SHIFT) and red (ALPHA) tiny labels above each key.
- **Casio fx-115ES PLUS (2nd edition)**: white body (not black). Otherwise virtually identical layout to fx-991 — same 6-col grid, same SHIFT/ALPHA/REPLAY/MODE/ON pattern, same key set including S↔D, M+, ENG, hyp, °′″. Only visible differences are the body color (white vs black) and possibly some sub-shift labels.
- **HP 35s**: gunmetal body, 6 cols × ~10 rows. Distinctive layout: SIN/COS/TAN row at the TOP of the keypad (right under R/S+GTO+XEQ+MODE row), with ENTER as a WIDE key (spans multiple cols) in the middle of the keypad — NOT in the bottom row like other RPN devices the emulator already approximates. The two shift modifiers ◀ (yellow `f`-shift) and ▶ (blue `g`-shift) sit in the LEFT COLUMN beneath ENTER as part of the numeric-block left side, NOT at the top — my current 6×10 layout puts them at row 1 cols 1-2 which is wrong. Bottom-left corner has a small isolated `a b/c` key (fraction-builder). Display shows "RPN | EQN" indicators. The 4-way arrow nav cluster sits in the top-right corner (DISPLAY+CONST area), not centered.
- **HP 33s**: silver-grey body, signature V-shaped chevron keypad (keys angle outward). 5 cols × ~10 rows in our flat rectangular approximation. Top function rows: `ENG/SOLVE | MODES/DISPLAY` (4 large slabs). Then: `eˣ | LN | yˣ | 1/x | Σ+`; then `R↓ | x² | √x | xʸ√y | %`; then `STO | RCL | SIN | COS | TAN`; then `XEQ | x↔y | +/− | E | ←(del)`; then `R/S | 7 | 8 | 9 | ÷`; then yellow ◀ shift in col 1 (left col) | `4 | 5 | 6 | × `; then blue ▶ shift in col 1 | `1 | 2 | 3 | −`; then `C/ON | 0 | . | ENTER(wide) | +`. Bottom-bottom row has tiny `a b/c` key. Like the 35s, the f and g shift keys are in the LEFT COLUMN (rows 6-7), NOT at top.

| Slice | Description | Estimate |
|---|---|---|
| **P-4** | **TI-36X Pro** photo audit — confirm `apps/data/math/prb` positions, verify `n/d`/`Un/d` natural-fraction keys, confirm `complex`/`num-solv`/`sys-solv` shifts, verify the `convert`/`unit`/`constants` row exists. Apply label fixes. | 1 hour |
| **P-5** | **Casio fx-991ES PLUS** photo audit — VPAM textbook-display layout, confirm `S↔D` toggle, `Pol(`/`Rec(` functions, `STO`/`RCL` row, the `n/d` natural-fraction stack. | 1 hour | ✅ Partial — added `scripts/calc-screenshot-refs.mjs` (alternative path that screenshots the rendered infobox `<img>` element directly; got through Wikimedia's rate-limit where the in-page-fetch script failed). Inspected a real Casio scientific photo (VPAM-era — close-enough sibling of the ES PLUS). Confirmed: 5-col layout, SHIFT/ALPHA at top-left, replay cluster, ON top-right red, numeric block bottom-left, operators right column, (−)/0/./Ans/= bottom row. **Applied this round**: updated the natural-fraction key label from the diamond placeholder `◇/▢` to the stacked-rectangles `▭/▭` glyph that matches the real device silkscreen; shifted version `▭▭/▭` for mixed-number builder. Updated both Casio fx-991 + fx-115 keypads (sibling reskin). **Deferred to a future slice**: dedicated `S↔D` toggle key (currently routed through engine but no surfaced key); explicit `Pol(`/`Rec(` keypad slots (engine already parses these via `pol`/`rec` function-token paths from P-2's polar↔rectangular wiring). `STO`/`RCL` row position not yet verified against a hi-res ES PLUS photo. Typecheck clean; 151/151 tests still pass. |
| **P-6** | **HP 35s** photo audit — re-verify the 7-column physical layout (emulator stays 6-col but cell mapping should match closely), check `ENTER` width, confirm `R↓`/`x↔y`/`LASTx` cluster. | 1 hour |
| **P-7** | **HP 33s** photo audit — verify the chevron layout's logical mapping; confirm `►HMS`/`►H` labels (without periods); confirm `MODE` is a menu not a shift. | 45 min |
| **P-8** | **TI-30Xa, TI-30XS MultiView, Casio fx-115** photo audit — siblings; should mostly match their already-split keypads. Apply any remaining device-specific drift found in photos. | 1 hour | ✅ Partial (TI-30Xa done) — user supplied a high-resolution device photo. Rewrote `lib/calculators/models/ti-30xa/keypad-data.ts` from scratch to match the actual layout: **5 cols × 8 rows** with the numeric block interleaved with function/memory keys (NOT a 4×3 block as previously shipped). Each row now hosts a function/memory key on the left and an operator on the right with digits in the middle: e.g. row 5 is `STO | 7 | 8 | 9 | −`, row 6 is `RCL | 4 | 5 | 6 | +`. The operator stack `÷ × − + =` runs vertically down column 5 across rows 3-7. Added shift-labels for every key from the photo (`DRG►`, `10ˣ`, `eˣ`, `SIN⁻¹`, `COS⁻¹`, `TAN⁻¹`, `FRQ`, `Σ−`, `nCr`, `nPr`, `EXC`, `SUM`, `FLO`, `SCI`, `ENG`, `d/c`, `x³`, `%`, `x!`, `F↔D`, `³√x`, `FIX`, `DMS►DD`, `DD►DMS`). New CSS palette in `CalculatorModal.css`: **green 2nd key** (unusual for TI but matches the photo), **black digit + operator keys with white labels** (vs the lighter grey function keys), tiny yellow shift-label text. fx-115 + MultiView photo audits **queued for next slices** since the user supplied photos for both. 151/151 tests still pass; typecheck clean. |
| **V-P** | **Verification checkpoint** — capture screenshots of the deployed modal, save side-by-side comparisons with reference photos, document any remaining drift for follow-up. | 30 min |
| **P-9** | Move this plan to `docs/planning/completed/`. | 5 min |

---

## 4. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Wikimedia rate-limits the bot after several fetches | High (already hit) | The fetcher is committed and re-runnable; rate-limit windows reset within minutes. Cache fetched images locally; only re-fetch when a new model is added. |
| Photo audit reveals fundamental layout drift that breaks engine tests | Medium | Engine tests assert on `keyId` strings (digit/op/etc.), not key positions. Renaming a `label` is safe; renaming a `keyId` requires updating tests. |
| User can't access the same Wikipedia pages from their browser to verify my findings | Low | Wikipedia is public; the upload.wikimedia.org URLs are also browser-accessible from any user. |

---

## 5. Open questions

- Should the modal allow user-driven width adjustment (resize handle)? Plan §1 of the original deferred resizing; user feedback suggests an opt-in resize affordance might be worth a future slice.
- Some Casio models have multiple distinct photos depending on revision (fx-991ES vs fx-991ES PLUS vs fx-991EX). The user's physical device matters. Audit defaults to ES PLUS; if user has the EX (CLASSWIZ), a fork would be needed.
