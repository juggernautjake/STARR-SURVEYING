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
import './slate-light';
import './slate-dark';
import './forest-light';
import './sunset';
import './ocean';
import './plum';
import './high-contrast-light';
import './high-contrast-dark';

// All 10 built-in themes registered. Custom themes land at runtime
// via the picker (slice 106) — they're not registered here because
// each user's palette varies.
