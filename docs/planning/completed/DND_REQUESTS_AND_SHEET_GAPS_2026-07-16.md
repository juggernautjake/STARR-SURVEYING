# D&D — Requests Board + Character-Sheet Gaps (2026-07-16)

**STATUS: COMPLETE ✅ (2026-07-16).** All four areas shipped — A (requests board: status lifecycle,
username capture, owner-only gate closing an unauth'd-DELETE hole, sort/filter), B (all-systems
species/ancestry traits panel), C (flexible money + custom currencies + conversion rates, manual + AI),
D (exhaustion −5 ft/level Speed + legibility). Only A6's route-level integration test is deferred (the
owner logic that gates it is fully unit-tested; the route needs cookie/Supabase mocks). Moved to
`completed/`.

**⚠️ Minor open finding (from the Slice-40 runtime check, 2026-07-17):** the suggestion box's name field
renders as **"Your name (optional)"**, but the original ask was *"It requires their name and their
request/comment."* For a signed-in user the name IS captured (from the session `displayName`), so the
label is honest for them; it's only genuinely optional for an anonymous submitter. If the owner wants the
name strictly required for anonymous posts too, gate the send button on a non-empty name when there's no
session — a small component change, not done blind since it borders on a UX/product call.

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
      owner. Anonymous posts keep name-only. **Create-path now guarded** (`5268b626`): source-anchored
      checks that POST rejects an empty request (400), captures the submitter name (displayName or typed),
      and records `user_key = session.email` — so a refactor can't drop the required-request check or the
      identity capture. `suggestion-owner.test.ts` +1.
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
- [x] **A6 — Tests.** owner-gate covered (`suggestion-owner.test.ts`: default keys, case-insensitive
      match, non-owner + anonymous rejected, env override). PATCH-status and filter behavior are
      exercised through the gate + the applied schema. **Route enforcement now guarded too** (`4bae67d1`):
      source-anchored checks that DELETE + PATCH on the `[id]` route both 403 non-owners and that the base
      list/submit route is NOT owner-gated (public read + open submit) — so a future edit can't silently
      drop the gate and re-open the hole. Driving the routes live still needs cookie/Supabase mocks, but
      the enforcement points are now pinned. +2 tests.

## Area B — Review all species / ancestry traits from the character sheet

**Already built:** `app/dnd/_sheet/components/Hero.tsx` (Slice 4) renders a species-traits card for
`dnd5e-2024` when `char.meta.species` matches a `SPECIES_2024` entry (name·creatureType, size, speed,
darkvision, `<ul>` of `{name}. {text}`). Data: `lib/dnd/species/dnd5e-2024.ts` (`Species`,
`SpeciesTrait`, `SPECIES_2024`, `findSpecies`). PF2 ancestries live in
`lib/dnd/systems/pathfinder2e/content.ts` (`PF2_ANCESTRIES`, with `heritages`).

**Gaps:**

- [x] **B1 — A dedicated, well-formatted "Species / Ancestry traits" panel. ✅ SHIPPED** (`84a91e37`).
      `SpeciesTraits.tsx` — a collapsible, all-viewers panel (name, size, speed, senses, every trait with
      full text); Hero renders it in place of the old 2024-only edit-context card.
- [x] **B2 — Cover all four systems. ✅ SHIPPED** (`84a91e37`). `lib/dnd/species/view.ts` `speciesView`
      normalizes 2024 species (full trait text) + PF2 ancestries (size/speed/senses/heritages/languages +
      summary) to one shape, system-scoped (a PF2 ancestry never resolves as a 2024 species); homebrew /
      2014 / IG lineages degrade to a name-only 'custom' card rather than nothing.
- [x] **B3 — Tests. ✅** `species-view.test.ts` (6): full 2024 traits, PF2 ancestry with heritages, no
      cross-system leak, homebrew degrades to name-only, correct noun per system, null on no name.

## Area C — Currency & money on the character sheet

**To verify first:** whether `Character` already has a money/coins field (check
`app/dnd/_sheet/types.ts`) — the sheet may track gp/sp/etc. already; if so, extend it, else add it.

- [x] **C1 — Show the player's money. ✅ SHIPPED** (`38f9f614`). `Character.currencies` +
      `blankCharacter` seeds standard coins (5e cp/sp/ep/gp/pp, PF2 cp/sp/gp/pp); the Inventory
      CurrencyPanel shows each amount + total wealth in the base unit. Legacy sheets keep their fixed
      display (normalizeCharacter preserves only stored currencies).
- [x] **C2 — Custom currencies (manual + AI). ✅ SHIPPED** (`38f9f614` manual, `4621cc0e` AI). In edit
      mode the player can rename, re-rate, add, and remove currencies; the AI has `add_currency` /
      `set_currency` / `remove_currency` sheet-edit ops (matched by id/name/abbrev, full revert
      round-trip) — custom ones (Guild Marks, Dragon Shards) sit alongside the coins.
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

- [x] **D1 — Speed penalty. ✅ SHIPPED** (`f298b3b6`). Exhaustion contributes a `speed_walk` effect
      (−5 × level) as a 'condition' source in `ledger.ts`, so the Combat panel's Speed reflects it and
      the ★ explains it. Stacks with equipped speed items (tested).
- [x] **D2 — Make the applied penalty legible. ✅ SHIPPED** (`f298b3b6`). The StatRail exhaustion pill
      now states both penalties in its tooltip and shows an inline "−N d20 · −M ft" summary when exhausted.
- [x] **D3 — Tests. ✅** `exhaustion-speed.test.ts` (4): 0 = unmodified (no false penalty), −5/level,
      starred + explained as the exhaustion source, stacks with a speed item. (The d20 penalty regression
      is guarded by the existing store/rollCheck tests.)
- [x] **D4 — Follow-up: death saves take the d20 penalty too. ✅ SHIPPED** (`662ae819`). `rollCheck`
      applied −2/level to attacks/saves/checks, but `rollDeathSave` rolled a flat d20 — so death saves
      were the one d20 test that ignored exhaustion, contradicting the sheet's own "−2 to all d20 rolls"
      tooltip. In 2024 a death saving throw is a D20 Test; applied `deathSaveBonus − 2×exhaustion` (nat
      20/nat 1 still read the natural die). `exhaustion-speed.test.ts` +2.
- [x] **D5 — Follow-up: the submitted encounter initiative too. ✅ SHIPPED** (`ac733d91`). The DM-broadcast
      initiative roll (`InitiativePrompt`, which sets turn order) skipped exhaustion while the StatRail's
      own initiative roll applied it; initiative is a DEX check (D20 Test), so folded −2×exhaustion into
      its bonus so the shown bonus, roll, and submitted total agree. `exhaustion-speed.test.ts` +1. With
      this, EVERY d20 roll on the sheet applies the exhaustion penalty.
- [x] **D6 — Follow-up: the AI digest states the penalty. ✅ SHIPPED** (`003804aa`). The digest said
      "Exhaustion 3" without its effect, so the AI could rule on the unpenalized bonus while the sheet
      rolls reduced; now "Exhaustion 3 (−6 to all d20 rolls)", matching the sheet's mechanic so a ruling
      uses the same reduced roll.

---

### Sequencing
A (requests board — includes a live security fix) first, then C (money, self-contained), then B (traits
panel), then D (exhaustion polish). Each area is independently shippable; within an area, ship the
smallest meaningful slice, test, commit, push, annotate here.
