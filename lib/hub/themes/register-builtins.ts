// lib/hub/themes/register-builtins.ts
//
// Side-effect import. Pulling this in registers all built-in themes
// into the registry as a side effect of evaluating the file (each
// theme file ends with `defineTheme(...)`).
//
// Consumers (ThemePicker, hub bootstrap) import this once so the
// registry is populated before they ask for `allThemes()`.

import './starr-default';
import './starr-dark';

// More themes land in:
//   Slice 83 — slate-light + slate-dark
//   Slice 84 — forest-light + sunset + ocean + plum
//   Slice 85 — high-contrast-light + high-contrast-dark
