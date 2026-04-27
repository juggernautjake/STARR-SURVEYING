/**
 * Responsive layout primitives for tablet support.
 *
 * Per the user's resilience-and-deployment requirement: "I am going
 * to need to build this app to work on tablets and all kinds of
 * phones." The mobile UI assumed phone-portrait widths from F0 — on
 * an iPad in landscape (≥1180 px) cards stretch awkwardly across the
 * whole screen. This module gives screens a single switch to opt
 * into a max-readable-width container without restructuring layouts.
 *
 * Two-tier breakpoint ladder, picked from Apple's HIG:
 *
 *   - phone   — width < 600 px   — typical handsets, portrait or
 *                                  landscape. Default; layouts fill
 *                                  the screen.
 *   - tablet  — width ≥ 600 px   — iPad portrait + everything wider.
 *                                  Screens should constrain content
 *                                  to ≤720 px and centre it; some
 *                                  surfaces (Jobs list, Capture grid)
 *                                  can opt for a 2-column layout
 *                                  via the helpers below.
 *
 * usage:
 *
 *   const { isTablet, columns } = useResponsiveLayout();
 *   return (
 *     <ScrollView contentContainerStyle={[
 *       styles.scroll,
 *       isTablet && { maxWidth: TABLET_MAX_WIDTH, alignSelf: 'center', width: '100%' }
 *     ]}>
 *       …
 *     </ScrollView>
 *   );
 */
import { useWindowDimensions } from 'react-native';

/** Width in dp at or above which we treat the device as a tablet. */
export const TABLET_BREAKPOINT_DP = 600;

/** Reading-comfort max content width on tablets — matches the
 *  ~720-px "long-form text" target Apple uses for the Books app. */
export const TABLET_MAX_WIDTH = 720;

/** Wider layouts (admin tabs, dashboards) that benefit from extra
 *  horizontal space without losing legibility. */
export const TABLET_WIDE_MAX_WIDTH = 1100;

export interface ResponsiveLayout {
  /** Width of the device in dp (independent of orientation). */
  width: number;
  /** True when the device width is >= TABLET_BREAKPOINT_DP. */
  isTablet: boolean;
  /** True when the device is in landscape (width > height). Useful
   *  for split-pane decisions (Jobs list + map next to each other). */
  isLandscape: boolean;
  /** Suggested column count for grid surfaces — 1 on phones, 2 on
   *  tablets in portrait, 3 on tablets in landscape. */
  columns: 1 | 2 | 3;
}

/**
 * Reactive hook — re-renders the consumer when the window resizes
 * (split-screen on iPad, rotation, etc.). Backed by
 * `useWindowDimensions` so it picks up split-view changes in real
 * time, unlike `Dimensions.get('window')` which is captured at
 * mount.
 */
export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT_DP;
  const isLandscape = width > height;
  let columns: 1 | 2 | 3 = 1;
  if (isTablet) {
    columns = isLandscape ? 3 : 2;
  }
  return { width, isTablet, isLandscape, columns };
}

/**
 * Container style mixin for ScrollView contentContainerStyle on
 * tablets. Centres the content + clamps to TABLET_MAX_WIDTH so
 * readers don't have to scan across the whole iPad screen.
 *
 * On phones this is `null`, which RN treats as a no-op.
 */
export function tabletContainerStyle(
  isTablet: boolean,
  maxWidth: number = TABLET_MAX_WIDTH
):
  | { maxWidth: number; alignSelf: 'center'; width: '100%' }
  | null {
  if (!isTablet) return null;
  return { maxWidth, alignSelf: 'center', width: '100%' };
}
