/**
 * Global Dynamic Type / font-scale clamp (S3c).
 *
 * iOS Dynamic Type and Android font scale let a user blow text up to ~3.1×.
 * Starr Field's screens are dense (timesheet grids, point-coordinate rows,
 * receipt tables) with fixed row heights, so unbounded scaling shatters those
 * layouts — text clips, buttons overflow, numbers wrap mid-value.
 *
 * The fix is NOT to disable scaling (that fails accessibility + App Store
 * review) — it's to CLAMP it. We set a global `maxFontSizeMultiplier` default
 * on every `<Text>` and `<TextInput>` so the app honors the user's larger-text
 * preference up to a sane cap, then stops. Individual overflow-critical spots
 * (e.g. a coordinate in a narrow grid cell) can still opt out entirely with
 * `allowFontScaling={false}` or their own tighter `maxFontSizeMultiplier`.
 *
 * Call `applyGlobalFontScaleClamp()` once, at module load, before the tree
 * renders (done from app/_layout.tsx).
 */
import { Text, TextInput } from 'react-native';

/** Upper bound on the OS font-scale multiplier. 1.4× keeps dense field
 *  layouts intact while still giving a meaningful bump for readability in
 *  the sun / for older eyes. Tune here if the crew wants larger. */
export const MAX_FONT_SCALE = 1.4;

type ScalableDefaults = { defaultProps?: { maxFontSizeMultiplier?: number } };

export function applyGlobalFontScaleClamp(cap: number = MAX_FONT_SCALE): void {
  for (const Component of [Text, TextInput] as unknown as ScalableDefaults[]) {
    Component.defaultProps = Component.defaultProps ?? {};
    // Only set a default — never clobber a per-call override a screen already
    // passed. A screen that wants a tighter cap (or none) still wins.
    if (Component.defaultProps.maxFontSizeMultiplier == null) {
      Component.defaultProps.maxFontSizeMultiplier = cap;
    }
  }
}
