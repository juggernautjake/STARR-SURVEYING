# D&D Campaign Platform — hidden DM + Player system (DRAFT)

> **Status:** 🟢 BUILD-READY DRAFT — scope locked and broken into ~100 ordered, ship-able slices
> (§8.6, phases A–K) the stop hook can execute one at a time. **Intentionally kept in `drafts/`** — do
> NOT move to `in-progress/` until the user explicitly says so. Created & finalized 2026-07-06;
> audited & expanded 2026-07-06 (NPC system, agentic AI sheet builder/editor, and the full **rules &
> effects engine** — equipment, custom content, connected math).
> **First slices:** Phase A (DB seeds + storage) → Phase B (invite auth) → Phase C (port + perfect the
> Lazzuh sheet, DB-backed) → Phase D (art / token / descriptions / galleries).

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
| B1 | Auth lib: session model + password hashing + `lib/dnd/auth.ts` | unit-tested helpers | **DONE** (bcryptjs + HMAC cookie; 6 tests) |
| B2 | Auth API routes: register(via invite)/login/logout/session | routes return correct states | **DONE** (`app/api/dnd/auth/*`) |
| B3 | `/dnd/login` page (mobile-first) | can sign in | TODO |
| B4 | `/dnd/join/[code]` invite acceptance → account creation | invited user registers | TODO |
| B5 | DM invite generation UI + API (create/revoke codes) | DM mints a working invite | TODO |
| B6 | Route protection for `/dnd/**` (except login/join) + redirects | unauth’d users bounced | TODO |
| B7 | Profile (display name + avatar upload) | persists | TODO |

### Phase C — Sheet engine port (Lazzuh → native, DB-backed)
| # | Slice | Done when | Status |
|---|---|---|---|
| C1 | Vendor sheet source into `app/dnd/_sheet/` + **scope its CSS** under `.dnd-sheet` | no global leakage on other pages | TODO |
| C2 | Sheet renders as a Next **client component** (fed static data) | renders identically to standalone | TODO |
| C3 | DB-backed store: load/save `dnd_characters.data` via API (replaces localStorage) | edits persist to DB | TODO |
| C4 | Character load/save API routes (+ owner/DM authorization) | player sees own; DM sees all | TODO |
| C5 | Migrate Lazzuh’s data into a `dnd_characters` row via **Export JSON → import endpoint** (localStorage can’t be read server-side, so use the sheet’s existing Export or a one-time in-browser “migrate” action) | Lazzuh loads from DB with the current build | TODO |
| C6 | Render Lazzuh natively at `/dnd/Lazzuh_Gun`; **retire the iframe** | all mechanics verified native | TODO |
| C7 | Theme layer: extract Lazzuh palette/fonts/FX into a `theme` config the engine reads | theme swap works | TODO |
| C8 | `sheet_type` registry + **module system** (Lazzuh forms as a module) | modules load per character | TODO |
| C9 | Full mobile-responsive pass on the sheet | usable at 375px | TODO |
| C10 | **DM sheet-control UI (§6.8.1):** DM mode unlocks every field + an override panel (stats/AC/HP/DC/inventory/resources/forms), reusing the temp/permanent + revert system | DM edits any player field live | TODO |
| C11 | **Realtime character sync + edit log:** sheet edits push live between player and DM; DM overrides recorded in `dnd_sheet_edits` | player sees DM changes instantly | TODO |

*— Rules & effects engine, equipment, and custom content (core mechanics — §6.18) —*
| C12 | **Derivation engine:** generalize the computed layer into a base→derived pipeline (mods, prof, saves, skills + passives, AC, init, HP, spell DC/atk, attack bonuses, speed, resistances) with **recompute-on-change** | all derived numbers recompute from base | TODO |
| C13 | **Effects system:** structured `{target, operation, value, condition}` effects from items/feats/features/spells/conditions feed the pipeline; stacking + conditional rules | an effect changes the right numbers | TODO |
| C14 | **Equipment core:** inventory + **equip/unequip** + **attunement** (cap 3) + weight/encumbrance + currency | items equip and persist | TODO |
| C15 | **Armor → computed AC** (light/medium/heavy, DEX cap, don/doff, stealth) | AC reflects worn armor + effects | TODO |
| C16 | **Weapons → attack entries** (damage dice/type, properties, versatile/2H, range, mastery) auto-wired | equipping a weapon adds its attack | TODO |
| C17 | **Magic items** — bonuses + special features as effects (attunement-gated) affecting AC/attack/damage/saves/DC/resist/speed | a +1 item changes the math | TODO |
| C18 | **Attack builder + roll integration** — base ability + prof + dice + type + bonuses + effects; computed to-hit & damage fired through the roll engine (crit/adv/conditional; save-based uses computed DC) | custom attack rolls correctly | TODO |
| C19 | **Custom content builder** — create custom armor/weapons/items/feats/spells/abilities/attacks (stats + effects) → `dnd_content` library, usable on any character/NPC | homebrew item affects the sheet | TODO |
| C20 | **AI + real-time control over the model** — AI/DM edits (via the I2 tool) to stats/items/effects/attacks recompute live and sync to player + DM | AI edit updates all connected numbers live | TODO |

### Phase D — Character media & galleries
| # | Slice | Done when | Status |
|---|---|---|---|
| D1 | Character **art** upload + display on the sheet | art shows + persists | TODO |
| D2 | Round **profile token** upload + display (sheet header) | token shows | TODO |
| D3 | **Editable descriptions** (bio/appearance/personality/notes) persisted | edits save | TODO |
| D4 | **Character gallery** (per-character images) + lightbox | grid + zoom, mobile-swipe | TODO |
| D5 | **Party gallery** (all members’ art + tokens) | roster view | TODO |
| D6 | **Campaign gallery** (all campaign media) | grid | TODO |

### Phase E — Campaigns / sessions / DM dashboard  *(Hextech style, §6.19)*
| # | Slice | Done when | Status |
|---|---|---|---|
| E1 | **Hextech DM design system** (§6.19): scoped CSS tokens + fonts (Cinzel/Inter) + primitives — framed panels, angular gold buttons, ornamental dividers, portrait/token frames, tabs, hex FX; mobile-graceful | primitives render on a demo page | TODO |
| E2 | DM dashboard: campaign list + create (Hextech home/card style) | DM creates a campaign | TODO |
| E3 | Campaign page: members, characters, sessions list (framed panels) | shows roster + sessions | TODO |
| E4 | Session CRUD + **session console shell** (Hextech tabbed panels) | console opens per session | TODO |
| E5 | Session prep: notes editor (private + shareable) | notes persist | TODO |
| E6 | Session prep: map/image uploads to the session | images attach | TODO |
| E7 | **Character creation + assign to a player** (DM creates a `dnd_characters` shell of a `sheet_type` and sets `owner_user_id`; or an invite pre-assigns one) | a player logs in and sees *their* character | TODO |
| E8 | Session status flow (prep → live → done) + "go live" | console reflects state | TODO |

### Phase F — Messaging / chat
| # | Slice | Done when | Status |
|---|---|---|---|
| F1 | Message model + send/list API per channel | messages store/return | TODO |
| F2 | Realtime subscription (Supabase) — party channel | live delivery | TODO |
| F3 | Party chat UI (mobile-first) | send/receive on phone | TODO |
| F4 | Direct + custom-group channels | targeted messages work | TODO |
| F5 | Image attachments (upload + display, saved to history) | image re-viewable | TODO |
| F6 | Presence (online) + unread badges | accurate | TODO |

### Phase G — NPCs, initiative, quick sheet/actions, roll log
NPCs run on the **shared sheet engine** (Phase C), so they get full sheets + rolls + DM control for free.
| # | Slice | Done when | Status |
|---|---|---|---|
| G1 | **NPCs as DM-owned characters** (`is_npc`): create manually → a **full sheet, hidden by default** | NPC has a real sheet | TODO |
| G2 | **Full agentic AI NPC build** — the DM describes an NPC and the AI builds the **entire sheet** (stats, feats, class features/abilities, attacks, spells, resources, inventory) + conversational refine (uses I1+I2) | AI builds a complete playable NPC | TODO |
| G3 | **NPC library** (`is_library`): save/browse/search + **drop a copy** into a session/encounter (independent instance) | reuse across sessions | TODO |
| G4 | Encounter + initiative model/API (`dnd_encounters`, `dnd_initiative_entries`) | order + turn stored | TODO |
| G5 | **Dynamic initiative tracker UI**: add PCs (auto) + NPCs, set/roll init, **reorder + current-turn highlight**, next/prev, round, DM-managed turn advance | full turn loop | TODO |
| G6 | Per-combatant **HP/damage/conditions** on the tracker; PC HP syncs from sheets | HP tracked | TODO |
| G7 | **Quick sheet** — compact per-combatant panel (token/HP/AC/saves + **one-tap attack/check/save rolls**) without opening the full sheet | rolls from the tracker | TODO |
| G8 | **Quick-actions ⋮ menu** per combatant — Move / Dash / Dodge / Help / Hide / **Attack** (pick weapon → to-hit+damage) / **Cast a Spell** (pick spell) / **Grapple** / Shove / custom — derived from the NPC's kit so it works at any level/class | contextual actions fire | TODO |
| G9 | **Open full NPC sheet** — the DM can open the complete NPC character sheet **at any time** (from the quick sheet, the initiative ⋮ menu, or the NPC library) to view/edit everything | full sheet opens on demand | TODO |
| G10 | **Shared roll log**: every sheet / quick-sheet / quick-action / DM roll posts to the live feed | feed updates live | TODO |
| G11 | Realtime: players see the turn order + whose turn it is | live | TODO |
| G12 | **Preroll NPC initiatives during session prep** (set/auto-roll each prepped NPC's init so combat starts pre-ordered) + surface prepped NPCs in the prep console | encounter opens pre-ordered | TODO |

> **Dependency note:** the session-prep console shell ships in **E3**, but its *NPC-building* and
> *preroll* panels depend on this phase (the NPC engine). They fill into the prep console during
> G1–G3/G12 — that ordering is intentional, not a gap.

### Phase H — DM live tools (reveal / hotbar / soundboard)
| # | Slice | Done when | Status |
|---|---|---|---|
| H1 | **Image reveal**: pick an image + **audience (everyone / chosen group / individual)**; realtime broadcast; full-screen dim → slide-in-from-right → center → glowing moving animated outline | targeted recipients see it | TODO |
| H2 | Reveal dismiss (click-to-skip, per recipient) + **saved into that chat** (party / group / DM↔player) | re-viewable later | TODO |
| H3 | **Handout library** (reusable images/maps across sessions) feeding reveals + hotbar | handouts reusable | TODO |
| H4 | **DM hotbar**: quick-action bar (prepared reveals, saved bits, canned messages/handouts, next turn, AI shortcuts); drag-to-arrange + per-session loadouts | fires instantly | TODO |
| H5 | **Soundboard** data + upload; movable/resizable modal panel | panel opens, drags | TODO |
| H6 | Soundboard: create/name **tabs**, add/label sounds, arrange pads | multi-tab boards | TODO |
| H7 | Soundboard: **preview-local vs broadcast** + realtime audio channel + master stop/loop/volume | party hears broadcast, DM-only preview | TODO |
| H8 | Player client audio player (autoplay handling, per-player volume/mute) | plays on mobile after enable-tap | TODO |

### Phase I — AI tools
| # | Slice | Done when | Status |
|---|---|---|---|
| I1 | AI server scaffolding (`lib/dnd/ai.ts`, Claude, streaming) — **prerequisite for all AI slices** | test prompt returns | TODO |
| I2 | **Structured sheet-build/edit tool** — a Claude tool whose schema *is* the engine data model, so the AI can validly **create a full sheet** and **apply edits** to any character's `data`; agentic build/refine loop; writes to `dnd_sheet_edits` | AI produces a valid full sheet + applies edits | TODO |
| I3 | **"Ask AI to edit this sheet"** UI — natural-language sheet edits from the DM on any NPC/PC ("give them a greatsword & +2 STR", "add Fireball", "level to 10") | edits apply live | TODO |
| I4 | AI: generate plot points / hooks / lore | inserts into notes | TODO |
| I5 | AI: **session recap draft** from roll log + combat events + notes + reveals | draft generated | TODO |
| I6 | Recap **collaborative editor** (DM + players) → final, saved per session | co-edited final | TODO |

> **AI dependency:** **I1** (scaffolding) + **I2** (sheet-edit tool) underpin every AI feature — the
> full **AI NPC build (G2)**, natural-language sheet edits (**I3**), plot/lore (**I4**), recaps
> (**I5–I6**), and streamer-chat spam (**J5**). When the first AI slice comes up (**G2**), **pull I1
> and I2 forward** first. (G2 can ship manual-first and gain the AI build once I1/I2 land.)

### Phase J — Streamer Chat (full Twitch sim)
| # | Slice | Done when | Status |
|---|---|---|---|
| J1 | **Username generator** (procedural + AI) + per-name color/badges | hundreds of distinct names | TODO |
| J2 | Stream state model + DM control panel | DM toggles live/viewers | TODO |
| J3 | Streamer **chat panel** on the sheet (realtime) | scrolls live | TODO |
| J4 | DM sends a **single message “from chat”** | appears on her sheet | TODO |
| J5 | **Spam Chat**: AI generates variations (emoji/case/repeat/reactions) from a phrase | spam scrolls | TODO |
| J6 | **Speed control** + **viewer-count** effects + start/stop/clear | tunable | TODO |
| J7 | **Chat polls** (“chat decides”) + result banner | poll resolves | TODO |
| J8 | Emotes + badges rendering | emotes show | TODO |
| J9 | Events: sub/resub/donation/raid alerts | alerts fire | TODO |
| J10 | Mod actions (timeout/ban/delete, chat modes) | DM moderates | TODO |

### Phase K — More characters, extras, QA
| # | Slice | Done when | Status |
|---|---|---|---|
| K1 | Character #2: theme + data (+ unique module if any) | playable sheet | TODO |
| K2 | Character #3 | playable sheet | TODO |
| K3 | Character #4 (streamer) with the Chat module — *needs her concept* | playable sheet | TODO |
| K4 | §10 opted-in extras (concentration/conditions, legendary actions, whispers, reaction emotes, offline-safe) | per your yes/no | TODO |
| K5 | Full mobile QA sweep across all sheets + DM tools | passes at 375px | TODO |
| K6 | End-to-end QA + production verification | live + smoke-tested | TODO |

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
