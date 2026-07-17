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

- [ ] **A1 — Request status lifecycle.** Add a `status` column to `dnd_suggestions`
      (`'untouched' | 'pending' | 'complete'`, default `'untouched'`) via an idempotent seed
      (`seeds/4NN_dnd_suggestion_status.sql`, `ADD COLUMN IF NOT EXISTS`). Apply to live Supabase per
      `[[project_apply_seeds_to_supabase]]` (node-pg + `SUPABASE_DB_URL`). Backfill existing rows to
      `'untouched'`.
- [ ] **A2 — Capture the username alongside the display name.** The board must show BOTH the person's
      display name AND their account handle (the synthetic key, e.g. `name:jacob`) so the owner can
      identify who asked. Persist `user_key` (the session `email`) on insert in the POST route; the
      review page shows `author_name` + `user_key`. Anonymous posts (no session) keep `author_name` only.
- [ ] **A3 — Owner-only management gate (also closes a security hole).** Today `DELETE
      /api/dnd/suggestions/[id]` has NO auth check — anyone can delete any request; the review page shows
      Delete/status controls to everyone. Introduce a minimal owner concept in `lib/dnd/auth.ts`
      (`isDndOwner(session)` → true only for the Jacob account, matched by `email === 'quick:jacob'` /
      `name:jacob`, gated behind an env-config list `DND_OWNER_KEYS` defaulting to the Jacob key so it's
      not hardcoded-only). Gate DELETE and a new PATCH (status change) to owner-only (403 otherwise). The
      password is the existing pseudo-login (`1234` for Jacob) — no new auth surface.
- [ ] **A4 — Owner review page: status controls + copy + delete + sort.** Extend
      `/dnd/suggestions/page.tsx`: each row shows display name · user handle · full request text · a
      **Copy text** button (already partially there) · and — only when `isDndOwner` — a status selector
      (Untouched / Pending / Complete) and Delete. Non-owners see the list read-only (no Delete/status).
- [ ] **A5 — Public status visibility + sorting/filtering.** Everyone can view the board and see each
      request's current status (a colored chip). Tabs/filter: **Untouched · Pending · Complete** (+ All).
      The "View all suggestions →" footer link already routes here; make sure it's obvious.
- [ ] **A6 — Tests.** status defaults to untouched; a non-owner PATCH/DELETE is 403; an owner PATCH moves
      the status; the board filters by status; the username/handle is captured on a signed-in post and
      absent on an anonymous one.

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

- [ ] **C1 — Show the player's money** prominently on the sheet (a Wealth/Coins line in the inventory or
      a header stat). Standard coins per system (5e: pp/gp/ep/sp/cp; PF2: pp/gp/sp/cp).
- [ ] **C2 — Custom currencies.** Let a character define named currencies beyond the standard coins
      (e.g. "Dragon Shards", "Guild Marks") with a symbol/abbreviation, displayed on the sheet. Editable
      by hand and via the AI sheet-edit vocabulary (`lib/dnd/sheet-edits.ts` — add `add_currency` /
      `set_currency` / `remove_currency` ops mirroring the existing `add_spell`/`add_item` pattern).
- [ ] **C3 — Conversion rates.** Each currency carries an exchange rate to a base unit; the sheet shows a
      conversion table (e.g. 1 gp = 10 sp = 100 cp; 1 Guild Mark = 5 gp) and a total wealth in the base
      unit. Rates are editable and shown so the player can always see them.
- [ ] **C4 — Tests.** currencies persist; a conversion table computes correct cross-rates; total wealth
      folds custom currencies through their rate; an AI `add_currency` edit round-trips.

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
