// app/dnd/login/page.tsx — intentionally disabled.
//
// The user asked that NOTHING route to this old email-based login for now: "there should be no way
// to get to it." Sign-in happens on the /dnd hub instead (HubSignIn — the name + password
// "SIGN IN / CLAIM NAME" form of the pseudo-login). Rather than delete the route (which would 404
// any old bookmark or stale ?next= redirect), it now redirects to the hub, so every path here lands
// on the real sign-in. The previous form is preserved in git history for when real auth returns.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DndLoginPage() {
  redirect('/dnd');
}
