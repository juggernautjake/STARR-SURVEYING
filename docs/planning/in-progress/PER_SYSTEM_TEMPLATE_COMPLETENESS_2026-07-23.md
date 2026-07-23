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
- [x] Added an always-present **Vitals "In Play"** block carrying the active-STANCE control (view banner +
  change selector + mechanic note) and the CONDITIONS control (chips + add/remove + penalty summary).
  Vitals leads every format and sits in the Codex/Dashboard identity column and the Play hero, so stance is
  visible AND changeable on Classic/Codex/Dashboard/Play. **Per owner ("controlled from the combat tab
  too"), the stance + conditions controls ALSO remain in the Combat tab** — same active stance, editable
  from either place; Vitals is what guarantees every template surfaces it. Verified in Playwright:
  `currentlyIn:true` on all four templates. Tests updated + green.

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

### S7 — PF2 sheet completeness gaps (from the 2026-07-23 audit — REAL, several severe)
Two subagent audits found the stance-class bug is NOT unique to IG. PF2 has several always-relevant
mechanics with server ops but missing/buried UI. Ordered most-severe first:
- [x] **S7a — HP editable (damage/heal/temp) (DONE 2026-07-23).** Added a −Damage / ＋Heal / Temp control
  (amount input) to the PF2 Defenses block, posting the existing `apply_damage`/`heal`/`set_temp_hp` ops via
  `postEdit`→`/pf2-edit`. Defenses is in the identity column + Play hero, so HP is now editable on every
  template. Verified in Playwright: control renders, POST round-trips (`200 "Took 3 damage" currentHp:72`).
- [x] **S7b — Dying / Wounded death track renders + settable (DONE 2026-07-23).** Added a Dying (0–4 pips)
  + Wounded (value) row to the PF2 Defenses block with ▲▼ steppers posting `set_dying`/`set_wounded`, shown
  when a value is set OR to an editor (with rules tooltips). Defenses is in the identity column + Play hero,
  so the death track is now visible/settable on every template. Verified in Playwright: stepper round-trips
  (`200 "Now Dying 1"`, persisted).
- [x] **S7c — Conditions add/remove/adjust from the sheet + ungate (DONE 2026-07-23).** Panel was gated on
  `hasConditions` (hidden until one existed) and view-only. Now `show: hasConditions || canDoEdit` (+ nav
  anchor), with a "+ add condition…" select (from `PF2_CONDITION_MECHANICS`), a ✕ remove, and ▲▼ on valued
  conditions — all posting the existing `set_condition` op (value 0 removes). Verified in Playwright: add
  round-trips (`200 "Now Frightened 1"`, persisted). pf2-panels test updated.
- [ ] **S7d — Hero Points** (currently absent model→op→UI): add `heroPoints` to `PF2Character`, a
  `set_hero_points` op, and a view + spend/gain control in Defenses (surfaced on every template).
- [ ] **S7e — Focus Points pool** (untracked): add `focusPoints`/`focusPointsMax` to `PF2Spellcasting`,
  a set/spend/Refocus control in the Spells panel; focus spells are flagged but uncastable without it.
- [ ] **S7f — promote conditions into the Codex/Dashboard identity + Play hero when present**, so active
  penalties are visible while fighting (not one collapsed drawer away).
- [ ] **S7g — skill actions** (Trip/Grapple/Demoralize/Feint/Recall Knowledge…) — lower priority reference.

### S8 — IG sheet completeness gaps (from the 2026-07-23 audit)
Stance + conditions are fixed (S0), but the audit found more of the same pattern:
- [x] **S8a — Defensive Power lifted out of the `hasCombat` gate.** Added the `set_defensive_power` control
  to the Vitals "In Play" block (beside stance/conditions), so it's available on every template; still shown
  in Combat too. (DONE 2026-07-23)
- [ ] **S8b — Attacks have no add/edit/remove UI** on any template — the ops (`add_attack`/`update_attack`/
  `remove_attack`) and `IGElementEditor` `kind:'weapon'` exist but are never invoked. Wire a `＋ add weapon`/
  `✎`/`×` set into the Combat attacks table, mirroring the Powers panel.
- [x] **S8c — Ability scores are drawer-only on Play.** Added `ig-abilities` to the Play `heroIds` so a
  player can roll/set an ability at the table without opening the drawer. (DONE 2026-07-23)
- [ ] **S8d — three-action economy double-collapsed on Codex** (low): open the `<details>` by default or
  add `ig-reference` to the Codex default-open set.
- [ ] **S8e — nonlethal damage not settable** (low): add a nonlethal toggle beside the HP damage control.

## Done means
Every (system × template × style × theme) renders that system's full mechanic set, nothing from another
system, with the chosen style/theme visibly applied — confirmed by the Playwright/OCR sweep.
