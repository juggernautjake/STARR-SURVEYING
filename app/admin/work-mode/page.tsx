// app/admin/work-mode/page.tsx
//
// Default Work Mode landing — bounces the user to the start picker.
//
// Slice 156 of customizable-hub-and-work-mode-2026-05-28.md.

import { redirect } from 'next/navigation';

export default function WorkModeIndex() {
  redirect('/admin/work-mode/start');
}
