import { Redirect } from 'expo-router';

/**
 * Root index route. expo-router 4 requires the app to resolve a route
 * for `/`, and our default landing surface is the Jobs tab (per
 * STARR_FIELD_MOBILE_APP_PLAN.md §7.2 information architecture, where
 * Jobs is the leftmost tab). Phase F0 #2 (auth) will wrap this with
 * a session check that redirects unauthenticated users to a sign-in
 * route instead.
 */
export default function Index() {
  return <Redirect href="/jobs" />;
}
