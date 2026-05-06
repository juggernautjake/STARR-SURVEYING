// lib/cad/hotkeys/key-format.ts
//
// Phase 8 §2.2 — canonical key-string format used everywhere
// in the hotkey pipeline (registry default keys, user-config
// store, settings UI, engine matcher).
//
// Format rules:
//   * Lowercase. `KeyboardEvent.key` is lowercased before
//     matching so users can type "S" or "s" interchangeably.
//   * Modifiers come first in this order: `ctrl shift alt
//     meta` (matches the visual order on most keyboards).
//   * Modifiers + key joined with `+`. Example: `ctrl+shift+s`.
//   * Chords are space-separated single-key sequences.
//     Example: `z e` (zoom-extents) or `p l` (polyline).
//     Modifier-prefixed chord steps are allowed but rare:
//     `ctrl+shift+a c` would mean "Ctrl+Shift+A then C".
//
// Pure: no DOM globals, no React.

const MODIFIER_KEYS = new Set([
  'control',
  'ctrl',
  'shift',
  'alt',
  'option',
  'meta',
  'command',
  'super',
]);

const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  ',': 'comma',
  '.': 'period',
  ';': 'semicolon',
  "'": 'quote',
  '`': 'backtick',
  '/': 'slash',
  '\\': 'backslash',
  '[': 'leftbracket',
  ']': 'rightbracket',
  '=': 'equal',
  '-': 'minus',
  // Function-key normalization handled below.
};

export interface NormalizedKey {
  /** Canonical lookup string (e.g. `ctrl+shift+s`). */
  key:    string;
  /** Just the modifier portion (no trailing key). Useful for
   *  the chord engine when filtering modifier-only events. */
  mods:   ReadonlyArray<'ctrl' | 'shift' | 'alt' | 'meta'>;
  /** The non-modifier key, lowercased + aliased. Empty when
   *  the event was a pure modifier press. */
  base:   string;
  /** True when the event is just a modifier press
   *  (`KeyboardEvent.key === 'Shift'` etc.). The engine
   *  ignores these so a Shift hold doesn't accidentally
   *  match a binding. */
  isModifierOnly: boolean;
}

/** Normalize a DOM `KeyboardEvent` into the canonical lookup
 *  string. */
export function normalizeKeyboardEvent(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>
): NormalizedKey {
  const raw = (event.key ?? '').toLowerCase();
  const isModifierOnly = MODIFIER_KEYS.has(raw);
  const base = isModifierOnly ? '' : aliasKey(raw);
  const mods: Array<'ctrl' | 'shift' | 'alt' | 'meta'> = [];
  if (event.ctrlKey) mods.push('ctrl');
  if (event.shiftKey) mods.push('shift');
  if (event.altKey) mods.push('alt');
  if (event.metaKey) mods.push('meta');
  const parts = [...mods, base].filter(Boolean);
  return {
    key: parts.join('+'),
    mods,
    base,
    isModifierOnly,
  };
}

/** Normalize a user-typed binding string into the canonical
 *  format. Handles loose input like `Ctrl+Z` / `CTRL + Z` /
 *  `Z+ctrl` and reorders the modifiers. Whitespace-separated
 *  chord steps are normalized independently and rejoined
 *  with a single space.
 *
 *  Returns null when the input is empty or contains
 *  unrecognized tokens. */
export function normalizeBindingString(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  // Collapse whitespace around `+` first so `Ctrl + Z`
  // (modifier separator) doesn't get split as a chord by
  // the whitespace-based step splitter below.
  const collapsed = trimmed.replace(/\s*\+\s*/g, '+');
  // Chord — split on whitespace.
  const steps = collapsed.split(/\s+/);
  const normalized: string[] = [];
  for (const step of steps) {
    const ns = normalizeStep(step);
    if (!ns) return null;
    normalized.push(ns);
  }
  return normalized.join(' ');
}

function normalizeStep(step: string): string | null {
  const tokens = step
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const mods: Array<'ctrl' | 'shift' | 'alt' | 'meta'> = [];
  let base: string | null = null;
  for (const tok of tokens) {
    if (tok === 'control' || tok === 'ctrl') {
      if (!mods.includes('ctrl')) mods.push('ctrl');
    } else if (tok === 'shift') {
      if (!mods.includes('shift')) mods.push('shift');
    } else if (tok === 'alt' || tok === 'option') {
      if (!mods.includes('alt')) mods.push('alt');
    } else if (tok === 'meta' || tok === 'command' || tok === 'super') {
      if (!mods.includes('meta')) mods.push('meta');
    } else {
      // First non-modifier token wins; subsequent ones invalidate
      // the binding (a step can have at most one base key).
      if (base !== null) return null;
      base = aliasKey(tok);
    }
  }
  if (!base) return null;
  // Re-order modifiers into the canonical order.
  const orderedMods = ['ctrl', 'shift', 'alt', 'meta'].filter(
    (m): m is 'ctrl' | 'shift' | 'alt' | 'meta' =>
      mods.includes(m as 'ctrl' | 'shift' | 'alt' | 'meta')
  );
  return [...orderedMods, base].join('+');
}

function aliasKey(raw: string): string {
  if (Object.prototype.hasOwnProperty.call(KEY_ALIASES, raw)) {
    return KEY_ALIASES[raw];
  }
  // Function keys come through as `f1`..`f24` already.
  return raw;
}

/** Pretty-print a canonical key string for display in the
 *  settings UI. Capitalises modifiers + base key, swaps
 *  symbol aliases back to the symbol form, and inserts ` →
 *  ` between chord steps. */
export function formatKeyForDisplay(canonical: string): string {
  return canonical
    .split(' ')
    .map((step) =>
      step
        .split('+')
        .map((token) => {
          switch (token) {
            case 'ctrl':
              return 'Ctrl';
            case 'shift':
              return 'Shift';
            case 'alt':
              return 'Alt';
            case 'meta':
              return 'Meta';
            case 'space':
              return 'Space';
            case 'comma':
              return ',';
            case 'period':
              return '.';
            case 'semicolon':
              return ';';
            case 'quote':
              return "'";
            case 'backtick':
              return '`';
            case 'slash':
              return '/';
            case 'backslash':
              return '\\';
            case 'leftbracket':
              return '[';
            case 'rightbracket':
              return ']';
            case 'equal':
              return '=';
            case 'minus':
              return '−';
            default:
              return token.length === 1
                ? token.toUpperCase()
                : token.charAt(0).toUpperCase() + token.slice(1);
          }
        })
        .join(' + ')
    )
    .join(' → ');
}
