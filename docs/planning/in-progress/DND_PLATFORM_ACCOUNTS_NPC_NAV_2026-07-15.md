# Platform: persistent sessions, campaign-free characters, demo join, DM NPC viewer, header user + back nav

**Goals (from the DM), for the `/dnd` platform (custom cookie auth, all `dnd_*` tables via
`supabaseAdmin`, authorization in app code — not RLS):**

1. **Session persistence** — when new users create an account, their session persists (they stay signed
   in across navigations/reloads).
2. **Campaign-free character creation** — a user can **fully create and build a custom character sheet**
   (any `sheet_type`, full editor) **without being in any campaign**.
3. **Add characters to the open-access demo campaign** — any signed-in user can add a character to the
   Neon Odyssey demo campaign.
4. **DM-only NPC viewer** — a viewer the DM can open for their campaign that shows the campaign's NPC
   characters; NPCs must not appear anywhere for anyone else.
5. **Signed-in user in the top bar** — the header shows who is signed in.
6. **Back navigation** — a "back to last page" button in the top-left of the header.

## Current state (from a code map)

- **Auth** — `lib/dnd/auth.ts`: signed `dnd_session` cookie (HMAC, 30-day `MAX_AGE`), secret from
  `DND_SESSION_SECRET || AUTH_SECRET || NEXTAUTH_SECRET || 'dnd-dev-secret-change-in-prod'`. `setDndSession`
  sets `secure` only in production. Most new users arrive via `POST /api/dnd/auth/quick` (name+password);
  `HubSignIn.tsx` then calls `router.refresh()` (no hard reload). `getDndUser()` reads the session.
  Likely persistence culprits, in order: (a) an **unstable/dev-default secret** across serverless
  instances → `verifyToken` returns null next request; (b) `router.refresh()` racing the Set-Cookie;
  (c) `secure` cookie over plain HTTP. Test: `__tests__/dnd/auth.test.ts`.
- **Characters** — `dnd_characters` (`campaign_id` **nullable**, `owner_user_id`, `sheet_type`, `data`
  jsonb, `visibility`, `is_npc`, `is_library`, `claimable`, `played_by_user_id`). Type `DndCharacterRow` +
  `getCharacterAccess()` in `lib/dnd/characters.ts`. **Both create routes require a campaign**:
  `POST /api/dnd/characters` (DM-only, needs `campaignId`), `POST /api/dnd/characters/import` (any member,
  403 if `getCampaignRole(campaignId)===null`). UI `app/dnd/characters/new/page.tsx` +
  `_ui/NewCharacterForm.tsx` default to `DEMO_CAMPAIGN_ID`. A brand-new quick user who isn't a demo member
  hits **403**.
- **Campaigns/demo** — `dnd_campaigns`, `dnd_campaign_members` (`role dm|player`), join
  `dnd_campaign_characters`. `DEMO_CAMPAIGN_ID` in `lib/dnd/constants.ts`; seeded by
  `scripts/dnd-seed-demo.ts`; `ensureDemoStreamer()/ensureDonata()` self-heal in
  `lib/dnd/campaign-summary.ts`. **No general auto-join to the demo exists.**
- **NPCs** — `is_npc` column (+ index), created via `POST /api/dnd/characters {isNpc:true}` (owner=DM,
  `visibility:'private'`). `GET /api/dnd/characters?npc=1` is DM-gated (non-DM narrowed to own rows).
  `getCharacterAccess` blocks non-DM/owner from opening a private NPC sheet. DM UI `_ui/NpcLibrary.tsx`.
  Summaries already exclude `is_npc`.
- **Header/nav** — `app/dnd/_ui/DndHeader.tsx` (rendered by `app/dnd/layout.tsx`) is a **static server
  component, no session, no back control**; only "Lobby" + "＋ Character" links. The one existing "Signed
  in as {name}" + sign-out lives in `_ui/HubSignIn.tsx` (hub only). Session available via `getDndUser()`
  (server) or `GET /api/dnd/auth/session` (client). Back links are ad-hoc hardcoded `←` hrefs per page.

## Slices

- **Slice 0 — Planning doc** *(this file)*.
- **Slice 1 — Header: signed-in user + back button.** ✅ `app/dnd/layout.tsx` is now an async server
  layout that reads the signed cookie via `getDndSession()` (sync, DB-free) and passes `userName` to
  `DndHeader`. `DndHeader` shows **"Signed in as {name}"** + the existing `LogoutButton` when signed in,
  or a **Sign in** link otherwise, and renders a new top-left **← Back** control
  (`app/dnd/_ui/HeaderBack.tsx`, a client island calling `router.back()`, hidden on the `/dnd` hub root via
  `usePathname`). Covers requests 5 + 6. Verified: `tsc --noEmit` clean (0 errors) and `next lint` clean on
  the three changed files. *(Runtime smoke needs the app's Supabase env, absent here — only `.env.example`
  exists — so DB-backed pages can't be driven; the change itself is cookie-only + type-checked.)*
- **Slice 2 — Session persistence.** ✅ Hardened `lib/dnd/auth.ts`: (a) **loud production warning** when
  the session secret falls back to the shared dev default (forgeable + can stop verifying → surfaces as
  "keeps signing me out"), so `DND_SESSION_SECRET` gets configured; (b) a **`DND_COOKIE_INSECURE=1`
  escape hatch** on the cookie's `Secure` flag — the most likely real cause of new sessions not sticking
  is a deployment served over plain HTTP behind a TLS-terminating proxy, where the browser drops a Secure
  cookie; the flag lets such deployments persist. Cookie options refactored into `sessionCookieOptions()`.
  Extended `__tests__/dnd/auth.test.ts` with a persistence test (a 30-day token — what `setDndSession`
  issues — verifies repeatedly). Verified: `tsc` clean, 7/7 auth tests pass, lint clean. *(The post-
  sign-in `router.refresh()` in `HubSignIn` was left as-is — it re-runs the server layout which reads the
  freshly-set cookie; the Secure-flag drop is the higher-confidence root cause and needs the live
  deployment to confirm.)*
- **Slice 3 — Campaign-free character creation.** Allow creating + fully building a character with **no
  campaign**: relax `POST /api/dnd/characters/import` (and `/characters`) to accept a null/absent
  `campaignId` — owned by the caller, `visibility` private (or public), no membership check on that path;
  update `characters/new/page.tsx` + `NewCharacterForm.tsx` to offer "No campaign (personal)" and not
  force the demo fallback. Confirm `getCharacterAccess` lets the owner read/write a campaign-less sheet
  and the sheet editor (`app/dnd/characters/[id]`) works. Verify: a member-less user can create and open a
  fully-editable sheet.
- **Slice 4 — Add a character to the demo campaign.** A path for any signed-in user to attach a character
  (new or campaign-free) to the open-access demo: an API (e.g. `POST /api/dnd/campaigns/[id]/join-character`
  restricted to open-access campaigns) that upserts `dnd_campaign_members` (player) + `dnd_campaign_characters`
  and sets the character's home `campaign_id`; plus a UI affordance ("Add to Neon Odyssey"). Verify: a
  campaign-free character becomes visible in the demo roster and the user is a member.
- **Slice 5 — DM-only NPC viewer.** Give the DM a dedicated **NPC viewer** for their campaign (a section/
  page listing the campaign's `is_npc` characters, reusing the DM-gated `?campaignId&npc=1` list and
  `NpcLibrary`), reachable from the campaign hub. Re-assert server-side that non-DMs cannot list NPCs
  (`GET /characters` narrowing) or open an NPC sheet (`getCharacterAccess` private gate), and that
  campaign summaries/rosters shown to players exclude NPCs. Verify: DM sees NPCs in the viewer; a player
  session gets none from the list API and 403 on an NPC sheet.
- **Slice 6 — QA + docs.** End-to-end pass across the six features (session persists, campaign-free create
  + build, demo join, NPC visibility, header user + back), run the dnd vitest suite, then move this doc to
  `completed/`.

## Considerations
- **Follow the existing pattern:** service-role client + explicit app-code authorization (no RLS); reuse
  `getCampaignRole`, `getCharacterAccess`, the `dnd_campaign_characters` join, and `DEMO_CAMPAIGN_ID`.
- **Backward compatible:** `campaign_id` is already nullable; the change is loosening create-route guards
  and the UI default, not a schema migration (add one only if a new flag is needed).
- **NPC safety is the sensitive one:** verify the DM-only gate on *both* the list API and the per-sheet
  read path, and that no player-facing summary leaks NPCs.
- **Verification:** these are app/server features — prefer the dnd vitest suites + driving the actual
  routes/pages; note any check that can't run headlessly.

### Status: IN PROGRESS (Slices 0–2 shipped; 3–6 pending)
