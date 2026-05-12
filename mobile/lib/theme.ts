/**
 * Theme palette for Starr Field. Three surfaces:
 *   - light: indoor / typical use
 *   - dark: dark-mode-default per plan §7.1 rule 7 ("battery-aware")
 *   - sun:  high-contrast for direct-sunlight readability per plan
 *           §7.1 rule 3 + §7.3 ("Sun glare makes screen unreadable").
 *           Pure-white background, pure-black text + borders, saturated
 *           accents. Surveyors in 100°F direct sun pick this; the
 *           muted-grey of the regular light palette disappears in
 *           glare.
 *
 * The accent color matches the Starr brand blue used elsewhere
 * (seeds/099_fieldbook.sql sets #1D3095 for category color in the
 * default Fieldbook seed).
 */
export type Scheme = 'light' | 'dark' | 'sun';

export interface Palette {
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  danger: string;
  success: string;
}

/**
 * Shared control-dimension tokens. Surfaces using bare `<TextInput>`
 * + bare `<Button>` in a single row used to drift (TextField was 56,
 * Button was 60) producing a visible 4 px shoulder. These constants
 * lock both primitives to a single height + corner-radius so adjacent
 * form rows always line up.
 */
export const controls = {
  /** Standard interactive control height (TextField + Button + chip
   *  rows). Tall enough to satisfy a 44 pt minimum touch target with
   *  comfortable hit area for gloved hands. */
  height: 56,
  /** Corner radius for controls. */
  radius: 10,
  /** Horizontal padding inside text-style inputs / single-line fields. */
  paddingHText: 16,
  /** Horizontal padding inside buttons / pressables. Wider so labels
   *  don't crowd the rounded corners. */
  paddingHButton: 24,
} as const;

export const colors: Record<Scheme, Palette> = {
  light: {
    background: '#FFFFFF',
    surface: '#F7F8FA',
    border: '#E2E5EB',
    text: '#0B0E14',
    muted: '#6B7280',
    accent: '#1D3095',
    danger: '#B42318',
    success: '#067647',
  },
  dark: {
    background: '#0B0E14',
    surface: '#11151D',
    border: '#1F2733',
    text: '#F4F5F7',
    muted: '#9BA3AF',
    accent: '#7B8DDB',
    danger: '#F97066',
    success: '#47CD89',
  },
  // Sun-readable. Same family as `light` but pushed to maximum
  // contrast on every surface so a phone in direct sun is still
  // legible. The greys are darker (no #6B7280 muted that washes
  // out at high brightness) and the accents are deepened to retain
  // saturation when the screen is competing with 100k lux.
  sun: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    border: '#000000',
    text: '#000000',
    muted: '#262626',
    accent: '#001A8C',
    danger: '#9F0014',
    success: '#004D1A',
  },
};
