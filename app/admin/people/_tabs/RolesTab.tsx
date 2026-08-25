// app/admin/people/_tabs/RolesTab.tsx
//
// Slice W7 — admin role builder. Was `app/admin/roles/custom/page.tsx`.
//
// ── C9 TURNED THIS INTO A CLIENT COMPONENT, AND THAT IS NOT COSMETIC ────────────────────────────
//
// It was an async SERVER page: `await auth()`, a redirect, a direct `supabaseAdmin` read. The People
// portal is a client component — a tab strip that switches on state — so importing a server page
// into it put `@/lib/auth` into the client bundle, and `node:async_hooks` with it. The build fails,
// which is the good outcome; what makes it worth a note is that NOTHING IN THE SUITE SAW IT. 26,194
// tests were green and `tsc` was clean. It took loading the page in a browser.
//
// So the read moved to the endpoint that already existed for it. `GET /api/admin/roles/custom`
// answers 401 without a session and 403 without `isAdmin` — the same two refusals the page made,
// made by the server rather than by a redirect. The portal ALSO gates this tab to `['admin']`, and
// middleware still gates `/admin/roles`. The redirect was the third of three and the weakest of
// them, because a redirect is a suggestion to a browser and a 403 is an answer.
//
// A non-admin who reaches this component anyway now reads a refusal instead of being bounced to
// `/admin/me` mid-tab-switch — the better behaviour inside a tab strip, where a redirect would throw
// away whatever else they had open on the portal.

'use client';

import { useEffect, useState } from 'react';
import CustomRoleBuilderClient from './CustomRoleBuilderClient';

interface CustomRoleRow {
  id: string;
  key: string;
  label: string;
  description: string | null;
  permissions: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export default function RolesTab() {
  const [roles, setRoles] = useState<CustomRoleRow[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/admin/roles/custom')
      .then(async (r) => {
        if (!live) return;
        // 401 and 403 are the page's two redirects, answered by the server instead.
        if (r.status === 401 || r.status === 403) { setDenied(true); setRoles([]); return; }
        const data = await r.json().catch(() => ({}));
        setRoles(Array.isArray(data.roles) ? data.roles : []);
      })
      .catch(() => { if (live) setRoles([]); });
    return () => { live = false; };
  }, []);

  if (denied) {
    return (
      <div className="admin-content" data-testid="admin-role-builder-denied">
        <p className="ppl-portal__none">
          Only an admin can define roles. Ask one of yours, or request the admin role on the
          Requests tab.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-content" data-testid="admin-role-builder-page">
      <header className="ppl-roles__head">
        <h1>Role builder</h1>
        <p>
          Define new roles on top of the built-in role list. Holders carry the role key in their{' '}
          <code>registered_users.roles[]</code> array.
        </p>
      </header>

      {roles === null
        ? <p className="ppl-portal__hint">Loading roles…</p>
        : <CustomRoleBuilderClient initialRoles={roles} />}
    </div>
  );
}
