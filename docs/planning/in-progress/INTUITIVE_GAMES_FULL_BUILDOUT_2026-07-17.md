# Intuitive Games — Full System Buildout (library + builder + sheet)

**STATUS: IN-PROGRESS (started 2026-07-17).** Owner directive: make the Intuitive Games (IG) system fully
real across the app — (1) the **library page** must contain and express EVERYTHING on the real website, and
(2) the **character builder + character sheet** must build out all stances, feats, conditions, ancestries,
classes, etc., functional and editable, aligned to the website's actual rules.

> Owner (2026-07-17): "Flesh out all of the feats and conditions and all of the rules and everything that
> you can for the Intuitive Games library page. Go to intuitivegames.net and pull all of your info from the
> website. If something on the website is not defined or hasn't been built fully (the system is still a work
> in progress) then do not make anything up — just explicitly state either that it is a work in progress or
> that there is currently no information about that thing. I want all of the terms fully defined. AI needs to
> be able to understand all of the feats and conditions and stances and everything and how they work. We need
> all of the races fully fleshed out too. All of the information on the website must be fully contained and
> expressed on our library page."
>
> "Then, make sure that in the character builder and character sheets for Intuitive Games, all of the stances
> and feats and conditions and everything is all built out and functional and editable. Please make sure it
> all aligns properly with the actual rules from the website."

## Ground rules (carry over from `DND_RULES_PLATFORM` + the owner's constraints)

1. **Source of truth is intuitivegames.net.** Every rule, term, number, feat, condition, stance, ancestry,
   class, and skill comes from the site. Pull it faithfully.
2. **NEVER invent.** If the site leaves something undefined, WIP, or empty, say so explicitly in the content
   ("*Work in progress on intuitivegames.net — no rules published yet.*" / "*The site does not define this.*")
   rather than fabricating a plausible rule. This is a hard rule the owner stated twice.
3. **Systems never leak across editions** — IG rules never resolve as D&D/PF and vice-versa (Ground Rule 1
   from the platform doc). IG content is scoped to the IG system id.
4. **Every builder/sheet element must render somewhere and be editable** — a stance the builder can pick must
   show on the sheet with its full rules text; a feat granted must appear in Features; a condition must be
   applyable and show its effect. Custom remains the explicit escape hatch.
5. **AI-legible.** The library entries + rules data are what the AI reads to adjudicate; each term must carry
   enough structured/plain text that the AI understands how it works, not just its name.

## The website's real structure (fetched 2026-07-17 — the content inventory to reproduce)

**Characters:** Backgrounds (`/backgrounds`) · Character Building (`/character-building`) · Classes
(`/classes` — 13+ classes in 4 groups: **Summoning** Archon/Beastmaster/Eldritch Binder/Packmaster/Summoner ·
**Nature** Conduit/Druid/Shifter/Witch · **Combat** Fighter/Champion/Freebooter/Marksman/Sohei · **Magic**
Wizard/Arcanist/Magician/Shaman) · Combat Feats (`/feats-combat`) · General Feats (`/feats-general`) ·
Stances (`/stances`) · Traits / Ancestries (`/traits-ancestries`).
**Items:** Armor & Shields (`/armor-shields`, damage-reduction mechanics) · Equipment (`/equipment`) ·
Magical Items (`/magical-items`) · Tools (`/tools`) · Weapons (`/weapons`).
**Rules:** Core Rules (`/core-rules`) · Conditions (`/conditions`) · Skills (`/skills`) · FAQs (`/faqs`).
**Additional:** Companion Creatures (`/companion-creatures`) · Spell List (`/spell-list`) · Game List
(`/game-list`) · Redistribution (`/redistribution`).

*(Each slice below fetches the specific page and transcribes it faithfully — this list is the map, not the
content. Where a page turns out to be sparse/WIP, the slice records that per Ground Rule 2.)*

## Current code state

*(To be filled from the IG codebase-mapping pass in flight — the exact system id/slug, where IG library
entries live [TS module vs `dnd_system_entries` seed], the feats/conditions/species data models, whether any
"stance" concept exists in the engine yet, and how the builder/sheet branch on the IG system. Populated
before Area B starts; Area A can begin as soon as the id + entry shape are known.)*

---

## Area A — Library page: contain & express everything on the site

Reproduce the entire intuitivegames.net rules corpus in the IG library so a reader (and the AI) can find any
term fully defined. One slice per site section; each fetches the page, transcribes faithfully, marks WIP/gaps.

- [ ] **A0 — Content pipeline + system-entry shape.** Confirm how IG library entries are stored/rendered and
      establish the repeatable fetch→entry pipeline (mirroring the SIT/learn `JSON→gen_seed` approach if
      applicable). Decide TS-module vs seed, and how an entry expresses sections + a machine-readable term
      list the AI can consume.
- [ ] **A1 — Core Rules** (`/core-rules`) — the foundational mechanics (action economy, checks, the core
      resolution system).
- [ ] **A2 — Character Building** (`/character-building`) — the build procedure, ability scores, progression.
- [ ] **A3 — Skills** (`/skills`) — the skill list + how skills work.
- [ ] **A4 — Conditions** (`/conditions`) — every status effect, full text + mechanical effect (feeds the
      sheet's condition system in Area B).
- [ ] **A5 — Traits / Ancestries** (`/traits-ancestries`) — every race/ancestry fully fleshed out (the owner
      explicitly wants all races complete): traits, size, speed, senses, sub-options.
- [ ] **A6 — Backgrounds** (`/backgrounds`).
- [ ] **A7 — General Feats** (`/feats-general`) — every feat, full text + prerequisites + effect.
- [ ] **A8 — Combat Feats** (`/feats-combat`) — every feat, full text + prerequisites + effect.
- [ ] **A9 — Stances** (`/stances`) — every stance, full text + how it works (new concept; feeds Area B).
- [ ] **A10 — Classes** (`/classes`) — all 13+ classes across the 4 groups, each with its features/progression.
- [ ] **A11 — Spell List** (`/spell-list`).
- [ ] **A12 — Companion Creatures** (`/companion-creatures`).
- [ ] **A13 — Items: Weapons** (`/weapons`).
- [ ] **A14 — Items: Armor & Shields** (`/armor-shields`) — incl. the damage-reduction mechanic.
- [ ] **A15 — Items: Equipment, Tools, Magical Items** (`/equipment`, `/tools`, `/magical-items`).
- [ ] **A16 — FAQs** (`/faqs`).
- [ ] **A17 — Verification pass.** Cross-check the library against the live site section-by-section: every
      term present, nothing invented, every gap marked WIP. The AI-legibility check: the library search +
      digest can resolve any IG term.

## Area B — Character builder + sheet: functional, editable, rules-aligned

Make IG a first-class buildable system, not a custom fallback. Each mechanic the site defines becomes a real,
editable element on the builder + sheet, scoped to IG and grounded in the Area-A data.

- [ ] **B0 — IG data models.** Structured data (not just prose) for the things the builder/sheet operate on:
      ancestries, classes, feats (combat+general, with prerequisites for rules-legal offering), conditions,
      and **stances** (likely a NEW engine concept — model it: what a stance is, its effect while active,
      entering/leaving). Scoped to the IG system id; reuses the existing feats/conditions/species frameworks
      where they fit, extends where IG needs something new.
- [ ] **B1 — Ancestry/traits in the builder + sheet.** IG ancestries selectable in the builder; the sheet's
      species/traits panel renders IG ancestries fully (Area B of the earlier gaps doc already normalized IG
      into `speciesView` — extend to full trait text from A5).
- [ ] **B2 — Classes in the builder.** IG classes selectable with their features/progression from A10.
- [ ] **B3 — Feats.** IG combat + general feats offered rules-legally at the right slots (per the platform's
      eligibility core `lib/dnd/feats/eligibility.ts`); editable; shown on the sheet sourced correctly.
- [ ] **B4 — Conditions.** IG conditions applyable on the sheet, each with its real effect wired (or clearly
      display-only where the site's effect is narrative), editable.
- [ ] **B5 — Stances (new).** A stance panel on the sheet: pick/enter a stance, see its full rules, its effect
      reflected where applicable, leave it — editable. The builder offers the stances a character qualifies
      for. This is the marquee new IG mechanic.
- [ ] **B6 — Alignment/verification.** Walk an IG character build in the builder and confirm every offered
      option matches the site, numbers add up, and stances/feats/conditions are all editable and render. (Ties
      into the broader final QA walkthrough parked in `pending/DND_FINAL_QA_WALKTHROUGH.md`.)

---

### Sequencing
Area A (library content) first and mostly in parallel-friendly slices — the builder/sheet (Area B) depends on
the structured rules A produces. Within A, do the rules-core + conditions + ancestries + feats + stances early
(B depends on them). Build the smallest meaningful slice, verify (typecheck + lint + test), commit, push,
annotate here; move to `completed/` only when every item ships or is explicitly deferred with a rationale.
Honor Ground Rule 2 relentlessly: a sparse/WIP page is recorded as WIP, never fabricated.
