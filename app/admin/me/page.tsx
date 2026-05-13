'use client';
// app/admin/me/page.tsx
//
// The Hub — admin-nav redesign Phase 2. Six panels stacked top-to-bottom
// per §5.1. Live now: greeting (session name + time of day), Recent
// column (nav-store), Workspaces column (route registry), and the
// Profile tab body (slice 2b). Placeholder until later slices: clock
// state, today data, notifications snapshot, quick-action set,
// remaining personal-tab bodies.
//
// Spec: docs/planning/in-progress/ADMIN_NAVIGATION_REDESIGN.md §5.1 + §8 Phase 2.

import ProfilePanel from '../profile/ProfilePanel';
import MyJobsPanel from '../my-jobs/MyJobsPanel';
import MyFilesPanel from '../my-files/MyFilesPanel';
import SchedulePanel from '../schedule/SchedulePanel';
import MyPayPanel from '../my-pay/MyPayPanel';

import HubGreeting from './components/HubGreeting';
import HubToday from './components/HubToday';
import HubPinnedRecent from './components/HubPinnedRecent';
import HubTabs from './components/HubTabs';
import HubNotifications from './components/HubNotifications';
import HubQuickActions from './components/HubQuickActions';

import './AdminMe.css';

export default function HubPage() {
  // The HubTabs `children` map only renders the active tab's element,
  // so unmounted panels never fetch their data. Each tab gets migrated
  // here as its panel component lands (slice 2b → profile; later slices
  // → schedule, jobs, hours, pay, notes, files, fieldbook).
  return (
    <div className="hub-page">
      <HubGreeting />
      <HubToday />
      <HubPinnedRecent />
      <HubTabs
        panels={{
          schedule: <SchedulePanel />,
          jobs: <MyJobsPanel />,
          pay: <MyPayPanel />,
          files: <MyFilesPanel />,
          profile: <ProfilePanel />,
        }}
      />
      <HubNotifications />
      <HubQuickActions />
    </div>
  );
}
