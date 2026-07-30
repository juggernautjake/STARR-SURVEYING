# Bestiary buildout — 2026-07-29

> **This doc is the live bestiary plan; it supersedes Phase 13 of
> `TABLETOP_AUDIT_REMEDIATION_AND_CONTENT_STUDIO_2026-07-28.md`** (reconciled 2026-07-29). P13 plans the
> same feature in 14 slices against this doc's 20; the mapping is recorded there so nothing is lost.
>
> **One item exists only in P13 and must not be dropped: P13-8, AI creature generation** — *"describe it →
> statblock → retry / accept / edit"*. There is no B-slice for it. It belongs after B1-5, once there is
> enough catalogued content for a generated creature to be checked against real ones.
>
> Also note: **P8-1 in that doc ("no monster catalogue exists in any system") went stale on 2026-07-29** and
> should be read as closed.

**Owner ask, verbatim:**

> *"Please also really work on the bestiary so that we create a full and robust list of all kinds of creatures
> from every plane and every kind of alignment. All difficulty levels and everything. I want full stat blocks
> that can be used like a character sheet if a dm should choose to add that creature to their campaign. Please
> make it so that we actually have this built out for each system and that it is actually surfaced so we can look
> at all of the creatures and their stat blocks. We need to be able to create stronger and weaker and just
> different variants too, similar to how we can create character variants. We also need to be able to transpose
> any creature into any other system. Please scrape as many creature stat blocks from online for the built systems
> as you can and add them in full to the bestiary. Make sure we can actually find them. Please also scrape all of
> the images you can find for each creature and save them and use them in the stat block. Put cool effects around
> their pictures, and change the effects up depending on the kind of creature. Little bunnies should have a nice
> pleasant green or something flowing around their picture, and give a woodland vibe, while a zombie might have a
> green stench kind of effect and animation around their images. You would have to create the effects/animations
> around each image on a case by case basis depending on the kind of creature. Each listing of a creature when
> viewed should have the option to create a variant of the creature, or to use the creature in a campaign.
> Variants can be saved and made public or private or be shared just like classes and feats and characters and
> stuff. Please spend a lot of time really cultivating each stat block and make each one look cool and be fully
> complete and match the system it was made for. Each system should have at least 200 unique and well built
> creatures with images and image effects and interactable stat blocks and be able to be edited and added to
> campaigns."*

---

## Audit first — and the finding changes the plan

Ran before writing anything, per the standing lesson that this repo's signature defect is *"authored but not
wired"*:

| What | State |
| --- | --- |
| `dnd_creatures`, `dnd_creature_variants` tables | **Exist in the live database. 0 rows each.** |
| `lib/dnd/homebrew/statblock.ts` | Complete creature model — senses, languages, CR, resistances, immunities, condition immunities, spellcasting, tagged traits/actions/reactions/legendary/lair |
| `lib/dnd/bestiary/import.ts` | `srdCreatureToRow` — shape-tolerant SRD→row transform, licence required as a parameter |
| `lib/dnd/bestiary/eligibility.ts` | Which creatures deserve variants (`scaling-family`, `boss-tier`, `named-tier`) |
| `lib/dnd/bestiary/variants.ts`, `derive.ts`, `taxonomy.ts`, `rolls.ts` | The reasoning layer, incl. click-to-roll from a stat block |
| `seeds/462_dnd_bestiary.sql` | Applied |
| A page that lists creatures | **Does not exist.** `SendCreatureToFight.tsx` is the only creature UI. |

**So almost none of this is a build-from-scratch.** The model, the tables, the import transform, the variant
eligibility rules and the roll parsing are all done and tested. What is missing is exactly the three things the
owner is describing: **content** (0 rows), **surfaces** (no bestiary page, no stat block view), and **art**.

That reframes the whole program: this is a *population and presentation* job on finished machinery, not a
modelling job. Which is good news, and it means the first slice can be the one that makes everything visible.

---

## The content boundary, stated plainly

"Scrape as many creature stat blocks from online as you can" has a clean legitimate answer and a hard limit,
and the limit needs to be designed around rather than discovered late:

**Freely licensed, import in full:**
- **D&D 5e SRD 5.1** — CC-BY-4.0 since 2023. ~330 monsters, published as JSON by several open projects.
- **D&D 5e SRD 5.2 (2024)** — CC-BY-4.0. The 2024-edition monster set, a separate source for `dnd5e-2024`.
- **Pathfinder 2e** — ORC / Paizo's Community Use policy; the community data projects carry **1,000+**
  creatures with full stat blocks.

**Not available, and not worth pretending otherwise:** monsters that are Product Identity rather than SRD —
beholder, mind flayer, displacer beast, and the rest. They are excluded by the importer, with the exclusion
*recorded* so a reader can see the bestiary is complete-to-the-licence rather than merely missing things (G6
below).

**Intuitive Games has no published bestiary.** It is Brendan's indie system; there is nothing to import. Its
200 come from **transposition** — which the owner asked for anyway ("transpose any creature into any other
system") — plus authored originals. This is the one system where the content is generated rather than sourced,
and saying so up front is better than quietly shipping IG with 12 creatures.

**Art is the tighter constraint.** Published monster illustrations are copyrighted and not licensable. What is
available: public-domain natural history illustration (an enormous trove — bears, wolves, serpents, spiders,
raptors) and public-domain mythological engraving (dragons, hydras, demons, giants) via Wikimedia Commons and
the Biodiversity Heritage Library, both with per-image attribution. For everything with no usable source, a
**procedural sigil** — a generated, type-coloured emblem, deterministic from the creature's slug.

Which is why the effects matter more than the pictures, and the owner's instinct is right: **the aura is what
gives a creature its character.** A pleasant green drift around a rabbit and a rolling stench around a zombie
carry the feeling whether the centre is a woodcut, a photograph or a generated sigil.

### Ground rules

- **G1 — The catalogue is immutable; your changes fork.** Already the design (seed 462): editing a catalogued
  creature writes a `dnd_homebrew` piece of kind `creature` with `forked_from` set. So variants inherit
  public/private/share, adoption and the edit history *for free* — which is precisely the owner's "just like
  classes and feats and characters".
- **G2 — Auras are derived from the creature, then overridable.** A per-creature effect for 900 creatures is
  not authorable and would leave most of them plain. Derive the aura from `type` + tags + CR, and allow a
  named override for signature monsters. Every creature gets a fitting effect on day one; the famous ones get
  hand-tuning.
- **G3 — Provenance travels with the content.** `source`, `licence`, `attribution` are NOT NULL already.
  Images carry the same. A creature whose licence we cannot state does not get imported.
- **G4 — A stat block is a sheet, not a card.** The owner wants it *usable* — clickable attacks, rollable
  saves, editable HP. It goes through the existing roll feed and edit machinery, not a private copy.
- **G5 — Transposition never invents rules.** Converting a 5e creature to PF2 maps what maps and *marks* what
  does not, using the existing transpose conventions. A silently plausible PF2 stat block is worse than a
  flagged approximate one.
- **G6 — Nothing silently truncates.** If an import skips 40 Product Identity monsters or 3 unparseable rows,
  the count and the reasons are recorded and visible.
- **G7 — Findable.** "Make sure we can actually find them" is a first-class requirement: search by name, and
  filter by system, type, CR band, alignment, plane, size and environment.

---

## Phase B1 — surface what exists, then fill it

### B1-1 · The bestiary route `/dnd/bestiary` (+ `/dnd/bestiary/[slug]`)

**SHIPPED 2026-07-29.** List + detail, with `lib/dnd/bestiary/query.ts` doing all filtering IN THE DATABASE
(system, category tag, type, CR band, alignment, free text over name and description). Facets are read from the
catalogue so a filter never offers a value that matches nothing. Filters are LINKS rather than a client form, so the
whole page stays a server component and every filtered view is a shareable URL.

Query errors THROW rather than returning zero rows — an empty bestiary and a broken bestiary must not look the same,
which is the `{ data, error }`-ignored defect that made a profile page report "0 pieces" for a missing table.

Browser-verified with seed 464 (three SRD creatures — Goblin, Zombie, Wolf, chosen to exercise two attacks, the
owner's stench example, and the multi-tag path): facets derive correctly, the `undead` tag filter narrows to one,
and the detail page prints the licence attribution the CC-BY terms require.

**Two bugs found by driving it.** (1) The detail page 404'd on every creature: slugs carry a source prefix
(`srd51:wolf`) and the colon does not survive a URL path segment intact, so the arriving param was percent-encoded
and matched nothing — now decoded unconditionally. (2) An empty catalogue still offered five CR-band chips, because
the bands are a fixed list rather than a facet and so missed the guard the derived facets get for free — exactly the
"no dragons" versus "no dragons imported yet" confusion this page is meant to avoid.
A list view with the G7 filters and a detail view with the full stat block. **Built before the import**, and
deliberately: an import with nowhere to look at the results is how a table ends up with rows nobody has ever
seen — and an empty bestiary page immediately shows whether filters, taxonomy and layout are right, using the
handful of rows a fixture can provide.

### B1-2 · The interactive stat block `CreatureStatblock`

**SHIPPED 2026-07-29.** `app/dnd/_ui/bestiary/CreatureStatblock.tsx` renders the printed stat-block form — AC/HP/
Speed above the ability row, then saves/skills/resistances/senses/languages/challenge, then traits and actions in
`STATBLOCK_ENTRY_KINDS` order (read from the model rather than restated). Ability modifiers are DERIVED, never
stored, so the two cannot disagree. Every entry carrying a `toHit` or `damage` gets `StatblockEntryRoll`, which
publishes into the shared roll feed — browser-verified on the Wolf, whose Bite shows both controls.

No field is faked: a creature with no senses line prints none rather than an em-dash, because inventing a dash where
a source printed nothing is the smallest possible version of inventing a rule.
Every number that can be rolled is a control (G4): attacks roll to-hit and damage through `bestiary/rolls.ts`
into the shared roll feed; saves and skills roll; HP is editable when the creature is in play. Per-system
presentation — a PF2 creature shows its own vocabulary, not a 5e stat block wearing PF2 names.

### B1-3 · The 5e SRD import — **SHIPPED 2026-07-29. 334 creatures live.**

`scripts/import-bestiary.mjs` (`npm run import:bestiary`, `-- --dry-run` to report without writing). Source:
the 5e-bits CC-BY-4.0 publication of SRD 5.1, cached to `.cache/`. **334 transformed, 0 refused**, every one
carrying AC, HP, speed, CR and at least one action. Applied to production and **verified idempotent** —
a second run leaves 334, not 668.

Coverage spans every challenge band, which is what makes the plan's "all difficulty levels" a fact rather
than a claim: **113** at CR 0–½, **105** at 1–4, **67** at 5–10, **29** at 11–16, **20** at 17+. 150 are
variant-eligible. Tags derived across all twelve categories (55 boss, 43 dragon, 22 woodland, 20 undead…).

#### Four silent defects, found only by running it over the real file

Every one of these transformed *successfully*. The creature imported, looked plausible, and was missing a
line — which is why the plan insists the page comes before the content, and why a fixture would have caught
none of them. **A fixture author writes the shape they expect; only the real publication carries the shape
the publisher actually chose.**

| Field | What happened | Cause |
| --- | --- | --- |
| `senses` | **dropped on all 334** — no darkvision, no blindsight, no tremorsense anywhere | it is an object, and `asText` on an object returns its `.value`. **The speed bug from B1-1, exactly repeated.** |
| `saves` | **dropped on all 334** | 5e-bits carries `proficiencies: [{ proficiency: { name: "Saving Throw: DEX" }, value: 5 }]` — there is no `strength_save` key in that file at all |
| `skills` | **dropped on all 334** | same array, `"Skill: Stealth"` |
| `speed` | `"30 ft. ft."` on all 334 | the source already writes the unit; the importer appended another |
| `cr` | `"0.25"` | books print `1/4`; "Challenge 0.25" is wrong in the way that makes a reader distrust the page |

All five fixed, with the per-ability and string fallbacks kept intact — binding to one publisher is the
thing this module exists not to do. Guarded by 7 new cases in `bestiary-import.test.ts` (21 total), each
written from the real shape rather than an imagined one.

*Verification method worth reusing:* a throwaway probe ran the transform over all 334 and counted missing
fields per column. That is what turned "it works on the goblin" into "senses are absent on 334 of 334" —
and then a spot-check on creatures that *should* have saves (Adult Red Dragon, Lich) versus ones that
should not (Commoner, Wolf) confirmed the remaining absences were genuine rather than more silent drops.

*Two mechanical notes:* the script must run through vite-node **with `vitest.config.ts`**, since the
transform is TypeScript importing via the `@/` alias that only that config defines; and the transform must
be a **static** import — a lazy `await import()` races vite-node's shutdown and dies with
`ERR_CLOSED_SERVER`.

The import is one transaction: a half-filled bestiary showing 180 creatures would look complete, and nobody
would know the run died.
`srdCreatureToRow` exists and is tested; this is the writer loop plus a fetch of the open JSON, a
`scripts/import-bestiary.mjs` run, and a seed. Reports imported / skipped / unparseable with reasons (G6).
**Target: 330+ creatures for 5e-2014.**

### B1-4 · The 2024 SRD import — **SHIPPED 2026-07-29, and the plan's target was wrong**

`npm run import:bestiary -- --source=2024`. Same transform, same pipeline; the only differences are the
slug prefix (`srd52`) and the system tag, which is all it took because both editions come from the same
publisher in the same shape.

**The plan says "Target: 300+". The publication contains three monsters** — Aboleth, Adult Black Dragon,
Adult Blue Dragon. The upstream 2024 SRD conversion is simply unfinished; this is not a limitation of the
importer and not something to route around.

So three were imported and the number is stated plainly. Inventing the other 297 is precisely what Ground
Rule 3 forbids, and quietly reporting "B1-4 done" against a target of 300 would have been the same lie in
a different register. **Re-running when upstream grows is free** — the slug is stable, so it upserts.

Verified: `dnd_creatures` now holds **337** (334 `dnd5e-2014` + 3 `dnd5e-2024`), and the two editions
coexist correctly — `srd51:aboleth` and `srd52:aboleth` are separate rows, which is exactly what the slug
prefix exists to guarantee.

### B1-5 · The PF2 import — **SHIPPED 2026-07-29. 492 creatures. Bestiary total: 829.**

`npm run import:bestiary:pf2`. Pathfinder Monster Core via the Foundry `pf2e` pack, ORC-licensed.
**492 transformed, 0 refused**, every one with AC, HP, speed, level and at least one strike or action.
Level coverage: 30 at ≤0, 201 at 1–4, 156 at 5–10, 70 at 11–16, 35 at 17+.

**A separate transform** (`lib/dnd/bestiary/import-pf2.ts`, 20 tests), not a flag on the 5e one — the two
sources share no field paths at all. Pointing `srdCreatureToRow` at a Foundry actor yields a creature with
no AC, no HP, no abilities and no actions, and reports it as a *successful* import because every field is
optional. That is the B1-3 lesson applied before it could cost anything.

#### The modelling decision that mattered: abilities are modifiers

PF2's remaster prints only modifiers — there is no score behind `Dex +3` and no formula recovers one.
Writing 3 into `abilities` renders it as a **score** of 3: a crippling weakness where the source states a
strength. Not a rounding error, an inversion.

So `Statblock` gained an optional `abilityMods`, which permits negatives where `abilities` validates 1–99.
That range difference is not cosmetic — **10 imported creatures have a negative Wisdom modifier**, and every
one of them would have silently lost it, reading as "no Wisdom listed".

#### A flaw in my own licence rule, caught by the run

The first version read the **first** item's `publication.license` and required ORC. That refused the
**Halfling Street Watcher** — a genuine Monster Core creature whose six items carry *both* `OGL` and `ORC`,
because one legacy entry was never re-marked in the remaster.

"First item wins" is arbitrary: item order is an implementation detail of the pack file, so which weapon
happened to be listed first decided whether a creature existed. Now `pf2Licences` collects the whole set and
`pf2IsRedistributable` asks whether ORC is present anywhere — a stale marker on one item does not
un-license the creature, while an actor stating *no* licence is still refused, because unstated is unknown.

That one refusal was the run telling me my rule was wrong, which is the entire reason the importer reports
refusals by name instead of counting them (G6).

Other decisions: Foundry prose is HTML salted with `@UUID[…]{Label}` references, so the reader keeps the
readable label and drops the reference — left in, a stat block reads
`@UUID[Compendium.pf2e.actionspf2e.Item.Step]{Steps}` at the table. Creature type is matched against a
closed list rather than taken by position, because a PF2 trait array mixes ancestry and type
(`["goblin", "humanoid"]`) with no marker saying which is which. Fetching is 8-way concurrent with a
per-file cache and a descriptive User-Agent — 492 files from someone else's server.

### B1-5 · Scouting notes (2026-07-29, superseded by the slice above)

Not started, but the plan's premise checked so the next pass starts from facts rather than an assumption.

- **Source located:** the Foundry VTT `pf2e` system repo carries **492 monster files** in
  `packs/pathfinder-monster-core` — the ORC-licensed Monster Core. The plan's estimate of "1,000+" is high
  for that pack alone but the right order of magnitude once the other bestiary packs are counted.
- **It needs its own transform.** Foundry's schema shares nothing with 5e-bits': stats live under
  `system.attributes.ac.value`, abilities are modifiers rather than scores, and actions are separate
  embedded items with their own traits. `srdCreatureToRow` cannot be pointed at it, and pretending
  otherwise is how a 492-creature import ends up silently empty in three fields — the lesson B1-3 already
  paid for.
- **It is 492 individual file fetches**, not one bulk document, so the fetcher needs throttling and a
  cache per file.

That makes B1-5 a real slice of its own rather than a flag on this one.
Same pipeline, `slugPrefix: 'srd52'`, so both editions coexist without collision. **Target: 300+.**

### B1-5 · The PF2 import
The community ORC data set. Richer stat blocks (spell lists, abilities with traits), so the transform needs its
own reader — but the same row shape. **Target: 400+, chosen across every CR band rather than the first 400
alphabetically.**

---

## Phase B2 — art and auras

### B2-1 · The aura system `lib/dnd/bestiary/aura.ts`

**SHIPPED 2026-07-29.** Precedence is name → tag → type, with challenge scaling INTENSITY rather than choosing the
effect (a CR ¼ zombie and a CR 21 lich want the same stench at different volumes; deriving the effect from CR would
make every boss look alike). 24 tests, including the owner's two named examples asserted directly — a rabbit gets a
pleasant green drift, a zombie a heavier rising plume.

**A bug the browser found and no unit test could have.** A wolf is tagged `woodland` AND `companion`, and the
derivation iterated the ROW's tag array letting the last one win — so the wolf rendered warm domestic ochre instead
of woodland green, while the comment directly above that loop already claimed taxonomy order. Now the first match in
`CREATURE_TAGS` order wins (the taxonomy is ordered most- to least-characterful). Guarded by a test verified to fail
with the bug restored.
`auraFor(creature) → AuraSpec`. Derived from type + tags + CR (G2). One entry per creature type, modulated:

| Type | Feel | Motion |
| --- | --- | --- |
| beast (small, peaceful) | soft green, dappled light | slow drifting motes, leaf-fall |
| beast (predator) | amber, low dust | prowling shadow sweep |
| undead | sickly green, particulate | rising stench plumes, flicker |
| fiend | ember red/black | rising heat shimmer, sparks |
| celestial | warm gold/white | radiant bloom, slow halo |
| fey | iridescent violet-teal | firefly glimmer, shifting hue |
| dragon | element-tinted (per damage type) | heat/frost/storm wash + wingbeat pulse |
| construct | steel grey | rotating gear glints, seams |
| ooze | translucent chartreuse | slow bubbling, wobble |
| elemental | per element | roiling flow |
| aberration | wrong-colour magenta | non-euclidean drift, chromatic split |
| plant | mossy green | growth creep, spore drift |
| giant | earthen ochre | heavy ground shake on entry |
| monstrosity | bruised purple | uneasy pulse |
| humanoid | neutral, faction-tinted | subtle vignette only |

CR modulates intensity: a CR ¼ zombie gets a wisp, a CR 21 lich gets a storm. **Boss tier gets a distinct
frame** so a final boss reads as one at a glance.

### B2-2 · The aura renderer `CreatureAura`

**SHIPPED 2026-07-29.** `app/dnd/_ui/bestiary/CreatureAura.tsx` + `aura.module.css`. A SERVER component: CSS and
SVG only, no hooks, because the list view renders sixty of them and sixty client components with sixty animation
loops would make browsing the bestiary the most expensive page in the app. Particulate is a layered
`radial-gradient` field moved by `background-position`, not DOM particles, for the same reason. `still` keeps the
colour and drops the motion in list views; `prefers-reduced-motion` does the same for everyone who asked.
CSS/SVG only, no images: layered gradients, masked particle fields, `@keyframes`. Reduced-motion drops to a
static tint. Must be cheap enough for 60 of them in a list view — so list view gets the tint and the detail
view gets the full animation.

### B2-3 · Public-domain art pipeline — **decision layer SHIPPED 2026-07-29; the fetch run remains**

Owner, 2026-07-29: *"You are welcome to use any artwork that is representative of the creature for their
statblock and thumbnail."* Read as: it need not be the canonical illustration — anything that clearly
depicts the creature is fine. Which is what makes this tractable, because the canonical illustrations are
exactly the ones nobody can license.

| Piece | What |
| --- | --- |
| `seeds/467_dnd_creature_image_provenance.sql` | `image_licence`, `image_attribution`, `image_source_url`, `image_storage_path` + a CHECK. **Applied live.** |
| `lib/dnd/bestiary/art.ts` | Licence allowlist, attribution builder, search-term derivation. **21 tests.** |

**The rule is in the schema, not in anyone's memory.** A CHECK constraint makes `image_url` unstorable
without a licence and a credit, so no future importer can add art "temporarily" and leave the attribution
for later. Verified against the live DB: an unlicensed image is rejected, a licensed one is accepted.

**Why the creature's attribution is not the image's.** `dnd_creatures.attribution` describes the STAT BLOCK
("SRD 5.1, CC-BY-4.0, Wizards of the Coast"). An illustration is a different work by a different author
under a different licence — a wolf photograph might be CC-BY-SA-4.0 by a named photographer; a Doré
engraving is public domain with nobody to credit. Reusing one line for both would state something false,
and accuracy of credit is the entire requirement of CC-BY.

#### The shortcut that is closed, and why it is worth recording

All 334 SRD creatures imported by B1-3 carry an `image` path, and those files serve fine. **They are not
usable.** The SRD contains no artwork — the CC-BY-4.0 release covers rules text. The publishing project
states its **code** is MIT and the **underlying material** is OGL 1.0a; neither statement covers the PNGs,
and the project makes no provenance claim about them at all. A licence that cannot be stated cannot be
used, and `/dnd` is publicly reachable by direct link, so this is publishing rather than personal use.

`isAcceptableLicence` therefore treats **unstated as unusable** and is an **allowlist, not a blocklist** — a
blocklist says yes to everything nobody thought of, and the cost of a false negative here is one creature
falling back to the generated sigil, which already exists and already looks deliberate.

#### A third fixture-versus-reality bug, caught the same way as the last two

The allowlist was written against SPDX-style names (`cc-by-sa-4.0`). A live Commons query returns
**`"Public domain"`, `"CC BY 3.0"`, `"CC BY-SA 4.0"`** — spaces, mixed case, human-facing. **Two of those
three legitimate images would have been refused.** Licence names are now normalised before matching, and
the test carries the verbatim strings that came off the wire rather than the ones a fixture author would
invent. Same lesson as `senses` and `speed` in B1-3, and the same fix: run it against the real source.

#### The fetcher is built, was run, and the results were ROLLED BACK

`scripts/fetch-creature-art.mjs` (`npm run art:creatures`) works exactly as designed: search Commons per
creature, apply the licence rules, download to `dnd-media`, record the provenance. A 40-creature run
returned **40 accepted, 0 failed**, every one properly licensed.

**Then I looked at four of them, and three were wrong.**

| Creature | What the picture actually was |
| --- | --- |
| **Lich** | a **pulsar planetary system** — PSR B1257+12 is nicknamed "Lich" |
| **Magma Worm** | **C. elegans nematodes** under a fluorescence microscope |
| **Ancient Silver Dragon** | a **Chinese calligraphy brush** with dragon decoration |

The licence gate was flawless in every case. **Relevance was the failure, and no metadata field exposes
it** — the files are correctly titled, correctly licensed, and depict the wrong thing.

All 40 images were deleted from storage and their rows cleared. Coverage is back to **0 / 829**, which is
the honest number: `sigilFor` already draws a deterministic emblem and `auraFor` already gives it a fitting
atmosphere, so a creature with no photograph looks *deliberate*. **829 wrong pictures would be far worse
than 829 sigils** — a wrong portrait is a claim, and a sigil is not.

**What this settles:** the search-and-accept pipeline cannot run unattended. It is correct machinery
pointed at a source whose relevance ranking does not understand what a "Lich" is in this context. The
remaining work is a **verification pass**, and it is the expensive half rather than a finishing touch:

- Show each candidate and keep, reject or re-query — 829 creatures at several candidates each.
- Or narrow the query space first: real animals (`Wolf`, `Giant Spider`, `Brown Bear`) resolve reliably to
  natural-history photography, so a taxonomy-driven allowlist could be automated with confidence while
  every fantasy name stays manual.
- Or accept a much smaller, hand-picked set for the creatures that matter most and leave the rest as
  sigils, which is what the aura system was designed to make acceptable.

The machinery, the licence rules and the schema constraint are all in place and tested; what is missing is
judgement, and this is the one place in the bestiary where that cannot be automated with the tools to hand.

#### Option 2 built and run — **105 real animals now have art**

`ANIMAL_SPECIES` in `lib/dnd/bestiary/art.ts`: a curated map from creature name to **scientific name**, and
`npm run art:creatures -- --animals-only` fetches only those. **105 accepted, 0 failed.** Coverage
**105 / 829**.

**Querying by species is what makes this subset safe.** The common name is precisely what went wrong:
`Giant Rat` returned *a giant inflatable protest rat photographed through a car windscreen* — a real,
correctly-licensed Commons file, because that phrase names a famous object. `Rattus norvegicus` cannot match
a novelty balloon. A real animal also **short-circuits** to its species and never falls back to its common
name, since falling through would reintroduce the very failure the table removes.

**Verified by looking, not by trusting.** Six of the 105 were sampled at random:

| | |
| --- | --- |
| Giant Lizard | ✅ a monitor lizard |
| Giant Hyena · Hyena | ✅ spotted hyenas |
| Spider · Giant Spider | ✅ real spiders |
| **Giant Fire Beetle** | ❌ **an MBB Lampyridae stealth aircraft prototype** |

I had mapped it to the genus `Lampyridae` — which is also a German stealth aircraft. **A genus can collide
with a machine.** Fixed to `Lampyris noctiluca`, the row cleared and re-fetched, now a firefly.

So the species table cuts the error rate hard but does not eliminate it: a *binomial* species name is safe,
a bare *genus* is a coin toss. Every remaining genus-only entry in the table (`Papio`, `Chiroptera`,
`Brachyura`, `Scorpiones`, `Araneae`, `Serpentes`, `Varanus`, `Accipiter`, `Nephila`, `Vespa`,
`Lycosidae`, `Gyps`, `Mustela`, `Hippocampus`, `Carcharhinus`, `Naja`, `Chrysopelea`, `Mammuthus`,
`Smilodon`, `Plesiosaurus`, `Triceratops`, `Tyrannosaurus`, `Piranha`) is an unverified risk of the same
kind, and the honest position is that **1 in 6 sampled was wrong before the fix and the true rate across
all 105 is unmeasured**.

**Still open:** view the remaining ~99, and decide the 724 non-animals (hand-pick the signature monsters,
sigils for the rest).
`scripts/fetch-creature-art.mjs`: for each creature, look for a PD/CC image, store it with its attribution in
the existing media plumbing, and record `image_url` + `image_attribution`. Never a hotlink — files are saved
locally (G3). Reports coverage honestly (G6).

### B2-4 · Procedural sigil fallback

**SHIPPED 2026-07-29.** `sigilFor(slug)` derives a stable emblem (rotation, point count, ring) from the slug by
FNV hash, and `CreatureAura` draws it with the creature initial when `image_url` is null. Since published monster
art is largely unlicensable, a missing portrait is the NORMAL case rather than an error — so no creature is ever a
broken image, and the aura makes the emblem read as a design decision.
Deterministic from the slug: a type-coloured emblem with a silhouette motif. So **no creature is ever a broken
image**, and the aura makes even the fallback look intentional.

---

## Phase B3 — variants, forking, sharing

### B3-1 · "Create a variant" from any creature listing
Straight onto the existing variant machinery — the same VERSIONS/lineage/tag model characters use, which is
what the owner is comparing it to. Stronger/weaker presets (CR up/down with proportional HP, damage, attack
and DC scaling via `variants.ts`) plus free-form editing.

### B3-2 · Visibility and sharing
Public / private / shared, identical to classes, feats and characters — free, because a variant is a
`dnd_homebrew` row (G1).

### B3-3 · "Use in a campaign"
From the listing: add to a campaign as an NPC/creature, which is the existing grant path plus `SendCreatureToFight`.

---

## Phase B4 — transposition

### B4-1 · Creature transposition across all four systems
5e ↔ PF2 ↔ IG using the existing per-system model plus the transpose conventions. Maps ability scores, AC/HP,
attacks, saves and DCs; **marks** what has no equivalent rather than inventing it (G5).

### B4-2 · IG's bestiary, by transposition
IG's 200 come from transposing a curated spread across CR bands and types, then hand-finishing. Each is marked
as transposed with its origin, so nothing pretends to be published IG content.

---

## Phase B5 — cultivation

The owner asked for each stat block to be *cultivated*, not just present. A quality pass, in bulk:

- **B5-1** Completeness sweep — every creature has type, alignment, CR, senses, languages, speeds, and at
  least one action. Report and fix gaps rather than shipping blanks.
- **B5-2** Plane and environment tagging, so "creatures from every plane" is a filter and not a claim.
- **B5-3** Alignment coverage check across all nine, per system.
- **B5-4** CR-band coverage check, so every difficulty level is actually populated.
- **B5-5** Per-creature aura overrides for the signature monsters (dragons by colour, liches, vampires,
  beholders' SRD equivalents, and the small pleasant ones the owner named).

---

---

## Shipped

### 2026-07-29 · B1-1 + B1-2 + B2-1/B2-2/B2-4 — the bestiary is reachable

The catalogue now has a surface, a stat block, and an atmosphere. Shipped together because the list page
imported `CreatureAura` before it existed, so none of it compiled in isolation.

| Piece | Where |
| --- | --- |
| Browse page, six filters, honest empty state | `app/dnd/bestiary/page.tsx` |
| Creature detail + stat block | `app/dnd/bestiary/[slug]/page.tsx`, `app/dnd/_ui/bestiary/CreatureStatblock.tsx` |
| Aura derivation (B2-1) + sigil fallback (B2-4) | `lib/dnd/bestiary/aura.ts` |
| Aura renderer (B2-2) | `app/dnd/_ui/bestiary/CreatureAura.tsx`, `aura.module.css` |
| Reads | `lib/dnd/bestiary/query.ts` — `loadBestiary`, `loadCreature`, `allCreatureSlugs` |
| First three creatures | `seeds/464_dnd_bestiary_first_creatures.sql` — Goblin, Zombie, Wolf (SRD 5.1, CC-BY-4.0) |
| Coverage | `__tests__/dnd/bestiary-aura.test.ts` — 21 tests. Full bestiary suite 97 passing. |

**Four real defects found and fixed during verification** — every one of them the "authored but not wired"
shape this plan opens by warning about:

1. **The bestiary did not compile.** `page.tsx` imported `@/app/dnd/_ui/bestiary/CreatureAura`, which did not
   exist, and `query.ts` imported `@/lib/supabaseAdmin` — the module is `@/lib/supabase`. A stale
   `tsconfig.tsbuildinfo` meant `tsc --noEmit` reported clean; only `--incremental false` showed it. **Any
   typecheck claim about this repo needs the cache disabled to be worth anything.**
2. **`sigilFor` produced out-of-range rings for ~half of all slugs.** `(n >> 8)` coerces to int32, so a hash
   at or above 2³¹ shifted negative and `% 24` returned a negative remainder — `ring` came out at 0.41
   against a documented 0.52–0.75 band. Now `>>>` throughout. Caught by the new test, not by eye.
3. **Seed 464 aborted on apply.** `ON CONFLICT (slug)` matches no constraint — the table's unique key is
   `(slug, system)` — and Postgres rejects an inference clause that matches nothing rather than degrading.
   The seed would have failed on a fresh database. Fixed, and verified idempotent by applying it twice
   inside a rolled-back transaction against the live schema.
4. **`dnd_creatures` confirmed at 0 rows in production**, as the audit claimed. Seed 464 is not yet applied
   to live — it is verified-applicable, not applied.

**Known issue, not yet fixed:** `loadCreature(slug)` filters on `slug` alone with `.maybeSingle()`, but the
unique key is `(slug, system)`. Harmless today because slugs carry a source prefix (`srd51:goblin`), but
**B4-2 transposition will break it** the moment one creature exists in two systems. Either the transposed row
needs its own prefix or the lookup needs the system — decide in B4.

## Slice order

**B1-1** bestiary route (empty but correct) → **B1-2** interactive stat block → **B1-3** 5e SRD import →
**B2-1/B2-2** auras → **B2-4** sigil fallback → **B1-4** 2024 import → **B1-5** PF2 import → **B2-3** art
pipeline → **B3-1/B3-2/B3-3** variants + sharing + campaign use → **B4-1/B4-2** transposition + IG's bestiary →
**B5-*** cultivation sweeps.

Each slice: typecheck + lint + tests + browser verification at desktop and 360px, committed on its own.

## Why this stays good for a long time

The bestiary already demonstrates the failure mode it needs to avoid: a complete, well-tested creature model
with **zero rows and no page**, sitting unused for weeks. Everything about the model was right and none of it
was reachable.

So the ordering here is deliberate — **the page comes before the content**, and the content comes before the
polish. A surface with three fixture creatures tells you whether the taxonomy, filters and stat block are right;
900 rows behind no surface tell you nothing. And because auras are derived rather than authored per creature,
the thousandth import gets the same care as the first without anyone having to remember it.
