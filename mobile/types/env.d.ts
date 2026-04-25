/**
 * Type declarations for EXPO_PUBLIC_* env vars consumed by the mobile
 * client. Anything prefixed `EXPO_PUBLIC_` is inlined into the JS
 * bundle at build time, so do NOT put secrets here — only the public
 * Supabase URL and anon key (which are designed to be embedded in
 * client bundles).
 *
 * Server-only secrets (Anthropic API key, service-role keys, etc.)
 * stay in the worker / Next.js server and are never imported from the
 * mobile client.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** Public Supabase project URL (e.g. https://xxxxx.supabase.co) */
    EXPO_PUBLIC_SUPABASE_URL?: string;

    /** Public Supabase anon key — JWT-shaped, safe to embed */
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  }
}
