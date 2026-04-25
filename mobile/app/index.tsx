import { Redirect } from 'expo-router';

import { LoadingSplash } from '@/lib/LoadingSplash';
import { useAuth } from '@/lib/auth';

/**
 * Root index route. Reads the session from AuthProvider and routes:
 *   - while loading initial session  →  splash spinner
 *   - signed in                      →  Jobs tab (default landing per §7.2)
 *   - signed out                     →  sign-in screen
 *
 * The (tabs) layout and (auth) layout each have their own session
 * guards too; this one handles the cold-start case where the user
 * opens the app directly at `/`.
 */
export default function Index() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingSplash />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href="/(tabs)/jobs" />;
}
