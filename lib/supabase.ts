import { createClient } from '@supabase/supabase-js';

// Use || fallbacks so createClient doesn't throw during Next.js build-time
// module evaluation when env vars are absent. At runtime the real env vars
// are always required — any Supabase call with placeholder credentials will
// fail loudly at the network level rather than crashing at module load.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
);
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key',
);
