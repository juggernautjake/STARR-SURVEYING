# Embed the Lazzuh Gun D&D character sheet at a hidden `/dnd/Lazzuh_Gun` route

> **Status:** ✅ COMPLETE — 2026-07-06. Branch `claude/sit-prep-buildout-2026-07-02`.
> Sheet is live at the hidden route `/dnd/Lazzuh_Gun`, verified rendering full-screen in-iframe
> with zero console errors. Moved to `completed/`.

## Goal (user request)
Put the D&D 2024 digital character sheet we built (the standalone Vite/React app at
`C:\dev\neon-odyssey-sheet`) **onto the Starr Surveying website**, reachable only at the exact
URL **`starr-surveying.com/dnd/Lazzuh_Gun`**. It must be **hidden**: not linked from any nav,
not indexed, and not discoverable — you only get there by typing the URL.

## Approach — static bundle + hidden iframe route (chosen)
The sheet is a **self-contained client-only SPA** with ~1,000 lines of global CSS (bare `body`,
`h1`, `input`, `table` selectors), Web Audio, localStorage, and external Google Fonts. Importing
that CSS into the Next app would leak styles across the whole site (Next route CSS is global).

So we **isolate it in an iframe**: build the SPA to a static bundle under `public/dnd-sheet/`
and mount it full-viewport in a hidden Next route. The iframe is a separate document → zero CSS/JS
collisions with the STARR app; the SPA runs byte-for-byte as built. localStorage persists on the
`starr-surveying.com` origin.

**Tradeoff:** the bundle is a build artifact committed under `public/`. Updating the sheet means
rebuild + recopy (captured as a script in slice E). Documented, acceptable for a hidden personal page.

## Feasibility notes (verified)
- **Routing/auth:** `middleware.ts` matcher is `['/admin/:path*']` only → `/dnd/**` and
  `/dnd-sheet/**` are fully public, no login. ✅
- **Hidden:** route not linked anywhere; add `robots: { index: false, follow: false }`; not added
  to `app/sitemap.ts`. Direct-URL only. ✅
- **Asset paths:** Vite must build with `base: '/dnd-sheet/'` so hashed assets resolve under
  `/dnd-sheet/…` when served from `public/`. Dev keeps `base: '/'`. ✅ plan

## Slices
| # | What | Status |
|---|---|---|
| **A** | Plan doc (this file) | **DONE** |
| **B** | Configure the sheet's Vite `base` = `/dnd-sheet/` for production builds (dev stays `/`) | **DONE** — functional config `({command}) => base: command==='build' ? '/dnd-sheet/' : '/'`. |
| **C** | Build the sheet and copy `dist/` → STARR `public/dnd-sheet/` | **DONE** — built (assets reference `/dnd-sheet/…`), synced into `public/dnd-sheet/` (index.html + assets). |
| **D** | Hidden Next route `app/dnd/Lazzuh_Gun/page.tsx` — full-viewport iframe of `/dnd-sheet/index.html`, `noindex` metadata | **DONE** — server component, `robots:{index:false,follow:false}`, fixed full-viewport iframe (z-index over the site chrome). |
| **E** | Repeatable sync script | **DONE** — `scripts/build-dnd-sheet.mjs` (builds the sheet from `../neon-odyssey-sheet` or `$DND_SHEET_DIR` and re-syncs `public/dnd-sheet/`). |
| **F** | Verify | **DONE** — lint clean; `GET /dnd/Lazzuh_Gun` renders the iframe; `GET /dnd-sheet/index.html` → 200 with `/dnd-sheet/` assets; browser-loaded the full sheet in-iframe, 0 console errors. Not linked in nav; not in `app/sitemap.ts`; `middleware.ts` gates only `/admin/*` so the route is public-by-URL. |

## Gotchas / watch-list
- **Vite base only in `build`** — use a functional config (`({command}) => …`) so `npm run dev`
  still serves at `/`.
- **`public/dnd-sheet/` is a build output** — it's committed so the site can serve it; regenerate
  via slice E, don't hand-edit.
- **Fonts** load from Google (external) — fine on a normal page; the iframe inherits network access.
- **Do NOT import the sheet's `theme.css` into any Next component** — that's the whole reason for the
  iframe. Keep it isolated.
- **localStorage** is per-origin: the sheet's saved character persists under `starr-surveying.com`.
