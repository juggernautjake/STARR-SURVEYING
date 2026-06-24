'use client';
// app/ux-harness/HubHarnessMount.tsx
//
// Harness-only mount: renders the real Hub canvas (HubMeClient) with a
// seeded multi-widget layout so the mobile customization flow can be
// screenshotted in the ux-harness. The /admin/me route itself is a
// server component behind auth, so it can't be mounted directly here.

import HubMeClient from '@/app/admin/me/HubMeClient';
import type { HubLayoutRow, WidgetInstance } from '@/lib/hub/types';
import '@/app/admin/me/AdminMe.css';

const WIDGETS: WidgetInstance[] = [
  { id: 'h_today', type: 'today-schedule', x: 0, y: 0, w: 6, h: 2 },
  { id: 'h_jobs', type: 'my-jobs', x: 6, y: 0, w: 6, h: 2 },
  { id: 'h_qa', type: 'quick-actions', x: 0, y: 2, w: 6, h: 2 },
  { id: 'h_pay', type: 'my-pay', x: 6, y: 2, w: 4, h: 2 },
  { id: 'h_pin', type: 'pinned-pages', x: 0, y: 4, w: 6, h: 2 },
  { id: 'h_pto', type: 'pto-balance', x: 6, y: 4, w: 4, h: 2 },
];

const LAYOUT: HubLayoutRow = {
  userEmail: 'jacobmaddux@starr-surveying.com',
  layoutVersion: 1,
  widgets: WIDGETS,
  activePersona: null,
  theme: 'starr-default',
  customTheme: null,
  density: 'comfortable',
  fontScale: 1,
  hubSettings: {},
  updatedAt: '2026-06-24T00:00:00.000Z',
};

export default function HubHarnessMount() {
  return <HubMeClient layout={LAYOUT} roles={['admin', 'field_crew']} isSeeded={false} />;
}
