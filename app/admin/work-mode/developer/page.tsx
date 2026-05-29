// Developer Work Mode mirror — internal tooling, redirects to admin
// for now.

import { redirect } from 'next/navigation';

export default function DeveloperWorkModePage() {
  redirect('/admin/work-mode/admin');
}
