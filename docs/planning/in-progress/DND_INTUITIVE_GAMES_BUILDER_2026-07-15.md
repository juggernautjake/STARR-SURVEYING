# Intuitive Games — full character builder, sheet, custom/vanilla provenance & DM approval

**Goal (from the DM):** a full, complete character builder and character sheet for the **Intuitive Games**
system, integrated with the platform we already have. It must:
1. Build characters **as-is from the vanilla system** (all its races, classes, subclasses, backgrounds,
   stances, feats, powers/spells, weapons, skills, conditions) **or** use the **AI to customize/spice up** —
   and when the AI invents anything custom it must **match Intuitive Games' own mechanics/rules/feature
   style**.
2. Flag **everything** as either **VANILLA** (genuinely from the system) or **CUSTOM** (homebrew) — spells,
   actions, ability checks, ability scores, weapons, races, feats, powers, literally any element. DMs and
   players can clearly see which is which.
3. Support a **DM approval workflow**: a player finishes a character and **submits it to the DM**; the DM
   reviews (custom content is clearly flagged), then **approves or rejects**. On rejection the DM can add
   **notes explaining why**, and the player gets a **notification** showing the denial + reasons.
4. Let DMs set a **campaign custom policy**: either the campaign allows custom content, or it's
   **vanilla-only** — in which case a character that contains any custom content **cannot even be submitted**
   to join, and the builder says why.
5. Always let a DM **grant** a player special custom feats/abilities/items/spells with DM-defined mechanics
   (at the DM's discretion); anything so granted is flagged **CUSTOM — granted by the DM** (and is allowed
   even in vanilla-only campaigns).

Reference material the build is grounded in: the uploaded **Character Sheet Template** (9 tabs — Character
Introduction, Basic Information, Combat, Skills, Reference Sheet, Equipment, Companion Creature, Summary,
Data Sheet) and the rules at **intuitivegames.net**. All system content is stored as **mechanical facts**
(names/numbers/effects, our own concise summaries), matching how the 5e/PF2/Intuitive-Games catalog entries
are already stored.

## What already exists (build on it, don't duplicate)

- `lib/dnd/system-rules.ts` — the `intuitive-games` catalog entry: core mechanics (levels 1–10, degrees of
  success, 3-action economy, level-as-proficiency, Fort/Reflex/Will), plus content lists (ancestries +
  ancestry notes, classes + full class-name list, 36 skills, 18 conditions, sample feats). This is the seed
  of the vanilla library.
- `lib/dnd/grounding.ts` / `systemGroundingBlock` — always injects the correct system's rules into AI builds;
  `lib/dnd/system-validate.ts` flags cross-system content. Both are system-scoped.
- The custom-sheet + interactive-widget engine (`lib/dnd/custom-sheet.ts`, `_sheet/components/*`), the
  AI edit chat + `/ai-edit` route, the cross-system switcher, and the campaign/character DB model
  (`dnd_characters`, `dnd_campaigns`, `getCharacterAccess`, service-role + app-code auth).

## Architecture (deterministic-first, like the rules work)

- **Vanilla content library** (`lib/dnd/systems/intuitive-games/content.ts`): the authoritative registry of
  what "from the system" means — stances (10 + A/B effects), feats (general + combat), powers/spells (with
  effects), defensive powers, weapon-type taxonomy, movement types, subclasses, backgrounds, languages/tools,
  age categories — on top of the ancestries/classes/skills/conditions already in the catalog. Lookup helpers
  answer "is this a real Intuitive Games X?".
- **Provenance model**: every character element carries `source: 'vanilla' | 'custom' | 'dm-granted'` (plus
  `grantedBy` for dm-granted). A pure `classifyElement(kind, name)` returns `vanilla` when the name matches
  the library, else `custom`; `summarizeCustomContent(character)` produces the full flagged inventory the
  builder/DM see. This is the heart of the custom-vs-vanilla guarantee — deterministic, no services needed.
- **Approval + policy** on the existing DB model: character `submission_status` / `dm_review_notes` /
  `custom_content` inventory; campaign `allow_custom`. Vanilla-only campaigns block submission of a character
  with any non-DM-granted custom element (the builder surfaces exactly which items block it). DM-granted
  content is always permitted.

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Vanilla content library.** `lib/dnd/systems/intuitive-games/content.ts` with the full vanilla
  registry drawn from the template + site (stances + effects, general/combat feats, powers/spells + effects,
  defensive powers, weapon-type taxonomy, movement types, subclasses, backgrounds, age categories,
  languages), plus normalized lookup helpers (`isVanilla(kind, name)`, `vanillaNames(kind)`). Fold the new
  lists into the `intuitive-games` catalog entry/grounding so an AI build sees the real options. Unit tests
  assert the library is well-formed and covers the template's content.
- **Slice 2 — Provenance model + classifier.** `lib/dnd/provenance.ts` — `Provenance` type, a
  `classifyElement(system, kind, name)` (vanilla if in the library for that system, else custom),
  `tagElement()`, and `summarizeCustomContent(character, system)` returning every element grouped by
  source. Pure + fully unit-tested (a known stance → vanilla; an invented spell → custom; a dm-granted item
  stays dm-granted).
- **Slice 3 — DB schema + types.** Seed migration adding to `dnd_characters`: `submission_status`
  (draft/submitted/approved/rejected, default draft), `dm_review_notes` text, `custom_content` jsonb (the
  flagged inventory), `dm_granted` jsonb (DM-granted items); to `dnd_campaigns`: `allow_custom` boolean
  (default true). Extend `DndCharacterRow`. Idempotent.
- **Slice 4 — Submission + review API + notifications.** `POST /api/dnd/characters/[id]/submit` (recomputes
  the custom inventory, blocks when the campaign is vanilla-only and non-DM-granted custom exists — returning
  exactly what blocks it; else sets `submitted`), `POST /api/dnd/characters/[id]/review` (DM approve/reject +
  notes → sets status + notifies the player). Player rejection notification with the DM's notes. Owner/DM
  scoped via the existing chokepoint. Tests on the pure policy (submittability given custom content + policy).
- **Slice 5 — Campaign policy UI + DM review + player status.** DM toggle for `allow_custom` on the campaign;
  a DM review panel that lists the character's flagged custom/dm-granted content and approve/reject-with-notes
  controls; player-side submit button, a status badge (draft/submitted/approved/rejected), and the rejection
  notice showing the DM's notes.
- **Slice 6 — DM-granted custom content.** A DM route + UI to grant a defined custom element (feat / ability /
  item / spell / weapon) with DM-authored mechanics to a specific character, stored flagged `dm-granted` +
  `grantedBy`; always allowed even in vanilla-only campaigns and shown as "granted by the DM".
- **Slice 7 — Builder + sheet integration with provenance badges + AI.** An Intuitive Games sheet/builder
  rendering the template's structure (abilities, skills w/ ranks, stances, powers, feats, weapons, companion),
  with a **VANILLA / CUSTOM / DM-GRANTED badge on every element** and a "Custom content" summary. Build
  as-is from the vanilla library, or AI-customize (grounded to Intuitive Games so custom content matches its
  mechanics and is auto-flagged custom).
- **Slice 8 — QA + docs.** End-to-end pass (build vanilla → all-vanilla, AI-custom → flagged, vanilla-only
  campaign blocks a custom submit, DM grant allowed, approve/reject + notes + notification), full dnd vitest
  suite green, tsc + lint clean, then move this doc to `completed/`.

## Considerations
- **Deterministic guarantee:** classification + policy work with zero external services (pure functions over
  the vanilla library) — the AI is additive, never required for correctness.
- **No cross-system leakage:** the vanilla library and classifier are keyed to `intuitive-games`; the same
  scoping the rules catalog already uses.
- **Facts, not prose:** store mechanical summaries; attribute to the template / intuitivegames.net.
- **Reuse:** build on the existing custom-sheet engine, `/ai-edit` grounding, notifications, and the
  character/campaign DB model + auth chokepoint — don't fork them.
- **Backward compatible:** new columns default so existing characters/campaigns keep working (status=draft,
  allow_custom=true).

### Status: IN PROGRESS (Slice 0 shipped; 1–8 pending)
