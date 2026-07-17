# D&D — Requests Board + Character-Sheet Gaps (2026-07-16)

A grounded plan for four user-requested D&D features. **Much of this already exists** (verified
against the live code 2026-07-16) — each slice below says what's built and what's the actual gap, so we
extend rather than duplicate. Ships slice-by-slice; typecheck + lint + test each; commit + push; annotate
here; move to `completed/` when every item is shipped or explicitly deferred.

Ground rules carry over from `DND_RULES_PLATFORM_2026-07-16.md`: systems never leak rules across editions;
never invent a rule; custom is the explicit escape hatch. Work on branch off `main`, PR for review.

---

## Area A — The Requests / Suggestions board (management + ownership)

**Already built (Phase T):** `app/dnd/_ui/SuggestionBox.tsx` renders in `DndFooter` on every `/dnd` page
(textarea + optional name + "Send suggestion" + "View all suggestions →"); `/dnd/suggestions/page.tsx`
lists them with Copy/Delete; API at `app/api/dnd/suggestions/route.ts` + `[id]/route.ts`; table
`dnd_suggestions` (`seeds/418_dnd_suggestions.sql`): `id, body, author_name, page_path, user_id →
dnd_users, created_at`. Session (`lib/dnd/auth.ts` `DndSession`) carries `userId, email, displayName`
where `email` is a synthetic key (`name:jacob` / `quick:jacob`) that functions as the username.

**The real gaps** (what the user asked for that isn't there):

- [x] **A1 — Request status lifecycle. ✅ SHIPPED** (`b1e44f4c`). `seeds/449_dnd_suggestion_status.sql`
      adds `status` (`untouched|pending|complete`, CHECK-constrained, default `untouched`, indexed),
      idempotent; **applied to live Supabase** (verified columns + constraint present). Backfilled.
- [x] **A2 — Capture the username alongside the display name. ✅ SHIPPED** (`b1e44f4c`). `user_key`
      column persists the session's synthetic handle on POST; GET returns it **only to the owner** (so
      non-owners never see everyone's login keys); the review page shows `author_name (user_key)` for the
      owner. Anonymous posts keep name-only.
- [x] **A3 — Owner-only management gate (also closes a security hole). ✅ SHIPPED** (commit `1ed2fb0c`).
      `lib/dnd/auth.ts` now has `isDndOwner(session)` + `dndOwnerKeys()` (matches Jacob's synthetic
      pseudo-login key `quick:jacob` / `name:jacob`, overridable via `DND_OWNER_KEYS`). `DELETE
      /api/dnd/suggestions/[id]` returns 403 for non-owners (was unauthenticated — anyone could delete
      any request). `GET /api/dnd/suggestions` now returns an `owner` flag; the review page renders the
      Delete button only for the owner. 4 tests. **The PATCH (status change) gate lands with A1/A4** (it
      needs the status column first).
- [x] **A4 — Owner review page: status controls + copy + delete + sort. ✅ SHIPPED** (`b1e44f4c`). Each
      row shows name · (handle, owner-only) · text · Copy · a status chip; the owner gets a status
      selector (Untouched/Pending/Complete, PATCH `/api/dnd/suggestions/[id]` owner-only + validated) and
      Delete. Non-owners see it read-only.
- [x] **A5 — Public status visibility + sorting/filtering. ✅ SHIPPED** (`b1e44f4c`). A colored status
      chip per request + All/Untouched/Pending/Complete filter tabs with live counts, for everyone.
- [~] **A6 — Tests.** owner-gate covered (`suggestion-owner.test.ts`: default keys, case-insensitive
      match, non-owner + anonymous rejected, env override). PATCH-status and filter behavior are
      exercised through the gate + the applied schema; a fuller route-level test is deferred (the route
      needs cookie/Supabase mocks) — the pure owner logic that gates it is fully tested.

## Area B — Review all species / ancestry traits from the character sheet

**Already built:** `app/dnd/_sheet/components/Hero.tsx` (Slice 4) renders a species-traits card for
`dnd5e-2024` when `char.meta.species` matches a `SPECIES_2024` entry (name·creatureType, size, speed,
darkvision, `<ul>` of `{name}. {text}`). Data: `lib/dnd/species/dnd5e-2024.ts` (`Species`,
`SpeciesTrait`, `SPECIES_2024`, `findSpecies`). PF2 ancestries live in
`lib/dnd/systems/pathfinder2e/content.ts` (`PF2_ANCESTRIES`, with `heritages`).

**Gaps:**

- [ ] **B1 — A dedicated, well-formatted "Species / Ancestry traits" panel** reachable from the sheet for
      ANY viewer (not just edit context), collapsible, styled with the sheet tokens — name, size, speed,
      senses, and every trait with its full text. Today the card only shows in the 2024 edit flow.
- [ ] **B2 — Cover all four systems, not just 2024.** Show 2014 species, PF2 ancestries (+ the chosen
      heritage), and Intuitive Games ancestries from each system's own data, system-scoped (Ground Rule
      1). For PF2 read `PF2_ANCESTRIES` (hp/size/speed/senses/heritages/summary); for a custom/homebrew
      species show whatever the sheet records rather than nothing.
- [ ] **B3 — Tests.** the panel lists every trait of a known species; a PF2 ancestry shows its heritage +
      senses; a homebrew species degrades to its recorded name without crashing; no cross-system leak.

## Area C — Currency & money on the character sheet

**To verify first:** whether `Character` already has a money/coins field (check
`app/dnd/_sheet/types.ts`) — the sheet may track gp/sp/etc. already; if so, extend it, else add it.

- [x] **C1 — Show the player's money. ✅ SHIPPED** (`38f9f614`). `Character.currencies` +
      `blankCharacter` seeds standard coins (5e cp/sp/ep/gp/pp, PF2 cp/sp/gp/pp); the Inventory
      CurrencyPanel shows each amount + total wealth in the base unit. Legacy sheets keep their fixed
      display (normalizeCharacter preserves only stored currencies).
- [x] **C2 — Custom currencies (manual). ✅ SHIPPED** (`38f9f614`). In edit mode the player can rename,
      re-rate, add, and remove currencies — custom ones (Guild Marks, Dragon Shards) sit alongside coins.
      **The AI `add_currency`/`set_currency` sheet-edit ops are a follow-up slice** (not yet wired).
- [x] **C3 — Conversion rates. ✅ SHIPPED** (`38f9f614`). Each currency's `rate` = value in base units;
      a toggle-able conversion table shows "1 gp = 10 sp · 100 cp" and total wealth converts across
      currencies (`lib/dnd/currency.ts`: `conversionTable`, `totalIn`, `exchangeRate`).
- [x] **C4 — Tests. ✅** `currency.test.ts` (13): defaults, base detection, total-in-base, cross-convert,
      a custom Guild Mark folding through its rate, conversion table, divide-by-zero guards. (AI-op
      round-trip lands with the deferred AI ops.)

## Area D — Exhaustion actually affects more than d20 rolls

**Already wired:** the 2024 flat −2/level d20 penalty IS applied — `store.tsx` `rollCheck` does
`rollD20(mod - 2*exh, mode)`, so attacks, saves, and checks already take it. Stored at
`combat.exhaustion` (0–6); long rest removes 1 level; UI stepper in `StatRail.tsx` + `DiceTray.tsx`.

**Gaps (the parts NOT applied):**

- [ ] **D1 — Speed penalty.** 2024 exhaustion reduces Speed by 5 ft per level. Apply it through the
      effects ledger / speed derivation (not a cosmetic note) so the Combat panel's Speed reflects it and
      the ★ explains it. Verify it stacks correctly with other speed effects.
- [ ] **D2 — Make the applied penalty legible.** The d20 penalty is invisible today (just baked into the
      roll). Surface "Exhaustion N: −2N to d20 tests, −5N ft speed" near the exhaustion stepper so the
      player sees why their numbers moved.
- [ ] **D3 — Tests.** speed drops 5 ft per level through the ledger; the d20 penalty remains (regression
      guard); exhaustion 0 changes nothing (no false penalty).

---

### Sequencing
A (requests board — includes a live security fix) first, then C (money, self-contained), then B (traits
panel), then D (exhaustion polish). Each area is independently shippable; within an area, ship the
smallest meaningful slice, test, commit, push, annotate here.
