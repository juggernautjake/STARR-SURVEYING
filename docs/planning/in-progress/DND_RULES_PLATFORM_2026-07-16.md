# D&D Rules Platform — full buildout

**Status:** IN PROGRESS · started 2026-07-16
**Goal:** every supported game system fully written out, searchable, AI-explainable, and wired
into the character sheets — so a player or DM can build a character to level 20 exactly as the
system's designers intended, look any rule up instantly, and ask the AI how it applies in a
specific situation. Homebrew is a first-class citizen throughout.

Work in **slices**, in order. Each slice ends green: `npx tsc --noEmit`, `npx vitest run
__tests__/dnd`, `npx eslint`, and — for anything with a UI — **driven in the running app**, not
just unit-tested. Commit per slice. Do not mark a slice done with failing tests or an unverified
UI.

---

## Ground rules (these are why the platform exists — do not violate them)

1. **A system's rules never leak into another system.** The same word means different things in
   different games (a Blades "score" is a heist; PF2's Frightened is numeric, 5e's is binary; a 5e
   proficiency bonus is not PF2's level-added proficiency). Everything is keyed by system.
2. **Editions are different systems.** 2014 vs 2024 Exhaustion, Surprise, Grappled, Prone,
   Inspiration and feats all have two different *correct* answers. Never merge them.
3. **Never invent a rule.** If the reference doesn't cover it, say so. Accuracy beats completeness
   — omit a number rather than guess. (Authoring agents have already caught several errors in
   briefs by verifying against sources instead of recall — keep doing that.)
4. **Custom content is the same shape as official content.** A homebrew class is a
   `ClassDefinition`; it levels through the same engine and is checked by the same validator.
5. **No hardcoded palette values in the shared sheet.** Use theme tokens
   (`var(--ink)`, `rgba(var(--hotpink-rgb), .2)`). The base stylesheet was originally one
   character's dark neon sheet; every literal left in it breaks the light skins.
6. **A character can't level past a choice it hasn't made** (`lib/dnd/classes/levelup.ts`).

---

## What is already built (do not redo)

- **10 systems** in `lib/dnd/systems.ts` + `lib/dnd/system-rules.ts` / `system-rules-extra.ts`:
  D&D 5e 2014, D&D 5e 2024, Pathfinder 2e, Pathfinder 1e, Starfinder 1e, Call of Cthulhu 7e,
  Blades in the Dark, Cyberpunk RED, Shadowrun 6e, Intuitive Games.
- **415 glossary terms** across 9 systems (`lib/dnd/glossary/`) — full articles, not stubs.
- **D&D 5e 2024 classes, complete**: all 12, level 1–20, 48 subclasses (`lib/dnd/classes/dnd5e-2024/`).
- **Class engine** (`lib/dnd/classes/engine.ts`), shared slot tables (`slots.ts`), custom-class
  builder + DM review (`custom.ts`), level-up gate (`levelup.ts`), registry (`registry.ts`).
- **Library**: `/dnd/library` (index) + `/dnd/library/[key]` (per-system, fully written out),
  keyword search that works with no embeddings key, and a system-focused AI chat with
  cross-system detection (`lib/dnd/system-detect.ts`).
- **Level builder**: `/dnd/characters/[id]/levels` + its API; the sheet's `+/-` stepper is gone,
  replaced by **Manage Levels**.
- **Seeds are idempotent** (010/020 fixed); 258/268 apply; 445 registers the new systems.

---

## Slice 1 — Sheet contrast: finish the sweep ✅ SHIPPED 2026-07-16

The base stylesheet still has hardcoded colours that break on light skins. Several rounds of this
have already landed; this slice is to finish it and make regressions impossible.

- [x] Audit **every** `color: #fff` / hardcoded hex / `rgba(<literal>)` left in
      `app/dnd/_sheet/styles/theme.css` outside the `.skin-*` blocks and the token block. For each,
      decide: theme token (panel text ⇒ `var(--ink)`, accent text ⇒ the accent token) or genuinely
      on a solid dark fill (leave, and comment why).
- [x] Same audit for **inline styles in components** (`app/dnd/_sheet/components/*.tsx`) — CSS
      tests can't see these. `RollStage.tsx` and `CharacterGallery.tsx` are known offenders.
- [x] Extend `__tests__/dnd/sheet-contrast.test.ts`: assert the base stylesheet contains **no**
      hardcoded `color: #fff` outside `.skin-*`/`::selection`/`.stream-*`, so this can't regress.
- [x] Drive each skin in the app (Jack=rulebook, Susie=streamer, Sarah=donata, Lazzuh=neon,
      a default Hextech character) and read every tab.

**Completion note (2026-07-16).** Measured contrast in the BROWSER for every text node on every
tab of all four characters, compositing each translucent tint over its ancestors — not by reading
CSS. Two false starts worth recording so nobody repeats them:

* a naive walk compared text against its own `rgba()` tint and reported 1.0 for same-hue text;
* `backgroundColor` is transparent for gradient-painted elements, so measuring "through" a
  gradient produced 168 bogus failures on Sarah's skin. The scan now skips what it can't measure.

Fixed, all found by measuring rather than by grep:

* **A global leak, not a sheet bug:** the marketing site's `globals.css` sets a bare
  `p { color: var(--text-secondary) }` (#4B5563). Every unclassed paragraph in the sheet — bio
  prose, feature text — rendered mid-grey: **2.54:1** on Lazzuh's near-black card. Fixed with a
  `.dnd-sheet p { color: inherit }` reset at the sheet boundary.
* **White-on-white:** `.skin-donata .tray-dice .btn.solid` set `color: #fff` but inherited
  `background: #fff` from the rule above it, so "Flat d20" was invisible on Sarah's sheet.
* **`pink` is not just a fill.** All three light skins documented `pink` as "a background fill",
  but `.apill.primary .am` renders it as the PRIMARY ability's modifier — so it was 2.79–2.86:1
  on Jack's, Sarah's and Susie's sheets. Same root cause, three themes.
* Susie's `tealbright` was commented "a deep gold that stays legible on the light panels"; it
  measured **2.86:1**. Deepened, along with the other text-bearing accents on all three light
  themes (each retuned by iterating against the browser measurement, not by eye).
* Remaining shared-CSS literals themed: `select option` text, the fumble/crit stage animations,
  `.rv-flag.crit`, `.apill .asc`, `.inline-edit`, `.tab.on`, plus `RollStage`'s idle colour and
  two `CharacterGallery` badges.

**Result:** Jack, Lazzuh and Sarah measure **0 contrast failures** across every tab. The two
`#fff` left in components are correct (a solid accent fill; a fixed dark lightbox scrim) and are
now commented as such.

**Deferred — Susie's fake-Twitch chat badges (VIP magenta `#e005b9`, MOD green `#00ad03`, white
letter, 3.0–4.3:1).** These deliberately replicate Twitch's real badge colours inside an in-fiction
Twitch clone; the meaning is carried by their `title`, and they are decorative single letters, not
rules text. Restyling them would break the thing they exist to imitate. Rationale: authenticity of
a fictional UI outweighs AA on a decorative badge.

**Regression guard:** `sheet-contrast.test.ts` now fails the build on ANY hardcoded text colour in
the shared sheet, naming the line and selector. Verified it actually fails by injecting a
violation, then restoring.

## Slice 2 — Clickable rules on the sheet ✅ SHIPPED 2026-07-16

Everything on a sheet that names a rule should open its explanation.

- [x] `RuleTip` component: wraps a term, opens a popover with the glossary article
      (`findTerm(system, term)`), with **See also** links and an **Ask the AI** fallback.
- [x] Auto-link feature/feat/condition/attack bodies via `termsMentionedIn(system, text)`
      — longest match wins, never inside a longer word.
- [x] Conditions in `ConditionTracker`, traits in `CombatPanel`, features in `Features`.
- [x] For a term with no glossary entry (homebrew), the popover says so and offers
      "Ask the librarian", pre-filled and focused on the character's system.

**Completion note (2026-07-16).** The sheet did not know its own system, so this slice starts by
plumbing it: page → `SheetRoot` → `App` → `SheetConfigProvider` (which already carried the
sheet_type config). `useSheetSystem()` exposes it, and the sheet root now carries `data-system`
so the ruleset is visible in the DOM. **A character with no system gets NO auto-links** — we don't
know which rulebook its words belong to, and linking to another system's article would be worse
than linking to nothing.

Verified in the app on Jack: **38 rule links** on his Features tab; clicking "AC" opens the real
*Armor Class (AC)* article (543 chars) with See-also links and a pre-filled, system-scoped
"Ask the librarian" link.

Two real bugs found by driving it, both invisible to unit tests:

* **Markdown was being torn apart.** The first `RichRules` split the raw string on term
  boundaries and ran `md()` over the slices, so a `**bold**` span containing a term rendered with
  its asterisks showing ("**not wearing armor**"). It now tokenizes markdown FIRST and links terms
  inside each token, so bold text stays bold and still links.
* **Invalid HTML nesting.** The popover rendered `<div>`/`<p>` inside a `<span>` inside the
  feature's `<p>`. HTML forbids that: the browser force-closes the paragraph, which physically
  tears the surrounding text out of its element (and triggers a hydration error). The popover is
  now inline-safe markup — all `<span>`, block-displayed via CSS. **Worth remembering: this is a
  likely cause of "text not contained in its element" reports elsewhere.**

Also fixed in passing: `ConditionTracker` hardcoded the 5e condition list for **every** system —
it offered "Paralyzed" to a Call of Cthulhu investigator and hid PF2's numeric conditions. It now
reads `systemConditions(system)`, falling back to a generic list only for a system-less character.

**Deferred to Slice 3:** attack notes and level-builder features aren't linked yet — the level
builder renders server-side outside the sheet's provider, so it needs its own system context.
That's cheaper to do alongside Slice 3's character-context work than to bolt on here.

## Slice 2b — Sheet layout + gallery upload ✅ SHIPPED 2026-07-16

Reported while Slice 2 was in flight.


- [x] **Hit Points, reformatted.** The Damage/amount/Heal row and the Temp HP row were plain flex
      rows mixing `.btn`, `.step` and bare `<input>`, each with its own padding and border — so the
      inputs floated off the buttons' baseline. Every control in those rows now shares one height
      (`--hp-ctl-h`), number spinners are suppressed (they pulled digits off-centre), and Death
      Saves' SAVE/FAIL no longer drift to opposite edges. Verified in the browser: every control in
      each row reports an identical `top` and `height`. Applies to every skin — it's the shared sheet.
- [x] **Gallery upload.** The Gallery tab could list, promote and delete images but had no way to
      ADD one — it told you to "upload art or a token" with no button. Added a multi-file uploader
      (a new `gallery` kind on `POST /api/dnd/characters/[id]/media`, which points no character
      column) with per-file results, so one bad file doesn't fail the batch. Works for every
      existing, template and future/custom sheet, since it lives in the shared Gallery component.
- [x] **Hextech: the ART section label is misaligned.** ROOT CAUSE FOUND (2026-07-16). The skin's
      gold accent bar is `.skin-hextech .card::before` with `margin: -14px -16px 12px` — negative
      margins meant to bleed a 2px bar out to the card's edges. On a `display: flex` card (the ART
      uploader) that `::before` becomes a **flex item**, so its `-16px` left margin dragged the
      whole row out of the card's padding. The offsets were also hardcoded to a padding the cards
      don't have (base card is `20px 22px`, the ART card `12px 16px`), so the bar never reached the
      edges anyway. It's decoration → now `position: absolute` pinned to the top edge, out of
      layout entirely. Verified on the Hextech sheet: "ART //" now sits at its card's padding edge,
      matching every sibling.
- [x] Sweep the Hextech skin for other out-of-position / overflowing text. Measured every text node
      across all 8 tabs: **0 contrast failures, 0 overflowing elements.**
- [x] **DM controls**, all skins. ROOT CAUSE: four shared components pinned an **inline**
      `style={{ color: 'var(--gold)' }}` on their `.sec-num` label (`DmOverridePanel`,
      `AiSheetEdit`, `StreamControl`, `StreamOwnerControls`). An inline style beats every
      stylesheet rule, including a skin's — so on the candy skin, whose `.sec-num` is a filled
      magenta pill with white text, those labels painted dark bronze onto magenta. Exactly the
      reported "purplish background, brownish text". Removed the inline colours so each skin styles
      its own labels: candy now renders them white-on-pill at **5.87:1**, and the neutral skins
      inherit their own accent (Lazzuh 5.49:1) instead of the shared gold.

      Note this was invisible to the automated sweep — the pill is a gradient, and the scan skips
      what it can't measure. It took a screenshot to see. A new guard now fails the build on any
      inline `color` on a `.sec-num` (verified by injecting a violation).

## Slice 3 — AI situational adjudication ✅ SHIPPED 2026-07-16

The chat can already answer rules questions. It must also rule on *this character in this moment*.

- [x] Pass character context into `POST /api/dnd/library/chat` (already accepts `characterId`):
      load the sheet, build a digest (class, level, features, conditions, resources, gear).
      → `lib/dnd/character-digest.ts`. **Facts only, deliberately small**: no bio prose (not
      evidence for a ruling, and it burns the window), bodies trimmed to a reminder (the full text
      is already in the grounding block), nothing inferred. Features are filtered by `unlockLevel`
      so a level-7 sheet can never be ruled on as if it had its level-20 capstone.
- [x] Adjudication prompt: given the character + the grounded rules, answer questions like
      "can I cast this while grappled?", "does my feat apply here?", "what happens if I shove a
      creature two sizes larger?". It must reason to a ruling, cite the rule it used, and say
      plainly when the rules genuinely don't settle it (then suggest a DM call).
      → `adjudicationInstruction()`: ruling first, then why (citing the rule *and* the thing on
      the sheet it turns on), concede when the rules don't settle it, name what's missing when the
      character simply can't do the thing.
- [x] Mount the chat on the character sheet with the character's system pinned.
      → `app/dnd/characters/[id]/page.tsx`. The route **re-checks access itself** (`getCharacterAccess`)
      — a chat endpoint must not become a way to read a sheet you can't open — and the *character's*
      system overrides the client's focus, since a ruling for this sheet must use this sheet's rulebook.
- [x] Tests: the prompt carries the character digest; the cross-system hint still fires; the
      chat refuses to invent a rule. → `__tests__/dnd/character-digest.test.ts` (11 tests).

**Done when:** on Jack's sheet you can ask "can I use Cross Counter while grappled?" and get a
grounded, character-aware answer.

**Note — the absence of a fact is a fact.** `CONDITIONS: none` is stated explicitly rather than
left implicit: a model reading silence about conditions will happily assume whichever answer it
already wanted. Same reasoning behind `(+N more not listed)` — a silent truncation reads to the
model as "this is the complete list", which is exactly how a ruling ends up ignoring a feature.

## Slice 4 — 5e 2024: feats, backgrounds, species, languages

The classes are done; the rest of character creation is not.

- [ ] **Feats** as structured data (`lib/dnd/feats/dnd5e-2024.ts`): all four categories — Origin,
      General (with prerequisites + the +1 ability), Fighting Style, Epic Boon. Full rules text.
- [ ] **Backgrounds** (16): ability scores (+2/+1 or +1/+1/+1), Origin feat, 2 skills, 1 tool,
      equipment. Remember: in 2024 the **background** grants the ability increases.
- [ ] **Species** (10): traits only, **no ability score increases**, with size/speed/creature type.
- [ ] **Languages** + tool proficiencies as lists.
- [ ] Wire into the level builder: an ASI choice offers real feats with prerequisites checked;
      character creation offers backgrounds/species.
- [ ] Tests: no feat grants an ability increase it shouldn't; every background's feat exists;
      species grant no ASIs (the 2014-vs-2024 trap).

## Slice 5 — Custom class / subclass / feat builder UI

The engine (`lib/dnd/classes/custom.ts`) is built and tested; there is no UI.

- [ ] `/dnd/characters/[id]/build/class` — define a class from scratch: hit die, saves, skills,
      per-level features, resources, spellcasting. Live `reviewCustomClass` feedback (errors block,
      balance warnings advise).
- [ ] Homebrew subclass + homebrew feat builders.
- [ ] AI assist: describe the class in prose → a draft definition the player edits.
- [ ] Persist to the character/campaign; flag as custom content so the **existing** provenance +
      DM approval (seed 443, `lib/dnd/provenance.ts`, `submission.ts`) picks it up.
- [ ] A custom class must appear in the level builder exactly like an official one.

## Slice 6 — Full class data for the remaining systems

One system per slice — depth-first, verified against sources. In priority order:

- [ ] **6a — D&D 5e 2014**: all 12 classes + Artificer, L1–20. The 2014/2024 differences are the
      whole point (subclass levels differ per class; ASI at 19; no Weapon Mastery; Ranger has
      Favored Enemy/Natural Explorer).
- [ ] **6b — Pathfinder 2e**: classes with flat HP/level, the feat cadence (ancestry 1/5/9/13/17,
      class at even levels, skill at even, general at 3/7/11/15/19), attribute boosts at 5/10/15/20.
- [ ] **6c — Pathfinder 1e**: BAB progressions, save progressions, skill ranks, feats at odd levels.
- [ ] **6d — Starfinder 1e**: Stamina/HP/Resolve, EAC/KAC, four-ability increases at 5/10/15/20.
- [ ] **6e — Cyberpunk RED**: Roles + Role Ability ranks 1–10 (no levels — model as rank tracks).
- [ ] **6f — Shadowrun 6e**: archetypes + priority creation (no levels — model as Karma spend).
- [ ] **6g — Call of Cthulhu 7e**: occupations + skill-point formulas (no levels, no classes).
- [ ] **6h — Blades in the Dark**: playbooks + special abilities + XP tracks (no levels).

For the level-less systems the model must NOT invent a level table — extend the builder to express
"advancement by spend" (Karma/IP/skill checks) instead. `registry.ts` already reports
`classKnown: false` honestly for these; that is the behaviour to replace, not to paper over.

## Slice 7 — Everything connected

- [ ] Choosing a system on a character drives: available classes, skills list, conditions,
      the sheet's ability model, and the glossary the sheet links to.
- [ ] `system-validate.ts` runs against the class data (not just the catalog) so a sheet with a
      2014 feature on a 2024 character is flagged.
- [ ] The sheet's Progression tab renders from `progressionTable(def, sub)` rather than
      hand-authored per-character arrays.
- [ ] Jack: decide whether Rangor/Pugilist become a real custom class + subclass through the Slice-5
      builder (they are currently hand-authored sheet data with `system: ambiguous`).

## Slice 8 — Semantic search (optional, needs a key)

- [ ] Backfill embeddings for `dnd_system_entries` + the glossary once `VOYAGE_API_KEY` exists
      (`scripts/dnd-seed-system-rules.ts` already embeds when configured).
- [ ] Project the glossary into the store so semantic retrieval reaches the full articles.
- [ ] Keyword search must remain the fallback — it is the only thing that works without a key.

---

# Part II — Living items & the effect ledger (requested 2026-07-16)

> "Any item could literally effect anything… It could be a sword that does this, or a single boot.
> Really, the image and the name and category really don't matter all that much, the mechanics of
> the item/weapon/potion/spell matter way more."

## What is actually wrong today

Three findings, from reading the code rather than the symptom:

1. **The effects engine is not in the render path.** `app/dnd/_sheet/engine/effects.ts` already models
   `{ target, operation, value, condition, source }`, and `deriveCharacter()` (engine/character.ts)
   already pools item + feature effects and resolves them. **Nothing the player looks at calls it.**
   The sheet components read `char.abilities[k]`, `char.combat.ac` and `char.meta.name` *directly*
   from the stored model. So an item's effects are, today, decoration: they are stored, and they are
   ignored. This is the root cause and Slice 10 is about exactly this.

2. **The AI cannot express an item's mechanics, so it correctly refuses to invent them.** The reported
   "the AI made no edits" is not a bug in the model — it is the schema being honest.
   `lib/dnd/sheet-edits.ts` defines `add_item` as `{ name, desc?, qty? }`. There is no field for an
   effect, a category, a duration, or art. Asked for "a pendant that grants a Barbarian ability", the
   model can emit a *label* for one, and nothing more. Widening the vocabulary (Slice 14) is the fix;
   prompt-tuning would only produce prettier lies.

3. **Nothing shows what is currently modifying you.** `ActiveEffect[]` exists on the type and the store
   has add/remove reducers — with no UI. So the potion-of-strength-still-active-next-session scenario
   in the request is not hypothetical, it is the current behaviour.

## The one architectural rule for Part II

**Effects are overlays. They are NEVER baked into the base character.**

When the pendant makes you a different person, it must not *write* `meta.name`. It contributes an
identity effect that the ledger *overlays* on top of the stored name. Everything follows from this:

- Taking the pendant off is free and always correct — remove the source, re-derive, you are you again.
  No "undo" bookkeeping, no snapshot to restore, no drift when two items both touch the same field.
- Two items touching one field resolve by one documented rule instead of by whoever wrote last.
- The ledger can always answer *why* a number is what it is, because it never lost the base.

The tempting shortcut — mutate on equip, restore on unequip — is how you end up with a character
permanently named "Zul the Devourer" because the sheet saved between the two halves of the swap. Do
not take it.

## Slice 9 — AI chat box: resizable, and a send button that behaves

Small, reported, independent of the rest. Ship first.

- [ ] The chat transcript is resizable (drag handle, remembered per-user, sane min/max).
- [ ] The send button is sized to its content and aligned with the input — it is currently a slab.
- [ ] Apply to every chat surface, not just the one that was noticed: `LibraryChat`, `SheetEditChat`,
      `SheetChatPanel`, `CharacterBuildKit`'s build chat.
- [ ] Test: the guard from Slice 2b (`.sec-num` inline colour) has a sibling here — no chat surface
      may hardcode a text colour, since these mount on every skin.

## Slice 10 — The effect ledger (the spine of Part II)

One pure function that every later slice reads. Nothing else in Part II can be built first.

- [ ] `lib/dnd/effects/ledger.ts`: `buildLedger(char, ctx) → EffectLedger`. It walks EVERY source —
      equipped/attuned inventory items, `activeEffects[]` (consumed potions, spells cast on you, DM
      boons), features gated by `unlockLevel`, the active form/transform, conditions — and returns,
      **per target**: the base value, every contributing effect with its `source`, and the final value.
- [ ] Resolution order is documented and tested, not emergent: `set_base` → `set` (highest wins) →
      `add` (all stack) → advantage/disadvantage (both → flat). Ties broken deterministically.
- [ ] The ledger explains itself: every entry carries `{ source, sourceKind, label, delta }` so the
      tooltip in Slice 13 and the panel in Slice 12 are *reads*, not re-derivations. Two components
      computing "why is my STR 22" independently will drift; there must be one answer.
- [ ] Swap the sheet's reads onto the ledger: abilities, AC, speed, HP max, save DC, initiative,
      skills, proficiency. This is the change that makes item effects real.
- [ ] **An equipped item lands in the right place, automatically.** Equipping routes by what the item
      *is*, with no per-item code: a weapon appears as a row in **Attacks** with its computed to-hit
      and damage; armour drives **AC** (respecting DEX cap / STR requirement / stealth disadvantage);
      a shield stacks; a consumable is usable from **Inventory**; a granted feature (Slice 11) appears
      in **Features**; a granted spell in **Spells**; a granted resource as a **resource track**.
      Each carries a badge naming the item it came from, and each disappears on unequip.
      `engine/weapons.ts` (`attacksFromInventory`) and `engine/armor.ts` (`computeAC`) already do this
      work correctly — they are simply not called by anything the player sees. Same root cause as
      above; same fix.
- [ ] Equipping is validated, not blind: attunement limits, "one body armour at a time", two-handed
      vs shield. Where a system has a hard rule, enforce it; where it doesn't, allow it and let the
      panel show the truth.
- [ ] Tests: base with no sources == the stored character (the no-op case must be exact, or every
      existing sheet silently changes); two items adding to one target stack; two `set`s take the
      highest; removing a source restores the base *exactly*.

**Done when:** equipping a +2 STR belt on any sheet changes the displayed STR, its modifier, the
athletics check, and the carrying capacity — with no code that knows what a belt is.

## Slice 11 — Effects can target anything (identity + grants)

The request's real ask: *"it could literally turn the character into a completely different character."*

- [ ] **Identity targets**: `name`, `image`/`token`, `species`, `className`, `subclass`, `gender`,
      `profession`, `size`, `pronouns`. Operation `set_identity`. Overlaid by the ledger (see the rule
      above), never written to the model.
- [ ] **Size** is mechanical, not cosmetic: it drives carrying capacity, weapon damage dice for some
      systems, grapple/shove legality. Wire it to those, or it is a costume.
- [ ] **Grant targets**: `grant_feature`, `grant_attack`, `grant_spell`, `grant_resource`,
      `grant_sense`, plus the existing `grant_proficiency`. This is the pendant that gives you an
      ability from another class entirely — the granted feature appears in Features with a badge
      naming the item it came from, and vanishes when the item comes off.
- [ ] **Movement is not one number.** `speed_fly`, `speed_swim`, `speed_climb`, `speed_burrow`,
      `hover` are each their own target with their own base (Appendix A) — a potion of flying is not
      "+30 speed". A fly speed can exist while the walk speed is 0, and the sheet must show both.
      This needs a **speeds block on the sheet** before it can be granted; see rule 2 below.
- [ ] **Senses** (`grant_sense`: darkvision/tremorsense/truesight/blindsight, with a range) likewise
      need somewhere to render.
- [ ] **Every new target must have a home on the sheet, or it is a lie.** Granting a burrow speed
      that appears nowhere is exactly the bug this whole Part is fixing — a correct engine nobody can
      see. A target is not done until it renders.
- [ ] A single item carries **any number of effects of any mix** — the "one boot that rewrites you"
      case is just an item with fifteen effects and must need no special code.
- [ ] Tests: an item granting a Barbarian feature to a Wizard shows it in Features, sourced to the
      item, and gone on unequip; identity effects never mutate stored `meta`; a save-then-unequip
      round-trip leaves the model byte-identical to before it was equipped.

## Slice 12 — The Active Effects sheet (every template)

> "It might be that we think something is active when it is not, or we might forget that something is
> active… they still have super strength and don't know why."

- [ ] A new tab/panel on **every** template listing every source currently modifying the character:
      each item/spell/ability/potion/form/condition, what it is, and **the exact effect it is having**
      — resolved values from the ledger, not the item's advertised text. If the belt's +2 is being
      overridden by the gauntlets' `set 21`, the panel must say the belt is contributing nothing.
      That divergence is precisely what the panel exists to surface.
- [ ] Group by source kind (worn · attuned · consumed · spell · form · condition · DM), each with its
      duration and a one-click **end effect**.
- [ ] **Consumption: the effect outlives the item.** This is the case the data model must get right,
      and it is why an `ActiveEffect` is a *separate source* from the item that produced it rather
      than a pointer back into inventory:
      - Using a consumable **decrements qty / removes the item immediately** — you drank it, it's gone.
      - Its **instant** effects (heal 2d4+2) resolve once and leave nothing behind. A healing potion
        therefore vanishes completely and never appears in the panel: there is nothing to show.
      - Its **lasting** effects become an `ActiveEffect` that *survives its item*, carrying a snapshot
        of what it grants, its label, its art and its duration — so the panel can still show
        "Potion of Storm Giant Strength · STR set to 29 · 1 hour" hours after the potion left the
        inventory. Clicking it shows exactly what it is doing.
      - A potion with **both** (instant heal + a 12-hour buff) does both: consumed and gone from
        inventory, still listed in the panel for its buff.
      - Because the snapshot is taken at use time, later editing the *item* must not retroactively
        change an effect already running on a character. That's a feature, not a bug.
      - **Ending** a consumed effect just drops the `ActiveEffect` — the item is long gone. Ending a
        *worn* item's effect unequips the item, because there the item IS the cause and an effect
        that is "off" while its cause is still worn would be a lie about the sheet.
- [ ] Durations are shown as authored ("12 hours", "3 rounds") and are **not** silently expired by a
      timer. This is a table aid, not a simulation; the DM decides when time passes. But the panel is
      what lets you *notice* at the start of next session — which is the whole point.
- [ ] A **Use** control on any consumable in Inventory runs the above. It is the only path that
      consumes, so there is one place where "drank it" is implemented.
- [ ] Tests: an item with effects always appears; a pure-heal potion is consumed and leaves NO panel
      entry; a buff potion is consumed and its effect still shows with its label and duration; a
      heal+buff potion does both; editing the item afterwards does not mutate the running effect;
      ending a worn effect unequips, ending a consumed effect does not resurrect the item; the
      panel's numbers equal the ledger's (one source of truth).

## Slice 13 — Show me what's touched: the star + the tooltip

> "effected stats numbers and stuff will just get a little star or something we can hover over."

- [ ] Any ledger-modified value renders a marker (★) beside it and a highlight ring: abilities, AC,
      speed, HP, saves, skills, attacks, DC, granted features.
- [ ] Hover/focus → tooltip listing **every** contributing effect and its source, base → final
      ("STR 18 base · +2 Belt of the Bear · +2 Rage · = 22"). Reuse `RuleTip`'s inline-safe `<span>`
      popover — the invalid-nesting bug from Slice 2 (a `<div>` inside a `<p>` gets force-closed by
      the browser, tearing text out of its element) is already solved there; do not re-solve it.
- [ ] Keyboard + touch reachable. A hover-only affordance is invisible on a tablet at the table,
      which is where this is actually used.
- [ ] The marker must be theme-token driven (`var(--gold)` etc.), never a literal — the contrast
      guards in `sheet-contrast.test.ts` will fail the build otherwise, and correctly so.
- [ ] Tests: an unmodified sheet has zero stars (no false positives — a star that's always on is
      noise); modifying one ability stars exactly that ability; the tooltip names every source.

## Slice 14 — The AI generates real items, not labels

- [ ] Widen `add_item` in `lib/dnd/sheet-edits.ts` to the full `InvItem`: `kind`, `desc`, `qty`,
      `image`, `weapon`/`armor`/`consumable` stats, `attuned`, and **`effects: Effect[]`** — the whole
      point. Add `update_item` and `equip_item`.
- [ ] Validate hard at the boundary: unknown target/operation → reject the edit, don't coerce it. An
      item whose effect silently didn't parse is worse than a refused one, because the player believes
      it works.
- [ ] Prompt: given "a random potion that gives proficiency in something", the AI emits a real item
      with real effects, appears in inventory, and works. Ground it in the character's system so a
      generated item obeys that rulebook's vocabulary.
- [ ] **Art**: generate/attach item art (`dnd-media`, `kind='item'`), falling back to a kind icon.
      Per the request, art is the *least* important part — it must never block the mechanics.
- [ ] Balance guard: DM-facing provenance. Generated items route through the existing
      `summarizeCharacterProvenance` / approval path (Slice 5's) rather than a new one — a player
      generating a +10 sword is a table problem, and the DM approval surface already exists.
- [ ] Tests: a described item round-trips to effects that the ledger resolves; an invalid effect is
      rejected, not coerced; a generated item changes the sheet's numbers end-to-end.

**Done when:** "give me a pendant that makes me a Level 3 Barbarian named Zul with +2 STR and a
different portrait" produces one item that does all of it, and taking it off gives you back exactly
the character you were.

## Slice 15 — Attack, weapon & armor builders (+ reactive effects)

> "We might have an enemy that when they attack us and hit us, the armor does a certain amount of
> damage back to them… even a piece of armor could potentially have a roll to attack and a roll for
> damage."

**The gap this exposes.** Every effect in the engine today is a *continuous overlay*: it is true for
as long as its condition holds, and the ledger's job is to resolve it into a number. Retaliation
damage is not that. It is an **event-triggered action** — it fires *when something happens*, it rolls
dice, and it targets someone who is not you. The ledger cannot express it, and stretching `Effect`
to cover it would wreck the thing that makes the ledger tractable (pure, order-independent, always
re-derivable). So triggers are a **separate concept** that lives beside effects, not inside them.

- [ ] **Attack editing** (the plain ask, first): edit and create attacks directly on the sheet —
      name, ability, proficiency, to-hit and damage bonuses, range, typed damage, crit range/dice,
      notes. Today `add_attack` exists for the AI but the player cannot author or edit one by hand.
- [ ] **Weapon builder**: define a weapon's mechanics — damage dice + type, properties (finesse,
      versatile, reach, two-handed, thrown, loading, ammunition), mastery (2024), range bands,
      attack/damage effects, and **on-hit riders** (extra typed damage, a save-or-condition, a
      resource cost). The derived attack row comes from the weapon, so changing the weapon changes
      the attack — no double authoring.
- [ ] **Armor / clothing builder**: base AC, armour category, DEX cap, STR requirement, stealth
      disadvantage, resistances, and arbitrary `effects` (Slice 11's full vocabulary — armour that
      changes your species is just armour with an identity effect).
- [ ] **`Trigger` — the new concept**: `{ on, condition?, action }`.
      - `on`: `hit_by_melee` · `hit_by_ranged` · `hit_by_spell` · `you_hit` · `you_crit` ·
        `you_are_crit` · `save_failed` · `turn_start` · `turn_end` · `damaged` · `reduced_to_zero`.
      - `action`: roll damage (typed, with its own dice + optional attack roll), heal, apply a
        condition, grant a temporary effect, spend/restore a resource, or a DM prompt.
      - Triggers may carry their own limits (`once per turn`, `N per long rest`, a resource cost) —
        unlimited retaliation is the failure mode here, and the data model must be able to say no.
- [ ] **Triggers are prompts, not automation.** When a trigger's event happens, the sheet *surfaces*
      it ("Spiked Barbs: 1d6 piercing to the attacker — roll?") and the player/DM resolves it. It must
      not silently apply damage to a creature the sheet does not model. Guessing that a hit landed, or
      auto-resolving against an enemy the app has never seen, is how the sheet starts lying about the
      table's actual state — and a wrong automatic ruling is worse than a visible reminder.
- [ ] Triggers surface in the Slice 12 panel and are starred by Slice 13 like anything else, so
      "why did my armour just do something" always has an answer on the sheet.
- [ ] The AI (Slice 14) can author all of it: "armour that burns anyone who hits me" → an armour item
      with a `hit_by_melee` trigger rolling fire damage, in the inventory, working.
- [ ] Tests: a weapon's edits flow to its attack row; an armour's DEX cap is respected by the ledger's
      AC; a trigger fires only on its event and only within its limit; a trigger with no limit is
      flagged; retaliation never mutates another character's sheet.

## Slice 17 — The effect builder: "Add effect" by hand

> "We basically need to create an item, click 'add effect' to it, then select effects and define the
> numbers for those effects."

The AI path (Slice 14) and the manual path must produce the **same `Effect[]`**. If they diverge,
the AI becomes the only way to make a good item and hand-authoring becomes second-class.

- [ ] On any item/spell/feature editor: an **Add effect** button → pick an effect type → fill in its
      numbers. Repeatable; an item holds any number of effects.
- [ ] The picker is **built from the effect vocabulary**, not a hand-written menu, so a new operation
      shows up in the UI automatically and cannot be forgotten. Grouped for humans:
      - *Modify a number* — ability, AC, speed, HP, save DC, initiative, a skill, attack, damage.
        `add` (stacks) or `set` (overrides). **Negative values are first-class** — a cursed item that
        gives −2 DEX is the same machinery as a +2 belt, and the UI must not fight it.
      - *Advantage / disadvantage* — on a named roll.
      - *Grant* — proficiency, expertise, a feature, an attack, a spell, a resource, a sense.
      - *Resistance / immunity / vulnerability* — to a damage type.
      - *Identity* — name, art/token, species, class, subclass, gender, profession, size, pronouns.
      - *Instant* — heal, temp HP, damage, restore a resource. (Fires once on use; see Slice 12.)
      - *Duration* — permanent while worn · while attuned · timed ("12 hours") · until ended.
      - *Trigger* — Slice 15's event actions.
      - *Transform* — Slice 18.
- [ ] Each effect gets a **plain-English preview line** as you build it ("+2 STR while equipped",
      "disadvantage on Stealth"). An effect builder whose output you can't read is how you end up
      with items nobody trusts.
- [ ] **Condition/gating** per effect: unconditional, while equipped, while attuned, or gated on a
      named condition (`raging`, `bloodied`) — the engine's `condition` field, exposed.
- [ ] Validate on save: unknown target → refuse with a reason. Never silently drop an effect; the
      player will believe it works.
- [ ] Tests: every operation in the vocabulary is reachable from the picker (a guard that fails when
      someone adds an operation and forgets the UI); a hand-built item and an AI-built item with the
      same mechanics produce identical `Effect[]`; a negative modifier round-trips.

## Slice 18 — Transform: become a different character entirely

> "maybe a spell turns us into a bear, then we would suddenly have the bear character sheet. We would
> need to be able to end the effect and revert back to our normal character sheet."

Slice 11 overlays *fields*. This overlays the **whole sheet** — and it is the strongest argument for
the overlay rule, because "you are a bear now" must be perfectly reversible.

- [ ] A `transform` effect names a **form**: a stored sheet (a statblock, a creature, another
      character). While active, the sheet **renders the form**.
- [ ] The base character is **never overwritten** — it is the thing underneath. Reverting is dropping
      the source, exactly like any other effect. (If transform mutated the sheet, an autosave
      mid-transform would leave a druid permanently a bear, with their real character gone. This is
      the failure this whole design exists to prevent.)
- [ ] **What carries over is a per-form rule, not a guess.** 5e Wild Shape keeps INT/WIS/CHA,
      personality, and your own features; it takes the beast's STR/DEX/CON, AC, speed and attacks; HP
      is a separate pool and damage overflow returns to you. Other systems and homebrew differ. So a
      form declares its own carry-over policy (`keepMental`, `keepFeatures`, `separateHp`, …) rather
      than the engine hardcoding one game's answer — Ground Rule 1.
- [ ] Forms are **authored with the same builder** as characters (Slice 17) — a form is a sheet. A DM
      can define a bear once and reuse it; a player can be turned into another PC.
- [ ] The Active Effects panel (Slice 12) shows the transform as the source it is, with **End
      transform** — and, per the request, that is how you get back.
- [ ] While transformed, the panel and the star markers (Slice 13) still explain the *form's* numbers,
      so "why is my AC 11" has an answer while you are a bear.
- [ ] Damage taken in form, resources spent in form, and duration are tracked on the form instance,
      not on the base sheet.
- [ ] Tests: transform → the sheet renders the form; the stored base character is byte-identical
      throughout (the anti-"permanent bear" guard); revert restores exactly; carry-over policy is
      honoured per form; a save while transformed does not corrupt the base.

## Slice 20 — Edit everything on the sheet, and mark what's been customized

> "I want to be able to edit attacks and abilities and spells and stuff in the character sheet. If the
> stats are edited, then there should be some kind of marker showing that the thing has been
> customized."

- [ ] **Edit in place**: attacks, abilities/features, spells, resources, skills, inventory items,
      traits. Add · edit · duplicate · delete · reorder. Every one of these already exists as *data*;
      most have no editor.
- [ ] Editing routes through the SAME structured-edit vocabulary the AI uses
      (`applySheetEdits`) rather than a parallel path — one place where a sheet changes, so the audit
      trail (`dnd_sheet_edits`) and the DM's view of "what changed" stay true.

### The customized marker is NOT the star

These are two different facts and the UI must not merge them:

| Marker | Means | Answers |
|---|---|---|
| ★ (Slice 13) | Something is **modifying this right now** | "Why is my STR 22?" |
| ✎ (this slice) | This **differs from its source** — homebrewed or hand-edited | "Is this still the real Fireball?" |

A hand-edited Fireball that nothing is currently buffing has ✎ and no ★. A vanilla STR score under a
Belt of Giant Strength has ★ and no ✎. Same element can carry both. Conflating them produces a
marker that means "something, somewhere, maybe" — i.e. noise the reader learns to ignore, which
costs more than having no marker at all.

- [ ] ✎ appears on anything edited away from its source: a modified official spell, a hand-tuned
      class feature, an attack with adjusted numbers, an off-table ability score.
- [ ] Hovering ✎ shows **what changed** — "Fireball · damage 8d6 → 10d6 (edited by Jacob,
      2026-07-16)" — and offers **Revert to official**. Reuse `summarizeCharacterProvenance`, which
      already distinguishes vanilla / custom / DM-granted content; this is its natural UI.
- [ ] The DM's approval surface (Slice 5) reads the same provenance, so ✎ is also what a DM scans
      when reviewing a sheet. A player quietly editing Fireball to 10d6 must not be invisible.
- [ ] Tests: an untouched sheet has zero ✎; editing a value marks exactly that value; revert clears
      the marker and restores the source value; ★ and ✎ are independent (one never implies the other).

## Slice 19 — Connect it to the rest

- [ ] Spells cast on you land in the ledger as sources (`activeEffects`), so Bless and a potion are
      the same machinery.
- [ ] Forms/transforms (Jack's, the old rage path) become ledger sources rather than bespoke combat
      fields — `formDamageBonus` is a leftover of the Lazzuh era and should be an effect.
- [ ] The Slice 3 character digest reports **ledger-resolved** values plus what's modifying them, so
      the AI rules on your *current* STR 22, not your base 18. Today it reads the raw sheet — after
      Slice 10 that is a bug, and it is the kind that produces a confidently wrong ruling.
- [ ] Realtime: an equip by the DM propagates to the player's open sheet (C11b broadcast already exists).

---

# Appendix A — The effect target catalog

> "A potion might give us a fly speed, or a tunneling speed, or literally anything. Please consider
> it all… The sky and beyond is the limit."

The working-through of *every* effect. This is the **contract**: `lib/dnd/effects/targets.ts` is the
single registry, and the effect-builder picker (Slice 17), the AI's tool schema (Slice 14), the
ledger (Slice 10), and the star tooltips (Slice 13) are all **generated from it**. Adding a target
here makes it authorable, AI-emittable, resolvable and explainable at once — and nothing can drift,
because there is nowhere for it to drift *to*.

Each target declares: its key, its value type, which operations are legal on it, its display group,
and how it renders. "Literally anything" is achievable only if the vocabulary is **data**; a
hand-written menu is what makes a system finite.

**Movement** — `speed_walk` · `speed_fly` · `speed_swim` · `speed_climb` · `speed_burrow`
(the requested tunnelling) · `speed_all` (a blanket modifier) · `hover` (flag) · `ignore_difficult_terrain`.
Movement is not one number, and a potion of flying is not "+speed". Each mode is its own target with
its own base, so a fly speed can exist where a walk speed is 0 (and the sheet shows both).

**Core numbers** — `ability_str|dex|con|int|wis|cha` · `ac` · `initiative` · `hp_max` ·
`hp_temp` · `hit_dice` · `proficiency_bonus` · `spell_save_dc` · `spell_attack` · `carrying_capacity`.

**Rolls** — `attack_roll` · `damage_roll` · `attack_and_damage` · `save_<ability>` · `save_all` ·
`skill_<name>` · `skill_all` · `ability_check_<ability>` · `death_save` · `concentration_save` ·
`initiative_roll`. Operations: `add`, `set`, `advantage`, `disadvantage`, plus `reroll_below` (Great
Weapon Fighting), `minimum_roll`, `crit_range` (19–20 → 18–20), `crit_dice`.

**Defenses** — `resistance` · `immunity` · `vulnerability` (by damage type) ·
`condition_immunity` · `condition_advantage` (advantage on saves vs a named condition).

**Grants** — `grant_proficiency` (skill/tool/weapon/armour/language) · `grant_expertise` ·
`grant_feature` · `grant_attack` · `grant_spell` · `grant_cantrip` · `grant_resource` ·
`grant_spell_slot` · `grant_sense` (darkvision/truesight/tremorsense/blindsight, with a range) ·
`grant_language` · `grant_action` (a new thing you can do).

**Identity** (Slice 11) — `name` · `image` · `token` · `species` · `class` · `subclass` ·
`gender` · `pronouns` · `profession` · `size` · `creature_type` · `alignment`.

**Instant** (Slice 12; fires once, leaves nothing) — `heal` · `temp_hp` · `damage` ·
`restore_resource` · `restore_slot` · `remove_condition` · `apply_condition` · `set_hp`.

**State** — `condition` (apply/suppress) · `exhaustion` · `concentration` · `inspiration`.

**Economy** — `attunement_slots` · `action_count` · `bonus_action_count` · `reaction_count` ·
`attacks_per_action` · `spell_slots_<rank>`.

**Meta** — `transform` (Slice 18) · `trigger` (Slice 15) · `note` (DM-adjudicated, no mechanics —
the honest escape hatch, and it must exist: an effect the engine can't model should be *labelled as
such*, not faked with a number that looks authoritative).

**Rules that fall out of the catalog:**

1. Every numeric target supports **negative** values. A cursed item is not a special case.
2. Every target must render **somewhere** on the sheet, or it is a lie. A target with no home is not
   done — that is the entire lesson of the current codebase, where a complete effects engine sits
   unread because nothing renders it. **`grant_sense` and `speed_burrow` need places to live before
   they can be granted.**
3. `set` vs `add` is per-target and documented (Storm Giant Strength *sets* STR to 29; a belt *adds*).
4. Unknown target → the edit is refused with a reason. Never coerced, never silently dropped.
5. A target the engine cannot faithfully model gets `note`, not an approximation.

# Appendix B — Item type catalog

Per the request, **category is cosmetic**; mechanics are the item. A "boot" and a "pendant" differ
only by icon and slot. So the type list exists for filtering and for sane defaults, and never gates
what effects an item may carry:

`weapon` · `armor` · `shield` · `clothing` · `potion` · `scroll` · `wand` · `staff` · `rod` ·
`ring` · `amulet` · `belt` · `boots` · `gloves` · `cloak` · `helm` · `tool` · `instrument` ·
`ammunition` · `container` · `focus` · `trinket` · `treasure` · `food` · `poison` · `tattoo` ·
`vehicle` · `tech` · `cyberware` · `relic` · `quest` · `other`.

Orthogonal to type, and where the mechanics actually live: `slot` (what it occupies) ·
`equippable` · `attunable` · `consumable` · `charges` (+ recharge rule) · `cursed`
(can't be removed without help — a real mechanic, not flavour) · `stackable` · `weight` · `value` ·
`rarity` · `requirements` (a prerequisite to use it at all).

# Appendix C — The AI's write path

> "hook the AI up to it all so that it can create items for the players… It should be able to
> actually input items into the character's inventory."

- The AI's tool schema is **generated from Appendix A**, so it can emit any effect the engine
  supports and — importantly — *cannot* emit one it doesn't. The schema is the guardrail; this is
  why "the AI made no edits" was the schema working, and why widening it is the whole fix.
- It **writes** through `applySheetEdits` → the item lands in the real inventory, equippable and
  usable. Not a suggestion, not a chat message describing an item.
- The DM can generate items **onto a player's sheet** (they already have write access via
  `getCharacterAccess`); a player generating for themselves routes through the existing
  provenance/approval surface. No new permission model — the one that exists is correct.
- Every AI write is audited (`dnd_sheet_edits`) and marked ✎ (Slice 20), so nothing the AI adds is
  indistinguishable from something the player earned.
- The AI reads the ledger (Slice 19), so "make me something to fix my bad AC" can reason about the
  actual current AC and what is already modifying it.

---

## Known gaps / notes for whoever picks this up

- **`VOYAGE_API_KEY` is absent**, so all semantic search returns nothing. Keyword search
  (`lib/dnd/library.ts`, `keywordSearchSystemEntries`) is what actually runs today. `ANTHROPIC_API_KEY`
  IS present, so the AI works.
- **Storage-policy seeds** (102, 290, 295) need table ownership and can only be applied from the
  Supabase dashboard. 7 more seeds fail as "policy/trigger already exists" — harmless.
- **Uncertain rules flagged by the authoring agents** (worth a second source before release):
  Warlock invocations-known progression; Wizard Spell Mastery's swap clause; Great Old One
  Clairvoyant Combatant's limit; Monk Warrior of the Elements details; Starfinder
  Fatigued/Exhausted magnitudes and Grappled/Pinned penalties; Envoy expertise die thresholds.
- **`spellsKnown` currently carries prepared counts** for 2024 preparers. Consider renaming to
  `spellsKnownOrPrepared`. The 2024 Ranger/Paladin/Cleric/Druid prepared counts are prose in
  `preparedRule`, not structured — promote them if the builder needs the numbers.
- **"Rank" vs "level" for spells**: the codebase says rank (UA wording); the printed 2024 PHB says
  level. A sitewide rename if player-facing accuracy matters.
- **`SubclassDefinition.alwaysPrepared`** can't express Circle of the Land's four terrain lists —
  they're in the feature body instead.
