# Character-sheet settings overhaul — complete, per-system preference management

**Status:** IN PROGRESS · started 2026-07-22 · NEEDS OWNER INPUT (see S-1)

## Owner ask (verbatim)

> Make sure the character sheet settings are totally built to include everything and make it possible to
> manage everything that we have built for all systems. Do a complete overhaul of the settings page for
> each game system to make sure we have all of the setting options we need and to make sure we have set
> all of our preferences for each system correctly. There will probably be specific preference settings
> for each system. Go through and check and ask me if you have questions.

## Current state (from a first pass)

- There IS a preferences system: `lib/dnd/preferences.ts` (`EffectivePreferences`, `resolvePreferences`,
  `DEFAULT_CAMPAIGN_PREFERENCES`), a DM surface `CampaignPreferencesDm.tsx`, and the sheet consumes
  `preferences` (Areas P/M/E/R/D) to drive configurable mechanics + the dice style. It is CAMPAIGN-DM ∩
  PLAYER, not a per-character per-system "settings page."
- There is NO single per-character, per-system "settings" panel that surfaces every toggle we've built
  (vanilla/custom rules, rest variants, record mode, dice style, module toggles, the new template/theme/
  style/roller choices, exhaustion variant, etc.). Those are scattered across the sheet + campaign prefs.

## Open questions for the owner (S-1) — please answer before the build

1. **Scope**: should "settings" be a per-CHARACTER panel (this character's options) or per-CAMPAIGN
   (DM rules for everyone), or both surfaced together?
2. **System-specific settings**: what specific options do you want PER system? Some candidates we could
   wire — 5e: rest variant (long-rest healing), encumbrance on/off, flanking, feats-on/off, multiclass,
   inspiration style, death-save house rules; PF2: proficiency-without-level (variant), free-archetype,
   automatic-bonus-progression, stamina, hero points count; IG: [its own house rules]. Which do you want?
3. **Where** should the settings page/panel live — a modal from a gear icon, a tab, or a page-chrome
   section like the pickers?
4. Should the new **template / theme / style / roller** choices (from the other in-progress docs) live
   inside this settings panel too, or stay as the top chip block?

## Slices (shape; finalised after S-1)

**Legend:** `[x]` shipped · `[~]` in progress · `[ ]` not started.

- [ ] **S-1 — audit + owner decisions.** Inventory EVERY existing toggle/preference across the sheet +
  campaign prefs for each system; list what's missing per system; get the owner's answers to the
  questions above. Output: the concrete per-system settings spec that the following slices build.
- [ ] **S-2 — settings model + endpoint.** A per-character (and/or per-campaign) settings blob + a
  gated endpoint to read/write it, defaulting so existing characters are unchanged.
- [ ] **S-3 — the settings UI** (location per S-1 answer), organised BY SYSTEM so each system shows its
  own relevant options with the current value, editable, highlighted-active where toggle-like.
- [ ] **S-4 — wire each setting to the mechanic it controls**, per system, and verify it takes effect.
- [ ] **S-5 — QA**: every system's settings render, persist, and drive their mechanic; record + move to
  `completed/`.

## Done means
- A clear per-system settings surface that exposes and manages every option we've built, correct
  defaults per system, everything wired to its mechanic. Standing bar green per slice.
