# Character-sheet settings overhaul — complete, per-system preference management

**Status:** IN PROGRESS · started 2026-07-22

**Owner decisions (answered 2026-07-22):** scope = **per character** · location = **gear-icon modal** ·
expose = **5e rules variants + PF2 rules variants + IG rules variants + display/roller prefs**. The new
template/theme/style/roller choices stay in the top chip block (not the gear modal) — the gear modal is
for RULES + prefs. IG specifics to be confirmed as they're wired (owner will note house rules).

**Full target matrix (owner 2026-07-22):** 4 sheet templates × 4 dice-roller templates × 5 sheet styles
× 5 colour themes, ALL working with each of the 4 systems. (Templates×systems ✓ done; 5 themes universal
✓ U-1; rollers×systems = the roller-overhaul doc; styles×templates×systems = shell bridge + light-skin
fix, to be swept in QA.)

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

## Resolved: a per-character GEAR-ICON MODAL, organised by system

A gear icon (owner/DM only, `canWrite`) opens a settings modal for THIS character, with a section per
relevant system exposing its rules variants + shared display/roller prefs, each showing the current
value and editable. Candidate options to wire (confirm/trim per system as built): **5e** — rest/long-
rest healing variant, encumbrance, flanking, feats on/off, multiclass, death-save house rules,
inspiration style; **PF2** — proficiency-without-level, free archetype, automatic bonus progression,
stamina, hero-point count; **IG** — its house-rule toggles (owner to specify); **display/roller** —
dice style, record mode, default roller template + animation, default theme/style.

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
