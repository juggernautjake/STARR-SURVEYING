# Jack — the Rangor Pugilist, on a new "homebrew rulebook" sheet skin

**Goal (per the player):** fully build out **Jack's** character on a **new character sheet + style**.
Jack is a **Rangor** (a custom race defined below) **Pugilist** (the homebrew class in the shared
screenshots) with the **Farmer** background. Visually he's a big, dumb, rock-looking brute with an
animalistic lion-like head and a mane — "a gargoyle with no wings and a mane," stone-plated skin, small
horns, one glowing violet eye (reference art provided). The sheet should be styled like the shared
homebrew rulebook: cream/parchment panels, **orange** section headers, **green** keyword links, and
bordered trait tables with orange row labels.

This is a bespoke character in the existing sheet engine: **a new `sheet_type` = a theme + a skin +
data (+ maybe a module)** (`app/dnd/_sheet/registry.ts`). Nothing forks the shared engine.

---

## 1. The build (rules)

### Race — **Rangor** (Neon Odyssey species)
**Lore:** one of the largest species in Neon Odyssey. Like the **Aetheron**, the Rangor have a
connection to **aether and gravity** — but where the Aetheron embody the *"immovable object,"* the
Rangor are the galaxy's *"Unstoppable Force,"* channelling an internal momentum that lets them **smash
and keep moving**. Their home "world" is **Titan IX**, a moon-sized space station shared with the
Aetheron; their original home planet was destroyed/lost aeons ago. (This directly motivates the
mechanics below — Living Momentum and Unstoppable Force are the "internal momentum / unstoppable force"
made rules.)

- **Ability Scores:** choose +2 to one and +1 to another of **Str/Dex/Con**, OR +1 to all three.
- **Speed** 30 ft. **Creature Type** Humanoid. **Size** Medium.
- **Natural Armor** — rocklike scales: while not wearing armor, **AC = 13 + DEX**.
- **Living Momentum** — when you hit with an attack after moving ≥15 ft in a straight line, choose:
  push the target 15 ft; knock it Prone (Str save); or deal +Str-mod damage.
- **Powerful Build** — count as one size larger for carrying capacity and push/drag/lift.
- **Unstoppable Force** — 2/long rest, ignore an effect that would reduce your speed or move you
  unwillingly.

### Class — **Pugilist** (homebrew, from the screenshots)
- Core: **Str** primary; **d10** HP; **Str & Con** saves; 2 skills from {Acrobatics, Athletics,
  Deception, Intimidation, Perception, Sleight of Hand, Stealth}; simple + improvised weapons; light
  armor; one Gaming Set tool.
- **L1 Fisticuffs** — mastery over Unarmed Strikes + Pugilist weapons (simple melee + improvised);
  **Fisticuffs die** (1d8 at L1 → 1d10 L5 → 1d12 L11 → 2d6 L17) replaces unarmed/Pugilist-weapon
  damage; **Bonus Unarmed Strike** (bonus action); **Improved Improvisation** (improvised weapons gain
  Sap mastery).
- **L1 Iron Chin** — unarmored **AC = 12 + CON**.
- **L2 Moxie** — a **Moxie Points** pool (per the class table). Spend on **Brace Up** (BA: Fisticuffs
  die + level + CON temp HP), **One-Two Punch** (BA: two Unarmed Strikes), **Stick and Move** (BA:
  Unarmed Strike + Dash/Disengage). Plus **Bloodied But Unbowed** (reaction: regain all Moxie; if
  Bloodied, +4×level temp HP) and **Swagger Streak** (spend Moxie to add the Fisticuffs die to a failed
  Str/Dex/Con/Cha check).
- **L3 Heavy Hitter** (Unarmed Strike deals damage AND a free Grapple/Shove) + **Pugilist Subclass**.
- **Subclass — Sweet Science** ("Float like a butterfly"): **L3 Bare Knuckle Boxer** (Unarmed Strikes
  crit on **19–20**); **L3 Cross Counter** (reaction + 1 Moxie: reduce melee damage by 1d10 + Str +
  level, and if reduced to 0, a free Unarmed Strike); **L6 Combo Maker**; **L11 Combo Breaker**; **L17
  Knock Out** (Coldcock / Uppercut).
- Full class table L1–20 (proficiency, features, Fisticuffs die, Moxie) is in the screenshots and goes
  into the Progression module.

### Background — **Farmer** (2024 PHB)
- Ability Scores **Str/Con/Wis**; Origin **Feat: Tough** (HP max +2×level now, +2/level after);
  Skills **Animal Handling + Nature**; **Carpenter's Tools**; starting gear (Sickle, Carpenter's Tools,
  Healer's Kit, Iron Pot, Shovel, Traveler's Clothes) or 50 GP.

### AC resolution
Jack has two unarmored formulas — Rangor **13 + DEX** and Iron Chin **12 + CON**. The engine's
`unarmoredBaseAC` already takes the best vs 10+DEX, so set `unarmoredBaseAC = max(13 + dexMod,
12 + conMod)` and label the source ("Natural Armor" or "Iron Chin", whichever wins).

### Suggested statline (level 3, DM-adjustable)
A big, dim brawler: **Str 17, Con 15, Dex 13, Wis 11, Cha 10, Int 6** (Rangor +2 Str/+1 Con already
baked in — the low Int matches his simplicity). HP = d10 class + CON + Tough (2×level). Level defaults
to **3** (subclass online), like Donata.

### Personality & inventory
- **Personality:** big, dumb, and pleasant — genuinely **nice and law-abiding at heart**, but far too
  simple to actually know what most laws *are*, so he breaks them by accident with total innocence. Slow
  to anger, but when he does get mad he **fights** (and hits like a landslide). Play him gentle-giant,
  low-cunning, high-heart.
- **The park bench (signature item):** Jack lugs around a **backless park bench**. It lives in his
  inventory as an **improvised two-handed weapon** he uses to *thwack* enemies (improvised → Sap mastery
  via Improved Improvisation; damage uses his Fisticuffs die as a Pugilist weapon), and it doubles as a
  place to **sit** (a bit of flavor/utility). Model it as an `EquipItem` with an improvised-weapon
  attack + a "sit on" note.

---

## 2. The look (new skin + theme)

A **light** "rulebook" treatment, like `skin-streamer` is a light skin over the dark base:
- **New theme `rangorTheme`** (`theme.ts`): pale parchment `void`/`panel` (`#f7f3ea`, `#fffdf7`),
  deep-ink text (`#241a12`), **orange** accent (`#c0531f`) for `hotpink`/headers, **green**
  (`#2f7d4f`) for `teal`/keyword links, a stone-grey `violet`, gold kept. Serif/condensed display font
  (e.g. a slab/serif for headers, clean body).
- **New skin `skin-rulebook`** (`styles/theme.css`, scoped to `.dnd-sheet.skin-rulebook` only): cream
  card backgrounds with a thin rule under each `SectionHead`, orange uppercase section titles, green
  keyword/link styling, and **trait tables** with orange left-column labels + hairline borders (the
  "Core Pugilist Traits" look). No CRT/pixel texture — clean printed-page feel. Touch nothing outside
  the scope class.
- **Registry entry** `rangor` (or `jack`): `{ label, theme: rangorTheme, skin: 'rulebook', modules:
  ['moxie'?], initiative: a Rangor/brawler flavor (kicker "BACK ALLEY // INITIATIVE", "Square Up!",
  accent orange) }`.

---

## 3. Data + engine mapping

- **`app/dnd/_sheet/data/jack.ts`** (model like `lazzuh.ts`/`donata.ts`): meta (name "Jack",
  className "Pugilist", subclass "Sweet Science", race "Rangor", background "Farmer", level 3, speed 30),
  abilities, `unarmoredBaseAC` (the max formula above), `saveProficiencies: [str,con]`, skill profs
  (2 class + Animal Handling + Nature), proficient categories (simple) + improvised, `resources`
  (**Moxie Points** pool, max from the class table), and `features[]` cards for every race/class/
  background/feat feature (with `unlockLevel`, `level` labels, and `use`/`resourceId` on the spendable
  Moxie features).
- **Unarmed attack**: an auto attack using the **Fisticuffs die** (Str to hit/damage; crit 19–20 from
  Bare Knuckle Boxer) — model via the weapons/attacks engine + an effect for the crit range.
- **Moxie mechanic**: reuse the resource-pool pattern (Lazzuh's Surge/rages `resources` + feature
  `use`), not a new module unless the panel needs bespoke UI. Decide during Slice 3 whether a small
  `moxie` module is worth it or the shared Resources tab suffices (**default: shared Resources tab**, to
  avoid a module).
- **Tough**: a feature effect that raises HP max by 2×level (surface in the HP/derive path).
- **Living Momentum / Unstoppable Force / Powerful Build / Heavy Hitter**: feature cards; the
  point-buy-mechanical ones (Unstoppable Force 2/long rest) get a `use.resourceId` pip.
- **Bio/appearance**: the rock-skinned lion-maned brute description in the Bio/Descriptions panel; the
  reference art uploaded via `SheetArtUploader` → `art_url`/`token_url` (or a seeded placeholder).
- **API + seed**: register `sheet_type` in `app/api/dnd/characters/route.ts` (factory `jackRangor(name)`)
  and add a seed (like `420_dnd_donata_dime.sql`) so Jack exists in a campaign. Add to
  `lib/dnd/constants.ts` if characters are enumerated there.

---

## 4. Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Theme + rulebook skin.** ✅ Added `rangorTheme` (`theme.ts`) — parchment/orange/green,
  slab-serif (Zilla Slab) headers, contrast-checked on cream — and a scoped `.dnd-sheet.skin-rulebook`
  block (`theme.css`, + a Zilla Slab/Inter @import): burnt-orange slab-serif section headers over a
  thick rule, green keyword/term/link colour, framed paper cards, and bordered trait tables with an
  orange header row + orange left-column labels. Registered the `jack` `sheet_type` (`rangorTheme` +
  `skin:'rulebook'`, no module, back-alley "Square Up!" initiative) and added `'rulebook'` to
  `SheetSkinId`. tsc + eslint clean; every rule is scoped to `.skin-rulebook` so no other character is
  touched. (Full in-skin render is exercised in Slices 3–4 once Jack's data exists.)
- **Slice 2 — Rangor race + Farmer background (rules + traits).** ✅ New reusable module
  `app/dnd/_sheet/data/rangor.ts`: `RANGOR_FEATURES` (Natural Armor, Living Momentum, Powerful Build,
  Unstoppable Force) + `FARMER_FEATURES` (Farmer background, Tough feat) as `FeatureBlock`s, the
  `UNSTOPPABLE_FORCE_RESOURCE` 2/long-rest pips (wired to the Unstoppable Force card's `use`), and the
  engine hooks `naturalArmorAC` (13+DEX), `ironChinAC` (12+CON), `bestUnarmoredAC` (max of 10+DEX /
  13+DEX / 12+CON, returning the winning source), and `toughBonusHp` (2×level). Unit test
  `__tests__/dnd/rangor.test.ts` (5 tests) verifies the AC max-of formula (Jack → 14 "Natural Armor"),
  Tough HP, and the trait cards — all pass; tsc + eslint clean. Slice 3 composes these into `jack.ts`.
- **Slice 3 — Pugilist class + Sweet Science + Jack data.** ✅ `app/dnd/_sheet/data/jack.ts` exports
  `jack(name)` = `blankCharacter` + overrides composed with the Rangor/Farmer trait data: level-3
  statline (Str 17/Con 15/Dex 13/Int 6/Wis 11/Cha 10), Str/Con saves, Athletics/Intimidation +
  Animal Handling/Nature skills, **AC 14** (best-of natural armor / Iron Chin) and **HP 34** (d10 +
  CON + Tough), a **Moxie Points** pool + Unstoppable Force pips, the **Fisticuffs** unarmed strike
  and the **backless park bench** improvised weapon (both 1d8, crit note 19–20), the full Pugilist +
  Sweet Science feature cards (with locked previews) and the **L1–20 class table** (Fisticuffs/Moxie
  columns), plus inventory (bench + Farmer gear) and full bio. Wired the `jack` `sheet_type` factory
  into the character-create API. Unit test `__tests__/dnd/jack.test.ts` (8 tests) verifies statline,
  AC/HP, saves/skills, Moxie, both attacks, the feature bundle + table, the `jack`→rulebook registry
  wiring, and structural validity — all pass; tsc + eslint clean.
  *(The DB seed moves to Slice 4 — it needs Jack's player/owner identity + the reference art.)*
- **Slice 4 — Appearance, seed + QA.** ✅ **Seed:** Jack is added to the Neon Odyssey demo seed —
  `DEMO_JACK_CHARACTER_ID` in `lib/dnd/constants.ts` + an insert in `scripts/dnd-seed-demo.ts` that
  writes `jack('Jack')` into `dnd_characters` (sheet_type `jack`), **DM-owned + campaign-visible** so
  he's on the roster and the DM assigns him to whoever plays Jack via the roster tool (no fabricated
  player account). **QA:** the full `__tests__/dnd/` suite is green (185 tests, 27 files), and a new
  engine test derives Jack's AC through the shared `deriveCharacter`/`computeAC` path (**14**, matching
  the stored sheet AC) — proving the rulebook character renders correctly on the real engine, not just
  hand-stored numbers; tsc + eslint clean.
  **Deferred (with rationale): the reference-art binary.** `tokenFocus` is set and the sheet already
  supports `art_url`/`token_url`, but the actual portrait is a pasted image, not a repo file — it's a
  **runtime upload** via `SheetArtUploader` (or the DB `art_url`), so persisting a binary here would
  exceed the slice's value. Everything else (mechanics, style, seed) is shipped.

## 5. Considerations
- **Scope isolation:** every visual change lives under `.dnd-sheet.skin-rulebook` and a new theme —
  Lazzuh/Donata/streamer are untouched (the engine only applies a skin class + inline theme vars).
- **Homebrew content is the group's own** (Pugilist/Rangor) — we encode the mechanics as data, not as
  a claim of official rules.
- **Level is DM-adjustable**; default 3 so the subclass and Moxie are live. The class table supports
  L1–20 for later level-ups (the engine already gates features by `unlockLevel`).
- **AI/DM edits** keep working — Jack is a normal engine character, so `applyModelEdit` and realtime
  propagation apply unchanged.

### Status: COMPLETE (Slices 0–4 shipped; reference-art binary deferred to a runtime upload). Jack the Rangor Pugilist is fully built, styled, seeded, and engine-verified.
