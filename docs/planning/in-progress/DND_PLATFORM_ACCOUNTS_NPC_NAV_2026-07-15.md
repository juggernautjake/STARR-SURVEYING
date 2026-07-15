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
- **Slice 3 — Campaign-free character creation.** ✅ `POST /api/dnd/characters/import` no longer requires
  a campaign: `campaignId` is optional — with one you must be a member (character lands there,
  `visibility:'campaign'`, roster-linked); without one the character is **personal** (`campaign_id:null`,
  `visibility:'private'`, owned by the caller, no membership check, no roster upsert). `characters/new/
  page.tsx` now passes an empty `campaignId` (personal) unless the caller is a member of a requested
  campaign — no more forced demo fallback — and `NewCharacterForm` omits an empty `campaignId` and shows a
  "personal character — no campaign required, add to a campaign later" note. Confirmed via
  `getCharacterAccess`: a campaign-less character resolves to `[]` campaigns, so the **owner gets
  `canWrite`/`canRead`** and can fully build the sheet at `app/dnd/characters/[id]`. Verified: `tsc` clean,
  lint clean, full dnd vitest suite green (27 files / 186 tests). *(The DM-only `POST /api/dnd/characters`
  stays campaign-scoped by design — it's the DM's in-campaign create/NPC tool; personal creation is the
  import path.)*
- **Slice 4 — Add a character to the demo campaign.** ✅ New `POST /api/dnd/campaigns/[id]/join-character`
  lets a signed-in user attach **their own** character to the campaign — restricted to the open demo
  (`params.id === DEMO_CAMPAIGN_ID`, else 403; owner-only, else 403). It upserts the caller's player
  membership in `dnd_campaign_members`, adds the roster link in `dnd_campaign_characters`, and promotes a
  personal character so it shows in the demo (sets `campaign_id` if null, bumps `private`→`campaign`
  visibility). UI: `AddToDemoButton` ("＋ Add to Neon Odyssey (demo)") shown on the character sheet
  (`characters/[id]`) for the owner when the character isn't already the demo's home. Verified: `tsc`
  clean, lint clean. *(Live roster reflection needs the app's Supabase env to drive end-to-end.)*
- **Slice 5 — DM-only NPC viewer.** ✅ The NPC viewer (`NpcLibrary`, loading the DM-gated
  `?campaignId=…&npc=1` list) is the campaign session console's **NPCs tab** — now made **DM-only**:
  `SessionConsole` filters the tab list to `t.id !== 'npcs' || isDM`, so players never see the tab, and the
  content only renders for a DM (`tab === 'npcs' && isDM`). Re-confirmed the three server-side gates that
  keep NPCs invisible to players (each pre-existing, re-verified by reading): (1) `GET /api/dnd/characters`
  narrows a non-DM caller to `owner_user_id = self`, and since NPCs are DM-owned a player's `npc=1` query
  returns `[]`; (2) `getCharacterAccess` blocks a non-owner/non-DM from opening a `private` NPC sheet (403);
  (3) `lib/dnd/campaign-summary.ts` excludes `is_npc` from the player-facing roster (`characterNames`
  filters `!ch.is_npc`) and only surfaces NPCs in a separate DM `npcs` list. Verified: `tsc` clean, lint
  clean, full dnd suite green (41 files / 236 tests). *(The live "player session gets none / 403 on an NPC
  sheet" round-trip needs the app's Supabase env; the gates are structural — an owner/DM check on every
  read path and the DM-only list narrowing — and the tab is now hidden from players entirely.)*
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

### Status: IN PROGRESS (Slices 0–5 shipped; 6 (QA) pending)
