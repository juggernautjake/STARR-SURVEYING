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
import './forest-dark';
import './sunset';
import './ocean';
import './plum';
import './high-contrast-light';
import './high-contrast-dark';

// All 11 built-in themes registered — 10 until 2026-08-04, when `forest-dark` was found declared in
// `BuiltinThemeId` and present in neither this registry nor themes.css. This comment said "10"
// beside a type that said eleven, and nothing compared the two. A test does now.
//
// Custom themes land at runtime
// via the picker (slice 106) — they're not registered here because
// each user's palette varies.
