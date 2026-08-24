// lib/hub/appearance-broadcast.ts — tell the shell that the appearance just changed.
//
// ── THE BROKEN LINK ─────────────────────────────────────────────────────────────────────────────
//
// Owner: *"make sure they are applied as soon as they are selected by the user to all pages."*
//
// `ShellTheme` puts `data-theme`, `data-density` and `--hub-font-scale` on `<html>`, reading them
// from `useHubStore`. The three pickers — theme, density, text size — save to
// `/api/admin/me/hub-layout` and update **their own local component state**. Neither touches the
// store.
//
// So the chain was broken at the source: choose a theme, watch it save, and nothing on the page
// changes. It would appear on the next full load of the Hub, which is the only page that hydrates
// the store — and never on any other page, because nothing there hydrates it at all.
//
// That is the third variant of one defect in a day. The theme was applied at the wrong LEVEL; the
// density tokens had no READER; and here the reader exists and nothing tells it. Each looks
// identical to the user: the setting does nothing.
//
// ── WHY AN EVENT RATHER THAN A STORE ACTION ─────────────────────────────────────────────────────
//
// `useHubStore` has one ingress — `hydrate` — which takes a whole layout and resets edit state,
// draft widgets and save status with it. Calling that from a settings page would reach across into
// the Hub editor's state to change a colour, and a picker that can clear somebody's unsaved widget
// draft is a worse bug than the one being fixed.
//
// A DOM event is the honest shape for "something changed, whoever cares should look": the pickers
// do not need to know the shell exists, and the shell does not need to know how many pickers there
// are. Both halves are testable.

/** The event name. Exported so the listener and the dispatchers cannot drift apart by a typo —
 *  a mismatch here fails silently and looks exactly like the bug this file fixes. */
export const APPEARANCE_CHANGED = 'starr:appearance-changed';

export interface AppearanceChange {
  theme?: string | null;
  density?: string | null;
  fontScale?: number | null;
  /**
   * The fourteen colours, when the theme is `custom`.
   *
   * A built-in theme is one attribute — `data-theme="ocean"` — and the stylesheet does the rest.
   * A custom theme (including a theme built in the Page Designer) has no stylesheet block, because
   * the palette is per user, so the values themselves have to travel. Without this the shell set
   * `data-theme="custom"` and no colours, which resolves to the default palette: the picker said
   * the theme was saved, the page did not change, and nothing was wrong except that the colours
   * never left the picker.
   */
  customPalette?: Record<string, string> | null;
}

/** Announce a saved appearance change. Safe to call from anywhere, including the server (no-op). */
export function broadcastAppearanceChange(change: AppearanceChange): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AppearanceChange>(APPEARANCE_CHANGED, { detail: change }));
}
