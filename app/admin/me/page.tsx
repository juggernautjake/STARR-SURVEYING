// app/admin/me/page.tsx
//
// The Hub. Server component that fetches the saved layout (so first
// paint already has the user's widgets — no client-side loading
// flash), then renders:
//
//   - `HubGreeting` — time-of-day greeting + clock-in status + roles
//     (non-customizable per v2 §5.1; lives outside the widget canvas).
//   - `HubMeClient` — hydrates the hub store + mounts the providers +
//     the customizable widget canvas (Slices 185 / 186).
//
// ClockInPill stays in the AdminLayoutClient top bar; it's part of
// the chrome rather than the canvas.
//
// Slice 187 of customizable-hub-and-work-mode-2026-05-28.md. Replaces
// the legacy Phase-2 tab-and-panel hub (WhatsNewBanner / HubToday /
// HubPinnedRecent / HubTabs / HubNotifications / HubQuickActions) —
// those components are scheduled for archival in Slice 189.

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { UserRole } from '@/lib/auth';

import HubGreeting from './components/HubGreeting';
import HubMeClient from './HubMeClient';
import { fetchHubLayoutForUser } from '@/lib/hub/server/fetch-hub-layout';

import './AdminMe.css';

export default async function HubPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const roles: UserRole[] = (session.user.roles ??
    (session.user.role ? [session.user.role] : [])) as UserRole[];

  const { layout } = await fetchHubLayoutForUser(session.user.email, roles);

  return (
    <div className="hub-page">
      <HubGreeting />
      <HubMeClient layout={layout} roles={roles} />
    </div>
  );
}
