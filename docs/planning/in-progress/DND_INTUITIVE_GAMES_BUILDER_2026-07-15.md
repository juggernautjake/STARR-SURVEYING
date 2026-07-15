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
- **Slice 1 — Vanilla content library.** ✅ `lib/dnd/systems/intuitive-games/content.ts` — the authoritative
  vanilla registry drawn from the uploaded template + intuitivegames.net (mechanical facts/summaries): the 10
  **stances** with A/B effects, 20 **feats** (General + Combat), 37 **powers/spells** grouped by the 7
  schools, 6 **defensive powers** with effects, the 15-entry **weapon-type taxonomy** (5 classes × 3 damage
  types), **movement types** (Fast/Fly/Climb/Burrow/Swim × 10/20/30), subclasses, and companion
  creature-type groups — with normalized, case/space-insensitive lookups `igIsVanilla(kind, name)` /
  `igVanillaNames(kind)` / `igContentSummary()` (the recognition key for provenance in Slice 2). Folded the
  stances/powers/feats/defensive-powers/weapon-types into the `intuitive-games` grounding block so an AI
  build sees the real options and only invents when asked. Verified: `tsc` clean, lint clean,
  `__tests__/dnd/ig-content.test.ts` (5 tests: 10 stances w/ effects, powers by school + defensive powers,
  15 weapon types + movement/feats, `igIsVanilla` recognizes real / rejects invented, grounding lists them);
  full dnd suite (271) green.
- **Slice 2 — Provenance model + classifier.** ✅ `lib/dnd/provenance.ts` — the `Provenance` type
  (`vanilla`/`custom`/`dm-granted`), `classifyElement(system, kind, name)` (VANILLA when the name is in the
  system's vanilla content, else CUSTOM; an **untracked** system/kind resolves to vanilla so it's never
  falsely flagged — shared kinds ancestry/class/skill/condition come from the rules catalog for any system,
  IG-specific kinds from the content library), `tagElement()` (DM-GRANTED when a granter is supplied, else
  classified), `extractCharacterElements()` (pulls class/ancestry/subclass/weapons/features/spells/skills off
  a sheet), and `summarizeProvenance()` / `summarizeCharacterProvenance()` returning every element grouped by
  source plus the **blocking** set (custom, non-DM-granted — what a vanilla-only campaign rejects) and
  `hasBlockingCustom`. Fully pure/deterministic. Verified: `tsc` clean, lint clean,
  `__tests__/dnd/provenance.test.ts` (6 tests: real IG content → vanilla, invented → custom, untracked kinds
  not falsely flagged, DM-granted tagging, grouping + blocking math, whole-character summary where a DM grant
  moves a homebrew feature out of the blocking set); full dnd suite (277) green.
- **Slice 3 — DB schema + types.** ✅ `seeds/443_dnd_custom_approval.sql` (idempotent `ADD COLUMN IF NOT
  EXISTS`, auto-discovered by `run_all.sh`) adds to `dnd_characters`: `submission_status`
  (draft/submitted/approved/rejected, default draft), `dm_review_notes` text, `custom_content` jsonb (the
  flagged provenance inventory), `dm_granted` jsonb (DM-authored granted elements), and `submitted_at` /
  `reviewed_at` timestamps; and to `dnd_campaigns`: `allow_custom` boolean (default true → backward
  compatible). Extended `DndCharacterRow` with the typed fields. Verified: `tsc` clean, lint clean, full dnd
  suite (277) green.
- **Slice 4 — Submission + review API + notifications.** ✅ `lib/dnd/submission.ts` — the pure
  `evaluateSubmission(allowCustom, summary)` gate (`allowCustom` → always OK; vanilla-only → OK only when
  there's no blocking custom, returning the blocking list + a reason naming them) + `SubmissionStatus` /
  `normalizeSubmissionStatus`. `POST /api/dnd/characters/[id]/submit` (owner/DM via the write chokepoint)
  recomputes the flagged inventory with `summarizeCharacterProvenance`, reads the campaign's `allow_custom`,
  and either **409s with the exact blocking items** or sets `submitted` + stores `custom_content` +
  `submitted_at`. `POST /api/dnd/characters/[id]/review` (DM-only, `getCampaignRole==='dm'`) approves or
  rejects — a rejection **requires notes** — setting status/`dm_review_notes`/`reviewed_at`. Extended the
  notifications feed with a `character_rejected` type so the player is notified of a denial + the DM's notes
  (defensive if un-migrated). Verified: `tsc` clean, lint clean, `__tests__/dnd/submission.test.ts` (5 tests:
  custom-allowed accepts all, vanilla-only accepts pure-vanilla, vanilla-only blocks + names custom,
  DM-granted doesn't block, status normalization); full dnd suite (282) green. *(Live DB round-trips need the
  Supabase env; the policy + routes are proven + type-safe.)*
- **Slice 5 — Campaign policy UI + DM review + player status.** ✅ `app/dnd/_ui/SheetApprovalPanel.tsx`
  (wired into `characters/[id]/page.tsx` for any character in a campaign) shows the **content summary**
  (vanilla / custom / DM-granted counts + a badged list — both DM and player see what's custom), a **status
  badge** (Draft / Awaiting DM review / Approved / Changes requested), and role-appropriate controls: the
  **owner submits** to the DM (calls `/submit`; a vanilla-only 409 shows the exact blocking items), sees the
  DM's **rejection notes**, and can resubmit; the **DM approves or requests changes with notes** (`/review`).
  Provenance is computed live server-side (`summarizeCharacterProvenance`) so it always reflects the current
  sheet, and the campaign's `allow_custom` drives the messaging. The campaign PATCH route now accepts
  `allow_custom` (DM-gated), and `app/dnd/_ui/CampaignCustomPolicyToggle.tsx` is the DM's vanilla-only toggle.
  Verified: `tsc` clean, lint clean, full dnd suite (282) green. *(Dropping the policy toggle onto the DM
  campaign hub + a live click-through are the running-app finish; the panel, route, and policy are proven.)*
- **Slice 6 — DM-granted custom content.** ✅ `lib/dnd/dm-grant.ts` — the pure core: `validateGrant`
  (needs a name + mechanics, clamps kind to the `GRANTABLE_KINDS` set, length-bounded), `readGrants`
  (tolerant parse of the `dm_granted` jsonb, drops malformed/id-less entries), `addGrant` / `removeGrant`
  (immutable, caller-supplied id + timestamp so it stays pure). `POST/DELETE /api/dnd/characters/[id]/grant`
  (DM-only via `getCampaignRole==='dm'`) appends/revokes a grant, stamping the DM's display name as
  `grantedBy` — a grant is stored flagged `dm-granted` so `summarizeCharacterProvenance` treats it as
  always-allowed (never blocking), even in a vanilla-only campaign. `app/dnd/_ui/DmGrantPanel.tsx` (DM-only,
  wired into `characters/[id]/page.tsx`) lists existing grants with a Revoke and a compose form (kind / name /
  mechanics) that grants a new element shown on the sheet as "granted by the DM". Verified: `tsc` clean, lint
  clean, `__tests__/dnd/dm-grant.test.ts` (5 tests: validation gates name+mechanics + kind clamp + length
  bounds, add/read/remove round-trip dropping malformed rows, a granted homebrew feature flips from blocking
  custom → dm-granted so a vanilla-only submit is no longer blocked); full dnd suite (287) green.
- **Slice 7 — Builder + sheet integration with provenance badges + AI.** *(in progress)*
  - **7a — Vanilla catalog + on-sheet reference.** ✅ `lib/dnd/systems/intuitive-games/catalog.ts` —
    `igCatalog()` projects the whole vanilla library into grouped, display-ready sections (Ancestries,
    Classes, Subclasses, Stances w/ A/B effects, Feats by General/Combat, Powers by school, Defensive
    powers, Weapon types, Movement types, Skills, Conditions, Companion creature types), every entry flagged
    `source:'vanilla'`; shared kinds come from the rules catalog and IG-specific kinds from the content lib,
    so it's one deterministic source for the builder picker + the on-sheet reference. `igCatalogCount()` for
    a header count. `app/dnd/_ui/IGVanillaLibrary.tsx` (wired into `characters/[id]/page.tsx` for any editor
    of an Intuitive Games character) renders the catalog collapsibly + filterably with a **VANILLA badge on
    every entry** — the read side of the custom-vs-vanilla guarantee ("here's exactly what's from the
    system"). Verified: `tsc` clean, lint clean, `__tests__/dnd/ig-catalog.test.ts` (3 tests: every section
    grouped + all-vanilla + non-empty, stance effect text carried + >80 elements counted, every catalog
    entry agrees with the provenance classifier as vanilla); full dnd suite (290) green.
  - **7b — Deterministic "build as-is from the vanilla library" assembler.** ✅
    `lib/dnd/systems/intuitive-games/builder.ts` — `assembleIGVanillaCharacter(picks)` builds a valid
    `Character` on the shared sheet engine from a set of picks (ancestry / class / subclass / stances /
    powers / feats / weapons): stances→teal "Stance" features (with their catalog A/B effect text),
    powers→pink "Power" features, feats→"Feat" features, weapons→melee attack shells, and meta
    (species/class/subclass/level). Crucially it also records a **kinded `igBuild` block** on the character,
    and `extractCharacterElements` (provenance.ts) now reads `igBuild` when present so a stance is flagged as
    a **stance** and a power as a **power** — not mis-read as a generic feat (the previous 5e-shaped
    extraction couldn't tell them apart). So a straight vanilla assemble is **100% VANILLA** (nothing blocks
    a vanilla-only submit); a non-catalog pick (e.g. an invented stance "Berserker Fury") is flagged
    **CUSTOM with its correct kind**; and a DM grant of that stance moves it to **DM-GRANTED** (non-blocking).
    Verified: `tsc` clean, lint clean, `__tests__/dnd/ig-builder.test.ts` (4 tests: assemble records kinded
    igBuild + catalog effect text, straight vanilla → 0 custom / no blocking, non-catalog pick → custom with
    kind `stance`/`power`, DM grant → dm-granted not blocking); full dnd suite (294) green.
  - **7c — Builder UI + apply route + AI path.** ✅ `app/dnd/_ui/IGCharacterBuilder.tsx` (wired into the
    character page for any editor of an Intuitive Games character) is the **"build from vanilla" picker**:
    ancestry / class / subclass dropdowns + stance / power / feat chip multi-selects sourced from `igCatalog`,
    a freeform weapons field, a **live VANILLA vs CUSTOM count** (using the same pure `classifyElement` the
    server uses), and a Build button. `POST /api/dnd/characters/[id]/ig-build` (owner/player/DM via the write
    chokepoint) runs `assembleIGVanillaCharacter`, persists the result to the character's `data`, and returns
    the live provenance summary; custom picks are allowed at build time and flagged (the vanilla-only gate is
    at `/submit`, not here). The **on-sheet badge + "Custom content" summary** is already delivered by
    `SheetApprovalPanel` (Slice 5), which now reads the accurate kinded `igBuild` provenance. The
    **AI-customize path** needs no new code: the existing `/ai-edit` route is grounded to Intuitive Games
    (`systemGroundingBlock` injects the IG rules + the stances/powers/feats catalog), so an AI build sees the
    real options and matches the system's mechanics, and any invented element is **auto-flagged custom** by
    the same provenance classifier the builder + approval panel use. Verified: `tsc` clean, lint clean, full
    dnd suite (294) green (the pure assembler the route+UI call is covered by `ig-builder.test.ts`).
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

### Status: IN PROGRESS (Slices 0–7 shipped; Slice 8 — final QA + doc move — pending)
