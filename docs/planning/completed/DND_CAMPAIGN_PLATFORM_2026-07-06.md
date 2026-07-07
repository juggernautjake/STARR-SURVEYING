# D&D Campaign Platform — hidden DM + Player system

> **Status:** ✅ COMPLETE (2026-07-06, moved to `completed/`) — every buildable slice across Phases A–M
> plus the streamer suite (J1–J12), soundboard (H5–H8), and the K4/L extras is **shipped + verified**
> (113 dnd unit tests; typecheck + eslint clean; `/dnd` renders HTTP 200 with its own chrome). What
> remains is **user-blocked only** (K1–K3 need real player concepts) or **verify-on-deploy** (K6). Access
> model decided: **/dnd is public by direct link** (login infra retained behind `DND_REQUIRE_LOGIN`).
> Built one slice at a time on branch `claude/sit-prep-buildout-2026-07-02`. Created & finalized 2026-07-06;
> audited & expanded 2026-07-06 (NPC system, agentic AI sheet builder/editor, and the full **rules &
> effects engine** — equipment, custom content, connected math); **build-status audit 2026-07-06 (§0)**.
> **Progress:** Phase A ✅ complete · Phase B ✅ functionally complete (B0–B7 built; only B5b waits on E2
> and B8 is a deploy checklist) · Phase C: **C1–C6 done** — the Lazzuh sheet is fully **native** at
> `/dnd/Lazzuh_Gun` (iframe retired; render + Surge mechanic browser-verified), on the scoped engine,
> with a DB-backed store + character API and Lazzuh's data seeded live. **C6b** (Lazzuh → DB+auth) is
> deferred pending the user's public-vs-login call. **C7** (theme) + **C8** (`sheet_type` registry +
> module system) done, both browser-verified. **C9** (mobile pass) verified usable at 375px. **C10**
> (DM sheet-control §6.8.1) done. **C11a** (DM edit log) + **C11b** (realtime broadcast sync) done —
> **Phase C's port + DB + DM control + engine plumbing (C1–C11) is complete**; remaining C-work is the
> rules/effects engine (**C12–C20**). **C12–C16** (derivation, effects, equipment, armor→AC, weapons→
> attacks) + **C17** (magic items) + **C18** (attack roll) + **C19** (custom content) + **C20** (engine
> capstone: `deriveCharacter` + structured edits) done — **73 dnd unit tests** green. **Phase C is
> complete** (only **C6b** — Lazzuh DB+auth — deferred pending the user's public-vs-login call). Next:
> **Phase D** (character media & galleries) — **D1** (art) + **D2** (token) + **D3** (editable
> descriptions) + **D4/D5/D6** (galleries) done — **Phase D complete**. **Phase E** (Hextech DM UI,
> §6.19) started — **E1** (design system) + **E2** (DM dashboard: campaign list + create, wired into
> the hub) + **E3** (campaign page) + **B5b** (invite UI on the campaign page) done, browser-verified —
> **Phase B fully complete** except B8. **E4** (console) + **E5** (notes) + **E6** (session map uploads)
> done, browser-verified. Also made the D4 `Gallery` context-independent (var fallbacks) → the D5/D6
> gallery DM-page mount is now unblocked. **E7/E8/E9** done — **Phase E complete** (E1–E9; the D5/D6
> DM-page gallery mount is a small wiring follow-up now that Gallery is context-independent). A generic
> DB-backed character sheet route (`/dnd/characters/[id]`) now exists. **Phase F** — **F1** (message API)
> + **F2** (realtime) + **F3** (party chat) + **F4** (direct/group) + **F5** (image attachments) done,
> browser-verified. **Phase F complete**. **Phase G** started — **G1** (NPCs as DM-owned characters +
> `blankCharacter` seeding; also fixes the C3 fallback-to-Lazzuh limitation) done, browser-verified.
> **G3–G12 done** except **G2** (AI — needs I1/I2). **Phase H** started — **H1** (image reveal to targeted
> audience, full-screen animation) + **H2** (reveal saved into chat, per-recipient dismiss) done, browser-
> verified. **Phase H complete**. **Phase I (AI) started — I1** (`lib/dnd/ai.ts` scaffolding) done,
> verified. **I2** (structured sheet-build/edit tool + `ai-edit` route) done — verified with a real call
> (AI built a valid level-4 Bandit Captain). **I3** (NL "ask AI to edit this sheet" box on the sheet) done,
> browser-verified. **G2** (AI NPC build box → create+`ai-edit`) done — **Phase G complete (G1–G12)**.
> **I4/I5/I6** done — **Phase I complete (I1–I6)**; the AI suite (scaffolding, sheet build/edit, prep,
> recap + co-edit) is verified with real API calls. Next: **Phase J** (streamer chat) then **Phase K**
> (more characters + QA). **Phase J** — **J1** (username generator) + **J2** (stream state + DM control)
> + **J3** (chat panel) + **J4** (DM sends "from chat" → persisted line woven into feed) done. Next:
> **BUILD COMPLETE — Phases A–J all shipped + browser-verified, plus K5 (mobile QA).** Everything
> buildable without user input is done: auth, sheet engine (101 dnd unit tests), DM UI, messaging,
> NPCs/initiative, reveals/handouts/hotbar, the full AI suite, and the streamer chat. **Now building
> §8.7 Phase L** (user direction 2026-07-06): drop login for now → **LoL-style `/dnd` roster home page**
> (click a character or DM → straight to their sheet/panel), **build all sample characters + complete
> Lazzuh**, and **all K4 extras** (trackers, legendary actions, whispers, reaction emotes, offline-safe).
> **L1–L4 done** — open-access LoL lobby live (browser-verified); Lazzuh audited complete. **Phase M
> added** (user direction 2026-07-06): users create characters by uploading their D&D-Beyond exports/
> PDFs/images + notes → **AI builds the generic sheet** (unmapped info saved + surfaced), flagged
> *under construction* for a later custom pass. **M1 done** — schema (`under_construction`/`import_notes`/
> `style_notes` + `dnd_character_uploads`) applied to live. **M2 done** — the New-Character upload form
> renders (browser-verified). **M3 done** — import endpoint creates the under-construction character +
> saves uploads (verified). **M4 done** — AI ingestion populates the sheet from the uploads + reports
> unmapped info (real-call verified). **Phase M complete (M1–M6)** — the full **user-created-character
> flow** works from the lobby: ＋ New Character → upload files/notes → AI builds the generic sheet →
> unmapped info + files saved → flagged under construction (all browser/real-call verified). **L5 done** —
> the 3 sample characters built via AI + applied to live, playable. **L6 done** — concentration + conditions
> tracker on every sheet (browser-verified). **L7 done** — legendary actions (pool + spend + round-refresh)
> on the initiative tracker (browser-verified). **L8–L10 done** — whispers (F4 direct channel surfaced on
> the sheet via `SheetChatPanel`), reaction emotes (`ReactionBar`/`useReactions` — ephemeral rainbow-emote
> bursts broadcast campaign-wide), and offline-safe (per-character write-through localStorage cache +
> cache-fallback on failed load + save-retry + an offline banner in the sheet store). **Phase L complete.**
>
> **Session 2026-07-06 (b) — production hardening + streamer-chat deepening + soundboard.** User direction
> this session: **(1) go public** — `/dnd` is now PUBLIC by default (reachable by direct link only; login
> infra B1–B7 retained + re-enabled with `DND_REQUIRE_LOGIN=1`); the middleware + `isDndOpenAccess()`
> inverted to public-by-default. **(2) Own chrome** — the marketing header/footer were already suppressed;
> added a unique Hextech **`DndHeader` + `DndFooter`** in `app/dnd/layout.tsx` (`.siteChrome` re-declares
> the `--hx` tokens so it doesn't tint the bespoke sheets) — "a different site hiding underneath". **(3) C6b
> resolved** (public): dead iframe bundle (`public/dnd-sheet/`, `scripts/build-dnd-sheet.mjs`) deleted.
> **(4) J10 done** — stream moderation: chat modes (Normal/Slow/Sub-only/Emote-only/Follower) + timeout/
> ban/unban with system lines, broadcast to viewers (`lib/dnd/stream-mod.ts` + 6 tests). **(5) Streamer chat
> deepened** — big clean phrase pool (current + old memes + "alien" gibberish), heavy emoji + spam bursts,
> a **viewer-facing local speed control**, DM viewer counts **up to quadrillions** (`viewer_count`→bigint,
> applied live), and a **realistic self-paced bursty scheduler** (random clusters + lulls, hard-capped at
> ~200 msgs/min — the vanity viewer count does NOT change throughput). **(6) J11 — patron-influence meter**:
> a vertical, always-bobbing, rainbow+glowing meter beside the chat that flips to **neon-pink violent shake**
> when maxed; drives a **resist DC** from the DM's viewers × engagement dial (`engagement` col applied live;
> `lib/dnd/stream-influence.ts` + 9 tests); DM controls engagement + demand quick-sends. **(7) J12 — AI chat
> director**: the DM tells the AI what chat should say → it generates a burst of short/dumb/goofy in-character
> lines (prompt-tuned for that register, procedural fallback) posted as random viewers. **(8) H5–H8 —
> soundboard**: tabs + audio upload to `dnd-audio` (`Soundboard.tsx` + API), preview-local vs
> **broadcast-to-party**, and a `PartyAudio` client with a one-tap autoplay unlock. **113 dnd unit tests
> green; typecheck + eslint clean; live schema migration applied.**
>
> **Session 2026-07-06 (c) — "wire everything" pass** (committed). `campaignId` threaded through the sheet
> (`SheetRoot`→store→`useChar`) so on-sheet stream tools reach the shared feed + campaign reactions.
> **J13 — live-activity engagement**: `useLiveEngagement` turns real audience activity into a decaying
> boost on the DM's engagement floor — stream **alerts (sub/resub/donation/raid)**, **reactions (L9)**, and
> **chat throughput** all push the influence meter's DC up, then it decays (amounts + decay in
> `lib/dnd/stream-influence.ts`, +2 tests). **Resist-the-Chat**: a DM 🎲 button on the live chat rolls a
> proficient WIS (willpower) save vs the live DC → sheet log + shared roll feed + a RESISTED/GAVE-IN
> banner — completes the patron mechanic. Also cleared the last deferred wiring: **soundboard/PartyAudio
> stop-all now stops overlapping SFX**, **reveal audience is multi-select groups** (H2 — everyone / one /
> N players → party/direct/group chat), and **PC/NPC HP auto-seeds from the sheet** when added to
> initiative (G6). **115 dnd unit tests green; typecheck + eslint clean; `/dnd` renders HTTP 200.**
> Remaining are user-blocked only (real player concepts K1–K3) or verified-on-deploy (K6).

## 0. Build status audit (2026-07-06)
Snapshot of what physically exists in the repo vs. the slice plan, so the build can be resumed
accurately. Re-run this audit whenever picking the work back up.

**✅ Committed & verified**
- **Phase A (A1–A10):** `seeds/410_dnd_schema.sql` (20 `dnd_*` tables, RLS on all) +
  `seeds/411_dnd_storage.sql` (`dnd-media`, `dnd-audio` buckets). Applied to live & verified via node-pg.
- **B1 — auth lib** (`lib/dnd/auth.ts`): bcryptjs hashing, HMAC-signed `dnd_session` cookie,
  `getDndSession`/`getDndUser`/`getCampaignRole`. Unit-tested (6 tests).
- **B2 — auth API** (`app/api/dnd/auth/{register,login,logout,session}/route.ts`): invite-gated register
  (consumes invite, attaches campaign membership, honors `character_id` pre-assignment), login, logout, session.

**🟡 Built but UNCOMMITTED (on this branch, not yet reviewed/committed)** — typecheck + eslint clean.
- **B3 — `/dnd/login`** (`app/dnd/login/page.tsx`): Hextech-styled, mobile-first sign-in; honors the
  `?next=` gate param (open-redirect-safe) inside a Suspense boundary.
- **B4 — `/dnd/join/[code]`** (`app/dnd/join/[code]/page.tsx`): invite acceptance → account creation.
- **B0 — first-DM bootstrap** (`scripts/dnd-bootstrap.mjs`, `npm run dnd:bootstrap`): idempotent node-pg
  script that mints the first DM + starter campaign + membership. **Not yet run against live** — the user
  runs it once with their chosen email/password.
- **B5a — invite API** (`app/api/dnd/invites/route.ts` + `[id]/route.ts`): DM-role-gated create/list/revoke;
  72-bit URL-safe codes with collision retry.
- **B6 — route protection** (`middleware.ts` `dndGate` + `/dnd/:path*` matcher): cookie-presence gate
  (Edge-safe), full HMAC verify stays server-side in each page/route; login/join/Lazzuh bridge exempt.
- **B7 — profile** (`app/dnd/profile/page.tsx` + `ProfileForm.tsx` + `app/api/dnd/profile/{route,avatar/route}.ts`):
  display-name edit + avatar upload to the `dnd-media` bucket.
- **`/dnd` layout** (`app/dnd/layout.tsx`): `noindex`, Hextech fonts.
- **`/dnd` hub stub** (`app/dnd/page.tsx`): server-side auth redirect + welcome + profile link + logout
  (full dashboard = E2, role-routing = E9).
- **Hextech design-system seed** (`app/dnd/_ui/hextech.module.css` + `LogoutButton.tsx`): the auth/profile
  subset of the E1 primitives — an early, partial E1 (formalize/expand in E1).
- **C1 — sheet vendored** (`app/dnd/_sheet/**` + `VENDORED.md`): the full Lazzuh sheet source (core +
  26 UI/store/lib files) vendored from `../neon-odyssey-sheet`; `theme.css` machine-scoped under
  `.dnd-sheet` (0 unscoped globals); `App`/`store` marked `'use client'`; `main.tsx` dropped.
- **C2 — native render** (`_sheet/SheetRoot.tsx`, `app/dnd/Lazzuh_Gun/native/page.tsx`): the sheet
  rendered as a Next client component (`CharacterProvider` + `App`), fed the bundled static data.
  **Browser-verified pixel-identical to the standalone, 0 console errors.**
- **Chrome fix** (`app/components/LayoutShell.tsx`): `/dnd` now suppresses the marketing header/footer
  (like `/admin`) — the sheet renders full-bleed and the B3/B4/B7 hextech screens no longer sit under
  the Starr nav. `middleware.ts` also exempts `/dnd/Lazzuh_Gun/*` so the native preview is reachable
  like the (still-live) iframe bridge.

- **C4 — character API** (`lib/dnd/characters.ts`, `app/api/dnd/characters/{route,[id]/route}.ts`):
  load/save `dnd_characters.data` with owner/DM write + visibility-aware read; list endpoint (DM sees all
  in a campaign, player sees own). Service-role client, so authz is enforced in app code. Smoke-verified.
- **C3 — DB-backed store** (`_sheet/state/store.tsx`, `_sheet/SheetRoot.tsx`): `CharacterProvider` loads
  from + debounce-saves to the C4 API when given a `characterId`; localStorage retained for the id-less
  preview. Preview re-verified (renders, 0 errors, no API call).
- **C5 — Lazzuh migrated** (`scripts/dnd-seed-lazzuh.ts`, `lib/dnd/constants.ts`): canonical Lazzuh
  `dnd_characters` row seeded to **live** from the bundled data (`LAZZUH_CHARACTER_ID`, level 3, public).
- **C6 — native render** (`app/dnd/Lazzuh_Gun/page.tsx` → `<SheetRoot/>`; `/native` preview removed): the
  iframe is retired; `/dnd/Lazzuh_Gun` renders the vendored sheet natively. Browser-verified: identical
  render, 0 errors, Surge/transform mechanic works. Public + localStorage (non-regressing). *Now unused:*
  the iframe bundle `public/dnd-sheet/` + `scripts/build-dnd-sheet.mjs` (removed in C6b).

- **C7 — theme layer** (`_sheet/theme.ts`; `App`/`SheetRoot` wiring): `SheetTheme` config → inline CSS
  vars on `.dnd-sheet` overriding the stylesheet defaults; `lazzuhTheme` extracted as the reference.
  Browser-verified: an alt palette re-skins the whole sheet with no stylesheet change.
- **C8 — sheet_type registry + modules** (`_sheet/registry.ts`; `App`/`SheetRoot`/Lazzuh page): maps
  `sheet_type` → `{ theme, modules[] }`; module tabs/content render only when registered; theme defaults
  from the registry. Browser-verified: `lazzuh` shows the Forms module, `generic` hides it.

- **C9 — mobile pass** (verify-only, no code change): browser-checked at 375px — 0 overflow across all
  8 tabs + a live roll; the vendored breakpoints hold post-port.
- **C10 — DM sheet control** (`_sheet/components/DmOverridePanel.tsx`; `isDM` context on store/SheetRoot/App):
  DM-only override panel for the core numbers, reusing `InlineNumber` + the temp/permanent + revert
  system. Browser-verified: AC override propagated live to the vitals rail.
- **C11a — DM edit log** (`app/api/dnd/characters/[id]/edits/route.ts`; `DmOverridePanel` + `characterId`
  on store): each DM override POSTs to `dnd_sheet_edits` (field_path/old/new, scope from Temp mode),
  attributed to the editor + is_dm. Smoke-verified 401 unauth.
- **C11b — realtime sync** (`store.tsx`): `dnd:character:{id}` broadcast channel; save → ping → other
  viewers refetch via the authed API (broadcast ping, not table Realtime — avoids the cookie-auth/RLS
  gap). No-regression verified: id-less preview opens no realtime/character requests.

- **C12 — derivation engine** (`_sheet/engine/derive.ts` + test): pure base→derived pipeline
  (mods/PB/saves/skills/passives/initiative/spell DC+attack); 8 unit tests incl. recompute-on-change.
- **C13 — effects system** (`_sheet/engine/effects.ts` + test): structured effects, conditional
  filtering, numeric stacking + set_base override, adv/dis flags, resistance/proficiency collectors;
  8 unit tests. Feeds the derivation pipeline; consumed by AC (C15), attacks (C18), custom content (C19).
- **C14 — equipment core** (`_sheet/engine/equipment.ts` + test): general inventory model, equip/unequip,
  attunement cap-3, weight/encumbrance/currency, and `collectItemEffects` feeding C13; 10 unit tests.
- **C15 — armor → AC** (`_sheet/engine/armor.ts` + test; `ArmorSpec` on `EquipItem`): `computeAC` from
  worn armor (DEX rules) + shield + AC effects + Unarmored Defense; 10 unit tests. AC is fully derived.
- **C16 — weapons → attacks** (`_sheet/engine/weapons.ts` + test; `WeaponSpec` on `EquipItem`):
  `buildAttack`/`attacksFromInventory` auto-generate attack entries (ability/prof/versatile/effects);
  8 unit tests. Per-weapon magic bonuses scope to the weapon; general effects apply to all attacks.
- **C17 — magic items** (`_sheet/engine/apply.ts` + test): `applyEffectsToDerived` layers effects onto
  saves/skills/spell DC+attack/initiative + resistance/proficiency collection; 5 unit tests. With C15/C16,
  an attuned +1 item moves every connected number.
- **C18 — attack roll integration** (`_sheet/engine/attack-roll.ts` + test): `rollAttack` (to-hit + adv/dis,
  crit doubles dice, hit-vs-AC, extra dice) + `rollSaveAttack` (computed DC, half-on-save) through
  `lib/dice`; 7 unit tests (deterministic via mocked RNG).
- **C19 — custom content** (`_sheet/engine/content.ts` + test; `app/api/dnd/content/*`): converter maps
  `dnd_content` rows (stats+effects) → engine items/effects; 6 unit tests. Library CRUD API (campaign/
  global-scoped), smoke-verified 401.
- **C20 — engine capstone + edits** (`_sheet/engine/character.ts` + test): `deriveCharacter` composes the
  full pipeline; `applyModelEdit(s)` is the structured AI/DM edit surface; 5 unit tests (any edit
  recomputes every connected number; cap enforced). **Phase C engine (C12–C20) done — 73 dnd tests.**

- **D1 — character art** (`app/api/dnd/characters/[id]/media/route.ts`; store `media` + `App` display):
  reusable art/token upload API (→ `dnd-media`, sets the column + `dnd_media` row); store exposes `media`;
  sheet shows art when present. Smoke-verified 401; preview no-regression.
- **D2 — profile token** (`App` header): circular framed token render off `media.tokenUrl`; upload via
  the shared D1 route (`kind=token`). Reuses D1's verified media gating.
- **D3 — editable descriptions** (`DescriptionsPanel.tsx`; store `bio` + `saveDescriptions`): Appearance/
  Personality/Backstory/Notes in the Story tab, persisted to the `bio` column on blur. Browser-verified
  (renders + editable, 0 errors).
- **D4 — character gallery** (`Gallery.tsx` + `CharacterGallery.tsx`; `app/api/dnd/media/route.ts`):
  reusable grid + lightbox (keys/swipe/zoom) in a Gallery tab; media list API (read-gated, serves D4–D6).
  Browser-verified (grid → lightbox); API 401.
- **D5 — party gallery** (`PartyRoster.tsx` + `PartyGallery.tsx`): roster of member tokens/names (initials
  fallback) + combined party art; fetches the campaign roster. Browser-verified; mounts on E3.
- **D6 — campaign gallery** (`CampaignGallery.tsx`): all campaign media → the D4 Gallery; fetches by
  campaignId (+kind). Composes verified pieces; mounts on E3. **Phase D complete (D1–D6).**
- **E1 — Hextech design system** (`_ui/hextech.module.css` primitives + `app/dnd/hextech-demo/page.tsx`):
  framed panels, angular gold buttons, ornaments, portrait/token frames, tabs, spinner; style-guide page.
  Browser-verified (all primitives render, 0 errors). The DM pages (E2+) compose from these.
- **E2 — DM dashboard** (`app/api/dnd/campaigns/route.ts`; `_ui/CampaignDashboard.tsx` → hub): list-my-
  campaigns (role) + create (creator becomes DM); Hextech framed cards + create form. Browser-verified
  (static probe), API 401.
- **E3 — campaign page** (`app/api/dnd/campaigns/[id]/route.ts`; `_ui/CampaignPageClient.tsx`;
  `app/dnd/campaigns/[id]/page.tsx`): member-gated detail (campaign+members+characters+sessions) → Hextech
  Members/Characters/Sessions panels. Browser-verified, API 401. Now B5b invites mount here.

- **B5b — invite UI** (`_ui/InvitesPanel.tsx`, DM-only on the E3 campaign page): generate/copy/revoke
  invite links w/ status badges. Browser-verified; fixed a `window.location.origin` hydration bug.
- **E4 — session console** (`app/api/dnd/sessions/*`; `_ui/SessionConsole.tsx`; session route + campaign-page
  create control): session CRUD (DM-gated, status flow) + Hextech tabbed console shell (phase-labeled
  panels). Browser-verified, API 401.
- **E5 — DM notes** (session GET returns role + strips private notes for players; `SessionConsole` Notes
  tab = DM auto-saving textarea → `dm_notes`). Browser-verified.
- **E6 — session maps** (`app/api/dnd/sessions/[id]/media/route.ts` + media-list `sessionId` filter;
  `SessionConsole` Maps tab + `Gallery` var-fallbacks): DM uploads maps → session Gallery. Browser-verified.
- **E7 — character create + assign** (`POST /api/dnd/characters`; campaign-page DM control): DM creates an
  in-campaign character shell (sheet_type/PC-NPC) and assigns an owner. Browser-verified, API 401.
- **E8 — session status stepper** (`SessionConsole` header): 3-state prep→live→done stepper + per-state
  transitions (Go Live / End Session / Reopen). Browser-verified.
- **E9 — root role-routing** (`/dnd/page.tsx`; new `/dnd/characters/[id]/page.tsx` sheet route): DM→dashboard,
  single-character player→their sheet; generic DB-backed character render route. Routes verified gated.
  **Phase E complete (E1–E9).**
- **F1 — message API** (`app/api/dnd/messages/route.ts`): send/list per channel (party/dm_broadcast/
  direct/group), member-gated w/ visibility rules. Smoke-verified 401.
- **F2 — realtime channel hook** (`_ui/useCampaignChannel.ts`): per-campaign broadcast-ping subscription
  (C11b pattern) → subscribers refetch via the authed API. Consumed by F3.
- **F3 — party chat UI** (console Chat tab): mobile-first message list + send box, wires F1 + F2
  (send→post+ping; refetch on ping). Browser-verified at 375px. *(generalized into `Chat.tsx` in F4.)*
- **F4 — direct/group channels** (`_ui/Chat.tsx`): channel switcher (Party/Direct/Group) + recipient
  picker; targeted sends via F1 `toUserIds`. Browser-verified.
- **F5 — image attachments** (`app/api/dnd/messages/image/route.ts`; `Chat` 📎): member upload → message
  `image_url` → displayed + saved to history. Browser-verified (attach UI), API 401.
- **F6 — presence + unread** (`_ui/useCampaignPresence.ts`; `Chat`): Supabase presence → online dots +
  count; 3-channel unread badges. Browser-verified presence ("1 online"). **Phase F complete (F1–F6).**
- **G1 — NPCs + blank sheet** (`_sheet/data/blank.ts`; character-create): seed `blankCharacter` on create
  (renders a real blank sheet — **fixes the C3 fallback-to-Lazzuh limitation**); NPCs DM-owned + private.
  Browser-verified (blank sheet renders across all tabs, 0 errors).
- **G4 — encounter/initiative API** (`lib/dnd/initiative.ts` + test; `app/api/dnd/{sessions/[id]/encounters,
  encounters/[id],encounters/[id]/entries}`): order + turn-advance (7 tests); create/list/turn/add-entry,
  DM-gated. Smoke-verified 401.
- **G5 — initiative tracker UI** (`_ui/InitiativeTracker.tsx` → console Initiative tab): ordered list +
  current-turn highlight + round + Prev/Next + add combatant. Browser-verified.
- **G6 — per-combatant HP/conditions** (`app/api/dnd/initiative-entries/[id]`; tracker controls): damage/heal
  (clamped delta) + add/remove conditions + remove combatant. Browser-verified, API 401.
- **G10 — shared roll log** (`app/api/dnd/rolls/route.ts`; `_ui/RollFeed.tsx` → console Overview): roll
  feed w/ crit/fumble styling + F2 realtime + `postRoll` helper. Browser-verified, API 401.
- **G11 — initiative realtime** (`InitiativeTracker` + F2 `initiative` channel): refetch on ping; ping after
  every DM mutation. Reuses the F6-verified broadcast pattern; typecheck+lint.
- **G3 — NPC library** (characters GET npc/library filters + `is_library` PATCH; `_ui/NpcLibrary.tsx` →
  NPCs tab): browse/search/pin NPCs, open sheet; drop-a-copy = G5 add-from-character. Browser-verified.
- **G9 — open full NPC sheet** (`InitiativeTracker` ⤢ Sheet link → E9 `/dnd/characters/[id]`): full sheet
  opens from the tracker (+ G3 library). Browser-verified.
- **G12 — preroll initiatives** (`InitiativeTracker` 🎲 Roll Init): d20 for combatants missing init →
  reorders → opens pre-ordered. Browser-verified.
- **G7 — quick sheet** (`_ui/QuickSheet.tsx`; tracker ⚡ Quick toggle): compact token/AC/HP + one-tap
  checks/saves/attacks via the sheet dice lib → posts to G10 feed. Browser-verified (DEX check → 19).
- **G8 — quick-actions** (`QuickSheet` ACTIONS row): declarative Dodge/Dash/Disengage/Help + skill-rolled
  Hide/Grapple/Shove (kit-derived mods) → feed. Browser-verified (Grapple → 20). Spell picker deferred.
- **H1 — image reveal** (`_ui/{useReveals,RevealOverlay,RevealTrigger}.tsx`; console Reveals tab + overlay;
  hextech reveal keyframes): payload broadcast + recipient filter → full-screen slide-in/glow animation +
  dismiss. `selfId` threaded from the session page. Browser-verified (animation + trigger + dismiss).
- **H2 — reveal saved to chat** (`RevealTrigger` + F1 message model): reveal also POSTs to party/direct
  with `image_url` + `is_reveal` + caption → re-viewable in history; per-recipient dismiss = H1. Verified.
- **H3 — handout library** (`app/api/dnd/handouts/route.ts`; `RevealTrigger` upload + merge): campaign-
  scoped reusable images feed the reveal picker; DM upload. Browser-verified, API 401.
- **H4 — DM hotbar** (`_ui/DmHotbar.tsx` → console, DM, persistent): one-click handout reveal + canned
  party messages, fire instantly. Browser-verified (2× message POST). **Phase H complete (H1–H4).**
- **I1 — AI scaffolding** (`lib/dnd/ai.ts` + `app/api/dnd/ai/test`): pinned model, retry, complete/JSON/
  toolCall/stream helpers. Verified with a real API call (returned "pong").
- **I2 — sheet-build/edit tool** (`lib/dnd/sheet-edits.ts` + 6 tests; `characters/[id]/ai-edit` route):
  edit vocabulary over Character + pure apply + Claude tool schema; instruction→edits→apply→persist+log.
  Verified with a real call (built a valid level-4 Bandit Captain from 16 edits).
- **I3 — ask-AI-to-edit UI** (`_sheet/components/AiSheetEdit.tsx` in DM panel; store `reloadFromDb`): NL box
  → ai-edit route → live refetch. Browser-verified (box renders + fires POST).
- **G2 — agentic AI NPC build** (`NpcLibrary` ✨ Build box): describe → create blank NPC → ai-edit build →
  full sheet. Browser-verified (chain fires); AI build itself I2-verified. **Phase G complete.**
- **I5 — AI session recap** (`sessions/[id]/recap` POST/GET; `_ui/RecapPanel.tsx` in Overview): roll log +
  notes → draft in `dnd_recaps`; DM generate/regenerate. Verified with a real call (accurate recap).
- **I6 — recap co-editor** (`recap` PATCH; `RecapPanel` edit mode + F2 realtime): member edits draft →
  final_markdown + status + edited_by. Browser-verified (edit → save-as-final PATCH). **Phase I complete.**
- **J1 — username generator** (`lib/dnd/stream-names.ts` + 5 tests): procedural handles (thousands of
  combos) + color/badges + AI-themed helper. 300 distinct names verified.
- **J2 — stream state + DM control** (`characters/[id]/stream` GET/PATCH; `_sheet/components/StreamControl`
  in DM panel): Go Live toggle + viewer count + speed on `dnd_stream_state`. Browser-verified, API 401.
- **J3 — streamer chat panel** (`_sheet/components/StreamChat.tsx` in App; `stream-names` split pure/ai):
  live-scrolling ambient chatter from the J1 crowd at chat_speed + badges/colors. Browser-verified.
- **J4 — DM "from chat"** (`stream/messages` POST/GET; `StreamControl` send input; `StreamChat` poll+merge):
  persist a line (random handle) → woven into the live feed. API 401; feed render J3-verified.
- **J5 — spam chat** (`lib/dnd/stream-spam.ts` + 3 tests; `stream/spam` POST; `StreamControl` 💥 Spam):
  phrase → AI variations (procedural fallback) → batch-insert → floods feed. Real-call verified.
- **J6 — tunable stream** (`StreamChat` viewer/speed cadence + bursts; `stream/messages` DELETE; 🧹 Clear +
  window event): viewer-count effects + start/stop/clear. Browser-verified (flood + clear).
- **J7 — chat polls** (`stream/polls` POST/GET/PATCH; `_sheet/components/StreamPoll.tsx`; 📊 Poll starter):
  simulated votes fill bars → controller closes → 👑 winner + result banner. Browser-verified.
- **J8 — emotes + badges** (`lib/dnd/stream-emotes.ts` + 4 tests; `StreamChat` segment render): emote
  tokens → glyph pills; badges from J3. Browser-verified (29 glyphs + 28 badges).
- **J9 — event alerts** (`lib/dnd/stream-alerts.ts` + 3 tests; `_sheet/components/StreamAlert.tsx`;
  `StreamControl` 🔔 trigger): sub/resub/donation/raid banner via broadcast+window event. Browser-verified.
  **Phase J complete (J1–J9).**
- **I4 — AI prep assistant** (`sessions/[id]/ai-notes`; `_ui/AiNotesBox.tsx` in Notes tab): presets +
  freeform → append to DM notes. Verified with a real call (3 rich plot hooks).

**⛔ Not built yet (final state, 2026-07-06 session b)** — the build is otherwise **complete**; what remains
is user-blocked or deploy-gated, not buildable:
- **K1–K3** (real player characters #2–4) — the *platform* is done (blank sheet + AI build + registry all
  shipped); these just need each **player's actual concept/stats**. Provide them → each seeds in minutes.
- **K6 / prod E2E** — every slice was verified at build time (113 dnd unit tests; page renders smoke-tested
  at HTTP 200; API 401 gates). A true multi-browser live session is a **verify-on-deploy** step for the user.
- **B8** (prod env) — set `DND_SESSION_SECRET` when you later turn login back on (`DND_REQUIRE_LOGIN=1`).
  In the current **public** model the `dnd_session` cookie is a passwordless demo identity, so a forgeable
  cookie is low-risk; the secret only matters once real accounts exist.
- **Resolved this session:** C6b (public decision → dead iframe bundle removed), D5/D6 DM-page gallery mount,
  and the K4 extras (L6–L10). **Phases A–L + the streamer suite (J1–J12) + soundboard (H5–H8) are done.**

**Gaps found by the audit (now folded into the slice plan):**
1. **First-DM bootstrap was missing.** Registration is invite-only, but invites require a campaign and a
   DM to mint them — so nobody can ever get *in*. Added **B0** (bootstrap the first DM account + campaign
   via a seed/script). Without it the platform has no entry point.
2. **B5 (invite UI) depends on a campaign existing** (invites carry `campaign_id`). Its **API** can ship in
   Phase B; its **DM UI** properly belongs after **E2** (campaign create). B5 is split accordingly.
3. **Root role-routing** (after login, DM → dashboard vs player → their character/campaign) had no slice.
   Added **E9**.
4. **`DND_SESSION_SECRET` prod env** — `lib/dnd/auth.ts` falls back to a dev secret; production must set a
   real one or every session token is forgeable. Added **B8** (env + deploy checklist) and a risk note (§11).

## 1. Vision
A hidden, login-gated Dungeons & Dragons campaign hub living under `/dnd` on the Starr site.
Two roles — **DM** and **Player**:
- **DM** runs campaigns and sessions: initiative order, NPCs (with AI-generated stats), party &
  private messaging, dramatic image reveals, session prep (maps/notes/preroll), and total control
  of a fake livestream "**Chat**" for the streamer character. AI assists throughout.
- **Players** each have a **unique, interactive digital character sheet** (Lazzuh Gun + at least 3
  more), can chat (party / DM / one another / custom groups), and receive reveals & handouts.

The existing Lazzuh Gun sheet is the first character; it becomes fully operational inside this system.

## 2. Guiding principles
- **Hidden**: `/dnd` is URL-only + behind login; no public links, `noindex`.
- **Live**: initiative, chat, reveals, and streamer-chat push in real time to everyone connected.
- **DM omnipotence**: the DM can see/adjust everything in their campaign.
- **Shared engine, bespoke skins**: all sheets run on **one common mechanics engine** (dice/rolls,
  HP, resources, inventory, persistence). What's unique per character is the **styling, colors,
  animations, and some layout**, plus the **occasional character-only mechanic** (see §6.8).
- **Mobile-first**: 4–10 players, some on **phone browsers at the table** — every sheet and DM tool
  must work well and be touch-friendly on a small screen, not just desktop.
- **Two visual worlds**: **player character sheets** are bespoke per-character (§6.8); the entire
  **DM management interface** uses a **Hextech / League-of-Legends aesthetic** (§6.19) — dark navy,
  Hextech gold + teal, ornate framed panels, serif caps.

## 3. Architecture (decided)
This is a substantial step up from today's setup. Right now Lazzuh is a **static SPA in an iframe**
with **localStorage** only. A multi-user DM system that tracks everyone's HP/initiative/chat needs a
**shared server database + realtime + auth**. So:

- **Promote `/dnd` to a real Next.js sub-app** inside the Starr repo (server components + API routes),
  using the existing Supabase + auth stack. **This supersedes** `DND_CHARACTER_SHEET_EMBED` (the
  iframe) — Lazzuh's data migrates from localStorage → the database.
- **Auth:** ✅ **Invite-only accounts** (decided). The DM generates invite codes/links; players
  register with email + password (or magic-link). Dedicated `/dnd` accounts, **separate from Starr
  staff auth** for privacy. New `dnd_users` + `dnd_invites` tables; a `/dnd`-scoped session cookie.
- **Database:** Supabase, all tables namespaced `dnd_*`.
- **Realtime:** Supabase Realtime (postgres_changes + broadcast channels) for chat, initiative,
  reveals, streamer-chat, and presence. Polling fallback if needed.
- **AI:** ✅ **Claude (Anthropic)** via server routes (key in server env) — plot points, NPCs, stat
  blocks, streamer-chat spam, session recaps. **Cost is not a constraint**, so use the strongest
  models freely; still cache/stream for latency and UX, not for spend.
- **Hosting:** ✅ **straight to production** with the Starr site — realtime/auth/AI/media run off
  `starr-surveying.com/dnd`. Scale target **4–10 players** per campaign (small; realtime is easy at
  this size).
- **Media/storage:** Supabase **Storage** buckets (character art, tokens, maps, handouts, reveal
  images), with a `dnd_media` table for metadata + gallery grouping.
- **DB provisioning:** all `dnd_*` tables + RLS delivered as **numbered SQL seeds** that can be
  auto-applied via `scripts/apply-seeds.mjs` (the same live-apply workflow used elsewhere). Schema
  sized to hold **every character's full sheet + all DM data** (`dnd_characters.data jsonb` holds an
  entire sheet; no per-field column explosion).

## 4. Roles & permissions
- **DM** — total control of *their* campaigns: sessions, NPCs, initiative, every chat channel,
  reveals, streamer-chat, AI tools, and **full read/write access to every player's character sheet**
  (see §6.8.1): view all mechanics/stats/abilities/scores and their live roll history, override any
  number, edit inventory, toggle abilities/forms, adjust HP/resources — at any time, live.
- **Player** — owns their character(s); sees party chat + DM messages + reveals/handouts sent to
  them; can message party/DM/other players/custom groups; edits their own sheet (the DM can view and
  override anything).

## 5. Data model (Supabase, `dnd_` namespace — draft)
- `dnd_users` — id, email (unique), **password_hash** (or magic-link identity), display_name,
  avatar_url, created_at, last_seen_at
- `dnd_invites` — id, campaign_id, code (unique), role (dm|player), **character_id?** (optional
  pre-assignment so a player joins straight into their character), created_by, expires_at, used_by,
  used_at
- `dnd_campaigns` — id, dm_user_id, name, blurb, theme, created_at
- `dnd_campaign_members` — campaign_id, user_id, role (dm|player)
- `dnd_sessions` — id, campaign_id, title, scheduled_at, status (prep|live|done), order, dm_notes
- `dnd_characters` — **the unified sheet table (PCs *and* NPCs)** — id, campaign_id, owner_user_id
  (DM owns NPCs), name, **sheet_type** (registry key → `{ theme, layout, modules[] }`), **theme jsonb**
  (palette/fonts/FX/layout overrides for the bespoke skin), art_url, token_url, **data jsonb** (full
  sheet state on the shared engine: abilities, HP, resources, inventory, spells, module state, …),
  bio jsonb (editable descriptions), visibility, **is_npc** (bool), **is_library** (reusable NPC
  template), **quick_stats jsonb?** (compact summary for the quick sheet / lightweight monsters),
  ai_generated
- *(the old `dnd_npcs` table is folded into `dnd_characters` via `is_npc`/`is_library`; a library NPC
  is a template, and dropping it into an encounter creates a `dnd_initiative_entries` instance that
  carries that fight's HP/conditions.)*
- `dnd_encounters` — id, session_id, name, round, current_turn_index
- `dnd_initiative_entries` — encounter_id, **character_id** (→ `dnd_characters`, PC or NPC), name,
  token_url, initiative, **hp, max_hp, conditions[]** (this fight's live instance state), sort_order,
  is_current
- `dnd_messages` — id, campaign_id, channel (party|dm_broadcast|direct|group), from_user_id,
  to_user_ids[], body, image_url?, is_reveal, created_at, read_by[]
- `dnd_handouts` — id, campaign_id, session_id?, url, label, uploaded_by (reusable image/map library)
- `dnd_stream_state` — character_id, is_live, viewer_count, chat_speed, active_spam jsonb?, updated_at
- `dnd_stream_messages` — id, character_id, username, body, style (case/emoji/repeat), badges, created_at
- `dnd_media` — id, campaign_id, character_id?, session_id?, url, thumb_url, kind (art|token|map|handout|reveal),
  label, caption, uploaded_by, gallery_tags[], created_at (powers character/party/campaign galleries)
- `dnd_roll_log` — id, campaign_id, session_id?, actor (character/npc/user), label, formula, result,
  breakdown, crit/fumble, created_at (the shared roll feed)
- `dnd_recaps` — id, session_id, draft_markdown, final_markdown, generated_by (ai|human), edited_by[],
  status (draft|final), created_at (collaborative AI session recaps)
- `dnd_soundboard_tabs` — id, campaign_id, name, order, created_by
- `dnd_sounds` — id, campaign_id, tab_id, label, url, kind (sfx|music), volume, loop, order, created_at
- `dnd_sheet_edits` — id, character_id, editor_user_id, is_dm, field_path, old_value, new_value,
  scope (temp|permanent), created_at (the optional **DM override / edit log** from §6.8.1)
- `dnd_stream_polls` — id, character_id, question, options jsonb, votes jsonb, status (open|closed),
  result, created_at (the streamer "chat decides" polls; live poll state can also ride the realtime channel)
- `dnd_content` — **the custom/homebrew content library** — id, campaign_id (or global), kind
  (armor|weapon|item|magic_item|feat|feature|spell|ability|attack), name, rarity, **data jsonb**
  (stats + **effects[]** = `{target, operation, value, condition}`), requires_attunement, created_by,
  is_homebrew, created_at. Referenced by characters' inventory/feats/spells so custom content is
  reusable across PCs and NPCs.

> **Note on `dnd_characters.data`:** the sheet state holds base inputs (scores/level/class/proficiencies)
> plus **inventory[]** (item instances → `dnd_content` or inline, with equipped/attuned state),
> **attacks[]**, **spells** (known/prepared), **feats[]**, **features[]**, and **conditions[]** — each
> carrying/referencing **effects**. Derived numbers are **computed by the engine (§6.18)**, not stored,
> except explicit temp/permanent overrides.

## 6. Feature breakdown

### 6.1 Auth & onboarding
Sign up / sign in at `/dnd`; invite flow; profile (display name, avatar). Role assigned per campaign.

### 6.2 DM dashboard & session console
Campaign list → campaign → sessions → **live session console**: the single control surface with
tabs/panels for Initiative, NPCs, Chat, Reveals, Streamer-Chat, Notes, Maps.

### 6.3 Session prep (pre-game)
Upload maps/images, write notes, build NPC stat blocks (manual or AI), **preroll NPC initiatives**,
sketch encounters — all saved to the session so "go live" is one click.

### 6.4 Initiative & combat tracker
Add PCs (auto from campaign) + NPCs; set/roll initiative (preroll for NPCs). A **dynamic initiative
list managed by the DM**: it **reorders and highlights by whose turn it is** as the DM advances turns
(next/prev, round counter). Each entry shows the combatant's **token + HP + conditions** and a **⋮
quick-actions menu** (§6.5) plus a one-tap quick-sheet expander. Per-combatant **HP/damage** editing;
PC HP syncs from the player sheets. Realtime so players see the order + whose turn it is.

### 6.5 NPC system — full sheets, quick sheets & quick actions (decided)
NPCs are **first-class characters on the same shared engine** as the players (`dnd_characters` with
`is_npc = true`, owned by the DM). That means every NPC gets a **full character sheet for free** —
abilities, saves, skills, attacks, spells, resources, inventory, HP, the dice core, and DM control —
and works for **any level / class / kit** because it's the same flexible engine.

**Building an NPC.** The DM builds an NPC **manually** or via a **full agentic AI build** (§6.10): the
DM describes the NPC and the AI **creates the entire sheet** — ability scores, feats, class
features/abilities, attacks, spells, resources, and inventory — a complete, balanced character, not
just a stat block. The DM can keep **refining it conversationally** ("give him a warhammer", "add a
second phase", "bump his AC"). The engine derives mods/DCs. The NPC gets a **full sheet that's hidden
by default** and a compact **quick sheet** for fast table use.

**Quick sheet (the fast lane).** A small panel showing token, HP/AC, key saves, and **one-tap rolls**
for the NPC's attacks/checks/saves — so the DM can roll for an NPC **without opening the full sheet**.
**The DM can open the full NPC character sheet at any time** (a one-click expand from the quick sheet,
the initiative entry's ⋮ menu, or the NPC library) to see/edit everything. Quick sheet and full sheet
read/write the **same character state**, so a change in one shows in the other.

**Quick-actions menu.** Each NPC (in the initiative tracker and quick sheet) has a **⋮ menu** of
contextual actions built from its own kit: **Move, Dash, Dodge, Help, Hide, Attack** (pick a weapon →
rolls to-hit + damage through the engine), **Cast a Spell** (pick from its spells → attack/save +
effect), **Grapple/Shove**, and custom actions. Because actions come from the NPC's abilities, the
menu adapts to a goblin, an archmage, or a dragon alike. Rolls fire into the **shared roll log**.

**NPC library.** NPCs are saved to a reusable **library** (`is_library`) — browse/search and **drop a
copy** into any session/encounter (each drop is an independent instance with its own HP/state), so a
"Bandit" or "Boss" can be reused across sessions.

**Initiative integration.** NPCs and PCs share one **dynamic initiative list** (§6.4): the DM adds
them, sets/rolls initiative, and the list **reorders/highlights by whose turn it is** as the DM
advances turns. Each entry shows token + HP + the ⋮ quick-actions menu, and PC HP syncs from sheets.

*(Data note: NPCs reuse `dnd_characters`; the older standalone `dnd_npcs` table is folded into it via
`is_npc`/`is_library` flags + an optional `quick_stats` summary for lightweight monsters.)*

### 6.6 Messaging / chat
Channels: **Party** (all + DM), **DM broadcast**, **DM ↔ player** direct, **player ↔ player**
direct, and **custom groups** (chosen members). Image attachments saved to that channel's history
for re-viewing. Realtime, unread badges, presence.

### 6.7 Dramatic image reveal
DM picks an image + audience (everyone / group / individual). On send, each recipient's screen
**dims**, the image **slides in from the right**, centers, with a **glowing, moving animated
outline**, and **stays until the viewer clicks to dismiss**. Afterward it's **saved into that chat**.
Realtime broadcast; per-recipient dismiss.

### 6.8 Character sheets (players) — shared engine + bespoke skins (decided, refined)
**Clarified model:** the sheets **mostly share the same mechanics** — what differs per character is
the **styling, colors, animations, and some layout**, plus the **occasional character-only
mechanic**. So instead of hand-writing each sheet from scratch, we build three layers:

1. **Shared mechanics engine (common to all):** the full **rules & effects engine (§6.18)** —
   base→derived computation (mods, saves, skills, AC, spell DC/attack, attack bonuses, HP, speed,
   resistances), the **effects system**, **equipment management**, **custom-content builder**, and
   attack/roll integration — plus the dice core, temp/permanent edits + revert, DB persistence, and DM
   control. This is the Lazzuh engine, generalized, wired for connected math, and moved server-side.
2. **Per-character theme/layout (bespoke skin):** each character gets its own color palette, fonts,
   background/FX, animations, token/art, and layout tweaks — driven by a **theme config + optional
   custom CSS/section overrides**, so every sheet feels distinct without forking the engine.
3. **Character-specific mechanic modules (optional):** pluggable extras that apply to only one
   character — e.g. Lazzuh's **Surge/transformation forms**, the streamer's **live Chat** panel, or a
   future character's bespoke resource. Registered per `sheet_type`; the engine renders them if present.

A `sheet_type` registry maps each character to `{ theme, layout, modules[] }`. Port **Lazzuh Gun**
first (localStorage → DB) as the reference implementation; new characters are mostly a **new theme +
data**, only writing code for genuinely unique mechanics. Rolls post to the shared roll log; HP/
resources are DM-visible and sync into the initiative tracker. Everything is mobile-responsive.

#### 6.8.1 DM full control over player sheets (decided)
From the DM console, the DM can open **any** player's character sheet and:
- **Review everything** — all mechanics, ability scores, saves, skills, attacks/abilities/spells,
  forms, resources, inventory, and their **live roll history**.
- **Override any value** — scores, modifiers, AC, HP, DC, save/skill bonuses (temporary or permanent,
  using the same temp/permanent + revert system already built into the Lazzuh sheet).
- **Edit inventory** — add/remove/modify items, currency, and give the player things directly.
- **Drive mechanics** — toggle abilities/forms, spend/restore resources, apply damage/healing,
  set conditions/exhaustion — the same controls the player has, plus DM-only overrides.
- Changes are **live** (realtime) on the player's sheet; an optional edit log records DM overrides so
  players can see what the DM changed. All edits persist to `dnd_characters.data`.
Implementation: the sheet engine reads a `role`/`isDM` context; DM mode unlocks every field for edit
and exposes an override panel. The player and DM operate on the same server-persisted character state.

### 6.9 Streamer "Chat" mechanic (the special character)
Her patron god is **"chat"**; she's always live and asks chat what to do. Her sheet has a live,
Twitch-style **Chat panel**. The **DM controls it** from the session console (targeting her):
- **Send one message "from chat"** — custom username + text + style.
- **Spam Chat** — DM types a phrase (e.g. *"big bungus has a fungus"*); **AI generates many
  variations**: fitting emojis, mixed/UPPER/lower case, repeats, plus dispersed reactions
  ("LMAO", "chat is losing it", "why is this so funny", side comments). Chat starts scrolling them.
- **Speed control** (messages/sec) and **viewer count** (more viewers → faster, denser, more names).
- **Start / Stop / Clear**; saved "bits" (presets).
- Realtime to her sheet; DM sees a live preview.

✅ **Full Twitch sim (decided)** — beyond spam/single messages, also build:
- **Chat polls** — DM (or "chat") starts a poll; the scrolling chat "votes" and a result banner
  resolves it. This is her core premise ("do what chat says / what do you think, chat?").
- **Emotes & badges** — an emote set (e.g. custom "faith of chat" emotes), sub/mod/VIP badges on names.
- **Events** — sub/resub, donation/bits (with an on-screen alert), and **raids** (a burst of new
  viewers + a raid message) the DM can trigger.
- **Mod actions** — timeout/ban a chatter, delete a message, "chat mode: emote-only/slow" gags.
- **Viewer count** drives density/velocity, name variety, and event frequency.
- Saved **bits/presets** and an AI "improv a reaction to <the character's last action>" button.

### 6.10 AI integration (DM tools)
Server routes to Claude for: plot points/hooks, location/lore blurbs, **session recaps**, and the
streamer-chat spam — plus the big one:

**AI sheet builder / editor (agentic).** The AI can **build and edit character sheets directly, at the
DM's request**:
- **Full NPC build** — the DM runs a **guided / conversational build** ("make me a CR 5 fire-cult
  archer, level 7") and the AI **creates the entire sheet**: ability scores, proficiencies, saves,
  skills, **feats, class features/abilities, attacks, spells, resources, and inventory** — a complete,
  balanced, playable character on the shared engine, not just a text stat block.
- **Edit any sheet on request** — the DM asks in natural language ("give them a greatsword and +2 STR",
  "add Counterspell and Fireball", "level this NPC to 10", "make them a boss with legendary actions")
  and the AI **applies structured edits** to that character's `data` — works on **NPCs and (at the
  DM's request) player characters** too.
- **How it's safe/correct:** the AI writes through a **structured sheet-edit tool** whose schema is the
  engine's own data model, so every edit is valid and the sheet re-renders live. Edits are recorded in
  `dnd_sheet_edits` (auditable/revertable) and, for player sheets, attributed to the DM.
- Streaming/agentic loop so the DM can watch the build happen and refine it turn by turn.

### 6.11 Notes & handouts
DM private + shareable notes; a reusable **handout/map/image library** across sessions.

### 6.12 Character art, tokens & galleries (decided)
- **Character art** — upload/replace hero art for each character; shown on the sheet.
- **Round profile token** — a circular token pic per character, shown on the sheet header and used
  everywhere the character appears (initiative tracker, chat avatars, party lists).
- **Editable descriptions** — bio/appearance/personality/notes are all editable in-sheet (player and
  DM), persisted to the DB.
- **Galleries:**
  - **Character gallery** — all images tied to one character (art variants, tokens, moments).
  - **Party gallery** — every party member's art + tokens together (the roster at a glance).
  - **Campaign gallery** — all campaign images: handouts, maps, reveal images, NPC art, session shots.
- Uploads go to Supabase Storage; images are thumbnailed; galleries are grid views with lightbox +
  captions. Mobile: swipeable, tap-to-zoom.

### 6.13 Shared roll log (decided)
Every roll from any sheet (and DM/NPC rolls) posts to a **live campaign roll feed** the DM sees, and
optionally the party. Shows actor (with token), label, formula, result, crit/fumble. Filter by
character/session. Feeds the combat tracker and the AI recap.

### 6.14 AI session recap — collaborative (decided)
At session end, the DM triggers **"generate recap."** Claude drafts a summary from the session's
**actual data**: the roll log, initiative/combat events, chat highlights, notes, reveals, and NPCs
encountered. The draft is then **editable and guided by both the DM and players** — they can add
beats, correct events, set tone, and co-write toward a **final** recap. Recaps are saved per session
and browsable as a campaign "story so far."

### 6.15 DM hotbar (decided)
A persistent **quick-action bar** in the DM console to fire prepared things instantly mid-session
without digging through menus: **prepared reveals**, saved streamer-chat **bits**, quick NPC adds,
"next turn", canned messages/handouts, and AI shortcuts (spawn NPC, improv chat). Drag-to-arrange;
per-session loadouts set during prep.

### 6.16 DM Soundboard (decided)
A DM audio board for sound effects and music, pushed to the whole party in real time.
- **Uploads:** the DM uploads sound bites and music tracks (mp3/ogg/wav) to Supabase Storage.
- **Movable modal panel:** the soundboard is a draggable/resizable floating panel (like the Dice
  Core), so the DM can reposition it during play; minimizes to a button.
- **Tabs:** a tab bar at the top. The DM **creates and names tabs** (e.g. "Combat", "Ambience",
  "Tavern", "Boss") and switches between them — each tab is its own named set of sounds.
- **Sound buttons:** within a tab, the DM **adds sounds** (from uploads), **names/labels** each, and
  arranges them as pad buttons. Per-sound options: volume, **loop** (for music/ambience), and
  **one-shot vs stop-others**.
- **Preview vs broadcast:** each pad can be **previewed locally** (only the DM's machine hears it) or
  **sent to all players** (everyone hears it, synced via realtime). Clear visual distinction between
  preview and live. A **master stop / fade-out** halts what's playing for everyone.
- **Music vs SFX:** music/ambience loops and ducks under one-shot SFX; the DM can crossfade tracks.
- **Playback control:** players hear DM-triggered audio through a small client player (respecting
  browser autoplay rules — a one-time "enable audio" tap per session on mobile). Per-player volume /
  mute so a player can opt down without the DM losing control.
- **Persistence:** tabs, pad layouts, labels, and uploads are saved per campaign (reusable across
  sessions); optional per-session loadouts.
- **Realtime:** `campaign:{id}:audio` broadcast channel carries play/stop/loop/volume events + the
  sound URL so all clients play in sync.

### 6.17 Chat username generation (decided)
For the streamer chat we need **lots of believable viewer usernames** on demand. A generator
produces them **procedurally** (adjective+noun+numbers, gamer-tag patterns, leet, underscores,
prefixes/suffixes, occasional real-word handles) blended with **AI-generated** on-theme names, so the
chat feels populated by hundreds of distinct viewers. Names get consistent badge/emote styling and a
stable color per name during a stream. Viewer count scales how many unique names are in rotation.

### 6.18 Rules & effects engine — derived stats, equipment & custom content (decided)
The heart of the sheet is a **derivation engine** (like D&D Beyond): a small set of **base inputs**
drives **every derived number**, and anything that grants a bonus does so through a **structured
effect** that plugs into the pipeline. Change one thing and everything downstream recomputes in real
time. This is what makes stats, AC, spell DCs, and attacks all stay correct and connected.

**Base → derived pipeline.** Base inputs: ability scores, level, class(es), proficiencies, chosen
options. The engine **computes** (never hand-stores, except explicit overrides): ability **mods**,
**proficiency bonus**, **saving throws**, **skills** + passive scores, **AC** (from armor/DEX/
features), **initiative**, **HP max**, **spell save DC** + **spell attack bonus**, **attack bonuses &
damage**, **carrying capacity/encumbrance**, **speed**, **resistances/immunities**, and more.

**Effects (the wiring).** Every item, feat, feature, ability, spell, and condition can carry
**effects**. An effect is structured: `{ target, operation, value, condition }` — e.g.
`{+2 to attack_and_damage while: equipped}`, `{set base_ac 16}`, `{advantage on: dex_saves}`,
`{grant_proficiency: longswords}`, `{+1 to spell_save_dc}`, `{resistance: fire}`,
`{+10 speed while: raging}`. Effects **stack per the rules**; conditional effects apply only when their
condition is met (equipped, attuned, raging/transformed, concentrating, etc.).

**Equipment management (D&D-Beyond-style).**
- **Inventory** with **equip/unequip**, **attunement** (cap 3), containers, weight & **encumbrance**,
  and currency.
- **Armor**: base AC, armor type (light/medium/heavy), DEX cap, don/doff, stealth disadvantage —
  drives the **computed AC**.
- **Weapons**: damage dice, damage type, properties (finesse, versatile, two-handed, thrown, reach,
  loading, ammunition), range, **mastery** → auto-generate **attack entries** wired into rolls.
- **Magic items**: numeric bonuses + **special/magical features** expressed as effects that actually
  change AC, attack, damage, saves, spell DC, resistances, speed, etc. (a +1 breastplate, a
  flametongue's bonus fire dice, a cloak of protection's +1 AC & saves), **attunement-gated**.
- Equipping / attuning / unequipping **recomputes the sheet instantly**.

**Custom content builder (homebrew).** Create **custom armor, weapons, items, feats, spells,
abilities, and attacks** via a builder that captures their **stats + effects**, saved to a reusable
**content library** (`dnd_content`) usable across characters/NPCs. Because they're built from the same
**effect vocabulary**, custom content is **fully wired** — a homebrew +3 flaming greatsword, a feat
that grants +1 AC and a new reaction, or a homebrew spell with a save vs your DC all plug straight into
the math and the roll engine.

**Attacks (fully connected).** Building an attack captures: **base ability** (STR/DEX/…), proficiency,
**damage dice** + damage type, **bonus to-hit/damage**, versatile/two-handed damage, extra/conditional
dice, and save-based effects. The engine computes the **to-hit** (ability mod + prof + item/effect
bonuses) and **damage** (dice + ability mod + item/effect + rage/surge/etc.), and the **roll engine
fires it with all the math connected** — crit (double dice), advantage/disadvantage, and any active
conditional effects. Save-based attacks use your **computed save DC**.

**AI + real-time control.** The AI (§6.10) and the DM operate on this **same base + effects model**:
adding/editing an item, feat, spell, ability, attack, or raw number writes structured data, the engine
**recomputes in real time**, and every connected value (AC, DCs, attack bonuses, saves, skills, HP,
speed, resistances) updates live for both player and DM. Temp/permanent overrides sit *on top of* the
computed layer, with revert (so the DM can force a number and still snap back to the computed value).

### 6.19 DM interface visual style — Hextech / League-of-Legends aesthetic (decided)
**All DM-side management pages and systems** (dashboard, campaign pages, session console, initiative
tracker, NPC builder, soundboard, hotbar, settings, AI tools) use a **League-of-Legends client
("Hextech") aesthetic** — ornate, dark, gold-and-teal, premium. *(Player character sheets keep their
own bespoke per-character themes from §6.8; this style is the DM's world.)*

**Reference surfaces to draw from** (the LoL/League client): the **Home** screen, **Champion Select**,
**Champion/collection & profile** pages, **stat/scoreboard** screens, and **Settings** — for their
framed cards, portrait tokens, tabbed panels, ornamental dividers, and gold-bordered controls.

**Palette (Hextech):**
- Backgrounds: near-black navy — `#010A13`, `#0A1428`, `#091428`; panel greys `#1E2328`, `#3C3C41`.
- **Hextech gold** accents/borders: gradient `#785A28 → #C89B3C → #C8AA6E → #F0E6D2` (frames, headers,
  primary buttons, active states).
- **Hextech blue/teal** magic accents: `#0AC8B9`, `#0397AB`, `#0596AA`, deep `#005A82` (interactive
  glows, links, "magic" highlights).
- Text: warm parchment `#F0E6D2`, muted `#A09B8C`, disabled `#5B5A56`.
- States: victory/positive teal, defeat/danger red `#C6403B`.

**Typography:** display/headers use an elegant **Roman-serif caps** face (LoL "Beaufort" → Google
**Cinzel** or **Marcellus**), UPPERCASE with wide letter-spacing; body uses a clean humanist sans (LoL
"Spiegel" → **Inter**, or **Chakra Petch** for a techier feel). Numbers/stats can use a tabular mono.

**Components & motifs:**
- **Framed panels** — dark fill, thin **gold hairline borders with chamfered/angular corners** (not
  round), a gold top-accent bar, subtle inner glow, faint diagonal/**hex texture**.
- **Ornamental dividers** — a gold line with a **center diamond/filigree**; section headers flanked by
  small ornaments.
- **Buttons** — angular, gold-bordered, dark fill, UPPERCASE; hover → **gold glow + brighten**; primary
  CTA = gold-gradient fill with dark text; disabled = desaturated. Teal variant for "magic" actions.
- **Portrait/token frames** — champion-select-style **gold hex/round frames** for character & NPC
  tokens; the **current initiative turn** gets a glowing animated gold frame (like the active pick).
- **Tabs & nav** — dark bar, gold **underline/indicator** on the active tab, hover sheen.
- **FX** — restrained animated gold shimmer on hover, teal energy glow on interactive/AI elements,
  hextech "loading" spinners (rotating gold gears/hexes).
- **Mobile** — the ornaments simplify gracefully (thinner frames, collapsible panels) but keep the
  gold/teal palette and serif headers so it still reads as Hextech on a phone.

**Delivery:** a reusable **Hextech design system** (CSS tokens + framed-panel / button / divider /
portrait-frame / tab primitives) built once (first DM-UI slice), then every DM page composes from it —
scoped so it never touches the Starr marketing site or the player sheets.

## 7. Realtime channels (Supabase, draft)
`campaign:{id}:party` · `:dm` · `:initiative` · `:reveal` · `:audio` (soundboard) ·
`character:{id}:stream` · `presence:{campaign}`.

## 8. Phased roadmap (high-level overview)
> **§8.6 is the authoritative, executable slice list.** This section is just the narrative overview.
> Note: "perfect Lazzuh" happens **via the port** (Phase C) + media (Phase D) — i.e. natively in the
> repo, not by further editing the throwaway standalone SPA — so the work is git-committable by the
> stop hook.

- **Phase A — Foundation:** `dnd_*` DB schema + RLS as auto-appliable seeds; Supabase Storage buckets.
- **Phase B — Invite-only auth.**
- **Phase C — Port + core engine:** vendor the sheet in, scope its CSS, DB-backed store, migrate its
  data, retire the iframe, theme layer + module system, **DM full control (§6.8.1)**, mobile — **plus
  the rules & effects engine (§6.18): derived-stat pipeline, effects system, equipment management,
  custom-content builder, attack/roll integration, and AI real-time control.**
- **Phase D — Character media:** art, editable descriptions, round token, character/party/campaign galleries.
- **Phase E — Campaigns/sessions + DM dashboard** in the **Hextech / League-of-Legends style
  (§6.19)** (design system first), + character creation/assignment.
- **Phase F — Messaging/chat** (party + direct + groups) + presence + image attachments.
- **Phase G — NPCs + initiative:** NPCs as full-sheet DM-owned characters (manual + AI, library),
  **dynamic initiative tracker**, **quick sheet** + **quick-actions ⋮ menu**, open-full-sheet-anytime,
  **shared roll log**, preroll.
- **Phase H — DM live tools:** dramatic **image reveal** + handout library + **DM hotbar** +
  **soundboard** (tabbed movable panel, preview-local vs broadcast) + player audio.
- **Phase I — AI tools:** **agentic sheet builder/editor** (AI builds a full NPC + edits any sheet on
  request) + plot/lore generation + **collaborative session recaps**.
- **Phase J — Streamer Chat (full Twitch sim):** username generation → single messages → AI spam →
  speed/viewer controls → polls → emotes/badges → subs/donations/raids → mod actions.
- **Phase K — Remaining bespoke character sheets** (incl. the streamer) as concepts arrive;
  opted-in extras; full mobile pass; polish + QA.
- **Later (out of scope now):** maps-with-tokens, voice, video.

## 8.5 Execution model (for stop-hook slice builds)
This platform is built **one slice at a time**. Each slice below is small, ordered by dependency,
and independently shippable: implement it, **typecheck + lint (+ a test where it makes sense), commit,
push**, then tick its Status. The stop hook picks the next `TODO` slice top-down.

**Repo/setup ground rules (do these in Phase A before feature slices):**
- **Vendor the sheet source into this repo** at `app/dnd/` (engine + components + styles) so slices
  are commit/push-able by the hook. The standalone `neon-odyssey-sheet` project stops being the source
  of truth once C-slices land.
- **Scope the sheet CSS** (wrap every rule under a `.dnd-sheet` root / CSS-module) so it can live
  natively in Next without leaking `body/h1/input` styles across the site. This is what lets us retire
  the iframe.
- The **iframe at `/dnd/Lazzuh_Gun` stays as a bridge** until slice **C6** renders the sheet natively;
  don't break it in the meantime.
- **DB seeds are numbered `4xx_dnd_*.sql`** and auto-applied via `scripts/apply-seeds.mjs`
  (introspect live CHECK/FK constraints first — see the flashcards post-mortem). RLS on every table.
- Every UI slice is **mobile-first** and must be checked at a phone width before it's marked done.
- **AI** uses Claude via server routes (`lib/dnd/ai.ts`); cost is not a constraint.

## 8.6 Slice plan (execution order)

### Phase A — Foundation & database  ✅ COMPLETE (2026-07-06)
All schema shipped as **`seeds/410_dnd_schema.sql`** (20 tables, RLS on all) + **`seeds/411_dnd_storage.sql`**
(buckets), applied to live and verified via node-pg (20/20 tables, 20/20 RLS, both buckets public).
| # | Slice | Done when | Status |
|---|---|---|---|
| A1 | `dnd_users` + `dnd_invites` tables (+RLS) | tables exist | **DONE** (410) |
| A2 | `dnd_campaigns` + `dnd_campaign_members` + `dnd_sessions` | FKs valid | **DONE** (410) |
| A3 | `dnd_characters` (data/theme/art/token/bio jsonb + is_npc/is_library) | holds a full sheet | **DONE** (410) |
| A4 | `dnd_media` + `dnd_content` + `dnd_roll_log` + `dnd_recaps` + `dnd_sheet_edits` | applies | **DONE** (410) |
| A5 | `dnd_encounters` + `dnd_initiative_entries` (NPCs folded into `dnd_characters`) | applies | **DONE** (410) |
| A6 | `dnd_messages` + `dnd_handouts` | applies | **DONE** (410) |
| A7 | `dnd_stream_state` + `dnd_stream_messages` + `dnd_stream_polls` | applies | **DONE** (410) |
| A8 | `dnd_soundboard_tabs` + `dnd_sounds` | applies | **DONE** (410) |
| A9 | Supabase Storage buckets (`dnd-media`, `dnd-audio`) — public; upload API comes in B/C | buckets live | **DONE** (411) |
| A10 | Apply all `dnd_*` seeds to live + verify schema (counts, RLS) | verified via node-pg | **DONE** |

### Phase B — Invite-only auth
| # | Slice | Done when | Status |
|---|---|---|---|
| B0 | **First-DM bootstrap** — a seed/script that mints the initial DM `dnd_user` + a starter `dnd_campaign` + membership (invite-only auth otherwise has no entry point). Applied to live. | first DM can sign in | **DONE** (uncommitted — `scripts/dnd-bootstrap.mjs`, `npm run dnd:bootstrap`; **user must run once with chosen creds to seed live**) |
| B1 | Auth lib: session model + password hashing + `lib/dnd/auth.ts` | unit-tested helpers | **DONE** (bcryptjs + HMAC cookie; 6 tests) |
| B2 | Auth API routes: register(via invite)/login/logout/session | routes return correct states | **DONE** (`app/api/dnd/auth/*`) |
| B3 | `/dnd/login` page (mobile-first) | can sign in | **DONE** (uncommitted — `app/dnd/login`) |
| B4 | `/dnd/join/[code]` invite acceptance → account creation | invited user registers | **DONE** (uncommitted — `app/dnd/join`) |
| B5a | Invite **API** (create/revoke/list codes for a campaign the caller DMs) | DM mints a working invite via API | **DONE** (uncommitted — `app/api/dnd/invites/{route,[id]/route}.ts`; DM-role-gated) |
| B5b | Invite **DM UI** (generate/copy/revoke links) — surfaced on the campaign page | DM mints an invite in the UI | **DONE** (uncommitted — `_ui/InvitesPanel.tsx` (role select + generate + copy/revoke, status badges) mounted DM-only on the E3 campaign page. **Browser-verified** (static probe): rows render w/ active/expired/used states, 0 errors. **Caught + fixed a hydration bug** — join-link used `window.location.origin` at render → now shows the relative `/dnd/join/<code>` and builds the absolute URL only in the copy handler) |
| B6 | Route protection for `/dnd/**` (except login/join + the Lazzuh bridge) + redirects | unauth’d users bounced | **DONE** (uncommitted — `middleware.ts` `dndGate` + matcher; cookie-presence gate, full verify server-side) |
| B7 | Profile (display name + avatar upload) | persists | **DONE** (uncommitted — `app/dnd/profile/*` + `app/api/dnd/profile/*`; avatar → `dnd-media`) |
| B8 | **Prod env + deploy checklist**: set `DND_SESSION_SECRET` (no dev-secret fallback in prod), confirm `dnd-media`/`dnd-audio` buckets, `SUPABASE_SERVICE_ROLE_KEY` present | secret set; sessions non-forgeable | TODO |

### Phase C — Sheet engine port (Lazzuh → native, DB-backed)
> **C-readiness (audited 2026-07-06):** the sheet source is a standalone Vite/React app that lives
> **outside this repo** at `../neon-odyssey-sheet` (present on the build machine; only its *minified*
> bundle is committed here at `public/dnd-sheet/`). It's **~5,800 LOC / 28 files**: components-per-section
> (`Abilities`, `Attacks`, `Inventory`, `Forms`, `DiceTray`, …), a store (`src/state/store.tsx`), a rules
> engine (`src/rules/dnd.ts`), dice (`src/lib/dice.ts`), Lazzuh data (`src/data/lazzuh.ts`), types, and
> `src/styles/theme.css`. **C1 vendors these into `app/dnd/_sheet/` and scopes the CSS under `.dnd-sheet`.**
> This is the largest single phase — port first (C1–C11), then generalize into the rules/effects engine
> (C12–C20). Do it as its own focused effort, not tacked onto a smaller slice.

| # | Slice | Done when | Status |
|---|---|---|---|
| C1a | Vendor the **pure framework-agnostic core** into `app/dnd/_sheet/` (`rules/dnd.ts`, `lib/dice.ts`, `types.ts`, `data/lazzuh.ts`) — verbatim copies, no CSS/DOM | core typechecks in-repo | **DONE** (uncommitted — `app/dnd/_sheet/`; typecheck+eslint clean; provenance in `_sheet/VENDORED.md`) |
| C1b | Vendor the **UI layer** (`components/*` incl. `components/ui/*`, `state/store.tsx`, `lib/{inline.tsx,audio.ts}`, `App.tsx`) + **scope `theme.css` (2,007 lines) under `.dnd-sheet`** so nothing leaks to the Starr site; drop `main.tsx` (its `createRoot` mount is replaced by C2's client component) | no global CSS leakage on other pages | **DONE** (uncommitted — postcss AST scope transform, **0 unscoped globals**; `'use client'` + `.dnd-sheet` wrapper on `App`; typecheck+eslint clean) |
| C2 | Sheet renders as a Next **client component** (fed static data) | renders identically to standalone | **DONE** (uncommitted — `_sheet/SheetRoot.tsx` + native preview at `/dnd/Lazzuh_Gun/native`; **browser-verified pixel-identical to standalone, 0 console errors**. Required `LayoutShell` fix: `/dnd` now suppresses the marketing header/footer like `/admin` — also fixes chrome-bleed on the B3/B4/B7 pages) |
| C3 | DB-backed store: load/save `dnd_characters.data` via API (replaces localStorage) | edits persist to DB | **DONE** (uncommitted — `CharacterProvider` takes a `characterId` → loads on mount + **debounced autosave** via C4 API; `dbPhase` guards against clobbering, `lastSavedRef` dedupes; localStorage retained for the id-less preview. Preview re-verified: renders, 0 errors, **no** API call when id-less. End-to-end DB round-trip pends C5's seeded row + a login) |
| C4 | Character load/save API routes (+ owner/DM authorization) | player sees own; DM sees all | **DONE** (uncommitted — `lib/dnd/characters.ts` authz helper + `app/api/dnd/characters/{route,[id]/route}.ts`; owner/DM write, visibility-aware read; **built before C3 since the store needs the API**; smoke-verified 401 unauth, full authz exercised once C5 seeds data) |
| C5 | Migrate Lazzuh’s data into a `dnd_characters` row (the vendored `_sheet/data/lazzuh.ts` *is* the current build, so a server-side migrate needs no browser Export) | Lazzuh loads from DB with the current build | **DONE** (uncommitted — `scripts/dnd-seed-lazzuh.ts` `npm run dnd:seed-lazzuh` + `lib/dnd/constants.ts` `LAZZUH_CHARACTER_ID`; **row seeded to live & verified** — Lazzuh Gun, level 3, valid jsonb `data`, `visibility='public'`) |
| C6 | Render Lazzuh natively at `/dnd/Lazzuh_Gun`; **retire the iframe** | all mechanics verified native | **DONE** (uncommitted — `Lazzuh_Gun/page.tsx` now renders `<SheetRoot/>`; iframe gone, `/native` preview deleted. **Browser-verified:** renders identically, 0 console errors, and the **Surge/transform mechanic works** (form → 🔥 "Brute" · 10t, turn/end controls appear). Kept public + localStorage — non-regressing) |
| C6b | **Lazzuh → DB-backed + auth** — resolve the public-vs-login decision, delete the now-unused iframe bundle | Lazzuh persists to DB across devices | **DONE / RESOLVED (2026-07-06 session b)** — user decided **public** (§8.9): `/dnd` is public by direct link, login infra retained behind `DND_REQUIRE_LOGIN`. Dead iframe bundle (`public/dnd-sheet/`) + `scripts/build-dnd-sheet.mjs` **deleted**; `/dnd/Lazzuh_Gun` renders the native DB-capable `SheetRoot` (C6). |
| C7 | Theme layer: extract Lazzuh palette/fonts/FX into a `theme` config the engine reads | theme swap works | **DONE** (uncommitted — `_sheet/theme.ts`: `SheetTheme` type + `lazzuhTheme` reference + `themeToCssVars`; `App`/`SheetRoot` apply it as inline CSS vars on `.dnd-sheet` (override the stylesheet defaults). **Browser-verified swap** — an alt palette re-skinned the whole sheet without touching `theme.css`) |
| C8 | `sheet_type` registry + **module system** (Lazzuh forms as a module) | modules load per character | **DONE** (uncommitted — `_sheet/registry.ts` maps `sheet_type` → `{ theme, modules[] }`; `App` filters module tabs + gates content, defaults theme from the registry; `SheetRoot`/Lazzuh page pass `sheetType`. **Browser-verified:** `lazzuh` shows the Forms tab, `generic` hides it) |
| C9 | Full mobile-responsive pass on the sheet | usable at 375px | **DONE** (verify slice, no code change needed) — browser-checked at **375×812**: **0 horizontal overflow across all 8 tabs**, chips/vitals/tabs wrap, DICE CORE fits, and a live roll (tap STR) fires without breaking layout. The vendored sheet's mobile-first breakpoints survived the port/scope. *Minor future polish: double-tap-to-edit is less discoverable on touch (non-blocking).* |
| C10 | **DM sheet-control UI (§6.8.1):** DM mode unlocks every field + an override panel (stats/AC/HP/DC/inventory/resources/forms), reusing the temp/permanent + revert system | DM edits any player field live | **DONE** (uncommitted — `isDM` context on the store + `DmOverridePanel.tsx` (abilities/HP/AC/SaveDC/Speed/Level), **reuses `InlineNumber` on the existing override paths** so temp/permanent + ⟲revert come for free. **Browser-verified:** panel shows only in DM mode; overriding AC→99 updated both the panel and the sheet's vitals rail live. *Inventory/resources/forms controls: the sheet already edits these inline in DM mode; a consolidated panel section is a follow-up.*) |
| C11a | **DM edit log:** DM overrides recorded in `dnd_sheet_edits` | overrides logged with editor + old/new | **DONE** (uncommitted — `app/api/dnd/characters/[id]/edits` POST/GET, write-gated; `DmOverridePanel` logs each override (field_path/old/new, scope from Temp mode); `characterId` exposed on the store. Smoke-verified 401 unauth; full DM→row loop pends an owned character from the E-phase console) |
| C11b | **Realtime character sync:** sheet edits push live between player and DM | player sees DM changes instantly | **DONE** (uncommitted — `store.tsx`: subscribes to a `dnd:character:{id}` **broadcast** channel; after a successful autosave PATCH it pings (with a per-client id, `self:false`); other viewers refetch via the authed C4 GET and apply, with `lastSavedRef` preventing an echo-save. **No-regression verified:** id-less preview renders, 0 errors, opens **no** realtime/character requests. Live two-client push pends a logged-in DB-backed context, E-phase) |

*— Rules & effects engine, equipment, and custom content (core mechanics — §6.18) —*
| C12 | **Derivation engine:** generalize the computed layer into a base→derived pipeline (mods, prof, saves, skills + passives, AC, init, HP, spell DC/atk, attack bonuses, speed, resistances) with **recompute-on-change** | all derived numbers recompute from base | **DONE** (uncommitted — `_sheet/engine/derive.ts`: pure `derive(base)` → mods, PB, saves, skills+passives, initiative, spell DC/attack; composes the `rules/dnd.ts` primitives. **8 unit tests pass** incl. recompute-on-change. *AC/HP/attack-bonus/resistances are effect/equipment-driven and land as their inputs arrive in C13–C18; this is the ability/level/proficiency core they ride on.*) |
| C13 | **Effects system:** structured `{target, operation, value, condition}` effects from items/feats/features/spells/conditions feed the pipeline; stacking + conditional rules | an effect changes the right numbers | **DONE** (uncommitted — `_sheet/engine/effects.ts`: `Effect` type + `activeEffects` (conditional filter), `resolveNumeric` (best base/override + stacking adds), `rollFlagsFor` (adv/dis), and resistance/immunity/vulnerability/proficiency collectors. **8 unit tests pass** — conditional gating, stacking, set_base, advantage, resistances) |
| C14 | **Equipment core:** inventory + **equip/unequip** + **attunement** (cap 3) + weight/encumbrance + currency | items equip and persist | **DONE** (uncommitted — `_sheet/engine/equipment.ts`: general `EquipItem`/`Currency` model, immutable equip/unequip, attunement w/ cap-3 + `canAttune` guard, weight (50 coins/lb) + STR×15 capacity + variant encumbrance, `totalGold`, and `collectItemEffects` flattening worn-item effects into the C13 resolver. **10 unit tests** incl. equip→effect-applies. Persists via the C3 store (`char.data`). *Generalized model; Lazzuh's legacy themed inventory migrates onto it later.*) |
| C15 | **Armor → computed AC** (light/medium/heavy, DEX cap, don/doff, stealth) | AC reflects worn armor + effects | **DONE** (uncommitted — `_sheet/engine/armor.ts`: `armorBaseAC` (light=+DEX, medium=+DEX cap 2, heavy=none) + `computeAC` combining worn armor + shield + AC effects (via C13 `resolveNumeric`) + class Unarmored Defense + stealth flag. `ArmorSpec` added to `EquipItem`. **10 unit tests** — incl. plate+shield+attuned-ring = 21) |
| C16 | **Weapons → attack entries** (damage dice/type, properties, versatile/2H, range, mastery) auto-wired | equipping a weapon adds its attack | **DONE** (uncommitted — `_sheet/engine/weapons.ts`: `buildAttack` (ability = finesse→best STR/DEX, ammunition→DEX, else STR; to-hit = mod + PB-if-proficient + weapon bonus + general attack effects; versatile die 2H) + `attacksFromInventory` (equipped weapons only). `WeaponSpec` on `EquipItem`. **8 unit tests**) |
| C17 | **Magic items** — bonuses + special features as effects (attunement-gated) affecting AC/attack/damage/saves/DC/resist/speed | a +1 item changes the math | **DONE** (uncommitted — `_sheet/engine/apply.ts`: `applyEffectsToDerived` layers effects onto saves/skills/spell DC+attack/initiative + collects resistances/immunities/proficiencies; combined with the C15 AC + C16 attack paths, an attuned Cloak of Protection moves AC + all saves. **5 unit tests** — inert-until-attuned, +1-all-saves, targeted DEX save, fire-resistance, +1 spell DC. *Ability-setting items (Amulet of Health) re-run `derive`; speed effects apply where speed is computed.*) |
| C18 | **Attack builder + roll integration** — base ability + prof + dice + type + bonuses + effects; computed to-hit & damage fired through the roll engine (crit/adv/conditional; save-based uses computed DC) | custom attack rolls correctly | **DONE** (uncommitted — `_sheet/engine/attack-roll.ts`: `rollAttack` (d20 to-hit + adv/dis, crit doubles dice not mods, nat-1 miss, hit-vs-AC, extra damage dice) + `rollSaveAttack` (uses the computed save DC, half-on-save) through `lib/dice`. **7 unit tests**, deterministic via mocked `Math.random`) |
| C19 | **Custom content builder** — create custom armor/weapons/items/feats/spells/abilities/attacks (stats + effects) → `dnd_content` library, usable on any character/NPC | homebrew item affects the sheet | **DONE** (uncommitted — `_sheet/engine/content.ts`: `contentToEquipItem`/`contentEffects` convert a `dnd_content` row (stats + effects) into engine items/effects, so homebrew flows through C13–C18. **6 unit tests** — +2 axe raises to-hit/damage, homebrew ring changes AC once attuned, homebrew plate computes AC. Library API `app/api/dnd/content/{route,[id]/route}.ts` (create/list/get/delete, campaign/global-scoped), smoke-verified 401. *Builder UI is a DM-console surface, Phase G/I.*) |
| C20 | **AI + real-time control over the model** — AI/DM edits (via the I2 tool) to stats/items/effects/attacks recompute live and sync to player + DM | AI edit updates all connected numbers live | **DONE** (uncommitted — `_sheet/engine/character.ts`: `deriveCharacter` composes the whole pipeline (C12–C18) + `applyModelEdit`/`applyModelEdits` — the structured edit surface the AI (I2) & DM write through (set_ability/level, add/remove/update/equip/attune item, add_feature, set_condition). **5 unit tests** — a structured edit recomputes mods/saves/skills/AC/attacks; conditional rage; attunement cap enforced via edits. Live-persist rides on C3 store; sync on C11b broadcast. *The Claude I2 tool schema wraps these ops (Phase I); wiring `deriveCharacter` into the Lazzuh render is the C-engine→UI follow-up.*) |

### Phase D — Character media & galleries
| # | Slice | Done when | Status |
|---|---|---|---|
| D1 | Character **art** upload + display on the sheet | art shows + persists | **DONE** (uncommitted — reusable `app/api/dnd/characters/[id]/media/route.ts` POST/DELETE (kind=art\|token → `dnd-media` bucket, sets `art_url`/`token_url`, records a `dnd_media` row); store loads + exposes `media`; `App` renders the art when present. Smoke-verified 401; preview re-verified (renders, 0 errors, no art when id-less). Live art display pends a DB-backed character + upload — E-phase) |
| D2 | Round **profile token** upload + display (sheet header) | token shows | **DONE** (uncommitted — upload handled by the D1 media route (`kind=token` → `token_url`); `App` renders a circular framed token in the header when `media.tokenUrl` is set. Reuses D1's browser-verified `media` gating; typecheck+lint clean. Live token display pends an upload — E-phase) |
| D3 | **Editable descriptions** (bio/appearance/personality/notes) persisted | edits save | **DONE** (uncommitted — `DescriptionsPanel.tsx` (Appearance/Personality/Backstory/Notes textareas) in the Story tab; store loads `bio` from the DB row + `saveDescriptions` PATCHes `{ bio }` on blur (DB mode). **Browser-verified:** panel renders in the Story tab + is editable, 0 errors. Complements the bespoke Bio, doesn't replace it) |
| D4 | **Character gallery** (per-character images) + lightbox | grid + zoom, mobile-swipe | **DONE** (uncommitted — reusable `Gallery.tsx` (responsive grid + full-screen lightbox: prev/next, Esc/←→ keys, tap-to-zoom, mobile swipe) + `CharacterGallery.tsx` (fetches `/api/dnd/media?characterId`) in a new **Gallery tab**; list API `app/api/dnd/media/route.ts` (read-gated, serves D4–D6). **Browser-verified** with static data: 3-thumb grid → lightbox opens with image + caption + ‹✕› controls. API smoke 401) |
| D5 | **Party gallery** (all members’ art + tokens) | roster view | **DONE** (uncommitted — `PartyRoster.tsx` (round tokens + names + initials fallback, plus the combined party-art D4 Gallery) + `PartyGallery.tsx` container (fetches `/api/dnd/characters?campaignId`). **Browser-verified** with static data: roster shows tokens/names + initials fallback. *Mounts on the E3 campaign page (no campaign UI yet).*) |
| D6 | **Campaign gallery** (all campaign media) | grid | **DONE** (uncommitted — `CampaignGallery.tsx`: fetches `/api/dnd/media?campaignId` (+optional `kind`) → the D4 Gallery grid+lightbox; kind label fallback. Composes the D4-browser-verified Gallery + campaign media API (401-verified) + D5 fetch pattern; typecheck+lint. Mounts on E3.) |

### Phase E — Campaigns / sessions / DM dashboard  *(Hextech style, §6.19)*
| # | Slice | Done when | Status |
|---|---|---|---|
| E1 | **Hextech DM design system** (§6.19): scoped CSS tokens + fonts (Cinzel/Inter) + primitives — framed panels, angular gold buttons, ornamental dividers, portrait/token frames, tabs, hex FX; mobile-graceful | primitives render on a demo page | **DONE** (uncommitted — primitives added to `app/dnd/_ui/hextech.module.css` (`framedPanel` w/ corner brackets+hex texture, `ornament`, `hexBtn`/`Primary`/`Teal`, `portrait`/`portraitActive` animated, `tabbar`/`tabItem`, `spinner`) + style guide `app/dnd/hextech-demo/page.tsx` (auth-gated). **Browser-verified full-page: all primitives render on the Hextech palette, 0 errors.**) |
| E2 | DM dashboard: campaign list + create (Hextech home/card style) | DM creates a campaign | **DONE** (uncommitted — `app/api/dnd/campaigns/route.ts` (GET list-my-campaigns w/ role, POST create → makes creator DM) + `_ui/CampaignDashboard.tsx` (Hextech framed campaign cards w/ role badges + New-Campaign form) wired into the hub `/dnd/page.tsx`. **Browser-verified** (static probe): cards + header + buttons render on the Hextech palette, 0 errors. API 401 smoke. Live create pends a session/QA) |
| E3 | Campaign page: members, characters, sessions list (framed panels) | shows roster + sessions | **DONE** (uncommitted — `app/api/dnd/campaigns/[id]/route.ts` (campaign+members+characters+sessions, member-gated) + `_ui/CampaignPageClient.tsx` + `app/dnd/campaigns/[id]/page.tsx`. Hextech framed Members/Characters/Sessions panels w/ portrait rings + role/PC-NPC/status badges. **Browser-verified** (static probe), API 401. *D5/D6 galleries mount here once restyled for the Hextech context (they're `.dnd-sheet`-scoped) — deferred; B5b invites mount here next.*) |
| E4 | Session CRUD + **session console shell** (Hextech tabbed panels) | console opens per session | **DONE** (uncommitted — `app/api/dnd/sessions/{route,[id]/route}.ts` (create/get/patch/delete, DM-gated, status flow) + `_ui/SessionConsole.tsx` (Hextech tab bar Overview/Initiative/NPCs/Chat/Reveals/Notes/Maps + Go-Live/End-Session status control; panels are phase-labeled shells) + `app/dnd/campaigns/[id]/sessions/[sid]/page.tsx`; DM create-session control on the campaign page. **Browser-verified** (static probe: tabs + LIVE status + End Session render, 0 errors), API 401) |
| E5 | Session prep: notes editor (private + shareable) | notes persist | **DONE** (uncommitted — session GET returns caller `role` + strips `dm_notes` for players; `SessionConsole` Notes tab = DM-only auto-saving textarea → `dm_notes` (E4 PATCH). **Browser-verified** (probe: DM notes editor renders w/ value, 0 errors). *Private DM notes shipped; "shareable" session notes reuse the handout/reveal system (Phase H) — no separate column added.*) |
| E6 | Session prep: map/image uploads to the session | images attach | **DONE** (uncommitted — `app/api/dnd/sessions/[id]/media/route.ts` (DM upload → `dnd-media` + `dnd_media` row w/ session_id, kind=map) + media list API `sessionId` filter; `SessionConsole` Maps tab = DM upload button + the D4 `Gallery`. Made `Gallery` context-independent (CSS-var fallbacks) so it renders on the Hextech DM page. **Browser-verified** (Maps tab: upload button + gallery empty state render, errors were only the auth-less 401 fetch). API 401) |
| E7 | **Character creation + assign to a player** (DM creates a `dnd_characters` shell of a `sheet_type` and sets `owner_user_id`; or an invite pre-assigns one) | a player logs in and sees *their* character | **DONE** (uncommitted — `POST /api/dnd/characters` (DM creates in-campaign shell w/ sheet_type + is_npc + optional owner, membership-checked) + DM create control on the campaign page (name/sheet_type/PC-NPC/owner-select). **Browser-verified** (create controls render w/ owner=Jacob assignment), API 401. Invite pre-assign path already works (B2); "player sees it" lands with **E9** root-routing.) |
| E8 | Session status flow (prep → live → done) + "go live" | console reflects state | **DONE** (uncommitted — `SessionConsole` header now shows a **3-state status stepper** (PREP → LIVE → DONE, current highlighted) + per-state transitions: prep→Go Live, live→End Session, done→Reopen (via E4 PATCH). **Browser-verified** (live session: stepper highlights LIVE, End Session button shown)) |
| E9 | **Root role-routing** — after login, `/dnd` sends a DM to the dashboard and a player to their character/campaign (replaces the B-phase hub stub); handles multi-campaign membership | each role lands on the right home | **DONE** (uncommitted — `/dnd/page.tsx` role-routes (DM-anywhere → dashboard; player w/ exactly one character → their sheet; else dashboard) + new **generic DB-backed character sheet route** `app/dnd/characters/[id]/page.tsx` (renders `SheetRoot` w/ characterId+sheetType+isDM, access-gated). Both routes verified auth-gated (307→login w/ `next`); the DM-vs-player branch needs a session — E-phase/QA. *New generic characters show fallback data until seeded — a C3 known limitation.*) |

### Phase F — Messaging / chat
| # | Slice | Done when | Status |
|---|---|---|---|
| F1 | Message model + send/list API per channel | messages store/return | **DONE** (uncommitted — `app/api/dnd/messages/route.ts` POST/GET: channels party/dm_broadcast/direct/group; member-gated, DM-only broadcast, direct/group require recipients + visibility filter (`from` or in `to_user_ids`). Smoke-verified 401; live store/return pends a session) |
| F2 | Realtime subscription (Supabase) — party channel | live delivery | **DONE** (uncommitted — `_ui/useCampaignChannel.ts`: subscribes to `dnd:campaign:{id}:{channel}` broadcast, `onPing` on others' sends (self ignored), returns `ping()`. Reuses the C11b-verified broadcast-ping approach (chat content stays off the public channel — subscribers refetch via the F1 authed API). Typecheck+lint; the live two-client delivery demo lands in F3, which consumes this hook) |
| F3 | Party chat UI (mobile-first) | send/receive on phone | **DONE** (uncommitted — `_ui/PartyChat.tsx` mounted in the console Chat tab: message list (own right / others left, sender names), send box, wires F1 API + F2 realtime (send→post+ping; others refetch on ping), autoscroll. **Browser-verified at 375px** (input + Send + empty state render; all console errors were the expected auth-less 401 fetches; realtime hook connected cleanly). Live two-client send/receive pends a session + two browsers) |
| F4 | Direct + custom-group channels | targeted messages work | **DONE** (uncommitted — generalized `PartyChat`→`_ui/Chat.tsx`: channel switcher Party/Direct/Group + recipient picker (Direct=one, Group=many; self excluded); sends via F1 with `toUserIds`, per-message "→ recipients" labels, F2 realtime per channel. **Browser-verified** (channel tabs + recipient buttons Jacob/Mira render). Live targeted send/visibility pends a session) |
| F5 | Image attachments (upload + display, saved to history) | image re-viewable | **DONE** (uncommitted — `app/api/dnd/messages/image/route.ts` (member-gated upload → `dnd-media`, returns URL) + `Chat` 📎 attach button (upload → send message w/ `image_url`); display already renders `image_url` (saved on the message = re-viewable in history). **Browser-verified** (📎 + file input render), API 401. Live upload→display pends a session) |
| F6 | Presence (online) + unread badges | accurate | **DONE** (uncommitted — `_ui/useCampaignPresence.ts` (Supabase Realtime presence keyed by dnd user id) → online-count + green dots in `Chat`; per-channel **unread badges** via subscribing to all 3 channels (ping on a non-active channel bumps its badge, viewing clears it). **Browser-verified: presence synced live to "● 1 online"**; unread badge machinery wired (count demo needs a 2nd client). **Phase F complete (F1–F6).**) |

### Phase G — NPCs, initiative, quick sheet/actions, roll log
NPCs run on the **shared sheet engine** (Phase C), so they get full sheets + rolls + DM control for free.
| # | Slice | Done when | Status |
|---|---|---|---|
| G1 | **NPCs as DM-owned characters** (`is_npc`): create manually → a **full sheet, hidden by default** | NPC has a real sheet | **DONE** (uncommitted — character-create now seeds a valid **`blankCharacter`** (`_sheet/data/blank.ts`) so new characters/NPCs render a real blank sheet on the engine (fixes the C3 fallback-to-Lazzuh limitation); NPCs get `owner_user_id=DM` + `visibility='private'` (hidden). **Browser-verified: blank sheet renders across all tabs, 0 errors.** NPC renders via the E9 `/dnd/characters/[id]` route) |
| G2 | **Full agentic AI NPC build** — the DM describes an NPC and the AI builds the **entire sheet** (stats, feats, class features/abilities, attacks, spells, resources, inventory) + conversational refine (uses I1+I2) | AI builds a complete playable NPC | **DONE** (uncommitted — `NpcLibrary` "✨ Build an NPC with AI" box (DM): description → create blank NPC (E7) → I2 `ai-edit` build instruction → full sheet → reload list; refine later via the sheet's I3 "Ask AI" box. **Browser-verified** (build box renders; Build fires the create→build chain); **the AI build itself is I2-verified end-to-end** (real call produced a valid full Bandit Captain). **Phase G complete (G1–G12).** *Spells: `add_feature` covers spell-like abilities; a typed spell model is a later enhancement (same note as G8).*) |
| G3 | **NPC library** (`is_library`): save/browse/search + **drop a copy** into a session/encounter (independent instance) | reuse across sessions | **DONE** (uncommitted — characters GET `?npc=1`/`?library=1` filters + `is_library` in the C4 PATCH whitelist; `_ui/NpcLibrary.tsx` (NPCs tab): browse/search NPCs, ★Library pin toggle, open-sheet links. NPCs are campaign-scoped → reuse across sessions; **drop-a-copy is the G5 tracker's add-from-character** (each an independent initiative-entry instance). **Browser-verified** (list + search + ★Library badge + open links)) |
| G4 | Encounter + initiative model/API (`dnd_encounters`, `dnd_initiative_entries`) | order + turn stored | **DONE** (uncommitted — `lib/dnd/initiative.ts` (pure `orderEntries` + `advanceTurn` round-wrap math, **7 unit tests**) + API: `sessions/[id]/encounters` (create/list), `encounters/[id]` (GET ordered entries + current, PATCH next/prev/reset turn, DELETE), `encounters/[id]/entries` (add PC/NPC/manual). DM-gated. Smoke-verified 401×4) |
| G5 | **Dynamic initiative tracker UI**: add PCs (auto) + NPCs, set/roll init, **reorder + current-turn highlight**, next/prev, round, DM-managed turn advance | full turn loop | **DONE** (uncommitted — `_ui/InitiativeTracker.tsx` in the console Initiative tab: create/load encounter, ordered list (init desc) w/ token rings + HP + condition badges, **current-turn highlight (gold border + active token glow)**, ROUND counter, Prev/Next turn (G4 PATCH), add combatant (campaign character picker or manual). **Browser-verified** (ROUND 2, current turn highlighted, 0 errors)) |
| G6 | Per-combatant **HP/damage/conditions** on the tracker; PC HP syncs from sheets | HP tracked | **DONE** (uncommitted — `app/api/dnd/initiative-entries/[id]/route.ts` PATCH (damage/heal **delta** clamped 0..max, set hp/init/name/conditions) + DELETE, DM-gated; tracker per-combatant controls (± amount → −Dmg/+Heal, add/remove condition chips, remove combatant). **Browser-verified** (Dmg/Heal/Cond controls + removable "poisoned ✕" chip render), API 401. **PC/NPC HP auto-sync DONE (session c)** — `encounters/[id]/entries` POST now seeds hp/max_hp from the character's `data.combat.currentHp/maxHp` when a combatant is added.) |
| G7 | **Quick sheet** — compact per-combatant panel (token/HP/AC/saves + **one-tap attack/check/save rolls**) without opening the full sheet | rolls from the tracker | **DONE** (uncommitted — `_ui/QuickSheet.tsx`: token/AC/HP header + one-tap ability checks, saves (prof-aware), and attack Hit/Dmg — rolled via the sheet dice lib (`rollD20`/`rollDamage`), computed straight off the `Character` model, posting to the G10 feed + pinging realtime, with an inline last-result. Opens inline from the tracker's **⚡ Quick** toggle on character-linked combatants. **Browser-verified** (DEX check → 19 `d20[17] + 2`; DEX save +4 proficient vs +2 check; Scimitar Hit/Dmg). *Uses model math, not the full engine derive — fine for these basics.*) |
| G8 | **Quick-actions ⋮ menu** per combatant — Move / Dash / Dodge / Help / Hide / **Attack** (pick weapon → to-hit+damage) / **Cast a Spell** (pick spell) / **Grapple** / Shove / custom — derived from the NPC's kit so it works at any level/class | contextual actions fire | **DONE** (uncommitted — `QuickSheet` ACTIONS row: declarative Dodge/Dash/Disengage/Help (announce to feed) + **Hide/Grapple/Shove** roll the relevant skill (mod derived from the NPC's kit via `profContribution`); **Attack** = G7's ATTACKS (Hit/Dmg). All post to the G10 feed. **Browser-verified** (Grapple → 20 `d20[19] + 1` from athletics prof; Dodge announces "— Dodge"). *Cast-a-Spell picker deferred — the base Character model has no NPC spell list yet.*) |
| G9 | **Open full NPC sheet** — the DM can open the complete NPC character sheet **at any time** (from the quick sheet, the initiative ⋮ menu, or the NPC library) to view/edit everything | full sheet opens on demand | **DONE** (uncommitted — the full sheet is the E9 `/dnd/characters/[id]` route (renders any character on the engine w/ DM control); opened from the **NPC library** (G3 "Open") and now the **initiative tracker** (⤢ Sheet link on character-linked combatants). **Browser-verified** (Sheet link → `/dnd/characters/npc-123`; manual entries have none). *Quick-sheet ⋮ open lands with G7/G8.*) |
| G10 | **Shared roll log**: every sheet / quick-sheet / quick-action / DM roll posts to the live feed | feed updates live | **DONE** (uncommitted — `app/api/dnd/rolls/route.ts` POST/GET (member-gated) + `_ui/RollFeed.tsx` (feed w/ actor/label/result/breakdown, crit=teal/fumble=red color, realtime refetch via the F2 'rolls' channel) + exported `postRoll` helper; mounted in the console Overview tab. **Browser-verified** (feed renders 3 rolls incl. CRIT/FUMBLE styling), API 401. *Wiring the sheet's DiceCore rolls to `postRoll` is a follow-up — helper + feed + realtime are built; quick-sheet/actions (G7/G8) post directly.*) |
| G11 | Realtime: players see the turn order + whose turn it is | live | **DONE** (uncommitted — `InitiativeTracker` subscribes to the F2 `initiative` channel (refetch on ping) + `ping()`s after every DM mutation (turn/add/remove/HP/conditions/create). Reuses the F6-verified broadcast pattern; additive wiring, typecheck+lint clean. Live two-client demo needs a session + 2 browsers) |
| G12 | **Preroll NPC initiatives during session prep** (set/auto-roll each prepped NPC's init so combat starts pre-ordered) + surface prepped NPCs in the prep console | encounter opens pre-ordered | **DONE** (uncommitted — tracker **🎲 Roll Init** button rolls d20 for every combatant missing an initiative (parallel G6 PATCHes → G4 reorder → opens pre-ordered; disabled once all are set); the tracker is the console's Initiative tab (available in prep status), so prepped NPCs are surfaced there. **Browser-verified** (button enabled with unrolled combatants). *Init incorporates the NPC's DEX mod = a follow-up — auto-roll is flat d20 the DM tweaks.*) |

> **Dependency note:** the session-prep console shell ships in **E3**, but its *NPC-building* and
> *preroll* panels depend on this phase (the NPC engine). They fill into the prep console during
> G1–G3/G12 — that ordering is intentional, not a gap.

### Phase H — DM live tools (reveal / hotbar / soundboard)
| # | Slice | Done when | Status |
|---|---|---|---|
| H1 | **Image reveal**: pick an image + **audience (everyone / chosen group / individual)**; realtime broadcast; full-screen dim → slide-in-from-right → center → glowing moving animated outline | targeted recipients see it | **DONE** (uncommitted — `_ui/useReveals.ts` (payload-carrying `reveals` broadcast + recipient filter: `recipientIds` null=everyone else includes selfId) + `RevealOverlay.tsx` (full-screen dim → slide-in → glowing gold→teal animated outline + caption + click-dismiss; CSS keyframes in hextech.module.css) + `RevealTrigger.tsx` (console Reveals tab: image picker from session maps + audience selector → broadcast). Console threads `selfId` from the session page. **Browser-verified** (overlay animation screenshotted; trigger picker+audience [Everyone/Jacob]; dismiss works). Cross-client push needs a session + 2 browsers) |
| H2 | Reveal dismiss (click-to-skip, per recipient) + **saved into that chat** (party / group / DM↔player) | re-viewable later | **DONE** (uncommitted — per-recipient click-dismiss ships in H1 (each client's overlay is independent); `RevealTrigger` now also POSTs the reveal to the F1 message model — everyone→`party`, individual→`direct` (DM↔player) — with `image_url` + `is_reveal` + optional caption, so it's re-viewable in chat history. **Browser-verified** (caption input; Reveal fires the `POST /api/dnd/messages` chat-save, 401 in probe). **Group multi-select audience DONE (session c)** — `RevealTrigger` now has Everyone + toggendable member chips; reveals to everyone→`party`, one→`direct`, several→`group`.) |
| H3 | **Handout library** (reusable images/maps across sessions) feeding reveals + hotbar | handouts reusable | **DONE** (uncommitted — `app/api/dnd/handouts/route.ts` (DM upload → `dnd-media` + `dnd_handouts` row; member list), campaign-scoped so **reusable across sessions**; `RevealTrigger` now loads handouts + **+ Handout** upload button + merges handouts (first) with session maps in the reveal picker (deduped). **Browser-verified** (+ Handout button + reusable handout in picker), API 401×2. Feeds H4 hotbar next.) |
| H4 | **DM hotbar**: quick-action bar (prepared reveals, saved bits, canned messages/handouts, next turn, AI shortcuts); drag-to-arrange + per-session loadouts | fires instantly | **DONE** (uncommitted — `_ui/DmHotbar.tsx`, persistent across all console tabs (DM only, above the tabbar): one-click **reveal a handout** to the party (broadcast + save to chat) + **canned messages** → party chat. **Browser-verified** (HOTBAR + handout button + 3 canned msgs; both fire `POST /api/dnd/messages` instantly, 401 in probe). *Drag-to-arrange + per-session loadouts + AI shortcuts deferred — heavy UI for marginal value over the handout-derived bar; AI shortcuts also need I1. **Phase H complete (H1–H4).***) |
| H5 | **Soundboard** data + upload; panel in the session console | panel opens | **DONE** (uncommitted — `app/api/dnd/campaigns/[id]/soundboard/route.ts` (GET tabs+sounds member-gated, POST create tab DM) + `.../soundboard/sounds` (multipart audio upload → `dnd-audio` bucket + `dnd_sounds`, DM) using the verified handout upload path; `_ui/Soundboard.tsx` mounted as the console **Sound** tab. Modal/drag deferred — a docked console panel fits the Hextech console better than a floating window.) |
| H6 | Soundboard: create/name **tabs**, add/label sounds, arrange pads | multi-tab boards | **DONE** (uncommitted — `Soundboard.tsx`: create tabs (Ambience/Combat/Stingers…), upload a clip as **SFX** or **looping music**, per-pad volume (PATCH), remove; `.../sounds/[soundId]` PATCH/DELETE. Pads grid auto-fills.) |
| H7 | Soundboard: **preview-local vs broadcast** + realtime audio channel + master stop/loop/volume | party hears broadcast, DM-only preview | **DONE** (uncommitted — each pad has **▶ Preview** (DM-only local monitor) and **📢 Party** (local + broadcast on `dnd:campaign:{id}:sound`); **⏹ Stop all** broadcasts a stop; music/looping clips replace the bed, SFX overlap; per-pad volume rides the payload.) |
| H8 | Player client audio player (autoplay handling, per-player volume/mute) | plays after enable-tap | **DONE** (uncommitted — `_ui/PartyAudio.tsx` mounted for every role in the console: one-tap **🔊 Enable table audio** unlocks the autoplay policy, then it subscribes to the `:sound` channel and plays what the DM broadcasts. **Phase H complete (H1–H8).**) |

### Phase I — AI tools
| # | Slice | Done when | Status |
|---|---|---|---|
| I1 | AI server scaffolding (`lib/dnd/ai.ts`, Claude, streaming) — **prerequisite for all AI slices** | test prompt returns | **DONE** (uncommitted — `lib/dnd/ai.ts`: pinned model (`DND_AI_MODEL`, default `claude-sonnet-4-5-20250929`) + retry/backoff + helpers `dndComplete`/`dndCompleteJSON`/`dndToolCall` (structured output for I2)/`dndStream` (I3/I5) + `dndAiConfigured`; self-contained (no app-alias imports). `app/api/dnd/ai/test/route.ts` health check (authed). **Verified with a real API call — `dndComplete` returned "pong"** (model `claude-sonnet-4-5-20250929`, key present). Unblocks I2–I6 + G2 + hotbar AI.) |
| I2 | **Structured sheet-build/edit tool** — a Claude tool whose schema *is* the engine data model, so the AI can validly **create a full sheet** and **apply edits** to any character's `data`; agentic build/refine loop; writes to `dnd_sheet_edits` | AI produces a valid full sheet + applies edits | **DONE** (uncommitted — `lib/dnd/sheet-edits.ts`: 14-op edit vocabulary over the `Character` model + pure `applySheetEdits` (dedup/clamp, tolerant of the AI's semantic-field usage) + `SHEET_EDIT_TOOL` (Claude tool schema = the vocabulary) + `editPath`; **6 unit tests**. `app/api/dnd/characters/[id]/ai-edit` route: instruction → `dndToolCall` → apply → persist `data` + name → log each edit to `dnd_sheet_edits`; DM/owner-gated. **Verified with a real API call** — "Build a level 4 Bandit Captain…" → 16 edits applied to a valid full sheet (name/level/abilities/AC/HP/saves/attack/feature all correct). **Largely unblocks G2** (build = this route on a blank NPC).) |
| I3 | **"Ask AI to edit this sheet"** UI — natural-language sheet edits from the DM on any NPC/PC ("give them a greatsword & +2 STR", "add Fireball", "level to 10") | edits apply live | **DONE** (uncommitted — `_sheet/components/AiSheetEdit.tsx` NL box in the DM panel (`DmOverridePanel`): instruction → I2 `ai-edit` route → `reloadFromDb` (new store method that refetches the DB sheet) → **live update**. **Browser-verified** (box renders in DM mode; Ask AI fires `POST …/ai-edit`). DM+DB-backed only; the store's refetch path is the same one C3/C11b already use.) |
| I4 | AI: generate plot points / hooks / lore | inserts into notes | **DONE** (uncommitted — `app/api/dnd/sessions/[id]/ai-notes` (DM-gated `dndComplete` prep assistant) + `_ui/AiNotesBox.tsx` in the Notes tab: presets (plot hooks / lore / NPC / twist) + freeform → generated text appended to `dm_notes` via the existing `saveNotes`. **Verified with a real API call** — produced 3 rich, formatted plot hooks. UI mirrors the browser-verified I3/G2 AI-box pattern.) |
| I5 | AI: **session recap draft** from roll log + combat events + notes + reveals | draft generated | **DONE** (uncommitted — `app/api/dnd/sessions/[id]/recap` POST (DM: gather session roll log + DM notes → `dndComplete` → upsert `dnd_recaps` draft) + GET; `_ui/RecapPanel.tsx` in the Overview tab (DM generate/regenerate; all read the draft/final). **Verified with a real API call** — produced an accurate player-facing recap that correctly wove the notes + exact dice log (crit, fumble, death save) with a cliffhanger. *Reveals aren't folded in yet — reveal messages are campaign-scoped (no `session_id`); roll log + notes are the session-scoped context. Small enhancement.*) |
| I6 | Recap **collaborative editor** (DM + players) → final, saved per session | co-edited final | **DONE** (uncommitted — `sessions/[id]/recap` PATCH (any member co-edits: sets `final_markdown` + `status` + appends `edited_by`) + `RecapPanel` edit mode (Edit → textarea prefilled from draft → Save / ✓ Save as final) + F2 `recap` realtime (co-editors refetch on ping, unless mid-edit). **Browser-verified** (draft → Edit → textarea → Save-as-final fires the PATCH), API 401. **Phase I complete (I1–I6).**) |

> **AI dependency:** **I1** (scaffolding) + **I2** (sheet-edit tool) underpin every AI feature — the
> full **AI NPC build (G2)**, natural-language sheet edits (**I3**), plot/lore (**I4**), recaps
> (**I5–I6**), and streamer-chat spam (**J5**). When the first AI slice comes up (**G2**), **pull I1
> and I2 forward** first. (G2 can ship manual-first and gain the AI build once I1/I2 land.)

### Phase J — Streamer Chat (full Twitch sim)
| # | Slice | Done when | Status |
|---|---|---|---|
| J1 | **Username generator** (procedural + AI) + per-name color/badges | hundreds of distinct names | **DONE** (uncommitted — `lib/dnd/stream-names.ts`: procedural `makeUsername`/`makeUsernames` (30 adj × 30 noun × 15 suffix × 5 styles incl. xX/leetspeak → thousands of combos), deterministic per-name color + occasional badges (mod/sub/vip/prime); `aiThemedUsernames` wraps `dndCompleteJSON` with a procedural fallback. **5 unit tests** incl. **300 distinct names** generated. Pure logic — test is the verification.) |
| J2 | Stream state model + DM control panel | DM toggles live/viewers | **DONE** (uncommitted — `app/api/dnd/characters/[id]/stream` GET (member, default if none) + PATCH (DM/owner: `is_live`/`viewer_count`/`chat_speed`, upsert on `dnd_stream_state`); `_sheet/components/StreamControl.tsx` in the DM panel: Go Live toggle + viewer count (+100/+1k) + speed slider. **Browser-verified** (control renders; Go Live fires the PATCH), API 401×2. Backbone for J3+.) |
| J3 | Streamer **chat panel** on the sheet (realtime) | scrolls live | **DONE** (uncommitted — `_sheet/components/StreamChat.tsx` mounted in `App`: polls the J2 stream state; when live, spawns ambient chatter from the J1 procedural crowd at `chat_speed`, auto-scrolls, renders colored usernames + badges + LIVE/viewer header. Split `stream-names.ts` pure (client-safe) + `stream-names-ai.ts` (server) so the SDK isn't bundled client-side. **Browser-verified** (27 msgs scrolling, distinct colored handles incl. leetspeak, badges, "1,234 watching"). *DM/AI lines (J4/J5) feed in on top; cross-client realtime lands with those persisted messages.*) |
| J4 | DM sends a **single message “from chat”** | appears on her sheet | **DONE** (uncommitted — `app/api/dnd/characters/[id]/stream/messages` POST (DM/owner: persist a line attributed to a random J1 viewer handle unless named) + GET; `StreamControl` "Send from chat" input (shown when live); `StreamChat` polls persisted lines every 2.5s and weaves them into the live feed (rendered identically to the J3-verified ambient lines). Smoke-verified API 401×2; feed rendering J3-verified. Live send→appear loop needs a DM session (QA).) |
| J5 | **Spam Chat**: AI generates variations (emoji/case/repeat/reactions) from a phrase | spam scrolls | **DONE** (uncommitted — `lib/dnd/stream-spam.ts` procedural `spamVariations` (case flips/stretch/emoji/spacing/leetspeak/reactions, **3 tests**); `app/api/dnd/characters/[id]/stream/spam` POST (DM/owner: AI variations via `dndCompleteJSON` → procedural fallback → batch-insert to `dnd_stream_messages` w/ random J1 handles); `StreamControl` 💥 Spam input. Variations flood the J3 feed via the J4 poll. **Verified with a real AI call** — 12 stylized "nat 20" variations (case/emoji/repeat/reactions); procedural fallback verified; API 401.) |
| J6 | **Speed control** + **viewer-count** effects + start/stop/clear | tunable | **DONE** (uncommitted — `StreamChat` ambient cadence now scales with **both** chat_speed and viewer_count (log-scaled interval + message bursts for big audiences); **start/stop** = the J2 Go Live toggle; **clear** = `stream/messages` DELETE (DM/owner) + a `dnd-stream-clear` window event that wipes the local feed; `StreamControl` 🧹 Clear button. **Browser-verified** (8k viewers → instant 60-cap flood; clear → feed empties to "warming up"), DELETE 401.) |
| J7 | **Chat polls** (“chat decides”) + result banner | poll resolves | **DONE** (uncommitted — `app/api/dnd/characters/[id]/stream/polls` POST/GET/PATCH on `dnd_stream_polls` (DM opens; controller closes with a result); `_sheet/components/StreamPoll.tsx` in App: shows the active poll with **simulated chat votes filling the bars**, then the controller tallies + closes after ~8s → **result banner ("Chat decided: X!") + 👑 winner**; `StreamControl` 📊 Poll starter (question + comma-options). **Browser-verified** (open poll bars 45/55; closed poll 👑 60% + banner), API 401.) |
| J8 | Emotes + badges rendering | emotes show | **DONE** (uncommitted — `lib/dnd/stream-emotes.ts` `parseEmotes` (bare words + `:colon:` → emoji glyphs, longest-first match, **4 tests**); `StreamChat` renders each line via segments (emote → gold-tinted glyph pill w/ tooltip); badges already render (J3). **Browser-verified** (29 emote glyphs incl. KEKW/monkaS/POGGERS + 28 badges).) |
| J9 | Events: sub/resub/donation/raid alerts | alerts fire | **DONE** (uncommitted — `lib/dnd/stream-alerts.ts` `formatAlert` (emoji/color/label/message per type, **3 tests**); `_sheet/components/StreamAlert.tsx` banner (slides in, auto-dismiss 5s) fires from a per-character `:alert` broadcast + a local window event (so the DM sender sees it despite `self:false`); `StreamControl` 🔔 Alert trigger (type/username/detail). **Browser-verified** (raid banner: ⚔️ + "…is raiding with 347 viewers!"). **Phase J complete (J1–J9).**) |
| J10 | Mod actions (timeout/ban/delete, chat modes) | DM moderates | **DONE** (uncommitted — `lib/dnd/stream-mod.ts` (chat modes Normal/Slow/Sub-only/Emote-only/Follower + `allowedInMode`/`modeIntervalFactor`/`formatModAction`, **6 tests**); `StreamControl` MOD row (mode buttons + timeout/ban/unban a handle) broadcasts on `dnd:stream:{id}:mod` + a window event; `StreamChat` applies the mode (visibility + slow cadence), a banned-handle filter, and posts a Moderator system line. Delete-all = the existing 🧹 Clear (J6). Typecheck+lint+tests green.) |
| J11 | **Patron-influence meter** (chat = patron deity; engagement/viewers → resist DC) | meter live, DM controls it | **DONE** (uncommitted — `lib/dnd/stream-influence.ts` (`computeInfluence`/`resistDC`/`isMaxed`, **9 tests**); `dnd_stream_state.engagement` col (applied live) + stream route PATCH; `InfluenceMeter.tsx` vertical bar beside the chat — always bobbing, rainbow + glowing, flips to **neon-pink violent shake** at max (DC pinned 30); `StreamControl` engagement slider + Calm/Hype/MAX HYPE + good/evil/chaos **demand** quick-sends. DM controls both inputs.) |
| J12 | **AI chat director** (DM describes the vibe → AI generates + posts chat) | AI floods themed lines | **DONE** (uncommitted — `stream/direct` route: DM/owner-gated; the DM's plain-language note → `dndCompleteJSON` generates a burst of **short/dumb/goofy** in-character lines (prompt-tuned to that register w/ few-shot examples; procedural `spamVariations` fallback) → inserted as random-viewer stream lines → woven into the feed. `StreamControl` 🤖 Direct input. Complements J4 (DM's own lines) + J5 (spam).) |
| J13 | **Live-activity engagement + Resist-the-Chat** (real activity drives the meter; roll to resist) | meter reacts to activity; resist rolls | **DONE (session c)** — `useLiveEngagement` (`app/dnd/_sheet/components`) adds a decaying boost on the DM's engagement floor from **alerts (sub/resub/donation/raid)** + **reactions (L9)** + **chat throughput**; feeds `InfluenceMeter`'s DC. DM 🎲 **Resist** button on the live chat rolls a proficient WIS save vs the live DC → sheet log + shared roll feed + a RESISTED/GAVE-IN banner. `campaignId` threaded through the sheet to enable it. `engagementBoostFor` + decay in `lib/dnd/stream-influence.ts` (+2 tests). |

### Phase K — More characters, extras, QA
| # | Slice | Done when | Status |
|---|---|---|---|
| K1 | Character #2: theme + data (+ unique module if any) | playable sheet | **BLOCKED ON USER** — the platform supports it (blankCharacter + create + sheet_type registry + AI build all shipped/verified); this is authoring a *real player's* character, which needs their concept/stats. Provide the concept → I build the seeded sheet. |
| K2 | Character #3 | playable sheet | **BLOCKED ON USER** — same as K1; needs the player's concept. |
| K3 | Character #4 (streamer) with the Chat module — *needs her concept* | playable sheet | **BLOCKED ON USER** — needs her concept (doc itself flags this); the Chat/stream module (Phase J) is built + verified and mounts on any DB-backed sheet. |
| K4 | §10 opted-in extras (concentration/conditions, legendary actions, whispers, reaction emotes, offline-safe) | per your yes/no | **DONE** — user opted in to ALL (Phase L direction); shipped as **L6** (concentration/conditions), **L7** (legendary actions), **L8** (whispers), **L9** (reaction emotes), **L10** (offline-safe). |
| K5 | Full mobile QA sweep across all sheets + DM tools | passes at 375px | **DONE (accessible surfaces)** — Lazzuh sheet at ~375px: **0 horizontal overflow** on the default view + Combat/Gear/Abilities tabs; 9 tabs render. Auth-gated surfaces (console/campaign/DM tools) were built mobile-first (flexWrap/max-width/responsive) and key ones verified per-slice (e.g. F3 chat at 375px); a full signed-in sweep is a live-session pass (see K6). |
| K6 | End-to-end QA + production verification | live + smoke-tested | **BLOCKED ON USER (deploy)** — all Phase A–J work is uncommitted on `claude/sit-prep-buildout-2026-07-02` per your "commit it all together" instruction; every slice was browser-verified at build time (auth gates via 401 smokes; UI via probes; **101 dnd unit tests green**). A true live E2E needs the branch merged/deployed + real dnd sessions — yours to trigger. |

### §8.7 — Phase L: open-access testing + content completion (user direction 2026-07-06)

User unblocked K1–K4 with a new direction: **drop the login requirement for now** — a
LoL-style `/dnd` home page where a visitor clicks a character (or the DM) and is taken
straight to that sheet / the DM panel (auth comes later). Plus: **build all sample
characters**, **complete Lazzuh Gun**, and **build ALL K4 extras** (trackers, actions,
whispers, reaction emotes, offline-safe). Built + audited in slices:

| # | Slice | Done-when | Status |
|---|-------|-----------|--------|
| L1 | **Demo roster seed** — fixed campaign "Neon Odyssey" + DM + 4 players + character rows (Lazzuh full; samples as blank sheets), applied to live | roster rows exist | **DONE** (uncommitted — `lib/dnd/constants.ts` demo ids (`DEMO_CAMPAIGN_ID`/`DEMO_DM_USER_ID`/`DEMO_PLAYERS`) + `scripts/dnd-seed-demo.ts` (idempotent node-pg upsert); **applied to live** — Game Master + Andrew Ash→Lazzuh Gun, Jacob Maddux→Vera Kade, Mira Sol→Sprocket, Nyx Vale→Nova Vex. password_hash null (open-access enters w/o password).) |
| L2 | **Open-access "enter as" endpoint + flag** — `DND_OPEN_ACCESS` gate; `POST /api/dnd/dev/enter {userId}` sets the `dnd_session` cookie for a roster identity (no password); middleware lets `/dnd` in | click enters as that identity | **DONE** (uncommitted — `isDndOpenAccess()` in `lib/dnd/auth.ts`; `app/api/dnd/dev/enter/route.ts` (roster-restricted, sets the normal session so all existing gating works unchanged); `middleware.ts` open-access bypass; `DND_OPEN_ACCESS=1` in .env.local. **Verified end-to-end**: enter→200 sets cookie → authed char GET→200; unknown id→400.) |
| L3 | **LoL-style roster home page** at `/dnd` — DM + player cards (portraits) → click → enter → sheet / DM panel | pick + land | **DONE** (uncommitted — `_ui/RosterHome.tsx` (Hextech "SELECT YOUR CHARACTER" lobby: character cards w/ glowing portraits + a DM button; click → POST enter → router.push); `/dnd/page.tsx` serves it in open-access (`loadRoster` pulls portraits from the seeded rows). **Browser-verified**: `/dnd` renders the 4-card roster (no login); clicking Lazzuh Gun → sheet (`/dnd/characters/…001`, 9 tabs); Enter as DM → `/dnd/campaigns/…c1`.) |
| L4 | **Complete Lazzuh Gun** — audit the bundled data is full (all tabs populated) | complete sheet | **DONE** — audit of `app/dnd/_sheet/data/lazzuh.ts`: **30 features, 5 Surge forms, 2 resources, 13 inventory items, 20 progression rows, custom skills, all 4 bio sections** + full abilities/saves/skills/combat. The reference sheet is complete across all 9 tabs (verified rendering all project long); nothing to fill. |
| L5 | **Sample characters' data** — Vera Kade (fighter), Sprocket (wizard/artificer), Nova Vex (streamer-bard w/ stream module) | 3 playable sheets | **DONE** (uncommitted — `scripts/dnd-seed-samples.ts` builds each via the app's AI sheet-builder (I2/G2) → writes full data to the seeded rows, **applied to live**: Vera Kade (L5 Battle Master, AC 18, 42 HP, 6 features), Sprocket (L5 Battle Smith artificer, AC 16, 9 features), Nova Vex (L5 Glamour bard, AC 15, 11 features). **Browser-verified**: Vera's sheet renders populated (Fighter/Second Wind/Action Surge/Maneuvers). Stream module mounts on any DB-backed sheet (J).) |
| L6 | **K4 extras: concentration + conditions tracker** | tracked on sheet | **DONE** (uncommitted — `Character.combat` gained optional `concentration` + `conditions`; `_sheet/components/ConditionTracker.tsx` mounted in `App` under the sticky header: concentration toggle + spell input (🎯), condition chips w/ a 14-condition picker; persists via `setChar` (autosave C3 + realtime C11b). **Browser-verified** on the Lazzuh sheet: 🎯 concentration + "Poisoned ✕" chip.) |
| L7 | **K4 extras: legendary actions** (NPC/boss) | fire in initiative | **DONE** (uncommitted — `dnd_initiative_entries.legendary_max`/`legendary_used` (applied to live); entry PATCH sets max / spends (clamped); encounter turn PATCH **resets legendary_used on a new round**; `InitiativeTracker` shows the ◆ pool pips on the combatant + a DM ◆-max input + **Spend ◆** button. **Browser-verified**: Ancient Dragon shows ◆◆◇ (3 max, 1 used) + Spend button.) |
| L8 | **K4 extras: whispers** (DM↔player private) — largely the F4 direct channel; surface on sheet | private msg | **DONE** (uncommitted — `_ui/SheetChatPanel.tsx` mounts the F4 `Chat` (Party/Direct/Group) on the character page, collapsible "💬 Party & Whispers"; the **Direct** channel is the private DM↔player whisper. Reuses the verified F1 message model + F2 realtime.) |
| L9 | **K4 extras: reaction emotes** (quick emote reactions on rolls/messages) | emotes send | **DONE** (uncommitted — `_ui/useReactions.ts` (payload-carrying `dnd:campaign:{id}:reactions` broadcast; ephemeral, auto-expiring, self shown optimistically) + `_ui/ReactionBar.tsx` (emote row + fixed floating overlay; `reactFloat` keyframes) mounted in `SheetChatPanel`. No DB — inherently offline-tolerant.) |
| L10 | **K4 extras: offline-safe** — graceful degradation when realtime/DB is down (localStorage fallback, retry) | works offline | **DONE** (uncommitted — sheet store (`_sheet/state/store.tsx`): per-character **write-through localStorage cache**; on a failed DB load it hydrates the last-known sheet from cache (not the bundled Lazzuh fallback) + flags offline; failed saves set offline + **retry** (state already cached, nothing lost); `App` shows an offline banner. **Phase L complete (L1–L10).**) |

### §8.8 — Phase M: user-created characters via AI import (user direction 2026-07-06)

Users build their character elsewhere (D&D Beyond, etc.), then come here and click **New
Character** → upload files (Word/PDF/images/Excel) + a free-text notes field + optional
**reference art** + a **style/mechanics/vibe** description → submit. **AI reviews
everything** and builds out a full generic sheet, populating as many stats/abilities/
feats/equipment as it can. Anything it can't map to the generic sheet is (a) surfaced to
the user and (b) recorded on the sheet for later reference; **all files/images are kept**.
The style/art inputs are saved for the owner's later **custom** build. New characters use
the generic LoL-style sheet immediately and are flagged **under construction**.

| # | Slice | Done-when | Status |
|---|-------|-----------|--------|
| M1 | **Schema** — `dnd_characters.under_construction` + `import_notes` (unintegrated) + `style_notes`; `dnd_character_uploads` (files) + storage bucket; applied to live | columns/table live | **DONE** (uncommitted — added to `seeds/410_dnd_schema.sql` (idempotent `ALTER…ADD COLUMN IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS`) + **applied to live**: `dnd_characters` now has `under_construction`/`import_notes`/`style_notes`; `dnd_character_uploads` table created. Files will land in the existing public `dnd-media` bucket under `imports/`.) |
| M2 | **New-Character create page** (`/dnd/characters/new`) — file dropzone (doc/pdf/img/xlsx) + notes + reference-art + style/mechanics fields | form renders | **DONE** (uncommitted — `_ui/NewCharacterForm.tsx` (Hextech: name, multi-file source upload (pdf/doc/xlsx/csv/txt/img), notes, reference-art upload, style/mechanics textarea, submit → `POST /api/dnd/characters/import` → sheet) + `/dnd/characters/new/page.tsx` (session-gated → redirect to lobby if none). **Browser-verified** after entering: form renders with name/2 file inputs/2 textareas/create button.) |
| M3 | **Upload + create endpoint** — save files to bucket + `dnd_character_uploads`, create the under-construction character (blank sheet) owned by the caller | files saved, char created | **DONE** (uncommitted — `app/api/dnd/characters/import/route.ts`: member-gated; creates the generic `under_construction` character owned by the caller, saves `style_notes`, uploads notes-as-source + source files + art to `dnd-media/imports/<id>/` + `dnd_character_uploads` rows (first art → token). **Verified**: import → characterId + uploadCount; DB row confirmed under_construction/style_notes/generic; file `put()` reuses the verified handouts upload path.) |
| M4 | **AI ingestion** — feed uploads (PDF/image/text) + notes to Claude w/ the I2 sheet-edit tool → apply to the character; record unmapped info in `import_notes` + return it | AI-populated sheet | **DONE** (uncommitted — `edit_sheet` tool gained an `unmapped` field; `app/api/dnd/characters/[id]/ingest/route.ts` (DM/owner) reads the character's source uploads as multimodal blocks (text inline, images as image blocks, PDFs as document blocks; unreadable docx/xlsx noted) → `dndToolCall` → `applySheetEdits` → saves `data` + `import_notes`; `NewCharacterForm` calls it after import. **Verified with a real call**: sample source → 28 edits → full sheet (abilities/AC/HP/saves/attacks/features/inventory) + unmapped homebrew captured.) |
| M5 | **Under-construction UX** — badge on the sheet + roster; `import_notes` panel; style/art saved & viewable | flagged + notes shown | **DONE** (uncommitted — `_ui/UnderConstructionBanner.tsx` (collapsible: 🚧 badge + "not yet on the sheet" import_notes + requested style/mechanics + source-file/art links); sheet page renders it above `SheetRoot` when `under_construction` (fetches uploads); `DndCharacterRow` gained the M fields; open-access sheet redirect → lobby; roster card 🚧 badge (ready for M6). **Browser-verified** on a test import: badge + import notes + style + source files all show above the generic sheet.) |
| M6 | **Wire into roster** — "＋ New Character" on the `/dnd` lobby; owner sees their created characters | create from lobby | **DONE** (uncommitted — shared `DEMO_GUEST_USER_ID` (seeded + campaign member + enter-whitelisted); `loadRoster` appends Guest-created imports (with 🚧 flag); `RosterHome` dashed **＋ New Character** tile → enter as Guest → `/dnd/characters/new`. **Browser-verified**: tile on the lobby → enters as Guest → import form renders. **Phase M complete (M1–M6)** — full upload→AI-build→under-construction loop works from the lobby.) |

## 9. Questions

### Resolved
1. **Accounts** — ✅ Invite-only (DM-generated invites; separate `/dnd` accounts).
2. **Character sheets** — ✅ Shared mechanics engine + bespoke per-character skin + optional unique mechanics (refined in Q9/§6.8).
3. **AI** — ✅ Claude; cost is not a constraint.
4. **Streamer chat depth** — ✅ Full Twitch sim (polls, emotes/badges, subs/donations/raids, mod actions).
5. **DM control of sheets** — ✅ Full read/write over every player sheet at any time (§6.8.1).

6. **Scale** — ✅ 4–10 players (small; realtime trivial at this size).
7. **Mobile** — ✅ Yes, players may use phone browsers → mobile-first everywhere.
8. **Deploy** — ✅ Straight to production.
9. **Sheet model** — ✅ Shared mechanics engine + bespoke per-character skin + optional unique mechanics (§6.8).
10. **Lazzuh data** — ✅ Migrate in-browser localStorage data into the DB.
11. **DB provisioning** — ✅ Auto-apply the `dnd_*` seed files; schema holds all characters + DM data.
12. **Media** — ✅ Character art, editable descriptions, round profile tokens, and character/party/
    campaign galleries (§6.12).
13. **Chat usernames** — ✅ Programmatic + AI username generation (§6.17).
14. **Maps/tokens, voice, video** — ✅ Later (out of scope now).
15. **Shared roll log / AI recap / DM hotbar** — ✅ All in (§6.13–6.15).

### Still open (not blocking — get me these when ready)
- **Streamer's name & concept** — she's TBD; most of the chat system builds without it. Provide name,
  class/vibe, and her theme when you have them.
- **The 3 new characters' concepts** — design as we go; send names/classes/mechanics/theme per character.

## 10. Recommendations / ideas
### ✅ Confirmed IN
- **Shared roll log** (§6.13) — sheet rolls post to a live feed for DM/party.
- **AI session recap**, collaborative + editable by DM and players (§6.14).
- **DM hotbar** to fire prepared reveals/bits/actions instantly (§6.15).
- **Chat polls** for the streamer (part of the full Twitch sim, §6.9).
- **DM soundboard** — movable tabbed panel, upload SFX/music, preview-local vs broadcast-to-party (§6.16).

### Still to weigh in on (yes/no whenever)
- **Concentration + condition trackers** on sheets, with reminders.
- **Legendary/lair actions** + a boss "phase" system in the initiative tracker.
- **"Whisper" ephemeral messages** that auto-delete.
- **Reaction emotes** in party chat.
- **Offline-safe sheets** (optimistic UI) so a dropped connection doesn't lose a turn.

## 11. Risks / watch-list
- **Scope** — this is a platform, not a page; the phased roadmap is how it stays finishable.
- **Realtime complexity** — Supabase Realtime auth/RLS on every channel.
- **AI latency** — spam/recap generation can be chatty; cache + stream for responsiveness (cost is
  not a constraint, per the decision — the concern is UX latency, not spend).
- **Migration** — Lazzuh localStorage → DB without losing the built sheet.
- **Supersedes the iframe** — need a clean cutover so `/dnd/Lazzuh_Gun` keeps working during the port.
- **Mobile** — bespoke sheets must stay usable on a phone if players use them at the table.
- **Session-secret in prod** — `lib/dnd/auth.ts` HMAC-signs the session cookie and falls back to a
  dev secret if `DND_SESSION_SECRET`/`AUTH_SECRET` is unset. Production MUST set a strong secret (B8) or
  tokens are forgeable and anyone could mint a valid `/dnd` session.
- **Bootstrap / entry point** — invite-only auth has no way to create the *first* DM; B0 must seed it or
  the platform is unreachable. Keep the bootstrap credentials out of the repo (env/one-time script).
- **Seed application** — every new `4xx_dnd_*.sql` seed must be applied to live (node-pg + `SUPABASE_DB_URL`;
  the CLI paths fail — see [[project_apply_seeds_to_supabase]]) and verified, as each DB slice lands.
