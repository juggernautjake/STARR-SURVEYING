# Messenger + Flag-an-Issue overhaul — 2026-06-17

> User: "look how poorly formatted and stylized the messaging and
> report an issue modals/pop ups are. They look terrible. Please
> make them look like proper interfaces for the user. Our chat
> feature should be as solid as facebook's or anything like that.
> It should have good styling, we should be able to see the chat
> history of the conversation, we should be able to change the
> conversation to another user, we should be able to see all of
> the conversations listed and select one to view and engage with,
> we need to be able to have group discussions through this
> feature too. The report a bug feature also is formatted/styled
> poorly. Please make it work better. Also, none of the pop ups
> should cover the little green card, and all of the should be
> draggable like the calculator modal is. Notice how robust and
> nice looking the full and complete dedicated messaging page is,
> we need a little pop up window that looks that good and allows
> for all of the same functionality. There also needs to be a
> button that takes us to the main messaging page."

## Inventory

- **FloatingMessenger.tsx** already has the data layer (list,
  chat, new, search views; conversations, messages, search results)
  but the popup is 380×500 with a single-pane stacked layout that
  the user finds cramped and ugly.
- **DiscussionThreadButton.tsx** ("Flag an Issue") panel renders
  the same way and shares the same visual flaws: cramped header,
  unstyled list, no breathing room.
- The dedicated **`/admin/messages`** page IS the user's gold
  standard — a two-pane layout (conversation list on the left,
  thread on the right) with proper spacing and typography.
- Both popups already portal to `<body>` with a defensive backdrop
  overlay (Slice fab-modal-fix).
- **FAB pill** sits at `bottom: 1.5rem; right: 1.5rem` — the
  current panels overlap it because they anchor at `bottom: 0,
  right: 0`.

## What's missing

1. **Positioning that respects the FAB pill** so clicking the FAB
   doesn't immediately get covered by the panel.
2. **Visual styling parity** with the `/admin/messages` page:
   real spacing, real typography, a proper header with the
   conversation name + member count, list rows that breathe.
3. **A two-pane layout** that surfaces the conversation list on
   the left while the active chat sits on the right (matching the
   gold-standard page).
4. **Conversation switching** without having to back-arrow into the
   list — the always-visible list IS the switcher.
5. **Group chat support** in the popup (the dedicated page
   already does this; the popup needs the same).
6. **"Open in /admin/messages" button** for users who want the
   full-page experience.
7. **Draggability** like `CalculatorModal` so the user can move
   the popup out of the way.
8. **Discussion thread modal styling parity** with the messenger
   redesign (shared modal shell once MX1 lands).

## Slice plan

Each slice ships small + commits independently. The MX numbering
keeps these distinct from the calendar S-series.

| Slice | What ships |
|---|---|
| **MX1** | Position the modal above the FAB pill (`bottom: 5.5rem` instead of `0`) + a styling pass on the panel header (real padding, real font hierarchy, a clear header that names the active conversation) + a "Open in /admin/messages →" link in the header that routes to the full page (deep-links the active conversation when one is open). Same restyle applied to the discussion-panel shell + header. ✅ shipped |
| **MX2** | Two-pane layout inside the messenger panel — sidebar list on the left (conversations) + active thread on the right, sized 560 × 600. Mirrors the dedicated page's hierarchy so the user can always see + switch conversations without back-arrowing into the list. |
| **MX3** | Draggable modal via a new `useDraggable` hook extracted from `CalculatorModal`. Applies to messenger + discussion panels; drag handle is the header bar. Position persists in localStorage so the user keeps their preferred spot. |
| **MX4** | Group chat support in the popup — the existing FloatingMessenger already has a `new` view with multi-select contacts; surface the same flow in MX2's two-pane layout and let the user create a group from the new-thread button. |
| **MX5** | "Search messages" surface parity with the dedicated page (cross-conversation search results that deep-link into the right thread). |

Each slice runs the three post-build checks per the standing
ask. MX1 is intentionally small + visible so the user sees the
pain point address first; the layout work in MX2 is the bigger
investment that lands second.

## Notes locked from the spec

- **No new schema.** Every slice is UI / styling. The existing
  conversations + messages + discussion_threads tables are
  enough.
- **The popup stays portal'd to `<body>`.** The Slice fab-modal-
  fix backdrop + defensive inline styles stay — MX1 just changes
  the panel's `bottom` and improves what's inside.
- **The dedicated `/admin/messages` page is the visual target.**
  Where tokens and class names already exist on that page (e.g.
  `.msg-page__conv-row`), MX2 reuses them rather than minting a
  parallel set of styles.
