# Bestiary buildout — 2026-07-29

> **This doc is the live bestiary plan; it supersedes Phase 13 of
> `TABLETOP_AUDIT_REMEDIATION_AND_CONTENT_STUDIO_2026-07-28.md`** (reconciled 2026-07-29). P13 plans the
> same feature in 14 slices against this doc's 20; the mapping is recorded there so nothing is lost.
>
> **One item exists only in P13 and must not be dropped: P13-8, AI creature generation** — *"describe it →
> statblock → retry / accept / edit"*. There is no B-slice for it. It belongs after B1-5, once there is
> enough catalogued content for a generated creature to be checked against real ones.
>
> **P13-8 SHIPPED 2026-07-30**, and checking it is what found the gap. The describe → retry → accept → edit
> flow already existed for every homebrew kind (`/api/dnd/homebrew/draft` + `DraftAssistPanel`, shipped as
> P6-15b) — **but not the statblock**. `fieldAcceptsDraft` was an alias for `fieldAcceptsIngest`, which
> excludes structured editors because "they are not text". That is right for INGEST, which reads a document
> you uploaded and have not necessarily read; it is wrong for drafting, which is asked for by name from a
> sentence describing a creature. **A creature draft with no numbers is not a draft** — it filled in the
> name, summary and alignment and left the author to do the actual work, so the middle step of P13-8 was
> simply missing.
>
> Now: the statblock is a drafted field, the prompt spells out its SHAPE (every other field is prose, and a
> model asked for "the statblock" with no schema returns a paragraph describing one), and **Pathfinder gets
> a different instruction** — `abilityMods`, may be negative, *do not invent ability scores* — because
> asking for scores there invents numbers its rules do not have (B1-5).
>
> Nothing is trusted: the model's object goes through `normalizeStatblock`, which DROPS anything
> unparseable or out of range rather than clamping it, so `ac: "very high"` yields a row visibly missing
> its AC instead of a plausible wrong number. The review row shows a readable stat block line and writes
> the structured object — writing the summary would replace the creature's numbers with a sentence.
> `levels` and `list` stay excluded: they carry ordering and per-row identity a flat proposal cannot
> express.
>
> Verified end to end against the live API. "A hawk whose feathers smoulder; it dives and leaves burning
> trails" returned AC 13 · HP 13 (3d8) · fly 60 ft. · full ability scores · Perception +4 · fire resistance
> · and four entries — Keen Sight, Heated Body, Talons, Burning Dive.
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

#### Genus-only entries verified — the risk is smaller than feared, and differently shaped

The 19 genus-only mappings account for 22 creatures with art. Nine of the 105 have now been viewed:

| Verdict | Creatures |
| --- | --- |
| ✅ correct | Giant Lizard (monitor), Giant Hyena + Hyena (spotted hyenas), Spider + Giant Spider, Giant Wasp (hornet) |
| ❌ wrong, fixed | Giant Fire Beetle — genus `Lampyridae` returned a **stealth aircraft**; now `Lampyris noctiluca` |
| ⚠️ fossils | **Saber-Toothed Tiger** (a Smilodon skeleton) and **Tyrannosaurus Rex** (a mounted skull) |

**The fossils are not a defect and are deliberately left alone.** Commons has no photograph of a Smilodon
because none can exist; a museum mount is the truthful best available, and for a T. rex a dramatic skull is
arguably the better bestiary image anyway. But it is a *systematic category* — `Mammuthus`, `Plesiosaurus`,
`Triceratops` and `Smilodon` will all behave this way — so it is recorded rather than discovered again
later by someone who thinks it is a bug.

Revised read: **a bare genus is risky only when the taxon name is also something else** (`Lampyridae` the
aircraft), not because it is a genus. Living animals resolved correctly in every case checked.

**Still open:** ~96 of the 105 unviewed; and the 724 non-animals, where automated search is known-bad and
the choice is hand-picking the signature monsters versus leaving everything on sigils.
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

### B3-1 · Derived variants — **SHIPPED 2026-07-29. 770 live.**

`npm run variants:creatures`. **385 eligible creatures → 385 weak + 385 elite**, and the detail page
already renders them, so they were reachable the moment they existed.

**This was the third "authored but not wired" find of the session, and the purest.** `deriveVariant` had
been built, argued over and covered by tests for weeks; `dnd_creature_variants` had existed since seed 462;
**385 creatures were flagged `variant_eligible` and the table held zero rows.** Complete, tested machinery
with nothing in it — everything correct except that nobody had ever run it.

The arithmetic is per-system and verified against live rows:

| | AC | HP |
| --- | --- | --- |
| **5e** Tarrasque | 25 → 26 / 24 (±1) | 676 → 845 / 507 (±25%) |
| **PF2** Treerazer | 54 → 56 / 52 (±2) | 550 → 580 / 520 (±30 at level 20+) |

That difference is the point: PF2 applies its **published** Weak/Elite adjustment (flat ±2, HP banded by
level), while 5e gets a house formula that **says so in every derivation string** — *"Starr Tabletop house
formula (not an official rule)"* — because 5e has no published equivalent and a silent invention on a stat
block read mid-combat is the thing the ground rules exist to prevent. 5e's CR is deliberately **not**
recomputed: it derives from a table this module does not implement, and printing a made-up CR would be
worse than printing the parent's.

Eligibility is **recomputed from the stored row** rather than trusted from the flag, so a taxonomy change
since import would show up as drift rather than silently generating against a stale boolean. It reported
zero: 295 scaling-family, 59 boss-tier, 31 named-tier, 0 disagreements. Every one of the 770 carries a
derivation sentence.

A CR ¼ goblin correctly gets **no** variants — the plan's own example of a creature that does not need
them.

### B3-1b · "Create a variant" — **SHIPPED 2026-07-30**, and B3-2 came with it

`POST /api/dnd/bestiary/[id]/fork` + `ForkCreature`. The last disabled stub on the creature page is gone:
**✎ Make my own version**, plus a button per derived tier so a DM can start from the elite they were
reading rather than the base.

**The catalogue stays immutable; your changes fork (G1).** This writes a normal `dnd_homebrew` piece of
kind `creature` with `forked_from` set — which is why **B3-2 (visibility and sharing) needed no work at
all**. A forked creature is private/public, shareable, adoptable and history-tracked by every mechanism the
Studio already has; re-implementing any of it here would have been building a second answer to a solved
question.

It also keeps the catalogue re-importable. `npm run import:bestiary` upserts 829 rows on every run — if
editing wrote back to `dnd_creatures`, the next import would silently clobber someone's work.

Decisions worth recording:

- **A dedicated route, not the generic `POST /api/dnd/homebrew`.** That one deliberately drops
  `forked_from` via `pickCreatorWritable`, and it should: a client that can name its own ancestor can claim
  descent from anything. Provenance is a server-side fact, set only by the route that verified the ancestor
  exists.
- **A variant fork starts from the VARIANT's numbers.** Verified live: forking the Elite Ogre carries HP
  74, not the parent's 59. Handing over the base would silently discard the adjustment the reader clicked on.
- **The variant must belong to the creature.** Without the check a caller could graft any variant's
  statblock onto any ancestor, and the provenance line would be a lie.
- **Private and draft, always.** A fork is a starting point, not a publication. `statusForVisibility` is
  bypassed by construction rather than trusted from the client.
- **Attribution travels into the copy.** A fork is a derivative work and the catalogue's licence requires
  the credit; `dnd_homebrew` has no licence columns, so it goes into the description prose.

Verified against the live schema in a rolled-back transaction: ancestor recorded, private+draft defaults,
variant HP carried, licence text present.

### B3-1b · "Create a variant" from a listing (original plan text)
Straight onto the existing variant machinery — the same VERSIONS/lineage/tag model characters use, which is
what the owner is comparing it to. Stronger/weaker presets (CR up/down with proportional HP, damage, attack
and DC scaling via `variants.ts`) plus free-form editing.

### B3-2 · Visibility and sharing
Public / private / shared, identical to classes, feats and characters — free, because a variant is a
`dnd_homebrew` row (G1).

### B3-3 · "Use in a campaign" — **SHIPPED 2026-07-30**

The disabled stub on the creature page is now the real control: **⚔ Add to a fight**, the same
`SendCreatureToFight` the Content Studio uses, pointed at a catalogue row instead of a homebrew one. Name,
art and HP come across from the stat block, so a DM never re-types a monster's HP.

Rather than duplicate the component, it gained a `FightSource` union — `{ homebrewId }`, `{ creatureId }`
or `{ creatureVariantId }` — and the route resolves each in its **own branch**. Deliberately not folded
into one lookup: the two tables answer READABILITY differently (homebrew is yours-or-published; the
catalogue is licensed reference every member can already browse), and conflating them is exactly how a
private Studio piece would leak out of someone else's workspace.

A **variant** resolves through the same door and takes precedence over its parent when both are sent — a DM
who picked "Elite Ogre" means the elite's HP, and quietly using the parent's would be the wrong number this
whole control exists to stop being re-typed.

"Create a variant" stays a disabled affordance with its reason visible: the derived weak/elite pair renders
below it, but authoring your own needs the editor (B3-1b).

### B3-3 · "Use in a campaign" (original plan text)
From the listing: add to a campaign as an NPC/creature, which is the existing grant path plus `SendCreatureToFight`.

---

## Phase B4 — transposition

### B4-1 · Creature transposition — **SHIPPED 2026-07-29**, `lib/dnd/bestiary/transpose.ts`, 20 tests

**G5 is the entire design: "transposition never invents rules."**

It would be easy to turn a CR 2 ogre into a "level 2 PF2 ogre" by copying the numbers across, and it would
be wrong in a way nobody notices until the fight runs. The scales do not correspond: 5e AC spans roughly
10–25 across the whole game while PF2 AC climbs with level into the 50s, so a copied 18 makes a level-15
creature hit-on-a-2. No published conversion exists, and deriving one here would be inventing rules that
read as authoritative on a stat block someone uses mid-combat.

So it converts what has a **defined correspondence** and **marks everything else**:

| Converts exactly | Marked, carried verbatim |
| --- | --- |
| Ability scores ↔ modifiers (5e's own `floor((score−10)/2)`) | AC, HP, saves, DCs, spellcasting |
| Size — both systems use the same words | CR ↔ level: different quantities, not a scale |
| Creature type where the vocabularies overlap | Types with no counterpart (`petitioner`, `dream`, `time`) |
| Prose — traits, actions, senses, languages | Action text referencing mechanics the target lacks |

Score↔modifier is the one genuinely exact mapping, and the reverse direction is **lossy and says so**: +3
could have come from 16 or 17, so a reconstructed score is flagged rather than presented as stated. Scores
never fall below 1 even from a −6 modifier.

Verified on real rows — Ogre → PF2 produced 4 marked items; Goblin Warrior → 5e produced 6, including the
reconstruction note. A test asserts the unmapped list is **non-empty** for a real conversion, because an
empty one would mean either a trivial change or a lie, and asserting it keeps a later refactor from
"simplifying" the warnings away.

Deliberately **not** the AI transpose in `lib/dnd/homebrew/transpose.ts`. That one rewrites a piece into a
system's idiom and asks a human to approve it; this one is arithmetic and honesty, and it should run first —
if a number converts exactly, no model should be asked to imagine it.

**Remaining in B4:** a button on the creature page, and B4-2 (IG's bestiary by transposition).

### B4-1 · Creature transposition across all four systems (original plan text)
5e ↔ PF2 ↔ IG using the existing per-system model plus the transpose conventions. Maps ability scores, AC/HP,
attacks, saves and DCs; **marks** what has no equivalent rather than inventing it (G5).

### B4-2 · IG's bestiary, by transposition — **SHIPPED 2026-07-30. 200 live.**

`npm run generate:ig-bestiary`. `lib/dnd/bestiary/ig-curation.ts` (8 tests) picks WHICH 200, and that is the
whole slice — transposing all 334 SRD creatures is one line and produces a worse bestiary. The SRD is not
evenly distributed: 87 of its 334 are beasts and the apex band is thin, so a straight copy gives IG a
catalogue that is a quarter woodland animals and nearly empty above CR 10. **A DM opening the IG bestiary to
find a boss for a level-15 party would have found frogs.**

So the selection is a **round-robin over the (type × CR band) grid**: pass 1 takes the lowest-CR creature
from every occupied cell, pass 2 takes the second, and so on — breadth before depth, so a budget that runs
out still runs out having covered every type and band once. The run prints the grid before it writes
anything: 15 types × 6 bands, **58 cells the SRD fills and 32 it does not**, which are the source's gaps and
are reported as such (G6).

Deterministic, because the script re-runs: ordering is by `(cr_sort, name)`, both properties of the creature
rather than of the query. Verified idempotent — a second run leaves 200, not 400.

Every row says three times over that it is transposed: the slug (`ig-t:`), `source`, and a description that
leads with the origin and then lists every number the conversion could not honestly carry (4.3 flagged items
each). **They arrive deliberately unfinished** — the fork button (B3-1b) is the hand-finishing path.

5e is the source rather than PF2 despite PF2 being the bigger catalogue: PF2 states abilities as modifiers
while IG uses scores, so every PF2 row would arrive with a reconstructed, flagged-as-lossy ability line on
top of everything else already flagged. 5e and IG share the ability convention.

#### Four defects found by driving it, none of which a test would have caught

1. **`transposeCreature` matched RAW type strings against its map.** The SRD prints `swarm of Tiny beasts`
   and `humanoid (goblinoid)`; both fell through and were reported as having "no counterpart" in systems
   that name them perfectly well. 8 of IG's 200 arrived typed `swarm of Tiny beasts` with a spurious
   warning attached. Now normalised through `taxonomy.ts` first, with the raw string kept as the fallback
   key so an unrecognised word still misses the map rather than being coerced.
2. **Every conversion into IG cited Pathfinder.** The AC, saves and CR warnings were written when PF2 was
   the only possible target, so they said so outright — all 200 IG creatures told their reader that
   "Pathfinder 2e climbs with level to the 50s". A true sentence about a game they are not playing,
   attached to the three numbers they most need to trust. The prose now names the systems actually in play
   and keeps the concrete PF2 detail only when Pathfinder is one of the two.
3. **The "needs a human before you run it" list rendered as one run-on paragraph.** It is authored with
   paragraph breaks and bullets and the page printed it through a single `<p>`. That list is the one part
   of the page a DM must not scroll past, and collapsed into running text it read as a wall nobody
   finishes.
4. **Facets were read from the whole table, ignoring the chosen system.** IG is the first system whose type
   vocabulary is a strict SUBSET, so browsing it offered five categories and a dozen types — `astral`,
   `monitor`, `spirit`, `fungus` — that match nothing at all. Exactly the "no dragons" versus "no dragons
   imported yet" confusion `loadFacets` exists to prevent, arrived at from the other direction. Scoped to
   `system` only, deliberately: type/alignment/tag are co-filters within one catalogue and cross-filtering
   them would make the chips a DM is using vanish as they narrow.

**The known issue from B1-1 is closed by construction.** `loadCreature(slug)` filters on `slug` alone while
the unique key is `(slug, system)`; the transposed rows carry their own `ig-t:` prefix, so no creature
exists under one slug in two systems.

---

## Phase B6 — the corpus, the art, and the editor (owner directive, 2026-07-30)

> **Owner, verbatim:** *"Please find as many monster and beast and creature stat blocks as you can from the
> resources provided. Grab as much commercial free art and images as you can for each creature… Every single
> creature/monster that is put into our database should be fully editable and we should be able to create
> variants and upload artwork for them… Please make sure there is no less than 200-300 creatures/monsters of
> all kinds and types and sizes and difficulties in each system… Make sure that creature's stat blocks are
> really fleshed out and working with the IG stances and stuff."*

### The source triage, done once so it is not re-litigated per slice

The owner supplied ~25 URLs across three messages. They fall into three groups, and the grouping is what
determines what can be built:

| Group | Sources | Verdict |
| --- | --- | --- |
| **Openly licensed — build from these** | Open5e (OGL-1.0a / CC-BY-4.0), D&D Wiki (**GNU FDL 1.3**, confirmed at `D&D_Wiki:Copyrights`), Foundry's `pf2e` packs (ORC / OGL — the same content behind `2e.aonprd.com` and `pf2.d20pfsrd.com`), Wikimedia Commons + BHL for art | **Yes.** ~7,000 creatures reachable in total. |
| **Commentary, not stat blocks** | Reddit threads, EN World threads, RPGBot change-log, Alphastream, CBR, the Roll20 "10 monsters to try" blog post | Nothing to import. They are *about* monsters. Their genuine value is monster-BUILDING guidance, which is B6-6's input, not the catalogue's. |
| **Copyrighted, not licensed at any scale** | `5e.tools` + the `longo.com.br` mirror, `roll20.net/compendium`, `aidedd.org` beyond its SRD subset, `foundryvtt.com/packages/dnd-monster-manual` (the paid official WotC module), the AnyFlip flipbook, the `archive.org` Monster Manual PDF, `pdfcoffee` Pathfinder Bestiary, `archive.org/details/bestiary-second-edition` | **No.** These are the Monster Manual and the Pathfinder Bestiary themselves; two are straight scans of the books. `/dnd` is publicly reachable by direct link, so cataloguing them is republishing. This is G3 ("a creature whose licence we cannot state does not get imported") applied to the largest temptation there is to break it, and the boundary this plan set for itself on day one. |

`monster.fandom.com` is CC-BY-SA but carries encyclopedia prose about copyrighted monsters, not stat blocks —
nothing importable even setting the subject matter aside.

**The licensed corpus is not the small option.** It is roughly 7,000 creatures against the Monster Manual's
~500, and it is the reason the owner's "200–300 per system" is comfortably clearable without touching
anything that cannot be credited.

### B6-1 · The rest of Pathfinder — **target: PF2 from 492 to 1,500+**

`packs/pf2e` carries 60+ bestiary packs beyond Monster Core, all ORC or OGL. Counted:
`pathfinder-monster-core-2` 446, `pathfinder-bestiary` 166, `-2` 160, `-3` 165, `book-of-the-dead` 106,
`rage-of-elements` 81, `howl-of-the-wild` 76, plus the adventure-path bestiaries.

`import-pf2.ts` already transforms this exact shape and is under test (20 cases), so this is a **pack list
plus a recursive enumerator**, not a new reader. Two things to get right:

- **A slug prefix per pack**, as B6-2 does per book — Bestiary 1, 2 and 3 name the same creature and a
  shared prefix would make each import silently overwrite the last.
- **The licence is read per actor**, which `pf2IsRedistributable` already does. Adventure-path packs mix
  ORC and OGL and some carry neither; those are refused by name, not skipped quietly.

Deliberately NOT every pack: the PFS season packs are largely stat-block variants of creatures already in
the core bestiaries, and importing them would put nine Goblin Warriors in the catalogue. Core bestiaries +
the standalone hardcovers; adventure-path packs only where they add creatures the core books do not have.

### B6-2 · D&D Wiki's homebrew — **DEFERRED 2026-07-30. The licence permits it; the site does not.**

**The blocker is not the licence and not the implementation cost.** GNU FDL 1.3 is confirmed on both the
copyright page and the footer of every article — *"Content is available under the GNU Free Documentation
License 1.3 except where otherwise specified"* — and it genuinely permits redistribution with attribution.

**The MediaWiki API is closed to anonymous callers, by the operator, for exactly this reason.** Every
`api.php` call answers:

> *403 — To reduce server load, we had to restrict this action to logged in users only. Please just make an
> account, log in, and then proceed!*

That is a load-protection access control, and the two ways past it are both wrong:

- **Make an account to get through it.** Creating a login specifically to bypass a restriction whose stated
  purpose is to stop bulk automated access, then pulling thousands of pages through it, is the abuse the
  restriction exists to prevent. The GFDL grants rights over the *content*; it grants nothing over
  somebody else's servers.
- **Scrape the HTML instead**, which is not blocked (articles answer 200 and `robots.txt` allows `/`). But
  the listing pages do not carry usable creature links, so this means one request per creature over
  thousands of creatures — **precisely the server load the API restriction exists to avoid**, routed around
  rather than respected. `robots.txt` also carries `Content-Signal: search=yes, use=reference`, which
  permits indexing and excerpting; copying full stat blocks into our own database and republishing them is
  neither.

**And the value is now marginal, which is what makes deferring honest rather than convenient.** B6-2's
target was "5e +1,000". D&D 5e already holds **2,828** creatures — fourteen times the owner's own floor —
sourced from publishers who *intend* redistribution and ship machine-readable data. The gap this would
fill does not exist any more.

**What would unblock it:** the owner deciding they want it and creating an account themselves, which is
their call and not one to make on their behalf by writing a scraper. GFDL also requires naming each page's
authors, so a per-page contributor fetch would be needed regardless — doubling the request count.

### B6-2 · D&D Wiki's homebrew (original plan text)

GNU FDL 1.3, confirmed on the wiki's own copyright page: *"D&D Wiki is based on everyone's ideas, which are
here to be freely taken and used by anyone."* Redistribution is permitted with attribution and the licence
notice — both of which `dnd_creatures` already requires as NOT NULL columns.

This is the one source with **no API**, so it needs an HTML reader over the category listings
(`5e_Creatures`, and the per-type pages `5e_Aberration_Monsters`, `5e_Undead_Monsters`, …) and the
MediaWiki `action=raw` endpoint per creature. Three things this source will do that the others did not:

- **Quality is uneven, because it is homebrew.** The importer must refuse a creature that has no AC, no HP
  or no action rather than cataloguing a stub — and REPORT the refusals by name, which is how B1-5 found
  its own licence rule was wrong.
- **`5e_SRD:Monsters` is excluded**: it is the SRD, already catalogued twice over.
- **Attribution is per page**, not per site — GFDL requires naming the authors, and MediaWiki publishes
  them. A creature whose contributor list we cannot fetch does not get imported.

### B6-3 · Every system clears 200–300, across types, sizes and difficulties

The owner's floor, stated as a measurement rather than a claim. Current standing: 5e-2014 **2,828**,
PF2 **492** (B6-1 takes it past 1,500), IG **200**, **5e-2024 is 3** — the upstream conversion is
unfinished and no import can fix it.

So 5e-2024 is the one system that needs transposition to clear the floor, and it is the easy direction:
2014 → 2024 shares the ability convention, the type vocabulary and the CR scale, so `transposeCreature`
marks almost nothing. IG goes from 200 to 300 by the same curation with a raised limit and a second pass
that draws from the newly-imported non-SRD books, so IG's spread is not purely SRD-shaped.

The slice ends with `npm run audit:bestiary` reporting per-system counts by type, size and CR band — the
floor has to be *checkable*, not asserted in a commit message.

### B6-4 · IG stat blocks that use IG's own mechanics — **SHIPPED 2026-07-30. 259 of 300.**

`lib/dnd/systems/intuitive-games/creature-mechanics.ts` (19 tests), appended by the generator.

**The two halves are very different, and separating them is the whole slice.**

**Conditions are a real translation.** IG publishes 18 conditions and most of 5e's have an exact
counterpart with the same mechanical intent — `restrained`/`Entangled` both mean "cannot move,
disadvantage on physical checks"; `poisoned`/`Sickened` are both −2 to attacks, saves and checks. Those
are renamed. The ones with no counterpart are **named as untranslatable**: turning `petrified` into
"Paralyzed" would lose the part where the creature is stone, and a DM applying the nearest neighbour runs
the encounter wrong — which is worse than being told there is a gap. 2,306 of 2,828 source creatures
mention at least one.

**A stance is NOT a translation, and that is the line.** Nothing in a 5e stat block says which of IG's ten
stances a creature adopts, and no derivation could: a stance is a tactical choice made on a turn, not a
property of the creature. So this does not assign one. It reads the evidence **already in the stat block**
and says which stance that behaviour corresponds to — Pack Tactics is a creature that fights by flanking,
and Swarming is IG's flanking stance — carrying its evidence with it and labelled in the same voice
`deriveVariant` uses: *"Starr Tabletop house reading — not an official rule."*

**19.9% of creatures get a stance, and the other 80% getting none is the designed outcome**, not a
shortfall. 300 invented stances would tell a DM something false about a mechanic they act on every turn.
The spread across seven of the ten stances (Mobile 217, Swarming 125, Shifting 83, Menacing 77, Defensive
30, Precise 23, Supportive 7) is what a rule set that still discriminates looks like; a number near 100%
would mean it had stopped.

#### The false positive, found by measuring against the real catalogue

The Defensive rule originally matched a bare `shield`. Run over all 2,828 creatures it matched **spell
names** — `fire shield`, `shield of faith`, and `shield` itself sitting in a prepared-slot list — so an
**Archmage was read as fighting defensively because of what it had prepared**. Six of eight sampled
matches were wrong; the two that were right were both Parry. Narrowed to `damage reduction|parry`, which
took it from 116 matches to 30, and the survivors are genuine. Guarded by a test carrying the Archmage's
real spell line.

Emitted as ordinary `trait` entries, so they render through the existing stat block with no new component
and survive a fork into the Studio, where a DM can edit or delete them like any other trait.

Browser-verified on the Adult Boreal Dragon: Frightful Presence → Menacing, with the published Basic and
Advanced text quoted rather than paraphrased, and `frightened → Shaken, prone → Prone` beneath it.

### B6-4 · IG mechanics (original plan text)

> *"Make sure that creature's stat blocks are really fleshed out and working with the IG stances and stuff.
> Make that make as much sense as you can for IG."*

Today a transposed IG creature is a 5e stat block wearing an IG label, and B1-2 already committed to the
opposite ("a PF2 creature shows its own vocabulary, not a 5e stat block wearing PF2 names"). IG's own
mechanics — stances, conditions, defensive power — exist in `lib/dnd/systems/intuitive-games/` and are
surfaced on IG character sheets already.

**G5 still governs: this derives what IG's rules define and marks the rest.** A stance is not invented for
a wolf; a creature gets one where its source behaviour maps onto a stance IG actually publishes, and the
derivation says so in the same voice the weak/elite variants do ("Starr Tabletop house reading — not an
official rule"). The honest outcome may be that most creatures get no stance, and that is a better answer
than 200 invented ones.

### B6-5 · Art — the fetch run the plan has owed since B2-3

Coverage is **105 / 3,523**, and B2-3 established exactly why: the licence gate is flawless and *relevance*
is the failure — Commons returned a pulsar for "Lich" and a stealth aircraft for the firefly genus.

The two halves that remain:

- **Widen the safe automated set.** `ANIMAL_SPECIES` proved that querying by BINOMIAL species name is
  reliable and a bare genus is a coin toss. The new corpus adds hundreds more real animals (Tome of Beasts
  and Monstrous Menagerie are full of them), so extending the species table is more valuable now than it
  was at 829.
- **A hand-picked set for the signature fantasy creatures**, which is the option B2-3 named and did not
  take: dragons, hydras, griffins, minotaurs, centaurs, harpies, sphinxes, krakens, basilisks and the rest
  have genuine public-domain depictions (Doré, mythological engraving, natural-history plate) that the
  search cannot find by name but a person can pick in one pass.

Everything else stays on `sigilFor`, which is not a fallback so much as the normal case, and looks
deliberate because the aura carries it.

### B6-6 · Upload your own art — **ART UPLOAD SHIPPED 2026-07-30; the per-system editor remains**

`POST/DELETE /api/dnd/bestiary/[id]/art` + `CreatureArtUpload`, owner-gated.

**This is not a fallback for the automated pipeline — it is the only path that was ever going to work for
the fantasy half.** B6-5 settled that: querying Commons by *species* is reliable (372 accepted, six sampled
and all six correct), and querying it for a fantasy name is not, at any level of tuning. The metadata is
correct every time; **relevance** is the failure and nothing in the API exposes it.

Decisions worth recording:

- **The licence fields ARE the form**, not an advanced disclosure. Seed 467's CHECK constraint rejects an
  image with no credit, so a form that collects one when the uploader remembers would fail *after* the file
  was chosen and read as a broken button. Checked in the route as well, so the refusal is a sentence rather
  than a Postgres violation — and so bytes are never uploaded for a row that cannot store them, which would
  orphan a file in the bucket every time someone forgot.
- **"I drew this myself" is an answer, not an exception.** What is refused is silence. The route does *not*
  run `isAcceptableLicence` over what the uploader says: that allowlist exists to judge a search result
  nobody vouched for, and a person uploading their own work is a different situation with a different
  failure mode. Recording **who** said it is the protection — the attribution gets `— uploaded by <name>`
  appended server-side, because when a picture turns out to be wrongly licensed the useful question is who
  vouched for it.
- **It writes the CATALOGUE row, and that does not violate G1.** G1 is about *rules* — numbers and text,
  which fork so two DMs can disagree. A portrait is not a rule, and forking one would leave 5,000 creatures
  blank while one person's copy had a picture. Two facts make it safe: no importer touches `image_url` (all
  four omit it from their upsert column lists, so art survives every re-import), and it is **owner-gated**,
  because a catalogue picture is what every reader sees and so is not a per-user preference.
- **A fresh UUID per upload**, not a slug-derived key, so replacing a picture cannot serve the old bytes
  from a CDN cache under the same URL — whose symptom is "I uploaded it and nothing changed", diagnosed as
  a broken upload when the upload worked perfectly.
- **The old file is dropped only after the new one is referenced**, so a failure leaves the creature with
  the picture it had rather than none.

#### The defect this slice actually found, which was larger than the feature

**The image credit was rendered nowhere.** Seed 467 added `image_licence` / `image_attribution` /
`image_source_url` and enforced them with a CHECK constraint; the fetcher wrote them for all 477 creatures
with art; `loadCreature` never selected them and no page ever printed them.

CC-BY and CC-BY-SA make attribution a **condition of use**, and `/dnd` is publicly reachable by direct
link, so those images are published. The obligation was met in the database and unmet in the only place it
counts. Now printed as its own `Illustration:` line beneath the stat block's credit — deliberately separate,
because they are different works by different authors under different licences, which is the entire reason
seed 467 added columns rather than reusing the existing ones.

Browser-verified end to end: anonymous sees no control and gets 401 from both verbs; the owner sees it;
missing licence and missing credit are each refused with their own message; a real upload stores, renders
and credits; DELETE clears all five columns and removes the object from storage (verified by listing the
bucket — the public URL still 200s for a while, which is CDN cache, not an orphan).

### B6-6b · The creature editor per system — **SHIPPED 2026-07-30, and it found the biggest defect in the phase**

The slice was meant to be "make the stat block editor speak each system's vocabulary". Opening a
Pathfinder creature to check found something larger.

#### All 1,594 Pathfinder creatures displayed NO ability line at all

`CreatureStatblock` read `s.abilities` and never `s.abilityMods`. Not a wrong number — **no row**.

`abilityMods` was added in B1-5 for precisely this, argued through at length (PF2's remaster prints only
modifiers; writing 3 into `abilities` renders a crippling weakness where the source states a strength — an
inversion, not a rounding error), covered by tests, and populated on every one of the 1,594 rows. It was
never wired into the one component that shows a creature to a reader.

**This is the repo's signature defect, in the module whose plan opens by warning about it**, and it
survived every unit test because the component has none and the model was perfect. Only opening a
Pathfinder creature showed it. Now rendered, with the modifier where a score would sit and **no derived
second line** — there is no score behind a +3 and no formula recovers one, so filling that space would be
inventing a rule. Verified on the Aapoph Granitescale: `STR +5 DEX +4 CON +4 INT −1 WIS +1 CHA +1`,
including the negative INT that B1-5 predicted would be lost.

#### The editor had the mirror of the same bug

It offered six ability-**score** boxes regardless of system. Editing a forked Pathfinder creature therefore
showed six blanks (its numbers live in `abilityMods`, which the grid never read) and typing into one wrote
an **invented score** that then won over the real modifier in the renderer. Now modifier inputs for PF2
(min −10, because `abilities`' 1–99 range drops every negative), score inputs elsewhere, each with the
derived-modifier line only where it is genuinely derived. `Prof. bonus` is hidden outside 5e: Pathfinder
folds proficiency into each statistic and IG has no such number, so the box invited someone to fill in a
stat their system does not have.

#### And 1,448 of 1,594 creatures were printing raw Foundry tokens

`@Localize[PF2E.NPC.Abilities.Glossary.Telepathy]` on the page, at the table. The strip rule handled
`@UUID[…]{Label}` only, so three other shapes leaked. Fixed and re-imported to **zero**:

| Shape | Now reads |
| --- | --- |
| `@UUID[….Item.Step]` — no label | `Step` (the last dot-segment is what the label would have said) |
| `@Localize[PF2E.NPC.…]` | dropped — a key for text we do not hold, and the sentence reads fine without it |
| `@Damage[2d6[piercing]]` | `2d6 piercing` — it NESTS, so a `[^\]]*` body stopped at the inner bracket and my first generic rule produced "Deals piercing] damage", losing the dice |
| `@Check[fortitude\|dc:20]` | `DC 20 Fortitude` — a DC and a save in the order a stat block prints them |

The final fallback splits on `.` rather than matching a character class, because the class kept needing to
be widened and **silently matched nothing when it was not wide enough** — that is what left the last 21,
whose names carry a colon or brackets (`Item.Effect: Nanite Surge (Glow)`).

The owner's *"we should be able to create variants and upload artwork for them"* was two features:

- **Variants: already done** (B3-1b/B3-2). A fork is a `dnd_homebrew` piece, so private/public, sharing,
  adoption and edit history all work.
- **Artwork upload: shipped above.**
- **The editor per system** is what remains: the statblock editor exists and is system-agnostic. This makes it show each
  system's own vocabulary, which is the same requirement as B6-4 seen from the authoring side. The
  monster-building guidance in the owner's commentary links (encounter budget, action economy, save DCs by
  level) belongs here as *guidance in the editor*, not as catalogue content.

### Slice order for B6

**B6-1** PF2 packs → **B6-2** D&D Wiki → **B6-3** per-system floors + audit → **B6-4** IG mechanics →
**B6-5** art → **B6-6** upload + editor.

B6-1 and B6-2 first because they are content on machinery that already exists and is tested, and every
later slice is better with more of it: the art pass wants the animals, the IG pass wants a wider spread to
transpose from, and the per-system audit is meaningless before the corpus stops moving.

---

## Phase B5 — cultivation

> ### B5-1 … B5-4 audit — **SHIPPED 2026-07-29**, `npm run audit:bestiary`
>
> The owner asked for each stat block to be *cultivated*, not merely present, and "every plane, every
> alignment, all difficulty levels" is a **claim**. This turns it into a measurement — or into a list of
> what is missing, which is the more useful outcome. It **reports and never repairs**: a sweep that
> silently backfilled a blank alignment would be inventing content, and one that "fixed" what it found
> would hide that the import produced it.
>
> **B5-1 — completeness: 100% clean across all 829.** Every creature has a name, system, licence, type,
> size, CR/level, AC, HP, speed, senses, at least one action, and abilities. Nothing to fix, which
> retroactively validates the four import bugs caught in B1-3 and B1-5.
>
> **B5-3 — alignment: complete where the system has it.** All 334 5e creatures are aligned (16 distinct
> values, 128 "unaligned" beasts). **All 492 PF2 creatures have none — and that is correct**, because the
> remaster removed alignment from stat blocks. Reported per system for exactly this reason: a global count
> would have read as "492 missing" and sent someone hunting a bug in Paizo's design decision.
>
> **B5-4 — challenge coverage: every band populated** in both real systems (5e 113/105/67/29/20, PF2
> 30/201/156/70/35). The 2024 set has gaps at ≤0, 1–4 and 17+, which is what three creatures looks like.
>
> **B5-2 — environments: 0 of 829.** Neither source publishes environment data, so **"creatures from every
> plane" is not a filter and cannot become one without deriving or authoring it.** G7 lists "plane" among
> the required filters; today it would be an empty control. That is the largest honest gap in the phase.
>
> **Category tags: 320 of 829 (39%) carry none.** *(RESOLVED 2026-07-29 — see below.)* Not a PF2 problem — 41% of PF2 and 36% of 5e. The cause
> is that `TYPE_TAGS` maps only five creature types (undead, dragon, construct, fiend, ooze), so a
> `celestial`, `elemental`, `giant`, `fey`, `plant`, `aberration` or `monstrosity` gets a tag only if its
> NAME happens to match a word rule. Mountain Oni, Aesra and Air Scamp all come back bare.
>
> **Not a bug, but a decision to make:** `CREATURE_TAGS` is the owner's own vocabulary ("bosses, woodland
> creatures, massive creatures, demons…"), deliberately curated rather than exhaustive, and those creatures
> remain findable by `type` and CR, which are separate filters. Extending the list to cover the missing
> types is a product call about what categories to offer, not a defect to patch.
>
> The audit exits non-zero only on **hard** failures (a nameless creature, an unlicensed image), so it can
> become a CI gate without nagging about soft coverage. It currently exits 0.


The owner asked for each stat block to be *cultivated*, not just present. A quality pass, in bulk:

- **B5-1** Completeness sweep — every creature has type, alignment, CR, senses, languages, speeds, and at
  least one action. Report and fix gaps rather than shipping blanks.
- **B5-2** Plane and environment tagging — **PLANE SHIPPED 2026-07-30 (1,371 creatures); ENVIRONMENT
  DEFERRED, because nothing publishes it.**

  The audit called this "the largest honest gap in the phase": 8 of 5,025 carried an environment, so G7's
  required **plane** filter would have been an empty control. Measuring before building split it cleanly in
  two.

  **Plane is published, and is not a derivation at all.** A creature's TYPE states its plane of origin —
  that is what the type *means*. A fiend is defined as a native of the Lower Planes, a celestial of the
  Upper Planes, an elemental of the Elemental Planes, a fey of the Feywild. **1,371 of 5,025**, now a live
  filter (`?plane=lower`), a chip row on the browse page, and a line on the creature page that prints its
  **basis** — "Fiends are defined as natives of the Lower Planes" — because the label alone reads as
  something we decided.

  Derived from `tags` rather than stored: the plane IS the type, so a column would duplicate a fact and let
  the two disagree after a re-import, and deriving keeps the filter in the database per B1-1's rule.

  Refined by the creature's own prose where it names something specific — 223 name the Abyss, 84 an
  Elemental Plane — so a balor reads "The Abyss" where its family reads "The Lower Planes".

  **Undead and constructs deliberately have none.** Both are *made*, usually on the Material Plane; filing
  them under a plane would state something the rules do not. **Aberrations are hedged in the label itself**
  — "The Far Realm (many)" — because the published wording is "many of them from the Far Realm", and
  flattening that would overclaim on 281 creatures.

  **Terrestrial environment stays absent, and that is the finding rather than a shortfall.** Neither source
  publishes it. Prose is not a substitute: 148 descriptions mention "forest" and 48 mention "swamp", but a
  Cloud Giant's history paragraph naming a swamp does not put it in one, and a filter built on that would
  be confidently wrong rather than honestly empty. The audit now restates this every run so nobody
  re-opens it as a bug.
- **B5-3** Alignment coverage check across all nine, per system.
- **B5-4** CR-band coverage check, so every difficulty level is actually populated.
- **B5-5** Per-creature aura overrides — **SHIPPED 2026-07-30. Dragons on a generic aura: 408 → 98.**

  Owner: *"change the effects up depending on the kind of creature."* B2-1's table always said a dragon
  should be *"element-tinted (per damage type)"*. It was implemented as five NAME rules — red, white,
  green, blue, black — which covers the 5e chromatics and nothing else. Measured over the finished
  catalogue: **408 of 518 dragons shared one aura.** Every brass, bronze, copper, gold and silver dragon,
  every gem dragon, and every dragon from the four books that arrived after those rules were written,
  looking identical.

  **The fix is not a longer list.** Extending it fixes today's catalogue and breaks again on the next
  import. A dragon's element is stated in its BREATH WEAPON, so `elementalTint` reads that — covering every
  dragon in every book, including ones nobody has thought of, from a fact about the creature rather than a
  guess from its name. Ten elements mapped; distinct auras across the catalogue went 30 → 35.

  Precedence is now **name → element → tag → type**, which extends the existing "most specific wins"
  ordering rather than replacing it: a hand-tuned signature monster keeps its tuning, so a Vampire that
  deals necrotic stays blood-dark mist and the owner's rabbit and zombie examples are untouchable.

  **The false positive, found by measuring rather than reading:** it first tinted the Archmage and the Mage
  as fire creatures, because `fireball` and `cone of cold` sit in their prepared slots — 27 humanoids came
  out as furnace heat, nearly all spellcasters. *What a creature has prepared is not what it is.* Spell
  lists are now excluded, which is the same shape as the `shield` false positive in B6-4 and the second
  time in two slices that a spell list masqueraded as evidence.

  The 98 dragons still on the generic aura — Pseudodragon, the drakes, Adamantine and Mithral — genuinely
  have no elemental breath, and a generic dragon aura is the right answer for them rather than a guess.

  #### And the Foundry prose was still leaking, on 500+ more rows

  Chasing a wrong-looking aura surfaced text nobody could read at the table. B6-6b cleared the `@Token`
  forms; three more shapes remained, all now zero:

  | Was | Now | Rows |
  | --- | --- | --- |
  | `spits blood in a line\|distance:20` | `in a 20-foot line` | 524 |
  | `deals 6d6[fire\|options:area-damage] damage` | `deals 6d6 fire damage` | 241 |
  | `again for [[/gmr 1d4 #Recharge Spew]]{1d4 rounds}` | `again for 1d4 rounds` | — |

  `@Damage` took three attempts because its real shape is `@Damage[6d6[fire]|options:area-damage]` — it
  nests AND carries options, with the options OUTSIDE the nesting. One attempt required `]]` and never
  matched; the next stopped at the first `]` and printed the options verbatim. Now matched allowing one
  level of nesting and read explicitly.

  The six rows that still contain a pipe are **genuine Markdown tables** in authored creature prose
  (`| d4 | Fate |`), correctly left alone.

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

## B1-6 · The wider 5e corpus — **SHIPPED 2026-07-30. 2,494 creatures. Bestiary total: 3,523.**

`npm run import:open5e`. Open5e's v2 API, seven documents, **2,494 transformed and 0 refused**: Monstrous
Menagerie (586), Tome of Beasts 1 2023 (408), Tome of Beasts 3 (397), Tome of Beasts 2 (383), Black Flag SRD
(360), Creature Codex (356), Tal'Dorei (4). Every one under **OGL-1.0a or CC-BY-4.0**, and the licence is
read from the API's own `licenses` array rather than asserted by the script — a document that states none is
refused by name, because unstated is unknown.

Completeness on arrival: **AC, HP, CR, abilities and senses on 100% of 2,494**; speed missing on 8 (0.3%),
and 7 creatures have nothing to do on their turn — a Frog, a Seahorse, a vine, three NPC templates and a
Púca, all of which are printed that way.

Challenge coverage: **436** at ≤0, **833** at 1–4, **828** at 5–10, **264** at 11–16, **133** at 17+.
1,155 variant-eligible.

**A third transform** (`import-open5e.ts`, 24 tests), not a flag on either existing one. Open5e publishes
`type` as an OBJECT (`{ name: 'Fey', key: 'fey' }`), senses as separate integers with no prose anywhere, and
saves in two parallel objects. Read by `srdCreatureToRow` it would produce creatures typed
`[object Object]` with no senses line — the B1-3 failure, a third time, for a third reason.

#### The defect that would have shipped 380 unusable monsters

**396 of Tome of Beasts 3's 397 creatures arrive from Open5e v2 with `actions: []`.** The v1 endpoint has
them all. Verified per creature against both, not inferred: `tob3_ahu-nixta-mechanon` has an empty v2 action
list and a Slam, a Multiattack and a Utility Arm in v1.

Imported from v2 alone that is 396 stat blocks with a complete defensive line and **nothing to do on their
turn** — each transforming successfully, each looking finished, each useless the moment a DM ran it. It is
invisible in every per-creature check and obvious in one aggregate count, which is why the run now counts
missing actions out loud rather than leaving it to a throwaway probe after the fact.

**And my first fix was wrong in a way the run reported.** It fell back only when v2 had nothing but traits —
but 205 of those creatures have exactly one migrated entry, a Reaction. Those short-circuited as "v2 has
actions" and kept the reaction while losing every attack: **205 monsters that could parry but never strike.**
The merge is now per KIND — v2 wins for any kind it carries (its entries have the structured to-hit and
damage that make an entry rollable), v1 fills only the kinds v2 left empty, nothing is listed twice. 400
actionless → 20.

Two smaller ones caught the same way: `speed_all` looks like a superset and is actually DERIVED, filling in
5e's default half-speed climb and swim, so reading it would have printed two movement modes on 2,494
creatures that have neither; and `saving_throws_all` gives every ability a number, which printed would state
six proficient saves on a creature the book gives three.

#### The bestiary had no pagination, and at 3,523 that became a real failure

`loadBestiary` has always taken `limit`/`offset`; the page never offered a way past the first sixty. At 829
that was a nuisance. At 3,523 it meant **everything past the sixtieth result was unreachable by browsing** —
the page read "60 of 271 creatures" with no control to reach the other 211. G7 is *"make sure we can
actually find them"*, and a first page is not a catalogue.

Links rather than a client control, so the whole page stays a server component and every page of every
filtered view is a shareable URL. Changing a filter resets to page 1 (keeping it would land a reader on
"page 7 of 2", which reads as "no dragons" rather than "you were past the end"), and a reader who does land
past the end is told so rather than being shown the "nothing matches those filters" message that would send
them clearing filters that were working.

---

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

---

## Standard classifications — owner directive, 2026-07-29

> *"Please use the standard classifications for all of the creatures in the bestiary. Not the ones I made
> up."*

**Done. Tag coverage went from 509/829 to 829/829 — zero untagged.**

`CREATURE_TAGS` was the owner's bespoke browsing vocabulary (bosses, woodland, massive, demons, abyssal,
sea, birds, companions, folklore) derived from type + size + CR + name matching. It is now the **published
creature types**: 5e's fourteen, plus `swarm`, plus the nine Pathfinder 2e adds.

**Why this fixes the coverage problem structurally rather than by luck.** The old scheme depended on a
word-list happening to match a creature's name, and its type→tag map covered five of fifteen types — so a
Mountain Oni, an Aesra and an Air Scamp all came back bare. Every creature *already has a type*, because
both source publications state one for every entry, so the standard list is 100% by construction.

Decisions inside the change:

- **One tag, not several.** The old categories overlapped by design — a vampire lord was `undead` *and*
  `boss`. A published bestiary states exactly one type, and returning two would misrepresent the source.
  The return shape stays an array so the column, the filters and every caller are untouched.
- **`animal` → `beast`.** PF2's word for an ordinary creature. Without the alias a filter for "beast"
  returns 5e's wolves and none of Pathfinder's.
- **PF2-only types are kept, not squashed.** `astral`, `dream`, `time`, `monitor`, `petitioner`, `shade`,
  `spirit`, `fungus` have no 5e equivalent; mapping them to "aberration" would invent a classification the
  source does not make.
- **The head word is the classification.** Published types carry subtypes — `humanoid (goblinoid)`,
  `fiend (demon)`. Treating each as its own category would fragment the humanoids into dozens of
  one-creature buckets.
- **`swarm` was added after the re-run.** Ten 5e creatures were the only ones still untagged; their type
  line reads *"Medium swarm of Tiny beasts"*, and `swarm` is a genuine SRD classification. Found by the
  audit, not by guessing.

**One dead branch left in place deliberately.** `variantReason` still honours a caller-supplied `boss` tag,
which nothing now emits. Rule 3 above it already catches every creature it was for — same CR threshold — so
removing it would change no outcome, and `tags` is caller-supplied, so a campaign passing its own marker
still works. Commented as dead rather than silently retained.

All three sources re-imported to re-derive, and the audit confirms **0 untagged**. 132 bestiary tests pass.
