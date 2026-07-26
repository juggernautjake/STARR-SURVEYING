# D&D platform — game systems still to build out (under construction)

**Status:** PENDING · parked 2026-07-16 · pick up after the four focus systems are complete
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
