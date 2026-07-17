# Blockers — what only you can unblock (as of 2026-07-17)

The three docs in `in-progress/` are each ~90% shipped. Everything that could be built, tested, and
verified autonomously **is** — the full app test suite is green (13,079 passing). What remains in all
three is genuinely gated on your input: **decisions only you can make, content only you/Brendan have,
and things that need eyes on a running app or a device build.** This memo consolidates every one of
those into a single checklist so you can spend your input where it unblocks the most, then hand it back.

Each item names the exact code impact and where it's detailed. None of these were guessed or faked —
attempting them without your input would either violate a ground rule (fabricating rules text) or
overwrite a deliberate design.

---

## A. Decisions (each converts directly to shipped code)

- [ ] **Attunement-alone activation.** Should an item that's *attuned but not worn* apply its effects?
      Today the ledger says no (equipped-only); the older `collectItemEffects`/`deriveAc` paths say
      equipped-OR-attuned — they disagree. Your call picks one predicate for all three.
      *Detail: `DND_RULES_PLATFORM` Slice 10 "OPEN FINDING"; pinned by `ledger-attunement.test.ts`.*
- [ ] **Weak-form stat replacement.** By D&D RAW, Wild Shape *replaces* physical stats even when lower
      (a STR-20 druid becomes a STR-2 rat). Today `set` uses `Math.max(base, override)`, so a weak form
      can't lower you — deliberate for items (a lesser belt mustn't lower a stronger hero), wrong for forms.
      Your call: give form-sourced `set` replace-semantics while items keep max?
      *Detail: `DND_RULES_PLATFORM` Slice 18 "OPEN FINDING"; pinned by `ledger-set-max.test.ts`.*
- [ ] **Feat ability increase (+1) auto-apply.** Taking a feat like Resilient enforces legality but does
      NOT raise the ability score — that's left manual today (tested at `levelup.test.ts:190`). Do you want
      the builder to prompt for which ability the feat's +1 targets and apply it? (A real feature: capture
      the choice + apply it; changes a currently-deliberate behavior.)
- [ ] **Rangor / Pugilist.** Make them real custom class + subclass through the Slice-5 homebrew builders,
      or keep them as hand-authored `system: ambiguous` sheet data?
      *Detail: `DND_RULES_PLATFORM` Slice 7.*
- [ ] **Intuitive Games class-vs-subclass taxonomy.** The site is 4 parent classes (Archon/Conduit/Fighter/
      Wizard) with subclasses; the app models a flat 13-class list. Restructure to match the site? (Touches
      the IG builder, provenance, and seeds.)
      *Detail: `INTUITIVE_GAMES_FULL_BUILDOUT`; `SITE_MASTER.md` item 3.*

## B. Content only you / Brendan have (paste it and I fill it in)

- [ ] **26 Intuitive Games power effect texts** — the powers shown as "work in progress" in-app today.
      Exact list is enumerated + guarded in `docs/reference/intuitive-games/SITE_MASTER.md` item 1
      (and `ig-content-gaps.test.ts`). Paste each power's Description/Advanced/Expert text.
- [ ] **9 off-roster IG powers to reconcile** — app carries them, the current site roster doesn't; confirm
      dropped or give current names. Also in `SITE_MASTER.md` item 1.
- [ ] **Per-class feature ladders (IG)** — full level 1–10 progression + power effect text per class, incl.
      Champion / Magician / Shaman (no detail on the fetched page). `SITE_MASTER.md` item 2.
- [ ] **Other IG unpublished content** — combat-skill mechanics beyond Dirty Trick, named weapons,
      equipment/tools tables, FAQs, companion combat rules, Sprite/Human race art. `SITE_MASTER.md` items 4–11.

## C. Needs eyes on a running app, or a device build

- [ ] **Map studio: city-lights/lava terminator.** The plumbing is correct + guarded; the sun-angle so the
      night-side glow shows needs the shader's light convention read + eyes on the preview.
      *Detail: `DND_RULES_PLATFORM` Slice 29.*
- [ ] **Form-editor UI** (author an arbitrary foreign statblock as a form) — the only heavier half of
      transform left; `Forms.tsx` is display+toggle today. *Detail: Slice 18.*
- [ ] **Mobile upload runtime** — every decision in the capture→save→send→drain→notify→delete flow is a
      pure, tested function; the Expo runtime (background upload task, MediaLibrary, notifications, the queue
      screen) can only be built + verified on real iOS/Android by you. *Detail: `SURVEYING_WORKMODE` Area C.*

---

## What's NOT blocked (already done)

For context, so this list reads as "the tail," not "the work": the effect ledger + transforms + identity/
grant overlays + consumption, the rules-legal level builder (feat eligibility, ASI caps, prerequisites),
the full Intuitive Games system (every mechanic displayed, hover-explained, and editable with identical
sheet/builder/AI parity, WIP honestly labeled, mechanics guarded against text drift), the Work Mode hub's
decision layer, and the currency/calculator/media helpers — all shipped, tested, and green.
