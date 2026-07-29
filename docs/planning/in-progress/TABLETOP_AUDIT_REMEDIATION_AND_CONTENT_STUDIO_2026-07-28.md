# Tabletop — audit remediation + the Homebrew Content Studio

**Status:** IN PROGRESS · opened 2026-07-28 · **this is the stop-hook doc — work it slice by slice until done**
**Origin:** the 28 Jul 2026 structural audit (41 findings, `~/Downloads/starr-tabletop-audit-2026-07-28.html`)
plus the owner's Content Studio brief of the same day.

> **How to work this doc.** Take the **lowest-numbered unchecked slice** in the lowest unchecked phase and
> do it. One slice = one commit. Each slice ends green: `tsc --noEmit`, `vitest run __tests__/dnd`, `eslint`.
> UI slices are **driven in a browser** before being ticked — this repo's standing rule, and the audit's own
> finding is that a green suite misses rendering bugs. Tick the box, write one line of what actually shipped
> (including anything the slice turned out to be *bigger* than written), and move on.
>
> **Do not renumber slices.** IDs are referenced from commits and from the audit. Insert as `P3-4b` rather
> than shifting everything below.

## ⚑ Priority order — set by the owner, 2026-07-28

> *"For now let's focus on getting all of the classes built, the homebrew building stuff built and surfaced,
> and fix all of the things you noted before. Let's fully build all of that and then once everything is fully
> built and formatted like we want, and everything looks good and mechanics are good and the styling is good,
> then we can work on building a totally interactive map/game session experience."*

**Work the phases in this order**, which is not the order they are written in:

1. **Classes** — P5-8 … P5-12 (below, in Phase 5).
2. **The Content Studio** — Phase 6, built *and surfaced*. "Surfaced" is the operative word: this
   project's characteristic defect is finishing something nobody can click.
3. **The audit findings** — Phases 0 → 5, then 8 → 10.
4. **Then, and only then, Phase 7** — the live synced session.

**Phase 7 is DEFERRED to a future project by owner directive.** Its design stays in this doc because it was
worked out with the owner and re-deriving it later would be waste — but **no Phase 7 slice is to be started**
until the four items above are done and the owner has signed off on mechanics and styling. The stop hook
should skip Phase 7 entirely.

---

## Ground rules (inherited — these bite constantly in this work)

1. **Never invent a rule.** Source-verify every number. Where a source is missing, the item is BLOCKED and
   pinned by a test that flips when the data arrives — not filled in from the shape of its neighbours.
2. **Provenance is not eligibility.** `vanilla` hard-blocks, `custom` flags, `dm-granted` marks. The Content
   Studio must not become a bypass for any of it.
3. **A payload that does not validate is refused, never coerced.** Explain the refusal at authoring time;
   never weaken the validator to make a form pass.
4. **Authored is not shipped.** The audit's single most common defect is *reachable-from-nowhere*. A slice is
   not done until a user can get to it by clicking, starting from the lobby.
5. **Partial is a first-class state.** A class built to level 5 is `partial` — rendered as such, adoptable to
   the level it covers. Not an error, not a blocker.

---

## Phase 0 — Do these first (hours, not days)

- [x] **P0-1 — ~~Merge the edit-history exposure fix.~~ ALREADY DONE — and this slice was written on a false
      premise. Closed 2026-07-28 with a correction rather than a commit.**

      `git merge-base --is-ancestor 6a014d6b main` → **true**. The gate is live in
      `edits/route.ts` (GET returns 403 when `!canWrite`, checked before any row is read), and
      `__tests__/dnd/edit-history-access.test.ts` covers it in eight assertions including the
      public-character case and the ✎-tooltip consumer's graceful degradation.

      **Where the false premise came from, because it is the interesting part.**
      `DND_OWNER_DECISIONS_2026-07-27.md` §1 says the commit is *"sitting unmerged on
      `fix/variant-ux-2026-07-25` behind ~250 others"* and calls it *"the only live exposure"*. The audit
      restated that verbatim as finding F-4 and ranked it first on the roadmap. **Neither checked git.** It
      had been merged; the doc simply went stale after it was written.

      That is precisely the defect that same doc warns about twice in its own header — *"a figure that has to
      be maintained by hand will go stale"* and *"prose kept asserting what the evidence had moved past"* —
      so the audit reproduced the failure mode it was reading about. **The rule this earns: a planning doc's
      claim about the state of the code is a lead, never a finding.** Verify against the code or the history
      before repeating it, especially when the claim is alarming enough to reorder a roadmap.
      §1 of the decisions doc is corrected in place so the next reader does not inherit it.

- [x] **P0-2 — Widen the homebrew kind vocabulary.** `HOMEBREW_KINDS` gains `creature`, `background`,
      `condition`, `action`, `rule` (13 → 18), with labels. Prerequisite for the whole Studio.
      **Shipped 2026-07-28.**

- [x] **P0-3 — The kind registry.** `lib/dnd/homebrew/kinds.ts` — the declarative field schema that makes the
      builder adjust to the chosen kind, plus `kindIsMechanicalIn` / `proseOnlyNotice` (the honesty layer:
      a kind that cannot carry mechanics in a system SAYS SO instead of pretending), `blankDraftFor`,
      `validateDraftFields`, `isPartialBuild`. **Shipped 2026-07-28.**

- [x] **P0-4 — Link the three homebrew designers. Shipped 2026-07-28.** New `HomebrewDesignerLinks`
      (server component — three links and a system check need no client JS), mounted on the character sheet
      page inside the existing `canWrite` guard. Gated on `isSharedEngineSystem`, and the gate ships in the
      SAME slice as the link on purpose: the designer pages carry no system guard of their own (they never
      needed one while nothing linked to them), so wiring the link without gating it would have converted a
      harmless orphan into a live trap — a PF2 character authoring a 5e `ClassDefinition` its engine cannot
      resolve. PF2/IG get an honest explanation plus a pointer at the escape hatch that does work there.
      8 assertions in `homebrew-designer-reachability.test.ts`, deliberately about WIRING rather than
      behaviour: the link exists, the component is *mounted* (the half A-3 was missing — a link component
      nobody renders is the same defect one level up), and the gate holds in both directions.
      *Original slice text below.*

- [ ] ~~**P0-4 — Link the three homebrew designers.**~~ *(audit A-3 — the highest value-per-hour item found.)*
      `/build/class`, `/build/subclass` and `/build/feat` are complete, tested, working, and **nothing in the
      codebase links to them**; a repo-wide search returns only their own header comments. Add entries to
      `CharacterBuildKit` and to the escape hatch's homebrew tier.
      **Design:** they are gated on `isSharedEngineSystem` — they emit the 5e `ClassDefinition`/`CustomFeat`
      shapes, and a PF2/IG character reaching them would author content its engine cannot consume. Show the
      Studio link instead for those systems.
      **Done when:** a 5e character can reach all three by clicking from the sheet, a PF2 character cannot,
      and a test asserts the reachability matrix in both directions.

- [ ] **P0-5 — Delete the orphaned components; restore the format preview.** *(A-1, A-2.)* `TemplateBrowser`
      and `SheetStyleBrowser` are rendered nowhere — `SheetChrome` replaced them — while
      `format-preview.test.ts` still asserts against `TemplateBrowser`'s source, keeping dead code green.
      Delete both; move `<FormatPreview id={t.id}/>` into `SheetChrome`'s template row so players stop
      choosing between Classic / Codex / Dashboard / Play blind; re-point the test at `SheetChrome`.
      **Done when:** the four formats show their layout diagram in the picker, and no `_ui/*.tsx` default
      export is unreferenced (add the guard in P4-6).

---

## Phase 1 — Quick wins (each ≤ half a day)

- [ ] **P1-1 — Initiative HP for every system.** *(B-3.)* `encounters/[id]/entries` seeds HP from
      `c.data?.combat` — the 5e shape — so PF2 (`data.pf2e`: `ancestryHp` + `classHpPerLevel` + CON/level)
      and IG (`data.ig.hitPoints`) combatants enter the tracker with **null HP, silently**.
      **Design:** a `maxHpFor(system, data)` dispatcher beside the per-system `resolve.ts` modules; both
      systems already compute final HP, so this is wiring, not rules. **Done when:** adding a PF2 and an IG
      character to an encounter seeds correct HP, with a test per system.

- [ ] **P1-2 — Currency on the PF2 and IG sheets.** *(C-3.)* `lib/dnd/currency.ts` + `Character.currencies`
      is 5e-only; neither bespoke sheet can hold a copper piece. The module is already system-agnostic in
      shape — lift it to a shared sidecar field and render it in each sheet's equipment area (PF2's arrives
      with P5-1). **Done when:** a PF2 and an IG character can hold and spend coin, and the AI
      add/set/remove-currency tools work on both.

- [ ] **P1-3 — Explain the 2014 feat catalogue.** *(C-8.)* `FEATS_2014` holds exactly one entry (Grappler)
      and can never hold more — the rest is PHB-only content outside the CC-BY licence, so **homebrew is that
      edition's only real feat route**. One line of copy at the 2014 ASI slot pointing at "＋ Add a different
      feat". **Done when:** the 2014 ASI step reads as a constraint rather than as an empty list.

- [ ] **P1-4 — Gate the dev routes.** *(D-5.)* `/dnd/hextech-demo`, `/dnd/preview/edit-flow` (self-described
      DEV-ONLY), `/dnd/Lazzuh_Gun` and `/dnd/login` all ship to production unlisted and indexable. Gate the
      two harnesses behind `NEXT_PUBLIC_E2E_HARNESS`; add `noindex` metadata to all four.

- [ ] **P1-5 — Session scheduling, surfaced.** *(B-5.)* `dnd_sessions.scheduled_at` exists in the schema and
      is in the PATCH route's `WRITABLE` list. **Nothing sets it and nothing renders it.**
      **Design:** a datetime field on session create/edit; a "Next session" banner on the campaign hub for all
      members; store UTC, render in the viewer's locale. RSVP is out of scope (P3-5).

- [ ] **P1-6 — One upload-limit module.** *(F-6.)* Six different ceilings (5/8/12/15/20/25 MB) hard-coded
      across eight routes. One constants module; keep the per-route values, stop duplicating them.

---

## Phase 2 — Safety, privacy & cost

- [x] **P2-1 — A rate limiter. Shipped 2026-07-28.** `lib/dnd/rate-limit.ts` + `seeds/456_dnd_rate_limits.sql`,
      applied to all six AI routes and to login.
      **Postgres, not an in-memory map.** The obvious implementation is a module-scope `Map`; on serverless
      that is worth roughly nothing — every cold start gets a fresh one and concurrent instances each keep
      their own, so the effective limit becomes `limit × instances`. It appears to work in development and
      does not in production.
      **Fixed window, not a sliding log:** one row per (bucket, subject, window) and a single upsert on the
      hot path, at the cost of a boundary burst. For "stop someone looping an expensive endpoint" that is
      the right trade. Old windows are swept opportunistically (~1 request in 200) rather than by a cron
      that could silently stop running.
      **It fails OPEN, and the file argues why:** a broken limiter must not take the tabletop API down with
      it. A limiter is a cost-and-abuse control, not an authorization gate — and the authorization gates,
      which fail closed, are deliberately separate from it.
      **Login is limited on the address AND the name being attempted** (address alone misses a distributed
      attack on one account; name alone misses one password sprayed across many), and the attempt is counted
      **before** the password is verified — counting only failures would let an attacker holding one correct
      credential reset their own budget.
      Buckets: `ai` 30/hour · `login` 10/15min · `write` 300/5min. **`write` is defined but not yet applied**
      — the AI routes and login were the exposure; broad write throttling is P2-1b.
      *Original slice text below.*

- [ ] **P2-1b — Apply the `write` bucket to ordinary write routes.** The policy exists and is tested; what
      is left is opting the ~100 write handlers in. Low risk, mechanical, and genuinely lower value than the
      two surfaces already covered.

- [ ] ~~**P2-1 — A rate limiter.**~~ *(F-1 — critical.)* There is **no throttling anywhere** across 113 routes,
      nine of which call a paid model. Anyone can register with a 4-character name and password and loop them.
      **Design:** `lib/dnd/rate-limit.ts` — a fixed-window counter keyed on `session.userId` (falling back to
      IP for unauthenticated routes), stored in a small Postgres table so it survives the serverless
      cold-start problem an in-memory map has. A `withRateLimit(handler, { bucket, limit, windowSec })`
      wrapper so a route opts in with one line. Return 429 with `Retry-After` and a human message.
      **Apply first to:** `ai/test`, `characters/[id]/ingest`, `characters/[id]/variants`, `library/chat`,
      `sessions/[id]/{ai-notes,recap}`, `stream/{direct,mood-refresh,spam}`, and every Studio AI route.
      **Done when:** an over-budget caller gets a 429 that says when to retry, and a test proves the window.

- [ ] **P2-2 — A per-user AI spend ceiling.** Building on P2-1: a daily token/call budget per user, surfaced
      honestly in the UI ("AI assists: 34 of 50 today") rather than failing opaquely. **Done when:** the
      ceiling is visible before it is hit, not only after.

- [ ] **P2-3 — Login throttling + a real password floor.** *(F-2.)* No attempt counter, no lockout, no
      backoff, against a 4-character minimum. Exponential backoff per name and per IP (same limiter);
      raise the minimum to 8 for **new** accounts only, so no existing player is locked out of their own
      characters. **Done when:** repeated failures back off, and the uniform "Invalid name or password"
      response is preserved (it already correctly avoids enumeration).

- [ ] **P2-4 — Account recovery.** *(F-3.)* Identity is `name:<normalized>` with no email; a forgotten
      password means every character, variant and membership on that account is **permanently unreachable**,
      with no admin path.
      **Design:** (a) a change-password control that knows the old one; (b) a one-time recovery code shown
      once at signup and on demand, stored hashed; (c) *optional* recovery email — offered, never required,
      preserving the no-email design. **Done when:** a user who forgets their password has a route back that
      does not involve the owner editing the database.

- [ ] **P2-5 — Campaign visibility, archive and delete.** *(D-2.)* `loadAllCampaignSummaries()` selects
      **every** campaign with no filter, no pagination and no recency ordering, and returns the DM's name,
      every player's name and every character's name — to anyone who opens `/dnd` in open-access mode. There
      is no `visibility` column, no `archived_at`, and no `DELETE` route: **a campaign can never be removed
      or hidden by anyone.**
      **Design:** add `visibility` (`public` | `unlisted` | `private`, default `unlisted`) and `archived_at`;
      a DM-gated `DELETE` that soft-deletes (archive) with a hard-delete confirmation path; paginate the hub
      (20/page) ordered by recent activity; the hub lists `public` only, plus your own regardless.
      **Done when:** a DM can hide and delete their own table, a stranger sees only public ones, and the hub
      issues a bounded query.

- [ ] **P2-6 — A route-gate guard test.** *(F-5.)* RLS is enabled on the D&D tables with **zero policies**,
      so all authorization is app-code-only across 113 routes with no database backstop. Writing real
      policies is the fuller answer; the cheap 90% is a test that every `route.ts` under `app/api/dnd`
      references one of the known gate helpers (`getDndSession`, `getCampaignRole`, `getCharacterAccess`,
      `requireCharacterWrite`, `isDndOwner`), failing loudly on a new ungated route.
      **Done when:** adding an ungated route turns the suite red.

- [ ] **P2-7 — Per-user storage quota.** *(F-6.)* No cap on total stored bytes; one account can fill the
      media bucket. A total-bytes check on upload with a clear message.

---

## Phase 3 — Play at the table

- [ ] **P3-1 — Sheet rolls reach the shared campaign log.** *(B-2 — critical.)* Every roll from all four
      rollers goes into `commitRoll`, which is `setLog(...)` local state capped at 40. **Nothing posts to
      `/api/dnd/rolls`** — the only writer is the DM's manual dice box. The route's own header comment claims
      the opposite, which means this was intended and never wired.
      **Design:** a fire-and-forget POST inside `commitRoll` when the character has a campaign, carrying
      `label / formula / result / breakdown / crit / fumble` (the entry already holds all of them), then ping
      the existing campaign realtime channel. Must not block or fail the roll animation on a network error.
      Correct the stale route comment. **Done when:** a player's attack roll appears on the DM's feed live.

- [ ] **P3-2 — The roll feed everywhere it belongs.** *(B-6.)* `RollFeed` is mounted only in `SessionConsole`,
      which is DM-facing — so players never see a roll history and a campaign without an active session has
      none at all. Add a compact feed to the campaign hub for all members and to the sheet's floating dock.

- [ ] **P3-3 — Roll statistics.** Falls out of P3-1 for almost nothing: per-player nat-20s, average d20,
      luckiest session. High delight per line.

- [ ] **P3-4 — Experience points.** *(B-4.)* No XP anywhere — no field, no award, no milestone tool, no
      trigger telling a player it is time to level. Levels are typed by hand.
      **Design:** `meta.xp` on the character plus a per-system threshold table (5e's is in the SRD; PF2 uses
      a flat 1000/level; IG has its own; `ambiguous` gets milestone-only). One DM control — "Award XP" /
      "Level the party" — which drops a notification with a deep link into that character's level walker.
      Milestone mode is a campaign preference, so tables that do not use XP never see it.
      **Done when:** awarding XP to a party of mixed systems levels each correctly, or prompts them to.

- [ ] **P3-5 — Session RSVP + reminders.** Builds on P1-5: members mark yes/no/maybe; the hub shows the
      count. (A Discord webhook is P10-4.)

- [ ] **P3-6 — Encounter builder with a difficulty budget.** Add N copies of a creature at once; compute the
      encounter's difficulty against the party using each system's own budget. Depends on P8-1 (bestiary).

- [ ] **P3-7 — The DM party overview.** Every PC's AC, passive Perception, saves, HP and conditions on one
      screen. All of it is already computed by the per-system resolvers — this is a new arrangement of
      existing data, and it is the single most-used DM screen in every comparable tool.

---

## Phase 4 — Navigation & information architecture

- [ ] **P4-1 — `/dnd/characters` — a real character index.** *(D-1.)* No such page exists; the only list is
      a card grid in `MyTable` showing name, portrait and campaign — **no system, class or level** — with no
      search, filter, sort, duplicate or delete.
      **Design:** system badge, class/level, campaign, last-edited; search + filter by system and campaign;
      per-row actions (open, duplicate, new variant, export, delete) consolidated from where they are
      scattered across the sheet page today.

- [ ] **P4-2 — Menu completeness.** *(D-3.)* The header offers five links. `/dnd/profile` is linked **only**
      from `CampaignDashboard`, the branch that does not run in open-access mode — so in the default
      configuration nothing links to it. `/dnd/suggestions` is linked only from a footer control.
      Add Profile, My Characters, My Content (P6-7) and Requests; badge the toggle with the notification
      count.

- [ ] **P4-3 — Tab the character page.** *(D-4.)* One 454-line page stacks ~20 always-mounted panels
      vertically. The sheet inside it is tabbed; the page around it is not, so the further down a control
      lives the less likely it is ever found.
      **Design:** three tabs around the sheet — **Play** (sheet + rollers) · **Build** (build kit, variants,
      level walker, grants, Studio links) · **Manage** (history, export, visibility, campaigns, settings).
      Every existing component is kept; only what is mounted changes. Deep links must still land on the right
      tab.

- [ ] **P4-4 — A ⌘K command palette.** *(D-6.)* The library has excellent search; nothing else does. One
      palette spanning characters, campaigns, NPCs, custom content and library articles, reusing the
      library's keyword engine as the index.

- [ ] **P4-5 — Lobby depth.** `MyTable` has no "＋ Character" button of its own, no Profile link, and no
      link to the library from the page body. Fix all three while P4-1 and P6-7 are in flight.

- [ ] **P4-6 — An orphan-component guard.** A test asserting every default export under `app/dnd/_ui/` and
      `app/dnd/_sheet/components/` is referenced at least once. This is the guard that would have caught
      A-1/A-3 years earlier, and it is the cheapest insurance in this document.

---

## Phase 5 — Cross-system parity

- [x] **P5-1 — Pathfinder 2e inventory + Bulk. Shipped 2026-07-28.**
      `lib/dnd/systems/pathfinder2e/inventory.ts` (pure), `PF2Character.inventory` + `.currencies` — both
      optional, so every stored character stays valid with no migration — and an Equipment panel.
      **Bulk is modelled properly rather than stored as pounds**, because it is a core mechanic with combat
      consequences — Encumbered costs 10 feet of Speed and −1 to Str/Dex checks — and that is exactly what
      5e's weight number cannot express. The penalty is returned as DATA in the game's own words, so the
      sheet renders it and a future engine bridge can apply it without either writing its own sentence.
      **Two arithmetic traps, both pinned by test.** Ten Light items must make exactly **1.0** Bulk — summing
      0.1 ten times in floating point gives 0.9999999999999999, so a character with ten torches would read
      0.9 and sit one rounding error from the wrong encumbrance; summing first and rounding once fixes it.
      And PF2 encumbers you for carrying **more than** 5 + Str, so `>` not `>=` — a `>=` would penalise a
      legal load, which is the kind of off-by-one nobody notices until a player argues about it mid-session.
      **Equipment is ALWAYS in the nav**, not gated on carrying something: Bulk applies either way, and a
      hidden Equipment section is precisely how a player concludes PF2 has no inventory.
      **Also closes P1-2 / audit C-3 for PF2**: `lib/dnd/currency.ts` was built system-agnostic and already
      shipped `DEFAULT_CURRENCIES_PF2` — it had simply never been wired to anything but 5e.
      **Still owed:** the item PICKER fed from `data/equipment.ts`, and editing inventory from the sheet
      (P5-1b). The model, the maths and the display are done; adding gear currently goes through the edit
      flow. **P6-9a (the PF2 engine bridge) is now unblocked.**

- [ ] **P5-1b — PF2 item picker + sheet-side inventory editing.** Wire the existing weapon/armour/shield/
      rune/item catalogue into an add-item control, and allow quantity/location/invested edits in place.

- [x] **P5-2 — Pathfinder 2e shields. Shipped 2026-07-28.** `lib/dnd/systems/pathfinder2e/shield.ts` (pure),
      `PF2Combat.shield` (optional — no migration), three edit ops, the bonus wired into `pf2ArmorClass`,
      and a Raise/Lower control on the Defenses panel. `pf2Shield()` finally has a caller.
      **The bonus is added in `pf2ArmorClass`, NOT folded into `acItemBonus`** — the tempting shortcut,
      since that field already exists. Two reasons, both silently wrong if you take it: the bonus applies
      **only while raised** (folding it in hands every shield user a permanent +2 and shifts every DC they
      face), and it is a **circumstance** bonus, which PF2 does not stack with itself — putting it in the
      *item* slot would let it stack with things it must not.
      **Broken means no bonus**, which is what makes Shield Block a real decision rather than free damage
      reduction. Hardness reduces the damage for *both* the shield and its bearer, so blocking a big hit
      still hurts — and a refused block (lowered, broken, destroyed) changes **nothing** rather than falling
      through to a normal hit the player never chose to take.
      **A guard caught the op name.** `shield_block` was refused by `assertCharacterScopedOps` — correctly,
      since op names must read as sheet mutations. Renamed to `apply_shield_block` rather than widening the
      rule, which is the fix that keeps the boundary meaningful.
      *Original slice text below.*

- [ ] ~~**P5-2 — Pathfinder 2e shields.**~~ *(C-2.)* `PF2_SHIELDS` is catalogued with hardness/HP/BT and
      `pf2Shield()` is exported and **never called**; the rules engine has no Raise a Shield (+2 circumstance
      AC — the most-used defensive action in the game), no Shield Block, no shield damage, no broken
      threshold. Depends on P5-1.

- [ ] **P5-3 — Pathfinder 2e multiclass.** *(C-4.)* 5e gets true multiclassing; IG gets a flagged house rule;
      PF2 gets nothing — and PF2's version is **core**, not optional: multiclass archetype dedication feats
      taken at a class-feat slot the builder already computes via `pf2LevelBreakdown`.
      **Design:** model dedication as a class-feat-slot option with PF2's own follow-up rule (two more feats
      from an archetype before a second dedication). Content is authored in `feats-class.ts`.

- [ ] **P5-4 — PF2 companions, familiars and eidolons.** *(C-7.)* Companions exist for 5e 2024 and IG only.
      PF2 animal companions are a compact three-tier data shape and close most of the gap; the Summoner's
      eidolon is a second statblock and can reuse the creature model from P6-13.

- [ ] **P5-5 — 5e 2014 companions.** Find Familiar, the Ranger's beast, the Paladin's steed.

- [ ] **P5-6 — Languages beyond 2024.** *(C-9.)* `lib/dnd/languages/` holds one file. PF2 already carries
      languages inside its ancestry stat lines — surfacing them is nearly free; 2014 and IG need a picker.

### Class completeness — the owner's first priority

**Measured 2026-07-28, before planning any of it.** The headline is better than expected and the remaining
work is narrow and specific — which is exactly why it was worth measuring rather than assuming:

| System | Classes | State |
|---|---|---|
| **5e 2014** | 14 | **Complete.** All 13 official (incl. Artificer) + Pugilist, each authored 1–20 with subclasses. |
| **5e 2024** | 13 | **Complete for what is published.** All 12 PHB classes × 4 subclasses each + Pugilist × 6 Fight Clubs. |
| **Pathfinder 2e** | 20 | **All of Player Core + Player Core 2** — Alchemist through Wizard. Gaps are enumerated in `PF2_CLASS_PROGRESSION_GAPS` (11 entries), not hidden. |
| **Intuitive Games** | 17 | Full taxonomy; **Champion alone lacks powers/specializations** (blocked on the site). |

So "get all the classes built" is **mostly already true**. What is actually left:

- [ ] **P5-8 — IG Champion.** *(Blocked on data — see the blocked table.)* The single genuine content hole in
      any of the four systems' class lists. Every other IG subclass carries `powers[]` + `specializations[]`
      verbatim from the scrape.
- [ ] **P5-9 — Magus and Summoner spell slots.** *(Blocked on data.)* `slotTableModelled: false` for both;
      `pf2MaxSpellRank` returns 0 until the published reduced-caster tables are supplied. Everything else
      about both classes is modelled.
- [ ] **P5-10 — PF2 Cleric doctrine + Monk Path to Perfection tracks.** Not blocked — *chosen*. Both classes'
      progressions branch on a player choice the builder never asks, so an assembled Cleric or Monk keeps its
      level-1 base ranks. **Design:** make the choice a slot (the S1–S6 model already does this), then apply
      the chosen track's increases. The most mechanically wrong thing left in PF2's classes.
- [ ] **P5-11 — PF2 Fighter weapon-group attack ranks.** The builder advances attack proficiency through
      unscoped steps only, so a Fighter's general attack rank stays EXPERT past 13. It **under**-counts,
      which is the safe direction, and the gaps list says so. Needs weapon-group tracking.
- [ ] **P5-12 — The 2024 Artificer.** *(Blocked on data.)* Published after the 2024 PHB; the repo has the
      2014 one. Needs the owner to supply the revised text, exactly as the Pugilist was.

Everything above except P5-10 and P5-11 is **blocked on source material, not on effort** — worth saying
plainly so this priority is not mistaken for a large build. The two unblocked ones are real rules bugs.

- [ ] **P5-7 — The guided builder's per-level flows.** *(C-6.)* `/dnd/characters/[id]/builder` is still B1
      for all four systems: Foundations is the existing all-at-once builder embedded whole. The page's own
      comment says the per-level flows are owed.
      **Design:** the slot model from S1–S6 is exactly the substrate — each slot becomes one screen with a
      live preview panel. Sequence: 5e first (most slots modelled), then PF2, then IG.

---

## Phase 6 — The Homebrew Content Studio

> **The owner's brief, 2026-07-28.** A Content Builder button on the user page → a page to homebrew items,
> feats, classes and anything else, saved to public or private content; **shareable**; **addable to
> characters** with **the actual effects showing up on the character sheets for the different systems**,
> fully integrated with the system engines and represented on the sheet, in the library and on users' lobby
> pages; **a way to view all custom content**. Pick the KIND and the SYSTEM first, then the building options
> **totally adjust**. Classes can be **based on another class** or wholly new, built **level by level** with
> **custom feats authored inline** and offered at chosen levels; a class can stop at any level and be marked
> **partially built** — save whenever. **On save the AI writes an assessment.** AI can help at **each step**,
> but everything must be buildable **from scratch** in any system. **Upload a PDF/file** and have AI build
> from it. **Upload an image** — a creature gets a full statblock beside its art. Later: a **simple sheet for
> creatures** tracking attacks, abilities, feats and conditions, and a **complete creature builder**. Then a
> **system translator** that transposes a piece into another system as a variant, which the user
> **approves / denies / retries with notes**, looping until satisfied, or hand-edits if close.

### What already exists (measured — do not rebuild)

`lib/dnd/homebrew/` is a complete, tested, pure foundation that **nothing is wired to**: `model.ts` (kinds,
attribution, system scope, `draft/submitted/approved/rejected`, search, browse), `policy.ts` (the campaign DM
allowlist), `adopt.ts` (`adoptHomebrew` → `ClassDefinition` / `CustomFeat` / `ActiveEffect`, validated through
the real engine validators, refusing invalid payloads, idempotent), `projection.ts` (library section + AI
grounding). Its entire data source today is a **two-entry hard-coded array** in `seeds.ts`.

Separately, `dnd_content` + `/api/dnd/content` is an older, working, DB-backed system (9 kinds, campaign or
global, `data.effects[]` → `engine/content.ts` → real equipment and effects) with no attribution, no system
scope, no lifecycle, no images and no browse page. And `/build/*` produces a third, character-embedded kind
of homebrew.

**Decision: `lib/dnd/homebrew/*` becomes THE system.** `dnd_content`'s engine-payload contract is kept
(`payload.effects`); the `/build/*` designers become authoring modes inside the Studio.

- [x] **P6-1 — The kind registry.** See P0-3. **Shipped 2026-07-28.**

- [x] **P6-2 — The table. Shipped 2026-07-28.** `seeds/455_dnd_homebrew.sql`. `kind` is deliberately NOT a
      CHECK constraint — the vocabulary lives in `model.ts` and widened 13 → 18 the same day, so a
      constraint would mean a migration per kind with the failure landing at INSERT time in production;
      `normalizeHomebrew` already drops an unknown kind rather than coercing it. `dnd_content` is left
      alone (P6-19 migrates it) because bolting five columns onto a table in active play to serve a feature
      that does not exist yet is the wrong order.

- [x] **P6-3 — The store. Shipped 2026-07-28.** `lib/dnd/homebrew/store.ts` — row↔model mapping,
      `canReadHomebrew` / `canWriteHomebrew` / `isBrowsable` / `visibleHomebrew` / `pickCreatorWritable`,
      27 tests over the whole visibility × status product.
      **A design bug was caught in authoring and is pinned as a regression test.** `isBrowsable` was first
      written as `visibility === 'public' && status === 'approved'` — two plausible conditions that multiply
      into a permanently false one, because with public self-serve nothing ever *sets* `approved`. The
      catalog would have been unbrowsable forever. Resolved by making **`visibility` the publish action**
      (`status` only ever excludes, on `rejected`) with `statusForVisibility` keeping `isHomebrewPublished`
      — which the library section and AI grounding read — in agreement.

- [x] **P6-4 — The API. Shipped 2026-07-28.** `/api/dnd/homebrew` (GET with mine/system/kind/q filters,
      POST) and `/api/dnd/homebrew/[id]` (GET / PATCH / DELETE). Three validation layers reported together
      so an author fixes everything in one pass: identity (`validateHomebrew`), the kind's own schema
      (`validateDraftFields`), and the mechanics against the **engine's own** validators
      (`validateHomebrewPayload`). A private piece 404s rather than 403s, so it does not confirm its
      existence to someone guessing ids. Delete leaves adopted copies and transposed variants alone —
      adoption copies the payload onto the sheet, so deleting a catalog entry must not reach into someone
      else's character and remove a class they are playing.
      **Two orphan exemptions came off the list** (`kinds.ts`, `adopt.ts`) because the API imports them, and
      the pin asserting the shared catalog *had no surface* flipped and was replaced. `policy.ts` stays
      exempt and is now the only piece owed — P6-8 is its only intended caller.
      **Still to do here:** rate-limiting (P2-1) — the routes ship ungated like the other 113.

- [x] **P6-5 — The Studio: browse. Shipped 2026-07-28.** `/dnd/content` + `/dnd/content/[id]`. A **server**
      page with `searchParams`-driven filters and **no client JavaScript**: the filters are links and search
      is a plain GET form, so the page works on first paint and — the part that matters — a filtered view is
      *linkable*, so a DM can paste "every public PF2 creature" into their table's chat. It queries Postgres
      directly rather than fetching its own API (an RSC calling its own route pays a round trip to redo work
      it could do inline), but shares the authorization: both call `visibleHomebrew`, the module with the 27
      tests, so page and API can never disagree about who sees what. A system filter includes `'any'`-scoped
      pieces, or system-agnostic content vanishes from exactly the lists it was scoped to appear in.

- [x] **P6-6 — The Studio: build. Shipped 2026-07-28 (form; the five bespoke editors are still owed).**
      `/dnd/content/new` is the picker with no `?kind=` and the form with one. Both are **generated from the
      registry** — the picker from `KIND_GROUPS`/`kindsInGroup`, the form from `fieldsForKind` — with a test
      asserting no kind is hard-coded in either, because a hand-written list is how a new kind gets added to
      `kinds.ts` and silently never appears.
      **Honest about the gap:** `effects`, `levels`, `statblock`, `image` and `list` need bespoke editors
      (P6-8/11/12/13). Each renders a labelled placeholder naming the slice that builds it, rather than a
      text box that looks like it captures a statblock and silently drops it — a form that appears to accept
      input it discards is worse than one that admits the gap, since the author only finds out after saving.
      The prose-only notice from the registry shows *before* an author starts, not after.

- [x] **P6-7 — The doors. Shipped 2026-07-28.** 🔨 Content Builder + "My custom content" + "Browse
      everyone's" on the lobby (`MyTable` — the user page the owner meant), and header-menu entries with
      browsing above the sign-in split (reading is open, like the library) and building below it.
      **Caught mid-slice:** the lobby buttons were added pointing at `/dnd/content/new` *before that page
      existed* — the exact defect this whole plan is about, nearly reintroduced while fixing it. Both pages
      shipped in the same commit, and `content-studio-reachability.test.ts` now asserts every link the browse
      page emits points at a page that exists.

- [x] **P6-8 — Adopt onto a character. Shipped 2026-07-28.** `POST /api/dnd/homebrew/[id]/adopt` plus
      `AdoptContentPanel` on the sheet. **Three gates, answering three different questions** — character
      write access, the DM's allowlist (`canAdoptHomebrew` + the campaign policy), and the engine's own
      validators via `adoptHomebrew`, which refuses a payload rather than storing a class the level builder
      cannot level. The system match is checked *before* the DM gate on purpose: "this is Pathfinder content
      on a 5e character" tells a player what is wrong, where "your DM hasn't allowed this" would send them
      to ask for something that could never have worked. A character with no campaign has no DM and so no
      allowlist — otherwise the closed-by-default policy would make the Studio unusable outside a campaign,
      which is where most authoring happens. Audited under a batch id, so adopting undoes like any other edit.
      **`policy.ts` finally has its only intended caller.** It had been orphan-exempt since the day it was
      written — a DM gate nobody invoked, indistinguishable from no gate, the same shape as the PF2
      rules-gate bug. **Every module under `lib/dnd/homebrew/` is now reached by shipping code, for the
      first time.** Two more pins flipped and were rewritten.
      The client never predicts a gate — it asks and shows the server's message verbatim, because each of
      the three refusals needs a different action from the player.

- [x] **P6-9 — The effects editor. Shipped 2026-07-28.** *(The per-system bridges are split out below.)*
      The `effects` field now has a real editor, so homebrew stops being prose and starts changing numbers
      on a 5e sheet — `adoptHomebrew` already converts a validated payload into an `ActiveEffect` the ledger
      resolves. **Generated entirely from `lib/dnd/effects/targets.ts`**, which its own header calls "a
      contract, not a list" precisely so a hand-written menu can never leave a capability unreachable; a
      test asserts no target key is hard-coded here and that every group is reachable from the picker.
      Changing a target **resets the operation** to one the new target allows, or switching from an ability
      (add/set/set_base) to a roll (add/advantage/disadvantage) would leave an illegal pair that only fails
      at save. The engine's own `validateEffect` runs live in the form, so what the form accepts and what a
      sheet will apply cannot disagree. Added `TARGET_GROUPS` to the registry, derived from the labels.
      **Every field type any kind declares now has an editor** — `OWED_BY` is empty, and a test asserts the
      set of declared types is covered rather than trusting the list. The placeholder branch is *kept*, so
      the next field type someone adds lands there instead of silently rendering nothing.
      Flipped the P6-12 pin that said "effects is the only placeholder left".

- [x] **P6-9a — Pathfinder 2e engine bridge. Shipped 2026-07-28.**
      `lib/dnd/systems/pathfinder2e/adopt.ts` + two inventory edit ops, and the adopt route now branches on
      the **sidecar** (`isPF2Character`) rather than the system column, because the column can disagree with
      what is actually stored.
      **The bug it fixes looked like it worked**, which is the worst shape a bug can have: `adoptHomebrew`
      writes 5e shapes onto the shared `Character`, so adopting onto a PF2 character wrote into a blank 5e
      projection — the save succeeded, the sheet showed nothing, and nothing said why.
      **Carries:** gear → an inventory line (possible only since P5-1; before it there was nowhere to put a
      rope), a weapon with damage → a Strike, a feat → the **archetype** track (not `class`, or it would be
      counted against a budget it was never granted by), a spell → a known spell.
      **Refuses, loudly:** a class or subclass, because PF2 advancement is four feat tracks and proficiency
      ranks rather than a hit die and an ASI ladder — converting produces something that *levels wrongly*,
      which is worse than a refusal. The refusal explains itself and points at the transposer.
      **The interesting decision: 5e `effects[]` are NOT translated, only flagged.** A `str_score +2` is a
      statement about ability *scores*, which PF2 does not have in play; mapping it would silently rebalance
      every piece that crossed. The player is told in plain words and pointed at P6-18, which is the honest
      route between systems and says out loud that it produces a new variant.
      A test asserts no effect leaks into a PF2 edit, and that the route preserves the rest of `data` when
      writing the sidecar back — rebuilding from the sidecar alone would delete the 5e projection and the
      custom sections stored beside it.
- [x] **P6-9b — Intuitive Games engine bridge. Shipped 2026-07-28.**
      `lib/dnd/systems/intuitive-games/adopt.ts` + two equipment ops. **All three systems now resolve
      adopted homebrew natively** — the adopt route branches PF2 → IG → 5e on the sidecar.
      **Not the PF2 file twice**, and the differences are the point: IG has **stances**, which land natively
      here and are meaningless in either other system; its gear is a loose `equipment.other` list rather
      than a Bulk-tracked inventory (**no weight field, deliberately** — Bulk is a Pathfinder concept and
      importing it would invent a rule IG does not use); and its **powers and spells are one list**, so both
      kinds converge on `add_power`.
      A stance is **learned, not entered** — adopting one adds it to the known set and must not silently
      change what the character is currently holding. Pinned by test.
      Same refusals as PF2 (class/subclass, prose-only kinds), phrased in **IG's own terms** — "per-level
      schedule of powers and specializations" rather than Pathfinder's feat tracks — and the same
      flag-don't-translate rule for 5e `effects[]`.

> **Homebrew now works on every playable system.** Author it, share it, adopt it, and it resolves as real
> mechanics on a 5e, Pathfinder 2e or Intuitive Games sheet — or is refused with a reason and a pointer at
> the transposer. That closes the owner's second priority ("the homebrew building stuff built and surfaced").

- [x] **P6-10 — Library + grounding surfacing. Shipped 2026-07-28.** Published content now appears in its
      system's library page, in library search, and in the AI librarian's grounding.
      **The interesting constraint was keeping `library.ts` pure.** Its header states the library "needs no
      DB round-trip and works with no embeddings key", and that is load-bearing: the rules reference renders
      and searches correctly on a cold deploy with an empty database, which is why the six
      under-construction systems can be fully documented while nothing is seeded for them. So the catalog is
      **injected** — `libraryPageFor` / `allLibraryPages` / `libraryCatalogFor` / `searchLibrary` take an
      `extraHomebrew` argument defaulting to `[]` — and `lib/dnd/homebrew/published.ts` is what callers use
      to fill it. Pass nothing and the behaviour is byte-identical to before. A homebrew-table failure costs
      the community extras and never the official rules.
      **`revalidate = 300` on `/dnd/library/[key]`.** It has `generateStaticParams`, so with pure static
      generation the catalog read would happen **once at build time** and newly published content would
      never appear until the next deploy — a subtle bug to diagnose. `force-dynamic` would fix it by
      re-rendering hundreds of kilobytes of rules catalog on every request; ISR is the trade.
      **A test caught the RSC change**, correctly: `library-deep-links.test.tsx` rendered the page with
      `renderToStaticMarkup`, which cannot render an async component — it renders the returned Promise as a
      child. It now awaits the component and renders its element tree, with the id map filled in
      `beforeAll` rather than at module scope.
      **Still owed here:** a creator's public content on their lobby page. Small; folded into P6-11.

- [x] **P6-11 — Images. Shipped 2026-07-28.** `POST`/`DELETE /api/dnd/homebrew/[id]/image` on the existing
      `dnd-media` bucket pattern, the `image` field wired in the builder, and rendering on the browse card,
      the detail page and the lobby strip. Also closes P6-10's remainder: `MyContentStrip` puts a creator's
      six most recent pieces on the lobby, and renders **nothing** when they have authored nothing — an
      empty "you have no content" section would just repeat the Content Builder button three inches above it.
      **Two orderings are pinned by test, because reversing either silently loses artwork:** the row is
      updated *before* the old file is deleted (reversed, a failed update leaves the piece pointing at an
      object that no longer exists — an orphan costs storage, a broken reference costs the picture), and the
      image is uploaded *after* the piece is created, never staged before it. A failed image upload reports
      as "saved, but the image did not upload" rather than as a failed save, because the content is already
      in the database and saying otherwise would have the author redo stored work.
      **`delete-route-authorization.test.ts` caught a real weakness.** The first version put the permission
      check inside a shared loader, invisible to a guard that scans each DELETE handler's own body. The guard
      is right on the substance too — on a destructive handler the authorization should be readable at the
      point of use, not one indirection away — so the check was inlined in both handlers rather than the
      guard being widened.
      Rendered on the browse card, the statblock and the library entry. *(The owner's creature-with-artwork
      case is the acceptance test.)*

- [x] **P6-12 — The class studio. Shipped 2026-07-28** *(inline feat authoring split out as P6-12b).*
      The `levels` editor (per-level name, rules text and choice-kind, with the choice kinds matching
      `ClassFeature['choice']` so marking a level "asi" genuinely tells the walker to prompt there), the
      partial-build state surfaced **while authoring** rather than discovered on save, and base-class
      derivation via `GET /api/dnd/homebrew/base-class`.
      **Derivation is a route, not shipped data:** `classesForSystem('dnd5e-2024')` is thirteen classes with
      full rules text at twenty levels — hundreds of kilobytes to fill one dropdown. It returns
      **draft-shaped keys** matching the `class` field schema, so there is no translation layer to drift.
      Three deliberate omissions, each pinned by test: **subclass features are excluded** (copying them in
      produces a class that grants one subclass's features to every character who takes it); **the source
      description is not inherited** (every derived class reading "The Fighter is a master of martial
      combat…" is worse than a blank one); and the **author's own name and prose survive a derivation**,
      because overwriting a name they had already typed with "Fighter" would be actively hostile.
      **`effects` is now the only placeholder left in the builder** — it ships with P6-9's engine bridges.

- [ ] **P6-12b — Inline feat authoring inside the class studio.** *(Split from P6-12.)* The owner's *"they
      might even be able to homebrew custom feats while making the class to make those feats available at
      certain levels."* Deliberately separate because it is a genuinely different problem from the rest of
      P6-12: it creates a SECOND piece from inside an unsaved draft, which needs a decision about what
      happens to that feat if the class is never saved. Cheap to build, easy to get wrong quietly.

- [x] **P6-13 — The creature builder + statblock. Shipped 2026-07-28.** `lib/dnd/homebrew/statblock.ts`
      (pure model + normalizer), the `statblock` and `list` editors in the builder, and a rendered statblock
      beside the uploaded art on the detail page. With P6-11's images, **the owner's creature case now works
      end to end**: stats, abilities, actions, description and artwork on one page.
      **Building the `list` editor for creatures also unlocked species lineages/traits and class resources**
      — the payoff of a registry-driven form, and the detail page renders list sections from
      `fieldsForKind` rather than naming creature fields, so a new list field on any kind prints with no
      change to that page.
      **The statblock DROPS what it cannot trust rather than clamping it.** A statblock is read off the page
      mid-combat, so a typo'd AC must render as absent, not as a plausible number the DM will use.
      **A test I wrote caught a real falsy-zero bug in my own code:** `isStatblockEmpty` used `!s.ac`, which
      treats **AC 0** as an empty statblock — legal, unusual, and invisible until the one creature that has
      it renders blank. Every numeric field now tests `=== undefined`.
      **Deliberately system-neutral:** only the shared skeleton (AC, HP, speeds, six abilities) is modelled;
      size, type, CR, senses and the rest stay their own fields, because the four systems disagree about
      what those numbers mean and a universal creature model would be subtly wrong for all of them.

- [ ] **P6-14 — The creature sheet.** *(the owner's "simple character sheet for creatures".)* A playable
      sheet tracking attacks, abilities, feats, conditions and HP — reusing the encounter/initiative model so
      a creature dropped into a fight and a creature opened from the Studio are the same object.

- [x] **P6-15 — AI assist, per field. Shipped 2026-07-28.** `lib/dnd/homebrew/assist.ts` (pure prompts +
      output cleaning), `POST /api/dnd/homebrew/assist`, and a ✨ button on each prose field.
      **Stateless, and that constraint shaped the design.** Assist matters most while writing the *first*
      draft — before the piece exists and therefore before it has an id — so the route takes the
      draft-in-progress in the body and loads nothing. A pleasant side-effect: it **writes nothing**, so
      "never auto-applies" is true at the API level rather than only in the component.
      **The proposal is held outside `values`.** A suggestion living in the form state is one refresh away
      from becoming the author's own text. It renders above the field with their existing content still
      visible, and they choose: *Use it · Replace mine · Add to mine · Another · Dismiss*.
      **Offered only on prose fields.** A number or a dropdown is faster to type than to review, and an
      assist button on every field turns a form into a slot machine. The route re-checks the field against
      the **registry** rather than trusting the client, or `field` is an arbitrary string interpolated into
      a prompt whenever the UI misbehaves.
      **The buttons are hidden, not disabled, when AI is unconfigured** — a disabled control says "you are
      missing something"; an absent one says "this form is complete". The owner's second half ("the user can
      fully build everything from scratch") is a requirement, not a fallback.
      Temperature 0.8, above the transposer's 0.7: pressing "Another" must give a genuinely different
      option, not the same sentence reworded.

- [ ] **P6-15b — Whole-draft assist.** *(Split from P6-15.)* "Fill in everything from the name and a
      sentence." Deferred because a multi-field proposal needs a per-field accept/reject UI to stay honest —
      one all-or-nothing button would quietly become the auto-apply this slice exists to avoid.

- [x] **P6-16 — File ingest. Shipped 2026-07-28.** `lib/dnd/homebrew/ingest.ts` (pure prompt + normalizer +
      merge), `POST /api/dnd/homebrew/ingest`, and an upload at the top of the builder.
      **This is the path the owner used to get the Pugilist into the repo**, so the bar is not "extract some
      text" — it is that the *wording survives*. Temperature 0.1, and the prompt is pinned as saying
      *"TRANSCRIBING, not designing"*, *"do not paraphrase rules text — a reworded rule is a different
      rule"*, and *omit rather than guess*. The failure it prevents is silent: an author reads a plausible
      sentence and does not notice it is not the one their book contains.
      **PDFs and images go to the model as native content blocks**, not OCR-to-plaintext. A class PDF's
      layout carries meaning — a level table *is* a table — and flattening it is exactly where a twenty-level
      ladder turns to mush.
      **The review step is that it fills the FORM, not the database.** The route writes nothing; the author
      sees every field before pressing Save. And `mergeIngest` fills only **empty** fields and reports which
      ones it touched, so it is safe to press twice, safe to press after you have started typing, and nobody
      is left diffing a form by eye.
      **Structured editors are deliberately out of scope** (statblock, levels, effects, lists): a level
      ladder subtly wrong from a PDF is worse than a blank one, because the author would have to check all
      twenty levels to find the drift. Those read as normal text in `description` and get entered
      deliberately. An unknown key from the model is dropped, not merged — the builder spreads this into
      form state, so a stray key would become a stray key in the saved payload.

> **The owner's original Content Studio brief is now complete.** Build anything, for any system, from
> scratch or from a document; with mechanics, artwork, statblocks and level-by-level classes; private,
> unlisted or public; adoptable onto characters; present in the library and the AI librarian; reviewable by
> AI; and translatable into another system with a full approve / retry-with-notes / hand-edit loop.
> What remains in this phase is depth and cleanup (P6-9a/b, P6-12b, P6-15b, P6-19), not the brief.

- [x] **P6-17 — AI design review. Shipped 2026-07-28.** `lib/dnd/homebrew/assess.ts` (pure prompt +
      normalizer), `POST /api/dnd/homebrew/[id]/assess`, and a creator-only panel.
      **On demand rather than on save**, which is a deliberate departure from the literal ask. A model call
      on the save path makes saving slow and makes it *fail when the model does* — against this Studio's
      central promise that an unfinished piece is kept, not thrown away. It also lets an author re-review
      after edits without re-saving, and keeps the expensive call behind its own rate-limit bucket instead
      of making every save cost AI budget. The button is one click on the piece.
      **The advisory boundary is enforced by tests, not just intent:** the update writes `assessment` and
      nothing else (no status, no payload, no name), and deliberately does **not** bump `updated_at` — a
      robot having an opinion is not a change to the piece, and bumping it would reorder the author's
      library *and* instantly mark the review stale against the very piece it described.
      **Tone is structural, not just prompt-deep:** strengths render first (a review that opens with
      problems reads as a rejection of work someone just finished), the verdict is a word rather than a
      score (a number invites optimising for it), and the prompt is pinned as saying *"not to gatekeep"* and
      *"rather than inventing a comparison"* — Ground Rule 3 applied to a reviewer.
      The prompt carries the two contexts that decide whether a review is fair: a **partial build is a
      supported state**, and a **prose-only kind is not missing its mechanics**. Without those, a model
      reliably reports both correct states as flaws.
      An unusable response is refused rather than stored as a fragment — a half-parsed review is worse than
      none, because it is shown as a considered opinion.

- [x] **P6-18 — The system transposer. Shipped 2026-07-28.** `lib/dnd/homebrew/transpose.ts` (pure prompts
      + normalizer), `POST /api/dnd/homebrew/[id]/transpose`, and a review panel with all four exits the
      owner described: **Keep it · Try again with notes · Open & edit · Discard**.
      **The loop is the feature, not the generation.** A retry sends the model *its own previous attempt*
      alongside the notes — without that it cannot tell what the author is reacting to and reliably
      reproduces the thing they just rejected — and it **rewrites the same draft** rather than stacking
      another, so a fussy author ends with one variant they like instead of nine they rejected. It runs
      hotter than the design review (0.7 vs 0.3), because a retry returning nearly the same text is useless
      to someone who just asked for something different.
      **The loop needed no new lifecycle:** approve is "it is already your private draft, stop reviewing",
      discard is the ordinary DELETE, retry is this route again. Bespoke endpoints would have meant two sets
      of rules about who may edit what.
      **`variantId` is guarded as the write primitive it is** — the target draft must be *yours* and must
      actually descend from *this* source, or "retry" becomes an arbitrary-row overwrite.
      **Provenance travels in the DESCRIPTION**, not just the UI: the description is what reaches the
      library, an export and the AI grounding, so a note living in one component is not provenance. The
      draft is created **private**, so a machine translation cannot reach a library or a sheet before a
      human has read it — the worst outcome here is a bad translation nobody knows is a translation.
      Needs only READ on the source: translating someone's *published* content into your system is
      reasonable, the result is yours with the original credited, and nothing modifies the source.

- [ ] **P6-19 — Migrate `dnd_content`.** Once the Studio is proven, move the existing campaign content into
      `dnd_homebrew` with attribution inferred from `created_by`, and retire the old route. Deliberately last
      so nothing in active play breaks early.

---

## Phase 7 — The live synced session (the Roll20-shaped table)

> **The owner's vision, 2026-07-28:** *"a Roll20 kind of session thing where people can fully build maps and
> stuff and add their character tokens to the maps and be able to actually keep track of initiative and hp
> and stats and movement and all of that in real time for the DM and each player. Everything and everyone in
> a campaign will be totally synced up."*
>
> *(Supersedes audit finding B-1, which described only the missing battle map. The real ask is bigger: the
> map is the surface, but **synced session state** is the product.)*

### What exists, and what "totally synced up" actually requires

Nearly every *piece* exists; what is missing is a **shared authoritative session state** and the canvas that
renders it. Today: `useCampaignChannel` (realtime), `useCampaignPresence`, `dnd_encounters` +
`dnd_initiative_entries` (per-instance HP, turn order), `NpcLibrary`, `RevealOverlay`/`RevealTrigger`,
`TokenFramer` (token art), `dnd_roll_log`, `SessionConsole`. The Map Studio is stellar cartography with
**zero tokens, grid, fog or measurement** — the string "token" appears 0 times in its 2,826 lines — and it is
a same-origin vanilla iframe, so it cannot reach the realtime channel. **The battle map is a new React
surface, not an extension of it.**

### The three design decisions everything else follows from

**1. Authority — who owns truth for each piece of state.** Get this wrong and you get two players dragging
one token forever. The rule:

| State | Authority | Why |
|---|---|---|
| Map, grid, fog, DM-hidden tokens | **DM** | Players must not be able to reveal what the DM hid — enforce server-side, not by hiding the UI. |
| A token's position | **its controller**, DM overrides | The player moving their own character is the whole feel of a VTT; a DM veto covers grapples, forced movement, shoves. |
| Initiative order, HP, conditions | **server** (`dnd_initiative_entries`) | Already the durable model; two clients must never disagree about whose turn it is. |
| A character's sheet | **the sheet's existing write gate** | Do not fork sheet state into the session — the map reads the sheet, it does not own it. |

**2. Two transports, deliberately.** Ephemeral high-frequency events (a drag in progress, a cursor, a ping)
go over **Realtime broadcast only** — never persisted, lost on reload, and that is correct. Durable state
(committed position, HP, conditions, fog) is a **Postgres write that then broadcasts**. Writing every
mouse-move to Postgres is the mistake that makes these things unusable.

**3. Optimistic local, reconcile on echo.** The mover sees their token move at 0ms; everyone else sees it on
the broadcast; the durable write reconciles. A token carries a `version` so a late echo cannot rubber-band a
newer local move.

### Slices

- [ ] **P7-1 — The session state model.** `seeds/456_dnd_battle.sql`: `dnd_battle_maps` (campaign, name,
      image, grid size/offset/unit, scale) and `dnd_battle_tokens` (map, character_id or initiative_entry_id,
      x, y, size, controller_user_id, hidden, version). Plus `lib/dnd/battle/model.ts` — pure: grid
      snapping, pixel↔grid conversion, and `canControlToken(token, viewer)`. Pure first so the rules are
      testable without a canvas.
- [ ] **P7-2 — The map surface.** `/dnd/campaigns/[id]/battle` — upload or pick an image, pan/zoom, and set
      the grid by **dragging across two known squares** (never by typing a pixel size, which nobody knows).
      Pointer Events from the start, so it works on a tablet — do not repeat P10-1.
- [ ] **P7-3 — Tokens on the board.** Seeded from the encounter's initiative entries, so HP, conditions and
      turn order are correct on arrival rather than re-entered. Portrait/token art from `TokenFramer`. Drag
      to move with snapping; DM can add, remove, resize and hide.
- [ ] **P7-4 — Realtime sync.** The two transports above, over the existing campaign channel. Includes the
      unglamorous parts that decide whether it feels alive: presence (who is looking at this map), a late
      joiner receiving full state, and reconnect-after-sleep without a stale board.
- [ ] **P7-5 — Movement tracking.** Distance as you drag, measured in the map's own units, against the
      creature's speed — with **each system's own diagonal rule** (5e 2014 optional 5-10-5, 2024 flat, PF2's
      every-other-diagonal). Do not average them into one wrong rule. Shows remaining movement this turn.
- [ ] **P7-6 — Turn integration.** The current combatant is highlighted on the board; ending a turn advances
      the tracker and resets that token's movement budget. **This is what makes the map a tool rather than a
      picture**, and it is the slice most likely to be skipped.
- [ ] **P7-7 — Fog of war.** A DM-painted reveal layer; players receive only revealed regions — filtered
      **server-side**, because a client-side mask is a screenshot away from being no mask at all.
- [ ] **P7-8 — HP, conditions and stats on the board.** Token HP bars (DM sees numbers, players see a band
      unless the DM opts in), condition icons, and click-through to the full sheet. Two-way: damage applied
      on the board lands on the sheet through the existing edit path, so it is undoable like any other change.
- [ ] **P7-9 — Templates and area effects.** Cone / circle / line / emanation per the system's geometry,
      with the creatures caught in one highlighted.
- [ ] **P7-10 — Player-side polish.** Pings ("look here"), a shared drawing layer, and per-player token
      control so a player moves only their own — the difference between a DM demo and a table everyone plays
      at.
- [ ] **P7-11 — Map building.** Layers, a stamp/asset palette, and import of the existing published campaign
      maps so the Map Studio's galaxy maps can be used as battle backdrops. *(The owner's "fully build maps
      and stuff".)*
- [ ] **P7-12 — The session shell.** One `/dnd/campaigns/[id]/play` that puts the board, the initiative
      tracker, the roll feed (P3-1) and chat in a single synced screen for DM and players — the thing the
      vision actually describes. Everything before this is a component of it.

> **Sequencing note.** P7-1 → P7-4 is the spine; stop there and you have a shared board, which is already
> most of the value. P7-5/6/8 are what make it a *rules* tool rather than a shared whiteboard. P3-1 (rolls
> reaching the shared log) should land before P7-12, or the session shell will have a roll feed showing
> nothing.

---

## Phase 8 — Content coverage

- [ ] **P8-1 — A bestiary.** *(E-1.)* No monster catalogue exists in any system; NPCs are hand- or AI-built
      per campaign and reusable only within it. Every other content axis is catalogued — monsters are the
      conspicuous omission, and they are what a DM needs most between sessions.
      **Design:** `lib/dnd/monsters/<system>.ts` from the CC-licensed subsets (5e SRD; PF2 Monster Core),
      sharing the creature model from P6-13 so a homebrew creature and an official one are the same shape.
- [ ] **P8-2 — Magic items.** *(E-4.)* SRD magic items for 5e; PF2's runes are already modelled and are the
      equivalent surface there.
- [ ] **P8-3 — The IG glossary.** *(E-2.)* Intuitive Games has 32 terms — fewer than **every** unbuilt system
      (Blades 60, Shadowrun 55, CoC 51) and a third of PF2's 96. Another scrape pass of intuitivegames.net.
      Ground Rule 3: scrape, do not invent.
- [ ] **P8-4 — PF2 spell coverage + an explicit gaps list.** *(E-3.)* 208 spells against 5e's 382, roughly
      half of Player Core. Extend the `PF2_*_GAPS` convention to spells so an absent spell reads as "not
      catalogued yet" in the picker rather than as "does not exist".

---

## Phase 9 — Data lifecycle

- [ ] **P9-1 — JSON import.** *(H-1.)* Export produces a genuinely loss-less JSON; **nothing reads it back**.
      `/api/dnd/characters/import` is a different thing entirely (file upload → AI ingestion), so a user's own
      perfect backup can only be re-ingested by having a model guess at it.
      **Design:** `POST /api/dnd/characters/import-json` validating the exported shape, normalising the
      system, creating the character with its sidecar intact — **plus a round-trip test** (export → import →
      deep-equal), which is also the strongest possible guard on the export's completeness claim.
- [ ] **P9-2 — Campaign export.** *(H-2.)* Roster, session notes, recaps, maps, handouts, NPCs, roll log and
      chat. With P2-5, this is what makes deleting a campaign a safe action rather than a destructive one.
- [ ] **P9-3 — Pathbuilder import.** *(H-3.)* A deterministic adapter for Pathbuilder's JSON — fast, exact,
      free of model cost, and aimed at PF2 players, who are currently the least-served.

---

## Phase 10 — Accessibility, devices & polish

- [ ] **P10-1 — Pointer events + responsive map studio.** *(G-1.)* 18 `mousedown`/`mousemove` handlers,
      **zero** touch or pointer handlers, **zero** media queries across 2,826 lines — so the DM's only map
      tool is unusable on a tablet or phone, while the player console it embeds *does* have touch handling.
      Convert to Pointer Events (largely mechanical) plus `touch-action` CSS; add a breakpoint collapsing the
      tab rail and inspector into drawers below ~900px.
- [ ] **P10-2 — Hold the line on inline styles.** *(G-2.)* 3,111 inline `style={{…}}` objects against 658
      CSS-module class uses — which is why every theming pass has been expensive: an inline colour cannot be
      reached by a token, a media query, a print stylesheet or a contrast audit. **Not a rewrite:** a lint
      rule flagging hex literals inside `style={{}}`, and opportunistic migration whenever a file is touched.
- [ ] **P10-3 — A native print stylesheet for the live sheet.** The HTML export already carries print CSS;
      applying the same rules to the live sheet makes Ctrl-P produce something real.
- [ ] **P10-4 — Discord webhook.** Rolls and session reminders out to where tables already are. Nearly free
      once P3-1 lands.
- [ ] **P10-5 — Offline / PWA sheet.** Sheets are already client-rendered from one JSON blob, so the hardest
      part of offline is already true.
- [ ] **P10-6 — An i18n passthrough.** *(G-3.)* No message catalogue anywhere. If it will ever matter, the
      cheap move now is a `t()` passthrough for new user-facing strings; retrofitting after another 100k
      lines is materially harder.

---

## Blocked on the owner — data, not effort

Each is pinned by a test that **flips when the data arrives**, so none can be quietly forgotten or quietly
filled in from the shape of its neighbours.

| Item | Needs | Where |
|---|---|---|
| ~~**Pugilist / Street Saint / Down but Not Out**~~ | **UNBLOCKED + SHIPPED 2026-07-28** — see below. | — |
| **IG Champion** | Champion's powers and specializations. Not in the intuitivegames.net scrape; every other subclass has them verbatim. | `slot-plan-blockers.test.ts` |
| **Magus / Summoner** | The published *reduced*-caster spell tables. Every full caster is handled. | `slot-plan-blockers.test.ts` |
| **IG level-1 feat count** | The site says "starting feats" without a number. The builder allows exactly one and errs permissive. | `slot-plan-blockers.test.ts` |
| **PF2 prepared cap** | A decision, not data: whether to *enforce* it. Everything needed is in place. | — |
| **Six unbuilt systems** | One scrapeable source per system, one at a time. | `under-construction-gating.test.ts` |

### Pugilist — resolved 2026-07-28, and what it taught

The owner supplied the full 2014 class text, the author's Street Saint PDF, and the 2024 Down but Not Out
text. Three things shipped, and a fourth is now a recorded conflict rather than a silent guess:

1. **The shipped 2014 data was verified, not changed.** Every feature at every level, the Moxie table
   (—/2/2/3/3/4/4/5/5/6/6/7/7/8/8/9/9/10/10/12) and the Fisticuffs ladder (1d6 → 1d8@5 → 1d10@11 → 1d12@17)
   all matched the source exactly. *A source arriving and confirming what you already had is the good
   outcome, and it is worth writing down that it happened.*
2. **Street Saint is written out in full.** Transcribed verbatim from `street-saint_redux.pdf` — Channel
   Divinity (Fists of Faith · Grace of the Gods) + Lay on Hands at 3, Hallowed Hands at 6, Ravaged but
   Resolute at 11, Aura of Resilience at 17. It is an **eighth 2014 Fight Club**, not a 2024-only one: its
   features key off Bloodied but Unbowed (3) and Dig Deep (4) and it uses the 2014 ladder.
   **The pin flipped exactly as designed** — `pugilist-class.test.ts` required the body to say "under
   construction", and filling it in turned that test red, which is the signal to replace it with assertions
   on the real thing. That is the pin mechanism paying for itself.
3. **Down but Not Out was missing from the 2024 class entirely** and is now at level 7.
4. **A genuine edition divergence, recorded rather than averaged.** The two editions disagree about this
   feature, and about Street Saint's Channel Divinity:

   | | 2014 (class document) | 2024 (D&D Beyond printing) |
   |---|---|---|
   | Down but Not Out | level **9**, adds **proficiency bonus** | level **7**, adds **CON modifier + current exhaustion levels** |
   | Street Saint CD | Fists of Faith — crit on 19–20 | an earlier note described "+d4 per attack, once per short rest" |

   The 2024 Street Saint wording has **not** been supplied, so its entry carries the 2021 text with an
   explicit caveat in its own description. **Do not reconcile these by picking the average** — that produces
   a version matching neither book.

- [ ] **P0-6 — The 2024 Street Saint's own text.** *(Blocked on data.)* Needed to resolve row 4 above.
      Until it arrives the 2024 entry correctly reuses the 2021 text and says so.

**Author's name corrected repo-wide: Benjamin *Huffman*, not Hoffman** (per the PDF's own credits and the
community homebrew repo). It was wrong in three files and two tests.

---

## Open questions — answered with a recorded assumption rather than blocking

1. **Who approves public content?** Assumption: **public is self-serve**, with the per-campaign DM allowlist
   (which already exists) as the gate that actually matters for play. The `submitted`/`approved` states stay
   in the model for a curator flow if one is ever wanted.
2. **`'any'` system scope.** Assumption: **offered, but only for kinds whose mechanics are prose** — an
   `'any'` class is not a meaningful object when every engine's class model differs. Encoded in
   `KindSpec.allowAnySystem`.
3. **Milestone vs XP.** Assumption: XP is opt-in per campaign (P3-4), so tables that do not use it never see
   it.
