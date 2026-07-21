# Pathfinder 2e: build the whole system

**Status:** IN PROGRESS · started 2026-07-20
**Owner ask, verbatim:** *"Please work on building the full feat and spell catalogue for PF2. I want
every spell defined fully and every feat and ability and effect and class and weapon and armor and
item in PF2. Please build literally everything."* · *"Please fully build pf2 and use any of the
content you can find for it."* · *"Build a planning doc that has everything planned to be built out
in slices and then start building it and don't stop until everything is built and verified."*

Plus, from the same exchange:
- **IG builder UI** — *"if you have a way to solve the IG builder UI, then please do that."*
- **Browser verification** — *"Not sure what number 3 is… If you have any suggestions for fixing
  it, please tell me."*

Both are tracked here as S0 and S14 so nothing is dropped.

---

## Licensing — why this build is legitimate, and what it may not contain

Earlier this session I declined to pull spell data from **D&D Beyond** and **Roll20**: licensed
platforms whose terms prohibit extraction. PF2 is genuinely different, and it is worth writing down
why so nobody has to re-litigate it later.

- **Paizo publishes PF2's mechanics under the ORC License** — perpetual, irrevocable, and expressly
  designed as a safe harbour for reproducing rules mechanics in derivative works. Pre-remaster
  material is OGL 1.0a. Both permit exactly what this catalog is.
- **Reserved Material is NOT covered** and must never enter the catalog: Paizo trademarks,
  characters, deities, locations, organisations, events, art, maps, and setting lore.
- **Archives of Nethys is off-limits as a source.** Its own licence page states it operates under a
  *commercial* licence from Paizo and that its content is not available under the Community Use or
  Compatibility licences. The underlying mechanics being ORC-licensed does not make scraping AoN
  acceptable. Use ORC/OGL text and general knowledge of the mechanics; verify numbers against
  Paizo's own published material.
- **House style applies** (unchanged from the 5e work): concise paraphrased mechanical facts and
  numbers, attributed via `source`, never verbatim rulebook prose.

**Ground Rule 3 governs everything below: never invent a rule.** For a rules platform, a
plausible-but-wrong number is worse than an absent one — the 5e pass in this same session found 20
incorrect spell fields, including a systematic concentration error on every smite. Omit rather than
guess, and mark the catalog's coverage honestly.

## Honest scope statement — read before judging "complete"

"Literally everything" in PF2 is roughly **1,500+ spells, ~2,500 feats** (class feats for 20+
classes, ancestry feats, skill feats, general feats, archetype feats), 20 classes × 20 levels of
progression, ~15 ancestries with heritages, ~200 weapons, ~30 armours, and several hundred items.

That total cannot be authored accurately in one pass, and pretending otherwise would produce
exactly the hallucinated-data failure Ground Rule 3 exists to prevent. So this doc is built to:

1. Ship the **infrastructure** first — schemas rich enough for real PF2 mechanics, an eligibility
   core that models PF2's actual feat-slot schedule, gates on every write path, and library
   integration. Infrastructure is finishable and is what makes the rest additive.
2. Author content in **verified tranches**, each one green before the next starts.
3. Carry a **machine-checked coverage status** (`PF2_CATALOG_STATUS`, mirroring
   `SPELL_CATALOG_STATUS`) that states what is in and what is not, so a missing entry reads as
   "not yet catalogued" and never as "does not exist".

**Done means every slice below is shipped and the status object honestly reports coverage** — not
that every entry in every Paizo book exists in the repo.

---

## Ground rules (inherited)

1. A system's rules never leak into another system. PF2 is keyed separately throughout.
2. Never invent a rule. Omit rather than guess; `source` every entry.
3. Custom content is the same shape as official content.
4. Vanilla = hard block, custom = allowed + flagged, DM = never blocked + marked (Area MV).
5. `npx tsc --noEmit`, `npx eslint`, whole-repo `npx vitest run`, and `npm run build` green per
   slice. Commit and push per slice.

---

## Slices

### S0 — IG builder UI eligibility (carried over, answers the owner's question) ✅ SHIPPED 2026-07-20
The IG builder offered every power in the game and let the server refuse the save at the end. Now
`Chips` takes a `reasonFor` predicate: ineligible powers render greyed, struck through, disabled,
with the reason in the tooltip — the same "show it and explain it" treatment as the 5e pickers,
rather than hiding rows and making the list look arbitrary. Wired to the real `igPowerEligibility`
so the builder and the server can never disagree.
- Only gates for a **vanilla** build (`variantKind` prop, threaded from the character page,
  defaulting to vanilla), matching the server exactly.
- An **already-selected** chip is never blocked, so a pick made before the class was chosen — or
  one a DM granted — can still be deselected rather than stranded.
- Stances and feats stay ungated here too, for the reasons in `intuitive-games/eligibility.ts`.

### S1 — PF2 content schemas
Widen the model to hold real PF2 mechanics, which the current 8-file subsystem does not:
- `PF2SpellDef`: rank (**not** "level"), traditions, traits, cast actions, components, range, area,
  targets, duration, save, `heightened` (per-rank and per-`+N`), sustained, description.
- `PF2FeatDef`: name, **level**, **track** (ancestry/class/skill/general/archetype), traits,
  prerequisites (structured where possible + prose fallback), class/ancestry scoping, frequency,
  trigger, requirements, effect.
- `PF2ActionDef` (actions/activities/reactions with action cost + traits), `PF2ItemDef`,
  `PF2ConditionDef`, `PF2HeritageDef`.
- `PF2_CATALOG_STATUS` — per-kind counts + `complete: false` until genuinely complete.

### S2 — Feat-slot schedule + eligibility core
`lib/dnd/systems/pathfinder2e/eligibility.ts`. PF2's schedule is strict and entirely unmodelled
today: class feats at even levels, ancestry feats at 1/5/9/13/17, skill feats at even levels,
general feats at 3/7/11/15/19, skill increases at 3/5/7/…, plus attribute boosts at 5/10/15/20.
- `pf2FeatEligibility(feat, ctx)` — level, track, class/ancestry scoping, prerequisites, no retake.
- `pf2SpellEligibility(spell, ctx)` — tradition + rank ceiling via the existing `pf2SpellSlots`.
- `pf2FeatSlots(class, level)` — what a character of this class/level is owed.

### S3 — Classes, all 20, levels 1–20
Full progression per class: key attribute, HP/level, proficiency advancement (attack, defence,
saves, perception, class DC, spell), class feat levels, class features by level, subclass choice
(and its own feature schedule).

### S4 — Ancestries, heritages, backgrounds
~15 ancestries: HP, size, speed, attribute boosts/flaws, traits, vision, languages; heritages;
ancestry feat lists. Backgrounds: boosts, a trained skill, a skill feat.

### S5 — Spells, tranche 1: cantrips + ranks 1–3
Full stat blocks per the S1 schema. Verified per Ground Rule 3.

### S6 — Spells, tranche 2: ranks 4–6
### S7 — Spells, tranche 3: ranks 7–10 + focus spells
Focus spells are per-class and are what make many classes work; they belong with S3's class data.

### S8 — Feats, tranche 1: general + skill feats
The most cross-cutting and the most reusable — every class draws on these.

### S9 — Feats, tranche 2: ancestry feats
### S10 — Feats, tranche 3: class feats, all classes

### S11 — Equipment: weapons, armour, shields, gear, consumables, magic items
Weapons: damage, dice, group, traits, category, hands, range, reload. Armour: AC bonus, dex cap,
check penalty, speed penalty, strength, group, traits. Runes (fundamental + property) matter for
PF2 maths and are their own shape.

### S12 — Conditions, actions, and effects
PF2 conditions are largely **numeric** (Frightened 2, Clumsy 1) — unlike 5e's binary ones, and the
platform's Ground Rule 1 exists precisely because of differences like this. Basic actions,
activities, exploration/downtime activities.

### S13 — Wire it all into the sheet + gates + library
- `PF2_EDIT_OPS` gains `add_feat` / `add_spell` / `add_item` — it currently has **no**
  content-adding op at all, which is why the Area MV audit found "nothing to gate".
- `pf2-rules-gate.ts` on every write path (ai-edit, pf2-edit, pf2-build), matching 5e/IG exactly.
- Builder pickers filtered + greyed with reasons (the S0 treatment).
- Library sections, search, tags, tooltips, and AI retrieval for all PF2 kinds.

### S14 — Browser verification (answers the owner's second question)
See "On driving it in a browser" below. Playwright is available in this environment and `/dnd` is
publicly reachable by direct link, so a real click-through IS possible without owner credentials —
this is the slice that stops "unverified in a browser" from being a permanent caveat.

---

## On driving it in a browser (the "#3" the owner asked about)

**What it means:** everything shipped is verified by unit tests, typecheck, lint and a production
build — but nobody has loaded the app and clicked it. A test asserting `disabled={blocked}` does
not prove the button renders greyed, that the tooltip is legible, or that the component mounts at
all. Different failure class; my tests cannot see it.

**Why it kept getting deferred:** most of this app is behind an authenticated session, and the
existing UX harness resolves as an `employee` role, so role-gated and data-backed pages can't be
verified through it (that limitation is already recorded in memory).

**Why it is fixable now, specifically for /dnd:** `/dnd` is deliberately PUBLIC by direct link —
login is retained behind `DND_REQUIRE_LOGIN`, which is off. So the character/library/builder pages
can be driven locally with Playwright against `npm run dev` with no credentials at all. Concretely:
1. `npm run dev`, navigate to a seeded demo character (the repo seeds `Sarah`/`mojo`).
2. Screenshot the spell picker, the feat picker, the IG builder chips, and a sheet carrying ⚑.
3. Assert the visual states the unit tests can only assert structurally.

Owner input is needed for exactly one thing: whether to run this against **local dev** (safe, my
recommendation) or against **production** (real data, and a stray click could mutate a live
character — note the standing rule never to click role-mutating buttons during a live audit).

---

## Done means

- Every slice above shipped, or explicitly deferred with a one-line rationale.
- `PF2_CATALOG_STATUS` honestly reports coverage per kind; nothing claims completeness it lacks.
- A vanilla PF2 character cannot take a feat or spell its class/level/tradition doesn't grant, by
  ANY route; custom can, flagged; DM can, marked as granted — parity with 5e and IG.
- Every entry carries a `source`; no Reserved Material anywhere in the catalog.
- `npx tsc --noEmit`, `npx eslint`, whole-repo `npx vitest run`, `npm run build` green.
