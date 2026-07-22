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

## DM campaign override (owner 2026-07-22)

A DM can HARD-LOCK a character's settings **only for the version of that character inside his campaign**.
The SAME character accessed OUTSIDE the campaign (the owner's lobby / character list) keeps full owner
control. So: campaign settings OVERRIDE character settings when the character is viewed inside the
campaign, and the DM needs a per-CAMPAIGN settings/preferences page carrying all the same options (this
extends the existing `CampaignPreferencesDm` to cover everything). Effective settings = campaign-locked
values (inside a campaign) ∨ the character's own values (outside) — the character's own are never
mutated; the campaign lock is an overlay applied only in the campaign context.

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

- [x] **S-1 — audit + owner decisions.** Done: the owner's answers are captured at the top (per-character
  gear modal; 5e + PF2 + IG rules variants + display/roller prefs; DM campaign override). Audit outcome:
  there IS a mature `EffectivePreferences` model (`CampaignPreferences ∩ PlayerPreferences`, 10 settings:
  autoMechanics, exhaustion/long-rest models, equip limits, dice style, record mode, autoAttune,
  featAutoApply, shapeshiftStats, downedDamageModel) with `resolvePreferences` honouring DM `playerCanChoose`
  locks — but the PLAYER side was never stored OR plumbed (page.tsx resolved campaign-only), and a
  system-specific block (PF2/IG rules variants) is not yet in the model. So S-2 wires the player side first;
  S-3/S-4 add the per-system rules blocks.
- [x] **S-2 — settings (player-preferences) model + endpoint.** `PlayerPreferences` now persist on
  `data.playerPreferences` via a new `/api/dnd/characters/[id]/preferences` endpoint (twin of `/layout`,
  `/roller`; owner/DM-gated; `normalizePlayerPreferences` drops junk). `page.tsx` reads them and folds them
  into `resolvePreferences` in BOTH paths — inside a campaign (DM lock still wins) and outside (player's
  choices over the vanilla baseline) — defaulting so existing characters are unchanged. **En route this
  uncovered + FIXED a real pre-existing wiring bug**: `SheetRoot`'s MAIN sheet branch never forwarded
  `preferences` to `CharacterProvider` (only the custom-interactive branch did), so campaign AND player
  preferences never reached a normal sheet's store — every configurable rule silently used its vanilla
  default. Browser-VERIFIED: a player `diceRollerStyle: 'rugged'` now drives the live roller
  (`data-dice-style="rugged"`); was stuck on the campaign/vanilla default before. Strengthened the wiring
  anchor test to require EVERY `CharacterProvider` to forward preferences (the old anchor matched one branch
  and missed this). 33 preference tests + tsc + eslint green.
- [x] **S-3 — the settings UI (gear-icon modal).** New `CharacterSettingsModal` — a ⚙ Settings button
  (owner/DM only), mounted at the PAGE level beside the Style/Template pickers so it works for EVERY system,
  opens a modal organised into "Display & roller" and "Rules" sections. Each control shows the EFFECTIVE
  value with the DM lock honoured (a locked setting is disabled + marked 🔒 "set by your DM"); an unlocked
  one offers "Follow campaign (<current>)" plus each option, and enums/bools both use a select. Saving
  POSTs the full player-preferences object to `/preferences` (S-2) and reloads. The option/help/order
  metadata was extracted into ONE shared catalog `lib/dnd/preference-options.ts` that BOTH this modal and
  the DM's `CampaignPreferencesDm` now read (the DM panel refactored to import it), so the two lists can't
  drift; the panel's source-anchor test was repointed at the catalog. Browser-VERIFIED on Perrin: the gear
  opens a 10-control modal (2 display + 3 bool + 5 rules); choosing "Rugged" for the dice style saved and
  drove the live roller (`data-dice-style="rugged"`). tsc + eslint + 5 panel tests green.
  - NOTE: this surfaces the 10 existing cross-system/5e preferences. The PF2/IG-SPECIFIC rules variants
    (proficiency-without-level, free archetype, IG house rules, …) are new model fields that land with S-4.
- [ ] **S-4 — wire each setting to the mechanic it controls**, per system, and verify it takes effect.
- [x] **S-DM — DM campaign settings/preferences page + the override resolver.** Mechanism complete:
  `CampaignPreferencesDm` (the DM's per-campaign page, wired into the DM campaign controls) carries EVERY
  option the per-character modal has — both now read the one shared `preference-options.ts` catalog, so
  they cannot drift — each with its "players may choose" lock. The override is a RESOLVE-TIME OVERLAY, not a
  mutation: `page.tsx` folds the campaign's locked values over the character's own `playerPreferences` via
  `resolvePreferences` when `character.campaign_id` is set (in-campaign context), and over the vanilla
  baseline (owner's own choices win) when it isn't (the lobby original is a campaign_id-null row; the
  campaign holds its edited copy on `dnd_campaign_characters.data_override`). The character's own settings
  are never touched — the lock only clamps at resolve time. This became REAL once S-2 fixed SheetRoot to
  actually forward preferences to the sheet. Browser-VERIFIED: locking `longRestModel=gritty`
  (playerCanChoose:false) on Perrin's campaign made the character's gear modal show "Long rest 🔒 set by
  your DM" — disabled, showing the DM's value — so the player cannot override it in-campaign, while the
  same setting stays theirs to choose outside a campaign. Guard test added; tsc + eslint green.
- [ ] **S-5 — QA**: every system's settings render, persist, drive their mechanic, and the DM lock/
  override behaves correctly in vs. out of campaign; record + move to `completed/`.

## Done means
- A clear per-system settings surface that exposes and manages every option we've built, correct
  defaults per system, everything wired to its mechanic. Standing bar green per slice.
