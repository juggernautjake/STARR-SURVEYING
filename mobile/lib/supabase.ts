/**
 * Supabase client for Starr Field.
 *
 * Per STARR_FIELD_MOBILE_APP_PLAN.md §5.1, the mobile app authenticates
 * directly against Supabase Auth — NOT through NextAuth (which is
 * browser-only and lives in the web app). Both clients resolve to the
 * same `auth.users.id` UUID, so identity is unified.
 *
 * Session persistence uses AsyncStorage so the user stays signed in
 * across app restarts; auto-refresh is enabled because RN apps can be
 * suspended for hours.
 *
 * `detectSessionInUrl: false` because mobile receives auth callbacks
 * via deep link (the `starr-field://` scheme set in app.json), not
 * through `window.location` like the web client.
 *
 * The actual sign-in flow lands in Phase F0 deliverable #2 (this file
 * is the wiring; the screens consuming it come next).
 */
// Polyfill MUST load before @supabase/supabase-js (which uses URL/atob
// internally during createClient setup and on token refresh). Side-effect
// imports execute in declaration order, so this stays at line 1.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at boot rather than silently returning empty rows.
  // EXPO_PUBLIC_* values are baked into the JS bundle at build time;
  // missing values almost always mean a misconfigured EAS profile or
  // a forgotten .env.local in dev.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy mobile/.env.example to mobile/.env.local and fill in values, ' +
      'or set them in your EAS build profile.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
