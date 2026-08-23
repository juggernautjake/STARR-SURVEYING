// app/admin/design/compare/page.tsx — every version of one page, side by side.
//
// Phase V of docs/planning/completed/DESIGN_THEMES_2026-08-23.md.
//
// Owner: *"create multiple versions of each page and preview them all."*

import type { Metadata } from 'next';
import CompareBoard from './CompareBoard';

export const metadata: Metadata = { title: 'Compare designs' };

export default function ComparePage() {
  return <CompareBoard />;
}
