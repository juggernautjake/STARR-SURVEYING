# Per-system template completeness — every template shows ALL and ONLY its system's mechanics

**Status:** IN PROGRESS · started 2026-07-23

## Owner ask (verbatim intent)

> Make each system's character sheet show only and all of that system's mechanics, on EVERY template
> (Classic / Codex / Dashboard / Play) and EVERY style (Hextech / Neon Odyssey / Magical Streamer /
> Candy Bazaar / Homebrew Rulebook) + theme. Concretely: on the IG sheet I can't view or change my
> STANCE on some templates, and it "resembles the D&D sheets". Go through literally every tab / section /
> element of every template for every system; confirm with Playwright + OCR; ensure each element
> corresponds to the CURRENT system with no leftovers from other rule systems, and that a chosen style
> actually applies. Build a full planning doc and work it slice by slice until done.

## Architecture (ground truth — verified in code)

**FORMAT = shell, SYSTEM = panels.** Each system exposes its OWN ordered `SheetPanel[]`:
`useFivePanels` (5e-2014/2024), `usePf2Panels` (PF2), `useIgPanels` (IG). Each format is a pure shell
(`CodexShell` / `DashboardShell` / `PlayShell`; Classic = the sheet's own root) that only ARRANGES that
system's panels — it renders nothing system-specific. Verified: the shells hardcode **no** mechanics
terms (no "AC", "spell slot", "stance", etc.); PF2/IG import only the generic `SheetPanel` TYPE from
`fivePanels.ts`, not any 5e content. **So literal cross-system bleed is structurally prevented** — a PF2
sheet renders PF2 panels, an IG sheet renders IG panels. This initiative is therefore mostly
VERIFICATION + per-system COMPLETENESS/PROMINENCE, not a rewrite.

Where a real gap CAN exist:
1. **Buried signature mechanics** — a system's defining, always-relevant mechanic isn't surfaced on
   every template (IG STANCE was only in Combat, gated + not in the identity/hero → invisible/uneditable
   on Codex/Play). This is the "resembles D&D" complaint.
2. **Identity-column / Play-hero panel choice** per system — the sheet component hardcodes which panels
   go in the Codex/Dashboard identity column and the Play hero. Wrong/thin choices make a template feel
   generic or drop a key panel from the at-a-glance area.
3. **Default-open Codex panes** — must include the system's most-used panels.
4. **Style/theme application** — every `--hx-*` token + skin class must resolve on each bespoke sheet so
   a chosen style/theme visibly changes font + texture + colour (not colour alone).

## Method

- Playwright with a minted owner session (`AUTH_SECRET`-signed `dnd_session`; Jacob owns the 2014/PF2/IG
  test chars, see below). Per system × template: `get_page_text` / OCR the rendered sheet, screenshot,
  and (a) diff the visible mechanics against that system's known mechanic set, (b) scan for any FOREIGN
  system's signature terms, (c) confirm each style swaps font/texture/colour.
- Test chars: Perrin Underbough (2014, `…414`), Stubb (2024, Jack-owned public `1a22…c6`),
  Orin Sallowmere (PF2 Wizard L9, `…f09`), Vashti Kelln (IG Fighter L6, `…e06`).
- Restore any DB layout/style writes after each pass (a live tab re-POSTs the picker).

## System signature-mechanic checklists (what "complete" means)

- **D&D 5e (2014 & 2024)**: AC, HP + Hit Dice, 6 abilities + saves, skills w/ proficiency, Proficiency
  Bonus, Inspiration, conditions, Death Saves, spell slots + prepared/known, class features, feats/ASI,
  attunement. 2024 differs from 2014 (weapon mastery, new backgrounds/species) — must not show the other
  edition's exclusive rules.
- **Pathfinder 2e**: AC, HP, 6 attributes, 3 saves (Fort/Ref/Will) w/ proficiency RANKS (U/T/E/M/L),
  Perception, Class DC, Spell DC + attack, Strikes (MAP), skills w/ ranks, the three-action economy,
  Hero Points, focus points/spells, conditions, feats by type (ancestry/class/skill/general).
- **Intuitive Games**: NO AC (by design). HP (class+bg, lethal/nonlethal), 3 saves (Fort/Ref/Will),
  Proficiency, STANCES (one active — view + change), CONDITIONS, Powers (IG spells), the three-action
  economy reference, Defensive Power (reaction), DR, ability scores, skills (general + combat),
  feats (general/combat), companion, ancestry traits.

## Slices

### S0 — IG stance + conditions surface on every template (DONE 2026-07-23)
- [x] Lifted the active-STANCE control (view banner + change selector + mechanic note) and the CONDITIONS
  control (chips + add/remove + penalty summary) out of the `hasCombat`-gated Combat panel into the
  always-present **Vitals** "In Play" block. Vitals leads every format and sits in the Codex/Dashboard
  identity column and the Play hero, so stance is now visible AND changeable on Classic/Codex/Dashboard/
  Play. `hasCombat` no longer gates on stance/conditions. Tests updated + green.

### S1 — Browser audit: capture the truth for every system × template (DONE 2026-07-23)
- [x] Playwright text+screenshot sweep of 2014 / PF2 / IG × classic/codex/dashboard/play (owner session).
  Findings: IG stance/conditions now present on ALL four templates (S0 verified — `currentlyIn:true`
  everywhere, incl. Play + Codex identity column). Cross-system term scan came back CLEAN except two
  substring/prose false positives on `2014/dashboard` (`stance` ⊂ "di**stance**" in a feature blurb;
  `untrained` is incidental catalog prose, not in the char data, dashboard-only because all panels
  expand). No structural bleed — matches the code-level check (S4).

### S2 — Per-system identity/hero panel review (pending S1)
- [ ] Confirm the Codex/Dashboard identity column and the Play hero hold the RIGHT at-a-glance panels for
  each system (5e: identity/defenses; PF2: attributes+defenses / defenses+strikes; IG: vitals+abilities /
  vitals+combat). Fix any that drop a signature panel or read generic.

### S3 — Default-open Codex panes per system (pending S1)
- [ ] Ensure `CodexShell`'s default-open set (skills-first + next) lands each system's key panels; adjust
  the skills-like matcher / order if a system opens the wrong first panes.

### S4 — Cross-system bleed verification (DONE 2026-07-23)
- [x] Code check: shared shells hardcode no mechanics terms; PF2/IG import only the generic `SheetPanel`
  TYPE. Browser text sweep: no foreign-system mechanic labels/sections on any system × template (the two
  `2014/dashboard` hits were substring/prose false positives, see S1). Clean.

### S5 — Style × theme application per system × template (pending S1)
- [ ] Confirm each of the 5 styles changes font + texture + colour and each theme recolours, on every
  system × template — not colour alone. Guardrail: `theme-contrast.test.ts` + the CS-1/CS-2 bridge.

### S6 — 2014 vs 2024 edition separation
- [ ] Confirm the 2014 sheet shows no 2024-exclusive rules and vice-versa (edition-bleed suite already
  guards data; verify the sheet surface too).

## Done means
Every (system × template × style × theme) renders that system's full mechanic set, nothing from another
system, with the chosen style/theme visibly applied — confirmed by the Playwright/OCR sweep.
