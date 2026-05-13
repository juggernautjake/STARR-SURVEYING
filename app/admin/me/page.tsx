'use client';
// app/admin/me/page.tsx
//
// The Hub — admin-nav redesign Phase 2 slice 2a. Six panels stacked
// top-to-bottom per §5.1. Live: greeting (session name + time of day),
// recents column (nav-store), workspaces column (route registry).
// Placeholder until slice 2b: clock state, today, notifications, quick
// actions, personal tab content.
//
// Spec: docs/planning/in-progress/ADMIN_NAVIGATION_REDESIGN.md §5.1 + §8 Phase 2.

import HubGreeting from './components/HubGreeting';
import HubToday from './components/HubToday';
import HubPinnedRecent from './components/HubPinnedRecent';
import HubTabs from './components/HubTabs';
import HubNotifications from './components/HubNotifications';
import HubQuickActions from './components/HubQuickActions';

import './AdminMe.css';

export default function HubPage() {
  return (
    <div className="hub-page">
      <HubGreeting />
      <HubToday />
      <HubPinnedRecent />
      <HubTabs />
      <HubNotifications />
      <HubQuickActions />
    </div>
  );
}
