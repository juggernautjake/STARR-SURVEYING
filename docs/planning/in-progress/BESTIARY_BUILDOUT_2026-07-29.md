# Bestiary buildout — 2026-07-29

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
A list view with the G7 filters and a detail view with the full stat block. **Built before the import**, and
deliberately: an import with nowhere to look at the results is how a table ends up with rows nobody has ever
seen — and an empty bestiary page immediately shows whether filters, taxonomy and layout are right, using the
handful of rows a fixture can provide.

### B1-2 · The interactive stat block `CreatureStatblock`
Every number that can be rolled is a control (G4): attacks roll to-hit and damage through `bestiary/rolls.ts`
into the shared roll feed; saves and skills roll; HP is editable when the creature is in play. Per-system
presentation — a PF2 creature shows its own vocabulary, not a 5e stat block wearing PF2 names.

### B1-3 · The 5e SRD import
`srdCreatureToRow` exists and is tested; this is the writer loop plus a fetch of the open JSON, a
`scripts/import-bestiary.mjs` run, and a seed. Reports imported / skipped / unparseable with reasons (G6).
**Target: 330+ creatures for 5e-2014.**

### B1-4 · The 2024 SRD import
Same pipeline, `slugPrefix: 'srd52'`, so both editions coexist without collision. **Target: 300+.**

### B1-5 · The PF2 import
The community ORC data set. Richer stat blocks (spell lists, abilities with traits), so the transform needs its
own reader — but the same row shape. **Target: 400+, chosen across every CR band rather than the first 400
alphabetically.**

---

## Phase B2 — art and auras

### B2-1 · The aura system `lib/dnd/bestiary/aura.ts`
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
CSS/SVG only, no images: layered gradients, masked particle fields, `@keyframes`. Reduced-motion drops to a
static tint. Must be cheap enough for 60 of them in a list view — so list view gets the tint and the detail
view gets the full animation.

### B2-3 · Public-domain art pipeline
`scripts/fetch-creature-art.mjs`: for each creature, look for a PD/CC image, store it with its attribution in
the existing media plumbing, and record `image_url` + `image_attribution`. Never a hotlink — files are saved
locally (G3). Reports coverage honestly (G6).

### B2-4 · Procedural sigil fallback
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
