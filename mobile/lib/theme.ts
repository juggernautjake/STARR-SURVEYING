/**
 * Theme palette for Starr Field. Two surfaces: light (rare — the app
 * is dark-mode-default per STARR_FIELD_MOBILE_APP_PLAN.md §7.1 rule 7
 * "battery-aware") and dark.
 *
 * The accent color matches the Starr brand blue used elsewhere
 * (seeds/099_fieldbook.sql sets #1D3095 for category color in the
 * default Fieldbook seed).
 */
export type Scheme = 'light' | 'dark';

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
};
