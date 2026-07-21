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

**Status 2026-07-21: every slice is shipped.** S13b and S15 — the two large remaining ones — closed
on 2026-07-21. What stays open is the **catalog long tail** (authoring passes, not slices) and the
four owner questions at the bottom of this doc. Against the six criteria in
`IG_FULL_PARITY_2026-07-21.md`, PF2 now holds all six, with Catalogued honestly partial and reported
as such by `PF2_CATALOG_STATUS`.

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

### S1 — PF2 content schemas ✅ SHIPPED 2026-07-20
`defs.ts`: spells (rank not level, traditions, mechanical traits, per-rank and per-`+N` heightening,
focus spells), feats (level, track, structured prereqs with a prose fallback, archetype), actions,
conditions, items, runes, plus `PF2CatalogStatus`.
Kept **separate from content.ts** deliberately: widening in place would either break the 25-entry
seed the sheet depends on or force every new field optional, and "optional" is how a rules catalog
quietly fills with holes.

### S2 — Feat-slot schedule + eligibility core ✅ SHIPPED 2026-07-20
`eligibility.ts`, 29 tests. Ancestry 1/5/9/13/17, skill even, general 3/7/11/15/19, class per-class
with a default; feat level floors, class/ancestry scoping, structured prereqs, retake blocking,
archetype Dedication chains, tradition matching, spell-rank ceilings.
Two bugs caught while writing it:
- **`pf2SpellSlots` takes only a LEVEL** and returns the full-caster table, so calling it blind
  hands a Fighter rank-5 slots. The class definition decides first now, and classes with reduced
  casting (Magus, Summoner) return 0 until their tables are modelled — a refused legal spell is
  visible and fixable; a silent over-grant is neither.
- The attribute/tradition types live in `model.ts`, not `content.ts`.
**Fails CLOSED** on a missing class (a PF2 class list is complete, so absence means bad input) —
deliberately the opposite of the IG core. **Never enforces unstructured prose prerequisites.**

### S1 — original plan
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

### S12 — Conditions and actions ✅ SHIPPED 2026-07-20
42 conditions (all of them; 11 valued) and 50 actions with degree-of-success outcomes. Conditions
are now **complete** in `PF2_CATALOG_STATUS` — the only kind that is.
Author's reported gaps kept in `PF2_KNOWN_GAPS`: Repair and Coerce are the least certain entries;
several degree outcomes are qualitative where exact values weren't confirmable. Grapple/Shove/Trip/
Disarm were moved from `basic` to `skill` (Athletics) — they read as core combat actions but are
printed as skill actions, and Disarm is proficiency-gated, which `basic` could not represent.

### S11 — Equipment ✅ SHIPPED 2026-07-20
58 weapons, 13 armors, 4 shields, 33 runes, 35 items. Armor is **complete**; the rest are not.
`PF2ShieldDef` is its own interface rather than a `PF2ItemDef` row, because Shield Block needs
Hardness/HP/BT as numbers, not prose.
**Found a seed bug:** `content.ts` listed Greataxe and Greatsword with a `two-hand d12` trait
despite both already being Hands 2. Two-hand is for ONE-handed weapons wielded in two, so the
Strike resolver would have upgraded dice for weapons that never get the benefit. Fixed.
**Found a shape oddity:** the blowgun deals a flat `1` piercing, not a die — any consumer parsing
`NdM` must tolerate it. The resolver now does.

### S13 — Content-adding ops + gates ✅ SHIPPED 2026-07-20
`PF2_EDIT_OPS` gains `add_feat`/`remove_feat`/`add_spell`/`remove_spell`, and
`pathfinder2e/rules-gate.ts` gates them. 31 tests. **This completes Area MV across all three
systems.**
- `PF2Spellcasting` tracked slot COUNTS but never which spells filled them — a sheet could say
  "3 rank-2 slots" and name no spell. `PF2KnownSpell` fixes that, optional so stored characters
  stay valid without migration.
- Added `blankPF2Character`, which the subsystem lacked entirely (only `buildPF2Character(picks)`
  existed, forcing every caller to invent a full pick-set for a valid sidecar).
- **Judges against the CATALOG, not the edit's claimed level**, and `parsePf2Edit` refuses to read
  `offRules` from the payload — server-set only.
- **Only content-adding ops are gated.** Damage, healing, conditions and the death track are play,
  not construction; refusing them would break the sheet mid-combat.

### S13c — Catalog wiring + honest coverage ✅ SHIPPED 2026-07-20
`data/index.ts` is one door to every tranche; `PF2_CATALOG_STATUS` reports real coverage and
`PF2_KNOWN_GAPS` records every author-reported omission in the repo next to the data. 13 tests
guard the HONESTY property rather than the counts: counts derive from the arrays (a hand-typed
number drifts and starts lying), every incomplete kind must say what's missing, and count
assertions are lower bounds so authoring more never breaks the suite.
The browsable catalog now shows the full tranches instead of the 25-entry seed, and surfaces five
kinds that had no catalog presence at all (feats, conditions, runes, shields, items).

### S13 — original plan
- `PF2_EDIT_OPS` gains `add_feat` / `add_spell` / `add_item` — it currently has **no**
  content-adding op at all, which is why the Area MV audit found "nothing to gate".
- `pf2-rules-gate.ts` on every write path (ai-edit, pf2-edit, pf2-build), matching 5e/IG exactly.
- Builder pickers filtered + greyed with reasons (the S0 treatment).

### S13b — HOOK EVERYTHING UP TO THE SHEET AND THE ROLLER ✅ SHIPPED 2026-07-21
Completed 2026-07-21. `resolve.ts` + 29 tests asserting resolved NUMBERS.

**The bug that justified doing this structurally rather than as a set of edits:** the sheet
DISPLAYED `pf2SaveTotal(save, char)` and ROLLED that number plus a condition penalty applied at the
call site. A Frightened 2 character read **+7** off the card and rolled a **5**. That is the "card
says +7, rolls +5" failure already recorded against the IG sheet (IG-S4), and it is worse than an
unimplemented condition because the player trusts the card. Two call sites that each remember to
apply conditions will drift again the moment a third statistic is added, so every statistic now
resolves in one place and the card and the roll both read `.total`.

**Two modules were written for S13b, tested in isolation, and consumed by NOTHING.**
`pf2StackModifiers` implemented PF2's highest-of-each-type rule and never reached a number a player
could see; `pf2ResolveRunes` resolved a resilient `saveBonus` no save ever read. Both are wired now:
a +1 item bonus beside a +2 resilient rune resolves to **+2, not +3**, and the suppressed one is
NAMED rather than silently dropped ("why isn't my +1 counting?" is PF2's most common maths question
and the answer is a rule, not a bug).

**MAP reached a Strike for the first time.** `pf2Map` existed and was tested, but nothing ever passed
a `strikeIndex`, so a Fighter's third attack displayed and rolled **ten points too high**. The
Strikes block carries a Strike-# selector; agile weapons take −4/−8 rather than −5/−10, and it caps
after the third.

Also newly computing: **AC moves** under Off-Guard/Clumsy/Frightened (it was the one headline number
no condition could touch); **Stupefied reaches the spell DC and spell attack**, as its own text says;
attribute-scoped conditions land where they belong — **Clumsy penalises Acrobatics and no longer
penalises Athletics**, which the shared module's single `'skill'` bucket could not express. **Armor
runes are modelled** (`PF2Combat.armorRunes` + `set_armor` + the armor editor), deriving AC and save
bonuses the way weapon runes already derived attack and damage.

What was deliberately NOT done, and why:

- **No feat bonus is folded into a sheet number, and this is the finding, not a shortfall.** A survey
  of the whole feat catalog found **not one unconditional bonus** — every single one is scoped
  ("against poisons", "in that terrain", "against the triggering attack", "until the start of your
  next turn"). Folding "+1 vs poison" into the Fortitude card would apply it against everything,
  which is the silently-wrong number Ground Rule 3 exists to prevent. Typed feat bonuses are parsed
  (PF2 always names the bonus TYPE, which is what makes this reading rather than guessing), carried
  with their scope verbatim, and surfaced as **situational** in the roll breakdown. Same treatment
  IG-S4 established for weapon properties. A feat stating no typed bonus yields nothing and stays
  prose, which is the honest outcome for the large majority: they grant actions, reactions and
  permissions, not numbers.
- **`Off-Guard`'s `fixed: 0` in the shared conditions module was left alone.** It is the truthful
  answer to the only question that module asks — "what does this do to a roll I make?" — and the
  answer is nothing; Off-Guard lowers the AC that attacks are rolled against. AC was not a statistic
  it modelled. The −2 its own note states is encoded on the AC path in `resolve.ts` instead, because
  changing `fixed` would make every existing caller subtract 2 from checks Off-Guard does not touch.
- **`pf2Derived` in rules.ts was kept** alongside `pf2ResolveAll`, rather than replaced. The builder
  and the AI grounding want a character's numbers WITHOUT transient combat state; the sheet wants
  them with it. Two callers asking genuinely different questions, rather than one function with a
  boolean.
- **Conditions do not chain.** Prone also makes you Off-Guard in PF2; the sheet does not auto-apply
  the second from the first. Automating condition implication is a rules decision with a lot of edge
  cases, and a wrong auto-applied condition is harder to notice than a missing one.
- Five source-anchoring tests were re-pointed at `resolve.ts` rather than deleted. They named
  symbols the sheet no longer calls directly; the properties they guard still hold, and the real
  protection is now the resolved-number tests.

### S13b — earlier progress (kept for the record) ⏳ PART SHIPPED 2026-07-20
**Strike resolution is done** (`strike.ts`, 33 tests) — the piece most likely to be silently wrong.
**PF2 crits are not 5e crits:** 5e rolls the dice twice and adds modifiers once; PF2 doubles the
ENTIRE total, dice and modifiers, and THEN adds deadly/fatal dice undoubled. A 5e-shaped
implementation is wrong on every single critical hit, which is why this got its own module.
Modelled and pinned by tests asserting the NUMBER: agile MAP (−4/−8, capped after the third
Strike), deadly (added post-doubling, dice count scaling with the striking line), fatal
(substitutes the die pre-doubling, plus one extra), two-hand (substitutes, and striking then
multiplies the SUBSTITUTED die), striking runes multiplying weapon dice only, ranged adding no
Strength, propulsive adding half and nothing when Strength is negative, finesse switching to
Dexterity only when it actually helps, and flat-damage weapons staying flat.
A test caught a real bug: `thrown 10 ft` is parameterised, so exact-match trait lookup never fired
and thrown weapons silently lost their Strength damage.

**Already existed and was better than the audit implied:** `pf2Proficiency` (rank + level),
`pf2ArmorClass`, `pf2SpellDc`/`pf2SpellAttack`, `pf2SaveTotal`, `pf2SkillTotal` with the armor
check penalty, `pf2Degree` (four degrees incl. nat 20/1 stepping), and
`lib/dnd/conditions/pathfinder2e.ts` with PF2's non-stacking bonus-type rule already implemented.

**Still to wire:** runes contributing their bonuses to the sheet's stored `weaponBonus`/
`acItemBonus`, feats that grant real effects rather than prose, and the catalog kinds reaching the
sheet's own attack/spell lists.

### S13b — original plan
*Owner, verbatim: "include adding in all of the spells and items and everything, weapons,
conditions, feats, everything into the character sheets for PF2 so that everything is hooked up and
all of the math works with the digital roller and the stats of the character and all of that."*

Catalogued content that only *renders* is a reference book, not a character sheet. Every kind must
reach the maths:

- **Weapons → attack rolls.** Strike = d20 + attribute mod + proficiency (rank + **level**, PF2's
  defining difference from 5e's flat bonus) + item bonus, and the **multiple attack penalty**
  (−5/−10, reduced by the `agile` trait) which nothing currently models. Damage = dice + attribute
  mod + striking runes; `deadly`/`fatal` change the CRIT die specifically.
- **Armour → AC.** 10 + dex (capped) + proficiency + item bonus; check penalty and speed penalty
  applied to the skills and speed they actually affect.
- **Spells → castable rolls.** Spell attack rolls and spell DC (10 + attribute + proficiency),
  damage rolled from `damage`, heightening applied at the rank actually cast, and `basic` saves
  resolved through the four-degree template.
- **Conditions → live modifiers.** PF2 conditions are **numeric**: Frightened 2 is −2 to *every*
  check and DC and ticks down each turn; Clumsy/Enfeebled/Drained/Stupefied hit specific statistics;
  Wounded escalates Dying. These must flow through the existing effect ledger like any other source,
  and be visible on the roll breakdown.
- **Feats → real effects.** A feat that grants a bonus, an action, a reaction, or a proficiency
  increase must contribute it, not sit as prose. Those that are purely narrative stay prose, and
  that distinction is recorded per feat rather than guessed at roll time.
- **Items/runes → bonuses.** Fundamental runes (+1/+2/+3 potency, striking) and property runes are
  how PF2 weapon maths scales; they must apply when equipped/invested, respecting PF2's
  item/status/circumstance bonus-stacking rules (the highest of each TYPE applies — a genuinely
  different rule from 5e, and a place where a naive sum is silently wrong).
- **Proficiency everywhere.** Untrained/trained/expert/master/legendary = +0/+2/+4/+6/+8 **plus
  level** when trained or better. This single rule touches every roll on the sheet.
- **The roller shows its work** — every roll names its sources, matching the IG sheet's existing
  behaviour so a player can see *why* a number is what it is.

Each of these gets tests asserting the resolved NUMBER, not just that the field renders.

### S15 — EDITORS + HOMEBREW, at parity with the 2024 sheet ✅ SHIPPED 2026-07-21
S15a–d shipped 2026-07-20 (`PF2ElementEditor` for spells and feats, `PF2WeaponEditor`,
`PF2ArmorEditor`, `update_spell`/`update_feat`/`add_attack`/`update_attack`/`set_armor` ops, all
gated). Closed 2026-07-21 with two behaviours IG had already found and fixed and PF2 still had —
because the IG fixes were made on the IG sheet, and **there is no shared code to make them in**. The
two bespoke sheets are deliberately separate (Ground Rule 1), so the only thing that can hold them
to the same behaviour is a test. Both now have one.

- **The gate's refusal now reaches the player.** `postEdit` awaited the fetch and ignored its
  response entirely, so a 400 and a 200 were indistinguishable. `gatePf2Edit` composes a genuinely
  useful sentence — it names the reason AND both ways forward — and the sheet threw it away. An
  unchanged sheet is indistinguishable from a slow one, so a refused edit read as the app ignoring
  you. Exactly the bug IG-S2 closed; same fix, plus a network failure that now says so.
- **An emptied spell override CLEARS rather than storing a blank.** `PF2KnownSpell.effect` is an
  override, so writing `""` left the spell rendering as though it had no rules text at all —
  silently destroying them — and made a customisation impossible to undo. IG-S1 settled this exact
  question; same answer.

What was deliberately NOT done, and why:

- **`update_feat`'s body was NOT made symmetric with the spell override.** `PF2Feat.body` is the
  feat's stored TEXT, copied from the catalogue by `add_feat` with nothing behind it, so there is no
  catalogue text to fall back TO. "Clearing" it would restore nothing and merely make the field
  impossible to blank. The asymmetry is in the shapes, not the handling, and is pinned by a test so
  it reads as decided rather than forgotten.
- **Editing is not re-gated, by design and now by test.** `gatePf2Edit` returns early for every op
  except `add_feat`/`add_spell`. Re-judging an edit would mean a level-4 wizard legitimately granted
  a rank-5 spell could never retune its text, and would see the grant refused back at them.

**Recorded, not fixed — a cross-system inconsistency that is a rules decision, not a bug:** IG gates
authoring (`canAuthorPowers = isDM || custom`, so a vanilla IG character cannot author a power), and
**PF2 does not**. `gatePf2Edit` passes any name the catalog does not know, on the stated reasoning
that homebrew "makes no claim to be official content, and refusing it would block authoring
something new rather than the exploit being closed". That reasoning is sound, but it does mean a
vanilla PF2 character can author a rank-1 spell that does anything at all, which is a route around
the gate that vanilla exists to be. The two systems should probably agree. Which way they agree is
an owner call, so it is question 6 below rather than a silent change to enforcement.

### S15 — original plan
*Owner, verbatim: "We need to be able to fully customize spells and feats and armor and weapons and
stuff in an editor for each thing. We need to be able to create whole new ones too. This needs to be
accessible to the PF2 character spreadsheet. It needs to have the same functionality as the 2024
edition character sheet does, but for PF2."*

The PF2 sheet is currently **read-mostly**: it renders derived numbers, allows a few in-place edits
(attributes, HP, conditions), and can now ADD catalogued content via the picker. It cannot edit what
it holds, and it cannot author anything new. The 2024 sheet can do both.

**Ground Rule 4 makes this cheap to state and non-negotiable to honour: custom content is the SAME
SHAPE as official content.** A homebrew PF2 spell is a `PF2SpellFull`; a homebrew feat is a
`PF2FeatFull`. They flow through the same gate, the same roller and the same renderer. Nothing gets
a parallel "custom" pathway — that is how a system ends up with two half-working code paths.

- **S15a — Editable content on the sheet.** Per-element editors for spells, feats, weapons, armor
  and items already ON the character: change any field, with the sheet's own maths re-deriving. The
  2024 sheet marks hand-tuned elements with ✎ (`customized`); PF2's shapes need the same flag and
  the same marker so an edited element is distinguishable from a catalogued one.
- **S15b — Author brand-new content.** Create a spell/feat/weapon/armor/item from scratch on the
  sheet. Homebrew is CUSTOM by definition, so it carries no `offRules` (it was never claiming to be
  official) but IS flagged custom for the DM's review queue, exactly as `provenance.ts` already does
  for IG. Note the two axes stay separate: `offRules` = "official content this character may not
  legally take", custom = "not official content at all".
- **S15c — Edit ops + persistence.** `update_spell` / `update_feat` / `update_item` ops in
  `PF2_EDIT_OPS`, parsed and gated like the add ops. Editing an element must NOT re-run the
  eligibility gate against the catalog entry it was derived from — once a character legitimately
  holds a spell, retuning its text is a customisation, not a fresh acquisition.
- **S15d — Weapons and armor reach the maths.** An edited or homebrew weapon must flow through
  `pf2ResolveStrike` (traits, striking, deadly/fatal) and armor through `pf2ArmorClass`, or the
  editor produces things that display but do not compute — the exact failure S13b exists to prevent.

**Open question for the owner, recorded rather than guessed:** should homebrew created on a PF2
sheet be private to that character, or promoted into a shared per-campaign library other characters
can draw from? The 2024 side keeps it per-sheet. Per-sheet is assumed here unless told otherwise.

### S14 — Browser verification (answers the owner's second question) ✅ SHIPPED 2026-07-21
Drove the app in a real browser against local dev (owner-approved). `/dnd`, `/dnd/library` and
`/dnd/library/pathfinder2e` all render 200 with no console errors — only Fast Refresh and React
DevTools notices. The PF2 library page surfaces Classes, Skills, Ancestries, Backgrounds, Armor,
Weapons, Spells, Conditions, Feats and a 92-entry glossary.
**Lesson worth keeping:** the "500 errors" I chased were a DIFFERENT app on port 3000. Next had
bound this one to 3004 because 3000 was taken, and I deleted `.next` before checking which port the
server actually announced. Read the port the server prints.

### S14 — original plan
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

## Open questions for the owner, recorded rather than guessed

1. **Should a VANILLA character be able to author homebrew?** IG says no (`add_power` is gated to
   DM-or-custom); PF2 says yes (any name the catalog does not know passes). Both have a stated
   rationale and they contradict each other. Whichever way this lands, the two systems should match,
   and 5e 2024 should be checked against the answer too. See S15 above.
2. **Homebrew scope** — per-character (assumed throughout, matching the 2024 sheet) or promoted into
   a shared per-campaign library other characters can draw from? Unchanged from S15's original note.
3. **Should conditions chain?** Prone makes you Off-Guard in PF2, and the sheet does not apply the
   second from the first. Auto-applying implied conditions is a rules decision with real edge cases.
4. **Archives of Nethys sourcing** — two earlier tranches (classes, ancestries) were authored using
   AoN after the assistant said it would avoid it. Nothing in this pass used it: S13b and S15 are
   both wiring and UI, and every mechanical fact they encode was read from data already in the repo
   (`PF2_CONDITION_MECHANICS` notes, `PF2_RUNES`, the feat catalog's own effect text). Re-deriving
   the earlier tranches gets more expensive as content layers on top.

## Done means

- Every slice above shipped, or explicitly deferred with a one-line rationale.
- `PF2_CATALOG_STATUS` honestly reports coverage per kind; nothing claims completeness it lacks.
- A vanilla PF2 character cannot take a feat or spell its class/level/tradition doesn't grant, by
  ANY route; custom can, flagged; DM can, marked as granted — parity with 5e and IG.
- Every entry carries a `source`; no Reserved Material anywhere in the catalog.
- **Everything catalogued is hooked to the maths (S13b), not just displayed.** A weapon rolls with
  the right multiple-attack penalty, a rune contributes, a numeric condition moves every affected
  number, and the roller names its sources. Tests assert resolved numbers, not rendered fields.
- `npx tsc --noEmit`, `npx eslint`, whole-repo `npx vitest run`, `npm run build` green.
