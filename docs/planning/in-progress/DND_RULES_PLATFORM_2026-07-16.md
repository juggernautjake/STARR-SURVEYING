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

## Slice 3 — AI situational adjudication

The chat can already answer rules questions. It must also rule on *this character in this moment*.

- [ ] Pass character context into `POST /api/dnd/library/chat` (already accepts `characterId`):
      load the sheet, build a digest (class, level, features, conditions, resources, gear).
- [ ] Adjudication prompt: given the character + the grounded rules, answer questions like
      "can I cast this while grappled?", "does my feat apply here?", "what happens if I shove a
      creature two sizes larger?". It must reason to a ruling, cite the rule it used, and say
      plainly when the rules genuinely don't settle it (then suggest a DM call).
- [ ] Mount the chat on the character sheet with the character's system pinned.
- [ ] Tests: the prompt carries the character digest; the cross-system hint still fires; the
      chat refuses to invent a rule.

**Done when:** on Jack's sheet you can ask "can I use Cross Counter while grappled?" and get a
grounded, character-aware answer.

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
