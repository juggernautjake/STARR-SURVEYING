# D&D platform — game systems still to build out (under construction)

**Status:** PENDING — parked by owner directive 2026-07-26 · moved out of `in-progress/`

> ## 2026-07-26 — parked on the owner's instruction
>
> Asked directly whether the other six systems were to be built: *"Are you planning to build the other
> systems too? For now let's just focus on making the current 4 systems as awesome and flawless as possible.
> I really want the character customization and editing and building/creation to be intuitive and top notch.
> I want every choice and every mechanic to be meaningful and helpful to the user in crafting their character
> exactly how they want."*
>
> So this is parked deliberately, not abandoned and not deferred for cost: it is **de-prioritised in favour of
> depth on the four focus systems** (D&D 5e 2024, D&D 5e 2014, Pathfinder 2e, Intuitive Games). It moves to
> `pending/` per `docs/planning/README.md` — *"planned work we intend to build later, scoped and parked
> deliberately"*. It was only in `in-progress/` because of an earlier blanket "put everything into the
> in-progress folder" instruction; this supersedes that for this doc.
>
> Nothing is lost by parking it: the six are gated honestly at every surface
> (`under-construction-gating.test.ts`, 10 tests), their authored rules stay in `system-rules-extra.ts`, and
> the gate derives from `GameSystem.status` — so flipping one to `'available'` remains the only change a
> finished system needs. Move this doc back to `in-progress/` when the owner supplies source material for a
> specific system.

**Earlier status:** IN PROGRESS (reopened 2026-07-25) · **but the six builds are genuinely blocked — see below**

> ## 2026-07-25 — reopened, assessed, and what actually shipped
>
> Reopened with the other four docs ("put everything into the in progress folder"). Assessed honestly:
> **the six system builds cannot be started yet, for two independent reasons.**
>
> **1. Ground Rule 3 — never invent a rule.** The bar below demands classes/playbooks/occupations authored
> L1→max and *source-verified*, for Pathfinder 1e, Starfinder 1e, Cyberpunk RED, Shadowrun 6e, Call of
> Cthulhu 7e and Blades in the Dark. That means BAB and save progressions, EAC/KAC and Resolve, Role Ability
> ranks, priority/Karma tables, occupation skill-point formulas, playbook ability lists — six different
> rulebooks' worth of numbers, none of which are in this repo. Authoring them from memory is exactly the
> failure mode Ground Rule 3 exists to prevent, and it is worse here than a gap: a player would trust a
> character sheet that is quietly wrong. **This needs the owner to supply or point at the source material,
> one system at a time** — the same way the Intuitive Games schedule was scraped from
> intuitivegames.net/character-building rather than guessed.
>
> **2. Its own precondition is unmet.** This doc says "pick up after the four focus systems are complete."
> They are not: `DND_RULES_PLATFORM` still has Slice 5 (custom class builder UI), Slice 6, Slice 7 and
> Slice 8b open, and PF2's own settings work only just landed.
>
> ### What DID ship (the part that needed no rulebooks)
>
> The one thing genuinely owed *during* the under-construction period: that the six are presented **honestly**
> — visible as coming later, but impossible to start building and discover halfway that they don't work.
> That gate existed but was only partly guarded. `__tests__/dnd/under-construction-gating.test.ts` (7) now
> pins it at every surface: the **server** route rejects a switch onto an unbuilt system with a 400 (the one
> that matters, since every UI below it can be bypassed by a direct POST), the create-character picker and
> the versions/system switcher offer only built systems, the public library 404s an unbuilt system's page and
> does not pre-render it, and each unbuilt system still carries real name/publisher/notes so its row never
> reads as a bug.
>
> Crucially the guard **derives from the `status` flag** and asserts that no surface hard-codes the six keys —
> so when a system is genuinely finished, flipping `status` to `'available'` is the *only* change needed and
> these tests keep passing on their own.
>
> ### To unblock
> Pick ONE system and provide its source (book, SRD, or a scrapeable site). Each is then a dedicated build —
> model → content → editors → library → tagging — on the pattern `lib/dnd/systems/intuitive-games/` set.

> ## 2026-07-26 — searching an unbuilt system's rules led to a 404
>
> The one thing this doc says it owes during the under-construction period is that the six are presented
> **honestly**. A gap in that, at a surface the earlier gate didn't cover:
>
> **The defect.** These systems have real, substantial rules authored in `system-rules-extra.ts`, and
> Slice 8b's `library.test.ts` deliberately asserts search explains them in full (*"a non-d20 system's own
> vocabulary is fully explained"*). But the owner hid their PAGES site-wide on 2026-07-18, so
> `/dnd/library/[key]` `notFound()`s them — while `LibrarySearch` went on linking every hit there. Searching
> **"sanity"** found Call of Cthulhu's article, showed its whole explanation, and clicking it **404'd**. Both
> the per-system group header and each individual result linked to the same dead page.
>
> **My first fix was wrong, and the tests caught it.** I scoped `searchLibrary` to available systems only.
> Four Slice-8b tests failed — correctly: that discards authored content, and the six's `status` gates the
> character **builder**, not the rules reference. Two owner-era intents were in conflict and I had quietly
> picked one. Backed it out.
>
> **What shipped instead.** The defect was never the search, it was the LINK. A hit already renders its
> entire explanation inline — the link only ever added an anchor jump — so an unpublished system's hits now
> render **unlinked**, with a `rules only · builder in development` badge that says why rather than looking
> like a result that failed to render. Search, the scope selector and the librarian's focus all keep
> offering the six, because the content behind them is real. (The librarian was never a Ground-Rule-3 risk
> for the same reason: `systemGroundingBlock` reads that same authored catalog, so it answers from the book
> rather than from recall.)
>
> **Stale descriptions corrected.** `SystemStatus`'s own doc comment said under-construction meant "offered
> but clearly labelled (rules catalog only)" — the pre-2026-07-18 behaviour. That wording is exactly how the
> search surface got missed, so it now records what the code does and points at the guard. The gating test's
> "they ARE listed, so a blank row reads as a bug" note is corrected the same way: nothing is listed now, and
> the metadata is required because it is what the pickers will render the moment a `status` flips.
>
> **Note on the scope text below:** it says the six are "offered in the UI, labelled 🚧 under construction …
> the campaign-creation picker lists them in an 'Under construction (coming later)' group". That has been
> stale since 2026-07-18 — they are hidden entirely, behind one "more systems coming soon" card.
>
> **Bar:** 4 new guards (10 in `under-construction-gating.test.ts`), 4782/4782 D&D tests, typecheck exit-0,
> lint clean. The six builds themselves remain blocked on source material — unchanged.

**Original status:** PENDING · parked 2026-07-16 · pick up after the four focus systems are complete
**Scope:** the six game systems the platform seeds but has **not** fully built out. They are offered
in the UI, labelled **🚧 under construction**, and NOT selectable for a real build yet
(`GameSystem.status === 'under-construction'` in `lib/dnd/systems.ts`; the SystemSwitcher disables
them, the campaign-creation picker lists them in an "Under construction (coming later)" group).

## Why this doc is parked here (not in-progress)

The project is focused on **four** systems first — **D&D 5e 2024, D&D 5e 2014, Intuitive Games, and
Pathfinder 2e** — building each out fully: campaign + character editors, all classes/subclasses/feats,
the rules + action economy, and a fully fleshed-out, searchable, AI-navigable library. The six systems
below are deliberately deferred until those four are done. They are real, valuable, and will be built —
just not now. Each is a **dedicated per-system effort** (a different rules model, like
`lib/dnd/systems/intuitive-games/` — NOT data shoe-horned into the 5e-shaped `ClassDefinition`, whose
hit-die/ASI/slot math would misrepresent them).

## What each system needs (moved here from the main plan doc's Slice 6c–6h)

- **Pathfinder 1e** (`pathfinder1e`) — BAB progressions, three save progressions, skill ranks, feats at
  odd levels, confirmed criticals. Its own advancement model.
- **Starfinder 1e** (`starfinder1e`) — Stamina/HP/Resolve, EAC/KAC, four-ability increases at
  5/10/15/20, the SF class model.
- **Cyberpunk RED** (`cyberpunk-red`) — Roles + Role Ability ranks 1–10 (no levels — model as rank
  tracks), 1d10 + STAT + SKILL with exploding 10s, Humanity/Stopping Power.
- **Shadowrun 6e** (`shadowrun6e`) — archetypes + priority creation (no levels — model as Karma spend),
  d6 dice pools counting hits on 5–6, Edge, Essence vs Magic.
- **Call of Cthulhu 7e** (`coc7e`) — occupations + skill-point formulas (no levels, no classes),
  percentile roll-under, Sanity and Luck.
- **Blades in the Dark** (`blades`) — playbooks + special abilities + XP tracks (no levels), position &
  effect, stress and trauma.

## For each system, "fully built out" means (the bar the four focus systems set)

- [ ] A dedicated rules/advancement **model** (following the `intuitive-games` module pattern), not the
      5e `ClassDefinition` — the derived numbers must be correct for that system.
- [ ] **Classes/playbooks/occupations + their options** authored to the system's own structure, L1→max
      (or the level-less advancement flow), source-verified (Ground Rule 3 — never invent a rule).
- [ ] **Character + campaign editors** that speak the system's mechanics (its abilities, its economy).
- [ ] A **fully fleshed-out library**: every condition, rule, term, and action defined; searchable with
      the keyword engine (works without an embeddings key); and AI-navigable so the librarian answers
      questions about the system's content correctly.
- [ ] Everything **tagged with the correct system** so no content leaks across systems (Ground Rule 1;
      `system-integrity.test.ts` is the guard). Flip `status` to `'available'` in `lib/dnd/systems.ts`
      only when the system genuinely meets this bar.

## When picking this up

Move this doc back to `in-progress/`, take one system at a time (depth-first), and flip its
`GameSystem.status` to `'available'` only when it fully meets the bar above.
